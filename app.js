// The 10 image targets. These names are the section ids of the department's
// AR page (the part after # in its links), so one name is used everywhere:
//   image-targets/<name>.json  (and the "name" inside it)
//   <xrextras-named-image-target name="<name>"> in index.html
//   the "More info" link:  infoPageUrl + '#' + <name>
const imageTargetNames = [
  'materialanalysis',
  'materialsimulations',
  'plasmadiagnostics',
  'functionalmaterials',
  'opticalcoatings',
  'protectivecoatings',
  'quantummaterials',
  'sustainablematerials',
  'synthesis',
  'vacuumtechnology',
]

// The page the "More info" button opens, at the active target's section.
const infoPageUrl = 'https://www.kfy.zcu.cz/cs/Ar/'

const onxrloaded = async () => {
  // Load the metadata JSON for every target. The engine reads each file's
  // `imagePath` and fetches the luminance image itself, so we only need to
  // hand it the parsed JSON objects (no bundler / require needed).
  const imageTargetData = await Promise.all(
    imageTargetNames.map(name =>
      fetch(`image-targets/${name}.json`).then((res) => {
        if (!res.ok) throw new Error(`Failed to load image-targets/${name}.json (${res.status})`)
        return res.json()
      })
    )
  )

  XR8.XrController.configure({imageTargetData})
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

// 0. Localization. English, Czech and German only, picked from the device's
//    preferred languages. Anything else falls back to English. There is no
//    language switcher by design — detection only.
const translations = {
  en: {
    scan: 'Scan the panels on the wall',
    moreInfo: 'More info',
    moreInfoAria: 'More info (opens in a new tab)',
  },
  cs: {
    scan: 'Naskenuj panely na zdi',
    moreInfo: 'Více informací',
    moreInfoAria: 'Více informací (otevře se v novém okně)',
  },
  de: {
    scan: 'Scanne die Tafeln an der Wand',
    moreInfo: 'Mehr Infos',
    moreInfoAria: 'Mehr Infos (wird in einem neuen Tab geöffnet)',
  },
}

// The first device-preferred language we actually support, else English.
// navigator.languages is ordered by preference, so e.g. ['sk-SK', 'cs-CZ', 'en']
// correctly yields Czech: Slovak is unsupported, Czech is the next best match.
const detectLanguage = () => {
  const preferred = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || 'en']

  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split('-')[0] // 'cs-CZ' -> 'cs'
    if (translations[base]) return base
  }
  return 'en'
}

const lang = detectLanguage()
const t = translations[lang]

const applyTranslations = () => {
  document.documentElement.lang = lang

  const scanEl = document.querySelector('.scan-text')
  if (scanEl) scanEl.textContent = t.scan

  const btn = document.getElementById('info-button')
  if (btn) {
    const label = btn.querySelector('span')
    if (label) label.textContent = t.moreInfo
    btn.setAttribute('aria-label', t.moreInfoAria)
  }
}

// app.js runs from <head>, so the body may not exist yet.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyTranslations)
} else {
  applyTranslations()
}

// 1. Custom loading screen: fades out once 8th Wall is ready.
AFRAME.registerComponent('custom-loading', {
  init: function () {
    const sceneEl = this.el
    const loaderEl = document.getElementById('custom-loader')

    sceneEl.addEventListener('realityready', () => {
      loaderEl.style.opacity = '0'
      setTimeout(() => {
        loaderEl.style.display = 'none'
        // Stop the Lottie animation for good. Hiding it is not enough: it
        // would keep computing frames on the main thread during the AR session.
        if (window.animation) window.animation.destroy()
        // Tell target-tracker the scanner overlay may now be shown.
        sceneEl.emit('loaderhidden')
      }, 500)
    })
  },
})

// How long the active target may be "lost" before we give up on it. Tracking
// drops out for a few frames now and then (more so with two panels in view);
// within this time the video simply stays where it was instead of blinking.
const LOST_GRACE_MS = 500

// How much closer to the screen centre another panel must be before it takes
// over from the active one (0 = centre of the screen, 1 = its edge). This
// stops two visible panels from fighting over which one is active.
const SWITCH_MARGIN = 0.3

// 2. Track found/lost images. Enforces a SINGLE active target: only its video
//    is shown AND playing, and it drives the scanner overlay and the "More
//    info" button. The active target is the tracked panel nearest the centre
//    of the screen, and it is deliberately "sticky" (see the constants above).
AFRAME.registerComponent('target-tracker', {
  init: function () {
    this.tracked = {}      // name -> null while tracked, or the time it was lost
    this.now = 0           // scene time of the latest frame (ms)
    this.centre = new THREE.Vector3()
    this.active = null     // the one target whose video is shown and playing
    this.ready = false     // true once the loading screen is gone
    this.contentEls = {}   // name -> the target's <a-plane> child (cached)

    this.overlayEl = document.getElementById('target-overlay')
    this.infoBtn = document.getElementById('info-button')

    this.el.addEventListener('xrimagefound', (e) => this.onFound(e.detail.name))
    this.el.addEventListener('xrimagelost', (e) => this.onLost(e.detail.name))
    this.el.addEventListener('loaderhidden', () => {
      this.ready = true
      this.updateOverlay()
    })

    // Don't decode video while the page is in the background (e.g. after
    // "More info" opened a new tab); pick it up again on return.
    document.addEventListener('visibilitychange', () => {
      const video = this.videoOf(this.active)
      if (!video) return
      if (document.hidden) video.pauseVideo()
      else video.playVideo()
    })
  },

  // The <a-plane> content for a target, cached. xrextras toggles visibility
  // on the PARENT (named-image-target); we toggle the CHILD, so we can hide
  // the video of a target that is tracked but is not the active one.
  contentEl: function (name) {
    if (!this.contentEls[name]) {
      this.contentEls[name] =
        document.querySelector(`xrextras-named-image-target[name="${name}"] > a-plane`)
    }
    return this.contentEls[name]
  },

  // The alpha-video component of a target's plane (null if none / not ready).
  videoOf: function (name) {
    const el = name && this.contentEl(name)
    return (el && el.components && el.components['alpha-video']) || null
  },

  // The <xrextras-named-image-target> of a target; xrextras moves and
  // shows/hides this element as the engine tracks the panel.
  targetObject: function (name) {
    const el = this.contentEl(name)
    return (el && el.parentNode && el.parentNode.object3D) || null
  },

  onFound: function (name) {
    this.tracked[name] = null
    this.evaluate()
    // A panel that is tracked but did not become active stays hidden.
    if (name !== this.active) this.showContent(name, false)
  },

  onLost: function (name) {
    if (name in this.tracked) this.tracked[name] = this.now
    this.evaluate()
  },

  tick: function (time) {
    this.now = time
    if (this.active) this.evaluate()
  },

  // How far a target's centre is from the centre of the screen
  // (0 = dead centre, 1 = at the edge, more = outside the view).
  offCentre: function (name) {
    const object = this.targetObject(name)
    const camera = this.el.camera
    if (!object || !camera) return 10
    this.centre.copy(object.position).project(camera)
    return Math.hypot(this.centre.x, this.centre.y)
  },

  // Decide which single target is active.
  evaluate: function () {
    let best = null
    let bestScore = Infinity

    for (const name in this.tracked) {
      const lostAt = this.tracked[name]
      if (lostAt !== null) {
        // A lost target is dropped at once, except the active one, which is
        // kept for the grace period in case tracking comes straight back.
        if (name !== this.active || this.now - lostAt > LOST_GRACE_MS) {
          delete this.tracked[name]
          continue
        }
      }
      // The active target gets a head start, so another panel only takes
      // over when it is clearly closer to the centre of the screen.
      let score = this.offCentre(name)
      if (name === this.active) score -= SWITCH_MARGIN
      if (score < bestScore) {
        best = name
        bestScore = score
      }
    }

    this.setActive(best)

    // xrextras hides a target the moment it is lost. While the active one is
    // inside its grace period, keep it on screen at its last position.
    if (best && this.tracked[best] !== null) {
      const object = this.targetObject(best)
      if (object) object.visible = true
    }
  },

  setActive: function (name) {
    if (name === this.active) return // nothing changed, nothing to touch

    const previous = this.active
    this.active = name

    // Hide and PAUSE the previous target's video, show and PLAY the new one.
    // Only one video is ever decoding, which is what keeps Android smooth.
    this.showContent(previous, false)
    this.showContent(name, true)

    this.updateOverlay()

    if (name) {
      this.infoBtn.href = `${infoPageUrl}#${name}`
      this.infoBtn.style.display = 'flex'
    } else {
      this.infoBtn.style.display = 'none'
      this.infoBtn.removeAttribute('href')
    }
  },

  showContent: function (name, show) {
    if (!name) return
    const el = this.contentEl(name)
    if (el && el.object3D) el.object3D.visible = show
    const video = this.videoOf(name)
    if (video) {
      if (show) video.playVideo()
      else video.pauseVideo()
    }
  },

  // The scanner is shown (and its bar animated) only when the app is ready
  // and nothing is tracked. The CSS pauses the animation while it is hidden.
  updateOverlay: function () {
    this.overlayEl.classList.toggle('scanning', this.ready && !this.active)
  },
})

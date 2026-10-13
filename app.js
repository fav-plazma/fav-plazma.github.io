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

// 2. Track found/lost images. Enforces a SINGLE active target (the most
//    recently found one that is still tracked): only its video is shown AND
//    playing, and it drives the scanner overlay and the "More info" button.
AFRAME.registerComponent('target-tracker', {
  init: function () {
    this.tracked = []      // currently tracked target names, oldest -> newest
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

  onFound: function (name) {
    // Move to the end so it becomes the single active target.
    this.tracked = this.tracked.filter((n) => n !== name)
    this.tracked.push(name)
    this.setActive(this.tracked[this.tracked.length - 1])
  },

  onLost: function (name) {
    this.tracked = this.tracked.filter((n) => n !== name)
    this.setActive(this.tracked.length ? this.tracked[this.tracked.length - 1] : null)
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

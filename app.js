// All 10 image targets. Each name must match a file in image-targets/<name>.json
// AND the `name` on the matching <xrextras-named-image-target> in index.html.
const imageTargetNames = [
  'analysis',
  'atomic',
  'modeling',
  'nanomat',
  'optical',
  'protective',
  'quantum',
  'sustainable',
  'synthesis',
  'vacuum',
]

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

// 1. Hide default loader and manage Lottie
  AFRAME.registerComponent('custom-loading', {
    init: function () {
      const sceneEl = this.el;
      const loaderEl = document.getElementById('custom-loader');
      
      // Listen for 8th Wall's realityready event
      sceneEl.addEventListener('realityready', () => {
        // Fade out custom loader
        loaderEl.style.opacity = '0';
        setTimeout(() => {
          loaderEl.style.display = 'none';
          // Show the scanning overlay once the world is ready
          document.getElementById('target-overlay').style.opacity = '1';
        }, 500); 
      });
    }
  });

  // Where the "More info" button links for each target. EDIT these URLs.
  const targetLinks = {
    analysis: 'https://example.com/analysis',
    atomic: 'https://example.com/atomic',
    modeling: 'https://example.com/modeling',
    nanomat: 'https://example.com/nanomat',
    optical: 'https://example.com/optical',
    protective: 'https://example.com/protective',
    quantum: 'https://example.com/quantum',
    sustainable: 'https://example.com/sustainable',
    synthesis: 'https://example.com/synthesis',
    vacuum: 'https://example.com/vacuum',
  };

  // 2. Track found/lost images. Enforces a SINGLE active target (the most
  //    recently found one that is still tracked): only its video is shown,
  //    and it drives the scanner overlay and the "More info" link button.
  AFRAME.registerComponent('target-tracker', {
    init: function () {
      this.tracked = [];    // currently tracked target names, oldest -> newest
      this.contentEls = {}; // name -> the target's <a-plane> child (cached)

      this.overlayEl = document.getElementById('target-overlay');
      this.infoBtn = document.getElementById('info-button');

      this.el.addEventListener('xrimagefound', (e) => this.onFound(e.detail.name));
      this.el.addEventListener('xrimagelost', (e) => this.onLost(e.detail.name));
    },

    activeTarget: function () {
      return this.tracked.length ? this.tracked[this.tracked.length - 1] : null;
    },

    // The <a-plane> content for a target, cached. xrextras toggles visibility
    // on the PARENT (named-image-target); we toggle the CHILD, so we can hide
    // the video of a target that is tracked but is not the active one.
    contentEl: function (name) {
      if (!this.contentEls[name]) {
        this.contentEls[name] =
          document.querySelector(`xrextras-named-image-target[name="${name}"] > a-plane`);
      }
      return this.contentEls[name];
    },

    onFound: function (name) {
      // Move to the end so it becomes the single active target.
      this.tracked = this.tracked.filter((n) => n !== name);
      this.tracked.push(name);
      this.updateUI();
    },

    onLost: function (name) {
      this.tracked = this.tracked.filter((n) => n !== name);
      this.updateUI();
    },

    updateUI: function () {
      const active = this.activeTarget();

      // Show ONLY the active target's video; hide every other one.
      imageTargetNames.forEach((name) => {
        const el = this.contentEl(name);
        if (el && el.object3D) el.object3D.visible = (name === active);
      });

      // Scanner overlay is hidden whenever something is being tracked.
      this.overlayEl.style.opacity = active ? '0' : '1';

      // Point the button at this target's page. If a target has no URL the
      // button stays hidden rather than linking nowhere.
      const url = active ? targetLinks[active] : null;
      if (url) {
        this.infoBtn.href = url;
        this.infoBtn.style.display = 'flex';
      } else {
        this.infoBtn.style.display = 'none';
        this.infoBtn.removeAttribute('href');
      }
    },
  });
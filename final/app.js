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

  // One sentence per target, shown in the info panel. EDIT these texts.
  const targetSentences = {
    analysis: 'Analýza materiálů odhaluje jejich složení až na úrovni jednotlivých prvků.',
    atomic: 'Atomová fyzika zkoumá stavbu atomů a chování elektronů v jejich obalu.',
    modeling: 'Počítačové modelování předpovídá chování materiálů dříve, než vzniknou v laboratoři.',
    nanomat: 'Nanomateriály mají rozměry tisíckrát menší než lidský vlas a zcela nové vlastnosti.',
    optical: 'Optika studuje světlo a jeho interakci s hmotou od laserů po čočky.',
    protective: 'Ochranné vrstvy chrání povrchy před opotřebením, korozí i extrémními teplotami.',
    quantum: 'Kvantová fyzika popisuje svět nejmenších částic, kde platí jiná pravidla.',
    sustainable: 'Udržitelné technologie hledají cesty k čistší a úspornější energii.',
    synthesis: 'Syntéza vytváří zcela nové sloučeniny a materiály na míru.',
    vacuum: 'Vakuové technologie umožňují experimenty v prostředí téměř bez částic.',
  };

  // 2. Track found/lost images. Enforces a SINGLE active target (the most
  //    recently found one that is still tracked): only its video is shown,
  //    and it drives the scanner overlay, info button and panel.
  AFRAME.registerComponent('target-tracker', {
    init: function () {
      this.tracked = [];    // currently tracked target names, oldest -> newest
      this.contentEls = {}; // name -> the target's <a-plane> child (cached)

      this.overlayEl = document.getElementById('target-overlay');
      this.infoBtn = document.getElementById('info-button');
      this.infoPanel = document.getElementById('info-panel');
      this.infoText = document.getElementById('info-text');

      // Tapping the button toggles the panel. stopPropagation so the
      // document handler below doesn't immediately re-close it.
      this.infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePanel();
      });
      document.getElementById('info-close').addEventListener('click', () => this.closePanel());

      // Tapping anywhere outside the panel (and not the button) closes it.
      document.addEventListener('click', (e) => {
        if (!this.infoPanel.classList.contains('visible')) return;
        if (this.infoPanel.contains(e.target) || this.infoBtn.contains(e.target)) return;
        this.closePanel();
      });

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
      const wasActive = this.activeTarget() === name;
      this.tracked = this.tracked.filter((n) => n !== name);
      // If the panel was open for the target we just lost, close it.
      if (wasActive) this.closePanel();
      this.updateUI();
    },

    updateUI: function () {
      const active = this.activeTarget();

      // Show ONLY the active target's video; hide every other one.
      imageTargetNames.forEach((name) => {
        const el = this.contentEl(name);
        if (el && el.object3D) el.object3D.visible = (name === active);
      });

      if (active) {
        this.overlayEl.style.opacity = '0';  // hide scanner
        this.infoBtn.style.display = 'flex'; // show button
        // Keep the panel text in sync if the active target changed.
        this.infoText.textContent = targetSentences[active] || '';
      } else {
        this.overlayEl.style.opacity = '1';  // show scanner
        this.infoBtn.style.display = 'none'; // hide button
      }
    },

    togglePanel: function () {
      if (this.infoPanel.classList.contains('visible')) {
        this.closePanel();
      } else {
        this.openPanel();
      }
    },

    openPanel: function () {
      const active = this.activeTarget();
      if (!active) return;
      this.infoText.textContent = targetSentences[active] || '';
      this.infoPanel.classList.add('visible');
    },

    closePanel: function () {
      this.infoPanel.classList.remove('visible');
    },
  });
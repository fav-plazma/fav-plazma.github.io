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

  // 2. Track when images are found/lost to toggle the scanner
  AFRAME.registerComponent('target-tracker', {
    init: function () {
      this.activeTargets = 0;
      const overlayEl = document.getElementById('target-overlay');

      // Fired when ANY xrextras-named-image-target is found
      this.el.addEventListener('xrimagefound', () => {
        this.activeTargets++;
        overlayEl.style.opacity = '0'; // Hide scanner
      });

      // Fired when ANY xrextras-named-image-target is lost
      this.el.addEventListener('xrimagelost', () => {
        this.activeTargets--;
        if (this.activeTargets <= 0) {
          this.activeTargets = 0;
          overlayEl.style.opacity = '1'; // Show scanner
        }
      });
    }
  });
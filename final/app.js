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

  // 3. Frosted-glass panel: a translucent diffused plane to sit BEHIND a video.
  //    This does not truly blur the live camera (8th Wall draws the camera feed
  //    outside the three.js scene, so it can't be sampled here) — it's a faked
  //    frost: a soft tinted card with rounded corners and a faint speckle.
  AFRAME.registerComponent('frosted-glass', {
    schema: {
      color: {type: 'color', default: '#e2e9f0'}, // cool white tint
      opacity: {type: 'number', default: 0.35},   // 0 = invisible, 1 = solid
      radius: {type: 'number', default: 0.18},    // corner rounding (0 = square)
      frost: {type: 'number', default: 0.06},     // speckle strength
    },
    init: function () {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh) return;

      // Keep the panel square-cornered regardless of plane aspect ratio.
      const {width = 1, height = 1} = mesh.geometry.parameters || {};
      const min = Math.min(width, height);
      const aspect = new THREE.Vector2(width / min, height / min);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: {value: new THREE.Color(this.data.color)},
          uOpacity: {value: this.data.opacity},
          uRadius: {value: this.data.radius},
          uFrost: {value: this.data.frost},
          uAspect: {value: aspect},
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uRadius;
          uniform float uFrost;
          uniform vec2 uAspect;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          // Signed distance to a rounded box centered at the origin.
          float roundedBox(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b + r;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
          }

          void main() {
            vec2 p = (vUv - 0.5) * 2.0 * uAspect;
            float d = roundedBox(p, uAspect, uRadius);
            float mask = 1.0 - smoothstep(0.0, 0.012, d);
            if (mask <= 0.0) discard;

            float n = hash(floor(vUv * 256.0));
            vec3 col = uColor + (n - 0.5) * uFrost;
            gl_FragColor = vec4(col, uOpacity * mask);
          }
        `,
        transparent: true,
        depthWrite: false, // don't occlude the video drawn on top
        side: THREE.DoubleSide,
      });

      mesh.material = material;
      mesh.renderOrder = -1; // draw before the video plane
    },
  });
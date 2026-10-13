AFRAME.registerComponent('alpha-video', {
  schema: {
    video: {type: 'selector'}
  },
  init: function () {
    const videoEl = this.data.video;
    if (!videoEl) return;

    this.videoEl = videoEl;
    this.wanted = false; // true while this video is supposed to be playing

    const texture = new THREE.VideoTexture(videoEl);
    texture.format = THREE.RGBAFormat;

    // The shader splits the texture in half
    // Left half = Color, Right half = Opacity
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          // Sample color from left half (0.0 to 0.5)
          vec4 color = texture2D(map, vec2(vUv.x * 0.5, vUv.y));
          // Sample alpha from right half (0.5 to 1.0)
          vec4 alpha = texture2D(map, vec2(0.5 + vUv.x * 0.5, vUv.y));

          gl_FragColor = vec4(color.rgb, alpha.r);
        }
      `,
      transparent: true,
      depthWrite: false
    });

    this.el.getObject3D('mesh').material = material;

    // The video is NOT started here. Ten videos decoding and uploading
    // textures at once is what made Android lag, so target-tracker calls
    // playVideo() for the one active target and pauseVideo() for the rest.
    // (Not named play/pause: those are A-Frame lifecycle hooks, and A-Frame
    // would call play() on every plane at startup.)
  },

  playVideo: function () {
    if (!this.videoEl) return;
    this.wanted = true;
    const promise = this.videoEl.play();
    if (promise) {
      promise.catch(() => {
        // Autoplay refused (e.g. iOS Low Power Mode): start on the next tap,
        // if this video is still the one that should be playing.
        document.addEventListener('touchend', () => {
          if (this.wanted) this.videoEl.play().catch(() => {});
        }, {once: true});
      });
    }
  },

  pauseVideo: function () {
    if (!this.videoEl) return;
    this.wanted = false;
    this.videoEl.pause();
  }
});

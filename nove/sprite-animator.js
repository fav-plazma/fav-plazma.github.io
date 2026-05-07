AFRAME.registerComponent('alpha-video', {
  schema: {
    video: {type: 'selector'}
  },
  init: function () {
    const videoEl = this.data.video;
    if (!videoEl) return;

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
      side: THREE.DoubleSide
    });

    this.el.getObject3D('mesh').material = material;
    
    // Auto-play handling
    videoEl.play().catch((e) => console.log("User interaction needed for video"));
  }
});
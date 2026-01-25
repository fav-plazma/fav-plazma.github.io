AFRAME.registerComponent('sprite-animator', {
  schema: { 
    cols: {type:'int'}, 
    rows: {type:'int'}, 
    totalFrames: {type:'int'}, 
    fps: {type:'int'}, 
    loop: {type:'boolean', default:true},
    folderPath: {type:'string', default:''} // folder path for individual frames
  },
  init() {
    this.texture = null;
    this.frame = 0;
    this.frameDelay = 1000 / this.data.fps;
    this.accumulator = 0;
    this.isInitialized = false;
    this.frameCache = {}; // LRU cache for frames
    this.frameAccessOrder = []; // Track frame access order for LRU
    this.maxCacheSize = 8; // Keep up to 8 frames in memory (balance between memory & network)
    this.currentTexture = null;
    this.textureLoader = new THREE.TextureLoader();
    this.isUsingFrameFolder = this.data.folderPath.length > 0;

    this.el.addEventListener('targetFound', () => {
      this.isInitialized = false; // retry setup when visible
    });

    this.el.addEventListener('targetLost', () => {
      this.disposeTextures(); // Clean up textures when target is lost
    });
  },

  setupSpritesheet() {
    // Original spritesheet method (fallback for old-style usage)
    const mesh = this.el.getObject3D('mesh');
    if (!mesh || !mesh.material || !mesh.material.map || !mesh.material.map.image) return false;
    this.texture = mesh.material.map;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(1/this.data.cols, 1/this.data.rows);
    mesh.material.needsUpdate = true;
    this.isInitialized = true;
    return true;
  },

  getFramePath(frameNumber) {
    // Generate frame file path with zero-padded frame number
    const frameNum = String(frameNumber).padStart(3, '0');
    return `${this.data.folderPath}/${frameNum}.png`;
  },

  disposeTextures() {
    // Dispose all cached textures to free memory
    Object.values(this.frameCache).forEach(texture => {
      if (texture && texture.dispose) {
        texture.dispose();
      }
    });
    this.frameCache = {};
  },

  cleanupOldFrames() {
    // LRU cache: keep only maxCacheSize frames, dispose oldest unused ones
    if (Object.keys(this.frameCache).length > this.maxCacheSize) {
      // Remove oldest frame from access order
      const oldestFrame = this.frameAccessOrder.shift();
      if (oldestFrame !== undefined && this.frameCache[oldestFrame]) {
        if (this.frameCache[oldestFrame].dispose) {
          this.frameCache[oldestFrame].dispose();
        }
        delete this.frameCache[oldestFrame];
      }
    }
  },

  markFrameAccessed(frameNumber) {
    // Remove from order if already exists
    const index = this.frameAccessOrder.indexOf(frameNumber);
    if (index > -1) {
      this.frameAccessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.frameAccessOrder.push(frameNumber);
  },

  async loadFrameTexture(frameNumber) {
    if (this.frameCache[frameNumber]) {
      return this.frameCache[frameNumber];
    }

    try {
      const framePath = this.getFramePath(frameNumber);
      const texture = await new Promise((resolve, reject) => {
        this.textureLoader.load(framePath, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      this.frameCache[frameNumber] = texture;
      return texture;
    } catch (error) {
      console.warn(`Failed to load frame ${frameNumber}:`, error);
      return null;
    }
  },

  updateFrameTexture(frameNumber) {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh || !mesh.material) return;

    this.markFrameAccessed(frameNumber);

    if (this.frameCache[frameNumber]) {
      // Texture is cached, use it immediately
      mesh.material.map = this.frameCache[frameNumber];
      mesh.material.needsUpdate = true;
    } else {
      // Load texture asynchronously
      this.loadFrameTexture(frameNumber).then(texture => {
        if (texture && this.frame === frameNumber) {
          // Only update if we're still on this frame
          mesh.material.map = texture;
          mesh.material.needsUpdate = true;
        }
      });
    }
  },

  tick(t, dt) {
    // Use frame folder method if folderPath is provided
    if (this.isUsingFrameFolder) {
      if (!this.isInitialized) {
        this.isInitialized = true;
        // Pre-load first frame
        this.updateFrameTexture(0);
      }

      this.accumulator += dt;
      if (this.accumulator < this.frameDelay) return;
      this.accumulator -= this.frameDelay;
      
      this.frame = (this.frame + 1) % this.data.totalFrames;
      this.updateFrameTexture(this.frame);
      
      // Clean up cache if it exceeds max size
      this.cleanupOldFrames();
    } else {
      // Fallback to original spritesheet method
      if (!this.isInitialized && !this.setupSpritesheet()) return;
      this.accumulator += dt;
      if (this.accumulator < this.frameDelay) return;
      this.accumulator -= this.frameDelay;
      this.frame = (this.frame + 1) % this.data.totalFrames;
      const col = this.frame % this.data.cols;
      const row = Math.floor(this.frame / this.data.cols);
      const offX = col / this.data.cols;
      const offY = (1.0 - 1/this.data.rows) - (row / this.data.rows);
      this.texture.offset.set(offX, offY);
    }
  },

  remove() {
    // Clean up when component is removed
    this.disposeTextures();
  }
});

// HEHE

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
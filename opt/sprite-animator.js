AFRAME.registerComponent('sprite-animator', {
  schema: { 
    cols: {type:'int'}, 
    rows: {type:'int'}, 
    totalFrames: {type:'int'}, 
    fps: {type:'int'}, 
    loop: {type:'boolean', default:true},
    folderPath: {type:'string', default:''}, // New: folder path for individual frames
    framePrefix: {type:'string', default:''} // New: prefix for frame filenames (e.g., 'nano' for nano000.png)
  },
  init() {
    this.texture = null;
    this.frame = 0;
    this.frameDelay = 1000 / this.data.fps;
    this.accumulator = 0;
    this.isInitialized = false;
    this.frameCache = {}; // Cache loaded textures
    this.currentTexture = null;
    this.textureLoader = new THREE.TextureLoader();
    this.isUsingFrameFolder = this.data.folderPath.length > 0;

    this.el.addEventListener('targetFound', () => {
      this.isInitialized = false; // retry setup when visible
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
    const prefix = this.data.framePrefix ? this.data.framePrefix : '';
    return `${this.data.folderPath}/${prefix}${frameNum}.png`;
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
  }
});

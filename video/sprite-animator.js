/*
 * A-Frame Sprite Sheet Animator Component (Robust AR-Safe Version)
 *
 * This version is designed to work in dynamic scenes (like MindAR)
 * where the mesh or material may not be ready on init.
 * It will poll for the texture inside the tick loop until it finds it.
 */
AFRAME.registerComponent('sprite-animator', {
  schema: {
    cols: { type: 'int', default: 1 },
    rows: { type: 'int', default: 1 },
    totalFrames: { type: 'int', default: 1 },
    fps: { type: 'int', default: 12 },
    loop: { type: 'boolean', default: true }
  },

  init: function () {
    this.texture = null;
    this.frameSize = { w: 0, h: 0 };
    this.currentFrame = 0;
    this.frameDelay = 1000 / this.data.fps;
    this.lastFrameTime = 0;
    this.isInitialized = false; // Setup flag
  },
  
  /**
   * This function tries to find and configure the texture.
   * It will be called by tick() until it succeeds.
   */
  setupTexture: function () {
    const mesh = this.el.getObject3D('mesh');
    
    // 1. Check if mesh and material are ready
    if (!mesh || !mesh.material || !mesh.material.map) {
      // Not ready, try again next tick
      return false;
    }

    this.texture = mesh.material.map;
    
    // 2. Check if texture image data is loaded
    if (!this.texture.image) {
      // Texture object exists, but image data not loaded yet
      return false;
    }

    // --- SUCCESS: Texture is loaded, run setup ---
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;

    // Calculate frame size in UV space (0.0 to 1.0)
    this.frameSize.w = 1 / this.data.cols;
    this.frameSize.h = 1 / this.data.rows;
    
    // Set the texture "window" to be the size of one frame
    this.texture.repeat.set(this.frameSize.w, this.frameSize.h);

    // Set the initial frame
    this.updateFrame();
    
    this.isInitialized = true; // Mark as setup
    console.log('SPRITE-ANIMATOR: Setup complete and texture locked.');
    return true;
  },

  tick: function (time, timeDelta) {
    // --- Phase 1: Initialization ---
    // If not set up, try to set up.
    if (!this.isInitialized) {
      // If setupTexture() fails (returns false),
      // abort this tick and try again next frame.
      if (!this.setupTexture()) {
        return; 
      }
    }
    
    // --- Phase 2: Animation Loop (only if initialized) ---
    if (time - this.lastFrameTime < this.frameDelay) {
      return; // Not time to update yet
    }

    this.lastFrameTime = time;
    this.currentFrame++;

    if (this.currentFrame >= this.data.totalFrames) {
      if (this.data.loop) {
        this.currentFrame = 0;
      } else {
        this.currentFrame = this.data.totalFrames - 1; // Stop on last frame
      }
    }

    this.updateFrame();
  },

  updateFrame: function () {
    if (!this.texture) return; // Should not happen if isInitialized is true

    const col = this.currentFrame % this.data.cols;
    const row = Math.floor(this.currentFrame / this.data.cols);

    // Calculate UV offset
    const offsetX = col * this.frameSize.w;
    // Y is flipped: (1.0 - frameHeight) - (row * frameHeight)
    const offsetY = (1.0 - this.frameSize.h) - (row * this.frameSize.h);

    this.texture.offset.set(offsetX, offsetY);
  }
});
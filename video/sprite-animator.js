/*
 * A-Frame Sprite Sheet Animator Component
 *
 * Animates a sprite sheet by updating texture offsets.
 * Assumes sprites are in a grid, read left-to-right, top-to-bottom.
 */
AFRAME.registerComponent('sprite-animator', {
  schema: {
    // The number of columns in the sprite sheet
    cols: { type: 'int', default: 1 },
    
    // The number of rows in the sprite sheet
    rows: { type: 'int', default: 1 },
    
    // The total number of frames in the animation
    totalFrames: { type: 'int', default: 1 },
    
    // Frames per second
    fps: { type: 'int', default: 12 },
    
    // Start playing automatically
    autoplay: { type: 'boolean', default: true },
    
    // Loop the animation
    loop: { type: 'boolean', default: true }
  },

  init: function () {
    this.texture = null;
    this.frameSize = { w: 0, h: 0 };
    this.currentFrame = 0;
    this.frameDelay = 0;
    this.lastFrameTime = 0;
    this.isPlaying = this.data.autoplay;

    // This is the CRITICAL part. You can't animate a texture
    // that hasn't loaded yet. We wait for the material to be ready.
    this.el.addEventListener('materialtextureloaded', this.setup.bind(this));
  },

  setup: function () {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh || !mesh.material || !mesh.material.map) {
      console.error("SPRITE-ANIMATOR: Could not find texture. Make sure you have a material with a src.");
      return;
    }

    this.texture = mesh.material.map;
    
    // We need to tell THREE.js to repeat the texture,
    // but we will only show one "repeat" (one frame).
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;

    // Calculate the size of one frame in UV space (0.0 to 1.0)
    this.frameSize.w = 1 / this.data.cols;
    this.frameSize.h = 1 / this.data.rows;
    
    // Set the texture "window" to be the size of one frame
    this.texture.repeat.set(this.frameSize.w, this.frameSize.h);

    // Calculate time delay between frames
    this.frameDelay = 1000 / this.data.fps;
    
    // Set the initial frame
    this.updateFrame();
  },

  tick: function (time, timeDelta) {
    if (!this.isPlaying || !this.texture) {
      return;
    }

    if (time - this.lastFrameTime < this.frameDelay) {
      // Not time to update yet
      return;
    }

    this.lastFrameTime = time;
    this.currentFrame++;

    if (this.currentFrame >= this.data.totalFrames) {
      if (this.data.loop) {
        this.currentFrame = 0;
      } else {
        this.currentFrame = this.data.totalFrames - 1;
        this.pause();
      }
    }

    this.updateFrame();
  },

  updateFrame: function () {
    if (!this.texture) return; // Safety check

    // Calculate the column and row of the current frame
    const col = this.currentFrame % this.data.cols;
    const row = Math.floor(this.currentFrame / this.data.cols);

    // Calculate the texture offset
    // X offset is simple: col * frameWidth
    const offsetX = col * this.frameSize.w;
    
    // Y offset is tricky. UV coordinates start at (0,0) in the
    // BOTTOM-LEFT corner. We read sprites top-to-bottom.
    // So we have to "flip" the Y coordinate.
    // (1.0 - frameHeight) = position of top-left frame's bottom-left corner
    // Then subtract (row * frameHeight) to move down
    const offsetY = (1.0 - this.frameSize.h) - (row * this.frameSize.h);

    this.texture.offset.set(offsetX, offsetY);
  },

  play: function () {
    this.isPlaying = true;
  },

  pause: function () {
    this.isPlaying = false;
  }
});
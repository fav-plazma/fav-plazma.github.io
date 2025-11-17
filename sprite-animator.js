AFRAME.registerComponent('sprite-animator', {
  schema: { cols: {type:'int'}, rows:{type:'int'}, totalFrames:{type:'int'}, fps:{type:'int'}, loop:{type:'boolean',default:true}},
  init() {
    this.texture = null;
    this.frame = 0;
    this.frameDelay = 1000 / this.data.fps;
    this.accumulator = 0;
    this.isInitialized = false;

    this.el.addEventListener('targetFound', () => {
      this.isInitialized = false; // retry setup when visible
    });
  },
  setupTexture() {
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
  tick(t, dt) {
    if (!this.isInitialized && !this.setupTexture()) return;
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
});

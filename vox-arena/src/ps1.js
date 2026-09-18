import * as THREE from 'three';

// PS1-пайплайн: сцена -> низкоразрешённый таргет (nearest) -> экран
export class PS1 {
  constructor(renderer) {
    this.renderer = renderer;
    this.scale = 0.35;
    this.brightness = 1;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.rt = null; this.w = 0; this.h = 0;
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this._rt();
  }
  setScale(s) { this.scale = s; this._rt(); }
  _rt() {
    const rw = Math.max(160, Math.round(this.w * this.scale));
    const rh = Math.max(90, Math.round(this.h * this.scale));
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(rw, rh, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    this.rt.texture.generateMipmaps = false;
  }
  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.mat.map = this.rt.texture;
    this.mat.color.setScalar(this.brightness);
    r.render(this.quadScene, this.quadCam);
  }
}

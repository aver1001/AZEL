// GPU scorch map covering the whole world. Channels:
//   R = char (permanent blackening), G = heat (glowing embers, decays),
//   B = fire retardant (red, permanent).
// Splats are drawn with MAX blending; heat fades by a subtract pass.
// A coarse CPU grid mirrors it for the minimap and the damage receipt.
import * as THREE from 'three';
import { WORLD } from '../config.js';

const W = WORLD.maxX - WORLD.minX;
const H = WORLD.maxZ - WORLD.minZ;
export const GRID = 4; // meters per CPU cell
export const GW = Math.ceil(W / GRID);
export const GH = Math.ceil(H / GRID);

export class BurnMap {
  constructor(renderer, texW = 1024, texH = 1792) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(texW, texH, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.texture = this.rt.texture;
    this.bounds = new THREE.Vector4(WORLD.minX, WORLD.minZ, W, H);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const max = 1024;
    this.max = max;
    const geo = new THREE.PlaneGeometry(2, 2);
    this.splat = new Float32Array(max * 4);
    this.val = new Float32Array(max * 4);
    this.splatAttr = new THREE.InstancedBufferAttribute(this.splat, 4).setUsage(THREE.DynamicDrawUsage);
    this.valAttr = new THREE.InstancedBufferAttribute(this.val, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSplat', this.splatAttr);
    geo.setAttribute('aVal', this.valAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uBounds: { value: this.bounds } },
      vertexShader: /* glsl */ `
        attribute vec4 aSplat;
        attribute vec4 aVal;
        uniform vec4 uBounds;
        varying vec2 vLocal;
        varying vec4 vVal;
        varying vec2 vWorld;
        void main() {
          vec2 w = aSplat.xy + position.xy * aSplat.z;
          vec2 uv = (w - uBounds.xy) / uBounds.zw;
          gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
          vLocal = position.xy;
          vVal = aVal;
          vWorld = w;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vLocal;
        varying vec4 vVal;
        varying vec2 vWorld;
        void main() {
          float d = length(vLocal);
          float f = 1.0 - smoothstep(0.35, 1.0, d);
          if (f <= 0.0) discard;
          gl_FragColor = vVal * f;
        }
      `,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    this.splatMesh = new THREE.InstancedMesh(geo, mat, max);
    this.splatMesh.frustumCulled = false;
    this.splatMesh.count = 0;
    this.splatScene = new THREE.Scene();
    this.splatScene.add(this.splatMesh);

    const decayMat = new THREE.ShaderMaterial({
      uniforms: { uAmount: { value: 1 / 255 } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float uAmount; void main(){ gl_FragColor = vec4(0.0, uAmount, 0.0, 0.0); }',
      blending: THREE.CustomBlending,
      blendEquation: THREE.ReverseSubtractEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    this.decayScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), decayMat);
    quad.frustumCulled = false;
    this.decayScene.add(quad);
    this.decayAcc = 0;

    this.queue = 0;
    this.needsClear = true;

    // CPU mirror
    this.char = new Uint8Array(GW * GH);
    this.retard = new Uint8Array(GW * GH);
    this.veg = new Uint8Array(GW * GH);
    this.burnedCells = 0;
    this.burnedVeg = 0;
  }

  cellIndex(x, z) {
    const i = Math.floor((x - WORLD.minX) / GRID);
    const j = Math.floor((z - WORLD.minZ) / GRID);
    if (i < 0 || j < 0 || i >= GW || j >= GH) return -1;
    return j * GW + i;
  }

  markVegetation(x, z, r = 2) {
    const n = Math.ceil(r / GRID);
    const ci = Math.floor((x - WORLD.minX) / GRID), cj = Math.floor((z - WORLD.minZ) / GRID);
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      this.veg[j * GW + i] = 1;
    }
  }

  /** Queue a scorch. char/heat/retardant in 0..1. */
  add(x, z, radius, char = 1, heat = 1, retardant = 0) {
    if (this.queue < this.max) {
      const i = this.queue++;
      this.splat[i * 4] = x;
      this.splat[i * 4 + 1] = z;
      this.splat[i * 4 + 2] = Math.max(radius, 0.6);
      this.val[i * 4] = char;
      this.val[i * 4 + 1] = heat;
      this.val[i * 4 + 2] = retardant;
      this.val[i * 4 + 3] = 1;
    }
    // CPU mirror (only meaningful charring)
    if (char < 0.35 && retardant < 0.5) return;
    const n = Math.ceil(radius / GRID);
    const ci = Math.floor((x - WORLD.minX) / GRID), cj = Math.floor((z - WORLD.minZ) / GRID);
    const r2 = (radius / GRID) ** 2;
    for (let j = cj - n; j <= cj + n; j++) {
      for (let i = ci - n; i <= ci + n; i++) {
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        if ((i - ci) ** 2 + (j - cj) ** 2 > r2 + 0.5) continue;
        const k = j * GW + i;
        if (retardant >= 0.5) this.retard[k] = 1;
        if (char >= 0.35 && !this.char[k]) {
          this.char[k] = 1;
          this.burnedCells++;
          if (this.veg[k]) this.burnedVeg++;
        }
      }
    }
  }

  isRetardant(x, z) {
    const k = this.cellIndex(x, z);
    return k >= 0 && this.retard[k] === 1;
  }

  flush(dt) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    if (this.needsClear) {
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      this.needsClear = false;
    }
    this.decayAcc += dt;
    if (this.decayAcc > 0.06) {
      const steps = Math.floor(this.decayAcc / 0.06);
      this.decayAcc -= steps * 0.06;
      this.decayScene.children[0].material.uniforms.uAmount.value = steps / 255;
      r.render(this.decayScene, this.camera);
    }
    if (this.queue > 0) {
      this.splatMesh.count = this.queue;
      this.splatAttr.needsUpdate = true;
      this.valAttr.needsUpdate = true;
      r.render(this.splatScene, this.camera);
      this.queue = 0;
    }
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
  }

  get burnedHa() {
    return (this.burnedCells * GRID * GRID) / 10000;
  }

  get burnedForestHa() {
    return (this.burnedVeg * GRID * GRID) / 10000;
  }
}

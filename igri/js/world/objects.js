// Every static burnable in the world lives here as instanced meshes plus
// struct-of-arrays state. Handles ignition, burn progress, spread, extinguish,
// retardant protection and the spatial queries the player and skills use.
import * as THREE from 'three';
import { OBJECTS, SPREAD } from '../config.js';
import { BUILDERS, CAR_COLORS } from '../models/catalog.js';

const CHAR = new THREE.Color(0.07, 0.062, 0.058);
const HOT = new THREE.Color(0.62, 0.24, 0.1);
const RETARD = new THREE.Color(1.0, 0.42, 0.38);
const GLOW = new THREE.Color(1.0, 0.72, 0.38);
const BLDG_TINTS = [0xc9ccd1, 0xd9d2c4, 0xa9b8c8, 0xe4e0d8, 0x9aa3ad, 0xbfc9c0];

// Shared "x-ray" cutout: anything between the camera and Igri is dithered away
// so forest canopies and buildings never hide the player.
export const CUT = {
  uCutA: { value: new THREE.Vector3(0, -999, 0) },
  uCutB: { value: new THREE.Vector3(0, -999, 1) },
  uCutR: { value: 0 },
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function heatMaterial({ building = false } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // both variants share this function's source text, so give them distinct program keys
  mat.customProgramCacheKey = () => (building ? 'igri-building' : 'igri-generic');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CUT);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aHeat;
        varying float vHeat;
        varying vec3 vCutW;
        ${building ? 'varying vec3 vBLocal; varying vec3 vBNormal; varying float vSeed; varying float vUnitY;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHeat = aHeat;
        vec4 cutW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutW = instanceMatrix * cutW;
        #endif
        vCutW = (modelMatrix * cutW).xyz;
        ${building ? `
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vBLocal = position * sc;
        vBNormal = normal;
        vUnitY = position.y;
        vSeed = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071;` : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vHeat;
        varying vec3 vCutW;
        uniform vec3 uCutA;
        uniform vec3 uCutB;
        uniform float uCutR;
        const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
        ${building ? 'varying vec3 vBLocal; varying vec3 vBNormal; varying float vSeed; varying float vUnitY;' : ''}
        float hh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uCutR > 0.0) {
          vec3 seg = uCutB - uCutA;
          float L = length(seg);
          vec3 dir = seg / L;
          float t = dot(vCutW - uCutA, dir);
          if (t > uCutR * 0.5 && t < L) {
            float d = length(vCutW - (uCutA + dir * t));
            float rr = uCutR * (0.55 + 0.45 * clamp(t / (uCutR * 4.0), 0.0, 1.0));
            if (d < rr) {
              float edge = smoothstep(rr * 0.7, rr, d);
              // 4x4 ordered dither: a clean screen-door instead of noise
              vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
              float bayer = (BAYER4[int(q.y) * 4 + int(q.x)] + 0.5) / 16.0;
              if (bayer > edge) discard;
            }
          }
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float winMask = 0.0;
        float winLit = 0.0;
        ${building ? `
        if (abs(vBNormal.y) < 0.5 && vBLocal.y > 2.5 && vUnitY < 0.995) {
          float u = abs(vBNormal.x) > 0.5 ? vBLocal.z : vBLocal.x;
          vec2 c = vec2(u + 50.0, vBLocal.y) / vec2(3.1, 3.5);
          vec2 f = fract(c);
          winMask = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);
          vec2 id = floor(c) + vec2(vSeed * 13.0, vBNormal.x * 3.0 + vBNormal.z * 7.0);
          winLit = step(0.78, hh(id));
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 glass = mix(vec3(0.16, 0.22, 0.3), vec3(0.42, 0.55, 0.66), hh(id + 3.1) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass * min(1.0, lum * 1.6), winMask);
        }` : ''}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.22, 0.04) * vHeat * vHeat * ${building ? '0.25' : '0.55'};
        ${building ? 'totalEmissiveRadiance += winMask * (vec3(1.0, 0.8, 0.5) * winLit * 0.12 + vec3(2.6, 0.8, 0.15) * vHeat * (0.6 + 0.4 * hh(floor(vBLocal.xy) + vSeed)));' : ''}`,
      );
  };
  return mat;
}

export class ObjectField {
  constructor(scene, placements, { flames, fx, burnMap, onEvent }) {
    this.flames = flames;
    this.fx = fx;
    this.burnMap = burnMap;
    this.onEvent = onEvent || (() => {});
    this.spreadTier = 1;
    this.spreadEnabled = true;

    const list = placements.filter((p) => !p.hero);
    const N = list.length;
    this.count = N;
    this.typeKey = new Array(N);
    this.x = new Float32Array(N);
    this.z = new Float32Array(N);
    this.need = new Float32Array(N);
    this.fuel = new Float32Array(N);
    this.value = new Float32Array(N);
    this.size = new Float32Array(N);
    this.height = new Float32Array(N);
    this.dur = new Float32Array(N);
    this.state = new Uint8Array(N); // 0 intact, 1 burning, 2 burnt, 3 protected
    this.t = new Float32Array(N);
    this.flame = new Int32Array(N).fill(-1);
    this.group = new Uint16Array(N);
    this.inst = new Uint32Array(N);
    this.source = new Uint8Array(N);
    this.pulled = new Uint8Array(N); // being swallowed into the player
    this.pullTarget = new THREE.Vector3();
    this.pullLift = 0.3;

    // group placements by model
    const groups = new Map();
    list.forEach((p, i) => {
      const model = p.model || p.type;
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(i);
    });

    const matGeneric = heatMaterial();
    const matBuilding = heatMaterial({ building: true });
    this.groups = [];
    this.root = new THREE.Group();
    this.root.name = 'objects';
    scene.add(this.root);

    for (const [model, ids] of groups) {
      const parts = BUILDERS[model]();
      const def = OBJECTS[list[ids[0]].type];
      let modelH = 0;
      for (const pt of parts) {
        pt.geometry.computeBoundingBox();
        modelH = Math.max(modelH, pt.geometry.boundingBox.max.y);
      }
      const gi = this.groups.length;
      const heat = new Float32Array(ids.length);
      const heatAttr = new THREE.InstancedBufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage);
      const g = { model, ids, parts: [], heat, heatAttr, dirtyM: false, dirtyC: false, dirtyH: false, lo: Infinity, hi: -1 };
      const big = def.size * 1 >= 0.6 || def.tree;
      for (const pt of parts) {
        pt.geometry.setAttribute('aHeat', heatAttr);
        const mesh = new THREE.InstancedMesh(pt.geometry, pt.building ? matBuilding : matGeneric, ids.length);
        mesh.castShadow = big;
        mesh.receiveShadow = big;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.name = `${model}`;
        const baseM = new Float32Array(ids.length * 16);
        const baseC = new Float32Array(ids.length * 3);
        this.root.add(mesh);
        g.parts.push({ mesh, burnt: pt.burnt, canopy: !!pt.canopy, baseM, baseC });
      }
      ids.forEach((id, k) => {
        const p = list[id];
        const d = OBJECTS[p.type];
        this.typeKey[id] = p.type;
        this.x[id] = p.x;
        this.z[id] = p.z;
        this.group[id] = gi;
        this.inst[id] = k;
        let sx = p.s, sy = p.s, sz = p.s;
        if (p.dims) {
          const [w, h, dd] = p.dims;
          sx = w; sy = h; sz = dd;
          this.need[id] = 4 + 0.13 * h + 0.1 * Math.sqrt(w * dd);
          this.fuel[id] = w * dd * h * 0.012;
          this.value[id] = w * dd * h * 300000;
          this.size[id] = Math.min(w, dd) * 0.5;
          this.height[id] = h;
        } else {
          this.need[id] = d.need * p.s;
          this.fuel[id] = d.fuel * p.s * p.s;
          this.value[id] = d.value * p.s * p.s;
          this.size[id] = d.size * p.s;
          this.height[id] = modelH * p.s;
        }
        this.dur[id] = d.dur * (0.8 + Math.random() * 0.45);
        tmpQ.setFromAxisAngle(UP, p.rot || 0);
        tmpM.compose(tmpP.set(p.x, 0, p.z), tmpQ, tmpS.set(sx, sy, sz));
        let tint = 0xffffff;
        if (p.type === 'car') tint = CAR_COLORS[(p.color || 0) % CAR_COLORS.length];
        if (p.dims) tint = BLDG_TINTS[(p.hue || 0) % BLDG_TINTS.length];
        for (const part of g.parts) {
          part.mesh.setMatrixAt(k, tmpM);
          tmpM.toArray(part.baseM, k * 16);
          tmpC.set(tint);
          // subtle per-instance variation keeps forests from looking cloned
          if (part.canopy || p.type === 'bush' || p.type === 'grass' || p.type === 'leaf') {
            const v = 0.85 + Math.random() * 0.3;
            tmpC.setRGB(tmpC.r * v, tmpC.g * (0.9 + Math.random() * 0.2) * v, tmpC.b * v);
          }
          part.mesh.setColorAt(k, tmpC);
          tmpC.toArray(part.baseC, k * 3);
        }
        if (d.tree || p.type === 'bush' || p.type === 'grass') this.burnMap.markVegetation(p.x, p.z, d.tree ? 3 : 1);
      });
      this.groups.push(g);
    }

    // spatial index: fine grid for ordinary objects, flat list for large ones
    this.cell = 8;
    this.minX = -420;
    this.minZ = -720;
    this.gw = Math.ceil(840 / this.cell);
    this.gh = Math.ceil(1440 / this.cell);
    const counts = new Int32Array(this.gw * this.gh + 1);
    this.large = [];
    const cellOf = (id) => {
      const i = Math.min(this.gw - 1, Math.max(0, Math.floor((this.x[id] - this.minX) / this.cell)));
      const j = Math.min(this.gh - 1, Math.max(0, Math.floor((this.z[id] - this.minZ) / this.cell)));
      return j * this.gw + i;
    };
    for (let id = 0; id < N; id++) {
      if (this.size[id] >= 5) this.large.push(id);
      else counts[cellOf(id) + 1]++;
    }
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    this.cellStart = counts;
    this.cellItems = new Int32Array(N);
    const fill = counts.slice();
    for (let id = 0; id < N; id++) {
      if (this.size[id] >= 5) continue;
      this.cellItems[fill[cellOf(id)]++] = id;
    }
    this.large = Int32Array.from(this.large);

    this.burning = [];
    this.smolder = [];
    this.spreadAcc = 0;
    this.emitBudget = 0;
  }

  /** Call fn(id, dist) for every object whose center lies within r (+ its size). */
  query(x, z, r, fn) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x - r - 5 - this.minX) / c));
    const i1 = Math.min(this.gw - 1, Math.floor((x + r + 5 - this.minX) / c));
    const j0 = Math.max(0, Math.floor((z - r - 5 - this.minZ) / c));
    const j1 = Math.min(this.gh - 1, Math.floor((z + r + 5 - this.minZ) / c));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.gw + i;
        for (let n = this.cellStart[k]; n < this.cellStart[k + 1]; n++) {
          const id = this.cellItems[n];
          const d = Math.hypot(this.x[id] - x, this.z[id] - z);
          if (d <= r + this.size[id]) if (fn(id, d) === false) return;
        }
      }
    }
    for (let n = 0; n < this.large.length; n++) {
      const id = this.large[n];
      const d = Math.hypot(this.x[id] - x, this.z[id] - z);
      if (d <= r + this.size[id]) if (fn(id, d) === false) return;
    }
  }

  isExplosive(id) {
    return !!OBJECTS[this.typeKey[id]].explosive;
  }

  def(id) {
    return OBJECTS[this.typeKey[id]];
  }

  /** source: 0 player, 1 spread, 2 skill, 3 blast */
  ignite(id, source = 0) {
    if (this.state[id] !== 0) return false;
    if (this.burning.length >= SPREAD.maxBurning && source === 1) return false;
    this.state[id] = 1;
    this.t[id] = 0;
    this.source[id] = source;
    this.burning.push(id);
    const h = this.height[id];
    if (h > 0.15 || this.size[id] > 0.3) this.flame[id] = this.flames.alloc();
    this.burnMap.add(this.x[id], this.z[id], Math.max(0.6, this.size[id] * 1.6), 0.25, 1);
    this.onEvent('ignite', id, source);
    if (this.isExplosive(id)) {
      this.t[id] = 1; // explodes right away
    }
    return true;
  }

  /** Swallow a small object: it streaks into Igri, flares and is gone. */
  devour(id) {
    if (this.state[id] !== 0) return false;
    if (this.isExplosive(id)) return this.ignite(id, 0);
    this.state[id] = 1;
    this.t[id] = 0;
    this.source[id] = 0;
    this.pulled[id] = 1;
    this.dur[id] = 0.22 + Math.random() * 0.08;
    this.burning.push(id);
    this.onEvent('ignite', id, 0);
    return true;
  }

  applyPullVisual(id, t) {
    const g = this.groups[this.group[id]];
    const k = this.inst[id];
    const e = t * t;
    const s = 1 - e * 0.92;
    const tx = this.pullTarget.x, tz = this.pullTarget.z;
    const lift = Math.sin(t * Math.PI) * this.pullLift;
    for (const part of g.parts) {
      const m = tmpM.elements;
      for (let q = 0; q < 16; q++) m[q] = part.baseM[k * 16 + q];
      for (const c of [0, 1, 2, 4, 5, 6, 8, 9, 10]) m[c] *= s;
      m[12] += (tx - m[12]) * e;
      m[13] += lift;
      m[14] += (tz - m[14]) * e;
      part.mesh.setMatrixAt(k, tmpM);
    }
    g.dirtyM = true;
    this.setColor(id, (part, kk, base) => tmpC.fromArray(base, kk * 3).lerp(GLOW, Math.min(1, t * 2)));
    g.heat[k] = 1.3;
    g.dirtyH = true;
    this.markRange(g, k);
  }

  finishPulled(id) {
    this.state[id] = 2;
    this.pulled[id] = 0;
    const g = this.groups[this.group[id]];
    const k = this.inst[id];
    this.setScale(id, 0, 0, () => 'vanish');
    this.setColor(id, (part, kk, base) => tmpC.fromArray(base, kk * 3).copy(CHAR));
    g.heat[k] = 0;
    g.dirtyH = true;
    this.burnMap.add(this.x[id], this.z[id], Math.max(0.5, this.size[id] * 1.5), 0.7, 0.3);
    this.onEvent('burnt', id, 0, false);
  }

  extinguish(x, z, r) {
    let n = 0;
    for (let k = this.burning.length - 1; k >= 0; k--) {
      const id = this.burning[k];
      if (this.pulled[id]) continue;
      if (Math.hypot(this.x[id] - x, this.z[id] - z) < r + this.size[id]) {
        this.finish(id, true);
        this.burning.splice(k, 1);
        n++;
      }
    }
    return n;
  }

  protect(x, z, r) {
    this.query(x, z, r, (id) => {
      if (this.state[id] === 0) {
        this.state[id] = 3;
        this.setColor(id, (part, k, base) => tmpC.fromArray(base, k * 3).multiply(RETARD));
      } else if (this.state[id] === 1) {
        // doused mid-burn
        const i = this.burning.indexOf(id);
        if (i >= 0) {
          this.burning.splice(i, 1);
          this.finish(id, true);
        }
      }
    });
  }

  markRange(g, k) {
    if (k < g.lo) g.lo = k;
    if (k > g.hi) g.hi = k;
  }

  setColor(id, fn) {
    const g = this.groups[this.group[id]];
    const k = this.inst[id];
    for (const part of g.parts) {
      fn(part, k, part.baseC);
      part.mesh.setColorAt(k, tmpC);
    }
    g.dirtyC = true;
    this.markRange(g, k);
  }

  setScale(id, sAll, sY, partFilter) {
    const g = this.groups[this.group[id]];
    const k = this.inst[id];
    for (const part of g.parts) {
      const e = tmpM.elements;
      for (let q = 0; q < 16; q++) e[q] = part.baseM[k * 16 + q];
      const mode = partFilter(part);
      if (mode === 'keep') continue;
      const a = mode === 'vanish' ? sAll : 1;
      const y = mode === 'collapse' ? sY : a;
      e[0] *= a; e[1] *= a; e[2] *= a;
      e[4] *= y; e[5] *= y; e[6] *= y;
      e[8] *= a; e[9] *= a; e[10] *= a;
      part.mesh.setMatrixAt(k, tmpM);
    }
    g.dirtyM = true;
    this.markRange(g, k);
  }

  finish(id, doused = false) {
    this.state[id] = 2;
    const g = this.groups[this.group[id]];
    const k = this.inst[id];
    const t = doused ? Math.min(1, this.t[id] + 0.2) : 1;
    this.applyBurnVisual(id, t, true);
    g.heat[k] = 0;
    g.dirtyH = true;
    this.markRange(g, k);
    if (this.flame[id] >= 0) {
      this.flames.release(this.flame[id]);
      this.flame[id] = -1;
    }
    this.burnMap.add(this.x[id], this.z[id], Math.max(0.8, this.size[id] * 2.2), 1, doused ? 0.2 : 0.8);
    this.smolder.push([id, doused ? 2 : 5 + Math.random() * 4]);
    this.onEvent('burnt', id, this.source[id], doused);
  }

  applyBurnVisual(id, t, final = false) {
    const def = this.def(id);
    const g = this.groups[this.group[id]];
    const k = this.inst[id];
    // color: base → hot → char
    this.setColor(id, (part, kk, base) => {
      tmpC.fromArray(base, kk * 3);
      if (t < 0.35) tmpC.lerp(HOT, t / 0.35);
      else tmpC.copy(HOT).lerp(CHAR, Math.min(1, (t - 0.35) / 0.5));
    });
    const vanish = THREE.MathUtils.smoothstep(t, 0.3, 1);
    const collapse = 1 - 0.5 * THREE.MathUtils.smoothstep(t, 0.45, 1);
    this.setScale(id, 1 - vanish * (final ? 1 : 0.97), collapse, (part) => {
      if (part.burnt === 'vanish') return 'vanish';
      if (part.burnt === 'collapse') return 'collapse';
      return 'keep';
    });
    if (def.burnt === 'char' && !g.parts.some((p) => p.burnt !== 'char')) {
      // bushes shrink a little as they burn
      if (this.typeKey[id] === 'bush') this.setScale(id, 1 - 0.35 * t, 1, () => 'vanish');
    }
    g.heat[k] = final ? 0 : Math.sin(Math.min(1, t) * Math.PI) * 1.1;
    g.dirtyH = true;
    this.markRange(g, k);
  }

  update(dt, ctx) {
    // ctx: { tier, rainAt(x,z) -> bool, cameraPos, viewRadius }
    const flames = this.flames;
    const fx = this.fx;
    const view = ctx.viewRadius || 80;
    const cx = ctx.focus ? ctx.focus.x : 0, cz = ctx.focus ? ctx.focus.z : 0;
    this.emitBudget = Math.min(160, this.emitBudget + dt * 900);
    for (let n = this.burning.length - 1; n >= 0; n--) {
      const id = this.burning[n];
      const x = this.x[id], z = this.z[id];
      if (this.pulled[id]) {
        this.t[id] += dt / this.dur[id];
        if (this.t[id] >= 1) {
          this.burning.splice(n, 1);
          this.finishPulled(id);
        } else {
          this.applyPullVisual(id, this.t[id]);
          if (this.emitBudget > 1 && Math.random() < 0.35) {
            fx.ember(x + (this.pullTarget.x - x) * this.t[id], 0.1, z + (this.pullTarget.z - z) * this.t[id], Math.max(0.1, this.size[id]), 1);
            this.emitBudget -= 0.5;
          }
        }
        continue;
      }
      if (ctx.rainAt && ctx.rainAt(x, z) && Math.random() < dt * 1.5) {
        this.burning.splice(n, 1);
        this.finish(id, true);
        fx.steam(x, this.height[id] * 0.5, z, Math.max(0.5, this.size[id]), 2);
        continue;
      }
      this.t[id] += dt / this.dur[id];
      const t = this.t[id];
      if (this.isExplosive(id) && t >= 1) {
        this.burning.splice(n, 1);
        this.finish(id);
        this.onEvent('explode', id, this.source[id]);
        continue;
      }
      if (t >= 1) {
        this.burning.splice(n, 1);
        this.finish(id);
        continue;
      }
      this.applyBurnVisual(id, t);
      const h = Math.max(0.2, this.height[id]);
      const s = this.size[id];
      const inten = Math.sin(Math.min(1, t * 1.3) * Math.PI);
      if (this.flame[id] >= 0) {
        if (h > 6 && s > 3) {
          // buildings burn from the roof so the fire isn't hidden behind walls
          const w = s * 2.4;
          flames.set(this.flame[id], x, h * 0.8, z, w, Math.max(h * 0.45, s * 2.2) * (0.8 + inten * 0.6), 0.3 + inten * 0.8);
        } else {
          const w = Math.max(s * 2.2, h * 0.55);
          flames.set(this.flame[id], x, h * 0.1, z, w, h * (0.9 + inten * 0.7), 0.25 + inten * 0.85);
        }
      }
      const near = Math.abs(x - cx) < view * 1.4 && Math.abs(z - cz) < view * 1.4;
      if (near && this.emitBudget > 1) {
        const sc = Math.max(0.15, Math.min(8, h * 0.18 + s * 0.4));
        if (Math.random() < dt * (3 + sc * 1.5)) {
          fx.smoke(x, h * 0.9, z, sc * 1.1, 0.75);
          this.emitBudget -= 1;
        }
        if (Math.random() < dt * (4 + sc * 2)) {
          fx.ember(x, h * 0.4, z, sc * 0.6, 1);
          this.emitBudget -= 1;
        }
      }
      if (Math.random() < dt * 2) this.burnMap.add(x, z, Math.max(0.7, s * 1.8), 0.6 * t, 0.9);
    }

    for (let n = this.smolder.length - 1; n >= 0; n--) {
      const it = this.smolder[n];
      it[1] -= dt;
      const id = it[0];
      if (Math.random() < dt * 1.2 && this.emitBudget > 1) {
        const h = Math.max(0.2, this.height[id]);
        const x = this.x[id], z = this.z[id];
        if (Math.abs(x - cx) < view * 1.4 && Math.abs(z - cz) < view * 1.4) {
          fx.smoke(x, h * 0.4, z, Math.max(0.2, Math.min(6, h * 0.12 + this.size[id] * 0.3)), 0.9);
          this.emitBudget -= 1;
        }
      }
      if (it[1] <= 0) this.smolder.splice(n, 1);
    }

    // spread
    this.spreadAcc += dt;
    if (this.spreadAcc >= 0.25) {
      const step = this.spreadAcc;
      this.spreadAcc = 0;
      const chance = (SPREAD.chance[ctx.tier] || 0) * step * (ctx.spreadMul || 1);
      if (chance > 0 && this.spreadEnabled) {
        const snapshot = this.burning.slice();
        const w = ctx.wind;
        const ws = w ? w.s : 0;
        for (const id of snapshot) {
          if (this.isExplosive(id) || this.pulled[id]) continue;
          const base = SPREAD.range(Math.min(this.size[id], 6));
          const range = base * (1 + ws * 0.8);
          const power = Math.max(1.0, this.need[id] * 1.15);
          const x0 = this.x[id], z0 = this.z[id];
          this.query(x0, z0, range, (nid, d) => {
            if (this.state[nid] !== 0 || this.need[nid] > power) return;
            let c = chance;
            if (ws > 0) {
              // gales carry the fire downwind
              const dot = ((this.x[nid] - x0) * w.x + (this.z[nid] - z0) * w.z) / (d || 1);
              if (d > base * (1 + ws * 0.8 * Math.max(0, dot))) return;
              c *= Math.max(0.1, 1 + 2 * ws * dot);
            } else if (d > base + this.size[nid]) return;
            if (Math.random() < c) {
              if (ctx.rainAt && ctx.rainAt(this.x[nid], this.z[nid])) return;
              this.ignite(nid, 1);
            }
          });
          if (this.burning.length >= SPREAD.maxBurning) break;
        }
      }
    }

    // upload only the slice of each instance buffer that changed this frame
    const upload = (attr, lo, hi, size) => {
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * size, (hi - lo + 1) * size);
      attr.needsUpdate = true;
    };
    for (const g of this.groups) {
      if (g.hi < g.lo) continue;
      if (g.dirtyM) for (const p of g.parts) upload(p.mesh.instanceMatrix, g.lo, g.hi, 16);
      if (g.dirtyC) for (const p of g.parts) upload(p.mesh.instanceColor, g.lo, g.hi, 3);
      if (g.dirtyH) upload(g.heatAttr, g.lo, g.hi, 1);
      g.dirtyM = g.dirtyC = g.dirtyH = false;
      g.lo = Infinity;
      g.hi = -1;
    }
  }
}

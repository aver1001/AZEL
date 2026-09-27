// Tiny source-first modeling kit: low-poly primitives baked with vertex colors
// and merged, so each model is one readable function and one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Prepare a primitive: non-indexed (faceted), vertex-colored, transformed. */
export function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _m.compose(_v.set(...pos), _q, _s.set(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  if (typeof color === 'function') {
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) {
      _c.set(color(p.getX(i), p.getY(i), p.getZ(i), i));
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
  } else {
    _c.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Slight per-vertex color jitter so flat shading reads hand-made. */
export function jitter(base, amount = 0.06, seed = 1) {
  const c0 = new THREE.Color(base);
  const hsl = {};
  c0.getHSL(hsl);
  return (x, y, z) => {
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const r = h - Math.floor(h) - 0.5;
    return new THREE.Color().setHSL(hsl.h + r * amount * 0.2, hsl.s, THREE.MathUtils.clamp(hsl.l + r * amount, 0, 1));
  };
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
export const ico = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const sphere = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

/** Gable roof prism along x, ridge at +h. */
export function gable(w, h, d, overhang = 0.3) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const s = new THREE.Shape();
  s.moveTo(-hd, 0);
  s.lineTo(0, h);
  s.lineTo(hd, 0);
  s.lineTo(-hd, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: hw * 2, bevelEnabled: false });
  g.translate(0, 0, -hw);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Deterministic hash for placement variety. */
export function hash(n) {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

// Procedural low-poly models for every burnable in the world. Each builder
// returns its parts; a part's `burnt` mode says how it looks after the fire
// ('char' = blackened, 'vanish' = consumed, 'collapse' = sagging charred shell).
import * as THREE from 'three';
import { part, merge, jitter, box, cyl, cone, ico, sphere, gable } from './geo.js';

const P = (geometry, burnt = 'char', extra = {}) => ({ geometry, burnt, ...extra });

// ------------------------------------------------------------------ litter (T1)

function leaf() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.09);
  s.quadraticCurveTo(0.07, -0.02, 0, 0.1);
  s.quadraticCurveTo(-0.07, -0.02, 0, -0.09);
  const g = new THREE.ShapeGeometry(s, 3);
  g.rotateX(-Math.PI / 2);
  // a slight curl so leaves catch the light
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, 0.012 + Math.abs(p.getX(i)) * 0.35);
  return [P(merge([part(g, jitter(0xc98a3c, 0.12, 3))]), 'vanish')];
}

function grass() {
  const blades = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 0.18 + (i % 3) * 0.06;
    blades.push(part(cone(0.018, h, 3), i % 2 ? 0xd9c77a : 0xc2b865, [Math.cos(a) * 0.035, h / 2, Math.sin(a) * 0.035], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]));
  }
  return [P(merge(blades), 'vanish')];
}

function trash() {
  // crumpled wrapper + a paper cup on its side
  return [P(merge([
    part(ico(0.05, 0), 0xf2efe6, [0.04, 0.04, 0], [0.4, 0.2, 0], [1, 0.8, 1.1]),
    part(cyl(0.035, 0.028, 0.1, 7), 0xe9e4d8, [-0.05, 0.035, 0.02], [0, 0.4, Math.PI / 2]),
    part(cyl(0.036, 0.036, 0.02, 7), 0xd46a4f, [-0.1, 0.035, 0.0], [0, 0.4, Math.PI / 2]),
  ]), 'vanish')];
}

function twig() {
  return [P(merge([
    part(cyl(0.012, 0.016, 0.34, 4), 0x7a5a3c, [0, 0.015, 0], [0, 0, Math.PI / 2]),
    part(cyl(0.008, 0.01, 0.13, 4), 0x7a5a3c, [0.05, 0.03, 0.04], [0.6, 0.8, Math.PI / 2]),
  ]), 'vanish')];
}

function pinecone() {
  return [P(merge([part(ico(0.045, 0), 0x8a5e36, [0, 0.04, 0], [0, 0, 0], [0.8, 1.3, 0.8])]), 'vanish')];
}

function butt() {
  return [P(merge([
    part(cyl(0.008, 0.008, 0.05, 6), 0xf5f2ea, [0, 0.008, 0], [0, 0, Math.PI / 2]),
    part(cyl(0.0085, 0.0085, 0.022, 6), 0xe0a162, [0.035, 0.008, 0], [0, 0, Math.PI / 2]),
  ]), 'vanish')];
}

// ------------------------------------------------------------------ T2

function bush() {
  const c = jitter(0x6f9e4c, 0.1, 7);
  return [P(merge([
    part(ico(0.55, 1), c, [0, 0.42, 0], [0, 0, 0], [1, 0.8, 1]),
    part(ico(0.4, 1), c, [0.45, 0.3, 0.15], [0.3, 0, 0], [1, 0.8, 1]),
    part(ico(0.42, 1), c, [-0.42, 0.32, -0.1], [0, 0.5, 0], [1, 0.8, 1]),
  ]))];
}

function sapling() {
  return [
    P(merge([part(cyl(0.05, 0.08, 1.2, 5), 0x6b4a33, [0, 0.6, 0])])),
    P(merge([
      part(cone(0.55, 1.2, 7), jitter(0x4f8a45, 0.08, 2), [0, 1.5, 0]),
      part(cone(0.42, 0.9, 7), jitter(0x5c9a4e, 0.08, 3), [0, 2.0, 0]),
    ]), 'vanish', { canopy: true }),
  ];
}

function tent() {
  const s = new THREE.Shape();
  s.moveTo(-1.1, 0);
  s.lineTo(0, 1.35);
  s.lineTo(1.1, 0);
  s.lineTo(-1.1, 0);
  const body = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: false });
  body.translate(0, 0, -1.1);
  const door = new THREE.Shape();
  door.moveTo(-0.45, 0);
  door.lineTo(0, 0.75);
  door.lineTo(0.45, 0);
  door.lineTo(-0.45, 0);
  const dg = new THREE.ShapeGeometry(door);
  return [P(merge([
    part(body, (x, y, z) => (y > 1.2 ? 0xf5d36b : 0xe86f4f)),
    part(dg, 0x3b2c2a, [0, 0.01, 1.105]),
    part(box(2.5, 0.04, 2.6), 0x46505a, [0, 0.02, 0]),
  ]), 'collapse')];
}

function trashbin() {
  return [P(merge([
    part(cyl(0.34, 0.3, 0.85, 10), 0x4f8a64, [0, 0.43, 0]),
    part(cyl(0.37, 0.37, 0.08, 10), 0x3c6d4f, [0, 0.88, 0]),
    part(box(0.2, 0.05, 0.05), 0x2f3a33, [0, 0.95, 0]),
  ]))];
}

function picnic() {
  const w = 0x9c7250;
  return [P(merge([
    part(box(1.8, 0.08, 0.8), jitter(w, 0.05, 1), [0, 0.75, 0]),
    part(box(1.8, 0.06, 0.28), jitter(w, 0.05, 2), [0, 0.45, 0.65]),
    part(box(1.8, 0.06, 0.28), jitter(w, 0.05, 3), [0, 0.45, -0.65]),
    part(box(0.08, 0.8, 1.6), 0x7a563a, [0.7, 0.38, 0], [0.0, 0, 0]),
    part(box(0.08, 0.8, 1.6), 0x7a563a, [-0.7, 0.38, 0]),
  ]))];
}

function log() {
  return [P(merge([
    part(cyl(0.28, 0.32, 3.2, 7), (x, y, z) => (Math.abs(x) > 1.55 ? 0xc9a57a : 0x6d4d34), [0, 0.28, 0], [0, 0, Math.PI / 2]),
    part(cyl(0.07, 0.1, 0.9, 5), 0x6d4d34, [0.6, 0.55, 0.25], [0.5, 0, 0.3]),
    part(ico(0.18, 0), 0x5f8a45, [-0.9, 0.5, 0.15], [0, 0, 0], [1.2, 0.6, 1]),
  ]))];
}

function woodpile() {
  const logs = [];
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const x = (i - (3 - row) / 2) * 0.26;
      logs.push(part(cyl(0.12, 0.12, 1.1, 7), (px, py, pz) => (Math.abs(pz) > 0.52 ? 0xd9b98a : 0x7d5a3b), [x, 0.12 + row * 0.22, 0], [Math.PI / 2, 0, 0]));
      k++;
    }
  }
  return [P(merge(logs))];
}

// ------------------------------------------------------------------ T3 nature

function pine() {
  return [
    P(merge([part(cyl(0.18, 0.32, 3.2, 6), 0x6a4630, [0, 1.6, 0])])),
    P(merge([
      part(cone(2.3, 3.6, 7), jitter(0x2f6b45, 0.08, 1), [0, 3.6, 0]),
      part(cone(1.85, 3.2, 7), jitter(0x377a4c, 0.08, 2), [0, 5.3, 0], [0, 0.4, 0]),
      part(cone(1.3, 2.8, 7), jitter(0x3f8753, 0.08, 3), [0, 6.9, 0], [0, 0.8, 0]),
    ]), 'vanish', { canopy: true }),
  ];
}

function oak() {
  const c = jitter(0x5f9444, 0.1, 5);
  return [
    P(merge([
      part(cyl(0.3, 0.5, 3.4, 6), 0x5e4230, [0, 1.7, 0]),
      part(cyl(0.12, 0.2, 1.8, 5), 0x5e4230, [0.6, 3.3, 0], [0, 0, -0.7]),
      part(cyl(0.12, 0.2, 1.8, 5), 0x5e4230, [-0.5, 3.4, 0.2], [0.3, 0, 0.7]),
    ])),
    P(merge([
      part(ico(2.4, 1), c, [0, 5.2, 0], [0, 0, 0], [1, 0.8, 1]),
      part(ico(1.8, 1), c, [1.8, 4.5, 0.4], [0.3, 0.2, 0], [1, 0.8, 1]),
      part(ico(1.9, 1), c, [-1.7, 4.6, -0.3], [0, 0.6, 0], [1, 0.8, 1]),
      part(ico(1.6, 1), c, [0.2, 4.4, 1.7], [0, 1.2, 0], [1, 0.8, 1]),
    ]), 'vanish', { canopy: true }),
  ];
}

function haystack() {
  return [P(merge([
    part(cyl(1.1, 1.2, 1.3, 10), jitter(0xe0bf62, 0.06, 4), [0, 0.65, 0]),
    part(sphere(1.1, 10, 5), jitter(0xe8c96e, 0.06, 5), [0, 1.3, 0], [0, 0, 0], [1, 0.7, 1]),
  ]))];
}

function car(color = 0xffffff) {
  const wheel = (x, z) => part(cyl(0.36, 0.36, 0.26, 10), 0x26262a, [x, 0.36, z], [Math.PI / 2, 0, 0]);
  return [P(merge([
    part(box(4.2, 0.8, 1.8), color, [0, 0.72, 0]),
    part(box(2.3, 0.62, 1.6), color, [-0.2, 1.4, 0]),
    part(box(2.34, 0.44, 1.64), 0x2a3440, [-0.2, 1.43, 0]),
    part(box(0.1, 0.18, 1.3), 0xfff2b0, [2.11, 0.82, 0]),
    part(box(0.1, 0.16, 1.3), 0xd8483f, [-2.11, 0.82, 0]),
    wheel(1.35, 0.85), wheel(1.35, -0.85), wheel(-1.35, 0.85), wheel(-1.35, -0.85),
  ]))];
}

// ------------------------------------------------------------------ buildings

function cabin() {
  return [P(merge([
    part(box(5, 2.8, 4), (x, y, z) => (Math.floor((y + 10) / 0.35) % 2 ? 0x8a5f3f : 0x7b5236), [0, 1.4, 0]),
    part(gable(5, 1.8, 4, 0.45), 0x4b3b36, [0, 2.8, 0]),
    part(box(0.6, 1.4, 0.6), 0x8d8a86, [1.4, 3.8, -0.8]),
    part(box(1, 1.8, 0.08), 0x4a3223, [0, 0.9, 2.02]),
    part(box(0.8, 0.7, 0.08), 0xffd98a, [-1.6, 1.6, 2.02]),
    part(box(0.8, 0.7, 0.08), 0xffd98a, [1.6, 1.6, 2.02]),
  ]), 'collapse')];
}

function barn() {
  const red = 0xb2443a;
  const s = new THREE.Shape();
  s.moveTo(-3.4, 0);
  s.lineTo(-3.4, 1.4);
  s.lineTo(-1.6, 3.0);
  s.lineTo(1.6, 3.0);
  s.lineTo(3.4, 1.4);
  s.lineTo(3.4, 0);
  s.lineTo(-3.4, 0);
  const roof = new THREE.ExtrudeGeometry(s, { depth: 9.4, bevelEnabled: false });
  roof.translate(0, 0, -4.7);
  roof.rotateY(Math.PI / 2);
  return [P(merge([
    part(box(9, 3.8, 6.4), red, [0, 1.9, 0]),
    part(roof, 0x5a4a48, [0, 3.8, 0]),
    part(box(2.6, 3, 0.1), 0xf1ece2, [0, 1.5, 3.21]),
    part(box(2.2, 2.6, 0.12), red, [0, 1.4, 3.23]),
  ]), 'collapse')];
}

const HOUSE_WALLS = [0xf1e6d2, 0xdfe8ee, 0xf2dcd2, 0xe3ecd9, 0xf4efe4, 0xe8e0f0];
const HOUSE_ROOFS = [0x7a4b3f, 0x3f5a73, 0x5d6b52, 0x8a5a3a, 0x4d4b57];

function house(variant = 0) {
  const wall = HOUSE_WALLS[variant % HOUSE_WALLS.length];
  const roof = HOUSE_ROOFS[variant % HOUSE_ROOFS.length];
  const two = variant % 3 === 0;
  const h = two ? 5.4 : 3.2;
  const parts = [
    part(box(7, h, 6), wall, [0, h / 2, 0]),
    part(gable(7, 2.6, 6, 0.5), roof, [0, h, 0]),
    part(box(1.1, 2.1, 0.1), 0x6b4a36, [-1.5, 1.05, 3.02]),
    part(box(1.4, 1.0, 0.1), 0x9cc4dc, [1.6, 1.7, 3.02]),
    part(box(1.4, 1.0, 0.1), 0x9cc4dc, [-1.6, h - 1.2, -3.02]),
    part(box(0.8, 1.6, 0.8), 0x8d8a86, [2.2, h + 1.8, 0.8]),
  ];
  if (two) parts.push(part(box(1.4, 1.0, 0.1), 0x9cc4dc, [1.6, 4.1, 3.02]), part(box(1.4, 1.0, 0.1), 0x9cc4dc, [-1.6, 4.1, 3.02]));
  return [P(merge(parts), 'collapse')];
}

// City buildings are unit boxes scaled per instance; windows come from the
// building shader, so the geometry stays trivial.
function bldg() {
  const g = box(1, 1, 1);
  g.translate(0, 0.5, 0);
  const roof = box(0.16, 0.035, 0.12);
  roof.translate(0.2, 1.017, -0.18);
  const rim = box(1.0, 0.012, 1.0);
  rim.translate(0, 1.006, 0);
  return [P(merge([part(g, 0xffffff), part(rim, 0xb8bcc2), part(roof, 0xa7abb2)]), 'collapse', { building: true })];
}

function tower() {
  return [P(merge([
    part(cyl(2.4, 4.2, 70, 10), 0xdcdfe6, [0, 35, 0]),
    part(cyl(7.5, 6.2, 7, 14), 0xb9c6d6, [0, 72, 0]),
    part(cyl(6.2, 7.5, 3, 14), 0x8ea3bd, [0, 77, 0]),
    part(cyl(1.2, 2.2, 8, 8), 0xf0f0f0, [0, 82, 0]),
    part(cyl(0.3, 0.6, 22, 6), 0xd94a3f, [0, 97, 0]),
    part(box(20, 4, 20), 0x9aa0a8, [0, 2, 0]),
  ]), 'collapse')];
}

function cityhall() {
  return [P(merge([
    part(box(44, 16, 26), 0xe9e5dc, [0, 8, 0]),
    part(box(46, 2, 28), 0xc9c3b6, [0, 16.5, 0]),
    part(cyl(7, 7, 6, 16), 0xe0dbcf, [0, 20, 0]),
    part(sphere(7, 16, 8), 0x8fb2a6, [0, 23, 0], [0, 0, 0], [1, 0.8, 1]),
    part(box(12, 10, 1), 0x9ab8cc, [0, 6, 13.1]),
    ...[-16, -8, 8, 16].map((x) => part(cyl(0.9, 0.9, 14, 8), 0xf5f2ea, [x, 7, 13.6])),
  ]), 'collapse')];
}

function dome() {
  return [P(merge([
    part(cyl(34, 36, 12, 32), 0xd7dce3, [0, 6, 0]),
    part(sphere(33, 32, 10), 0xeef2f6, [0, 12, 0], [0, 0, 0], [1, 0.38, 1]),
    part(cyl(34.5, 34.5, 1.2, 32), 0x5b7fa6, [0, 11.5, 0]),
  ]), 'collapse')];
}

// ------------------------------------------------------------------ explosives

function gascan() {
  const tank = (x, z, c) => [
    part(cyl(0.18, 0.18, 0.62, 10), c, [x, 0.36, z]),
    part(sphere(0.18, 10, 5), c, [x, 0.67, z], [0, 0, 0], [1, 0.6, 1]),
    part(cyl(0.05, 0.05, 0.12, 6), 0x9aa0a8, [x, 0.8, z]),
  ];
  return [P(merge([...tank(0, 0, 0xe5752f), ...tank(0.4, 0.1, 0xe5752f), ...tank(0.2, -0.36, 0x9ab4c8)]), 'vanish')];
}

function waste() {
  const drum = (x, z, c, tip = 0) => [
    part(cyl(0.3, 0.3, 0.9, 10), c, [x, 0.45, z], [tip, 0, 0]),
    part(cyl(0.31, 0.31, 0.05, 10), 0x2e2e2e, [x, 0.6, z], [tip, 0, 0]),
  ];
  return [P(merge([
    ...drum(0, 0, 0x2f5fa6), ...drum(0.66, 0.1, 0xe0c037), ...drum(0.3, -0.62, 0x2f5fa6),
    ...drum(-0.7, 0.3, 0x5a6b45, 0.2),
    part(box(1.3, 0.35, 0.9), 0x6e6a60, [-0.4, 0.18, -0.8]),
    part(ico(0.5, 0), 0x3b3f3a, [0.9, 0.2, -0.7], [0, 0, 0], [1.3, 0.5, 1]),
  ]), 'vanish')];
}

function pylon() {
  const steel = 0x9aa3ad;
  const legs = [];
  const H = 24;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const b = new THREE.Vector3(sx * 2.6, 0, sz * 2.6);
    const t = new THREE.Vector3(sx * 0.6, H, sz * 0.6);
    const len = b.distanceTo(t);
    const mid = b.clone().add(t).multiplyScalar(0.5);
    const g = cyl(0.12, 0.16, len, 4);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().sub(b).normalize());
    g.applyQuaternion(q);
    legs.push(part(g, steel, [mid.x, mid.y, mid.z]));
  }
  for (let i = 1; i < 6; i++) {
    const y = (i / 6) * H;
    const w = 5.2 - (i / 6) * 4;
    legs.push(part(box(w, 0.12, 0.12), steel, [0, y, w / 2]));
    legs.push(part(box(w, 0.12, 0.12), steel, [0, y, -w / 2]));
    legs.push(part(box(0.12, 0.12, w), steel, [w / 2, y, 0]));
    legs.push(part(box(0.12, 0.12, w), steel, [-w / 2, y, 0]));
  }
  for (const y of [H * 0.7, H * 0.88]) legs.push(part(box(9, 0.3, 0.4), steel, [0, y, 0]));
  legs.push(part(box(0.4, 3, 0.4), steel, [0, H + 1.4, 0]));
  for (const x of [-4.2, 4.2]) for (const y of [H * 0.7, H * 0.88]) legs.push(part(cyl(0.12, 0.12, 1.2, 5), 0xd8dde3, [x, y - 0.6, 0]));
  return [P(merge(legs))];
}

function station() {
  const parts = [
    part(box(18, 0.8, 11), 0xf2f2f2, [0, 5.4, 0]),
    part(box(18.2, 0.5, 11.2), 0x2f8a4f, [0, 5.0, 0]),
    part(box(9, 4, 6), 0xe9e6de, [0, 2, -9]),
    part(box(9.2, 0.6, 6.2), 0x2f8a4f, [0, 4.2, -9]),
    part(box(1.2, 8, 0.5), 0x2f8a4f, [9.5, 4, 5]),
    part(box(3, 2, 0.6), 0xffd23f, [9.5, 8.6, 5]),
  ];
  for (const x of [-5, 0, 5]) {
    parts.push(part(box(0.9, 1.6, 0.6), 0xd94a3f, [x, 0.8, 0]));
    parts.push(part(cyl(0.3, 0.3, 5, 6), 0xdadada, [x, 2.5, 3.2]));
    parts.push(part(cyl(0.3, 0.3, 5, 6), 0xdadada, [x, 2.5, -3.2]));
  }
  return [P(merge(parts), 'collapse')];
}

function tanker() {
  const parts = [];
  for (const [x, z] of [[-7, 0], [7, 0]]) {
    parts.push(part(cyl(6, 6, 9, 20), 0xe9ecef, [x, 4.5, z]));
    parts.push(part(cyl(6.05, 6.05, 0.6, 20), 0xd94a3f, [x, 7.2, z]));
    parts.push(part(sphere(6, 20, 5), 0xdfe3e7, [x, 9, z], [0, 0, 0], [1, 0.18, 1]));
  }
  parts.push(part(box(20, 0.4, 3), 0x8d949b, [0, 9.8, 0]));
  return [P(merge(parts), 'collapse')];
}

// ------------------------------------------------------------------ registry

export const BUILDERS = {
  leaf, grass, trash, twig, pinecone, butt,
  bush, sapling, tent, trashbin, picnic, woodpile, log,
  pine, oak, haystack, car: () => car(0xffffff), cabin, barn,
  house: () => house(0), house1: () => house(1), house2: () => house(2), house3: () => house(3), house4: () => house(4), house5: () => house(5),
  bldgS: bldg, bldgM: bldg, bldgL: bldg, tower, cityhall, dome,
  gascan, waste, pylon, station, tanker,
};

export const CAR_COLORS = [0xd94a3f, 0x3a6fb0, 0xf2f2f2, 0x2d2d33, 0xe5c24a, 0x8a9aa8, 0x3f8a5c];

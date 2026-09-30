// Rigged, skinned creatures. Every rig is data: a joint list (name, parent,
// offset) whose rest rotations are all identity — a BVH-style skeleton in
// the canonical rest pose UniMate expects (humans in T-pose, animals
// standing, everyone facing +Z) — plus low-poly parts bound rigidly to one
// joint each. Joint names follow the Mixamo / Truebones conventions UniMate
// was trained on, so generated motions map onto these bones by name.
// UniMate stores each joint's rotation on its children, so every bone that
// carries geometry and should turn (heads, ear/tail/wing tips) ends in an
// explicit End joint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, box, cyl, cone, ico, sphere } from './geo.js';

const SKIN = 0xe8bd98;
const HAIR = 0x3a2a22;

// ------------------------------------------------------------------ helpers

/** Cylinder spanning two rest-space points (a limb segment). */
function limb(a, b, r0, r1, color, seg = 7) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = cyl(r1, r0, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  return part(g, color, [mid.x, mid.y, mid.z]);
}

const ball = (p, r, color) => part(sphere(r, 8, 6), color, p);
const blob = (p, s, color, detail = 1) => part(ico(1, detail), color, p, [0, 0, 0], s);

function mirrorJoints(list) {
  const out = [];
  for (const j of list) {
    out.push(j);
    const [name, parent, off] = j;
    const m = name.match(/^(Left|L_)(.*)$/);
    if (!m) continue;
    const other = m[1] === 'Left' ? 'Right' : 'R_';
    const pm = parent && parent.match(/^(Left|L_)(.*)$/);
    const par = pm ? (pm[1] === 'Left' ? 'Right' : 'R_') + pm[2] : parent;
    out.push([other + m[2], par, [-off[0], off[1], off[2]]]);
  }
  return out;
}

/** mirror a part spec across X for the right side */
const R = (p) => [-p[0], p[1], p[2]];

// ------------------------------------------------------------------ rig specs

function humanSpec({ shirt = 0x4f7fb8, pants = 0x3b4254, shoes = 0x2a2624, firefighter = false } = {}) {
  const joints = mirrorJoints([
    ['Hips', null, [0, 0.95, 0]],
    ['Spine', 'Hips', [0, 0.1, 0]],
    ['Spine1', 'Spine', [0, 0.12, 0]],
    ['Spine2', 'Spine1', [0, 0.12, 0]],
    ['Neck', 'Spine2', [0, 0.15, 0]],
    ['Head', 'Neck', [0, 0.1, 0]],
    ['HeadTop_End', 'Head', [0, 0.2, 0]],
    ['LeftShoulder', 'Spine2', [0.07, 0.1, 0]],
    ['LeftArm', 'LeftShoulder', [0.12, 0, 0]],
    ['LeftForeArm', 'LeftArm', [0.27, 0, 0]],
    ['LeftHand', 'LeftForeArm', [0.25, 0, 0]],
    ['LeftUpLeg', 'Hips', [0.1, -0.05, 0]],
    ['LeftLeg', 'LeftUpLeg', [0, -0.42, 0]],
    ['LeftFoot', 'LeftLeg', [0, -0.4, 0]],
    ['LeftToeBase', 'LeftFoot', [0, -0.05, 0.12]],
  ]);
  const coat = firefighter ? 0x2d2a28 : shirt;
  const sleeve = firefighter ? 0x2d2a28 : shirt;
  const stripe = 0xd7e84a;
  const parts = [
    ['Hips', blob([0, 0.95, 0], [0.17, 0.1, 0.11], firefighter ? coat : pants)],
    ['Spine', limb([0, 0.98, 0], [0, 1.18, 0], 0.15, 0.155, coat)],
    ['Spine1', limb([0, 1.16, 0], [0, 1.26, 0], 0.155, 0.17, coat)],
    ['Spine2', blob([0, 1.31, 0], [0.2, 0.14, 0.13], coat)],
    ['Neck', limb([0, 1.42, 0], [0, 1.52, 0], 0.05, 0.05, SKIN, 6)],
    ['Head', blob([0, 1.62, 0.01], [0.105, 0.125, 0.11], SKIN)],
  ];
  if (firefighter) {
    parts.push(
      ['Spine', limb([0, 1.04, 0], [0, 1.08, 0], 0.165, 0.165, stripe)],
      ['Spine2', limb([0, 1.28, 0], [0, 1.32, 0], 0.205, 0.205, stripe)],
      ['Head', blob([0, 1.69, 0.0], [0.15, 0.08, 0.17], 0xd1302a)],
      ['Head', limb([0, 1.64, 0], [0, 1.66, 0], 0.19, 0.19, 0xd1302a, 10)],
    );
  } else {
    parts.push(['Head', blob([0, 1.67, -0.015], [0.11, 0.09, 0.115], HAIR)]);
  }
  for (const s of [1, -1]) {
    const L = s > 0 ? 'Left' : 'Right';
    const x = (v) => v * s;
    parts.push(
      [`${L}Shoulder`, ball([x(0.15), 1.39, 0], 0.07, sleeve)],
      [`${L}Arm`, limb([x(0.19), 1.39, 0], [x(0.46), 1.39, 0], 0.055, 0.05, sleeve)],
      [`${L}ForeArm`, limb([x(0.46), 1.39, 0], [x(0.7), 1.39, 0], 0.048, 0.04, firefighter ? coat : SKIN)],
      [`${L}ForeArm`, ball([x(0.46), 1.39, 0], 0.05, sleeve)],
      [`${L}Hand`, blob([x(0.75), 1.39, 0], [0.05, 0.035, 0.045], firefighter ? 0xc9a36a : SKIN, 0)],
      [`${L}UpLeg`, limb([x(0.1), 0.9, 0], [x(0.1), 0.48, 0], 0.075, 0.06, pants)],
      [`${L}Leg`, ball([x(0.1), 0.48, 0], 0.06, pants)],
      [`${L}Leg`, limb([x(0.1), 0.48, 0], [x(0.1), 0.09, 0], 0.058, 0.048, firefighter ? coat : pants)],
      [`${L}Foot`, part(box(0.1, 0.07, 0.2), shoes, [x(0.1), 0.04, 0.05])],
    );
    if (firefighter) parts.push([`${L}Leg`, limb([x(0.1), 0.26, 0], [x(0.1), 0.3, 0], 0.062, 0.062, stripe)]);
  }
  if (firefighter) {
    // extinguisher in the right hand, nozzle along the arm (points ahead when the arm is raised forward)
    parts.push(
      ['RightHand', limb([-0.78, 1.31, 0.02], [-0.78, 1.47, 0.02], 0.07, 0.07, 0xd1302a, 8)],
      ['RightHand', limb([-0.78, 1.5, 0.02], [-0.95, 1.5, 0.02], 0.018, 0.018, 0x222222, 5)],
    );
  }
  return { name: firefighter ? 'firefighter' : 'human', kind: 'biped', joints, parts, face: ['RightUpLeg', 'LeftUpLeg'] };
}

function rabbitSpec({ fur = 0xece6dc, belly = 0xf6f2ea } = {}) {
  const joints = mirrorJoints([
    ['Hips', null, [0, 0.16, -0.08]],
    ['Spine', 'Hips', [0, 0.02, 0.08]],
    ['Spine1', 'Spine', [0, 0, 0.07]],
    ['Neck', 'Spine1', [0, 0.06, 0.05]],
    ['Head', 'Neck', [0, 0.03, 0.03]],
    ['L_Ear', 'Head', [0.025, 0.05, -0.02]],
    ['L_Ear1', 'L_Ear', [0.005, 0.07, -0.01]],
    ['L_EarEnd', 'L_Ear1', [0.003, 0.06, -0.01]],
    ['Tail', 'Hips', [0, 0.02, -0.07]],
    ['L_Thigh', 'Hips', [0.05, -0.02, -0.01]],
    ['L_Shin', 'L_Thigh', [0, -0.07, 0.04]],
    ['L_Foot', 'L_Shin', [0, -0.065, -0.03]],
    ['L_Toe', 'L_Foot', [0, -0.005, 0.08]],
    ['L_Upperarm', 'Spine1', [0.04, -0.06, 0.02]],
    ['L_Forearm', 'L_Upperarm', [0, -0.05, 0.01]],
    ['L_Hand', 'L_Forearm', [0, -0.04, 0.005]],
  ]);
  const parts = [
    ['Hips', blob([0, 0.17, -0.07], [0.105, 0.1, 0.11], fur)],
    ['Spine', blob([0, 0.18, 0.01], [0.09, 0.085, 0.09], fur)],
    ['Spine1', blob([0, 0.19, 0.07], [0.075, 0.08, 0.07], belly)],
    ['Head', blob([0, 0.28, 0.18], [0.06, 0.055, 0.07], fur)],
    ['Head', ball([0, 0.265, 0.245], 0.014, 0xe9a0a8)],
    ['Head', ball([0.035, 0.29, 0.21], 0.011, 0x1a1a1a)],
    ['Head', ball([-0.035, 0.29, 0.21], 0.011, 0x1a1a1a)],
    ['Tail', ball([0, 0.19, -0.16], 0.035, 0xffffff)],
  ];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L_' : 'R_';
    const x = (v) => v * s;
    parts.push(
      [`${L}Ear`, limb([x(0.027), 0.31, 0.155], [x(0.032), 0.38, 0.145], 0.016, 0.022, fur, 6)],
      [`${L}Ear1`, limb([x(0.032), 0.38, 0.145], [x(0.035), 0.44, 0.135], 0.022, 0.012, fur, 6)],
      [`${L}Thigh`, blob([x(0.055), 0.13, -0.08], [0.04, 0.06, 0.06], fur)],
      [`${L}Shin`, limb([x(0.05), 0.07, -0.05], [x(0.05), 0.02, -0.07], 0.018, 0.016, fur, 5)],
      [`${L}Foot`, blob([x(0.05), 0.014, -0.02], [0.026, 0.014, 0.065], belly, 0)],
      [`${L}Upperarm`, limb([x(0.04), 0.13, 0.09], [x(0.04), 0.08, 0.1], 0.024, 0.021, fur, 6)],
      [`${L}Forearm`, limb([x(0.04), 0.08, 0.1], [x(0.04), 0.03, 0.11], 0.02, 0.018, belly, 6)],
      [`${L}Hand`, blob([x(0.04), 0.015, 0.12], [0.02, 0.012, 0.028], belly, 0)],
    );
  }
  return { name: 'rabbit', kind: 'quadruped', joints, parts, face: ['R_Thigh', 'L_Thigh'] };
}

function squirrelSpec() {
  const fur = 0xb0643a, light = 0xe4b98a;
  const joints = mirrorJoints([
    ['Hips', null, [0, 0.1, -0.05]],
    ['Spine', 'Hips', [0, 0.015, 0.05]],
    ['Spine1', 'Spine', [0, 0.01, 0.05]],
    ['Neck', 'Spine1', [0, 0.03, 0.03]],
    ['Head', 'Neck', [0, 0.02, 0.025]],
    ['HeadEnd', 'Head', [0, 0.01, 0.06]],
    ['Tail', 'Hips', [0, 0.02, -0.05]],
    ['Tail1', 'Tail', [0, 0.07, -0.04]],
    ['Tail2', 'Tail1', [0, 0.08, 0.0]],
    ['TailEnd', 'Tail2', [0, 0.06, 0.02]],
    ['L_Thigh', 'Hips', [0.035, -0.02, 0]],
    ['L_Shin', 'L_Thigh', [0, -0.045, 0.02]],
    ['L_Foot', 'L_Shin', [0, -0.03, 0.0]],
    ['L_Upperarm', 'Spine1', [0.03, -0.03, 0.01]],
    ['L_Forearm', 'L_Upperarm', [0, -0.04, 0.005]],
  ]);
  const parts = [
    ['Hips', blob([0, 0.105, -0.04], [0.06, 0.06, 0.07], fur)],
    ['Spine', blob([0, 0.115, 0.01], [0.055, 0.055, 0.06], fur)],
    ['Spine1', blob([0, 0.125, 0.05], [0.045, 0.05, 0.045], light)],
    ['Head', blob([0, 0.17, 0.1], [0.04, 0.038, 0.048], fur)],
    ['Head', ball([0.025, 0.18, 0.125], 0.008, 0x151515)],
    ['Head', ball([-0.025, 0.18, 0.125], 0.008, 0x151515)],
    ['Head', part(cone(0.012, 0.03, 4), fur, [0.022, 0.21, 0.09])],
    ['Head', part(cone(0.012, 0.03, 4), fur, [-0.022, 0.21, 0.09])],
    ['Tail', blob([0, 0.16, -0.12], [0.04, 0.06, 0.04], 0xc87d4f)],
    ['Tail1', blob([0, 0.24, -0.13], [0.05, 0.06, 0.045], 0xc87d4f)],
    ['Tail2', blob([0, 0.31, -0.11], [0.045, 0.05, 0.04], 0xd89060)],
  ];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L_' : 'R_';
    const x = (v) => v * s;
    parts.push(
      [`${L}Thigh`, blob([x(0.035), 0.08, -0.05], [0.025, 0.035, 0.04], fur)],
      [`${L}Shin`, limb([x(0.035), 0.055, -0.03], [x(0.035), 0.01, -0.03], 0.012, 0.01, fur, 5)],
      [`${L}Foot`, blob([x(0.035), 0.008, -0.01], [0.014, 0.008, 0.03], fur, 0)],
      [`${L}Upperarm`, limb([x(0.03), 0.1, 0.06], [x(0.03), 0.06, 0.065], 0.011, 0.01, light, 5)],
      [`${L}Forearm`, limb([x(0.03), 0.06, 0.065], [x(0.03), 0.01, 0.07], 0.01, 0.009, light, 5)],
    );
  }
  return { name: 'squirrel', kind: 'quadruped', joints, parts, face: ['R_Thigh', 'L_Thigh'] };
}

function deerSpec() {
  const coat = 0xa4703f, pale = 0xe8d6b8, dark = 0x3a2a20;
  const joints = mirrorJoints([
    ['Hips', null, [0, 0.95, -0.38]],
    ['Spine', 'Hips', [0, 0.02, 0.34]],
    ['Spine1', 'Spine', [0, 0.02, 0.34]],
    ['Neck', 'Spine1', [0, 0.24, 0.12]],
    ['Head', 'Neck', [0, 0.2, 0.08]],
    ['L_Ear', 'Head', [0.07, 0.06, -0.03]],
    ['Tail', 'Hips', [0, 0.05, -0.12]],
    ['TailEnd', 'Tail', [0, 0.0, -0.1]],
    ['L_Thigh', 'Hips', [0.12, -0.08, 0]],
    ['L_Shin', 'L_Thigh', [0, -0.36, -0.06]],
    ['L_Foot', 'L_Shin', [0, -0.4, 0.03]],
    ['L_Toe', 'L_Foot', [0, -0.09, 0.03]],
    ['L_Upperarm', 'Spine1', [0.12, -0.1, 0.02]],
    ['L_Forearm', 'L_Upperarm', [0, -0.38, 0]],
    ['L_Hand', 'L_Forearm', [0, -0.4, 0.01]],
    ['L_Finger', 'L_Hand', [0, -0.08, 0.02]],
  ]);
  const parts = [
    ['Hips', blob([0, 0.97, -0.34], [0.2, 0.21, 0.3], coat)],
    ['Spine', blob([0, 0.97, 0.0], [0.19, 0.2, 0.3], coat)],
    ['Spine', blob([0, 0.86, 0.0], [0.15, 0.08, 0.2], pale)],
    ['Spine1', blob([0, 1.0, 0.3], [0.19, 0.21, 0.2], coat)],
    ['Neck', limb([0, 1.08, 0.36], [0, 1.39, 0.48], 0.1, 0.075, coat)],
    ['Head', blob([0, 1.45, 0.54], [0.08, 0.085, 0.11], coat)],
    ['Head', blob([0, 1.41, 0.66], [0.05, 0.05, 0.07], pale)],
    ['Head', ball([0, 1.42, 0.72], 0.022, dark)],
    ['Tail', blob([0, 1.02, -0.52], [0.05, 0.07, 0.04], pale)],
  ];
  // antlers
  for (const s of [1, -1]) {
    const x = (v) => v * s;
    parts.push(
      ['Head', limb([x(0.04), 1.52, 0.52], [x(0.12), 1.72, 0.46], 0.014, 0.01, 0xd9c7a0, 5)],
      ['Head', limb([x(0.1), 1.66, 0.48], [x(0.2), 1.74, 0.54], 0.01, 0.007, 0xd9c7a0, 5)],
      ['Head', limb([x(0.07), 1.6, 0.5], [x(0.03), 1.72, 0.58], 0.01, 0.007, 0xd9c7a0, 5)],
    );
  }
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L_' : 'R_';
    const x = (v) => v * s;
    parts.push(
      [`${L}Ear`, blob([x(0.1), 1.52, 0.5], [0.05, 0.025, 0.02], coat, 0)],
      [`${L}Thigh`, blob([x(0.12), 0.8, -0.4], [0.07, 0.16, 0.11], coat)],
      [`${L}Shin`, limb([x(0.12), 0.51, -0.44], [x(0.12), 0.12, -0.41], 0.035, 0.028, coat, 6)],
      [`${L}Foot`, limb([x(0.12), 0.12, -0.41], [x(0.12), 0.03, -0.38], 0.028, 0.025, dark, 6)],
      [`${L}Upperarm`, limb([x(0.12), 0.9, 0.32], [x(0.12), 0.51, 0.32], 0.05, 0.035, coat, 6)],
      [`${L}Forearm`, limb([x(0.12), 0.51, 0.32], [x(0.12), 0.11, 0.33], 0.032, 0.026, coat, 6)],
      [`${L}Hand`, limb([x(0.12), 0.11, 0.33], [x(0.12), 0.02, 0.35], 0.026, 0.024, dark, 6)],
    );
  }
  return { name: 'deer', kind: 'quadruped', joints, parts, face: ['R_Thigh', 'L_Thigh'] };
}

function birdSpec() {
  const body = 0x6b5a4a, wing = 0x4a3f36, breast = 0xd8a070;
  const joints = mirrorJoints([
    ['Hips', null, [0, 0.1, 0]],
    ['Spine', 'Hips', [0, 0.01, 0.04]],
    ['Neck', 'Spine', [0, 0.03, 0.025]],
    ['Head', 'Neck', [0, 0.02, 0.015]],
    ['HeadEnd', 'Head', [0, 0, 0.04]],
    ['Tail', 'Hips', [0, 0.005, -0.06]],
    ['TailEnd', 'Tail', [0, 0, -0.07]],
    ['L_Wing', 'Spine', [0.03, 0.015, 0]],
    ['L_Wing1', 'L_Wing', [0.07, 0, 0]],
    ['L_Wing2', 'L_Wing1', [0.07, 0, 0]],
    ['L_WingTip', 'L_Wing2', [0.06, 0, 0]],
    ['L_Thigh', 'Hips', [0.015, -0.03, 0]],
    ['L_Foot', 'L_Thigh', [0, -0.04, 0.01]],
  ]);
  const parts = [
    ['Hips', blob([0, 0.1, -0.01], [0.035, 0.035, 0.055], body)],
    ['Spine', blob([0, 0.11, 0.04], [0.032, 0.035, 0.035], breast)],
    ['Head', blob([0, 0.15, 0.07], [0.024, 0.024, 0.026], body)],
    ['Head', part(cone(0.008, 0.03, 4), 0xe0b030, [0, 0.148, 0.1], [Math.PI / 2, 0, 0])],
    ['Tail', part(box(0.05, 0.006, 0.07), wing, [0, 0.105, -0.09])],
  ];
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L_' : 'R_';
    const x = (v) => v * s;
    parts.push(
      [`${L}Wing`, part(box(0.07, 0.008, 0.06), wing, [x(0.065), 0.125, 0.035])],
      [`${L}Wing1`, part(box(0.07, 0.006, 0.05), wing, [x(0.135), 0.125, 0.03])],
      [`${L}Wing2`, part(box(0.06, 0.005, 0.035), body, [x(0.195), 0.125, 0.025])],
      [`${L}Foot`, limb([x(0.015), 0.07, 0], [x(0.015), 0.03, 0.01], 0.004, 0.004, 0xd0a060, 4)],
    );
  }
  return { name: 'bird', kind: 'bird', joints, parts, face: ['R_Thigh', 'L_Thigh'] };
}

export const RIG_SPECS = {
  human: humanSpec,
  firefighter: () => humanSpec({ firefighter: true }),
  rabbit: rabbitSpec,
  squirrel: squirrelSpec,
  deer: deerSpec,
  bird: birdSpec,
};

// ------------------------------------------------------------------ building

/** Resolve rest-space joint positions from the offset chain. */
export function restPositions(spec) {
  const index = new Map(spec.joints.map((j, i) => [j[0], i]));
  const pos = spec.joints.map(() => new THREE.Vector3());
  spec.joints.forEach(([name, parent, off], i) => {
    const p = parent ? pos[index.get(parent)] : new THREE.Vector3();
    pos[i].copy(p).add(new THREE.Vector3(...off));
  });
  return { index, pos, parents: spec.joints.map(([, p]) => (p ? index.get(p) : -1)) };
}

const geoCache = new Map();

/** One merged, skinned geometry per rig + variant (shared by every instance). */
export function rigGeometry(key, spec) {
  if (geoCache.has(key)) return geoCache.get(key);
  const { index } = restPositions(spec);
  const geos = spec.parts.map(([bone, g]) => {
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const b = index.get(bone);
    if (b === undefined) throw new Error(`${spec.name}: part bound to unknown joint ${bone}`);
    for (let i = 0; i < n; i++) {
      si[i * 4] = b;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  });
  const geo = mergeGeometries(geos);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geoCache.set(key, geo);
  return geo;
}

const material = new THREE.MeshLambertMaterial({ vertexColors: true });

/**
 * A fresh skinned instance: its own bones and skeleton, shared geometry.
 * Returns { object, mesh, bones, spec }.
 */
export function createRigInstance(type, variant = {}) {
  const key = `${type}:${JSON.stringify(variant)}`;
  const spec = type === 'human' ? humanSpec(variant) : RIG_SPECS[type]();
  const geo = rigGeometry(key, spec);
  const { parents } = restPositions(spec);
  const bones = spec.joints.map(([name]) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  spec.joints.forEach(([, parent, off], i) => {
    bones[i].position.set(...off);
    if (parents[i] >= 0) bones[parents[i]].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  const object = new THREE.Group();
  object.add(mesh);
  return { object, mesh, bones, spec };
}

/** Plain-data export of a rig (for the UniMate bridge tools). */
export function rigData(type, variant = {}) {
  const spec = type === 'human' ? humanSpec(variant) : RIG_SPECS[type]();
  const { pos, parents } = restPositions(spec);
  return {
    name: spec.name,
    kind: spec.kind,
    joints: spec.joints.map(([n]) => n),
    parents,
    offsets: spec.joints.map(([, , o]) => o),
    restPositions: pos.map((p) => [p.x, p.y, p.z]),
    face: spec.face,
  };
}

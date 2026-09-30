// Motion clips as plain data, and a small animator that plays them on rigs.
//
// Clip data (shared by the procedural clips and the UniMate converter):
//   { name, rig, fps, frames, loop, speed, source, prompt?,
//     joints: [name…],            // order of the rotation block
//     rot:  [x,y,z,w, …],         // frames × joints local rotations (rest = identity)
//     root: [x,y,z, …] }          // frames × Hips local position
// `speed` is the ground speed (m/s) the cycle was authored or generated at;
// root XZ travel is stripped because the game steers agents itself.
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Bake a pose function into clip data. pose(phase 0..1) → { rot: {joint:[x,y,z]}, root:[dx,dy,dz] }. */
export function bake(rig, name, { period, fps = 30, loop = true, speed = 0, pose }) {
  const frames = Math.max(2, Math.round(period * fps));
  const J = rig.joints.length;
  const rot = new Array(frames * J * 4);
  const root = new Array(frames * 3);
  const rest = rig.offsets[0];
  for (let f = 0; f < frames; f++) {
    const p = pose(f / frames);
    for (let j = 0; j < J; j++) {
      const r = p.rot[rig.joints[j]];
      if (r) _q.setFromEuler(_e.set(r[0], r[1], r[2], 'XYZ'));
      else _q.identity();
      const o = (f * J + j) * 4;
      rot[o] = _q.x;
      rot[o + 1] = _q.y;
      rot[o + 2] = _q.z;
      rot[o + 3] = _q.w;
    }
    const d = p.root || [0, 0, 0];
    root[f * 3] = rest[0] + d[0];
    root[f * 3 + 1] = rest[1] + d[1];
    root[f * 3 + 2] = rest[2] + d[2];
  }
  return { name, rig: rig.name, fps, frames, loop, speed, source: 'procedural', joints: rig.joints.slice(), rot, root };
}

/** Clip data → THREE.AnimationClip (tracks bound to bones by name). */
export function toClip(data) {
  const { fps, frames, joints, rot, root, loop } = data;
  const n = loop ? frames + 1 : frames;
  const times = new Float32Array(n);
  for (let i = 0; i < n; i++) times[i] = i / fps;
  const tracks = [];
  const J = joints.length;
  for (let j = 0; j < J; j++) {
    const v = new Float32Array(n * 4);
    let moving = false;
    for (let i = 0; i < n; i++) {
      const f = i % frames;
      const o = (f * J + j) * 4;
      v[i * 4] = rot[o];
      v[i * 4 + 1] = rot[o + 1];
      v[i * 4 + 2] = rot[o + 2];
      v[i * 4 + 3] = rot[o + 3];
      if (Math.abs(rot[o + 3]) < 0.99999) moving = true;
    }
    if (moving || j === 0) tracks.push(new THREE.QuaternionKeyframeTrack(`${joints[j]}.quaternion`, times, v));
  }
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = i % frames;
    p[i * 3] = root[f * 3];
    p[i * 3 + 1] = root[f * 3 + 1];
    p[i * 3 + 2] = root[f * 3 + 2];
  }
  tracks.push(new THREE.VectorKeyframeTrack(`${joints[0]}.position`, times, p));
  const clip = new THREE.AnimationClip(data.name, n > 1 ? times[n - 1] : 0, tracks);
  clip.userData = { speed: data.speed || 0, loop, source: data.source, prompt: data.prompt };
  return clip;
}

/**
 * Per-agent player: named states, cross-fades, locomotion clips sped up or
 * slowed down to match the agent's actual ground speed.
 */
export class Animator {
  constructor(rig, clips) {
    this.mixer = new THREE.AnimationMixer(rig.mesh);
    this.clips = clips;
    this.actions = {};
    this.current = null;
    this.name = '';
  }

  action(name) {
    if (!this.actions[name]) {
      const clip = this.clips[name];
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      if (!clip.userData.loop) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[name] = a;
    }
    return this.actions[name];
  }

  /** Switch state (no-op if already playing). `speed` syncs locomotion cycles. */
  play(name, speed = 0, fade = 0.22) {
    if (!this.clips[name]) name = this.clips.idle ? 'idle' : Object.keys(this.clips)[0];
    const next = this.action(name);
    if (!next) return;
    const base = this.clips[name].userData.speed;
    next.timeScale = base > 0 && speed > 0 ? THREE.MathUtils.clamp(speed / base, 0.45, 2.2) : 1;
    if (this.current === next) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    else next.time = Math.random() * this.clips[name].duration;
    this.current = next;
    this.name = name;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

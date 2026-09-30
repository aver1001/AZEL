// Dump every creature rig (joint names, parents, rest offsets, facing hips)
// and its hand-keyed clips to JSON for the UniMate bridge (igri_unimate.py).
//
//   npm i --no-save three@0.170.0
//   node tools/unimate/export_rigs.mjs [tools/unimate/work/rigs.json]
import fs from 'node:fs';
import path from 'node:path';
import { rigData } from '../../js/models/rigs.js';
import { PROCEDURAL } from '../../js/models/clips/procedural.js';
import { bake } from '../../js/models/motion.js';

// UniMate object-type names (no '-' allowed) → game rig. Firefighters share
// the civilian skeleton, so the human export carries the firefighter clip set.
export const OBJECT_TYPES = { IgriHuman: 'human', IgriRabbit: 'rabbit', IgriSquirrel: 'squirrel', IgriDeer: 'deer', IgriBird: 'bird' };
const CLIPS = { human: PROCEDURAL.firefighter };

const out = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), 'work/rigs.json');
const rigs = {};
for (const [objectType, type] of Object.entries(OBJECT_TYPES)) {
  const rig = rigData(type);
  const clips = {};
  for (const [name, def] of Object.entries(CLIPS[type] || PROCEDURAL[type])) {
    const d = bake(rig, name, def);
    clips[name] = { fps: d.fps, frames: d.frames, speed: d.speed, rot: d.rot, root: d.root };
  }
  rigs[objectType] = {
    rig: type,
    joints: rig.joints,
    parents: rig.parents,
    offsets: rig.offsets,
    face: rig.face,
    clips,
  };
  console.log(`${objectType.padEnd(13)} ${String(rig.joints.length).padStart(2)} joints · clips: ${Object.keys(clips).join(', ')}`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rigs));
console.log('wrote', out);

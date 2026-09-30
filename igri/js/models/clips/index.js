// Clip library per rig type: hand-keyed placeholders first, then any motions
// generated with UniMate (tools/unimate) override clips of the same name.
import { rigData } from '../rigs.js';
import { bake, toClip } from '../motion.js';
import { PROCEDURAL } from './procedural.js';
import UNIMATE from './unimate.js';

// firefighters share the civilian skeleton, so civilian motions apply to both
const SHARES = { firefighter: ['human', 'firefighter'] };
const cache = {};

export function clipsFor(type) {
  if (cache[type]) return cache[type];
  const rig = rigData(type);
  const out = {};
  for (const [name, def] of Object.entries(PROCEDURAL[type])) out[name] = toClip(bake(rig, name, def));
  for (const src of SHARES[type] || [type]) for (const d of UNIMATE[src] || []) out[d.name] = toClip(d);
  return (cache[type] = out);
}

export const RIG_TYPES = Object.keys(PROCEDURAL);

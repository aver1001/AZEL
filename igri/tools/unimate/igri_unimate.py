#!/usr/bin/env python3
"""Bridge between Igri's creature rigs and UniMate (text-to-motion for
arbitrary skeletons, https://github.com/Friedrich-M/UniMate).

Steps (see README.md in this folder):

  prepare    rigs.json → stage-1 export NPZs → UniMate feature dirs
             (cond.npy + canonical clips): people under features/mixamo,
             animals under features/truebones, matching the normalization
             statistics the released model uses for each
  roundtrip  encode the prepared clips to UniMate's 12-d features and decode
             them back onto our rigs, reporting the error (no model needed)
  exp        an experiment dir that reuses a released checkpoint but reads
             only our feature dirs, so the UniML3D dataset isn't needed
  to_clips   UniMate samples (motions/*.npy) → js/models/clips/unimate.js

Our rigs use identity rest rotations with the rest pose in the bone offsets
(BVH style), facing +Z, Y up. UniMate's canonical frame is the same up to a
uniform scale and a yaw, both recovered here from the conditioning T-pose.
"""
import argparse
import glob
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
IGRI = os.path.abspath(os.path.join(HERE, '..', '..'))


# which UniMate dataset (and so which normalization statistics) each rig joins
DATASET = {'human': 'mixamo'}


def load_cond(features):
    cond = {}
    for f in sorted(glob.glob(os.path.join(features, '*', 'cond.npy'))):
        cond.update(np.load(f, allow_pickle=True).item())
    if not cond:
        sys.exit(f'no */cond.npy under {features}; run prepare first')
    return cond


def use_unimate(path):
    path = os.path.abspath(path)
    if not os.path.isdir(os.path.join(path, 'unimate')):
        sys.exit(f'--unimate {path}: not a UniMate checkout')
    sys.path.insert(0, path)


# --------------------------------------------------------------------------
# quaternions (w, x, y, z), numpy, broadcasting over leading axes

def qmul(a, b):
    aw, ax, ay, az = np.moveaxis(a, -1, 0)
    bw, bx, by, bz = np.moveaxis(b, -1, 0)
    return np.stack([
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ], -1)


def qinv(q):
    return q * np.array([1, -1, -1, -1])


def qrot(q, v):
    p = np.concatenate([np.zeros(v.shape[:-1] + (1,)), v], -1)
    return qmul(qmul(q, p), qinv(q))[..., 1:]


def qyaw(angle):
    angle = np.asarray(angle, float)
    return np.stack([np.cos(angle / 2), 0 * angle, np.sin(angle / 2), 0 * angle], -1)


def qfrom_matrix(m):
    w = np.sqrt(max(0.0, 1 + m[0, 0] + m[1, 1] + m[2, 2])) / 2
    x = np.copysign(np.sqrt(max(0.0, 1 + m[0, 0] - m[1, 1] - m[2, 2])) / 2, m[2, 1] - m[1, 2])
    y = np.copysign(np.sqrt(max(0.0, 1 - m[0, 0] + m[1, 1] - m[2, 2])) / 2, m[0, 2] - m[2, 0])
    z = np.copysign(np.sqrt(max(0.0, 1 - m[0, 0] - m[1, 1] + m[2, 2])) / 2, m[1, 0] - m[0, 1])
    q = np.array([w, x, y, z])
    return q / np.linalg.norm(q)


def qangle(a, b):
    d = np.abs(np.sum(a * b, -1)).clip(0, 1)
    return 2 * np.arccos(d)


def qslerp(a, b, t):
    d = np.sum(a * b, -1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d).clip(0, 1)
    th = np.arccos(d)
    s = np.sin(th)
    small = s < 1e-6
    wa = np.where(small, 1 - t, np.sin((1 - t) * th) / np.where(small, 1, s))
    wb = np.where(small, t, np.sin(t * th) / np.where(small, 1, s))
    q = wa * a + wb * b
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def fk(q, root, offsets, parents):
    """Global joint positions (T, J, 3) from local rotations (T, J, 4 wxyz)."""
    T, J = q.shape[:2]
    gq = np.zeros_like(q)
    gp = np.zeros((T, J, 3))
    for j in range(J):
        p = parents[j]
        if p < 0:
            gq[:, j] = q[:, j]
            gp[:, j] = root
        else:
            gq[:, j] = qmul(gq[:, p], q[:, j])
            gp[:, j] = gp[:, p] + qrot(gq[:, p], np.broadcast_to(offsets[j], (T, 3)))
    return gp


def rest_positions(rig):
    offsets = np.asarray(rig['offsets'], float)
    q = np.tile([1.0, 0, 0, 0], (1, len(offsets), 1))
    return fk(q, offsets[0][None], offsets, rig['parents'])[0]


def is_leaf(parents):
    has_child = np.zeros(len(parents), bool)
    for p in parents:
        if p >= 0:
            has_child[p] = True
    return ~has_child


# --------------------------------------------------------------------------
# canonical frame ↔ rig frame

class Frame:
    """Similarity (scale s, rotation R) taking rig rest positions onto the
    UniMate T-pose of the same object type, plus the joint re-ordering."""

    def __init__(self, cond, rig):
        from Animation import offsets_from_positions
        self.parents = np.asarray(cond['parents'])
        tpos = np.asarray(cond['tpos_first_frame'], float).copy()
        tpos[:, 1] -= tpos[:, 1].min()  # grounded like the training loader
        self.tpos = tpos
        self.offsets = offsets_from_positions(tpos, self.parents)
        names = list(cond['joint_names'])
        self.index = np.array([names.index(n) for n in rig['joints']])  # rig joint → cond joint
        a = rest_positions(rig)
        b = tpos[self.index]
        a0, b0 = a - a[0], b - b[0]
        u, sv, vt = np.linalg.svd(b0.T @ a0)
        d = np.sign(np.linalg.det(u @ vt))
        R = u @ np.diag([1, 1, d]) @ vt
        self.R = R
        self.s = float(np.sum(b0 * (a0 @ R.T)) / np.sum(a0 * a0))
        self.qR = qfrom_matrix(R)
        self.rig_root = a[0]
        self.can_root = b[0]
        self.fit = float(np.abs(a0 @ R.T * self.s - b0).max() / self.s)

    def to_rig(self, q_can, root_can):
        """Canonical local rotations (T, Jc, 4) + root path → rig order/scale."""
        q = qmul(qmul(qinv(self.qR), q_can[:, self.index]), self.qR)
        root = (root_can - self.can_root) @ self.R / self.s + self.rig_root
        return q, root

    def positions_to_rig(self, gp_can):
        return (gp_can[:, self.index] - self.can_root) @ self.R / self.s + self.rig_root


def decode(feats, cond, rig):
    """UniMate 12-d features (T, J, 12) → rig-order rotations (T, J, 4) and root path."""
    from unimate.utils.motion_utils import recover_unimate_anim_from_rot
    fr = Frame(cond, rig)
    J = len(fr.parents)
    feats = np.asarray(feats, float)[:, :J]
    anim = recover_unimate_anim_from_rot(feats, fr.parents, fr.offsets.copy())
    q, root = fr.to_rig(np.asarray(anim.rotations.qs), np.asarray(anim.positions[:, 0]))
    return q, root, fr


# --------------------------------------------------------------------------
# in-place + looping

def forward_yaw(q_root):
    f = qrot(q_root, np.broadcast_to([0.0, 0, 1], q_root.shape[:-1] + (3,)))
    return np.unwrap(np.arctan2(f[..., 0], f[..., 2]))


def in_place(q, root, fps):
    """Strip heading drift and ground travel (the game steers agents itself).
    Returns (q, root, ground speed in m/s)."""
    T = len(q)
    t = np.arange(T) / fps
    yaw = forward_yaw(q[:, 0])
    a, b = np.polyfit(t, yaw, 1)[::-1] if T > 2 else (yaw.mean(), 0.0)
    trend = a + b * t
    un = qyaw(-trend)
    q = q.copy()
    q[:, 0] = qmul(un, q[:, 0])
    xz = root[:, [0, 2]] - root[0, [0, 2]]
    rel = qrot(un, np.stack([xz[:, 0], 0 * t, xz[:, 1]], -1))[:, [0, 2]]
    dist = np.linalg.norm(np.diff(root[:, [0, 2]], axis=0), axis=1).sum()
    speed = dist / max(t[-1], 1e-6)
    fit = np.stack([np.polyval(np.polyfit(t, rel[:, k], 1), t) for k in range(2)], -1) if T > 2 else rel
    root = root.copy()
    root[:, 0] = rel[:, 0] - fit[:, 0]
    root[:, 2] = rel[:, 1] - fit[:, 1]
    return q, root, float(speed)


def smooth(q, root, sigma):
    """Gaussian low-pass over time (generated clips can jitter frame to frame)."""
    if sigma <= 0:
        return q, root
    q = q.copy()
    for t in range(1, len(q)):  # keep each track on one hemisphere
        flip = np.sum(q[t] * q[t - 1], -1) < 0
        q[t, flip] *= -1
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    idx = np.clip(np.arange(len(q))[:, None] + np.arange(-r, r + 1)[None], 0, len(q) - 1)
    q = np.einsum('tk,tk...->t...', np.broadcast_to(k, idx.shape), q[idx])
    q /= np.linalg.norm(q, axis=-1, keepdims=True)
    root = np.einsum('tk,tkc->tc', np.broadcast_to(k, idx.shape), root[idx])
    return q, root


def make_loop(q, root, leaf, fps, min_len, blend=5, tol=0.03):
    """Pick the most similar pair of frames at least `min_len` seconds apart
    and cross-fade the tail into the frames before the start."""
    T = len(q)
    m = max(4, int(round(min_len * fps)))
    k = min(blend, max(1, m // 4))
    use = ~leaf
    cands = []
    for i in range(k, T - m):
        for j in range(i + m, T):
            c = qangle(q[i, use], q[j, use]).mean() + qangle(q[i + 1, use], q[min(j + 1, T - 1), use]).mean()
            c += 4 * abs(root[i, 1] - root[j, 1])
            cands.append((c, i, j))
    if not cands:
        raise ValueError(f'clip too short to loop ({T} frames, need > {m + k})')
    # the longest window whose seam is nearly as clean as the best one
    lo = min(c for c, _, _ in cands)
    best, bi, bj = max((x for x in cands if x[0] <= lo + tol), key=lambda x: (x[2] - x[1], -x[0]))
    q2, r2 = q[bi:bj].copy(), root[bi:bj].copy()
    n = len(q2)
    for s in range(k):
        w = (s + 1) / (k + 1)
        src = n - k + s
        q2[src] = qslerp(q2[src], q[bi - k + s], w)
        r2[src] = r2[src] * (1 - w) + root[bi - k + s] * w
    return q2, r2, best


# --------------------------------------------------------------------------
# commands

def cmd_prepare(args):
    use_unimate(args.unimate)
    from data_process.utils.motion_features import process_object
    from data_process.joint_annotation.names_clean_rule import clean_prefixed_name, clean_standard_name
    from data_process.joint_annotation.vocab import MIXAMO_MAP

    rigs = json.load(open(args.rigs))
    prompts = json.load(open(args.prompts))
    export = os.path.join(args.work, 'export', 'motions')
    os.makedirs(export, exist_ok=True)
    conds, captions = {}, {}
    for ot, rig in rigs.items():
        ds = DATASET.get(rig['rig'], 'truebones')
        out = os.path.join(args.out, ds)
        os.makedirs(out, exist_ok=True)
        names, parents = rig['joints'], np.asarray(rig['parents'])
        offsets = np.asarray(rig['offsets'], float)
        J = len(names)
        if rig['rig'] == 'human':
            clean = [clean_prefixed_name('mixamorig:' + n, 'mixamorig:', MIXAMO_MAP) for n in names]
        else:
            clean = [clean_standard_name(n) for n in names]
        npzs, caps = [], {}
        for clip, c in rig['clips'].items():
            T = c['frames']
            rot = np.asarray(c['rot'], float).reshape(T, J, 4)[..., [3, 0, 1, 2]]  # xyzw → wxyz
            root = np.asarray(c['root'], float).reshape(T, 3)
            reps = max(1, int(np.ceil(args.min_frames / T)))
            rot, root = np.tile(rot, (reps, 1, 1)), np.tile(root, (reps, 1))
            n = len(rot)
            root[:, 2] += c['speed'] * np.arange(n) / c['fps']  # travel like real locomotion
            pos = np.repeat(offsets[None], n, 0)
            pos[:, 0] = root
            stem = f'{ot}-{clip}'
            path = os.path.join(export, stem + '.npz')
            np.savez(path, rest_local_pos=offsets, rest_local_rot=np.tile([1.0, 0, 0, 0], (J, 1)),
                     anim_local_pos=pos, anim_local_rot=rot, offsets=offsets, names=np.array(names),
                     skin_matrix=np.zeros((0, J)), fps=c['fps'], parents=parents, action_name=clip)
            npzs.append(path)
            caps[stem] = prompts.get(stem, f'a {rig["rig"]} {clip}')
        face = {'r_hip': {'raw': rig['face'][0]}, 'l_hip': {'raw': rig['face'][1]}}
        obj, n_clips, n_frames, nj, filtered = process_object(
            ot, sorted(npzs), out, captions=caps, face_joints=face, clean_names=clean,
            save_vis=False, apply_clip=False, max_clip_len=200, min_joints=2, max_joints=150)
        if obj is None:
            sys.exit(f'{ot}: rejected by UniMate feature extraction: {filtered}')
        conds.setdefault(ds, {})[ot] = obj
        captions.setdefault(ds, {}).update(obj.get('captions', {}))
        fr = Frame(obj, rig)
        print(f'{ot:13s} {ds:9s} {nj:2d} joints  {n_clips} clips  scale {obj["scale_factor"]:.3f}  '
              f'yaw {np.degrees(2 * np.arctan2(fr.qR[2], fr.qR[0])):+.1f}°  rest fit {fr.fit * 1000:.2f} mm'
              + (f'  filtered: {[f["name"] for f in filtered]}' if filtered else ''))
    for ds, cond in conds.items():
        out = os.path.join(args.out, ds)
        np.save(os.path.join(out, 'cond.npy'), cond, allow_pickle=True)
        json.dump(captions[ds], open(os.path.join(out, 'captions.json'), 'w'), indent=2)
        print('wrote', os.path.join(out, 'cond.npy'), sorted(cond))


def cmd_roundtrip(args):
    use_unimate(args.unimate)
    from Quaternions import Quaternions
    from unimate.utils.motion_utils import compute_rots_from_tpos, compute_unimate_motion_feats

    rigs = json.load(open(args.rigs))
    cond = load_cond(args.features)
    worst = 0.0
    dumped = {}
    if args.dump:
        os.makedirs(os.path.join(args.dump, 'motions'), exist_ok=True)
    for path in sorted(glob.glob(os.path.join(args.features, '*', 'motions', '*.npz'))):
        name = os.path.splitext(os.path.basename(path))[0]
        ot, clip = name.split('-')[:2]
        c, rig = cond[ot], rigs[ot]
        z = np.load(path)
        gp, lr, rf = z['global_positions'].copy(), z['local_rotations'], z['root_facing_quat']
        gp[..., 1] -= gp[..., 1].min()
        parents = np.asarray(c['parents'])
        tq = np.broadcast_to(np.asarray(c['tpos_local_rotations'])[None], lr.shape).copy()
        rebased = compute_rots_from_tpos(Quaternions(tq), Quaternions(lr), parents)
        feats = compute_unimate_motion_feats(gp, rebased, parents, Quaternions(rf))
        if args.dump:
            # same layout as unimate.inference.sample output, to exercise to_clips without a model
            npy = f'{ot}-{clip}-rep_0-0.npy'
            np.save(os.path.join(args.dump, 'motions', npy), feats.astype(np.float32))
            dumped[npy] = f'round-trip of the hand-keyed {clip} clip'

        q, root, fr = decode(feats, c, rig)
        pos = fk(q, root, np.asarray(rig['offsets'], float), rig['parents'])
        ref = fr.positions_to_rig(gp[:len(q)])
        err = np.linalg.norm(pos - ref, axis=-1)
        # rotations against the hand-keyed source (the clip may be trimmed, so align by best offset)
        src = rig['clips'][clip]
        J = len(rig['joints'])
        sq = np.asarray(src['rot'], float).reshape(src['frames'], J, 4)[..., [3, 0, 1, 2]]
        leaf = is_leaf(rig['parents'])
        ang = min(
            np.degrees(qangle(q[:, ~leaf][:, 1:], np.roll(sq, -o, 0)[np.arange(len(q)) % len(sq)][:, ~leaf][:, 1:]).max())
            for o in range(len(sq)))
        worst = max(worst, err.max())
        print(f'{name:24s} {len(q):3d} frames  FK err max {err.max() * 1000:7.3f} mm  mean {err.mean() * 1000:6.3f} mm'
              f'  rot err vs source {ang:5.2f}°')
    print(f'worst FK error {worst * 1000:.3f} mm')
    if args.dump:
        json.dump(dumped, open(os.path.join(args.dump, 'captions.json'), 'w'), indent=2)
        print(f'dumped {len(dumped)} feature files to {args.dump}/motions')


def cmd_exp(args):
    """Released checkpoint + our feature dirs → a runnable experiment dir."""
    src = os.path.abspath(args.checkpoint)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    config = json.load(open(os.path.join(src, 'config.json')))
    stats = np.load(os.path.join(src, 'dataset_stats.npy'), allow_pickle=True).item()
    datasets = [d for d in ('truebones', 'mixamo', 'objaverse')
                if os.path.exists(os.path.join(args.features, d, 'cond.npy'))]
    for d in datasets:
        if d not in stats:
            sys.exit(f'the checkpoint has no normalization stats for {d!r}')
        entry = dict(config.get(d, {}), type=d, path=os.path.abspath(os.path.join(args.features, d)))
        if d == 'truebones':
            entry['objects_subset'] = 'all'
        config[d] = entry
    config['dataset']['dataset_list'] = datasets
    config['experiment']['output_dir'] = out
    config['sampling']['device'] = args.device
    json.dump(config, open(os.path.join(out, 'config.json'), 'w'), indent=4)
    for name in ('dataset_stats.npy', 'checkpoints'):
        link = os.path.join(out, name)
        if not os.path.lexists(link):
            os.symlink(os.path.join(src, name), link)
    print(f'wrote {out}: datasets {datasets}, device {args.device}, checkpoints from {src}')


def cmd_to_clips(args):
    use_unimate(args.unimate)
    rigs = json.load(open(args.rigs))
    cond = load_cond(args.features)
    capf = os.path.join(os.path.dirname(os.path.abspath(args.motions)), 'captions.json')
    caps = json.load(open(capf)) if os.path.exists(capf) else {}
    pick = {k: int(v) for k, v in (p.split('=') for p in args.pick)}
    reps = {}
    for path in sorted(glob.glob(os.path.join(args.motions, '*.npy'))):
        m = re.match(r'^([^-]+)-(.+)-rep_(\d+)-(\d+)\.npy$', os.path.basename(path))
        if m and m.group(1) in rigs:
            reps.setdefault(f'{m.group(1)}-{m.group(2)}', {})[int(m.group(3))] = path
    # the repetition asked for with --pick, else the first one
    chosen = {}
    for key, by_rep in reps.items():
        rep = pick.get(key, min(by_rep))
        if rep not in by_rep:
            sys.exit(f'{key}: no repetition {rep} (have {sorted(by_rep)})')
        chosen[key] = (by_rep[rep], rep)
    lib = {}
    idle_like = re.compile(r'idle|graze|look|aim|stand|peck')
    for key, (path, rep) in sorted(chosen.items()):
        ot, clip = key.split('-', 1)
        rig = rigs[ot]
        fps = args.fps
        q, root, fr = decode(np.load(path), cond[ot], rig)
        q, root, speed = in_place(q, root, fps)
        q, root = smooth(q, root, args.smooth)
        leaf = is_leaf(rig['parents'])
        min_len = 1.2 if idle_like.search(clip) else 0.35
        q, root, cost = make_loop(q, root, leaf, fps, min_len)
        q = q[..., [1, 2, 3, 0]]  # → xyzw for three.js
        # joints that never leave the rest pose (leaves, mostly) need no track
        keep = [j for j in range(q.shape[1]) if j == 0 or np.abs(np.abs(q[:, j, 3]) - 1).max() > 1e-5]
        q = q[:, keep]
        data = {
            'name': clip, 'rig': rig['rig'], 'fps': fps, 'frames': len(q), 'loop': True,
            'speed': round(0 if idle_like.search(clip) else speed, 3), 'source': 'unimate',
            'prompt': caps.get(os.path.basename(path), ''),
            'joints': [rig['joints'][j] for j in keep],
            'rot': [round(float(v), 3) for v in q.reshape(-1)],
            'root': [round(float(v), 3) for v in root.reshape(-1)],
        }
        lib.setdefault(rig['rig'], []).append(data)
        print(f'{key:24s} rep {rep}  {len(q):3d} frames ({len(q) / fps:.2f}s loop, seam {cost:.3f})  '
              f'speed {data["speed"]:.2f} m/s  "{data["prompt"]}"')
    body = json.dumps(lib, separators=(',', ':'))
    with open(args.out, 'w') as f:
        f.write('// Generated by tools/unimate/igri_unimate.py to_clips — motions from UniMate, keyed by rig.\n')
        f.write('// Regenerate instead of editing by hand.\n')
        f.write(f'export default {body};\n')
    print('wrote', args.out, f'({len(body) // 1024} KB)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    work = os.path.join(HERE, 'work')

    p = sub.add_parser('prepare')
    p.add_argument('--unimate', required=True)
    p.add_argument('--rigs', default=os.path.join(work, 'rigs.json'))
    p.add_argument('--prompts', default=os.path.join(HERE, 'prompts.json'))
    p.add_argument('--work', default=work)
    p.add_argument('--out', default=os.path.join(work, 'features'))
    p.add_argument('--min_frames', type=int, default=90)

    p = sub.add_parser('roundtrip')
    p.add_argument('--unimate', required=True)
    p.add_argument('--rigs', default=os.path.join(work, 'rigs.json'))
    p.add_argument('--features', default=os.path.join(work, 'features'))
    p.add_argument('--dump', help='also write the encoded clips as sample-style .npy files here')

    p = sub.add_parser('exp')
    p.add_argument('--checkpoint', required=True, help='released experiment dir (config.json, dataset_stats.npy, checkpoints/)')
    p.add_argument('--out', required=True, help='new experiment dir to create')
    p.add_argument('--features', default=os.path.join(work, 'features'))
    p.add_argument('--device', default='cuda' if os.environ.get('CUDA_VISIBLE_DEVICES', '') != '' else 'cpu')

    p = sub.add_parser('to_clips')
    p.add_argument('--unimate', required=True)
    p.add_argument('--motions', required=True, help='<exp_dir>/samples/motions (or --output_dir/motions)')
    p.add_argument('--rigs', default=os.path.join(work, 'rigs.json'))
    p.add_argument('--features', default=os.path.join(work, 'features'))
    p.add_argument('--pick', nargs='*', default=[], help='choose a repetition, e.g. IgriRabbit-hop=2')
    p.add_argument('--fps', type=int, default=30)
    p.add_argument('--smooth', type=float, default=1.0, help='temporal smoothing sigma in frames (0 = off)')
    p.add_argument('--out', default=os.path.join(IGRI, 'js', 'models', 'clips', 'unimate.js'))

    args = ap.parse_args()
    {'prepare': cmd_prepare, 'roundtrip': cmd_roundtrip, 'exp': cmd_exp, 'to_clips': cmd_to_clips}[args.cmd](args)


if __name__ == '__main__':
    main()

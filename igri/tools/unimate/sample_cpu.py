#!/usr/bin/env python3
"""Run UniMate's sampler with a fixed-step ODE solver.

The released sampler integrates with adaptive dopri5 at atol 1e-6, which is
fine on a GPU but takes ~10 minutes per motion on a laptop CPU. A fixed-step
midpoint solver with ~16 steps gives visually equivalent motions for a
fraction of the model evaluations. Everything after `--` goes to
`python -m unimate.inference.sample` unchanged.

  python tools/unimate/sample_cpu.py --unimate $UM --method midpoint --steps 16 -- \\
      --exp_dir outputs/igri_f60 --test_cases_json .../prompts.json \\
      --num_repetitions 3 --only_save_motion --output_dir outputs/igri
"""
import argparse
import os
import sys
import time


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--unimate', required=True, help='UniMate checkout (paths in the sample args are relative to it)')
    ap.add_argument('--method', default='midpoint', help="torchdiffeq method: euler, midpoint, rk4, dopri5 …")
    ap.add_argument('--steps', type=int, default=16, help='fixed integration steps (ignored by dopri5)')
    ap.add_argument('--threads', type=int, default=0, help='torch CPU threads (0 = torch default)')
    argv = sys.argv[1:]
    rest = argv[argv.index('--') + 1:] if '--' in argv else []
    args = ap.parse_args(argv[:argv.index('--')] if '--' in argv else argv)

    root = os.path.abspath(args.unimate)
    os.chdir(root)
    sys.path.insert(0, root)
    import torch
    if args.threads:
        torch.set_num_threads(args.threads)

    from unimate.models.flow import transport, integrators
    orig = transport.Sampler.sample_ode

    def sample_ode(self, **kw):
        kw.setdefault('sampling_method', args.method)
        kw.setdefault('num_steps', args.steps + 1)  # the grid has steps + 1 points
        return orig(self, **kw)

    transport.Sampler.sample_ode = sample_ode

    # count model evaluations so solver settings can be compared
    calls = {'n': 0}
    orig_sample = integrators.ode.sample

    def counted(self, x, model, **kw):
        drift = self.drift

        def wrapped(*a, **k):
            calls['n'] += 1
            return drift(*a, **k)

        self.drift = wrapped
        t0 = time.time()
        try:
            return orig_sample(self, x, model, **kw)
        finally:
            self.drift = drift
            print(f'[sample_cpu] {args.method} steps={args.steps}: {calls["n"]} model evaluations, '
                  f'{time.time() - t0:.1f}s for batch {x.shape[0]}', flush=True)
            calls['n'] = 0

    integrators.ode.sample = counted

    import tyro
    from unimate.inference import sample
    sample.main(tyro.cli(sample.InferenceArgs, args=rest))


if __name__ == '__main__':
    main()

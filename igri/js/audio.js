// Synthesized sound: fire roar and crackle that scale with the blaze, rain,
// sirens, blasts, the steam hiss of water, a dash whoosh, and a tense
// drone + drum score that intensifies with every tier. No audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.level = { fire: 0, rain: 0, crackle: 0, heli: 0 };
    this.tier = 1;
    this.lastOneShot = {};
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);

    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }

    // fire roar
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    this.fireFilter = ctx.createBiquadFilter();
    this.fireFilter.type = 'lowpass';
    this.fireFilter.frequency.value = 400;
    this.loop(this.brown).connect(this.fireFilter).connect(this.fireGain).connect(this.sfx);
    // rain
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    this.loop(this.white).connect(hp).connect(this.rainGain).connect(this.sfx);
    // helicopter thump (amplitude-modulated low noise)
    this.heliGain = ctx.createGain();
    this.heliGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    lfo.start();
    this.loop(this.brown).connect(lp).connect(am).connect(this.heliGain).connect(this.sfx);

    this.startMusic();
  }

  loop(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    return s;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Called every frame with the game's state. */
  update(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { r = 0.3, burning = 0, rain = 0, heli = 0, tier = 1, silent = false } = state;
    this.tier = tier;
    const fire = silent ? 0 : Math.min(0.55, 0.08 + Math.log2(1 + r) * 0.12 + Math.min(0.2, burning * 0.0006));
    this.fireGain.gain.setTargetAtTime(fire, t, 0.2);
    this.fireFilter.frequency.setTargetAtTime(300 + Math.min(1500, r * 60 + burning * 1.5), t, 0.3);
    this.rainGain.gain.setTargetAtTime(silent ? 0 : rain * 0.22, t, 0.3);
    this.heliGain.gain.setTargetAtTime(silent ? 0 : heli * 0.35, t, 0.3);
    this.music.gain.setTargetAtTime(silent ? 0 : 0.32, t, silent ? 0.05 : 1.5);
    this.sfx.gain.setTargetAtTime(silent ? 0 : 0.9, t, 0.05);
    // random crackles
    const rate = silent ? 0 : 2 + Math.min(40, burning * 0.15 + r * 2);
    if (Math.random() < rate / 60) this.crackle(0.05 + Math.random() * 0.12);
  }

  env(node, a, d, peak, when = 0) {
    const t = this.ctx.currentTime + when;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  noiseShot({ type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.005, d = 0.2, peak = 0.3, brown = false, when = 0 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    const t = ctx.currentTime + when;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(this.sfx);
    this.env(g, a, d, peak, when);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + d + 0.05);
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, a = 0.005, d = 0.3, peak = 0.2, when = 0, dest = null }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + when;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + a + d);
    const g = ctx.createGain();
    o.connect(g).connect(dest || this.sfx);
    this.env(g, a, d, peak, when);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  limit(key, gap) {
    const now = performance.now();
    if ((this.lastOneShot[key] || 0) + gap > now) return false;
    this.lastOneShot[key] = now;
    return true;
  }

  crackle(peak) {
    this.noiseShot({ type: 'bandpass', f0: 1500 + Math.random() * 3000, q: 2, a: 0.001, d: 0.03 + Math.random() * 0.05, peak });
  }

  play(name, k = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'ignite':
        if (!this.limit('ignite', 70)) return;
        this.noiseShot({ type: 'bandpass', f0: 600, f1: 2400, q: 0.8, a: 0.01, d: 0.18, peak: 0.08 * k });
        break;
      case 'explode':
        this.noiseShot({ type: 'lowpass', f0: 2400, f1: 80, a: 0.005, d: 1.2 + k * 0.4, peak: 0.9, brown: true });
        this.tone({ type: 'sine', f0: 120, f1: 28, a: 0.005, d: 0.9, peak: 0.8 });
        break;
      case 'dash':
        this.noiseShot({ type: 'bandpass', f0: 300, f1: 3000, q: 1.2, a: 0.02, d: 0.28, peak: 0.35 });
        break;
      case 'hiss':
        if (!this.limit('hiss', 180)) return;
        this.noiseShot({ type: 'highpass', f0: 3500, f1: 6000, a: 0.01, d: 0.35, peak: 0.16 * k });
        break;
      case 'parry':
        this.noiseShot({ type: 'highpass', f0: 1200, f1: 8000, a: 0.005, d: 0.9, peak: 0.7 });
        this.tone({ type: 'triangle', f0: 1760, f1: 880, a: 0.003, d: 0.6, peak: 0.25 });
        this.tone({ type: 'sine', f0: 90, f1: 40, a: 0.005, d: 0.6, peak: 0.6 });
        break;
      case 'tierUp': {
        const notes = [220, 277, 330, 440, 554];
        notes.forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, a: 0.02, d: 0.9, peak: 0.08, when: i * 0.07 }));
        this.noiseShot({ type: 'bandpass', f0: 200, f1: 2000, a: 0.3, d: 1.0, peak: 0.3, brown: true });
        break;
      }
      case 'tierDown':
        [330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', f0: f, a: 0.02, d: 0.5, peak: 0.12, when: i * 0.1 }));
        break;
      case 'pick':
        [660, 880, 1320].forEach((f, i) => this.tone({ type: 'triangle', f0: f, a: 0.005, d: 0.25, peak: 0.12, when: i * 0.05 }));
        break;
      case 'ui':
        this.tone({ type: 'triangle', f0: 880, f1: 660, a: 0.002, d: 0.08, peak: 0.08 });
        break;
      case 'siren': {
        if (!this.limit('siren', 6000)) return;
        for (let i = 0; i < 4; i++) {
          this.tone({ type: 'square', f0: 760, f1: 760, a: 0.02, d: 0.33, peak: 0.035, when: i * 0.7 });
          this.tone({ type: 'square', f0: 580, f1: 580, a: 0.02, d: 0.33, peak: 0.035, when: i * 0.7 + 0.35 });
        }
        break;
      }
      case 'splash':
        this.noiseShot({ type: 'lowpass', f0: 3000, f1: 300, a: 0.005, d: 0.6, peak: 0.5 });
        break;
      case 'drip':
        this.tone({ type: 'sine', f0: 1400, f1: 500, a: 0.002, d: 0.09, peak: 0.12 });
        break;
      case 'bossRoar':
        this.tone({ type: 'sawtooth', f0: 70, f1: 45, a: 0.3, d: 2.2, peak: 0.3 });
        this.noiseShot({ type: 'lowpass', f0: 800, f1: 150, a: 0.4, d: 2.2, peak: 0.5, brown: true });
        break;
      case 'bossCharge':
        this.tone({ type: 'sine', f0: 200, f1: 900, a: 0.05, d: 1.25, peak: 0.12 });
        break;
      case 'bossBeam':
        this.noiseShot({ type: 'bandpass', f0: 500, f1: 300, q: 0.6, a: 0.02, d: 1.1, peak: 0.6 });
        break;
      case 'bossShot':
        if (!this.limit('bossShot', 120)) return;
        this.tone({ type: 'sine', f0: 500, f1: 180, a: 0.005, d: 0.18, peak: 0.12 });
        break;
      case 'spark':
        if (!this.limit('spark', 60)) return;
        this.tone({ type: 'triangle', f0: 1200, f1: 2400, a: 0.002, d: 0.08, peak: 0.05 });
        break;
      case 'tick':
        this.noiseShot({ type: 'highpass', f0: 4000, a: 0.001, d: 0.012, peak: 0.08 });
        break;
      case 'bump':
        if (!this.limit('bump', 250)) return;
        this.tone({ type: 'sine', f0: 140, f1: 70, a: 0.003, d: 0.12, peak: 0.2 });
        break;
      case 'warning':
        this.tone({ type: 'square', f0: 440, a: 0.01, d: 0.12, peak: 0.05 });
        this.tone({ type: 'square', f0: 440, a: 0.01, d: 0.12, peak: 0.05, when: 0.2 });
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------- score
  startMusic() {
    const ctx = this.ctx;
    // drone: detuned saws through a slowly opening filter
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 180;
    this.droneFilter.Q.value = 2;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.18;
    this.droneFilter.connect(this.droneGain).connect(this.music);
    for (const [f, det] of [[55, -7], [55, 6], [82.4, 3], [110, -4]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(this.droneFilter);
      o.start();
    }
    this.nextBeat = ctx.currentTime + 0.2;
    this.step = 0;
    this.schedTimer = setInterval(() => this.schedule(), 60);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const bpm = [0, 84, 96, 112, 128][this.tier] || 96;
    const spb = 60 / bpm / 2; // eighth notes
    this.droneFilter.frequency.setTargetAtTime(140 + this.tier * 110, ctx.currentTime, 2);
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const s = this.step % 16;
      const when = this.nextBeat - ctx.currentTime;
      const T = this.tier;
      const kick = T >= 2 && (s === 0 || s === 8 || (T >= 3 && (s === 6 || s === 11)) || (T >= 4 && s % 4 === 0));
      const tom = T >= 1 && (s === 4 || s === 12 || (T >= 3 && s === 14));
      const hat = T >= 3 && s % 2 === 1;
      if (kick) this.tone({ type: 'sine', f0: 110, f1: 38, a: 0.002, d: 0.32, peak: 0.55, when, dest: this.music });
      if (tom) this.tone({ type: 'sine', f0: 190, f1: 90, a: 0.002, d: 0.22, peak: T === 1 ? 0.12 : 0.3, when, dest: this.music });
      if (hat && T >= 3) this.noiseShotTo(this.music, { type: 'highpass', f0: 7000, a: 0.001, d: 0.04, peak: 0.06, when });
      this.nextBeat += spb;
      this.step++;
    }
  }

  noiseShotTo(dest, opts) {
    const prev = this.sfx;
    this.sfx = dest;
    this.noiseShot(opts);
    this.sfx = prev;
  }
}

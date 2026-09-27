// Short-term goals layered on the sandbox: a chain of 의뢰 (missions) that
// point at the set pieces already in the world, plus timed 긴급 과제
// (challenges). Counters are bumped by game events from main.js.
import { MISSIONS, CHALLENGES } from './config.js';

const rand = ([a, b]) => a + Math.random() * (b - a);

export class Missions {
  constructor(g) {
    this.g = g;
    this.c = {};
    this.done = new Set();
    this.challenge = null;
    this.challengeTimer = 35;
  }

  bump(stat, n = 1) {
    this.c[stat] = (this.c[stat] || 0) + n;
    const ch = this.challenge;
    if (!ch) return;
    if (ch.kind === 'burn' && stat === 'consume') ch.progress += n;
    if (ch.kind === 'trees' && stat === 'trees') ch.progress += n;
  }

  combo(n) {
    if (n > (this.c.comboMax || 0)) this.c.comboMax = n;
    const ch = this.challenge;
    if (ch && ch.kind === 'combo') ch.progress = Math.max(ch.progress, n);
  }

  count(m) {
    return Math.min(m.goal, this.c[m.stat] || 0);
  }

  /** Up to three open missions: this tier's first, then leftovers from the last one. */
  active() {
    const tier = this.g.player.tier.id;
    const open = MISSIONS.filter((m) => !this.done.has(m.id) && m.tier <= tier && m.tier >= tier - 1);
    open.sort((a, b) => (b.tier === tier) - (a.tier === tier));
    return open.slice(0, 3);
  }

  update(dt) {
    const g = this.g;
    for (const m of this.active()) {
      if ((this.c[m.stat] || 0) >= m.goal) {
        this.done.add(m.id);
        g.emit('missionDone', m);
      }
    }
    const ch = this.challenge;
    if (ch) {
      ch.t -= dt;
      if (ch.progress >= ch.n) {
        this.challenge = null;
        this.challengeTimer = rand(CHALLENGES.every);
        g.emit('challengeDone', ch);
      } else if (ch.t <= 0) {
        this.challenge = null;
        this.challengeTimer = rand(CHALLENGES.every) * 0.6;
        g.emit('challengeFail', ch);
      }
      return;
    }
    if (g.boss && g.boss.active) return;
    this.challengeTimer -= dt;
    if (this.challengeTimer > 0) return;
    const tier = g.player.tier.id;
    const kinds = CHALLENGES.kinds.filter((k) => (k.minTier || 1) <= tier && k.n[tier]);
    const def = kinds[Math.floor(Math.random() * kinds.length)];
    const n = def.n[tier];
    this.challenge = { kind: def.kind, n, t: def.secs, secs: def.secs, progress: 0, text: def.text(n, def.secs) };
    g.emit('challenge', this.challenge);
  }
}

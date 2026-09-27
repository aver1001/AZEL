// DOM overlay: size/tier gauge, wanted stars, damage counter, timer, skills,
// dash ring, status chips, minimap, toasts, floating popups, tier banners,
// and the 3-card skill picker.
import * as THREE from 'three';
import { TIERS, SKILLS, WORLD, MASS, WANTED, COMBO, FEVER } from './config.js';
import { GW, GH } from './world/burnmap.js';

export const ICONS = {
  wind: '<path d="M4 9h11a3 3 0 1 0-3-3M4 14h15a3 3 0 1 1-3 3M4 19h7" />',
  oil: '<path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z" /><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />',
  spark: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" />',
  heat: '<path d="M6 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M18 20c-2-3 2-5 0-8s2-5 0-8" />',
  coal: '<path d="M7 5h10l4 7-4 7H7l-4-7z" /><path d="M9 12h6" />',
  whirl: '<path d="M12 12m-2 0a2 2 0 1 0 4 0a4 4 0 1 0-8 0a6 6 0 1 0 12 0a8 8 0 1 0-16 0" />',
  flash: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" />',
};

export const svgIcon = (k, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

export function formatWon(won) {
  if (won >= 1e12) return `${(won / 1e12).toFixed(2)}조 원`;
  if (won >= 1e8) return `${Math.floor(won / 1e8).toLocaleString('ko-KR')}억 원`;
  if (won >= 1e4) return `${Math.floor(won / 1e4).toLocaleString('ko-KR')}만 원`;
  return `${Math.floor(won).toLocaleString('ko-KR')}원`;
}

export class HUD {
  constructor(g) {
    this.g = g;
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('hud'),
      tierNum: $('tier-num'),
      tierName: $('tier-name'),
      sizeFill: $('size-fill'),
      sizeText: $('size-text'),
      timer: $('timer'),
      stars: $('stars'),
      damage: $('damage'),
      trees: $('trees'),
      skills: $('skills'),
      status: $('status'),
      dashRing: $('dash-ring'),
      toasts: $('toasts'),
      popups: $('popups'),
      banner: $('banner'),
      boss: $('bossbar'),
      objective: $('objective'),
      objText: $('obj-text'),
      bossFill: $('boss-fill'),
      minimap: $('minimap'),
      choose: $('choose'),
      cards: $('cards'),
      feverFill: $('fever-fill'),
      feverLabel: $('fever-label'),
      combo: $('combo'),
      comboNum: $('combo-num'),
      comboFill: $('combo-fill'),
      comboBonus: $('combo-bonus'),
      missions: $('missions'),
      challenge: $('challenge'),
      chText: $('ch-text'),
      chFill: $('ch-fill'),
      chProgress: $('ch-progress'),
      chTime: $('ch-time'),
    };
    this.lastCombo = 0;
    this.lastMissions = '';
    this.recentDone = [];
    this.mm = this.el.minimap.getContext('2d');
    // minimap base from the painted ground
    this.mmBase = document.createElement('canvas');
    this.mmBase.width = this.el.minimap.width;
    this.mmBase.height = this.el.minimap.height;
    const b = this.mmBase.getContext('2d');
    b.filter = 'saturate(0.7) brightness(0.8)';
    b.drawImage(g.layout.ground, 0, 0, this.mmBase.width, this.mmBase.height);
    this.charCanvas = document.createElement('canvas');
    this.charCanvas.width = GW;
    this.charCanvas.height = GH;
    this.charCtx = this.charCanvas.getContext('2d');
    this.charImg = this.charCtx.createImageData(GW, GH);
    this.mmT = 0;
    this.popups = [];
    this.lastStars = -1;
    this.lastSkills = '';
    this.v = new THREE.Vector3();
  }

  show(on) {
    this.el.root.hidden = !on;
  }

  toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = msg;
    this.el.toasts.prepend(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3800);
  }

  banner(title, sub) {
    const b = this.el.banner;
    b.innerHTML = `<div class="banner-title">${title}</div><div class="banner-sub">${sub}</div>`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  popup(text, pos, kind = '') {
    const d = document.createElement('div');
    d.className = `popup ${kind}`;
    d.textContent = text;
    this.el.popups.appendChild(d);
    this.popups.push({ d, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y || 0, pos.z), t: 0 });
    if (this.popups.length > 14) {
      const p = this.popups.shift();
      p.d.remove();
    }
  }

  missionDone(m) {
    this.recentDone.push({ m, until: performance.now() + 1400 });
  }

  update(dt) {
    const g = this.g;
    const P = g.player;
    const e = this.el;
    const tier = P.tier;
    e.tierNum.textContent = `T${tier.id}`;
    e.tierName.textContent = tier.name;
    e.root.dataset.tier = tier.id;
    const next = TIERS[tier.id];
    const lo = MASS.massFor(Math.max(tier.minR, 0.25));
    const hi = next ? MASS.massFor(next.minR) : MASS.max;
    const k = THREE.MathUtils.clamp((P.mass - lo) / (hi - lo), 0, 1);
    e.sizeFill.style.transform = `scaleX(${k.toFixed(3)})`;
    e.sizeText.textContent = `반경 ${P.r < 1 ? P.r.toFixed(2) : P.r.toFixed(1)} m · 연료 ${P.mass < 100 ? P.mass.toFixed(1) : Math.round(P.mass).toLocaleString('ko-KR')}${next ? ` / 다음 단계 ${Math.round(hi).toLocaleString('ko-KR')}` : ''}`;
    const left = Math.max(0, g.timeLeft);
    e.timer.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    e.timer.classList.toggle('low', left < 60);
    if (g.stars !== this.lastStars) {
      this.lastStars = g.stars;
      e.stars.innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= g.stars ? 'on' : ''}">★</span>`).join('');
      e.stars.setAttribute('aria-label', `지명 수배 ${g.stars}단계`);
      e.stars.classList.remove('bump');
      void e.stars.offsetWidth;
      if (g.stars > 0) e.stars.classList.add('bump');
    }
    e.damage.textContent = formatWon(g.stats.won);
    e.trees.textContent = `태운 나무 ${g.stats.trees.toLocaleString('ko-KR')}그루 · 소실 ${g.burnMap.burnedHa.toFixed(1)} ha`;

    // skills
    const sk = Object.entries(P.skills).filter(([, l]) => l > 0);
    const key = sk.map(([k2, l]) => k2 + l).join(',');
    if (key !== this.lastSkills) {
      this.lastSkills = key;
      e.skills.innerHTML = sk
        .map(([k2, l]) => `<div class="skill" title="${SKILLS[k2].name}: ${SKILLS[k2].desc(l)}">${svgIcon(k2)}<span class="lv">${'●'.repeat(l)}${'○'.repeat(SKILLS[k2].max - l)}</span><span class="nm">${SKILLS[k2].name}</span></div>`)
        .join('');
    }

    // dash cooldown ring
    const cd = Math.max(0, P.dashCd) / (1.8 * (1 - P.skills.flash * 0.12));
    e.dashRing.style.strokeDashoffset = String(cd * 113);
    e.dashRing.parentElement.parentElement.classList.toggle('ready', cd <= 0);

    // combo and fever
    if (P.combo > 1) {
      e.combo.hidden = false;
      if (P.combo !== this.lastCombo) {
        e.comboNum.textContent = P.combo;
        e.comboNum.classList.remove('pop');
        void e.comboNum.offsetWidth;
        e.comboNum.classList.add('pop');
        const bonus = Math.round(Math.min(COMBO.fuelCap, P.combo * COMBO.fuelPerStep) * 100);
        e.comboBonus.textContent = `연료 +${bonus}%`;
      }
      e.comboFill.style.transform = `scaleX(${Math.max(0, P.comboT / COMBO.window).toFixed(3)})`;
      e.combo.classList.toggle('hot', P.combo >= 25);
    } else e.combo.hidden = true;
    this.lastCombo = P.combo;
    const feverOn = P.feverT > 0;
    e.root.classList.toggle('fever', feverOn);
    e.feverFill.style.transform = `scaleX(${(feverOn ? P.feverT / FEVER.duration : P.fever).toFixed(3)})`;
    e.feverLabel.textContent = feverOn ? `화염 폭주 ${P.feverT.toFixed(1)}s` : '화염 폭주';

    // missions and the timed challenge
    const M = g.missions;
    if (M) {
      const act = M.active();
      const now = performance.now();
      this.recentDone = this.recentDone.filter((d) => d.until > now);
      const key = this.recentDone.map((d) => d.m.id).join(',') + '#' + act.map((m) => m.id + M.count(m)).join('|');
      if (key !== this.lastMissions) {
        this.lastMissions = key;
        const rw = { pick: '보상: 새로운 힘', fuel: '보상: 연료 +20%', time: '보상: 제한 시간 +60초' };
        const done = this.recentDone.map((d) => `<li class="done"><span class="m-text">${d.m.text}</span><span class="m-count">완료</span></li>`).join('');
        e.missions.innerHTML =
          done +
          act
            .map((m) => `<li><span class="m-text">${m.text}</span><span class="m-count">${M.count(m)}/${m.goal}</span>${m.reward ? `<span class="m-reward">${rw[m.reward]}</span>` : ''}</li>`)
            .join('');
      }
      const ch = M.challenge;
      if (ch) {
        e.challenge.hidden = false;
        e.chText.textContent = ch.text;
        e.chFill.style.transform = `scaleX(${Math.min(1, ch.progress / ch.n).toFixed(3)})`;
        e.chProgress.textContent = `${Math.min(ch.n, ch.progress)} / ${ch.n}`;
        e.chTime.textContent = `${Math.max(0, ch.t).toFixed(1)}s`;
        e.challenge.classList.toggle('urgent', ch.t < 5);
      } else e.challenge.hidden = true;
    }

    // status chips
    const chips = [];
    const W = g.weather.wind;
    if (W.s > 0.05) {
      const deg = (Math.atan2(W.x, -W.z) * 180) / Math.PI;
      chips.push(`<span class="chip wind"><i style="transform:rotate(${deg.toFixed(0)}deg)">↑</i>강풍 · ${W.name}</span>`);
    }
    if (P.invuln > 0) chips.push('<span class="chip hot">무적</span>');
    if (P.inRain) chips.push('<span class="chip water">빗속! 크기 감소</span>');
    if (g.weather.updraft) chips.push('<span class="chip hot">상승 기류</span>');
    if (P.steam > 0.4) chips.push('<span class="chip steam">수증기 은폐</span>');
    if (g.burnMap.isRetardant(P.pos.x, P.pos.z)) chips.push('<span class="chip red">지연제 구역</span>');
    if (P.mass < MASS.min * 6) chips.push('<span class="chip danger">꺼지기 직전!</span>');
    const html = chips.join('');
    if (html !== this.lastChips) {
      this.lastChips = html;
      e.status.innerHTML = html;
    }

    // objective compass: head north to the city, then find the spirit
    let target = null, label = '';
    if (g.boss.active) {
      target = g.boss.pos;
      label = '물의 정령';
    } else if (tier.id >= 3 && P.pos.z > -150) {
      target = { x: 0, z: -330 };
      label = '북쪽 도시';
    }
    if (target) {
      const dx = target.x - P.pos.x, dz = target.z - P.pos.z;
      const dist = Math.hypot(dx, dz);
      e.objective.hidden = dist < g.rig.dist * 0.6;
      e.objective.classList.toggle('boss', g.boss.active);
      e.objective.firstElementChild.style.transform = `rotate(${Math.atan2(dx, -dz).toFixed(3)}rad)`;
      e.objText.textContent = `${label} ${Math.round(dist)} m`;
    } else e.objective.hidden = true;

    // boss bar
    if (g.boss.active) {
      e.boss.hidden = false;
      e.bossFill.style.transform = `scaleX(${(g.boss.hp / g.boss.maxHp).toFixed(3)})`;
    } else e.boss.hidden = true;

    // popups follow their world anchor
    const cam = g.camera;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > 1.2) {
        p.d.remove();
        this.popups.splice(i, 1);
        continue;
      }
      this.v.copy(p.pos).project(cam);
      const x = (this.v.x * 0.5 + 0.5) * innerWidth;
      const y = (-this.v.y * 0.5 + 0.5) * innerHeight - p.t * 50;
      p.d.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      p.d.style.opacity = String(Math.min(1, (1.2 - p.t) * 3));
    }

    this.mmT -= dt;
    if (this.mmT <= 0) {
      this.mmT = 0.25;
      this.drawMinimap();
    }
  }

  drawMinimap() {
    const g = this.g;
    const c = this.mm;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    c.drawImage(this.mmBase, 0, 0);
    const d = this.charImg.data;
    const ch = g.burnMap.char, rt = g.burnMap.retard;
    for (let i = 0; i < ch.length; i++) {
      const o = i * 4;
      if (rt[i]) {
        d[o] = 200; d[o + 1] = 40; d[o + 2] = 36; d[o + 3] = 230;
      } else if (ch[i]) {
        d[o] = 18; d[o + 1] = 14; d[o + 2] = 12; d[o + 3] = 235;
      } else d[o + 3] = 0;
    }
    this.charCtx.putImageData(this.charImg, 0, 0);
    c.drawImage(this.charCanvas, 0, 0, W, H);
    const sx = W / (WORLD.maxX - WORLD.minX), sz = H / (WORLD.maxZ - WORLD.minZ);
    const X = (x) => (x - WORLD.minX) * sx, Z = (z) => (z - WORLD.minZ) * sz;
    // burning front
    c.fillStyle = 'rgba(255,120,30,0.9)';
    const bl = g.field.burning;
    for (let i = 0; i < bl.length; i += Math.max(1, Math.floor(bl.length / 300))) {
      const id = bl[i];
      c.fillRect(X(g.field.x[id]) - 1, Z(g.field.z[id]) - 1, 2, 2);
    }
    // rain
    for (const zn of g.weather.zones) {
      if (zn.k < 0.1) continue;
      c.fillStyle = `rgba(90,160,255,${0.35 * zn.k})`;
      c.beginPath();
      c.arc(X(zn.x), Z(zn.z), zn.r * sx, 0, Math.PI * 2);
      c.fill();
    }
    // agents
    for (const a of g.enemies.list) {
      if (a.dead || (a.kind !== 'ff' && a.kind !== 'truck' && a.kind !== 'heli')) continue;
      c.fillStyle = a.kind === 'heli' ? '#ffd24a' : '#ff4a3a';
      c.fillRect(X(a.pos.x) - 1.5, Z(a.pos.z) - 1.5, 3, 3);
    }
    if (g.boss.active) {
      c.fillStyle = '#5fb4ff';
      c.beginPath();
      c.arc(X(g.boss.pos.x), Z(g.boss.pos.z), 5, 0, Math.PI * 2);
      c.fill();
    }
    // view + player
    const P = g.player;
    const view = g.rig.dist * 0.9;
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 1;
    c.strokeRect(X(P.pos.x - view * 0.9), Z(P.pos.z - view * 0.55), view * 1.8 * sx, view * 1.1 * sz);
    c.fillStyle = '#ffb347';
    c.beginPath();
    c.arc(X(P.pos.x), Z(P.pos.z), Math.max(2.5, P.r * sx), 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff';
    c.stroke();
  }

  /** Show three skill cards; resolves with the chosen key. */
  choose(options, source) {
    const e = this.el;
    const P = this.g.player;
    e.choose.querySelector('.choose-sub').textContent = source.includes('!') ? source : `${source} 폭발! 진화할 힘을 하나 고르세요`;
    e.cards.innerHTML = options
      .map((k, i) => {
        const lv = P.skills[k];
        const def = SKILLS[k];
        const tag = lv === 0 ? '<span class="new">NEW</span>' : `<span class="lvl">Lv ${lv} → ${lv + 1}</span>`;
        return `<button class="card" data-k="${k}" id="card-${i}">
          <span class="key">${i + 1}</span>
          <span class="card-icon">${svgIcon(k, 40)}</span>
          <span class="card-name">${def.name}</span>
          ${tag}
          <span class="card-desc">${def.desc(lv + 1)}</span>
        </button>`;
      })
      .join('');
    e.choose.hidden = false;
    return new Promise((resolve) => {
      const done = (k) => {
        e.choose.hidden = true;
        e.cards.innerHTML = '';
        this.pickHandler = null;
        resolve(k);
      };
      e.cards.querySelectorAll('.card').forEach((b) => b.addEventListener('click', () => done(b.dataset.k)));
      this.pickHandler = (i) => options[i] && done(options[i]);
      setTimeout(() => e.cards.querySelector('.card')?.focus(), 50);
    });
  }
}

export { WANTED };

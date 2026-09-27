// Igri, the fire spirit. Size is everything: mass → radius → HP and attack.
// Handles movement, dash (the "heat release" that can evaporate water),
// consuming objects, bumps, fuel decay and all seven roguelike skills.
import * as THREE from 'three';
import { MASS, DAMAGE, DASH, SKILLS, tierForRadius } from './config.js';
import { FIRE_NOISE } from './fx/flames.js';

// A swirling pool of fire under Igri so the blaze reads from straight above.
function fireDisc() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime; uniform float uHeat; varying vec2 vUv;
      ${FIRE_NOISE}
      void main() {
        float d = length(vUv);
        float a = atan(vUv.y, vUv.x);
        float n = fbm(vec2(a * 2.2 + uTime * 0.9 + d * 3.0, d * 3.5 - uTime * 1.6));
        float n2 = fbm(vec2(cos(a) * 2.0 + sin(uTime * 0.3), sin(a) * 2.0 - uTime * 0.8) * 1.5 + d * 2.0);
        float body = 1.0 - smoothstep(0.35, 1.0, d + (n - 0.5) * 0.6);
        float core = (1.0 - smoothstep(0.0, 0.55, d)) * (0.6 + n2 * 0.6);
        vec3 col = mix(vec3(0.8, 0.12, 0.02), vec3(1.0, 0.5, 0.1), body);
        col = mix(col, vec3(1.0, 0.82, 0.45), core * 0.8);
        float alpha = body * (0.45 + n2 * 0.55) * uHeat;
        gl_FragColor = vec4(col * alpha * 1.3, 1.0);
      }
    `,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 9;
  return m;
}

function eyeTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'white') {
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.ellipse(32, 32, 22, 29, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#1a0e08';
    g.beginPath();
    g.ellipse(32, 32, 16, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(26, 22, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,200,120,0.6)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Player {
  constructor(g) {
    this.g = g;
    this.mass = MASS.start;
    this.r = MASS.radius(this.mass);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.face = new THREE.Vector3(0, 0, -1);
    this.tier = tierForRadius(this.r);
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector3(0, 0, -1);
    this.dashStart = -10;
    this.hurtCd = {};
    this.hurtLog = {};
    this.hurtFlash = 0;
    this.steam = 0;
    this.alive = true;
    this.control = true;
    this.skills = { wind: 0, oil: 0, spark: 0, heat: 0, coal: 0, whirl: 0, flash: 0 };
    this.timers = { oil: 3, spark: 1, heat: 0, trail: 0, scorch: 0 };
    this.projectiles = [];
    this.trail = [];
    this.orbs = [];
    this.burnRate = 0; // EMA of fuel gained per second
    this.gainAcc = 0;
    this.inRain = false;
    this.bumpCd = 0;
    this.time = 0;

    const scene = g.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    glowMat.color.setRGB(1.5, 0.62, 0.2);
    this.glow = new THREE.Sprite(glowMat);
    this.glow.renderOrder = 14;
    this.group.add(this.glow);
    this.eyes = [];
    const white = new THREE.SpriteMaterial({ map: eyeTexture('white'), depthWrite: false, depthTest: false, transparent: true });
    const pupil = new THREE.SpriteMaterial({ map: eyeTexture('pupil'), depthWrite: false, depthTest: false, transparent: true });
    for (let i = 0; i < 2; i++) {
      const w = new THREE.Sprite(white);
      const p = new THREE.Sprite(pupil);
      w.renderOrder = 20;
      p.renderOrder = 21;
      this.group.add(w, p);
      this.eyes.push({ w, p });
    }
    this.blink = 0;
    this.blinkT = 2;
    this.light = new THREE.PointLight(0xff8a3a, 1, 10, 2);
    this.light.castShadow = false;
    scene.add(this.light);
    this.slots = [];
    for (let i = 0; i < 4; i++) this.slots.push(g.flames.alloc());
    this.ringSlots = [];
    this.disc = fireDisc();
    scene.add(this.disc);
    this.whirlSlots = [];
  }

  get dashing() {
    return this.dashT > 0;
  }

  get level() {
    return this.tier.id;
  }

  setMass(m) {
    this.mass = Math.max(0, Math.min(MASS.max, m));
    this.r = MASS.radius(Math.max(this.mass, 0.01));
    const t = tierForRadius(this.r);
    if (t !== this.tier) {
      const up = t.id > this.tier.id;
      const prev = this.tier;
      this.tier = t;
      this.g.emit('tier', t, up, prev);
    }
  }

  gain(fuel, source = 'direct') {
    if (!this.alive) return;
    const mul = source === 'direct' ? 1 : source === 'skill' ? 0.65 : 0.4;
    const f = fuel * mul;
    this.setMass(this.mass + f);
    this.gainAcc += f;
  }

  hurt(fraction, kind, x, z) {
    if (!this.alive || fraction <= 0) return;
    const coal = this.skills.coal;
    const f = fraction * (1 - coal * 0.1);
    this.hurtLog[kind] = (this.hurtLog[kind] || 0) + this.mass * f;
    this.setMass(this.mass * (1 - f) - 0.01);
    this.hurtFlash = Math.min(1, this.hurtFlash + f * 4 + 0.15);
    this.steam = Math.min(1.5, this.steam + f * 3);
    this.g.fx.steam(this.pos.x, this.r * 0.8, this.pos.z, Math.max(0.3, this.r * 0.8), 3);
    this.g.emit('hurt', kind, f);
  }

  /** One-shot damage with a per-kind cooldown (for hazards that "hit" once). */
  hit(kind, fraction, cooldown = 0.8) {
    if ((this.hurtCd[kind] || 0) > 0) return false;
    this.hurtCd[kind] = cooldown;
    this.hurt(fraction, kind);
    return true;
  }

  update(dt, input) {
    const g = this.g;
    this.time += dt;
    for (const k in this.hurtCd) this.hurtCd[k] -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.bumpCd -= dt;

    // ------------------------------------------------ movement
    const mv = this.control ? input.move(this.pos) : { x: 0, z: 0 };
    const speed = MASS.speed(this.r) * (1 + this.skills.wind * 0.12);
    const tx = mv.x * speed, tz = mv.z * speed;
    const k = 1 - Math.exp(-dt * 7);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    if (Math.hypot(mv.x, mv.z) > 0.1) this.face.set(mv.x, 0, mv.z).normalize();

    this.dashCd -= dt;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const ds = speed * DASH.speedMul;
      this.vel.x = this.dashDir.x * ds;
      this.vel.z = this.dashDir.z * ds;
      g.fx.ember(this.pos.x, this.r * 0.5, this.pos.z, Math.max(0.3, this.r * 0.8), 2);
      g.burnMap.add(this.pos.x, this.pos.z, this.r * 1.2, 0.8, 1);
      if (this.dashT <= 0 && this.skills.flash > 0) {
        g.blast(this.pos.x, this.pos.z, this.r * (1.2 + this.skills.flash * 0.45), this.r * 1.1, 1 + this.skills.flash * 0.8, 'skill');
      }
    }

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    this.pos.x = THREE.MathUtils.clamp(nx, g.bounds.minX + 2, g.bounds.maxX - 2);
    this.pos.z = THREE.MathUtils.clamp(nz, g.bounds.minZ + 2, g.bounds.maxZ - 2);

    // ------------------------------------------------ consume / bump
    const r = this.r;
    const field = g.field;
    let bumped = false;
    field.query(this.pos.x, this.pos.z, r + 0.2, (id, d) => {
      const st = field.state[id];
      const size = field.size[id];
      if (st === 2) return;
      if (st === 0 && d < r + size * 0.6 && field.need[id] <= r) {
        field.ignite(id, 0);
        this.gain(field.fuel[id], 'direct');
        return;
      }
      if ((st === 3 || (st === 0 && field.need[id] > r)) && size > 0.12 && d < r * 0.8 + size) {
        // too big (or retardant-coated): shove back and lose a bit
        const dx = this.pos.x - field.x[id], dz = this.pos.z - field.z[id];
        const l = Math.hypot(dx, dz) || 1;
        const push = r * 0.8 + size - d;
        this.pos.x += (dx / l) * push;
        this.pos.z += (dz / l) * push;
        const vn = (this.vel.x * dx + this.vel.z * dz) / l;
        if (vn < 0) {
          this.vel.x -= (dx / l) * vn * 1.4;
          this.vel.z -= (dz / l) * vn * 1.4;
        }
        // only a real impact costs mass, not leaning against a trunk
        if (!bumped && this.bumpCd <= 0 && (vn < -1.2 || this.dashing)) {
          bumped = true;
          this.bumpCd = 0.6;
          this.hurt(st === 3 ? DAMAGE.bump * 2 : DAMAGE.bump, st === 3 ? 'retardant' : 'bump');
          g.emit('bump', id);
        }
      }
    });

    // water bodies
    if (g.layout.isWater(this.pos.x, this.pos.z)) {
      if (this.dashing) {
        g.fx.steam(this.pos.x, 0.3, this.pos.z, Math.max(0.4, r), 2);
      } else {
        const big = this.r >= 10 ? 0.3 : this.r >= 3 ? 0.5 : 1;
        this.hurt(DAMAGE.water * big * dt, 'water');
        this.steam = Math.min(1.5, this.steam + dt * 1.5);
      }
    }
    // retardant ground
    if (g.burnMap.isRetardant(this.pos.x, this.pos.z) && !this.dashing) this.hurt(DAMAGE.retardant * dt, 'retardant');

    // ------------------------------------------------ fuel decay
    const decay = MASS.decay(this.mass) * (1 - this.skills.coal * 0.12);
    this.setMass(this.mass - decay * dt);
    this.burnRate += (this.gainAcc / Math.max(dt, 1e-3) - this.burnRate) * Math.min(1, dt * 1.2);
    this.gainAcc = 0;
    this.steam = Math.max(0, this.steam - dt * 0.35);
    if (this.mass < MASS.min && this.alive) {
      this.alive = false;
      g.emit('dead');
    }

    // scorch trail
    this.timers.scorch -= dt;
    if (this.timers.scorch <= 0) {
      this.timers.scorch = 0.07;
      g.burnMap.add(this.pos.x, this.pos.z, Math.max(0.5, r * 0.95), Math.min(1, 0.55 + r * 0.2), r < 3 ? 0.45 : 0.6);
    }

    this.updateSkills(dt);
    this.updateVisuals(dt);
  }

  startDash(input) {
    if (this.dashCd > 0 || !this.alive || !this.control) return false;
    const mv = input.move(this.pos);
    if (Math.hypot(mv.x, mv.z) > 0.1) this.dashDir.set(mv.x, 0, mv.z).normalize();
    else this.dashDir.copy(this.face);
    this.dashT = DASH.duration;
    this.dashStart = this.time;
    this.dashCd = DASH.cooldown * (1 - this.skills.flash * 0.12);
    this.setMass(this.mass * (1 - DASH.cost));
    this.g.emit('dash');
    return true;
  }

  // ------------------------------------------------------------ skills
  addSkill(key) {
    this.skills[key] = Math.min(SKILLS[key].max, this.skills[key] + 1);
    if (key === 'whirl') this.syncOrbs();
  }

  syncOrbs() {
    const n = this.skills.whirl;
    while (this.orbs.length < n) this.orbs.push({ a: (this.orbs.length / Math.max(1, n)) * Math.PI * 2, slot: this.g.flames.alloc(), x: 0, z: 0 });
    this.orbs.forEach((o, i) => (o.a = (i / n) * Math.PI * 2));
  }

  updateSkills(dt) {
    const g = this.g;
    const s = this.skills;
    const r = this.r;
    const x = this.pos.x, z = this.pos.z;

    // wind: lingering trail fires
    if (s.wind > 0) {
      this.timers.trail -= dt;
      if (this.timers.trail <= 0 && Math.hypot(this.vel.x, this.vel.z) > 0.5) {
        this.timers.trail = 0.12;
        if (this.trail.length > 70) {
          const old = this.trail.shift();
          g.flames.release(old.slot);
        }
        this.trail.push({ x, z, r: r * 0.75, t: 0, dur: 1.6 + s.wind * 0.6, slot: g.flames.alloc() });
      }
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const f = this.trail[i];
      f.t += dt;
      const k = 1 - f.t / f.dur;
      if (k <= 0) {
        g.flames.release(f.slot);
        this.trail.splice(i, 1);
        continue;
      }
      g.flames.set(f.slot, f.x, 0, f.z, f.r * 2, f.r * 2.2 * (0.4 + k), 0.7 * k);
      if (Math.random() < dt * 6) {
        g.field.query(f.x, f.z, f.r, (id) => {
          if (g.field.state[id] === 0 && g.field.need[id] <= r * 0.8) {
            g.field.ignite(id, 2);
            this.gain(g.field.fuel[id], 'trail');
          }
        });
        g.enemies.damageAt(f.x, f.z, f.r, 0.8 * dt * 6);
      }
    }

    // oil: periodic radial blast
    if (s.oil > 0) {
      this.timers.oil -= dt;
      if (this.timers.oil <= 0) {
        this.timers.oil = 6.2 - s.oil * 0.7;
        g.blast(x, z, r * (2.3 + s.oil * 0.45), r * 1.2, 2 + s.oil, 'skill');
      }
    }

    // sparks: homing embers
    if (s.spark > 0) {
      this.timers.spark -= dt;
      if (this.timers.spark <= 0) {
        this.timers.spark = 1.7 - s.spark * 0.2;
        const range = r * 9 + 14;
        const targets = g.enemies.targets(x, z, range, s.spark);
        if (g.boss && g.boss.active) {
          const bd = Math.hypot(g.boss.pos.x - x, g.boss.pos.z - z);
          if (bd < range * 2.5) targets.unshift({ boss: true });
        }
        const used = new Set();
        while (targets.length < s.spark) {
          let best = -1, bd = Infinity;
          g.field.query(x, z, range, (id, d) => {
            if (g.field.state[id] !== 0 || used.has(id) || g.field.need[id] > r * 1.25 || g.field.need[id] < r * 0.25) return;
            if (d < bd && d > r) {
              bd = d;
              best = id;
            }
          });
          if (best < 0) break;
          used.add(best);
          targets.push({ obj: best });
        }
        for (let i = 0; i < Math.min(s.spark, targets.length); i++) this.launchSpark(targets[i], i);
      }
    }
    this.updateSparks(dt);

    // heat aura
    if (s.heat > 0) {
      this.timers.heat -= dt;
      if (this.timers.heat <= 0) {
        this.timers.heat = 0.2;
        const ar = r * (1.25 + s.heat * 0.2);
        g.field.query(x, z, ar, (id, d) => {
          if (g.field.state[id] === 0 && g.field.need[id] <= r && d < ar) {
            g.field.ignite(id, 2);
            this.gain(g.field.fuel[id], 'skill');
          }
        });
      }
    }

    // whirl: orbiting fireballs
    if (this.orbs.length) {
      const R = r * 2.2 + 0.6;
      for (const o of this.orbs) {
        o.a += dt * (2.6 - Math.min(1.4, r * 0.05));
        o.x = x + Math.cos(o.a) * R;
        o.z = z + Math.sin(o.a) * R;
        const w = r * 0.9 + 0.2;
        g.flames.set(o.slot, o.x, 0, o.z, w, w * 1.6, 1);
        const hr = r * 0.5 + 0.2;
        g.field.query(o.x, o.z, hr, (id) => {
          if (g.field.state[id] === 0 && g.field.need[id] <= r) {
            g.field.ignite(id, 2);
            this.gain(g.field.fuel[id], 'skill');
          }
        });
        g.enemies.damageAt(o.x, o.z, hr + 1, 1.5 * dt);
        if (g.boss && g.boss.active) g.boss.damageAt(o.x, o.z, hr, 1 * dt);
        if (Math.random() < dt * 8) g.fx.ember(o.x, w * 0.5, o.z, w * 0.5, 1);
      }
    }
  }

  launchSpark(target, i) {
    const g = this.g;
    const a = Math.random() * Math.PI * 2;
    const sp = 14 + this.r * 3;
    this.projectiles.push({
      x: this.pos.x, y: this.r * 0.8, z: this.pos.z,
      vx: Math.cos(a) * sp * 0.6, vz: Math.sin(a) * sp * 0.6,
      target, t: 0, slot: g.flames.alloc(), sp,
    });
    g.emit('spark');
  }

  updateSparks(dt) {
    const g = this.g;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      let tx, tz, alive = true;
      if (p.target.obj !== undefined) {
        const id = p.target.obj;
        tx = g.field.x[id];
        tz = g.field.z[id];
        if (g.field.state[id] !== 0) alive = false;
      } else if (p.target.boss) {
        tx = g.boss.pos.x;
        tz = g.boss.pos.z;
        alive = g.boss.active;
      } else {
        const e = p.target.agent;
        tx = e.pos.x;
        tz = e.pos.z;
        alive = !e.dead;
      }
      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const steer = Math.min(1, dt * (4 + p.t * 6));
      p.vx += ((dx / (d || 1)) * p.sp - p.vx) * steer;
      p.vz += ((dz / (d || 1)) * p.sp - p.vz) * steer;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const w = 0.25 + this.r * 0.25;
      g.flames.set(p.slot, p.x, p.y * 0.5, p.z, w, w * 1.8, 1);
      if (Math.random() < 0.5) g.fx.ember(p.x, p.y * 0.5, p.z, w * 0.6, 1);
      const hitR = p.target.boss ? 28 : 1 + this.r * 0.3;
      if (d < hitR || p.t > 3 || !alive) {
        if (alive && p.t <= 3) {
          if (p.target.obj !== undefined) {
            const id = p.target.obj;
            if (g.field.state[id] === 0) {
              g.field.ignite(id, 2);
              this.gain(g.field.fuel[id], 'skill');
            }
          } else if (p.target.boss) {
            g.boss.hurt(0.6 + this.skills.spark * 0.15, 'spark');
          } else {
            g.enemies.damage(p.target.agent, 1 + this.skills.spark * 0.3);
          }
          g.fx.burst(p.x, 0.2, p.z, Math.max(0.2, this.r * 0.2), 8);
        }
        g.flames.release(p.slot);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ visuals
  updateVisuals(dt) {
    const g = this.g;
    const r = this.r;
    const x = this.pos.x, z = this.pos.z;
    const t = this.time;
    const pulse = 1 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.03;
    const hot = this.alive ? 1 : 0;
    const dashBoost = this.dashing ? 1.3 : 1;
    const H = r * 3.4 * pulse * dashBoost;
    g.flames.set(this.slots[0], x, -r * 0.1, z, r * 2.6, H, 0.6 * hot);
    g.flames.set(this.slots[1], x, 0, z, r * 1.6, H * 0.7, 0.5 * hot);
    const lick = Math.sin(t * 5.3) * r * 0.45;
    g.flames.set(this.slots[2], x - this.face.x * r * 0.5 + lick * 0.3, 0, z - this.face.z * r * 0.5, r * 1.3, H * 0.6, 0.4 * hot);
    g.flames.set(this.slots[3], x + Math.cos(t * 2.1) * r * 0.5, 0, z + Math.sin(t * 2.1) * r * 0.5, r * 1.1, H * 0.55, 0.35 * hot);
    // ground pool of fire + a ring of flames once the blaze is big
    this.disc.position.set(x, 0.05 + r * 0.01, z);
    this.disc.scale.setScalar(r * 1.45);
    this.disc.material.uniforms.uTime.value = t;
    this.disc.material.uniforms.uHeat.value = hot * (r < 1 ? 0.3 : r < 3 ? 0.55 : 0.8);
    const want = this.alive ? Math.min(16, r >= 2.5 ? 5 + Math.floor(r * 0.6) : 0) : 0;
    while (this.ringSlots.length < want) this.ringSlots.push(g.flames.alloc());
    while (this.ringSlots.length > want) g.flames.release(this.ringSlots.pop());
    for (let i = 0; i < this.ringSlots.length; i++) {
      const a = (i / this.ringSlots.length) * Math.PI * 2 + t * 0.6;
      const wob = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.7);
      const rr = r * (0.72 + 0.12 * Math.sin(t * 1.3 + i));
      g.flames.set(this.ringSlots[i], x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr, r * 0.9, r * 1.9 * wob, 0.5);
    }
    this.glow.position.set(x, r * 0.7, z);
    this.glow.scale.setScalar(r * 2.6 * pulse);
    this.glow.material.opacity = 0.4 * hot;

    // eyes follow the direction of travel; blink now and then
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.14;
      this.blinkT = 2.5 + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt);
    const eyeY = r * 1.15;
    const sx = r * 0.36;
    const cam = g.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const lookX = THREE.MathUtils.clamp(this.vel.x / (MASS.speed(r) || 1), -1, 1);
    const lookZ = THREE.MathUtils.clamp(this.vel.z / (MASS.speed(r) || 1), -1, 1);
    const hurtSquint = this.hurtFlash > 0.5 ? 0.35 : 1;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const e = this.eyes[i];
      const base = new THREE.Vector3(x, eyeY, z).addScaledVector(right, side * sx * 1.05).addScaledVector(up, r * 0.1);
      e.w.position.copy(base);
      const open = this.blink > 0 ? 0.12 : hurtSquint;
      e.w.scale.set(sx * 1.25, sx * 1.6 * open, 1);
      e.p.position.copy(base).addScaledVector(right, lookX * sx * 0.3).addScaledVector(up, -lookZ * sx * 0.3);
      e.p.scale.set(sx * 0.8, sx * 1.05 * open, 1);
      e.w.visible = e.p.visible = this.alive;
    }

    this.light.position.set(x, r * 1.5 + 0.3, z);
    this.light.intensity = this.alive ? (0.4 + r * r * 5) * pulse : 0;
    this.light.distance = r * 14 + 4;

    if (Math.random() < dt * (6 + r)) g.fx.ember(x, r, z, Math.max(0.12, r * 0.5), 1);
    if (Math.random() < dt * 2.5) g.fx.smoke(x, r * 2.2, z, Math.max(0.2, r * 0.9), 0.6);
    if (this.steam > 0.3 && Math.random() < dt * 20) g.fx.steam(x, r, z, Math.max(0.3, r * 0.9), 1);
  }

  dispose() {
    for (const s of this.slots) this.g.flames.release(s);
    for (const s of this.ringSlots) this.g.flames.release(s);
    for (const o of this.orbs) this.g.flames.release(o.slot);
    for (const f of this.trail) this.g.flames.release(f.slot);
    for (const p of this.projectiles) this.g.flames.release(p.slot);
    this.g.scene.remove(this.group, this.light);
  }
}

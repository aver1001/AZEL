// Everything that moves: small animals (a threat to an ember, food for a
// campfire), residents who flee and evacuate, and the escalating response —
// firefighters with extinguishers, fire trucks with water cannons (weak rear
// engine), and helicopters that lay fire-retardant lines and drop water.
import * as THREE from 'three';
import { DAMAGE } from './config.js';
import { rabbitGeo, squirrelGeo, personGeo, firefighterGeo, truckGeo, truckEngineGeo, heliGeo, rotorGeo, bucketGeo } from './models/agents.js';

const SHIRTS = [0x4f7fb8, 0xd9d9d9, 0xc9574b, 0x6aa06a, 0xe0b44a, 0x8a6fb0, 0x5a5a60];
const tmp = new THREE.Vector3();

function ringMesh(color) {
  const geo = new THREE.RingGeometry(0.9, 1, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 8;
  return m;
}

export class Enemies {
  constructor(g) {
    this.g = g;
    this.list = [];
    const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mat = lam;
    this.geo = {
      rabbit: rabbitGeo(),
      squirrel: squirrelGeo(),
      firefighter: firefighterGeo(),
      truck: truckGeo(),
      engine: truckEngineGeo(),
      heli: heliGeo(),
      rotor: rotorGeo(),
      bucket: bucketGeo(),
      people: SHIRTS.map((c) => personGeo(c)),
    };
    this.spawnT = { animal: 0, civ: 0, ff: 2, truck: 4, heli: 6 };
    this.stats = {
      firefighters: 0, trucks: 0, helis: 0, evacuated: 0, injured: 0,
      animalsLost: 0, retreated: 0, trucksDestroyed: 0, helisDowned: 0, retardantDrops: 0,
    };
  }

  count(kind) {
    let n = 0;
    for (const a of this.list) if (a.kind === kind && !a.dead) n++;
    return n;
  }

  spawnPoint(dist, preferRoad = false) {
    const g = this.g;
    const p = g.player.pos;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = dist * (0.85 + Math.random() * 0.3);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (x < g.bounds.minX + 5 || x > g.bounds.maxX - 5 || z < g.bounds.minZ + 5 || z > g.bounds.maxZ - 5) continue;
      if (g.layout.isWater(x, z) || g.burnMap.isRetardant(x, z)) continue;
      best = { x, z };
      if (!preferRoad || g.layout.isRoad(x, z)) return best;
    }
    return best;
  }

  add(kind, x, z, extra = {}) {
    let mesh;
    const g = this.g;
    if (kind === 'animal') {
      const sq = Math.random() < 0.45;
      mesh = new THREE.Mesh(sq ? this.geo.squirrel : this.geo.rabbit, this.mat);
    } else if (kind === 'civ') {
      mesh = new THREE.Mesh(this.geo.people[Math.floor(Math.random() * SHIRTS.length)], this.mat);
    } else if (kind === 'ff') {
      mesh = new THREE.Mesh(this.geo.firefighter, this.mat);
      this.stats.firefighters++;
    } else if (kind === 'truck') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(this.geo.truck, this.mat);
      body.castShadow = true;
      const engMat = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
      const eng = new THREE.Mesh(this.geo.engine, engMat);
      mesh.add(body, eng);
      mesh.userData.engine = engMat;
      this.stats.trucks++;
    } else if (kind === 'heli') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(this.geo.heli, this.mat);
      body.castShadow = true;
      const rotor = new THREE.Mesh(this.geo.rotor, this.mat);
      rotor.position.y = 1.9;
      const bucket = new THREE.Mesh(this.geo.bucket, this.mat);
      bucket.position.y = -7;
      mesh.add(body, rotor, bucket);
      mesh.userData.rotor = rotor;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(4, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 3;
      g.scene.add(shadow);
      extra.shadow = shadow;
      this.stats.helis++;
    }
    mesh.position.set(x, 0, z);
    g.scene.add(mesh);
    const a = {
      kind, mesh, pos: mesh.position, vel: new THREE.Vector3(), yaw: Math.random() * 6.28,
      hp: { animal: 1, civ: 1, ff: 1.5, truck: 8, heli: 10 }[kind], t: 0, dead: false, state: 'idle', stateT: 0,
      aimYaw: 0, target: null, ...extra,
    };
    if (kind === 'animal') a.scale = 0.9 + Math.random() * 0.4;
    if (kind === 'heli') {
      a.alt = 30 + g.player.r * 1.6;
      a.pos.y = a.alt;
      a.state = 'approach';
    }
    this.list.push(a);
    return a;
  }

  remove(a) {
    a.dead = true;
    this.g.scene.remove(a.mesh);
    if (a.shadow) this.g.scene.remove(a.shadow);
    if (a.ring) this.g.scene.remove(a.ring);
  }

  /** Hostile agents near a point, nearest first (for homing sparks). */
  targets(x, z, range, n) {
    const out = [];
    for (const a of this.list) {
      if (a.dead || a.state === 'retreat' || a.state === 'falling') continue;
      if (a.kind !== 'ff' && a.kind !== 'truck' && a.kind !== 'heli') continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      if (d < range) out.push({ agent: a, d });
    }
    out.sort((p, q) => p.d - q.d);
    return out.slice(0, n);
  }

  damageAt(x, z, r, amount) {
    for (const a of this.list) {
      if (a.dead || a.kind === 'civ' || a.kind === 'animal') continue;
      const reach = a.kind === 'truck' ? 3.5 : a.kind === 'heli' ? 5 : 0.5;
      if (Math.hypot(a.pos.x - x, a.pos.z - z) < r + reach) this.damage(a, amount);
    }
  }

  damage(a, amount) {
    if (a.dead || a.state === 'retreat' || a.state === 'falling') return;
    a.hp -= amount;
    if (a.hp > 0) return;
    const g = this.g;
    if (a.kind === 'ff') {
      a.state = 'retreat';
      a.stateT = 3;
      this.stats.retreated++;
    } else if (a.kind === 'truck') {
      this.explodeTruck(a, false);
    } else if (a.kind === 'heli') {
      a.state = 'falling';
      a.stateT = 0;
      g.emit('toast', '소방 헬기 추락!');
    }
  }

  explodeTruck(a, rearHit) {
    const g = this.g;
    this.stats.trucksDestroyed++;
    this.remove(a);
    g.blast(a.pos.x, a.pos.z, 16 + g.player.r * 0.6, Math.max(4, g.player.r * 1.1), 3, 'blast');
    g.emit('truckExplode', a, rearHit);
  }

  update(dt, view) {
    const g = this.g;
    const P = g.player;
    const r = P.r;
    const tier = P.tier.id;
    const stars = g.stars;
    const zone = g.zoneAt(P.pos.z);
    const cloak = P.steam > 0.4;

    // ------------------------------------------------ spawning
    for (const k in this.spawnT) this.spawnT[k] -= dt;
    if (this.spawnT.animal <= 0) {
      this.spawnT.animal = 1.2;
      if (tier <= 2 && (zone === 'forest' || zone === 'rural') && this.count('animal') < (tier === 1 ? 7 : 12)) {
        const sp = this.spawnPoint(tier === 1 ? 5 + Math.random() * 6 : view * 0.7);
        if (sp) this.add('animal', sp.x, sp.z, { curious: Math.random() < 0.45 });
      }
    }
    if (this.spawnT.civ <= 0) {
      this.spawnT.civ = 1.5;
      if (tier >= 2 && zone !== 'forest' && this.count('civ') < 16) {
        const sp = this.spawnPoint(view * 0.8, true);
        if (sp) this.add('civ', sp.x, sp.z);
      }
    }
    if (this.spawnT.ff <= 0) {
      this.spawnT.ff = 2.6;
      const max = tier >= 2 ? Math.min([0, 2, 4, 6, 8, 10][stars], tier === 2 ? 4 : 12) : 0;
      if (this.count('ff') < max) {
        const sp = this.spawnPoint(view * 1.0, true);
        if (sp) {
          this.add('ff', sp.x, sp.z);
          if (this.stats.firefighters === 1) g.emit('toast', '소방관이 출동했습니다 — 소화기를 조심하세요');
        }
      }
    }
    if (this.spawnT.truck <= 0) {
      this.spawnT.truck = 7;
      const max = tier >= 3 ? [0, 0, 1, 2, 3, 4][stars] : 0;
      if (this.count('truck') < max) {
        const sp = this.spawnPoint(view * 1.25, true);
        if (sp) {
          this.add('truck', sp.x, sp.z);
          g.emit('siren');
          if (this.stats.trucks === 1) g.emit('toast', '소방차 출동! 정면은 물대포, 후방 엔진룸이 약점');
        }
      }
    }
    if (this.spawnT.heli <= 0) {
      this.spawnT.heli = 14;
      const max = (tier >= 4 ? 1 : 0) + (stars >= 4 ? 1 : 0) + (stars >= 5 ? 1 : 0);
      if (this.count('heli') < max) {
        const sp = this.spawnPoint(view * 1.4);
        if (sp) {
          this.add('heli', sp.x, sp.z);
          if (this.stats.helis === 1) g.emit('toast', '소방 헬기 접근 — 붉은 지연제를 뿌려 길을 막습니다');
        }
      }
    }

    // ------------------------------------------------ behaviours
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.dead) {
        this.list.splice(i, 1);
        continue;
      }
      a.t += dt;
      const dx = P.pos.x - a.pos.x, dz = P.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > view * 3 + 60 && a.kind !== 'heli') {
        if (a.kind === 'civ' && a.state === 'flee') this.stats.evacuated++;
        this.remove(a);
        continue;
      }
      if (g.boss && g.boss.active && a.kind !== 'heli' && d > view * 2) {
        this.remove(a);
        continue;
      }
      this['tick_' + a.kind](a, dt, d, dx, dz, r, tier, cloak, view);
    }
  }

  moveToward(a, tx, tz, speed, dt, turn = 6) {
    const dx = tx - a.pos.x, dz = tz - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return d;
    const want = Math.atan2(dx, dz);
    let dy = want - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    a.yaw += THREE.MathUtils.clamp(dy, -turn * dt, turn * dt);
    const step = Math.min(d, speed * dt);
    const nx = a.pos.x + Math.sin(a.yaw) * step, nz = a.pos.z + Math.cos(a.yaw) * step;
    if (!this.g.layout.isWater(nx, nz)) {
      a.pos.x = nx;
      a.pos.z = nz;
    } else a.yaw += 1.5;
    a.mesh.rotation.y = a.yaw;
    return d;
  }

  tick_animal(a, dt, d, dx, dz, r, tier) {
    const g = this.g;
    a.mesh.scale.setScalar(a.scale);
    a.stateT -= dt;
    if (r >= 0.9) {
      // prey now
      if (d < r + 0.25) {
        this.stats.animalsLost++;
        g.player.gain(3.2, 'direct');
        g.fx.burst(a.pos.x, 0.2, a.pos.z, 0.3, 10);
        g.fx.smoke(a.pos.x, 0.3, a.pos.z, 0.5, 0.6);
        g.emit('animal');
        this.remove(a);
        return;
      }
      if (d < r * 6 + 5) {
        this.moveToward(a, a.pos.x - dx, a.pos.z - dz, 4.5 + Math.random(), dt, 8);
      } else this.wander(a, dt, 1.2);
    } else {
      if (a.curious && d < 7) {
        this.moveToward(a, g.player.pos.x, g.player.pos.z, 1.9, dt, 4);
      } else this.wander(a, dt, 1.6);
      if (d < r + 0.14) {
        if (g.player.hit('animal', DAMAGE.animal, 1.3)) {
          g.emit('popup', '밟혔다!', g.player.pos);
          a.curious = false;
          a.stateT = 3;
          this.moveToward(a, a.pos.x - dx * 5, a.pos.z - dz * 5, 3, 0.2);
        }
      }
    }
    a.pos.y = Math.abs(Math.sin(a.t * 9)) * 0.08 * a.scale;
  }

  wander(a, dt, speed) {
    if (!a.target || a.stateT <= 0 || Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 0.3) {
      const ang = Math.random() * Math.PI * 2;
      a.target = { x: a.pos.x + Math.cos(ang) * (2 + Math.random() * 6), z: a.pos.z + Math.sin(ang) * (2 + Math.random() * 6) };
      a.stateT = 2 + Math.random() * 3;
    }
    this.moveToward(a, a.target.x, a.target.z, speed, dt, 5);
  }

  tick_civ(a, dt, d, dx, dz, r, tier, cloak, view) {
    const g = this.g;
    if (d < r + 0.35 && r >= 3) {
      this.stats.injured++;
      g.fx.smoke(a.pos.x, 1, a.pos.z, 0.8, 0.5);
      this.remove(a);
      return;
    }
    if (d < r * 4 + 14 || a.state === 'flee') {
      if (a.state !== 'flee') g.emit('scream', a);
      a.state = 'flee';
      this.moveToward(a, a.pos.x - dx, a.pos.z - dz, 4.6, dt, 7);
      if (d > view * 1.8) {
        this.stats.evacuated++;
        this.remove(a);
        return;
      }
    } else {
      a.stateT -= dt;
      this.wander(a, dt, 1.3);
    }
    a.pos.y = Math.abs(Math.sin(a.t * (a.state === 'flee' ? 14 : 7))) * 0.06;
  }

  tick_ff(a, dt, d, dx, dz, r, tier, cloak) {
    const g = this.g;
    if (a.state === 'retreat') {
      a.stateT -= dt;
      this.moveToward(a, a.pos.x - dx, a.pos.z - dz, 6, dt, 8);
      if (a.stateT <= 0) this.remove(a);
      return;
    }
    if (r >= 3 && d < r + 0.8) {
      a.state = 'retreat';
      a.stateT = 3;
      this.stats.retreated++;
      g.emit('popup', '후퇴!', a.pos);
      return;
    }
    const keep = r + 4.2;
    if (d > keep) {
      this.moveToward(a, g.player.pos.x, g.player.pos.z, 3.4, dt, 5);
      a.pos.y = Math.abs(Math.sin(a.t * 12)) * 0.05;
    } else {
      a.yaw = Math.atan2(dx, dz);
      a.mesh.rotation.y = a.yaw;
    }
    // spray
    const range = r + 7.5;
    if (d < range + 3) {
      const jitter = cloak ? Math.sin(a.t * 2.3) * 0.9 : Math.sin(a.t * 3) * 0.08;
      const aim = a.yaw + jitter;
      const fx = Math.sin(aim), fz = Math.cos(aim);
      const nx = a.pos.x + fx * 0.5, nz = a.pos.z + fz * 0.5;
      for (let k = 0; k < 2; k++) {
        const sp = 9 + Math.random() * 4;
        g.fx.foam(nx, 1.0, nz, (fx + (Math.random() - 0.5) * 0.35) * sp, 0.5 + Math.random(), (fz + (Math.random() - 0.5) * 0.35) * sp, 0.8);
      }
      // is the player inside the cone?
      const ang = Math.acos(THREE.MathUtils.clamp((dx * fx + dz * fz) / (d || 1), -1, 1));
      if (ang < 0.42 && d < range) {
        if (g.player.dashing) g.fx.steam(g.player.pos.x, 0.5, g.player.pos.z, Math.max(0.4, r), 1);
        else {
          g.player.hurt(DAMAGE.foam * dt, 'foam');
          g.player.steam = Math.min(1.5, g.player.steam + dt * 0.8);
        }
      }
      a.stateT -= dt;
      if (a.stateT <= 0) {
        a.stateT = 0.5;
        g.field.extinguish(a.pos.x + fx * 4, a.pos.z + fz * 4, 3);
      }
    }
  }

  tick_truck(a, dt, d, dx, dz, r, tier, cloak) {
    const g = this.g;
    const standoff = r + 15;
    if (d > standoff) this.moveToward(a, g.player.pos.x, g.player.pos.z, 15, dt, 1.4);
    else {
      // swing the nose toward the fire
      const want = Math.atan2(dx, dz);
      let dy = want - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.yaw += THREE.MathUtils.clamp(dy, -0.6 * dt, 0.6 * dt);
      a.mesh.rotation.y = a.yaw;
    }
    // engine hatch pulses as a hint
    a.mesh.userData.engine.color.setRGB(2.5 + Math.sin(a.t * 6) * 1.2, 0.8, 0.15);

    // cannon aim lags behind the player
    const want = Math.atan2(dx, dz) + (cloak ? Math.sin(a.t * 1.7) * 0.7 : 0);
    let dy = want - a.aimYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    a.aimYaw += THREE.MathUtils.clamp(dy, -1.1 * dt, 1.1 * dt);
    const len = 22 + r * 1.1;
    const fx = Math.sin(a.aimYaw), fz = Math.cos(a.aimYaw);
    const ox = a.pos.x + Math.sin(a.yaw) * 2.4, oz = a.pos.z + Math.cos(a.yaw) * 2.4;
    if (d < len + r + 6) {
      for (let k = 0; k < 3; k++) {
        const sp = 18 + Math.random() * 8;
        g.fx.water(ox, 3, oz, (fx + (Math.random() - 0.5) * 0.08) * sp, 5 + Math.random() * 2, (fz + (Math.random() - 0.5) * 0.08) * sp, 1.2 + r * 0.05);
      }
      // player vs stream segment
      const px = g.player.pos.x - ox, pz = g.player.pos.z - oz;
      const tproj = THREE.MathUtils.clamp(px * fx + pz * fz, 0, len);
      const cx = px - fx * tproj, cz = pz - fz * tproj;
      if (Math.hypot(cx, cz) < r + 1.4) {
        if (g.player.dashing) g.fx.steam(g.player.pos.x, 0.5, g.player.pos.z, Math.max(0.5, r), 2);
        else {
          g.player.hurt(DAMAGE.truck * dt, 'truck');
          g.player.steam = Math.min(1.5, g.player.steam + dt);
        }
      }
      a.stateT -= dt;
      if (a.stateT <= 0) {
        a.stateT = 0.4;
        g.field.extinguish(ox + fx * len * 0.7, oz + fz * len * 0.7, 5);
      }
    }
    // ramming: the rear engine room is the weak spot
    if (d < r + 3.6) {
      const fwdX = Math.sin(a.yaw), fwdZ = Math.cos(a.yaw);
      const rel = (dx * fwdX + dz * fwdZ) / (d || 1);
      if (rel < -0.4 || r > 12) {
        this.explodeTruck(a, true);
        return;
      }
      const l = d || 1;
      g.player.pos.x = a.pos.x + (dx / l) * (r + 3.6);
      g.player.pos.z = a.pos.z + (dz / l) * (r + 3.6);
      g.player.hit('truckBump', DAMAGE.bump * 2, 0.5);
    }
  }

  tick_heli(a, dt, d, dx, dz, r, tier, cloak, view) {
    const g = this.g;
    const rotor = a.mesh.userData.rotor;
    rotor.rotation.y += dt * 28;
    a.shadow.position.set(a.pos.x, 0.2, a.pos.z);
    a.alt += ((30 + r * 1.6) - a.alt) * dt * 0.5;
    if (a.state === 'falling') {
      a.stateT += dt;
      a.pos.y -= dt * (8 + a.stateT * 18);
      a.mesh.rotation.y += dt * 6;
      a.mesh.rotation.z = Math.min(0.8, a.stateT);
      g.fx.smoke(a.pos.x, a.pos.y, a.pos.z, 2, 0.9);
      if (a.pos.y <= 1) {
        this.stats.helisDowned++;
        this.remove(a);
        g.blast(a.pos.x, a.pos.z, 20, Math.max(5, r), 3, 'blast');
      }
      return;
    }
    a.pos.y = a.alt + Math.sin(a.t * 1.3) * 0.6;
    const P = g.player;
    const velLen = Math.hypot(P.vel.x, P.vel.z);
    const hx = velLen > 1 ? P.vel.x / velLen : Math.sin(a.t * 0.3), hz = velLen > 1 ? P.vel.z / velLen : -1;
    if (a.state === 'approach') {
      this.moveToward(a, P.pos.x, P.pos.z, 38, dt, 1.4);
      if (d < 70) {
        a.state = Math.random() < 0.55 ? 'plan-retardant' : 'plan-drop';
      }
    }
    if (a.state === 'plan-retardant') {
      // lay a line across the fire's path
      const L = 110 + r * 5;
      const cx = P.pos.x + hx * (r * 4 + 45) + (cloak ? (Math.random() - 0.5) * 60 : 0);
      const cz = P.pos.z + hz * (r * 4 + 45) + (cloak ? (Math.random() - 0.5) * 60 : 0);
      const px = -hz, pz = hx;
      a.line = { sx: cx - px * L / 2, sz: cz - pz * L / 2, ex: cx + px * L / 2, ez: cz + pz * L / 2, w: 9 + r * 0.4 };
      a.state = 'to-line';
    }
    if (a.state === 'to-line') {
      if (this.moveToward(a, a.line.sx, a.line.sz, 45, dt, 2.2) < 4) {
        a.state = 'dropping';
        this.stats.retardantDrops++;
        g.emit('toast', '지연제 투하 — 붉은 구역은 절대 타지 않습니다');
      }
    }
    if (a.state === 'dropping') {
      const dd = this.moveToward(a, a.line.ex, a.line.ez, 30, dt, 3);
      a.dropAcc = (a.dropAcc || 0) + dt;
      if (a.dropAcc > 0.08) {
        a.dropAcc = 0;
        g.burnMap.add(a.pos.x, a.pos.z, a.line.w * 0.55, 0, 0, 1);
        g.field.protect(a.pos.x, a.pos.z, a.line.w * 0.5);
      }
      for (let k = 0; k < 3; k++) g.fx.retardant(a.pos.x, a.pos.y - 3, a.pos.z, 1 + r * 0.05);
      if (dd < 4) a.state = 'approach';
    }
    if (a.state === 'plan-drop') {
      const off = cloak ? 25 + r : 0;
      a.drop = {
        x: P.pos.x + P.vel.x * 1.5 + (Math.random() - 0.5) * off,
        z: P.pos.z + P.vel.z * 1.5 + (Math.random() - 0.5) * off,
        R: r * 0.9 + 11,
      };
      a.state = 'to-drop';
    }
    if (a.state === 'to-drop') {
      if (this.moveToward(a, a.drop.x, a.drop.z, 50, dt, 3) < 3) {
        a.state = 'telegraph';
        a.stateT = 1.4;
        a.ring = ringMesh(0x4fb4ff);
        a.ring.position.set(a.drop.x, 0.3, a.drop.z);
        a.ring.scale.setScalar(a.drop.R);
        g.scene.add(a.ring);
      }
    }
    if (a.state === 'telegraph') {
      a.stateT -= dt;
      a.ring.material.opacity = 0.45 + Math.sin(a.t * 18) * 0.35;
      if (a.stateT <= 0) {
        g.scene.remove(a.ring);
        a.ring = null;
        const R = a.drop.R;
        for (let k = 0; k < 90; k++) {
          const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
          g.fx.water(a.drop.x + Math.cos(ang) * rr, a.pos.y * 0.6, a.drop.z + Math.sin(ang) * rr, 0, -20, 0, 2.4);
        }
        g.field.extinguish(a.drop.x, a.drop.z, R);
        g.fx.steam(a.drop.x, 1, a.drop.z, R * 0.3, 16);
        if (Math.hypot(P.pos.x - a.drop.x, P.pos.z - a.drop.z) < R + r * 0.5) {
          if (P.dashing) {
            g.explosions.spawn(P.pos.x, P.pos.z, r * 2 + 4, { steam: true });
            g.emit('popup', '증발!', P.pos);
          } else P.hit('heli', DAMAGE.heliDrop, 1);
        }
        g.emit('splash');
        a.state = 'approach';
      }
    }
  }

  clear() {
    for (const a of this.list) this.remove(a);
    this.list.length = 0;
  }
}

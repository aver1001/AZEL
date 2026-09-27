// The Water Spirit: a towering body of water that rises from the city
// reservoir once Igri becomes a catastrophe. Bullet-hell water orbs, a
// telegraphed water cannon that can be *evaporation-parried* with a dash,
// and (below half health) expanding tidal rings.
import * as THREE from 'three';
import { DAMAGE, WORLD } from './config.js';
import { FIRE_NOISE } from './fx/flames.js';

function waterMaterial({ rim = 1.0, opacity = 0.86 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uRim: { value: rim },
      uOpacity: { value: opacity },
      uHurt: { value: 0 },
      uCharge: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vN; varying vec3 vW; varying vec3 vLocal;
      ${FIRE_NOISE}
      void main() {
        vec3 p = position;
        float n = fbm(vec2(p.x * 1.7 + p.z * 1.3, p.y * 2.0 - uTime * 1.2));
        p += normal * (n - 0.5) * 0.12;
        vLocal = p;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uRim; uniform float uOpacity; uniform float uHurt; uniform float uCharge;
      varying vec3 vN; varying vec3 vW; varying vec3 vLocal;
      ${FIRE_NOISE}
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        vec3 n = normalize(vN);
        float fres = pow(1.0 - abs(dot(v, n)), 2.2);
        float flow = fbm(vec2(vLocal.x * 3.0 + vLocal.z * 2.0, vLocal.y * 3.5 - uTime * 1.6));
        float bands = smoothstep(0.55, 0.75, fbm(vec2(vW.x * 0.08, vW.y * 0.12 - uTime * 0.9)));
        vec3 deep = vec3(0.03, 0.16, 0.34);
        vec3 shallow = vec3(0.18, 0.55, 0.85);
        vec3 col = mix(deep, shallow, flow * 0.8 + fres * 0.5);
        col += vec3(0.6, 0.9, 1.0) * bands * 0.35;
        col += vec3(0.5, 0.85, 1.0) * fres * uRim * 1.4;
        vec3 h = normalize(normalize(vec3(0.4, 0.8, 0.3)) + v);
        col += pow(max(dot(n, h), 0.0), 60.0) * vec3(1.2);
        col = mix(col, vec3(1.6, 1.8, 2.0), uHurt);
        col += vec3(0.4, 0.9, 1.6) * uCharge * (0.5 + 0.5 * sin(uTime * 30.0));
        gl_FragColor = vec4(col, uOpacity * (0.75 + fres * 0.25));
        #include <colorspace_fragment>
      }
    `,
  });
}

export class Boss {
  constructor(g) {
    this.g = g;
    this.active = false;
    this.dead = false;
    this.hp = 100;
    this.maxHp = 100;
    this.pos = new THREE.Vector3(WORLD.reservoir.x, 0, WORLD.reservoir.z);
    this.group = new THREE.Group();
    this.group.visible = false;
    g.scene.add(this.group);
    this.mats = [];
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), this.mat());
    body.scale.set(26, 36, 24);
    body.position.y = 32;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), this.mat());
    head.scale.set(15, 14, 14);
    head.position.y = 72;
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 3.6, 4.0) });
    this.eyes = [];
    for (const s of [-1, 1]) {
      // set high on the brow so they read from the top-down camera too
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), eyeMat);
      e.scale.set(3.2, 1.6, 4.4);
      e.position.set(s * 6, 80, 8.5);
      e.rotation.set(-0.7, 0, s * 0.35);
      this.eyes.push(e);
    }
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 22, 52, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(1, 3, 6, 16), this.mat());
      arm.scale.set(6.5, 8, 6.5);
      arm.position.y = -16;
      pivot.add(arm);
      pivot.rotation.z = s * 0.45;
      this.arms.push(pivot);
    }
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(34, 6, 12, 48), this.mat({ rim: 1.4, opacity: 0.7 }));
    swirl.rotation.x = Math.PI / 2;
    swirl.scale.z = 0.4;
    swirl.position.y = 2;
    this.swirl = swirl;
    this.parts = { body, head };
    this.group.add(body, head, ...this.eyes, ...this.arms, swirl);

    // orbs
    this.orbs = [];
    this.orbMat = new THREE.MeshPhongMaterial({ color: 0x5fb4ff, emissive: 0x1f6fd0, emissiveIntensity: 1.4, shininess: 90, transparent: true, opacity: 0.92 });
    this.orbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), this.orbMat, 700);
    this.orbMesh.count = 0;
    this.orbMesh.frustumCulled = false;
    g.scene.add(this.orbMesh);

    // cannon: telegraph strip + beam
    const stripGeo = new THREE.PlaneGeometry(1, 1);
    stripGeo.rotateX(-Math.PI / 2);
    stripGeo.translate(0, 0, 0.5);
    this.tele = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.4, depthWrite: false }));
    this.tele.renderOrder = 7;
    this.tele.visible = false;
    g.scene.add(this.tele);
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    this.beam = new THREE.Mesh(beamGeo, this.mat({ rim: 2.2, opacity: 0.9 }));
    this.beam.visible = false;
    g.scene.add(this.beam);
    this.waveMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 96), this.mat({ rim: 1.8, opacity: 0.85 }));
    this.waveMesh.rotation.x = Math.PI / 2;
    this.waveMesh.visible = false;
    g.scene.add(this.waveMesh);

    this.state = 'dormant';
    this.stateT = 0;
    this.time = 0;
    this.attackQueue = [];
    this.cannon = null;
    this.wave = null;
    this.hurtFlash = 0;
    this.phase = 1;
  }

  mat(opts) {
    const m = waterMaterial(opts);
    this.mats.push(m);
    return m;
  }

  awaken() {
    if (this.active || this.dead) return;
    this.active = true;
    this.group.visible = true;
    this.state = 'rising';
    this.stateT = 0;
    this.pos.set(WORLD.reservoir.x, -90, WORLD.reservoir.z);
    this.rain = this.g.weather.addZone(this.pos.x, this.pos.z, 95, Infinity, 0.8, { pos: this.pos });
    this.g.emit('bossAwake');
  }

  hurt(amount, kind) {
    if (!this.active || this.state === 'rising' || this.state === 'dying') return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.3 + amount * 0.05);
    this.g.emit('bossHurt', amount, kind);
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.g.emit('toast', '물의 정령이 격노했다 — 해일이 몰려옵니다! (대쉬로 증발)');
    }
    if (this.hp <= 0) {
      this.state = 'dying';
      this.stateT = 0;
      this.tele.visible = this.beam.visible = this.waveMesh.visible = false;
      this.cannon = null;
      this.wave = null;
    }
  }

  damageAt(x, z, r, amount) {
    if (!this.active) return;
    if (Math.hypot(this.pos.x - x, this.pos.z - z) < r + 28) this.hurt(amount, 'aoe');
  }

  /** Called when the player starts a dash: late parry grace for the cannon. */
  onDash() {
    if (this.cannon && this.cannon.phase === 'fire' && this.time - (this.cannon.lastContact ?? -9) < 0.16) this.parry();
  }

  parry() {
    const g = this.g;
    const P = g.player;
    if (!this.cannon) return;
    this.cannon = null;
    this.beam.visible = false;
    this.tele.visible = false;
    g.explosions.spawn(P.pos.x, P.pos.z, P.r * 3 + 24, { steam: true });
    g.fx.steam(P.pos.x, P.r, P.pos.z, P.r * 1.5 + 6, 60);
    this.hurt(9, 'parry');
    P.setMass(P.mass * 1.06);
    g.hitstop = 0.16;
    g.flash = 0.9;
    g.rig.shake = 1.2;
    g.emit('parry');
  }

  spawnOrb(x, z, vx, vz, r = 3.4) {
    this.orbs.push({ x, y: 6 + Math.random() * 4, z, vx, vz, r, t: 0 });
  }

  ring(n, speed, off = 0) {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      this.spawnOrb(this.pos.x + Math.cos(a) * 26, this.pos.z + Math.sin(a) * 26, Math.cos(a) * speed, Math.sin(a) * speed);
    }
    this.g.emit('bossShot');
  }

  aimAt(n, speed, spread) {
    const P = this.g.player;
    const base = Math.atan2(P.pos.z - this.pos.z, P.pos.x - this.pos.x);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      this.spawnOrb(this.pos.x + Math.cos(a) * 26, this.pos.z + Math.sin(a) * 26, Math.cos(a) * speed, Math.sin(a) * speed, 3.8);
    }
    this.g.emit('bossShot');
  }

  nextAttack() {
    const p1 = ['ring', 'volley', 'cannon', 'spiral', 'cannon', 'ring', 'volley'];
    const p2 = ['wave', 'cannon', 'spiral', 'ring', 'cannon', 'volley', 'wave', 'cannon'];
    const list = this.phase === 1 ? p1 : p2;
    this.cycle = ((this.cycle ?? -1) + 1) % list.length;
    return list[this.cycle];
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g;
    const P = g.player;
    this.time += dt;
    for (const m of this.mats) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uHurt.value = this.hurtFlash * 0.6;
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.swirl.rotation.z += dt * 0.8;

    if (this.state === 'rising') {
      this.stateT += dt;
      this.pos.y = -90 + Math.min(1, this.stateT / 4.5) * 90;
      g.rig.shake = Math.max(g.rig.shake, 0.4);
      if (Math.random() < 0.8) g.fx.water(this.pos.x + (Math.random() - 0.5) * 60, 2, this.pos.z + (Math.random() - 0.5) * 60, 0, 22, 0, 4);
      if (this.stateT >= 4.5) {
        this.state = 'idle';
        this.stateT = 1.5;
      }
    } else if (this.state === 'dying') {
      this.stateT += dt;
      const k = Math.min(1, this.stateT / 3.5);
      this.group.scale.setScalar(1 - k * 0.85);
      this.pos.y = -k * 30;
      g.fx.steam(this.pos.x + (Math.random() - 0.5) * 50, 20 + Math.random() * 40, this.pos.z + (Math.random() - 0.5) * 50, 12, 3);
      g.rig.shake = Math.max(g.rig.shake, 0.6);
      if (this.stateT >= 3.5) {
        this.active = false;
        this.dead = true;
        this.group.visible = false;
        if (this.rain) {
          this.rain.bound = null;
          this.rain.life = 0;
        }
        this.orbs.length = 0;
        this.orbMesh.count = 0;
        g.emit('bossDefeated');
      }
    } else {
      // movement: keep a fighting distance, but never leave the city
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      let vx = 0, vz = 0;
      const leash = P.pos.z > -110;
      if (leash) {
        // wait over the reservoir for the fire to come to the city
        const hx = WORLD.reservoir.x - this.pos.x, hz = WORLD.reservoir.z - this.pos.z;
        const hd = Math.hypot(hx, hz);
        if (hd > 5) {
          vx = (hx / hd) * 20;
          vz = (hz / hd) * 20;
        }
      } else if (d > 150) {
        vx = (dx / d) * 26;
        vz = (dz / d) * 26;
      } else if (d < 75) {
        vx = (-dx / d) * 12;
        vz = (-dz / d) * 12;
      } else {
        vx = (-dz / d) * 9;
        vz = (dx / d) * 9;
      }
      if (this.cannon) {
        vx *= 0.2;
        vz *= 0.2;
      }
      this.pos.x = THREE.MathUtils.clamp(this.pos.x + vx * dt, WORLD.minX + 30, WORLD.maxX - 30);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z + vz * dt, WORLD.minZ + 30, -140);
      this.group.rotation.y = Math.atan2(dx, dz);

      // contact
      if (d < 26 + P.r) {
        P.hurt(0.1 * dt, 'boss');
        this.hurt(1.2 * dt, 'contact');
        P.pos.x = this.pos.x + (dx / d) * (26 + P.r);
        P.pos.z = this.pos.z + (dz / d) * (26 + P.r);
        if (Math.random() < dt * 20) g.fx.steam(P.pos.x, P.r, P.pos.z, P.r + 4, 1);
      }

      // attack scheduler (dormant while the fire is still outside the city)
      this.stateT -= dt;
      if (this.state === 'idle' && this.stateT <= 0 && !leash && d < 420) {
        this.state = this.nextAttack();
        this.stateT = 0;
        this.sub = 0;
      }
      this.runAttack(dt, dx, dz, d);
    }

    this.group.position.copy(this.pos);
    const bob = Math.sin(this.time * 1.2) * 1.5;
    this.parts.body.position.y = 32 + bob;
    this.parts.head.position.y = 72 + bob * 1.3;
    for (const e of this.eyes) e.position.y = 80 + bob * 1.3;
    this.arms.forEach((a, i) => {
      const s = i === 0 ? -1 : 1;
      const raise = this.cannon ? 1.2 : 0;
      a.rotation.z = s * (0.45 + Math.sin(this.time * 1.4 + i) * 0.12 + raise * 0.4);
      a.rotation.x = -raise;
    });

    this.updateOrbs(dt);
    this.updateCannon(dt);
    this.updateWave(dt);
  }

  runAttack(dt, dx, dz, d) {
    const s = this.state;
    this.sub += dt;
    const fast = this.phase === 2 ? 1.25 : 1;
    if (s === 'ring') {
      if (this.stateT === 0) {
        this.ring(this.phase === 2 ? 28 : 20, 36 * fast);
        this.stateT = 1;
      }
      if (this.sub > 0.55 && this.stateT === 1) {
        this.ring(this.phase === 2 ? 28 : 20, 36 * fast, Math.PI / 20);
        this.stateT = 2;
      }
      if (this.sub > 1.4) this.toIdle(1.3);
    } else if (s === 'volley') {
      const shots = Math.floor(this.sub / 0.32);
      if (shots > this.stateT && shots <= 3) {
        this.aimAt(5, 55 * fast, 0.12);
        this.stateT = shots;
      }
      if (this.sub > 1.3) this.toIdle(1.2);
    } else if (s === 'spiral') {
      this.acc = (this.acc || 0) + dt;
      while (this.acc > 0.075) {
        this.acc -= 0.075;
        const a = this.sub * 2.6;
        for (const off of [0, Math.PI]) {
          this.spawnOrb(this.pos.x + Math.cos(a + off) * 26, this.pos.z + Math.sin(a + off) * 26, Math.cos(a + off) * 30 * fast, Math.sin(a + off) * 30 * fast, 3);
        }
      }
      if (this.sub > 3) this.toIdle(1.5);
    } else if (s === 'cannon') {
      if (!this.cannon && this.sub < 0.05) {
        const P = this.g.player;
        this.cannon = { phase: 'tele', t: 0, yaw: Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), len: 260, w: 9 };
        this.g.emit('bossCharge');
      }
      if (!this.cannon && this.sub > 0.1) this.toIdle(1.4);
    } else if (s === 'wave') {
      if (!this.wave && this.sub < 0.05) {
        this.wave = { R: 30, w: 7, hit: false };
        this.g.emit('bossWave');
      }
      if (!this.wave && this.sub > 0.1) this.toIdle(1.2);
    }
  }

  toIdle(t) {
    this.state = 'idle';
    this.stateT = t;
  }

  updateOrbs(dt) {
    const g = this.g;
    const P = g.player;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      o.x += o.vx * dt;
      o.z += o.vz * dt;
      const d = Math.hypot(P.pos.x - o.x, P.pos.z - o.z);
      let gone = o.t > 6;
      if (d < o.r + P.r * 0.75 && P.alive) {
        gone = true;
        if (P.dashing) {
          g.fx.steam(o.x, 3, o.z, 3, 6);
          P.setMass(P.mass * 1.004);
          g.emit('evaporate');
        } else {
          P.hit('bossOrb', DAMAGE.bossOrb, 0.35);
          g.fx.water(o.x, 3, o.z, 0, 6, 0, 3);
        }
      }
      if (gone) {
        this.orbs.splice(i, 1);
        continue;
      }
    }
    for (const o of this.orbs) {
      if (n >= 700) break;
      const wob = 1 + Math.sin(o.t * 12 + o.x) * 0.08;
      m.makeScale(o.r * wob, o.r / wob, o.r * wob);
      m.setPosition(o.x, o.y, o.z);
      this.orbMesh.setMatrixAt(n++, m);
    }
    this.orbMesh.count = n;
    this.orbMesh.instanceMatrix.needsUpdate = true;
  }

  updateCannon(dt) {
    const c = this.cannon;
    const g = this.g;
    const P = g.player;
    for (const m of this.mats) m.uniforms.uCharge.value = c && c.phase === 'tele' ? Math.min(1, c.t / 1.3) : 0;
    if (!c) {
      this.tele.visible = this.beam.visible = false;
      return;
    }
    c.t += dt;
    const ox = this.pos.x + Math.sin(c.yaw) * 20, oz = this.pos.z + Math.cos(c.yaw) * 20;
    if (c.phase === 'tele') {
      // slow tracking while charging
      const want = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      let dy = want - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += THREE.MathUtils.clamp(dy, -0.5 * dt, 0.5 * dt);
      this.tele.visible = true;
      this.tele.position.set(ox, 0.35, oz);
      this.tele.rotation.y = c.yaw;
      this.tele.scale.set(c.w * (0.3 + 0.7 * Math.min(1, c.t / 1.3)), 1, c.len);
      this.tele.material.opacity = 0.25 + Math.abs(Math.sin(c.t * 14)) * 0.45;
      if (c.t >= 1.3) {
        c.phase = 'fire';
        c.t = 0;
        this.tele.visible = false;
        g.emit('bossBeam');
      }
      return;
    }
    // firing
    this.beam.visible = true;
    this.beam.position.set(ox, 8, oz);
    this.beam.rotation.set(0, c.yaw, 0);
    const wob = 1 + Math.sin(c.t * 40) * 0.06;
    this.beam.scale.set(c.w * 0.55 * wob, c.w * 0.55 * wob, c.len);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    for (let k = 0; k < 4; k++) {
      const t = Math.random() * c.len;
      g.fx.water(ox + fx * t, 4, oz + fz * t, (Math.random() - 0.5) * 10, 8, (Math.random() - 0.5) * 10, 3);
    }
    const px = P.pos.x - ox, pz = P.pos.z - oz;
    const along = THREE.MathUtils.clamp(px * fx + pz * fz, 0, c.len);
    const perp = Math.hypot(px - fx * along, pz - fz * along);
    if (perp < c.w * 0.55 + P.r * 0.7 && P.alive) {
      if (P.dashing) {
        this.parry();
        return;
      }
      c.lastContact = this.time;
      P.hurt(DAMAGE.bossBeam * dt, 'beam');
      P.steam = Math.min(1.5, P.steam + dt * 2);
    }
    g.field.extinguish(ox + fx * c.len * Math.random(), oz + fz * c.len * Math.random(), 8);
    if (c.t >= 1.1) {
      this.cannon = null;
      this.beam.visible = false;
    }
  }

  updateWave(dt) {
    const w = this.wave;
    if (!w) {
      this.waveMesh.visible = false;
      return;
    }
    const g = this.g;
    const P = g.player;
    w.R += dt * 42;
    this.waveMesh.visible = true;
    this.waveMesh.position.set(this.pos.x, 1.5, this.pos.z);
    this.waveMesh.scale.set(w.R, w.R, 30);
    const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (!w.hit && Math.abs(d - w.R) < w.w * 0.5 + P.r * 0.6) {
      w.hit = true;
      if (P.dashing) {
        g.explosions.spawn(P.pos.x, P.pos.z, P.r * 2 + 12, { steam: true });
        this.hurt(2.5, 'waveParry');
        g.emit('parry');
      } else P.hit('bossWave', DAMAGE.bossWave, 0.5);
    }
    if (Math.random() < 0.9) {
      const a = Math.random() * Math.PI * 2;
      g.fx.water(this.pos.x + Math.cos(a) * w.R, 2, this.pos.z + Math.sin(a) * w.R, 0, 10, 0, 3);
    }
    if (w.R > 380) this.wave = null;
  }
}

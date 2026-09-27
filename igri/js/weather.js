// Weather science: single raindrops and dew that threaten an ember, puddles
// for the campfire, drifting rain cells and storms for bigger fires. A hot
// enough fire raises an updraft that shoves clouds away, and driving through
// rain wraps Igri in steam that spoils the firefighters' aim.
import * as THREE from 'three';
import { DAMAGE } from './config.js';

function rainStreaks(n = 1400) {
  const pos = new Float32Array(n * 2 * 3);
  const end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
    const x = Math.cos(a) * r, z = Math.sin(a) * r, seed = Math.random();
    for (let k = 0; k < 2; k++) {
      pos[(i * 2 + k) * 3] = x;
      pos[(i * 2 + k) * 3 + 1] = seed;
      pos[(i * 2 + k) * 3 + 2] = z;
      end[i * 2 + k] = k;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  return g;
}

export class Weather {
  constructor(g) {
    this.g = g;
    this.zones = [];
    this.drops = [];
    this.timers = { drop: 3, zone: 12 };
    this.updraft = false;
    this.updraftAnnounced = false;
    this.streakGeo = rainStreaks();
    this.time = 0;
    this.shadowGeo = new THREE.CircleGeometry(1, 24);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.dropRingGeo = new THREE.RingGeometry(0.9, 1, 32);
    this.dropRingGeo.rotateX(-Math.PI / 2);

    // dew beads near the start
    const dewMat = new THREE.MeshPhongMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.75, shininess: 120, specular: 0xffffff });
    const L = g.layout;
    this.dew = L.dew.map((d) => ({ ...d, alive: true }));
    this.dewMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), dewMat, this.dew.length);
    const m = new THREE.Matrix4();
    this.dew.forEach((d, i) => {
      m.makeScale(d.r, d.r * 0.75, d.r);
      m.setPosition(d.x, d.r * 0.6, d.z);
      this.dewMesh.setMatrixAt(i, m);
    });
    g.scene.add(this.dewMesh);

    // puddles
    this.puddleMat = new THREE.MeshPhongMaterial({ color: 0x5f8fae, transparent: true, opacity: 0.85, shininess: 90, specular: 0xbfdfff });
    this.puddles = L.puddles.map((p) => {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.puddleMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.06, p.z);
      mesh.scale.setScalar(p.r);
      mesh.renderOrder = 2;
      g.scene.add(mesh);
      return { ...p, r0: p.r, mesh };
    });
  }

  rainAt(x, z) {
    for (const c of this.zones) {
      if (c.k < 0.25) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.92) ** 2) return true;
    }
    return false;
  }

  addZone(x, z, r, life, strength = 1, bound = null) {
    const g = this.g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uH: { value: 30 }, uK: { value: 0 }, uLen: { value: 1.2 } },
      vertexShader: /* glsl */ `
        attribute float aEnd; uniform float uTime; uniform float uH; uniform float uLen;
        varying float vA;
        void main() {
          vec3 p = position;
          float fall = mod(p.y * 97.0 * uH + uTime * uH * 1.6, uH);
          float y = uH - fall + aEnd * uLen;
          vec4 w = modelMatrix * vec4(p.x, 0.0, p.z, 1.0);
          w.y = y;
          w.x -= aEnd * uLen * 0.15;
          vA = 1.0 - aEnd * 0.6;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: 'uniform float uK; varying float vA; void main(){ gl_FragColor = vec4(0.78, 0.86, 0.96, 0.5 * uK * vA); }',
    });
    const streaks = new THREE.LineSegments(this.streakGeo, mat);
    streaks.frustumCulled = false;
    streaks.renderOrder = 15;
    const wet = new THREE.Mesh(this.shadowGeo, new THREE.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0, depthWrite: false }));
    wet.renderOrder = 3;
    g.scene.add(streaks, wet);
    const zone = { x, z, r, t: 0, life, k: 0, strength, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, streaks, wet, mat, bound, pushed: 0 };
    this.zones.push(zone);
    return zone;
  }

  removeZone(z) {
    this.g.scene.remove(z.streaks, z.wet);
    z.mat.dispose();
    z.wet.material.dispose();
  }

  update(dt, view) {
    const g = this.g;
    const P = g.player;
    const r = P.r;
    const tier = P.tier.id;
    this.time += dt;

    // ---- T1: raindrops (telegraphed) and dew
    this.timers.drop -= dt;
    if (tier === 1 && this.timers.drop <= 0 && P.control) {
      this.timers.drop = 3 + Math.random() * 3.5;
      const x = P.pos.x + P.vel.x * 0.9 + (Math.random() - 0.5) * 2.2;
      const z = P.pos.z + P.vel.z * 0.9 + (Math.random() - 0.5) * 2.2;
      const sh = new THREE.Mesh(this.shadowGeo, new THREE.MeshBasicMaterial({ color: 0x06121e, transparent: true, opacity: 0.0, depthWrite: false }));
      sh.position.set(x, 0.03, z);
      sh.renderOrder = 4;
      const ring = new THREE.Mesh(this.dropRingGeo, new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.0, depthWrite: false }));
      ring.position.set(x, 0.04, z);
      ring.renderOrder = 5;
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshPhongMaterial({ color: 0xbfe0ff, emissive: 0x2a5a8a, transparent: true, opacity: 0.85, shininess: 120 }));
      drop.scale.set(1, 1.9, 1);
      g.scene.add(sh, ring, drop);
      this.drops.push({ x, z, t: 0, dur: 1.15, R: 0.5, sh, ring, drop });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt / d.dur;
      d.sh.scale.setScalar(d.R * (0.3 + d.t * 0.7));
      d.sh.material.opacity = 0.5 * d.t;
      d.ring.scale.setScalar(d.R);
      d.ring.material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(d.t * 14));
      d.drop.position.set(d.x, (1 - d.t) * 9, d.z);
      if (d.t >= 1) {
        g.scene.remove(d.sh, d.drop, d.ring);
        d.ring.material.dispose();
        d.sh.material.dispose();
        d.drop.material.dispose();
        d.drop.geometry.dispose();
        this.drops.splice(i, 1);
        for (let k = 0; k < 14; k++) {
          const a = Math.random() * Math.PI * 2;
          g.fx.water(d.x, 0.05, d.z, Math.cos(a) * 1.5, 1.5 + Math.random() * 1.5, Math.sin(a) * 1.5, 0.25);
        }
        g.field.extinguish(d.x, d.z, d.R);
        g.emit('drip');
        if (Math.hypot(P.pos.x - d.x, P.pos.z - d.z) < d.R + r * 0.6) {
          if (P.dashing) g.fx.steam(P.pos.x, 0.2, P.pos.z, 0.4, 3);
          else if (P.hit('raindrop', DAMAGE.raindrop, 0.3)) g.emit('popup', '빗방울!', P.pos);
        }
      }
    }
    const m = new THREE.Matrix4();
    let dewDirty = false;
    for (let i = 0; i < this.dew.length; i++) {
      const d = this.dew[i];
      if (!d.alive) continue;
      if (Math.hypot(P.pos.x - d.x, P.pos.z - d.z) < r * 0.8 + d.r) {
        d.alive = false;
        m.makeScale(0, 0, 0);
        this.dewMesh.setMatrixAt(i, m);
        dewDirty = true;
        g.fx.steam(d.x, 0.1, d.z, 0.25, 4);
        if (tier === 1 && !P.dashing) {
          P.hit('dew', DAMAGE.dew, 0.2);
          g.emit('popup', '이슬!', P.pos);
        }
      }
    }
    if (dewDirty) this.dewMesh.instanceMatrix.needsUpdate = true;

    // ---- puddles
    for (const p of this.puddles) {
      if (p.r <= 0.05) continue;
      const d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
      if (d < p.r + r * 0.4) {
        if (P.dashing || tier >= 3) {
          p.r -= dt * (2 + r * 1.2);
          g.fx.steam(p.x, 0.2, p.z, Math.max(0.5, p.r * 0.6), 2);
          if (tier >= 3 && !P.dashing) P.hurt(DAMAGE.puddle * 0.2 * dt, 'puddle');
        } else {
          P.hurt(DAMAGE.puddle * dt, 'puddle');
          P.steam = Math.min(1.5, P.steam + dt);
          p.r -= dt * r * 0.4;
          if (Math.random() < dt * 20) g.fx.steam(P.pos.x, 0.2, P.pos.z, Math.max(0.3, r * 0.7), 1);
        }
        p.mesh.scale.setScalar(Math.max(0.001, p.r));
        if (p.r <= 0.05) p.mesh.visible = false;
      }
    }

    // ---- rain cells
    this.timers.zone -= dt;
    if (this.timers.zone <= 0 && P.control) {
      const cfg = {
        1: null,
        2: { every: 34, r: [10, 18], life: [14, 20], chance: 0.5, name: '소나기' },
        3: { every: 20, r: [28, 60], life: [18, 28], chance: 0.85, name: '국지성 호우' },
        4: { every: 17, r: [70, 130], life: [20, 30], chance: 0.9, name: '폭풍우' },
      }[tier];
      this.timers.zone = cfg ? cfg.every * (0.7 + Math.random() * 0.6) : 10;
      if (cfg && Math.random() < cfg.chance && this.zones.filter((z) => !z.bound).length < 3) {
        const sp = Math.hypot(P.vel.x, P.vel.z);
        const hx = sp > 0.5 ? P.vel.x / sp : 0, hz = sp > 0.5 ? P.vel.z / sp : -1;
        const R = cfg.r[0] + Math.random() * (cfg.r[1] - cfg.r[0]);
        const ahead = view * (0.5 + Math.random() * 0.6);
        const x = P.pos.x + hx * ahead + (Math.random() - 0.5) * view * 0.8;
        const z = P.pos.z + hz * ahead + (Math.random() - 0.5) * view * 0.8;
        this.addZone(x, z, R, cfg.life[0] + Math.random() * (cfg.life[1] - cfg.life[0]));
        g.emit('toast', `${cfg.name}가 다가옵니다 — 비 구역은 치명적!`);
      }
    }

    // updraft: big or fast-burning fires push clouds away
    const threshold = { 1: Infinity, 2: 5, 3: 0, 4: 0 }[tier];
    this.updraft = P.alive && (tier >= 3 || P.burnRate > threshold);
    const U = r * 8 + 30;
    if (this.updraft && !this.updraftAnnounced && this.zones.some((z) => Math.hypot(z.x - P.pos.x, z.z - P.pos.z) < U + z.r)) {
      this.updraftAnnounced = true;
      g.emit('toast', '상승 기류 발생! 열기가 먹구름을 밀어냅니다');
    }

    P.inRain = false;
    const camH = g.camera.position.y;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const c = this.zones[i];
      c.t += dt;
      if (c.bound) {
        c.x = c.bound.pos.x;
        c.z = c.bound.pos.z;
      } else {
        c.x += c.vx * dt;
        c.z += c.vz * dt;
      }
      const grow = Math.min(1, c.t / 3);
      const fade = c.life - c.t < 4 ? Math.max(0, (c.life - c.t) / 4) : 1;
      let push = 0;
      const dx = c.x - P.pos.x, dz = c.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (this.updraft && d < U + c.r) {
        push = 1;
        const s = (10 + r * 0.8) * dt;
        if (!c.bound) {
          c.x += (dx / (d || 1)) * s;
          c.z += (dz / (d || 1)) * s;
        }
        c.pushed = Math.min(1, c.pushed + dt * (c.bound ? 0.25 : 0.35));
      } else c.pushed = Math.max(0, c.pushed - dt * 0.2);
      c.k = grow * fade * (1 - c.pushed) * c.strength;
      if (c.t > c.life && !c.bound) {
        this.removeZone(c);
        this.zones.splice(i, 1);
        continue;
      }
      // visuals
      c.mat.uniforms.uTime.value = this.time;
      c.mat.uniforms.uK.value = c.k;
      c.mat.uniforms.uH.value = Math.min(camH * 0.7, 20 + c.r * 0.6);
      c.mat.uniforms.uLen.value = 0.6 + c.r * 0.03;
      c.streaks.position.set(c.x, 0, c.z);
      c.streaks.scale.set(c.r, 1, c.r);
      c.wet.position.set(c.x, 0.12, c.z);
      c.wet.scale.setScalar(c.r);
      c.wet.material.opacity = 0.28 * c.k;
      if (push > 0 && Math.random() < dt * 10) g.fx.steam(c.x + (Math.random() - 0.5) * c.r, 4 + Math.random() * 6, c.z + (Math.random() - 0.5) * c.r, 2 + c.r * 0.05, 1);
      // rain hurts
      if (d < c.r * 0.92 && c.k > 0.25) {
        P.inRain = true;
        if (P.dashing) continue;
        P.hurt(DAMAGE.rain * c.k * dt, 'rain');
        P.steam = Math.min(1.5, P.steam + dt * 1.2);
      }
    }
    if (P.inRain && Math.random() < dt * 25) g.fx.steam(P.pos.x, r * 0.6, P.pos.z, Math.max(0.3, r * 0.9), 1);
    if (this.updraft && Math.random() < dt * 12) {
      // heat shimmer column
      g.fx.ember(P.pos.x + (Math.random() - 0.5) * r * 3, r, P.pos.z + (Math.random() - 0.5) * r * 3, Math.max(0.3, r * 0.5), 1);
    }
  }

  clear() {
    for (const z of this.zones) this.removeZone(z);
    this.zones.length = 0;
    for (const d of this.drops) this.g.scene.remove(d.sh, d.drop, d.ring);
    this.drops.length = 0;
  }
}

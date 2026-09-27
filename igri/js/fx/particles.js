// CPU-simulated point particles in two pools: additive (embers, sparks,
// blast flashes) and alpha (smoke, steam, foam, water, retardant dust).
import * as THREE from 'three';

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  // a few lumps so smoke doesn't look like perfect discs
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = g.createRadialGradient(32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12, 0, 32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12, 14);
    r.addColorStop(0, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class ParticlePool {
  constructor(scene, capacity, { additive = false, texture = null } = {}) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.c0 = new Float32Array(capacity * 4);
    this.c1 = new Float32Array(capacity * 4);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.alive = 0;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture || puffTexture() },
        uScale: { value: 800 },
        fogColor: { value: new THREE.Color() },
        fogNear: { value: 1 },
        fogFar: { value: 1000 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        uniform float uScale;
        varying vec4 vColor;
        varying float vFogDepth;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          vColor = aColor;
          vFogDepth = -mv.z;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        varying vec4 vColor;
        varying float vFogDepth;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * vColor.a;
          if (a < 0.003) discard;
          float fog = smoothstep(fogNear, fogFar, vFogDepth);
          ${additive ? 'gl_FragColor = vec4(vColor.rgb * a * (1.0 - fog), 1.0);' : 'gl_FragColor = vec4(mix(vColor.rgb, fogColor, fog * 0.8), a);'}
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 9;
    scene.add(this.points);
    geo.setDrawRange(0, 0);
  }

  /**
   * spawn(x,y,z, vx,vy,vz, life, size0, size1, [r,g,b,a]0, [r,g,b,a]1, drag, gravity)
   */
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, drag = 0.5, grav = 0) {
    let i;
    if (this.alive < this.capacity) i = this.alive++;
    else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = 0;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    for (let k = 0; k < 4; k++) {
      this.c0[i4 + k] = c0[k];
      this.c1[i4 + k] = c1[k];
    }
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt, wind = null) {
    const { pos, vel, col, size, life, max, s0, s1, c0, c1, drag, grav } = this;
    let n = this.alive;
    const wx = wind ? wind.x : 0, wz = wind ? wind.z : 0;
    for (let i = 0; i < n; i++) {
      life[i] += dt;
      if (life[i] >= max[i]) {
        // swap-remove with the last live particle
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const t = life[i] / max[i];
      const i3 = i * 3, i4 = i * 4;
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i3] = vel[i3] * d + wx * dt * 0.5;
      vel[i3 + 1] = vel[i3 + 1] * d + grav[i] * dt;
      vel[i3 + 2] = vel[i3 + 2] * d + wz * dt * 0.5;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      size[i] = s0[i] + (s1[i] - s0[i]) * t;
      // fade in quickly, out smoothly
      const fade = Math.min(1, t * 8) * (1 - t * t);
      col[i4] = c0[i4] + (c1[i4] - c0[i4]) * t;
      col[i4 + 1] = c0[i4 + 1] + (c1[i4 + 1] - c0[i4 + 1]) * t;
      col[i4 + 2] = c0[i4 + 2] + (c1[i4 + 2] - c0[i4 + 2]) * t;
      col[i4 + 3] = (c0[i4 + 3] + (c1[i4 + 3] - c0[i4 + 3]) * t) * fade;
    }
    this.alive = n;
    if (this.cursor >= n) this.cursor = 0;
    this.points.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  copy(from, to) {
    const f3 = from * 3, t3 = to * 3, f4 = from * 4, t4 = to * 4;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
    }
    for (let k = 0; k < 4; k++) {
      this.col[t4 + k] = this.col[f4 + k];
      this.c0[t4 + k] = this.c0[f4 + k];
      this.c1[t4 + k] = this.c1[f4 + k];
    }
    this.size[to] = this.size[from];
    this.life[to] = this.life[from];
    this.max[to] = this.max[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
  }

  setView(camera, heightPx, fog) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (fog) {
      this.material.uniforms.fogColor.value.copy(fog.color);
      this.material.uniforms.fogNear.value = fog.near;
      this.material.uniforms.fogFar.value = fog.far;
    }
  }
}

/** Convenience emitters with the game's palette. */
export class FX {
  constructor(scene) {
    this.add = new ParticlePool(scene, 5000, { additive: true });
    this.alpha = new ParticlePool(scene, 7000);
  }

  ember(x, y, z, scale = 1, n = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.5 + Math.random()) * scale;
      this.add.spawn(
        x + (Math.random() - 0.5) * scale, y, z + (Math.random() - 0.5) * scale,
        Math.cos(a) * sp, (2 + Math.random() * 3) * scale, Math.sin(a) * sp,
        0.8 + Math.random() * 1.2, 0.06 * scale, 0.01 * scale,
        [3, 1.4, 0.4, 1], [1.6, 0.3, 0.05, 0.6], 0.6, -0.5 * scale,
      );
    }
  }

  smoke(x, y, z, scale = 1, dark = 0.3) {
    const g = 0.035 + (1 - dark) * 0.12;
    this.alpha.spawn(
      x + (Math.random() - 0.5) * scale, y, z + (Math.random() - 0.5) * scale,
      (Math.random() - 0.5) * scale * 0.6, (1.2 + Math.random()) * scale, (Math.random() - 0.5) * scale * 0.6,
      3 + Math.random() * 3, 1.0 * scale, 4.2 * scale,
      [g + 0.02, g, g - 0.005, 0.32], [g + 0.1, g + 0.09, g + 0.085, 0.0], 0.35, 0.2 * scale,
    );
  }

  steam(x, y, z, scale = 1, n = 1) {
    for (let i = 0; i < n; i++) {
      this.alpha.spawn(
        x + (Math.random() - 0.5) * scale, y, z + (Math.random() - 0.5) * scale,
        (Math.random() - 0.5) * scale * 2, (1.5 + Math.random() * 2) * scale, (Math.random() - 0.5) * scale * 2,
        1 + Math.random() * 1.2, 0.6 * scale, 2.6 * scale,
        [0.95, 0.97, 1, 0.55], [1, 1, 1, 0], 0.9, 0.4 * scale,
      );
    }
  }

  water(x, y, z, vx, vy, vz, scale = 1) {
    this.alpha.spawn(x, y, z, vx, vy, vz, 0.7 + Math.random() * 0.3, 0.25 * scale, 0.5 * scale, [0.55, 0.78, 1, 0.85], [0.8, 0.92, 1, 0.2], 0.2, -9.8);
  }

  foam(x, y, z, vx, vy, vz, scale = 1) {
    this.alpha.spawn(x, y, z, vx, vy, vz, 0.6 + Math.random() * 0.4, 0.3 * scale, 1.1 * scale, [1, 1, 1, 0.9], [0.95, 0.97, 1, 0], 1.2, -1);
  }

  retardant(x, y, z, scale = 1) {
    this.alpha.spawn(
      x + (Math.random() - 0.5) * scale * 4, y, z + (Math.random() - 0.5) * scale * 4,
      (Math.random() - 0.5) * 2, -6 - Math.random() * 6, (Math.random() - 0.5) * 2,
      1.6 + Math.random(), 1.2 * scale, 3 * scale,
      [0.85, 0.22, 0.2, 0.8], [0.7, 0.28, 0.25, 0], 0.4, -3,
    );
  }

  dust(x, y, z, scale = 1) {
    this.alpha.spawn(
      x, y, z, (Math.random() - 0.5) * 2 * scale, Math.random() * scale, (Math.random() - 0.5) * 2 * scale,
      0.8, 0.3 * scale, 1.2 * scale, [0.5, 0.45, 0.4, 0.5], [0.6, 0.58, 0.55, 0], 1.5, 0,
    );
  }

  burst(x, y, z, scale = 1, n = 30) {
    // explosion fireball bits
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const sp = (4 + Math.random() * 8) * scale;
      this.add.spawn(
        x, y + 0.5 * scale, z,
        Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp,
        0.4 + Math.random() * 0.5, 1.2 * scale, 0.2 * scale,
        [4, 2.2, 0.8, 1], [2, 0.4, 0.05, 0.4], 2.5, 0,
      );
    }
    for (let i = 0; i < n * 0.6; i++) this.ember(x, y + scale, z, scale * 1.5, 1);
    for (let i = 0; i < n * 0.4; i++) this.smoke(x, y + scale, z, scale * 1.4, 0.8);
  }

  update(dt, camera, heightPx, fog, wind) {
    this.add.setView(camera, heightPx, fog);
    this.alpha.setView(camera, heightPx, fog);
    this.add.update(dt, wind);
    this.alpha.update(dt, wind);
  }
}

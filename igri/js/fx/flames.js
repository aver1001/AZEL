// Pooled billboard flames. Every burning object borrows one; the player uses
// several stacked. The shader draws a noisy teardrop with an HDR white-hot
// core so bloom turns it into real-looking firelight.
import * as THREE from 'three';

export const FIRE_NOISE = /* glsl */ `
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`;

export class FlamePool {
  constructor(scene, capacity = 2200) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    this.seed = new Float32Array(capacity);
    this.heat = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.seed[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 1));
    this.heatAttr = new THREE.InstancedBufferAttribute(this.heat, 1);
    this.heatAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aHeat', this.heatAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute float aHeat;
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        varying float vHeat;
        varying float vFogDepth;
        void main() {
          vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          vec4 mv = viewMatrix * vec4(center, 1.0);
          // sway the top a little
          float sway = sin(uTime * 3.0 + aSeed * 20.0) * 0.08 * position.y;
          mv.xy += vec2(position.x + sway, position.y) * size;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vSeed = aSeed;
          vHeat = aHeat;
          vFogDepth = -mv.z;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        varying vec2 vUv;
        varying float vSeed;
        varying float vHeat;
        varying float vFogDepth;
        ${FIRE_NOISE}
        void main() {
          if (vHeat <= 0.001) discard;
          float x = (vUv.x - 0.5) * 2.0;
          float y = vUv.y;
          float t = uTime * 1.7 + vSeed * 31.0;
          float n = fbm(vec2(x * 1.6 + vSeed * 7.0, y * 2.2 - t * 1.8));
          float n2 = fbm(vec2(x * 3.1 - vSeed * 3.0, y * 4.0 - t * 2.6));
          float width = mix(0.95, 0.06, pow(y, 0.8));
          float d = abs(x + (n - 0.5) * 0.5 * (0.2 + y));
          float shape = 1.0 - smoothstep(width * 0.55, width, d);
          shape *= smoothstep(0.0, 0.06, y);
          shape *= 1.0 - smoothstep(0.35 + n * 0.45, 0.98, y);
          shape = clamp(shape * (0.75 + n2 * 0.6), 0.0, 1.0);
          float core = shape * (1.0 - y) * (0.6 + 0.6 * n2);
          vec3 col = mix(vec3(0.85, 0.12, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.1, 0.5, core));
          col = mix(col, vec3(1.0, 0.8, 0.45), smoothstep(0.65, 1.0, core));
          float a = shape * vHeat;
          float fog = smoothstep(fogNear, fogFar, vFogDepth);
          gl_FragColor = vec4(col * (0.55 + core * 1.6) * a * (1.0 - fog), 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, zero);
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    scene.add(this.mesh);
    this.dirty = false;
  }

  alloc() {
    return this.free.length ? this.free.pop() : -1;
  }

  set(slot, x, y, z, w, h, heat) {
    if (slot < 0) return;
    const e = this.m.elements;
    e[0] = w; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = 0; e[5] = h; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[10] = 1; e[11] = 0;
    e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
    this.mesh.setMatrixAt(slot, this.m);
    this.heat[slot] = heat;
    this.dirty = true;
  }

  release(slot) {
    if (slot < 0) return;
    this.heat[slot] = 0;
    this.m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(slot, this.m);
    this.free.push(slot);
    this.dirty = true;
  }

  get used() {
    return this.capacity - this.free.length;
  }

  update(time, fog) {
    this.material.uniforms.uTime.value = time;
    if (fog) {
      this.material.uniforms.fogColor.value.copy(fog.color);
      this.material.uniforms.fogNear.value = fog.near;
      this.material.uniforms.fogFar.value = fog.far;
    }
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.heatAttr.needsUpdate = true;
      this.dirty = false;
    }
  }
}

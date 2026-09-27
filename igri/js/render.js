// Renderer, post stack (bloom + grading + tilt-shift for the macro ember view
// + grayscale for the ending), lights, atmosphere and the tiered camera rig.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TIERS } from './config.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTilt: { value: 0 },
    uGray: { value: 0 },
    uVignette: { value: 0.35 },
    uFlash: { value: 0 },
    uHurt: { value: 0 },
    uSteam: { value: 0 },
    uTime: { value: 0 },
    uDark: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTilt, uGray, uVignette, uFlash, uHurt, uSteam, uTime, uDark;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uTilt > 0.001) {
        // miniature/macro look: blur away from a horizontal focus band
        float band = smoothstep(0.12, 0.5, abs(vUv.y - 0.45)) * uTilt;
        vec4 acc = c;
        float w = 1.0;
        for (int i = 1; i <= 6; i++) {
          float o = float(i) * band * 2.2;
          acc += texture2D(tDiffuse, vUv + vec2(0.0, o / uRes.y));
          acc += texture2D(tDiffuse, vUv - vec2(0.0, o / uRes.y));
          acc += texture2D(tDiffuse, vUv + vec2(o / uRes.x, 0.0));
          acc += texture2D(tDiffuse, vUv - vec2(o / uRes.x, 0.0));
          w += 4.0;
        }
        c = mix(c, acc / w, min(1.0, band * 3.0));
      }
      if (uSteam > 0.001) {
        float n = h(floor(vUv * uRes / 6.0) + floor(uTime * 8.0));
        float ring = smoothstep(0.15, 0.6, length(vUv - 0.5));
        c.rgb = mix(c.rgb, vec3(0.85, 0.88, 0.9) + n * 0.05, uSteam * (0.3 + ring * 0.7));
      }
      float d = length(vUv - 0.5);
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      c.rgb = mix(c.rgb, vec3(1.2, 0.05, 0.02) * dot(c.rgb, vec3(0.33)), uHurt * smoothstep(0.25, 0.75, d));
      float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(c.rgb, vec3(g), uGray);
      c.rgb += uFlash;
      c.rgb *= 1.0 - uDark;
      gl_FragColor = c;
    }
  `,
};

export function createRenderer(canvasParent) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  canvasParent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe6cfae, 200, 900);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 6000);

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5a45, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.62, 0.64).normalize();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.7, 0.5, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const rig = {
    target: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    pitch: TIERS[0].cam.pitch,
    dist: 5,
    shake: 0,
    lookAhead: new THREE.Vector3(),
    override: null, // {pos, look} for cinematics
  };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    grade.uniforms.uRes.value.set(w * pr, h * pr);
    bloom.resolution.set(w / 2, h / 2);
  }
  window.addEventListener('resize', resize);
  resize();

  /** Desired camera distance for the player's radius, blended across tiers. */
  function framingFor(r) {
    // piecewise-log interpolation between tier presets
    let pitch = TIERS[0].cam.pitch, dist = TIERS[0].cam.dist0;
    for (let i = 0; i < TIERS.length; i++) {
      const t = TIERS[i];
      const next = TIERS[i + 1];
      const r0 = Math.max(0.25, t.minR);
      const r1 = next ? next.minR : 36;
      if (r >= r0 * 0.999 || i === 0) {
        const k = THREE.MathUtils.clamp(Math.log(Math.max(r, r0) / r0) / Math.log(r1 / r0), 0, 1);
        dist = THREE.MathUtils.lerp(t.cam.dist0, t.cam.dist1, k);
        pitch = t.cam.pitch;
        // ease pitch toward the next tier near the boundary
        if (next && k > 0.85) {
          const e = (k - 0.85) / 0.15;
          pitch = THREE.MathUtils.lerp(t.cam.pitch, next.cam.pitch, e * 0.5);
          dist = THREE.MathUtils.lerp(dist, next.cam.dist0, e * 0.35);
        }
      }
    }
    return { pitch, dist };
  }

  function updateCamera(dt, focus, radius, velocity, minDist = 0) {
    const f = framingFor(radius);
    f.dist = Math.max(f.dist, minDist);
    const k = 1 - Math.exp(-dt * 2.2);
    rig.pitch += (f.pitch - rig.pitch) * k;
    rig.dist += (f.dist - rig.dist) * k;
    if (velocity) rig.lookAhead.lerp(tmpV.set(velocity.x, 0, velocity.z).multiplyScalar(0.35), 1 - Math.exp(-dt * 2));
    rig.target.lerp(tmpV.copy(focus).add(rig.lookAhead), 1 - Math.exp(-dt * 6));
    if (rig.override) {
      camera.position.lerp(rig.override.pos, 1 - Math.exp(-dt * (rig.override.speed || 1.5)));
      camera.lookAt(rig.override.look);
    } else {
      const off = tmpV.set(0, Math.sin(rig.pitch), Math.cos(rig.pitch)).multiplyScalar(rig.dist);
      camera.position.copy(rig.target).add(off);
      camera.lookAt(rig.target);
    }
    if (rig.shake > 0) {
      const s = rig.shake * rig.dist * 0.012;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
      rig.shake = Math.max(0, rig.shake - dt * 2.5);
    }
    camera.near = Math.max(0.03, rig.dist * 0.02);
    camera.far = Math.max(1500, rig.dist * 30);
    camera.updateProjectionMatrix();

    // fog & shadow frustum track the view size
    const view = rig.dist * 1.2;
    scene.fog.near = rig.dist * 1.4;
    scene.fog.far = rig.dist * 4.5 + 250;
    const sc = sun.shadow.camera;
    const half = Math.max(8, view * 0.9);
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 1;
    sc.far = half * 4 + 300;
    sc.updateProjectionMatrix();
    sun.target.position.copy(rig.target);
    sun.position.copy(rig.target).addScaledVector(sunDir, half * 2 + 120);
    sun.shadow.bias = -0.0002 - half * 0.000002;
    return view;
  }

  // atmosphere: 0 = clear golden afternoon, 1 = smoke-choked apocalypse
  const colClear = { fog: new THREE.Color(0xe9d3b0), top: new THREE.Color(0x5d8fc4), hor: new THREE.Color(0xf2d2a8), sun: new THREE.Color(0xffe2b8), hemi: new THREE.Color(0xcfe0ff) };
  const colSmoke = { fog: new THREE.Color(0x6b4a36), top: new THREE.Color(0x3a2a24), hor: new THREE.Color(0xc2622a), sun: new THREE.Color(0xff9a52), hemi: new THREE.Color(0xd8a080) };
  const colStorm = { fog: new THREE.Color(0x5d6b78), top: new THREE.Color(0x2e3a48), hor: new THREE.Color(0x7d8d9a), sun: new THREE.Color(0x9fb4c8), hemi: new THREE.Color(0x9fb4c8) };
  const tmpC = new THREE.Color();
  function setAtmosphere(smoke, storm, terrainApi) {
    const a = (key) => tmpC.copy(colClear[key]).lerp(colSmoke[key], smoke).lerp(colStorm[key], storm);
    scene.fog.color.copy(a('fog'));
    if (terrainApi) {
      terrainApi.skyMat.uniforms.uTop.value.copy(a('top'));
      terrainApi.skyMat.uniforms.uHorizon.value.copy(a('hor'));
      terrainApi.skyMat.uniforms.uSunCol.value.copy(a('sun'));
      terrainApi.waterMat.uniforms.uSky.value.copy(a('hor'));
    }
    sun.color.copy(a('sun'));
    sun.intensity = 2.4 * (1 - storm * 0.55) * (1 - smoke * 0.25);
    hemi.color.copy(a('hemi'));
    hemi.intensity = 1.25 * (1 - smoke * 0.3);
    renderer.setClearColor(scene.fog.color);
  }

  const tmpV = new THREE.Vector3();
  return { renderer, scene, camera, composer, bloom, grade, sun, hemi, rig, resize, updateCamera, framingFor, setAtmosphere, sunDir };
}

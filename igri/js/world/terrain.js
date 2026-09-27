// Ground, water, sky. The ground is one big plane painted from the layout
// canvas and composited with the live burn map (char, glowing heat, red
// retardant). Outside the playable rectangle it rises into forested hills.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { FIRE_NOISE } from '../fx/flames.js';

const W = WORLD.maxX - WORLD.minX;
const H = WORLD.maxZ - WORLD.minZ;

function detailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 128 + (Math.random() - 0.5) * 30;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
  }
  g.putImageData(img, 0, 0);
  // pebbles and blades
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const l = Math.random() < 0.5 ? 90 : 170;
    g.fillStyle = `rgb(${l},${l},${l})`;
    g.beginPath();
    g.ellipse(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(160,160,160,0.6)';
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function createTerrain(scene, layout, burnMap) {
  const groundTex = new THREE.CanvasTexture(layout.ground);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.flipY = false;
  groundTex.anisotropy = 8;
  groundTex.minFilter = THREE.LinearMipmapLinearFilter;
  const maskTex = new THREE.CanvasTexture(layout.mask);
  maskTex.flipY = false;

  const PAD = 900;
  const geo = new THREE.PlaneGeometry(W + PAD * 2, H + PAD * 2, 220, 300);
  geo.rotateX(-Math.PI / 2);
  geo.translate((WORLD.minX + WORLD.maxX) / 2, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const dx = Math.max(0, Math.abs(x) - (WORLD.maxX + 10));
    const dz = Math.max(WORLD.minZ - 10 - z, z - (WORLD.maxZ + 10), 0);
    const d = Math.hypot(dx, dz);
    if (d > 0) {
      const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 0.5 + 0.5 + Math.sin(x * 0.041 + z * 0.037) * 0.25;
      p.setY(i, Math.pow(d, 1.15) * (0.18 + n * 0.22));
    }
  }
  geo.computeVertexNormals();

  const uniforms = {
    uGround: { value: groundTex },
    uDetail: { value: detailTexture() },
    uBurn: { value: burnMap.texture },
    uBounds: { value: burnMap.bounds },
    uTime: { value: 0 },
    uWet: { value: 0 },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uGround;
        uniform sampler2D uDetail;
        uniform sampler2D uBurn;
        uniform vec4 uBounds;
        uniform float uTime;
        ${FIRE_NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 guv = (vWPos.xz - uBounds.xy) / uBounds.zw;
        float inside = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
        vec3 gcol = texture2D(uGround, clamp(guv, 0.001, 0.999)).rgb;
        float hn = fbm(vWPos.xz * 0.02);
        vec3 hill = mix(vec3(0.07, 0.12, 0.05), vec3(0.14, 0.2, 0.09), hn);
        hill = mix(hill, vec3(0.28, 0.3, 0.26), smoothstep(90.0, 260.0, vWPos.y));
        gcol = mix(hill, gcol, inside);
        float det = texture2D(uDetail, vWPos.xz / 3.0).r;
        float det2 = texture2D(uDetail, vWPos.xz / 23.0).r;
        gcol *= 0.55 + det * 0.55 + (det2 - 0.5) * 0.25;
        vec4 burn = texture2D(uBurn, guv) * inside;
        float charN = fbm(vWPos.xz * 0.35);
        float edgeN = fbm(vWPos.xz * 0.11 + 7.0);
        vec3 charCol = mix(vec3(0.018, 0.016, 0.015), vec3(0.1, 0.09, 0.082), charN);
        // organic, noisy scorch edges; ash greys where the fire burned hottest
        float charAmt = smoothstep(0.08 + edgeN * 0.35, 0.45 + edgeN * 0.4, burn.r);
        charCol = mix(charCol, vec3(0.2, 0.19, 0.18), smoothstep(0.6, 0.9, charN) * 0.5);
        gcol = mix(gcol, charCol, charAmt);
        gcol = mix(gcol, vec3(0.62, 0.1, 0.08) * (0.8 + det * 0.4), smoothstep(0.1, 0.8, burn.b) * 0.85);
        diffuseColor.rgb = gcol;
        float emberHeat = burn.g;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fl = fbm(vWPos.xz * 0.6 + vec2(uTime * 0.7, -uTime * 0.4));
        float speck = smoothstep(0.55, 0.8, fbm(vWPos.xz * 1.7 + vec2(0.0, uTime * 0.3)));
        float glow = pow(emberHeat, 1.8) * (0.15 + fl * 0.6 + speck * 1.2);
        totalEmissiveRadiance += vec3(1.6, 0.4, 0.07) * glow * 1.1;`,
      );
  };
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);

  // ---- water: one plane, masked by the layout's water channel
  const waterGeo = new THREE.PlaneGeometry(W, H, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate((WORLD.minX + WORLD.maxX) / 2, 0.05, (WORLD.minZ + WORLD.maxZ) / 2);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMask: { value: maskTex },
      uBounds: { value: burnMap.bounds },
      uTime: uniforms.uTime,
      uSky: { value: new THREE.Color(0x9cc6e4) },
      uDeep: { value: new THREE.Color(0x1f5570) },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask; uniform vec4 uBounds; uniform float uTime;
      uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uSun; uniform vec3 uTint;
      varying vec3 vW;
      ${FIRE_NOISE}
      void main() {
        vec2 uv = (vW.xz - uBounds.xy) / uBounds.zw;
        float m = texture2D(uMask, uv).g;
        if (m < 0.35) discard;
        float edge = smoothstep(0.35, 0.9, m);
        vec2 p = vW.xz * 0.12;
        float n = fbm(p + vec2(uTime * 0.25, uTime * 0.18)) + fbm(p * 2.3 - vec2(uTime * 0.3, 0.0)) * 0.5;
        vec3 nrm = normalize(vec3((n - 0.75) * 0.6, 1.0, (fbm(p.yx + uTime * 0.2) - 0.5) * 0.6));
        vec3 view = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(view, nrm), 0.0), 3.0);
        vec3 col = mix(uDeep, uSky, 0.25 + fres * 0.6);
        vec3 h = normalize(uSun + view);
        float spec = pow(max(dot(nrm, h), 0.0), 120.0);
        col += vec3(1.0, 0.95, 0.85) * spec * 1.5;
        col = mix(col, vec3(0.75, 0.85, 0.85), (1.0 - edge) * 0.6);
        gl_FragColor = vec4(col * uTint, 0.92 * edge);
        #include <colorspace_fragment>
      }
    `,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.renderOrder = 1;
  scene.add(water);

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x5d8fc4) },
      uHorizon: { value: new THREE.Color(0xf2d2a8) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.35, -0.8).normalize() },
      uSunCol: { value: new THREE.Color(0xffc98a) },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; varying vec3 vD;
      void main() {
        float y = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, y));
        float s = max(dot(normalize(vD), uSunDir), 0.0);
        c += uSunCol * (pow(s, 400.0) * 3.0 + pow(s, 8.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  return {
    terrain,
    water,
    sky,
    uniforms,
    waterMat,
    skyMat,
    update(time, camera) {
      uniforms.uTime.value = time;
      sky.position.copy(camera.position);
    },
  };
}

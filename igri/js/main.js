// Igri — boot, game state machine and the per-frame orchestration.
import * as THREE from 'three';
import { WORLD, ZONES, RUN, SKILLS, WANTED, TIERS, OBJECTS } from './config.js';
import { createRenderer } from './render.js';
import { generateLayout } from './world/layout.js';
import { BurnMap } from './world/burnmap.js';
import { createTerrain } from './world/terrain.js';
import { ObjectField, CUT } from './world/objects.js';
import { FlamePool } from './fx/flames.js';
import { FX } from './fx/particles.js';
import { Explosions } from './fx/explosions.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Weather } from './weather.js';
import { Boss } from './boss.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { playEnding } from './ending.js';
import { part, merge, cyl, sphere } from './models/geo.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BUILDING_TYPES = new Set(['cabin', 'barn', 'house', 'bldgS', 'bldgM', 'bldgL', 'tower', 'cityhall', 'dome', 'station', 'tanker']);

async function boot() {
  const setLoad = (t) => ($('loading-text').textContent = t);
  setLoad('숲을 심는 중…');
  await frame();
  try {
    await Promise.race([document.fonts.ready, sleep(1500)]);
  } catch (e) {
    /* fonts are optional */
  }

  const R = createRenderer($('stage'));
  const layout = generateLayout(20260927);
  setLoad('마을과 도시를 세우는 중…');
  await frame();

  const burnMap = new BurnMap(R.renderer);
  const terrain = createTerrain(R.scene, layout, burnMap);
  const flames = new FlamePool(R.scene);
  const fx = new FX(R.scene);
  const explosions = new Explosions(R.scene, fx, burnMap);
  const audio = new Audio();

  const g = {
    scene: R.scene,
    camera: R.camera,
    renderer: R.renderer,
    rig: R.rig,
    layout,
    burnMap,
    terrain,
    flames,
    fx,
    explosions,
    audio,
    bounds: WORLD,
    stars: 0,
    elapsed: 0,
    timeLeft: RUN.timeLimit,
    hitstop: 0,
    flash: 0,
    silent: false,
    grayTarget: 0,
    aftermath: false,
    state: 'loading',
    pickQueue: [],
    stats: { won: 0, trees: 0, buildings: 0, cars: 0, landmarks: [], habitat: 0, residents: 0, maxTier: 1, objects: 0, explosions: 0 },
    listeners: {},
    emit(type, ...args) {
      const fn = handlers[type];
      if (fn) fn(...args);
    },
    zoneAt(z) {
      for (const zn of ZONES) if (z >= zn.z0 && z <= zn.z1) return zn.key;
      return 'forest';
    },
    blast(x, z, radius, power, dmg, source) {
      explosions.spawn(x, z, radius);
      const P = g.player;
      field.query(x, z, radius, (id, d) => {
        if (d > radius + field.size[id] * 0.5) return;
        if (field.state[id] === 0 && field.need[id] <= power) {
          if (field.ignite(id, source === 'skill' ? 2 : 3) && source === 'skill') P.gain(field.fuel[id], 'skill');
        }
      });
      g.enemies.damageAt(x, z, radius, dmg);
      if (g.boss.active) g.boss.damageAt(x, z, radius * 0.4, dmg * 0.5);
      const pd = Math.hypot(P.pos.x - x, P.pos.z - z);
      if (source === 'blast' && pd < radius + P.r) P.gain(radius * 0.6 + 2, 'direct'); // explosions feed the fire
      const view = g.rig.dist;
      g.rig.shake = Math.max(g.rig.shake, Math.min(1.4, (radius / Math.max(4, view * 0.25)) * Math.max(0, 1 - pd / (view * 2.5))));
      if (pd < view * 3) audio.play('explode', Math.min(2, radius / 20));
    },
  };

  const field = new ObjectField(R.scene, layout.placements, {
    flames,
    fx,
    burnMap,
    onEvent: (type, id, source, doused) => handlers['field:' + type]?.(id, source, doused),
  });
  g.field = field;
  setLoad('불씨를 준비하는 중…');
  await frame();

  const input = new Input(R.renderer.domElement);
  g.input = input;
  const player = new Player(g);
  g.player = player;
  player.pos.set(WORLD.start.x, 0, WORLD.start.z);
  player.control = false;
  g.enemies = new Enemies(g);
  g.weather = new Weather(g);
  g.boss = new Boss(g);
  const hud = new HUD(g);
  g.hud = hud;

  // the cigarette butt that starts it all
  const hero = new THREE.Group();
  const butt = new THREE.Mesh(
    merge([
      part(cyl(0.012, 0.012, 0.11, 10), 0xf4f1ea, [0, 0.012, 0], [0, 0, Math.PI / 2]),
      part(cyl(0.0125, 0.0125, 0.045, 10), 0xd99a5b, [0.075, 0.012, 0], [0, 0, Math.PI / 2]),
      part(cyl(0.0122, 0.0122, 0.012, 10), 0x2a2420, [-0.058, 0.012, 0], [0, 0, Math.PI / 2]),
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  const tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 0.25) });
  const tip = new THREE.Mesh(sphere(0.011, 8, 6), tipMat);
  tip.position.set(-0.064, 0.012, 0);
  hero.add(butt, tip);
  hero.position.set(WORLD.start.x, 0, WORLD.start.z);
  hero.rotation.y = 0.4;
  hero.scale.setScalar(2.2);
  R.scene.add(hero);
  const heroLight = new THREE.PointLight(0xff7a30, 0.6, 1.5, 1.6);
  heroLight.position.set(WORLD.start.x - 0.12, 0.08, WORLD.start.z + 0.06);
  R.scene.add(heroLight);

  // ---------------------------------------------------------------- events
  const handlers = {
    tier(t, up) {
      if (up) {
        hud.banner(`TIER ${t.id} · ${t.name}`, t.blurb);
        audio.play('tierUp');
        g.stats.maxTier = Math.max(g.stats.maxTier, t.id);
        if (t.id === 4 && !g.bossScheduled) {
          g.bossScheduled = true;
          g.bossTimer = 8;
          hud.toast('도시 한복판 저수지에서 거대한 기운이 깨어납니다… 북쪽 도시로 향하세요', 'water');
        }
      } else {
        hud.banner(`단계 하락 · ${t.name}`, '연료가 부족합니다. 계속 태우세요!');
        audio.play('tierDown');
      }
    },
    hurt(kind) {
      if (kind === 'bump') audio.play('bump');
      else audio.play('hiss', kind === 'rain' ? 0.5 : 1);
    },
    bump() {},
    dead() {
      endRun('불씨가 꺼졌습니다');
    },
    dash() {
      audio.play('dash');
      g.boss.onDash();
    },
    spark() {
      audio.play('spark');
    },
    toast(msg) {
      hud.toast(msg);
    },
    popup(text, pos) {
      hud.popup(text, new THREE.Vector3(pos.x, (pos.y || 0) + player.r * 2 + 0.3, pos.z), 'warn');
    },
    siren() {
      audio.play('siren');
    },
    splash() {
      audio.play('splash');
    },
    drip() {
      audio.play('drip');
    },
    scream() {},
    animal() {},
    evaporate() {
      audio.play('hiss', 0.6);
    },
    truckExplode(a, rear) {
      if (rear) {
        hud.toast('엔진룸 직격! 소방차 폭발');
        queuePick('소방차');
      }
    },
    bossAwake() {
      audio.play('bossRoar');
      hud.banner('물의 정령', '물대포가 발사되는 순간 대쉬(SPACE)로 증발 패링!');
      g.rig.shake = 1;
    },
    bossHurt() {},
    parry() {
      audio.play('parry');
      hud.popup('증발 패링!', new THREE.Vector3(player.pos.x, player.r * 3 + 2, player.pos.z), 'parry');
    },
    bossDefeated() {
      hud.toast('물의 정령이 증발했습니다');
      setTimeout(() => endRun('재앙이 도시를 삼켰습니다'), 2500);
    },
    bossShot() {
      audio.play('bossShot');
    },
    bossCharge() {
      audio.play('bossCharge');
      audio.play('warning');
    },
    bossBeam() {
      audio.play('bossBeam');
    },
    bossWave() {
      audio.play('splash');
    },
    'field:ignite'(id, source) {
      if (source === 0) {
        const d = OBJECTS[field.typeKey[id]];
        if (!d.litter) audio.play('ignite', Math.min(2, 0.5 + field.size[id]));
        const fuel = field.fuel[id];
        if (fuel >= 3 && fuel > player.mass * 0.03) {
          hud.popup(`+${fuel < 10 ? fuel.toFixed(1) : Math.round(fuel)}`, new THREE.Vector3(field.x[id], field.height[id] + 0.3, field.z[id]), 'gain');
        }
      }
    },
    'field:burnt'(id, source, doused) {
      const key = field.typeKey[id];
      const d = OBJECTS[key];
      const s = g.stats;
      s.won += field.value[id] * (doused ? 0.6 : 1);
      s.objects++;
      if (d.tree) s.trees++;
      if (BUILDING_TYPES.has(key)) s.buildings++;
      if (key === 'car') s.cars++;
      if (d.landmark && !doused) s.landmarks.push(d.label);
      s.habitat += d.habitat || 0;
      s.residents += d.residents || 0;
    },
    'field:explode'(id) {
      const d = OBJECTS[field.typeKey[id]];
      const x = field.x[id], z = field.z[id];
      g.stats.explosions++;
      g.blast(x, z, d.explosive, d.explosive * 0.3 + 1, 3, 'blast');
      const pd = Math.hypot(player.pos.x - x, player.pos.z - z);
      if (pd < Math.max(70, g.rig.dist * 1.4)) queuePick(d.label);
    },
  };

  function queuePick(label) {
    // chain reactions shouldn't bury the player in menus
    if (g.pickQueue.length < 2) g.pickQueue.push(label);
  }

  async function openPick(label) {
    const avail = Object.keys(SKILLS).filter((k) => player.skills[k] < SKILLS[k].max);
    if (!avail.length) {
      player.setMass(player.mass * 1.15);
      hud.toast('모든 힘이 최대치 — 연료 +15%');
      return;
    }
    // prefer the three spec'd powers early, then mix in the rest
    const opts = [];
    const pool = avail.slice();
    while (opts.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      opts.push(pool.splice(i, 1)[0]);
    }
    g.state = 'choose';
    audio.play('explode', 0.6);
    const k = await hud.choose(opts, label);
    player.addSkill(k);
    audio.play('pick');
    hud.toast(`${SKILLS[k].name} Lv ${player.skills[k]} — ${SKILLS[k].desc(player.skills[k])}`);
    g.state = 'play';
    lastTime = performance.now();
  }

  let ending = false;
  function endRun(reason) {
    if (ending) return;
    ending = true;
    g.state = 'ending';
    player.control = false;
    hud.show(false);
    $('choose').hidden = true;
    g.rig.override = { pos: new THREE.Vector3(player.pos.x, Math.max(120, g.rig.dist * 1.6), player.pos.z + Math.max(80, g.rig.dist)), look: player.pos.clone(), speed: 0.6 };
    playEnding(g, reason);
  }

  // ---------------------------------------------------------------- title & intro
  const START = new THREE.Vector3(WORLD.start.x, 0, WORLD.start.z);
  g.rig.target.copy(START);
  g.rig.override = { pos: START.clone().add(new THREE.Vector3(0.55, 0.38, 0.75)), look: START.clone().add(new THREE.Vector3(-0.06, 0.02, 0)), speed: 3 };
  g.camera.position.copy(g.rig.override.pos);
  g.state = 'title';
  $('loading').classList.add('done');
  $('title').hidden = false;
  setTimeout(() => $('loading').remove(), 800);

  async function startGame() {
    if (g.state !== 'title') return;
    audio.start();
    audio.play('ui');
    g.state = 'intro';
    $('title').classList.add('out');
    setTimeout(() => ($('title').hidden = true), 700);
    const cap = $('caption');
    let skipped = false;
    const skip = () => (skipped = true);
    addEventListener('keydown', skip, { once: true });
    R.renderer.domElement.addEventListener('pointerdown', skip, { once: true });
    const say = async (text, ms) => {
      cap.textContent = text;
      cap.classList.add('show');
      const t0 = performance.now();
      while (performance.now() - t0 < ms && !skipped) await sleep(40);
      cap.classList.remove('show');
    };
    g.rig.override.pos.copy(START).add(new THREE.Vector3(0.35, 0.22, 0.5));
    await say('누군가 무심코 던진 담배꽁초 하나.', 2600);
    if (!skipped) {
      for (let i = 0; i < 26; i++) fx.ember(START.x - 0.1, 0.05, START.z, 0.15, 1);
      tipMat.color.setRGB(8, 3, 0.8);
      heroLight.intensity = 3;
      await say('마른 낙엽 위에서, 작은 불씨가 눈을 떴다.', 2400);
    }
    cap.classList.remove('show');
    player.setMass(1);
    player.control = true;
    g.rig.override = null;
    g.state = 'play';
    hud.show(true);
    hud.banner('TIER 1 · 불씨', TIERS[0].blurb);
    hud.toast('WASD·방향키 또는 마우스 왼쪽 버튼으로 이동 · SPACE로 고열 방출(대쉬)');
    tipMat.color.setRGB(0.2, 0.18, 0.16);
    heroLight.intensity = 0;
    lastTime = performance.now();
  }
  $('btn-start').addEventListener('click', startGame);
  $('btn-help').addEventListener('click', () => ($('help').hidden = !$('help').hidden));
  const soundBtns = document.querySelectorAll('[data-action="sound"]');
  const syncSound = () => soundBtns.forEach((b) => (b.textContent = audio.muted ? '소리 켜기' : '소리 끄기'));
  soundBtns.forEach((b) =>
    b.addEventListener('click', () => {
      audio.setMuted(!audio.muted);
      syncSound();
    }),
  );
  syncSound();
  $('btn-resume').addEventListener('click', () => togglePause(false));
  $('btn-restart').addEventListener('click', () => location.reload());
  $('btn-fullscreen').addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));

  function togglePause(on) {
    if (on && g.state === 'play') {
      g.state = 'pause';
      $('pause').hidden = false;
      $('btn-resume').focus();
    } else if (!on && g.state === 'pause') {
      g.state = 'play';
      $('pause').hidden = true;
      lastTime = performance.now();
    }
  }

  // ---------------------------------------------------------------- loop
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mouseWorld = new THREE.Vector3();
  const bossFocus = new THREE.Vector3();
  let lastTime = performance.now();
  let time = 0;
  let gray = 0;
  let atmoSmoke = 0, atmoStorm = 0;

  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const real = Math.max(1e-3, (now - lastTime) / 1000);
    const dt = Math.min(0.05, real);
    g.fps = Math.round(0.9 * (g.fps || 60) + 0.1 / real);
    lastTime = now;
    if (!g.frozen) step(dt);
    R.composer.render();
  }

  function step(dt) {
    time += dt;
    const acts = input.poll();
    if (acts.mute) {
      audio.setMuted(!audio.muted);
      syncSound();
    }
    if (acts.pause && (g.state === 'play' || g.state === 'pause')) togglePause(g.state === 'play');
    if (g.state === 'title' && acts.confirm) startGame();
    if (g.state === 'choose' && hud.pickHandler) {
      if (acts.pick1) hud.pickHandler(0);
      else if (acts.pick2) hud.pickHandler(1);
      else if (acts.pick3) hud.pickHandler(2);
    }

    let simDt = 0;
    if (g.state === 'play') {
      if (g.hitstop > 0) {
        g.hitstop -= dt;
        simDt = dt * 0.08;
      } else simDt = dt;
    } else if (g.state === 'title' || g.state === 'intro' || g.state === 'ending') simDt = dt;

    if (g.state === 'play') {
      ray.setFromCamera(new THREE.Vector2(input.mouse.x, input.mouse.y), g.camera);
      if (ray.ray.intersectPlane(ground, mouseWorld)) input.mouseWorld = mouseWorld;
      if (acts.dash) player.startDash(input);
      g.elapsed += simDt;
      g.timeLeft -= simDt;
      if (g.timeLeft <= 0) endRun('산불이 진화되었습니다');
      if (g.bossScheduled && !g.boss.active && !g.boss.dead) {
        g.bossTimer -= simDt;
        if (g.bossTimer <= 0) g.boss.awaken();
      }
      // wanted level from the damage bill
      let stars = 0;
      for (let i = 1; i < WANTED.length; i++) if (g.stats.won >= WANTED[i]) stars = i;
      if (stars > g.stars) {
        g.stars = stars;
        hud.toast(`지명 수배 ${'★'.repeat(stars)} — ${['', '소방관 출동', '소방차 투입', '소방차 증원', '소방 헬기 출격', '전 병력 투입'][stars]}`, 'alert');
        audio.play('siren');
      }
      if (g.pickQueue.length && g.state === 'play') openPick(g.pickQueue.shift());
    }

    if (simDt > 0) {
      const view = g.rig.dist * 1.1;
      if (g.state === 'play') {
        player.update(simDt, input);
        g.enemies.update(simDt, view);
        g.weather.update(simDt, view);
        g.boss.update(simDt);
      } else if (g.state === 'ending') {
        g.boss.update(simDt * 0.2);
      }
      field.update(simDt, {
        tier: player.tier.id,
        rainAt: (x, z) => g.weather.rainAt(x, z),
        focus: player.pos,
        viewRadius: view,
        spreadMul: g.state === 'play' ? 1 : 0.3,
      });
      explosions.update(simDt);
    }

    // camera
    let focus = g.state === 'play' || g.state === 'pause' || g.state === 'choose' ? player.pos : g.rig.target;
    let minDist = 0;
    if (g.boss.active && focus === player.pos) {
      // keep the spirit and the fire in the same frame
      const bd = Math.hypot(g.boss.pos.x - player.pos.x, g.boss.pos.z - player.pos.z);
      if (bd < 420) {
        bossFocus.lerpVectors(player.pos, g.boss.pos, 0.38);
        focus = bossFocus;
        minDist = bd * 1.05 + 90;
      }
    }
    if (g.aftermath && g.rig.override) {
      g.rig.override.pos.x += dt * 6;
      g.rig.override.pos.y += dt * 4;
    }
    // the title frames the smoldering butt on the right third
    if (g.state === 'title' || g.state === 'intro') g.camera.setViewOffset(innerWidth, innerHeight, g.state === 'title' ? -innerWidth * 0.2 : 0, 0, innerWidth, innerHeight);
    else if (g.camera.view && g.camera.view.enabled) g.camera.clearViewOffset();
    R.updateCamera(dt, focus, player.r, player.vel, minDist);
    if (g.state === 'play' || g.state === 'pause' || g.state === 'choose') {
      CUT.uCutA.value.set(player.pos.x, player.r * 0.9, player.pos.z);
      CUT.uCutB.value.copy(g.camera.position);
      CUT.uCutR.value = Math.max(1.4, player.r * 2.4 + 1.8);
    } else CUT.uCutR.value = 0;
    if (g.state === 'title') {
      const a = time * 0.12;
      g.rig.override.pos.set(START.x + Math.sin(a) * 0.62, 0.34, START.z + Math.cos(a) * 0.62);
      if (Math.random() < dt * 5) fx.smoke(START.x - 0.13, 0.03, START.z + 0.05, 0.035, 0.1);
      if (Math.random() < dt * 3) fx.ember(START.x - 0.13, 0.03, START.z + 0.05, 0.04, 1);
      tipMat.color.setRGB(3 + Math.sin(time * 3) * 1.2, 0.9, 0.25);
    }

    flames.update(time, g.scene.fog);
    fx.update(dt * (g.state === 'pause' || g.state === 'choose' ? 0 : 1), g.camera, R.renderer.domElement.height, g.scene.fog, null);
    terrain.update(time, g.camera);
    burnMap.flush(simDt);

    // atmosphere and grading
    const smokeT = Math.min(0.9, burnMap.burnedHa / 260 + (player.tier.id - 1) * 0.14);
    atmoSmoke += (smokeT - atmoSmoke) * Math.min(1, dt * 0.5);
    let near = 0;
    for (const zn of g.weather.zones) {
      const d = Math.hypot(zn.x - player.pos.x, zn.z - player.pos.z);
      near = Math.max(near, zn.k * Math.max(0, 1 - Math.max(0, d - zn.r) / (zn.r + 40)));
    }
    const stormT = Math.min(1, near * 0.55 + (g.boss.active ? 0.45 : 0));
    atmoStorm += (stormT - atmoStorm) * Math.min(1, dt * 0.8);
    R.setAtmosphere(atmoSmoke, atmoStorm, terrain);
    gray += (g.grayTarget - gray) * Math.min(1, dt * 1.2);
    const U = R.grade.uniforms;
    U.uGray.value = gray;
    U.uTilt.value = THREE.MathUtils.clamp(0.9 - player.r * 0.8, 0, 0.55) * (g.state === 'ending' ? 0 : g.state === 'title' ? 0.5 : 1);
    U.uHurt.value = Math.min(1, player.hurtFlash) * 0.8;
    U.uSteam.value = Math.max(0, Math.min(1, player.steam - 0.3)) * 0.22;
    U.uFlash.value = g.flash;
    g.flash = Math.max(0, g.flash - dt * 2.5);
    U.uTime.value = time;
    R.bloom.strength = 0.7 * (1 - gray * 0.7);

    if (g.state === 'play' || g.state === 'pause' || g.state === 'choose') hud.update(g.state === 'play' ? dt : 0);
    let heli = 0;
    for (const a of g.enemies.list) if (a.kind === 'heli' && !a.dead) heli = Math.max(heli, 1 - Math.min(1, Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z) / 200));
    audio.update({ r: player.r, burning: field.burning.length, rain: player.inRain ? 1 : Math.min(1, near), heli, tier: player.tier.id, silent: g.silent || g.state === 'title' });
  }
  tick();

  // test hooks: advance the simulation without waiting for frames
  window.__igri = g;
  window.__igriStep = (seconds, dt = 1 / 30) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) step(dt);
    return g.player.mass;
  };
  window.__ready = true;
}

boot().catch((err) => {
  console.error(err);
  const t = document.getElementById('loading-text');
  if (t) t.textContent = `불을 피우지 못했습니다: ${err.message}`;
});

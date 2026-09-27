// Procedural map: a southern forest trailhead where the butt is dropped,
// a rural valley with a village and power line, a river, the suburbs, and a
// dense city around a reservoir. Produces road/water masks, the painted ground
// texture, and the list of object placements.
import { WORLD } from '../config.js';

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAP_W = WORLD.maxX - WORLD.minX;
export const MAP_H = WORLD.maxZ - WORLD.minZ;
export const PX_PER_M = 1.28; // ground texture resolution
export const TEX_W = Math.round(MAP_W * PX_PER_M);
export const TEX_H = Math.round(MAP_H * PX_PER_M);

const toPx = (x, z) => [(x - WORLD.minX) * PX_PER_M, (z - WORLD.minZ) * PX_PER_M];

export function riverZ(x) {
  return WORLD.riverZ + Math.sin(x * 0.012) * 18 + Math.sin(x * 0.031 + 1.2) * 6;
}

function noise2(x, z) {
  return (
    Math.sin(x * 0.021 + Math.sin(z * 0.017) * 1.7) * 0.5 +
    Math.sin(z * 0.027 - x * 0.011 + 2.1) * 0.35 +
    Math.sin((x + z) * 0.061) * 0.15
  );
}

export function generateLayout(seed = 1337) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const roads = []; // { pts, w, kind }
  const fields = [];
  const placements = [];
  const lots = []; // rectangles reserved for buildings (no trees)
  const add = (type, x, z, rot = rnd() * Math.PI * 2, s = 1, extra = {}) => placements.push({ type, x, z, rot, s, ...extra });

  // ---------------------------------------------------------------- roads
  const main = [
    [60, 700], [52, 640], [58, 590], [74, 540], [52, 470], [30, 420], [22, 360], [-6, 300], [8, 230], [0, 190],
    [0, WORLD.riverZ], [0, 100], [0, -150], [0, -700],
  ];
  roads.push({ pts: main, w: 8, kind: 'asphalt' });
  // trails through the forest (dirt)
  roads.push({ pts: [[52, 640], [20, 628], [-20, 610], [-70, 600], [-130, 620], [-200, 590], [-260, 610]], w: 2.6, kind: 'trail' });
  roads.push({ pts: [[20, 628], [30, 580], [0, 520], [-40, 470], [-90, 440]], w: 2.6, kind: 'trail' });
  roads.push({ pts: [[74, 540], [130, 520], [190, 540], [250, 520], [320, 560]], w: 3.2, kind: 'trail' });
  // rural lanes
  roads.push({ pts: [[22, 360], [-60, 350], [-140, 370], [-250, 350], [-330, 380]], w: 5, kind: 'dirt' });
  roads.push({ pts: [[8, 230], [90, 250], [170, 240], [260, 270], [350, 250]], w: 5, kind: 'dirt' });
  roads.push({ pts: [[-150, 200], [-150, WORLD.riverZ], [-150, 100]], w: 6, kind: 'asphalt' });
  roads.push({ pts: [[160, 210], [160, WORLD.riverZ], [160, 100]], w: 6, kind: 'asphalt' });
  // suburb grid
  const subZ = [120, 70, 20, -30, -80, -130];
  const subX = [-300, -225, -150, -75, 0, 80, 160, 240, 310];
  for (const z of subZ) roads.push({ pts: [[-320, z], [330, z]], w: 7, kind: 'street' });
  for (const x of subX) roads.push({ pts: [[x, 130], [x, -150]], w: 7, kind: 'street' });
  // city grid
  const cityZ = [];
  for (let z = -160; z >= -690; z -= 72) cityZ.push(z);
  const cityX = [];
  for (let x = -360; x <= 360; x += 72) cityX.push(x);
  for (const z of cityZ) roads.push({ pts: [[-380, z], [380, z]], w: 14, kind: 'avenue' });
  for (const x of cityX) roads.push({ pts: [[x, -150], [x, -690]], w: 14, kind: 'avenue' });

  // ---------------------------------------------------------------- canvases
  const ground = document.createElement('canvas');
  ground.width = TEX_W;
  ground.height = TEX_H;
  const g = ground.getContext('2d');
  const mask = document.createElement('canvas'); // r: road, g: water, b: built-up
  mask.width = TEX_W;
  mask.height = TEX_H;
  const m = mask.getContext('2d');
  m.fillStyle = '#000';
  m.fillRect(0, 0, TEX_W, TEX_H);

  // base: per-zone palette painted in horizontal bands with noisy blends
  const img = g.createImageData(TEX_W, TEX_H);
  const zoneColor = (x, z) => {
    const n = noise2(x, z);
    // forest floor → dry meadow → lawns → concrete
    if (z > 420) return mix([70, 92, 48], [104, 112, 60], 0.5 + n * 0.5);
    if (z > 170) return mix([128, 142, 76], [170, 160, 92], 0.5 + n * 0.5);
    if (z > -150) return mix([116, 150, 84], [138, 160, 96], 0.5 + n * 0.5);
    return mix([150, 150, 146], [168, 166, 158], 0.5 + n * 0.5);
  };
  for (let py = 0; py < TEX_H; py++) {
    const z = WORLD.minZ + py / PX_PER_M;
    for (let px = 0; px < TEX_W; px++) {
      const x = WORLD.minX + px / PX_PER_M;
      // blend across zone borders
      const c0 = zoneColor(x, z);
      const c1 = zoneColor(x, z + 18 * noise2(z, x));
      const c = mix(c0, c1, 0.5);
      // edge of the map: forest continues on both sides
      const side = Math.max(0, (Math.abs(x) - 300) / 80);
      const cc = z < 170 && side > 0 ? mix(c, [84, 102, 58], Math.min(1, side)) : c;
      const i = (py * TEX_W + px) * 4;
      const grain = (hashPx(px, py) - 0.5) * 10;
      img.data[i] = cc[0] + grain;
      img.data[i + 1] = cc[1] + grain;
      img.data[i + 2] = cc[2] + grain;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // farm fields in the rural valley (east & west of the village)
  for (let i = 0; i < 26; i++) {
    const x = rnd() < 0.5 ? R(-320, -120) : R(80, 330);
    const z = R(185, 405);
    const w = R(40, 80), d = R(26, 50), rot = R(-0.3, 0.3);
    if (Math.abs(z - riverZ(x)) < 40) continue;
    const kinds = [
      ['#c9b25a', '#b89f4c'],
      ['#8fae5a', '#7d9c4c'],
      ['#9c7a55', '#8a6a48'],
      ['#d8c070', '#c7ae60'],
    ];
    const [c0, c1] = kinds[Math.floor(rnd() * kinds.length)];
    fields.push({ x, z, w, d, rot });
    paintRect(g, x, z, w, d, rot, (ctx, W, D) => {
      ctx.fillStyle = c0;
      ctx.fillRect(-W / 2, -D / 2, W, D);
      ctx.fillStyle = c1;
      for (let s = -D / 2; s < D / 2; s += 3.2 * PX_PER_M) ctx.fillRect(-W / 2, s, W, 1.4 * PX_PER_M);
    });
  }

  // suburb lawns + city sidewalks painted per block
  for (let bi = 0; bi < subX.length - 1; bi++) {
    for (let bj = 0; bj < subZ.length - 1; bj++) {
      const x0 = subX[bi] + 5, x1 = subX[bi + 1] - 5;
      const z0 = subZ[bj + 1] + 5, z1 = subZ[bj] - 5;
      g.fillStyle = 'rgba(126,164,90,0.9)';
      const [a, b] = toPx(x0, z0);
      g.fillRect(a, b, (x1 - x0) * PX_PER_M, (z1 - z0) * PX_PER_M);
      m.fillStyle = 'rgb(0,0,80)';
      m.fillRect(a, b, (x1 - x0) * PX_PER_M, (z1 - z0) * PX_PER_M);
    }
  }
  for (let bi = 0; bi < cityX.length - 1; bi++) {
    for (let bj = 0; bj < cityZ.length - 1; bj++) {
      const x0 = cityX[bi] + 8, x1 = cityX[bi + 1] - 8;
      const z0 = cityZ[bj + 1] + 8, z1 = cityZ[bj] - 8;
      const [a, b] = toPx(x0 - 2, z0 - 2);
      g.fillStyle = '#b9b7b0';
      g.fillRect(a, b, (x1 - x0 + 4) * PX_PER_M, (z1 - z0 + 4) * PX_PER_M);
      const [c, d] = toPx(x0, z0);
      g.fillStyle = '#9c9a94';
      g.fillRect(c, d, (x1 - x0) * PX_PER_M, (z1 - z0) * PX_PER_M);
      m.fillStyle = 'rgb(0,0,160)';
      m.fillRect(c, d, (x1 - x0) * PX_PER_M, (z1 - z0) * PX_PER_M);
    }
  }

  // roads
  const roadStyle = {
    asphalt: { fill: '#4d4f55', edge: '#6b6c70', line: '#e8c547', dash: true },
    avenue: { fill: '#46484e', edge: '#7a7b7e', line: '#f2f2f2', dash: true },
    street: { fill: '#55575c', edge: '#7c7d80', line: null },
    dirt: { fill: '#a88c62', edge: '#96805b', line: null },
    trail: { fill: '#9c8058', edge: '#8a7250', line: null },
  };
  for (const pass of ['edge', 'fill', 'line']) {
    for (const r of roads) {
      const st = roadStyle[r.kind];
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      r.pts.forEach(([x, z], i) => {
        const [a, b] = toPx(x, z);
        if (i === 0) g.moveTo(a, b);
        else g.lineTo(a, b);
      });
      if (pass === 'edge') {
        g.strokeStyle = st.edge;
        g.lineWidth = (r.w + 1.2) * PX_PER_M;
        g.stroke();
      } else if (pass === 'fill') {
        g.strokeStyle = st.fill;
        g.lineWidth = r.w * PX_PER_M;
        g.stroke();
        m.strokeStyle = r.kind === 'trail' ? 'rgb(120,0,0)' : 'rgb(255,0,0)';
        m.lineJoin = 'round';
        m.lineCap = 'round';
        m.lineWidth = (r.w + 2) * PX_PER_M;
        m.beginPath();
        r.pts.forEach(([x, z], i) => {
          const [a, b] = toPx(x, z);
          if (i === 0) m.moveTo(a, b);
          else m.lineTo(a, b);
        });
        m.stroke();
      } else if (st.line) {
        g.strokeStyle = st.line;
        g.lineWidth = 0.3 * PX_PER_M;
        g.setLineDash(st.dash ? [3 * PX_PER_M, 4 * PX_PER_M] : []);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  // water: river, lakes, reservoir (painted into ground + mask green)
  const paintWater = (drawPath) => {
    g.fillStyle = '#6f8c86';
    g.beginPath();
    drawPath(g, 3);
    g.fill();
    g.fillStyle = '#3f6f86';
    g.beginPath();
    drawPath(g, 0);
    g.fill();
    m.fillStyle = 'rgb(0,255,0)';
    m.beginPath();
    drawPath(m, 0);
    m.fill();
  };
  const riverPath = (ctx, pad) => {
    const hw = 9 + pad;
    const top = [], bot = [];
    for (let x = WORLD.minX - 10; x <= WORLD.maxX + 10; x += 6) {
      const z = riverZ(x);
      const w = hw + Math.sin(x * 0.05) * 2;
      top.push(toPx(x, z - w));
      bot.push(toPx(x, z + w));
    }
    ctx.moveTo(...top[0]);
    for (const p of top) ctx.lineTo(...p);
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(...bot[i]);
    ctx.closePath();
  };
  paintWater(riverPath);
  for (const L of WORLD.lakes) {
    paintWater((ctx, pad) => {
      const [a, b] = toPx(L.x, L.z);
      blobPath(ctx, a, b, (L.rx + pad) * PX_PER_M, (L.rz + pad) * PX_PER_M, L.x);
    });
  }
  // reservoir with a park ring
  {
    const Rv = WORLD.reservoir;
    const [a, b] = toPx(Rv.x, Rv.z);
    g.fillStyle = '#7aa66a';
    g.beginPath();
    g.arc(a, b, (Rv.r + 26) * PX_PER_M, 0, Math.PI * 2);
    g.fill();
    m.fillStyle = 'rgb(0,0,0)';
    m.beginPath();
    m.arc(a, b, (Rv.r + 26) * PX_PER_M, 0, Math.PI * 2);
    m.fill();
    g.strokeStyle = '#c9c1ae';
    g.lineWidth = 4 * PX_PER_M;
    g.beginPath();
    g.arc(a, b, (Rv.r + 10) * PX_PER_M, 0, Math.PI * 2);
    g.stroke();
    paintWater((ctx, pad) => {
      ctx.arc(a, b, (Rv.r + pad) * PX_PER_M, 0, Math.PI * 2);
    });
  }
  // bridges repaint road over the river (mask road only, no water)
  for (const bx of WORLD.bridges) {
    const z = riverZ(bx);
    const [a, b] = toPx(bx - 5, z - 16);
    g.fillStyle = '#6a6c72';
    g.fillRect(a, b, 10 * PX_PER_M, 32 * PX_PER_M);
    g.fillStyle = '#4d4f55';
    g.fillRect(a + 0.8 * PX_PER_M, b, 8.4 * PX_PER_M, 32 * PX_PER_M);
    m.fillStyle = 'rgb(255,0,0)';
    m.fillRect(a, b, 10 * PX_PER_M, 32 * PX_PER_M);
  }

  // start: a trailhead rest area (small gravel clearing)
  {
    const [a, b] = toPx(WORLD.start.x, WORLD.start.z);
    g.fillStyle = 'rgba(118,100,70,0.85)';
    g.beginPath();
    g.ellipse(a, b, 7 * PX_PER_M, 5 * PX_PER_M, 0.2, 0, Math.PI * 2);
    g.fill();
  }
  // campsite clearing
  const camp = { x: 44, z: 560 };
  {
    const [a, b] = toPx(camp.x, camp.z);
    g.fillStyle = 'rgba(140,132,86,0.95)';
    g.beginPath();
    g.ellipse(a, b, 34 * PX_PER_M, 26 * PX_PER_M, -0.3, 0, Math.PI * 2);
    g.fill();
  }

  const maskData = m.getImageData(0, 0, TEX_W, TEX_H).data;
  const sample = (x, z, ch) => {
    const px = Math.floor((x - WORLD.minX) * PX_PER_M);
    const py = Math.floor((z - WORLD.minZ) * PX_PER_M);
    if (px < 0 || py < 0 || px >= TEX_W || py >= TEX_H) return 0;
    return maskData[(py * TEX_W + px) * 4 + ch];
  };
  const isRoad = (x, z) => sample(x, z, 0) > 60;
  const isWater = (x, z) => sample(x, z, 1) > 128;
  const isBuilt = (x, z) => sample(x, z, 2) > 40;
  const blocked = (x, z, pad = 0) => {
    if (isRoad(x, z) || isWater(x, z)) return true;
    if (pad > 0) {
      for (const [dx, dz] of [[pad, 0], [-pad, 0], [0, pad], [0, -pad]]) if (isRoad(x + dx, z + dz) || isWater(x + dx, z + dz)) return true;
    }
    return false;
  };
  const inField = (x, z) => fields.some((f) => {
    const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
    const dx = x - f.x, dz = z - f.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < f.w / 2 && Math.abs(lz) < f.d / 2;
  });
  const inLots = (x, z, pad = 0) => lots.some((l) => Math.abs(x - l.x) < l.hw + pad && Math.abs(z - l.z) < l.hd + pad);

  // ---------------------------------------------------------------- start area
  const S = WORLD.start;
  add('butt', S.x, S.z, 0.4, 1, { hero: true });
  for (let i = 0; i < 2800; i++) {
    const r = 0.8 + rnd() * 56;
    const a = rnd() * Math.PI * 2;
    const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
    if (Math.hypot(x - S.x, z - S.z) < 0.6) continue;
    if (isWater(x, z)) continue;
    const k = rnd();
    const t = k < 0.46 ? 'leaf' : k < 0.72 ? 'grass' : k < 0.82 ? 'twig' : k < 0.9 ? 'pinecone' : k < 0.97 ? 'trash' : 'butt';
    add(t, x, z, rnd() * Math.PI * 2, R(0.8, 1.3));
  }
  // a few bushes and saplings right at the edge of the clearing for the first T2 step
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = R(12, 70);
    const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
    if (blocked(x, z, 1)) continue;
    const k = rnd();
    add(k < 0.6 ? 'bush' : k < 0.8 ? 'sapling' : 'log', x, z, rnd() * 6.28, R(0.8, 1.2));
  }
  // illegal dumping near the trailhead
  add('waste', S.x - 22, S.z - 16, 0.4, 1);
  add('gascan', S.x + 16, S.z + 9, 1.1, 1);

  // ---------------------------------------------------------------- campsite
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + R(-0.1, 0.1);
    const r = R(12, 26);
    const x = camp.x + Math.cos(a) * r * 1.2, z = camp.z + Math.sin(a) * r * 0.9;
    if (blocked(x, z, 2)) continue;
    add('tent', x, z, a + Math.PI / 2 + R(-0.4, 0.4), R(0.9, 1.15));
  }
  for (let i = 0; i < 12; i++) {
    const x = camp.x + R(-22, 22), z = camp.z + R(-16, 16);
    if (blocked(x, z, 1)) continue;
    add(rnd() < 0.5 ? 'picnic' : 'woodpile', x, z, rnd() * 6.28, 1);
  }
  for (let i = 0; i < 8; i++) add('trashbin', camp.x + R(-26, 26), camp.z + R(-20, 20), 0, 1);
  for (let i = 0; i < 4; i++) add('gascan', camp.x + R(-20, 20), camp.z + R(-14, 14), rnd() * 6, 1);
  for (let i = 0; i < 6; i++) add('car', camp.x + 30 + i * 2.6, camp.z + 22 + R(-1, 1), Math.PI / 2, 1, { color: Math.floor(rnd() * 7) });
  for (let i = 0; i < 260; i++) {
    const x = camp.x + R(-30, 30), z = camp.z + R(-24, 24);
    if (blocked(x, z)) continue;
    add(rnd() < 0.5 ? 'trash' : 'leaf', x, z, rnd() * 6.28, 1);
  }

  // ---------------------------------------------------------------- rural village
  const village = { x: -40, z: 300 };
  for (let i = 0; i < 46; i++) {
    const x = village.x + R(-120, 120), z = village.z + R(-90, 90);
    if (blocked(x, z, 6) || inField(x, z) || inLots(x, z, 4)) continue;
    add('cabin', x, z, R(-0.4, 0.4) + (rnd() < 0.5 ? 0 : Math.PI), R(0.9, 1.15));
    lots.push({ x, z, hw: 4, hd: 4 });
    if (rnd() < 0.5) add('woodpile', x + 4, z + R(-2, 2), rnd() * 6, 1);
    if (rnd() < 0.35) add('car', x - 5, z + 3, R(0, 6.28), 1, { color: Math.floor(rnd() * 7) });
  }
  for (const f of fields) {
    // barns and haystacks at field corners
    if (rnd() < 0.45) {
      const x = f.x + f.w / 2 + 8, z = f.z + R(-8, 8);
      if (!blocked(x, z, 7) && !inLots(x, z, 6)) {
        add('barn', x, z, f.rot + Math.PI / 2, R(0.9, 1.1));
        lots.push({ x, z, hw: 6, hd: 6 });
      }
    }
    const n = 3 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = f.x + R(-f.w / 2, f.w / 2) * 0.8, z = f.z + R(-f.d / 2, f.d / 2) * 0.8;
      if (!blocked(x, z, 1)) add('haystack', x, z, rnd() * 6, R(0.8, 1.2));
    }
    // dry crop stubble counts as grass fuel
    for (let k = 0; k < 40; k++) {
      const x = f.x + R(-f.w / 2, f.w / 2), z = f.z + R(-f.d / 2, f.d / 2);
      if (!blocked(x, z)) add('grass', x, z, rnd() * 6, R(1.4, 2.2));
    }
  }
  // power line crossing the valley
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = -330 + t * 660, z = 395 - t * 190 + Math.sin(t * 5) * 10;
    if (blocked(x, z, 5) || inField(x, z)) {
      add('pylon', x + 14, z - 10, 0.3, 1);
    } else add('pylon', x, z, 0.3, 1);
  }
  // more illegal dumping along rural lanes
  for (const [x, z] of [[-190, 380], [120, 262], [270, 300], [-280, 210]]) add('waste', x, z, rnd() * 6, 1);

  // ---------------------------------------------------------------- suburbs
  let hv = 0;
  for (let bi = 0; bi < subX.length - 1; bi++) {
    for (let bj = 0; bj < subZ.length - 1; bj++) {
      const x0 = subX[bi] + 8, x1 = subX[bi + 1] - 8;
      const z0 = subZ[bj + 1] + 8, z1 = subZ[bj] - 8;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // one park, one gas station, one fire station
      if (bi === 2 && bj === 2) {
        add('station', cx, cz, 0, 1);
        lots.push({ x: cx, z: cz, hw: 14, hd: 14 });
        continue;
      }
      if ((bi === 5 && bj === 1) || (bi === 1 && bj === 4)) {
        for (let k = 0; k < 18; k++) add(rnd() < 0.6 ? 'oak' : 'bush', R(x0, x1), R(z0, z1), rnd() * 6, R(0.7, 1.1));
        for (let k = 0; k < 4; k++) add('picnic', R(x0, x1), R(z0, z1), rnd() * 6, 1);
        continue;
      }
      const cols = Math.max(2, Math.floor((x1 - x0) / 13));
      for (const row of [0, 1]) {
        for (let c = 0; c < cols; c++) {
          const x = x0 + ((c + 0.5) / cols) * (x1 - x0);
          const z = row === 0 ? z0 + 6 : z1 - 6;
          if (blocked(x, z, 4)) continue;
          const t = hv++ % 6;
          add('house', x, z, row === 0 ? Math.PI : 0, R(0.92, 1.06), { model: t === 0 ? 'house' : `house${t}` });
          lots.push({ x, z, hw: 5, hd: 5 });
          if (rnd() < 0.45) add('car', x + 5.2, z + (row === 0 ? 5 : -5), Math.PI / 2, 1, { color: Math.floor(rnd() * 7) });
          if (rnd() < 0.5) add('bush', x - 5, z, rnd() * 6, R(0.8, 1.2));
          if (rnd() < 0.35) add('trashbin', x + 3, z + (row === 0 ? -4.5 : 4.5), 0, 1);
          if (rnd() < 0.3) add('sapling', x - 4.5, z + (row === 0 ? 4 : -4), rnd() * 6, R(1.2, 1.6));
        }
      }
    }
  }
  // street trees
  for (const z of subZ) {
    for (let x = -310; x < 320; x += R(14, 22)) {
      const zz = z + (rnd() < 0.5 ? 6.5 : -6.5);
      if (!blocked(x, zz, 1.5) && !inLots(x, zz, 1)) add('oak', x, zz, rnd() * 6, R(0.55, 0.75));
    }
  }

  // ---------------------------------------------------------------- city
  const Rv = WORLD.reservoir;
  const landmarkAt = { tower: [-180, -560], cityhall: [144, -300], dome: [216, -610] };
  for (let bi = 0; bi < cityX.length - 1; bi++) {
    for (let bj = 0; bj < cityZ.length - 1; bj++) {
      const x0 = cityX[bi] + 10, x1 = cityX[bi + 1] - 10;
      const z0 = cityZ[bj + 1] + 10, z1 = cityZ[bj] - 10;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.hypot(cx - Rv.x, cz - Rv.z) < Rv.r + 40) continue;
      let lm = null;
      for (const [k, [lx, lz]] of Object.entries(landmarkAt)) if (Math.abs(cx - lx) < 40 && Math.abs(cz - lz) < 40) lm = k;
      if (lm) {
        add(lm, cx, cz, 0, 1);
        continue;
      }
      if (bi === 0 && bj === 1) {
        add('tanker', cx, cz, 0, 1);
        continue;
      }
      // downtown gets taller toward the reservoir
      const d = Math.hypot(cx - Rv.x, cz - Rv.z);
      const tall = Math.max(0, 1 - d / 420);
      const split = rnd() < 0.55 ? 2 : 1;
      for (let a = 0; a < split; a++) {
        for (let b = 0; b < split; b++) {
          const w = (x1 - x0) / split, dd = (z1 - z0) / split;
          const bx = x0 + w * (a + 0.5), bz = z0 + dd * (b + 0.5);
          const fw = w * R(0.62, 0.9), fd = dd * R(0.62, 0.9);
          const h = 10 + Math.pow(rnd(), 1.6) * 30 + tall * tall * R(20, 120);
          const type = h > 70 ? 'bldgL' : h > 32 ? 'bldgM' : 'bldgS';
          add(type, bx, bz, 0, 1, { dims: [fw, h, fd], hue: Math.floor(rnd() * 6) });
        }
      }
      if (rnd() < 0.5) add('car', cx + R(-20, 20), z1 + 5, 0, 1, { color: Math.floor(rnd() * 7) });
    }
  }
  // cars along avenues, trees in the reservoir park
  for (let i = 0; i < 140; i++) {
    const vertical = rnd() < 0.5;
    const x = vertical ? cityX[Math.floor(rnd() * cityX.length)] + (rnd() < 0.5 ? 3 : -3) : R(-370, 370);
    const z = vertical ? R(-680, -160) : cityZ[Math.floor(rnd() * cityZ.length)] + (rnd() < 0.5 ? 3 : -3);
    if (!isWater(x, z)) add('car', x, z, vertical ? 0 : Math.PI / 2, 1, { color: Math.floor(rnd() * 7) });
  }
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = R(Rv.r + 8, Rv.r + 24);
    const x = Rv.x + Math.cos(a) * r, z = Rv.z + Math.sin(a) * r;
    if (!blocked(x, z, 1)) add(rnd() < 0.7 ? 'oak' : 'bush', x, z, rnd() * 6, R(0.6, 1));
  }

  // ---------------------------------------------------------------- forests everywhere else
  const treeGrid = new Map();
  const cell = 5;
  const tooClose = (x, z, min) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = treeGrid.get(`${cx + i},${cz + j}`);
      if (list) for (const [tx, tz] of list) if ((tx - x) ** 2 + (tz - z) ** 2 < min * min) return true;
    }
    return false;
  };
  const putTree = (type, x, z, s) => {
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!treeGrid.has(k)) treeGrid.set(k, []);
    treeGrid.get(k).push([x, z]);
    add(type, x, z, rnd() * 6.28, s);
  };
  const forestDensity = (x, z) => {
    if (Math.hypot(x - S.x, z - S.z) < 16) return 0;
    if (Math.hypot(x - camp.x, z - camp.z) < 34) return 0;
    const n = noise2(x * 1.3, z * 1.3);
    if (z > 420) return 0.85 + n * 0.15;
    if (z > 170) return Math.max(0, 0.25 + n * 0.55);
    const side = Math.abs(x) > 320 ? 0.8 : 0;
    if (z > -150) return side;
    return side * 0.7;
  };
  let tries = 0;
  let trees = 0;
  while (tries++ < 90000 && trees < 11000) {
    const x = R(WORLD.minX + 2, WORLD.maxX - 2), z = R(WORLD.minZ + 2, WORLD.maxZ - 2);
    const dens = forestDensity(x, z);
    if (rnd() > dens) continue;
    if (blocked(x, z, 2.5) || inField(x, z) || inLots(x, z, 3) || isBuilt(x, z)) continue;
    const s = R(0.75, 1.3);
    if (tooClose(x, z, 4.2 * s)) continue;
    const pineish = z > 420 ? 0.7 : 0.45;
    putTree(rnd() < pineish ? 'pine' : 'oak', x, z, s);
    trees++;
    // undergrowth: the campfire tier lives on this
    const under = z > 170 ? 0.68 : 0.3;
    if (rnd() < under) {
      const bx = x + R(-3.5, 3.5), bz = z + R(-3.5, 3.5);
      if (!blocked(bx, bz)) {
        const k = rnd();
        add(k < 0.62 ? 'bush' : k < 0.82 ? 'sapling' : 'log', bx, bz, rnd() * 6.28, R(0.75, 1.3));
      }
    }
  }
  // forest floor litter (T1 fuel everywhere in the forest and meadows)
  const litter = (x, z) => {
    if (blocked(x, z) || inLots(x, z)) return;
    const k = rnd();
    add(k < 0.4 ? 'grass' : k < 0.8 ? 'leaf' : k < 0.9 ? 'twig' : 'pinecone', x, z, rnd() * 6.28, R(0.9, 1.4));
  };
  for (let i = 0; i < 7000; i++) litter(R(WORLD.minX, WORLD.maxX), R(170, WORLD.maxZ));
  // drifts of dry leaves: stepping stones for a tiny ember, densest near the start
  for (let c = 0; c < 320; c++) {
    const nearStart = c < 90;
    const cx = nearStart ? S.x + R(-110, 110) : R(WORLD.minX + 10, WORLD.maxX - 10);
    const cz = nearStart ? S.z + R(-110, 60) : R(180, WORLD.maxZ - 10);
    if (blocked(cx, cz, 2)) continue;
    const rad = R(2.5, 5);
    const n = 30 + Math.floor(rnd() * 40);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * rad;
      litter(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
    }
  }
  // leaf litter along the hiking trails
  for (const r of roads) {
    if (r.kind !== 'trail') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let k = 0; k < len * 1.6; k++) {
        const t = rnd();
        const side = (rnd() < 0.5 ? -1 : 1) * R(2.2, 5);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        litter(ax + (bx - ax) * t + nx * side, az + (bz - az) * t + nz * side);
      }
    }
  }
  // lakeside puddles for campfire-tier threat
  const puddles = [];
  for (let i = 0; i < 40; i++) {
    const x = R(-300, 300), z = R(200, 690);
    if (blocked(x, z, 3) || Math.hypot(x - S.x, z - S.z) < 20) continue;
    puddles.push({ x, z, r: R(1.2, 3.6) });
  }
  // dew beads near the start
  const dew = [];
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = R(3, 50);
    dew.push({ x: S.x + Math.cos(a) * r, z: S.z + Math.sin(a) * r, r: R(0.05, 0.1) });
  }

  return { placements, roads, fields, ground, mask, isRoad, isWater, isBuilt, blocked, puddles, dew, camp, village, cityX, cityZ, subX, subZ };
}

function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hashPx(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function paintRect(g, x, z, w, d, rot, draw) {
  const [a, b] = toPx(x, z);
  g.save();
  g.translate(a, b);
  g.rotate(rot);
  draw(g, w * PX_PER_M, d * PX_PER_M);
  g.restore();
}

function blobPath(ctx, cx, cy, rx, ry, seed) {
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 + seed * 2);
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

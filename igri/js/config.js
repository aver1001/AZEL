// All tuning lives here so balancing never means hunting through systems.
// Units: meters, seconds, won (₩). Player size is "mass"; radius = 0.25·√mass.

export const WORLD = {
  minX: -400,
  maxX: 400,
  minZ: -700,
  maxZ: 700,
  start: { x: 12, z: 626 },
  riverZ: 150,
  bridges: [-150, 0, 160],
  reservoir: { x: 0, z: -470, r: 62 },
  lakes: [
    { x: -210, z: 300, rx: 55, rz: 38 },
    { x: 230, z: 480, rx: 40, rz: 30 },
    { x: 250, z: -20, rx: 30, rz: 24 },
  ],
};

export const ZONES = [
  // north (negative z) is the city; the fire starts in the southern forest
  { key: 'forest', name: '입산로 숲', z0: 420, z1: 700 },
  { key: 'rural', name: '산림·시골 마을', z0: 170, z1: 420 },
  { key: 'suburb', name: '교외 주택가', z0: -150, z1: 140 },
  { key: 'city', name: '도시', z0: -700, z1: -150 },
];

export const MASS = {
  start: 1,
  min: 0.3, // below this the ember goes out
  max: 22000,
  radius: (m) => 0.25 * Math.sqrt(m),
  massFor: (r) => (r / 0.25) ** 2,
  decay: (m) => 0.03 + 0.011 * m, // fuel burned per second just by existing
  speed: (r) => 3 + 2.1 * Math.pow(r, 0.75),
};

export const TIERS = [
  {
    id: 1, name: '불씨', en: 'EMBER', minR: 0,
    cam: { pitch: 0.8, dist0: 4.2, dist1: 9.5, fov: 40 },
    blurb: '마른 낙엽과 쓰레기를 태워 몸을 키우세요. 빗방울·이슬·작은 동물을 조심!',
  },
  {
    id: 2, name: '모닥불', en: 'CAMPFIRE', minR: 1,
    cam: { pitch: 1.06, dist0: 12, dist1: 27, fov: 40 },
    blurb: '덤불과 텐트, 쓰레기통까지 삼킬 수 있습니다. 소화기를 든 소방관과 웅덩이를 피하세요.',
  },
  {
    id: 3, name: '들불', en: 'WILDFIRE', minR: 3,
    cam: { pitch: 1.12, dist0: 34, dist1: 85, fov: 40 },
    blurb: '아름드리나무와 오두막이 연료가 됩니다. 소방차의 물대포와 국지성 호우에 대비하세요.',
  },
  {
    id: 4, name: '재앙', en: 'CATASTROPHE', minR: 10,
    cam: { pitch: 1.34, dist0: 130, dist1: 330, fov: 40 },
    blurb: '숲 전체와 빌딩, 랜드마크까지. 소방 헬기와 물의 정령이 막아섭니다.',
  },
];

export function tierForRadius(r) {
  let t = TIERS[0];
  for (const tier of TIERS) if (r >= tier.minR) t = tier;
  return t;
}

// Burnable object catalog. `need` is the minimum player radius that can
// ignite it on contact; bigger objects bump you and cost mass.
//   fuel: mass gained when you consume it
//   value: property damage in won
//   size: collision radius (m), dur: seconds it keeps burning
//   burnt: 'vanish' | 'char' | 'collapse'
export const OBJECTS = {
  leaf:      { label: '마른 낙엽', need: 0, fuel: 0.15, value: 0, size: 0.09, dur: 0.8, burnt: 'vanish', litter: true },
  grass:     { label: '마른 잔디', need: 0, fuel: 0.2, value: 0, size: 0.12, dur: 1.0, burnt: 'vanish', litter: true, habitat: 0.02 },
  trash:     { label: '쓰레기', need: 0.1, fuel: 0.45, value: 0, size: 0.1, dur: 1.2, burnt: 'vanish', litter: true },
  twig:      { label: '나뭇가지', need: 0.18, fuel: 0.36, value: 0, size: 0.16, dur: 1.2, burnt: 'vanish', litter: true },
  pinecone:  { label: '솔방울', need: 0.16, fuel: 0.3, value: 0, size: 0.07, dur: 1.0, burnt: 'vanish', litter: true },
  butt:      { label: '담배꽁초', need: 0, fuel: 0.1, value: 0, size: 0.05, dur: 0.5, burnt: 'vanish', litter: true },

  log:       { label: '쓰러진 통나무', need: 0.95, fuel: 5, value: 20000, size: 0.45, dur: 5, burnt: 'char', habitat: 0.4 },
  bush:      { label: '덤불', need: 0.85, fuel: 3.8, value: 30000, size: 0.7, dur: 3, burnt: 'char', habitat: 0.6 },
  sapling:   { label: '어린 나무', need: 1.3, fuel: 5.8, value: 200000, size: 0.35, dur: 4, burnt: 'char', tree: true, habitat: 0.4 },
  tent:      { label: '텐트', need: 1.25, fuel: 9, value: 400000, size: 1.3, dur: 4, burnt: 'collapse' },
  trashbin:  { label: '쓰레기통', need: 0.75, fuel: 4, value: 150000, size: 0.4, dur: 3, burnt: 'char' },
  picnic:    { label: '피크닉 테이블', need: 1.05, fuel: 6, value: 300000, size: 1.0, dur: 4, burnt: 'char' },
  woodpile:  { label: '장작더미', need: 0.95, fuel: 9, value: 100000, size: 0.7, dur: 5, burnt: 'char' },

  pine:      { label: '소나무', need: 2.3, fuel: 7.5, value: 800000, size: 0.55, dur: 8, burnt: 'char', tree: true, habitat: 1.2 },
  oak:       { label: '아름드리나무', need: 2.9, fuel: 10.5, value: 1500000, size: 0.9, dur: 9, burnt: 'char', tree: true, habitat: 2 },
  haystack:  { label: '건초더미', need: 2.0, fuel: 8, value: 500000, size: 1.2, dur: 5, burnt: 'char' },
  car:       { label: '자동차', need: 3.0, fuel: 22, value: 25000000, size: 2.1, dur: 7, burnt: 'char' },
  cabin:     { label: '오두막', need: 3.5, fuel: 42, value: 120000000, size: 3.1, dur: 10, burnt: 'collapse' },
  barn:      { label: '헛간', need: 4.4, fuel: 58, value: 200000000, size: 4.4, dur: 11, burnt: 'collapse' },
  house:     { label: '주택', need: 5.2, fuel: 75, value: 400000000, size: 4.6, dur: 12, burnt: 'collapse', residents: 3 },

  bldgS:     { label: '상가 건물', need: 8.5, fuel: 170, value: 4000000000, size: 9, dur: 14, burnt: 'collapse', residents: 25 },
  bldgM:     { label: '오피스 빌딩', need: 12.5, fuel: 320, value: 15000000000, size: 11, dur: 16, burnt: 'collapse', residents: 120 },
  bldgL:     { label: '초고층 빌딩', need: 18, fuel: 620, value: 80000000000, size: 14, dur: 18, burnt: 'collapse', residents: 400 },
  tower:     { label: '전망 타워', need: 22, fuel: 1400, value: 300000000000, size: 11, dur: 20, burnt: 'collapse', landmark: true },
  cityhall:  { label: '시청', need: 21, fuel: 1200, value: 250000000000, size: 22, dur: 20, burnt: 'collapse', landmark: true, residents: 300 },
  dome:      { label: '돔 경기장', need: 26, fuel: 1800, value: 400000000000, size: 34, dur: 22, burnt: 'collapse', landmark: true },

  // explosives: burning one triggers a blast and a skill pick
  gascan:    { label: 'LPG 가스통', need: 0.55, fuel: 4, value: 100000, size: 0.3, dur: 0.1, burnt: 'vanish', explosive: 7 },
  waste:     { label: '불법 폐기물', need: 1.15, fuel: 8, value: 0, size: 1.1, dur: 0.1, burnt: 'vanish', explosive: 12 },
  pylon:     { label: '송전탑', need: 3.8, fuel: 28, value: 2000000000, size: 2.6, dur: 0.1, burnt: 'char', explosive: 34 },
  station:   { label: '주유소', need: 6.5, fuel: 110, value: 3000000000, size: 11, dur: 0.1, burnt: 'collapse', explosive: 60 },
  tanker:    { label: '유조 탱크', need: 14, fuel: 300, value: 20000000000, size: 12, dur: 0.1, burnt: 'collapse', explosive: 110 },
};

export const SPREAD = {
  // chance per second that a burning object ignites each eligible neighbor
  chance: { 1: 0.0, 2: 0.03, 3: 0.055, 4: 0.09 },
  range: (size) => 2 + size * 2.4,
  maxBurning: 900,
};

export const DAMAGE = {
  bump: 0.012, // fraction of mass lost when ramming something too big
  rain: 0.06, // per second while under rain
  raindrop: 0.12, // single T1 raindrop strike
  dew: 0.12,
  animal: 0.15,
  puddle: 0.12, // per second
  foam: 0.1, // per second in an extinguisher cone
  truck: 0.2, // per second in a truck stream
  heliDrop: 0.2,
  retardant: 0.12, // per second standing in retardant
  bossOrb: 0.04,
  bossBeam: 0.25, // per second
  bossWave: 0.1,
  water: 0.6, // per second in a lake/river
};

// Wanted level thresholds by cumulative damage (won)
export const WANTED = [0, 1e7, 5e8, 1e10, 1e11, 6e11];

export const SKILLS = {
  wind:   { name: '바람', icon: 'wind', max: 5, desc: (l) => `이동 속도 +${l * 12}% · 지나간 자리에 잔불 ${(1.6 + l * 0.6).toFixed(1)}초` },
  oil:    { name: '기름', icon: 'oil', max: 5, desc: (l) => `${(6.2 - l * 0.7).toFixed(1)}초마다 반경 ×${(2.3 + l * 0.45).toFixed(1)} 광역 폭발` },
  spark:  { name: '불티', icon: 'spark', max: 5, desc: (l) => `${(1.7 - l * 0.2).toFixed(1)}초마다 유도 불씨 ${l}발 발사` },
  heat:   { name: '열기', icon: 'heat', max: 5, desc: (l) => `주변 반경 ×${(1.25 + l * 0.2).toFixed(2)} 안의 가연물이 저절로 발화` },
  coal:   { name: '숯불', icon: 'coal', max: 5, desc: (l) => `연료 소모 −${l * 12}% · 물 피해 −${l * 10}%` },
  whirl:  { name: '화염 회오리', icon: 'whirl', max: 5, desc: (l) => `주위를 도는 화염구 ${l}개` },
  flash:  { name: '플래시오버', icon: 'flash', max: 5, desc: (l) => `대쉬 쿨타임 −${l * 12}% · 대쉬 끝에 폭발` },
};

export const DASH = {
  cooldown: 1.8,
  duration: 0.28,
  speedMul: 3.2,
  cost: 0.015, // fraction of mass
  parryWindow: 0.28,
};

export const RUN = {
  timeLimit: 16 * 60, // seconds until the fire is declared contained
};

export const ENDING = {
  // Drop licensed wildfire photographs into assets/ending/ and list them here
  // (e.g. 'assets/ending/photo1.jpg'). They are shown in black & white, silent,
  // right after the receipt. With no photos the game shows the charred map.
  photos: [],
  message: '이 모든 시작은 작은 담배꽁초 하나였습니다.',
  treesPerHa: 850, // average stems per hectare used for the tree estimate
  nestsPerHa: 140,
};

// ---------------------------------------------------------------- fun layer
// Combo: every consumption within the window keeps the chain alive.
export const COMBO = {
  window: 1.9, // seconds before the chain breaks
  fuelPerStep: 0.006, // +0.6% fuel per combo step…
  fuelCap: 0.3, // …up to +30%
  cashIn: 0.0025, // on break: +0.25% of mass per combo step (capped)
  cashInCap: 0.18,
  milestones: { 10: '불붙었다!', 25: '타오른다!', 50: '멈출 수 없어!', 100: '재앙의 전조', 200: '불바다' },
};

// Fever ("화염 폭주"): fill the gauge by chaining burns.
export const FEVER = {
  duration: 7,
  speed: 1.35,
  reach: 1.15, // can swallow things 15% bigger than you
  fuel: 1.25,
  aura: 1.4, // auto-ignite radius (× r)
};

// Mission chain shown in the HUD. `stat` is a counter bumped by game events.
export const MISSIONS = [
  { id: 'litter', tier: 1, text: '낙엽·쓰레기 60개 태우기', stat: 'litter', goal: 60, reward: 'fuel' },
  { id: 'combo', tier: 1, text: '연소 콤보 25 달성', stat: 'comboMax', goal: 25, reward: 'fuel', max: true },
  { id: 'camp', tier: 2, text: '캠핑장 텐트 8동 태우기', stat: 'tent', goal: 8, reward: 'pick' },
  { id: 'gas', tier: 2, text: 'LPG 가스통 폭발 2회', stat: 'gascan', goal: 2, reward: 'fuel' },
  { id: 'firefighter', tier: 2, text: '소방관 3명 물리치기', stat: 'ffDown', goal: 3, reward: 'fuel' },
  { id: 'forest', tier: 3, text: '나무 150그루 태우기', stat: 'trees', goal: 150, reward: 'pick' },
  { id: 'pylon', tier: 3, text: '송전탑 2기 폭파', stat: 'pylon', goal: 2, reward: 'pick' },
  { id: 'village', tier: 3, text: '오두막·헛간 10동 태우기', stat: 'cabin', goal: 10, reward: 'fuel' },
  { id: 'truck', tier: 3, text: '소방차 엔진룸 폭파 2회', stat: 'truckRear', goal: 2, reward: 'pick' },
  { id: 'suburb', tier: 3, text: '주택 25채 태우기', stat: 'house', goal: 25, reward: 'time' },
  { id: 'station', tier: 3, text: '주유소 폭파', stat: 'station', goal: 1, reward: 'pick' },
  { id: 'heli', tier: 4, text: '소방 헬기 격추', stat: 'heliDown', goal: 1, reward: 'pick' },
  { id: 'landmark', tier: 4, text: '랜드마크 3곳 소실', stat: 'landmark', goal: 3, reward: 'fuel' },
  { id: 'boss', tier: 4, text: '물의 정령 증발시키기', stat: 'boss', goal: 1, reward: null },
];

// Timed "긴급 과제" that pop up between missions.
export const CHALLENGES = {
  every: [55, 80], // seconds between challenges
  kinds: [
    { kind: 'burn', text: (n, s) => `${s}초 안에 ${n}개 태우기`, n: { 1: 35, 2: 30, 3: 45, 4: 30 }, secs: 15 },
    { kind: 'combo', text: (n, s) => `${s}초 안에 콤보 ${n} 달성`, n: { 1: 20, 2: 25, 3: 35, 4: 30 }, secs: 20 },
    { kind: 'trees', text: (n, s) => `${s}초 안에 나무 ${n}그루`, n: { 3: 40, 4: 60 }, secs: 20, minTier: 3 },
  ],
};

export const WIND = {
  every: [80, 130],
  duration: 22,
  speed: 7, // m/s drift for smoke and embers
};

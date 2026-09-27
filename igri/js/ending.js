// The turn: after the thrill, a printed damage receipt, then silence and
// black & white — photos of a real wildfire if the developer supplied them,
// otherwise the charred world the player just made — and the closing line.
import { ENDING, TIERS } from './config.js';
import { formatWon } from './hud.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildReceipt(g, reason) {
  const s = g.stats;
  const E = g.enemies.stats;
  const ha = g.burnMap.burnedHa;
  const forestHa = g.burnMap.burnedForestHa;
  const trees = Math.round(forestHa * ENDING.treesPerHa + s.trees * 3);
  const nests = Math.round(forestHa * ENDING.nestsPerHa + s.habitat * 4 + E.animalsLost);
  const crews = Math.round(E.firefighters + E.trucks * 5 + E.helis * 3 + ha * 4.5 + 12);
  const residents = Math.round(E.evacuated + s.residents);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const mm = Math.floor(g.elapsed / 60), ss = Math.floor(g.elapsed % 60);
  const lines = [
    ['head', '산불 피해 영수증'],
    ['sub', `발행 ${stamp}`],
    ['sub', '발화 원인 · 버려진 담배꽁초 1개'],
    ['rule'],
    ['row', '소실 면적', `${ha.toFixed(1)} ha`],
    ['row', '태운 나무', `${trees.toLocaleString('ko-KR')} 그루`],
    ['row', '잃어버린 야생동물 보금자리', `${nests.toLocaleString('ko-KR')} 곳`],
    ['row', '불탄 건물', `${s.buildings.toLocaleString('ko-KR')} 동`],
    ['row', '불탄 차량', `${s.cars.toLocaleString('ko-KR')} 대`],
    ['row', '대피한 주민', `${residents.toLocaleString('ko-KR')} 명`],
    ['row', '투입된 소방 인력', `${crews.toLocaleString('ko-KR')} 명`],
    ['row', '투입 장비', `소방차 ${E.trucks} · 헬기 ${E.helis}`],
  ];
  if (s.landmarks.length) lines.push(['row', '소실된 랜드마크', s.landmarks.join(', ')]);
  lines.push(
    ['rule'],
    ['total', '총 재산 피해액', formatWon(s.won)],
    ['row', '숲이 회복되기까지', '30 ~ 100년'],
    ['rule'],
    ['row', '최고 단계', `${TIERS[s.maxTier - 1].name} (Tier ${s.maxTier})`],
    ['row', '연소 시간', `${pad(mm)}:${pad(ss)}`],
    ['row', '결과', reason],
    ['barcode'],
    ['foot', '이 영수증은 환불되지 않습니다.'],
  );
  return lines;
}

export async function playEnding(g, reason) {
  const root = document.getElementById('ending');
  const paper = document.getElementById('receipt');
  const photo = document.getElementById('photo');
  const msg = document.getElementById('ending-msg');
  const actions = document.getElementById('ending-actions');
  root.hidden = false;
  root.className = 'phase-receipt';
  paper.innerHTML = '';
  msg.textContent = '';
  actions.hidden = true;
  const header = document.getElementById('ending-head');
  header.textContent = reason;

  const lines = buildReceipt(g, reason);
  for (const l of lines) {
    const row = document.createElement('div');
    row.className = `r-${l[0]}`;
    if (l[0] === 'row' || l[0] === 'total') row.innerHTML = `<span>${l[1]}</span><span class="dots"></span><span>${l[2]}</span>`;
    else if (l[0] === 'rule') row.textContent = '';
    else if (l[0] === 'barcode') row.innerHTML = Array.from({ length: 46 }, () => `<i style="width:${1 + Math.floor(Math.random() * 3)}px"></i>`).join('');
    else row.textContent = l[1];
    paper.appendChild(row);
    g.audio.play('tick');
    paper.scrollTop = paper.scrollHeight;
    await sleep(l[0] === 'rule' ? 90 : 230);
  }
  await waitForContinue(root, 'continue-receipt', 12000);

  // silence, black & white
  root.className = 'phase-silence';
  g.silent = true;
  g.grayTarget = 1;
  await sleep(900);
  if (ENDING.photos.length) {
    for (const src of ENDING.photos.slice(0, 2)) {
      photo.style.backgroundImage = `url("${src}")`;
      photo.classList.add('show');
      await sleep(3200);
      photo.classList.remove('show');
      await sleep(600);
    }
  } else {
    // the aftermath the player left behind, from above
    g.aftermath = true;
    await sleep(4200);
  }
  root.className = 'phase-message';
  for (let i = 1; i <= ENDING.message.length; i++) {
    msg.textContent = ENDING.message.slice(0, i);
    await sleep(95);
  }
  await sleep(2600);
  actions.hidden = false;
  document.getElementById('to-title').focus();
  await waitForContinue(root, 'to-title', 8000);
  location.reload();
}

function waitForContinue(root, id, autoMs) {
  return new Promise((resolve) => {
    const btn = document.getElementById(id);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      btn.removeEventListener('click', finish);
      removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') finish();
    };
    if (btn) {
      btn.hidden = false;
      btn.addEventListener('click', finish);
    }
    addEventListener('keydown', onKey);
    setTimeout(finish, autoMs);
  });
}

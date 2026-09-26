// 장표 구도 회귀 검사: 여러 근거 구성으로 /api/draft 를 불러, 추천된 구도마다 화면(public/prototype.html 의 slideHtml)이
// 빈 장표 없이 그려지는지 본다. 구도 코드(lib/draft.js recommendDeck · slideHtml)를 고친 뒤 돌린다.
//   npx next dev -p 3100 을 띄운 상태에서:  node scripts/check_deck.mjs [http://localhost:3100]
// Playwright 가 필요하다(클라우드 환경은 전역 설치본, PLAYWRIGHT_BROWSERS_PATH 설정됨). 빈 장표가 있으면 종료 코드 1
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const base = process.argv[2] || 'http://localhost:3100';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { const g = execSync('npm root -g').toString().trim(); ({ chromium } = createRequire(g + '/')('playwright')); }

const get = async (title, orgs, ministry) => {
  const q = new URLSearchParams({ title, orgs, ministry, scope: 'all', limit: '30' });
  return (await (await fetch(`${base}/api/evidence?${q}`)).json()).results;
};
const pool = [...await get('AI·디지털 기반 교육혁신 역량 강화 연수', '한국교육학술정보원,교육부', '교육부'), ...await get('AI 교육 추진 계획 교원 연수', '서울특별시교육청,교육부', '교육부')];
const docs = [...new Set(pool.map((r) => r.docId))];
const pick = (i, role) => ({ ...pool.filter((r) => r.docId === docs[i % docs.length])[0], role, text: '' });
const same = pool.filter((r) => r.docId === docs[0]).slice(0, 2).map((r) => ({ ...r, role: 'policy', text: '' }));
const num = pool.find((r) => /\d{2,}\s?(%|명|개교|억)/.test(r.quote));
const K = { chain: [{ name: '한국교육학술정보원', role: '발주기관' }, { name: '교육부', role: '주무부처' }], ministry: '교육부' };
const cases = {
  '카드 1장': [pick(0, 'policy')],
  '한 문서 2장': same,
  '정책 3문서': [pick(0, 'policy'), pick(1, 'policy'), pick(2, 'policy')],
  '정책+수요': [pick(0, 'policy'), { ...(num || pick(1)), role: 'demand', text: '' }],
  '발주 중심': [pick(0, 'agency'), pick(1, 'agency'), pick(2, 'agency'), pick(3, 'policy')],
  '4역할': [pick(0, 'agency'), pick(1, 'agency'), pick(2, 'policy'), pick(3, 'tech'), { ...(num || pick(4)), role: 'demand', text: '' }],
};

const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', (e) => console.log('화면 오류:', e.message));
await p.goto(`${base}/prototype.html`);
let bad = 0;
for (const [name, cards] of Object.entries(cases)) {
  const res = await p.evaluate(async ({ cards, lineage }) => {
    const r = await (await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notice: { name: '시험 사업', demandOrg: '한국교육학술정보원' }, lineage, cards, headlines: {}, conclusion: '' }) })).json();
    const host = document.createElement('div'); host.style.width = '1000px'; document.body.appendChild(host);
    const out = r.draft.deck.options.map((o) => {
      host.innerHTML = '<div class="sl-wrap">' + slideHtml(o.slide) + '</div>';
      const body = host.querySelector('.sl-body');
      return { k: o.key, ok: !!body && body.children.length > 0 && body.innerText.trim().length >= 20 };
    });
    host.remove();
    return { out, hidden: (r.draft.deck.hidden || []).map((h) => h.key) };
  }, { cards, lineage: K });
  const fails = res.out.filter((x) => !x.ok).map((x) => x.k);
  bad += fails.length;
  console.log(`${name}: 구도 ${res.out.length}개 (${res.out.map((x) => x.k).join(', ')})${res.hidden.length ? ' / 숨김 ' + res.hidden.join(', ') : ''}${fails.length ? ' / 빈 장표 ' + fails.join(', ') : ''}`);
}
await b.close();
console.log(bad ? `빈 장표 ${bad}개` : '모든 구도가 그려짐');
process.exit(bad ? 1 : 0);

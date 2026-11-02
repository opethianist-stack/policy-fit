// AI 기능 회귀 검사: /api/ai 의 다섯 작업(검색어 추천·관련도 판정·역할 분류·초안·장표 문구)을 실제 키로 한 번씩 불러
// 오류가 나거나 결과가 비면 실패로 본다. AI·검색 코드(lib/ai.js · lib/llm.js · lib/search.js · lib/match.js)를 고친 뒤 PR 전에 돌린다.
// STEP72: 관련도 판정을 고치다 역할 분류·검색어 추천이 함께 깨졌는데(user is not defined) 3일 동안 몰랐다.
//   키(ANTHROPIC_API_KEY 또는 POLICYFIT_ANTHROPIC_KEY)를 넣고 POLICYFIT_AUTH_DISABLED=1 next start -p 3100 을 띄운 상태에서:
//   node scripts/check_ai.mjs [http://localhost:3100]
// 실제 모델을 부르므로 한 번에 몇 센트 든다. 하나라도 실패하면 종료 코드 1
const base = process.argv[2] || 'http://localhost:3100';

// 합덕제철고 공고(R26BK01732376)로 고정. 카드는 색인 검색 결과에서 가져와 원문 대조를 통과한다
const NOTICE = { no: 'R26BK01732376', name: '합덕제철고등학교 재도약 지원사업 교원 및 학생 연수 위탁 용역', demandOrg: '충청남도교육청 합덕제철고등학교' };
const LINEAGE = {
  chain: [{ name: '합덕제철고등학교', role: '교육청 소속기관' }, { name: '충청남도교육청', role: '시도교육청' }, { name: '교육부', role: '관계 부처' }],
  orgs: ['합덕제철고등학교', '충청남도교육청', '교육부'], ministry: '교육부',
};
// 제안요청서 목적·배경 구역처럼 쓴 문장(문장 대조가 돌도록 3개 이상)
const PURPOSE = [
  '마이스터고 재도약 지원사업의 일환으로 교원과 학생의 신산업·신기술 역량을 강화하고자 한다.',
  '미래 산업 수요에 맞춘 전문교과 교육과정 운영을 위해 교원 연수와 학생 심화과정을 운영한다.',
  '인공지능과 소프트웨어 기초 역량을 갖춘 직업계고 인재를 양성하여 지역 산업과 연계한다.',
  '마이스터고 학생의 진로교육과 현장 실무 역량을 함께 높이는 체계를 마련한다.',
];

const post = async (body) => {
  const r = await fetch(`${base}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: `응답을 읽지 못함(HTTP ${r.status})` }));
};
let failed = 0;
async function check(name, run, judge) {
  const t0 = Date.now();
  let d;
  try { d = await run(); } catch (e) { d = { ok: false, error: e.message }; }
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const why = !d.ok ? (d.error || '실패') : judge(d);
  const drop = d.dropped && d.dropped.length ? ` · 검증에서 뺀 항목 ${d.dropped.length}` : '';
  if (why === true) console.log(`  통과  ${name} ${sec}초${drop}`);
  else { failed++; console.log(`  실패  ${name} ${sec}초 — ${why}`); }
  return d;
}

const ready = await (await fetch(`${base}/api/ai`)).json().catch(() => ({}));
if (!ready.ready) { console.log('AI 키가 등록되지 않았습니다(ANTHROPIC_API_KEY 또는 POLICYFIT_ANTHROPIC_KEY).'); process.exit(1); }
console.log(`모델 ${ready.model}`);

const q = new URLSearchParams({ title: NOTICE.name, orgs: LINEAGE.orgs.join(','), ministry: LINEAGE.ministry, limit: '20' });
const ev = await (await fetch(`${base}/api/evidence?${q}`)).json();
if (!ev.results || ev.results.length < 4) { console.log('정책 근거 검색 결과가 4건 미만이라 검사할 수 없습니다.'); process.exit(1); }
const cards = ev.results.slice(0, 4).map((r) => ({ id: r.id, docId: r.docId, org: r.org, category: r.category, title: r.title, year: r.year, page: r.page, pageEstimated: r.pageEstimated, quote: r.quote, role: r.role, text: '', matched: r.matched || [] }));
const body = { notice: NOTICE, lineage: LINEAGE, cards, headlines: {}, conclusion: '' };

await check('검색어 추천(terms)', () => post({ task: 'terms', title: NOTICE.name, terms: ev.terms || [], orgs: LINEAGE.orgs, rfpText: PURPOSE.join('\n') }),
  (d) => (d.terms && d.terms.length ? true : '추천 검색어 0개'));
await check('관련도 판정(rank)', () => post({ task: 'rank', notice: NOTICE, lineage: LINEAGE, candidates: ev.results, purpose: PURPOSE }),
  (d) => {
    if (!d.ranked || !d.ranked.length) return '판정된 후보 0건';
    const failedCalls = (d.dropped || []).filter((x) => /판정 호출 실패/.test(x.reason || '')).length;
    if (failedCalls) return `묶음 호출 실패 ${failedCalls}건`;
    return d.ranked.some((x) => x.score >= 3) ? true : '3점 이상 후보 없음(합덕제철고는 5점 후보가 있어야 함)';
  });
await check('역할 분류(roles)', () => post({ task: 'roles', ...body }),
  (d) => (d.roles && d.roles.length ? true : '분류된 카드 0건'));
await check('초안(draft)', () => post({ task: 'draft', ...body }),
  (d) => ((d.sentences || []).length && (d.headlines || []).length && d.conclusion ? true : `불릿 ${(d.sentences || []).length}·헤드라인 ${(d.headlines || []).length}·수렴점 ${d.conclusion ? 1 : 0}`));
await check('장표 문구(deck)', () => post({ task: 'deck', ...body }),
  (d) => (d.headline || (d.cells || []).length ? true : '헤드라인·칸 문구 모두 없음'));

console.log(failed ? `실패 ${failed}건` : '모든 AI 기능 통과');
process.exit(failed ? 1 : 0);

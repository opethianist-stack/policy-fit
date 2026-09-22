import rules from '../data/org-rules.json';
import { verifyQuote, getPage } from './search';
import { ROLES, ROLE_KEYS, NUMERIC, defaultRole, missingNumbers } from './roles';

// 선택된 정책 근거 카드 → "사업 이해도·추진 배경" 문서 모델(논증 블록 구조).
//
//   1. 사업 추진 배경   가. (정책 기조) 헤드라인 / - 문장 (「문서명」, 기관, 연도, p.N) …
//   2. 추진 배경 종합   구분 | 내용 | 근거  + 수렴점(사업 추진의 필요성)
//   참고. 사업 개요 및 발주처 계보
//
// 문서에 들어가는 문장은 네 종류뿐이다.
//   ① 색인 원문과 대조를 통과한 발췌문(담당자가 문장을 안 쓰면 따옴표로 그대로 싣는다)
//   ② 담당자가 쓴 헤드라인·문장·수렴점   ③ API 값으로 채운 정형 문장(사업 개요, 계보)
//   ④ 출처 표기(색인 메타데이터)
// 대조에 실패한 카드는 모델에 넣지 않고 blocked 로 돌려준다.
// 담당자 문장 속 숫자가 그 카드의 원문 쪽에 없으면 factWarnings 로 알린다(차단은 하지 않음).

const MARKS = ['가', '나', '다', '라', '마', '바'];
const won = (n) => (n ? Number(n).toLocaleString('ko-KR') + '원' : '-');
const fullOrg = (org) => ((rules.aliases[org] || [])[0]) || org;
export const cite = (c) => `(「${c.title}」, ${fullOrg(c.org)}, ${c.year}, p.${c.page})`;
const citeShort = (c) => `「${c.title}」 p.${c.page}`;
// HWP 글머리 기호가 사용자 정의 영역 글자(󰊱 등)로 추출되는 경우가 있어 문서에서는 뺀다(대조는 원문 그대로 한다).
const clean = (s) => String(s || '').replace(/[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFD}]/gu, ' ').replace(/\s+/g, ' ').trim();

export function buildDraft({ notice, lineage, cards, headlines = {}, conclusion = '' }) {
  const blocked = [];
  const ok = [];
  for (const c of cards || []) {
    if (!verifyQuote(c.docId, c.page, c.quote)) { blocked.push({ id: c.id, reason: '원문 대조 실패' }); continue; }
    const role = ROLE_KEYS.includes(c.role) ? c.role : defaultRole(c, lineage || {});
    const text = clean(c.text != null ? c.text : c.logic);   // logic: STEP 2 이전 필드명
    ok.push({ ...c, role, text });
  }

  // 담당자 문장의 숫자 대조
  const factWarnings = [];
  for (const c of ok) {
    if (!c.text) continue;
    const p = getPage(c.docId, c.page);
    const miss = missingNumbers(c.text, p ? p.text : '');
    if (miss.length) factWarnings.push({ id: c.id, numbers: miss });
  }

  const used = ROLES.filter((r) => ok.some((c) => c.role === r.key));
  const head = (k) => clean(headlines[k]);
  const sections = [];

  // 1. 사업 추진 배경 — 역할 블록
  sections.push({
    heading: '1. 사업 추진 배경',
    blocks: used.map((r, i) => ({
      type: 'argument', role: r.key, mark: MARKS[i], label: r.label, headline: head(r.key),
      bullets: ok.filter((c) => c.role === r.key).map((c) => ({
        cardId: c.id, quoted: !c.text, text: c.text || clean(c.quote), cite: cite(c),
      })),
    })),
  });

  // 2. 추진 배경 종합 — 수렴 표 (역할이 둘 이상일 때)
  const concl = clean(conclusion);
  if (used.length >= 2) {
    const rows = used.map((r) => {
      const list = ok.filter((c) => c.role === r.key);
      const content = head(r.key) || list.filter((c) => c.text).map((c) => c.text).join(' / ');
      const refs = [...new Set(list.map(citeShort))];
      return [r.side, content, refs.slice(0, 2).join(', ') + (refs.length > 2 ? ` 외 ${refs.length - 2}건` : '')];
    });
    const block = { type: 'grid', header: ['구분', '내용', '근거'], widths: [1700, 4626, 2700], rows };
    if (concl) block.foot = ['수렴점\n(사업 추진의 필요성)', concl];
    sections.push({ heading: '2. 추진 배경 종합', blocks: [block] });
  }

  // 참고. 사업 개요 및 발주처 계보 — 붙여 넣을 때 빼기 쉽게 맨 뒤
  const chain = (lineage && lineage.chain) || [];
  sections.push({
    heading: '참고. 사업 개요 및 발주처 계보',
    blocks: [
      {
        type: 'table',
        rows: [
          ['사업명', notice.name],
          [notice.manual ? '발주기관' : '수요기관', notice.demandOrg],
          ['공고기관', notice.manual ? '' : (notice.noticeOrg || notice.demandOrg)],
          [notice.budget ? '배정예산' : '추정가격', notice.manual ? '' : won(notice.budget || notice.estimatedPrice)],
          ['입찰마감', (notice.closeAt || '').slice(0, 16)],
          ['입찰공고번호', notice.no ? `${notice.no}${notice.ord ? '-' + notice.ord : ''}` : ''],
        ].filter((r) => r[1] && r[1] !== '-'),   // 나라장터 밖 사업은 사업명·발주기관만 남는다
      },
      ...(chain.length ? [{ type: 'flow', nodes: chain.map((c) => ({ name: c.name, role: c.role })) }] : []),
    ],
  });

  const numeric = ok.filter((c) => NUMERIC.test(c.quote));
  return {
    title: '사업 이해도 · 추진 배경',
    subtitle: notice.name,
    sections,
    stats: {
      adopted: ok.length,
      blocked: blocked.length,
      roles: used.map((r) => r.key),
      missingHeadline: used.filter((r) => !head(r.key)).map((r) => r.key),
      quotedAsIs: ok.filter((c) => !c.text).length,
      pageEstimated: ok.filter((c) => c.pageEstimated).map((c) => c.id),
      numeric: numeric.length,
    },
    roleOf: Object.fromEntries(ok.map((c) => [c.id, c.role])),
    factWarnings,
    blocked,
    deck: recommendDeck(ok, numeric, used, chain, head, concl, notice),
  };
}

// 장표 구도 추천(규칙). 부서 정성제안서의 "제안 배경" 장표 문법을 따라 근거 구성에 맞는 구도를 고르고,
// 칸마다 실제 문구(발췌·담당자 문장·헤드라인·수렴점·출처)를 채운 장표 데이터를 돌려준다. 그리기는 화면이 한다.
// 제안사 쪽 칸(수행 실적, 대응 방향)은 도구가 모르는 내용이라 채우지 않고 규격만 적은 빈칸(slot)으로 둔다.
//   roadmap  정책 로드맵형   로드맵 화살표 + 연도순 정책 단계 카드(제목/정책·사업/의미) + 필요성 카드, 아래 제안사 행
//   converge 수렴형          측면별 머리띠 칸 + 하단 수렴점 바
//   voices   현장 근거형     측면별 머리띠 + 발췌 카드(검색어 강조)
//   derive   근거-도출형     왼쪽 근거 요약 목록 → 오른쪽 시사점 도출(체크)
//   numeric  수치 강조형     핵심 수치 + 근거 표
const ROLE_ORDER = { policy: 0, agency: 1, tech: 2, demand: 3 };
function recommendDeck(ok, numeric, used, chain, head, concl, notice) {
  const cut = (s, n) => { s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const line = (c, n) => ({ text: cut(c.text || c.quote, n), quoted: !c.text, terms: c.text ? [] : (c.matched || []) });
  const quote = (c, n) => ({ text: cut(c.quote, n), quoted: true, terms: c.matched || [] });
  const src = (c) => `「${c.title}」(${c.year}) p.${c.page}`;
  const roleOf = (k) => ROLES.find((r) => r.key === k) || { label: '', side: '' };
  const ofRole = (k) => ok.filter((c) => c.role === k);
  const docs = [];
  for (const c of ok) { const k = `「${c.title}」(${fullOrg(c.org)}, ${c.year})`; if (!docs.includes(k)) docs.push(k); }
  const foot = docs.length ? '* 출처: ' + docs.slice(0, 3).join(' | ') + (docs.length > 3 ? ` 외 ${docs.length - 3}건` : '') : '';
  const ministry = (chain.find((c) => /부$|처$|청$|위원회$/.test(c.name) && c.role !== '발주기관') || {}).name || '';
  const base = { section: '사업 이해도', project: (notice && notice.name) || '', headline: ['', concl], foot };

  // 정책 단계 후보: 현장 수요가 아닌 카드, 문서당 1장, 역할 우선순위로 3장 → 연도순
  const seen = new Set();
  const stageCards = ok.filter((c) => c.role !== 'demand')
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .filter((c) => (seen.has(c.docId) ? false : seen.add(c.docId)))
    .slice(0, 3)
    .sort((a, b) => String(a.year).localeCompare(String(b.year)) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  const years = new Set(ok.map((c) => c.year));
  const minDocs = !!ministry && stageCards.some((c) => c.org === ministry || fullOrg(c.org) === ministry);
  const usedHead = new Set();
  const stageTitle = (c) => { const h = head(c.role); if (h && !usedHead.has(c.role)) { usedHead.add(c.role); return { text: cut(h, 22), ph: false }; } return { text: cut(c.title, 22), ph: false }; };
  const demand = ofRole('demand');

  const options = [];
  if (stageCards.length >= 2) {
    options.push({
      key: 'roadmap', name: '정책 로드맵형', when: '상위 정책이 연도순으로 이어져 본 사업의 필요성에 닿는 흐름을 보여줄 때',
      slide: {
        ...base, layout: 'roadmap',
        band: minDocs ? `${ministry} 정책 로드맵` : '정책 로드맵',
        rowLabel: minDocs ? ministry : '정책',
        stages: stageCards.map((c) => ({ year: c.year, title: stageTitle(c), top: quote(c, 46), bottom: c.text ? { text: cut(c.text, 46) } : null, source: src(c) })),
        need: {
          title: head('demand') ? cut(head('demand'), 22) : '',
          top: demand[0] ? line(demand[0], 46) : null,
          bottom: concl ? { text: cut(concl, 46) } : null,
        },
        proposer: { label: '제안사', listTitle: '관련 사업 수행 역량', rows: 4, boxTitle: concl ? cut(concl, 40) : '' },
      },
    });
  }
  if (used.length >= 2) {
    options.push({
      key: 'converge', name: '수렴형', when: '서로 다른 측면의 근거가 하나의 추진 필요성으로 모일 때',
      slide: {
        ...base, layout: 'converge',
        columns: used.map((r) => ({ label: r.side, headline: head(r.key), bullets: ofRole(r.key).slice(0, 3).map((c) => line(c, used.length > 3 ? 60 : 76)), source: ofRole(r.key).slice(0, 3).map(src).join(' / ') })),
        bottom: { label: '수렴점', text: concl },
      },
    });
  }
  if (ok.length >= 3) {
    const cols = used.slice(0, 3);
    options.push({
      key: 'voices', name: '현장 근거형', when: '발췌 원문을 측면별로 나란히 보여 근거의 양을 강조할 때',
      slide: {
        ...base, layout: 'voices',
        columns: cols.map((r) => ({ label: r.label, headline: head(r.key), cards: ofRole(r.key).slice(0, 3).map((c) => ({ ...quote(c, 120), source: src(c) })) })),
      },
    });
  }
  options.push({
    key: 'derive', name: '근거-도출형', when: '근거를 요약해 나열하고 사업 시사점을 뽑아 내는 구성을 쓸 때',
    slide: {
      ...base, layout: 'derive',
      leftTitle: '정책 근거 요약',
      items: ok.slice(0, 6).map((c) => ({ label: `「${cut(c.title, 18)}」(${c.year})`, ...line(c, 60) })),
      rightTitle: '사업 시사점 도출',
      checks: used.slice(0, 3).map((r) => ({ label: r.label, headline: head(r.key), sub: ofRole(r.key)[0] ? line(ofRole(r.key)[0], 80) : null })),
      bottom: concl,
    },
  });
  if (numeric.length >= 2) {
    const G = new RegExp(NUMERIC.source, 'g');
    const statSeen = new Set();
    const stats = numeric.map((c) => {
      const q = clean(c.quote);
      const m = q.match(G) || [''];
      const at = Math.max(0, q.indexOf(m[0]));
      const ctx = c.text || q.slice(Math.max(0, at - 28), at + m[0].length + 18).replace(/^\S*\s/, '');
      return { value: m[0].replace(/\s/g, ''), label: cut(ctx, 46), source: src(c), card: c };
    }).filter((x) => (statSeen.has(x.value) ? false : statSeen.add(x.value))).slice(0, 3);
    const statCards = stats.map((x) => x.card);
    stats.forEach((x) => delete x.card);
    const rest = ok.filter((c) => !statCards.includes(c)).slice(0, 5);
    if (stats.length >= 2) options.push({
      key: 'numeric', name: '수치 강조형', when: '수치가 들어간 근거가 2건 이상일 때',
      slide: { ...base, layout: 'numeric', title: '핵심 지표', stats, rows: rest.map((c) => ({ label: roleOf(c.role).label, ...line(c, 70), source: src(c) })) },
    });
  }

  const rec = stageCards.length >= 3 && years.size >= 2 ? 'roadmap'
    : numeric.length >= 3 && options.some((o) => o.key === 'numeric') ? 'numeric'
      : used.length >= 3 ? 'converge'
        : stageCards.length >= 2 ? 'roadmap' : 'derive';
  const reason = {
    roadmap: `정책 문서 ${stageCards.length}건이 ${[...new Set(stageCards.map((c) => c.year))].join('·')}년에 걸쳐 있어 연도순 로드맵 구도를 추천합니다.`,
    numeric: `수치가 들어간 근거가 ${numeric.length}건이라 숫자를 앞세우는 구도를 추천합니다.`,
    converge: `근거가 ${used.map((r) => r.label).join(' · ')}에 걸쳐 있어 한 결론으로 모으는 구도를 추천합니다.`,
    derive: '근거가 적어 요약 목록에서 시사점을 뽑는 구도를 추천합니다.',
  }[rec];
  options.sort((a, b) => (a.key === rec ? -1 : b.key === rec ? 1 : 0));
  return { recommended: rec, reason, options };
}

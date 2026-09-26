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
// 발췌 앞뒤의 원문 번호 잡음(쪽 번호 "5 - ", 절 번호 "2-3." "1.3.1.", 맨 앞 전화번호 "(044-203-6508)", 끝의 "p. 58")을 뗀다. 원문의 부분 문자열이라 대조는 그대로 통과한다.
export const tidy = (s) => {
  let t = clean(s), prev;
  do {
    prev = t;
    t = t.replace(/^\(0\d{1,2}-\d{3,4}-\d{4}\)\s*/, '').replace(/^\d{1,3}\s+-\s+/, '').replace(/^(\d{1,2}[.-])+\d{0,2}\.?\s+/, '').replace(/^[-–]\s*/, '');
  } while (t !== prev);
  return t.replace(/\s*[-–]?\s*p\.\s*\d{1,3}\s*[-–]?$/i, '').replace(/\s+[-–]\s*\d{1,3}\s*[-–]$/, '').trim();
};

export function buildDraft({ notice, lineage, cards, headlines = {}, conclusion = '', copy = null }) {
  const blocked = [];
  const ok = [];
  for (const c of cards || []) {
    if (!verifyQuote(c.docId, c.page, c.quote)) { blocked.push({ id: c.id, reason: '원문 대조 실패' }); continue; }
    const role = ROLE_KEYS.includes(c.role) ? c.role : defaultRole(c, lineage || {});
    // 문서 문장은 줄마다 불릿 하나(AI 초안은 발췌 길이에 따라 1~3줄)
    const lines = String(c.text != null ? c.text : (c.logic || '')).split(/\n+/).map(clean).filter(Boolean);   // logic: STEP 2 이전 필드명
    ok.push({ ...c, role, text: lines.join('\n'), lines });
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
      // 한 카드가 여러 줄이면 불릿을 나누고 출처는 그 카드의 마지막 불릿에만 붙인다
      bullets: ok.filter((c) => c.role === r.key).flatMap((c) => (c.lines.length
        ? c.lines.map((t, j) => ({ cardId: c.id, quoted: false, text: t, cite: j === c.lines.length - 1 ? cite(c) : '' }))
        : [{ cardId: c.id, quoted: true, text: tidy(c.quote), cite: cite(c) }])),
    })),
  });

  // 2. 추진 배경 종합 — 수렴 표 (역할이 둘 이상일 때)
  const concl = clean(conclusion);
  if (used.length >= 2) {
    const rows = used.map((r) => {
      const list = ok.filter((c) => c.role === r.key);
      const content = head(r.key) || list.filter((c) => c.text).map((c) => c.lines[0]).join(' / ');
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
    deck: recommendDeck(ok, numeric, used, chain, head, concl, notice, copy, (lineage && lineage.ministry) || ''),
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
//   link · plan · pillars · spotlight  — 아래 각 블록 주석 참고(부서 Template 폴더 장표)
const ROLE_ORDER = { policy: 0, agency: 1, tech: 2, demand: 3 };
// copy: 장표 칸 문구(/api/ai deck 이 검증한 것) { title: {카드id: 단계 제목}, summary: {카드id: 칸 요약} }.
// 담당자가 쓴 헤드라인·문장이 있으면 그쪽이 먼저고, 칸 요약은 발췌 자르기를 대신한다.
function recommendDeck(ok, numeric, used, chain, head, concl, notice, copy, lineageMinistry) {
  const T = (copy && copy.title) || {}, SUM = (copy && copy.summary) || {};
  const cut = (s, n) => { s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const line = (c, n) => (c.text ? { text: cut(c.lines[0], n), quoted: false, terms: [] } : SUM[c.id] ? { text: cut(SUM[c.id], n), quoted: false, terms: [], ai: true } : { text: cut(tidy(c.quote), n), quoted: true, terms: c.matched || [] });
  const quote = (c, n) => ({ text: cut(tidy(c.quote), n), quoted: true, terms: c.matched || [] });
  const src = (c) => `「${c.title}」(${c.year}) p.${c.page}`;
  const roleOf = (k) => ROLES.find((r) => r.key === k) || { label: '', side: '' };
  const ofRole = (k) => ok.filter((c) => c.role === k);
  const docs = [];
  for (const c of ok) { const k = `「${c.title}」(${fullOrg(c.org)}, ${c.year})`; if (!docs.includes(k)) docs.push(k); }
  const foot = docs.length ? '* 출처: ' + docs.slice(0, 3).join(' | ') + (docs.length > 3 ? ` 외 ${docs.length - 3}건` : '') : '';
  // 주무부처는 계보가 정한 값을 쓴다. 예전에는 사슬에서 "청"으로 끝나는 첫 기관을 잡아 시도교육청이 주무부처 자리에 들어갔다
  const ministry = lineageMinistry || (chain.find((c) => /부$|처$|위원회$/.test(c.name) && c.role !== '발주기관') || {}).name || '';
  // 로드맵 왼쪽 세로칸용 짧은 한글 이름. 5자 이하 그대로, 교육청은 "교육청", 5자 이하 한글 약칭(과기정통부)이 있으면 그것, 없으면 null.
  // 영문 약칭(KERIS)은 세로로 세우면 글자가 한 자씩 서서 어색해 쓰지 않는다
  const shortOrg = (name) => {
    name = fullOrg(name || '');
    if (!name) return null;
    if (name.length <= 5 && !/[A-Za-z]/.test(name)) return name;
    if (/교육(지원)?청$/.test(name)) return '교육청';
    const alias = Object.keys(rules.aliases).find((k) => k.length <= 5 && !/[A-Za-z]/.test(k) && (rules.aliases[k] || [])[0] === name && !/교육청$/.test(k));
    return alias || null;
  };
  // 헤드라인 아랫줄 기본값: 수렴점 → 역할 헤드라인 순으로 장표 한 줄(32자)에 들어가는 첫 문장. 없으면 비워 둔다(입력 또는 AI 문구 다듬기).
  const HL_MAX = 32;
  const hlDefault = [concl, ...used.map((r) => head(r.key))].find((x) => x && x.length <= HL_MAX) || '';
  const base = { section: '사업 이해도', project: (notice && notice.name) || '', headline: ['', hlDefault], foot };

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
  const stageTitle = (c) => { const h = head(c.role); if (h && !usedHead.has(c.role)) { usedHead.add(c.role); return { text: cut(h, 22), ph: false }; } if (T[c.id]) return { text: cut(T[c.id], 22), ph: false, ai: true }; return { text: cut(c.title, 22), ph: false }; };
  const demand = ofRole('demand');
  // 세로칸: 단계 문서를 낸 계보 기관(주무부처·발주처 상위)의 짧은 이름 최대 2개("교육부 / 교육청"). 길면 "정책"
  const rowLabel = () => {
    const lineageOrgs = [ministry, ...chain.map((c) => c.name)].filter(Boolean).map(fullOrg);
    const names = [];
    for (const c of stageCards) {
      const o = fullOrg(c.org);
      if (!lineageOrgs.includes(o)) continue;
      const s = shortOrg(o) || (chain[0] && o === fullOrg(chain[0].name) ? '발주기관' : null);   // 발주처 이름이 길거나 영문 약칭뿐이면 "발주기관"
      if (s && !names.includes(s)) names.push(s);
    }
    const two = names.slice(0, 2).join(' / ');
    if (two && two.length <= 9) return two;
    return names[0] || '정책';
  };

  const options = [];
  if (stageCards.length >= 2) {
    options.push({
      key: 'roadmap', name: '정책 로드맵형', when: '상위 정책이 연도순으로 이어져 본 사업의 필요성에 닿는 흐름을 보여줄 때',
      slide: {
        ...base, layout: 'roadmap',
        band: minDocs ? `${ministry} 정책 로드맵` : '정책 로드맵',
        rowLabel: rowLabel(),
        stages: stageCards.map((c) => ({ year: c.year, title: stageTitle(c), top: SUM[c.id] ? { text: cut(SUM[c.id], 46), quoted: false, terms: [], ai: true } : quote(c, 46), bottom: c.text ? { text: cut(c.lines[0], 46) } : null, source: src(c) })),
        // 현장 수요 근거가 없으면 필요성 카드는 수렴점 한 칸만 쓴다(빈칸 세 줄 대신)
        need: demand.length ? {
          title: head('demand') ? cut(head('demand'), 22) : '',
          top: line(demand[0], 46),
          bottom: concl ? { text: cut(concl, 46) } : null,
        } : { only: true, title: '사업 추진의 필요성', top: concl ? { text: cut(concl, 90), quoted: false, terms: [] } : null },
        proposer: { label: '제안사', listTitle: '관련 사업 수행 역량', rows: 4, boxTitle: concl && demand.length ? cut(concl, 40) : '' },   // 수렴점이 필요성 카드에 들어가면 중복하지 않는다
      },
    });
  }
  // roadmapDocs: 인천 AI 교육 지원센터 제안 배경 4쪽 — 위 로드맵은 같고, 아래 제안사 행의 "수행 실적" 빈칸 대신
  // 근거로 삼은 정책 문서를 표지 모양으로 채운다(문서명·기관·연도는 색인 메타데이터). 오른쪽 대응 박스는 제안사 몫이라 빈칸
  const rm = options.find((o) => o.key === 'roadmap');
  if (rm) {
    const dseen = new Set();
    const docs = [...stageCards, ...ok].filter((c) => (dseen.has(c.docId) ? false : dseen.add(c.docId))).slice(0, 4)
      .map((c) => ({ title: cut(c.title, 28), org: fullOrg(c.org), year: c.year }));
    options.push({
      key: 'roadmapDocs', name: '로드맵·근거문서형', when: '로드맵 아래에 근거로 삼은 정책 문서를 표지째 늘어놓아 출처를 앞세울 때',
      slide: { ...rm.slide, docs, proposer: { ...rm.slide.proposer, listTitle: '정책 근거' } },
    });
  }
  // survey: 교실혁명 제안 목적 및 배경(KEDI 교원 통계 막대) · 기업 연계 정보교원(사전 설문) — 막대그래프 틀만 둔다.
  // 막대 값은 한 조사의 같은 문항이어야 하므로 서로 다른 카드의 수치로 채우지 않는다. 수치 카드가 있으면 아래에 참고로 붙인다
  if (demand.length || numeric.length) {
    const refCard = numeric[0] || null;
    options.push({
      key: 'survey', name: '설문 막대형', when: '제안사 사전 설문이나 한 조사의 문항별 결과를 막대로 보여 현장 수요를 드러낼 때',
      slide: {
        ...base, layout: 'survey',
        bars: 5,
        ref: refCard ? { ...quote(refCard, 90), source: src(refCard) } : null,
        checks: used.slice(0, 3).map((r) => ({ label: r.label, headline: head(r.key), sub: ofRole(r.key)[0] ? line(ofRole(r.key)[0], 70) : null })),
        bottom: concl,
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
  if (ok.length >= 3 && used.length >= 2) {   // 역할이 하나면 한 칸짜리 장표가 되므로 내지 않는다
    const cols = used.slice(0, 3);
    options.push({
      key: 'voices', name: '현장 근거형', when: '발췌 원문을 측면별로 나란히 보여 근거의 양을 강조할 때',
      slide: {
        ...base, layout: 'voices',
        columns: cols.map((r) => ({ label: r.label, headline: head(r.key), cards: ofRole(r.key).slice(0, 3).map((c) => ({ ...quote(c, 120), source: src(c) })) })),
      },
    });
  }
  // 아래 네 구도는 부서 제안서 Template 폴더(2026-09) 장표에서 옮겼다
  // link: 울산 수업혁신 "제안 배경 및 사업 이해" 2쪽 — 근거 카드 3열, 칸마다 아래 "본 사업 연결"(제안사 몫이라 빈칸)
  const docSeen = new Set();
  const linkCards = [...ok].sort((a, b) => (a.role === 'demand') - (b.role === 'demand') || ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .filter((c) => (docSeen.has(c.docId) ? false : docSeen.add(c.docId))).slice(0, 3);
  if (linkCards.length >= 2) {
    const usedHeadL = new Set();
    options.push({
      key: 'link', name: '정책-연결형', when: '근거마다 본 사업이 어떻게 이어지는지 칸을 나눠 보여줄 때',
      slide: {
        ...base, layout: 'link',
        cards: linkCards.map((c) => {
          const h = head(c.role);
          const title = h && !usedHeadL.has(c.role) ? (usedHeadL.add(c.role), cut(h, 24)) : T[c.id] ? cut(T[c.id], 24) : cut(c.title, 24);
          return { label: roleOf(c.role).label, title, body: line(c, 130), source: src(c) };
        }),
        bottom: concl,
        keywords: 4,
      },
    });
  }
  // plan: 경남 미래교육원 "제안배경" — 발주기관 계획(계획명·비전 → 세부과제 → 주요 내용). 울산 1쪽처럼 오른쪽에 상위 정책을 붙인다
  const agency = ofRole('agency');
  if (agency.length >= 2) {
    const a0 = agency[0];
    const upper = ok.filter((c) => c.role !== 'agency').slice(0, 3);
    options.push({
      key: 'plan', name: '발주기관 계획형', when: '발주기관 자체 계획이 근거의 중심일 때',
      slide: {
        ...base, layout: 'plan',
        planTitle: `「${cut(a0.title, 30)}」`, planYear: a0.year, planOrg: fullOrg(a0.org),
        vision: head('agency'),
        tasks: agency.slice(0, 3).map((c) => ({ text: T[c.id] ? cut(T[c.id], 30) : c.text ? cut(c.lines[0], 34) : cut(tidy(c.quote), 34), ai: !c.text && !!T[c.id] })),
        points: agency.map((c) => ({ ...(SUM[c.id] || c.text ? line(c, 110) : quote(c, 110)), source: src(c) })).filter((x, i, arr) => arr.findIndex((y) => y.text === x.text) === i).slice(0, 4),   // 같은 문장이 두 문서에 있으면 한 번만
        upperTitle: upper.length ? (ministry && upper.some((c) => c.org === ministry || fullOrg(c.org) === ministry) ? `${ministry} 정책과의 연결` : '상위 정책과의 연결') : '',
        upper: upper.map((c) => ({ label: roleOf(c.role).label, ...line(c, 100), source: src(c) })),
        bottom: concl,
      },
    });
  }
  // pillars: KOSAC AI동행 "사업의 이해" — 측면별 원 + 아래 문서별 소제목·불릿
  if (used.length >= 2) {
    options.push({
      key: 'pillars', name: '측면 원형형', when: '추진 배경을 두세 개 측면으로 나눠 한눈에 보여줄 때',
      slide: {
        ...base, layout: 'pillars',
        columns: used.slice(0, 4).map((r) => {
          const docsOf = [];
          for (const c of ofRole(r.key)) { let d = docsOf.find((x) => x.docId === c.docId); if (!d) { if (docsOf.length >= 2) continue; d = { docId: c.docId, label: `「${cut(c.title, 20)}」(${c.year})`, bullets: [] }; docsOf.push(d); } if (d.bullets.length < 2) d.bullets.push(line(c, 100)); }
          return { label: r.label, headline: head(r.key), docs: docsOf.map(({ label, bullets }) => ({ label, bullets })) };
        }),
      },
    });
  }
  // spotlight: 교실혁명 선도교사 연수 Prologue — 어두운 바탕에 정책 원문 한두 줄을 크게. 원문 그대로라 따옴표로만 싣는다
  const spot = ok.filter((c) => c.role !== 'demand')
    .map((c) => ({ c, q: tidy(c.quote) }))
    .filter((x) => x.q.length >= 20)
    .sort((a, b) => ROLE_ORDER[a.c.role] - ROLE_ORDER[b.c.role] || a.q.length - b.q.length)
    .filter((x, i, arr) => arr.findIndex((y) => y.c.docId === x.c.docId) === i)
    .slice(0, 2);
  if (spot.length) {
    options.push({
      key: 'spotlight', name: '정책 인용형', when: '상위 정책 원문 한두 줄을 크게 인용해 배경을 여는 장표가 필요할 때',
      slide: {
        ...base, layout: 'spotlight', theme: 'dark',
        quotes: spot.map(({ c }) => ({ ...quote(c, 90), sub: c.text ? cut(c.lines[0], 60) : '', source: `「${c.title}」 ${fullOrg(c.org)}, ${c.year}, p.${c.page}` })),
        bottom: concl && concl.length <= 40 ? concl : '',
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
      const ctx = (c.text && c.lines[0]) || q.slice(Math.max(0, at - 28), at + m[0].length + 18).replace(/^\S*\s/, '');
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

  const rec = agency.length >= 2 && agency.length * 2 >= ok.length ? 'plan'
    : stageCards.length >= 3 && years.size >= 2 ? 'roadmap'
      : numeric.length >= 3 && options.some((o) => o.key === 'numeric') ? 'numeric'
      : used.length >= 3 ? 'converge'
        : stageCards.length >= 2 ? 'roadmap' : 'derive';
  const reason = {
    roadmap: `정책 문서 ${stageCards.length}건이 ${[...new Set(stageCards.map((c) => c.year))].join('·')}년에 걸쳐 있어 연도순 로드맵 구도를 추천합니다.`,
    numeric: `수치가 들어간 근거가 ${numeric.length}건이라 숫자를 앞세우는 구도를 추천합니다.`,
    converge: `근거가 ${used.map((r) => r.label).join(' · ')}에 걸쳐 있어 한 결론으로 모으는 구도를 추천합니다.`,
    plan: `선택한 근거 ${ok.length}건 중 ${agency.length}건이 발주기관 계획이라 계획 구조를 앞세우는 구도를 추천합니다.`,
    derive: '근거가 적어 요약 목록에서 시사점을 뽑는 구도를 추천합니다.',
  }[rec];
  options.sort((a, b) => (a.key === rec ? -1 : b.key === rec ? 1 : 0));
  const aiUsed = !!copy && ok.some((c) => T[c.id] || SUM[c.id]);
  return { recommended: rec, reason, options, aiUsed };
}

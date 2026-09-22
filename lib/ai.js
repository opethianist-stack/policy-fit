import rules from '../data/org-rules.json';
import { verifyQuote, getPage, pageFreq, squash, orgMatches } from './search';
import { ROLES, ROLE_KEYS, missingNumbers } from './roles';
import { callTool } from './llm';

// LLM 적용 4곳. 공통 원칙: LLM은 정해진 칸에 들어갈 짧은 글만 내고, 코드가 칸마다 검증해 통과한 것만 돌려준다.
//   terms  검색어 추천   — 색인에 실제로 있는 말만 통과
//   roles  역할 분류     — 네 역할 중 하나만 통과
//   draft  문서 초안     — 문서 문장·헤드라인·수렴점. 원문 쪽에 없는 숫자·기관명이 있으면 버림
//   deck   장표 칸 문구  — 두 줄 헤드라인, 카드별 단계 제목·칸 요약. 같은 검증 + 글자 수 한도
// 버린 칸은 dropped 로 알려 주고, 화면은 그 칸을 원래 값(발췌 자르기 등)으로 둔다.

const SYSTEM = [
  '너는 한국 공공기관 입찰 제안서의 "사업 이해도·추진 배경" 작성을 돕는다.',
  '규칙:',
  '1. 주어진 원문 발췌에 있는 사실만 쓴다. 원문에 없는 숫자·연도·기관명·정책명·사업명을 만들지 않는다.',
  '2. 문체는 제안서 개조식이다. "~함", "~임", "~필요", "~추진" 같은 명사형 종결을 쓰고 "~합니다"는 쓰지 않는다.',
  '3. "혁신적인", "획기적인" 같은 과장 수식어를 쓰지 않는다.',
  '4. 반드시 주어진 도구 형식으로만 답한다.',
].join('\n');

const fullOrg = (org) => ((rules.aliases[org] || [])[0]) || org;
const roleLabel = (k) => (ROLES.find((r) => r.key === k) || {}).label || k;
const trim = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 요청으로 온 카드를 색인과 대조하고 원문 쪽 본문을 붙인다. 대조 실패 카드는 LLM에 보내지 않는다.
export function loadCards(cards, max = 12) {
  const out = [];
  for (const c of (cards || []).slice(0, max)) {
    if (!c || !verifyQuote(c.docId, c.page, c.quote)) continue;
    const p = getPage(c.docId, c.page);
    out.push({
      alias: `C${out.length + 1}`,   // LLM에는 짧은 번호로 보여 준다(긴 id를 베끼다 틀리는 일을 막음)
      id: String(c.id), docId: c.docId, page: c.page, org: c.org, orgFull: fullOrg(c.org), title: c.title, year: c.year,
      quote: trim(c.quote).slice(0, 700), role: ROLE_KEYS.includes(c.role) ? c.role : '', text: trim(c.text || c.logic || ''),
      pageText: p ? p.text : c.quote,
    });
  }
  return out;
}

// 기관·조직 이름처럼 생긴 말(…부·청·원·재단·위원회·교육청 등)을 뽑는다.
const ORG_RE = /[가-힣A-Za-z·]{2,}(?:부|청|처|원|재단|공단|위원회|교육청|지원청|진흥원|연구원|평가원|학술정보원)(?=[\s,.)」』·]|$|의|은|는|이|가|과|와|에|을|를|로)/g;
function unknownOrgs(text, sourceText, allowed) {
  const hay = squash(sourceText);
  const names = [...new Set((String(text).match(ORG_RE) || []))];
  return names.filter((n) => !hay.includes(squash(n)) && !allowed.some((a) => squash(a).includes(squash(n)) || squash(n).includes(squash(a))));
}

// 한 칸 검증: 글자 수, 숫자, 기관명. 통과하면 null, 아니면 사유.
export function checkText(text, sourceText, { max, allowed = [] }) {
  const t = trim(text);
  if (!t) return '빈 문구';
  if (max && t.length > max) return `${max}자 초과`;
  const nums = missingNumbers(t, sourceText);
  if (nums.length) return `원문에 없는 숫자(${nums.join(', ')})`;
  const orgs = unknownOrgs(t, sourceText, allowed);
  if (orgs.length) return `원문에 없는 기관명(${orgs.join(', ')})`;
  return null;
}

// LLM이 돌려준 카드 번호를 카드로 되돌린다. "C3", "3", "[C3]", "C3-1", 원래 id, "원래id-1" 모두 받는다.
function resolver(list) {
  const byAlias = new Map(list.map((c) => [c.alias.toLowerCase(), c]));
  const byId = new Map(list.map((c) => [c.id, c]));
  return (raw) => {
    const v = String(raw == null ? '' : raw).replace(/[\[\]\s]/g, '');
    if (byId.has(v)) return byId.get(v);
    const m = v.match(/^c?(\d+)/i);
    if (m && byAlias.has('c' + m[1])) return byAlias.get('c' + m[1]);
    const base = v.replace(/-\d+$/, '');
    return byId.get(base) || null;
  };
}

const cardBlock = (c, withRole = true) =>
  `[${c.alias}] ${c.orgFull} 「${c.title}」(${c.year}) p.${c.page}${withRole && c.role ? ` · 역할: ${roleLabel(c.role)}` : ''}\n발췌: ${c.quote}${c.text ? `\n담당자 문장: ${c.text}` : ''}`;

// ---------- 1. 검색어 추천 ----------
export async function suggestTerms({ title, rfpText, terms = [], orgs = [] }) {
  const tool = {
    name: 'suggest_terms',
    description: '정책문서 색인 검색에 쓸 검색어 후보',
    input_schema: {
      type: 'object',
      properties: { terms: { type: 'array', maxItems: 12, items: { type: 'object', properties: { term: { type: 'string' }, why: { type: 'string' } }, required: ['term'] } } },
      required: ['terms'],
    },
  };
  const user = [
    `사업명: ${trim(title)}`,
    terms.length ? `이미 쓰는 검색어: ${terms.join(', ')}` : '',
    rfpText ? `제안요청서 본문 일부:\n${String(rfpText).slice(0, 8000)}` : '',
    '',
    '이 사업의 추진 배경이 될 정책 문서(부처 업무계획, 종합계획, 기본계획, 보도자료)를 찾기 위한 검색어를 최대 10개 제안해.',
    '조건: 2~8글자 명사나 명사구. 정책·사업의 핵심 개념(예: 디지털 전환, 교원 연수, 고교학점제). 기관명·지역명·입찰 서식어(제안서, 평가, 계약)·너무 흔한 말(교육, 사업, 운영)은 제외. 이미 쓰는 검색어와 겹치지 않게.',
  ].filter(Boolean).join('\n');
  const { input } = await callTool({ system: SYSTEM, user, tool, maxTokens: 800 });
  const cands = [...new Set((input.terms || []).map((x) => trim(x && x.term)).filter((t) => t.length >= 2 && t.length <= 12))];
  const { df, total } = pageFreq(cands);
  const have = terms.map((t) => t.toLowerCase());
  const orgLow = orgs.map((o) => squash(o).toLowerCase());
  const ok = [], dropped = [];
  for (const t of cands) {
    const low = t.toLowerCase();
    let why = null;
    if (have.includes(low)) why = '이미 있는 검색어';
    else if (!df[t]) why = '색인에 없는 말';
    else if (df[t] / total >= 0.5) why = '너무 흔한 말';
    else if (orgLow.some((o) => o.includes(squash(low)))) why = '기관 이름';
    if (why) dropped.push({ term: t, reason: why }); else ok.push({ term: t, pages: df[t] });
  }
  return { terms: ok.slice(0, 8), dropped };
}

// ---------- 2. 역할 분류 ----------
export async function classifyRoles({ cards, lineage, notice }) {
  const list = loadCards(cards);
  if (!list.length) return { roles: [], dropped: [] };
  const chain = ((lineage && lineage.chain) || []).map((c) => `${c.name}(${c.role})`).join(' → ');
  const ministry = lineage && lineage.ministry;
  const agencyNames = ((lineage && lineage.chain) || []).map((c) => c.name).filter((n) => n !== ministry);
  const tool = {
    name: 'classify_roles',
    description: '근거 카드별 역할',
    input_schema: {
      type: 'object',
      properties: { roles: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', enum: list.map((c) => c.alias) }, role: { type: 'string', enum: ROLE_KEYS }, why: { type: 'string' } }, required: ['id', 'role'] } } },
      required: ['roles'],
    },
  };
  const user = [
    `사업명: ${trim(notice && notice.name)}`,
    chain ? `발주처 계보: ${chain}` : '',
    '',
    '각 근거가 제안서 추진 배경에서 어떤 칸을 받치는지 하나씩 골라.',
    'policy = 정책 기조(부처·범정부의 방향, 계획, 법·제도)',
    'tech = 기술·환경(AI·디지털 기술 변화, 교육 환경·인프라 변화)',
    'demand = 현장 수요(교원·학생·학교의 요구, 실태, 격차, 설문·통계)',
    `agency = 발주기관 계획. 발주 계보(${agencyNames.join(', ') || '없음'})에 속한 기관의 자체 사업·계획일 때만. 다른 지역 교육청·다른 기관 문서는 agency가 아니다`,
    'id는 카드 앞 대괄호 안 번호(C1, C2 …) 그대로 쓴다.',
    'why는 15자 이내.',
    '',
    list.map((c) => cardBlock(c, false)).join('\n\n'),
  ].filter((x) => x !== null).join('\n');
  const { input } = await callTool({ system: SYSTEM, user, tool, maxTokens: 1200 });
  const find = resolver(list);
  const out = [], dropped = [], seen = new Set();
  for (const r of input.roles || []) {
    const c = r && find(r.id);
    if (!c) { dropped.push({ id: r && r.id, reason: '없는 카드' }); continue; }
    if (seen.has(c.id)) continue;
    if (!ROLE_KEYS.includes(r.role)) { dropped.push({ id: c.id, reason: '없는 역할' }); continue; }
    // 발주기관 계획은 발주 계보에 있는 기관 문서만(다른 지역 교육청 문서가 발주기관 계획이 되지 않게)
    if (r.role === 'agency' && !(agencyNames.length && orgMatches(c.org, agencyNames))) { dropped.push({ id: c.id, reason: '발주 계보 밖 기관이라 발주기관 계획이 아님' }); continue; }
    seen.add(c.id);
    out.push({ id: c.id, role: r.role, why: trim(r.why).slice(0, 30) });
  }
  return { roles: out, dropped };
}

// 초안·장표 공통 입력
function draftContext({ cards, notice, lineage, headlines = {}, conclusion = '' }) {
  const list = loadCards(cards);
  const allowed = [
    ...((lineage && lineage.chain) || []).map((c) => c.name),
    ...list.flatMap((c) => [c.org, c.orgFull]),
    notice && notice.demandOrg, notice && notice.noticeOrg,
  ].filter(Boolean);
  const byRole = ROLE_KEYS.map((k) => ({ key: k, cards: list.filter((c) => c.role === k) })).filter((g) => g.cards.length);
  const intro = [
    `사업명: ${trim(notice && notice.name)}`,
    Object.keys(headlines).some((k) => trim(headlines[k])) ? `담당자 헤드라인: ${ROLE_KEYS.filter((k) => trim(headlines[k])).map((k) => `${roleLabel(k)}=${trim(headlines[k])}`).join(' / ')}` : '',
    trim(conclusion) ? `담당자 수렴점: ${trim(conclusion)}` : '',
  ].filter(Boolean).join('\n');
  return { list, allowed, byRole, intro };
}
const joinSrc = (cards) => cards.map((c) => c.pageText).join('\n');

// ---------- 3. 문서 초안 ----------
export async function draftText(body) {
  const { list, allowed, byRole, intro } = draftContext(body);
  if (!list.length) return { sentences: [], headlines: [], conclusion: null, dropped: [] };
  const tool = {
    name: 'draft_background',
    description: '추진 배경 절 초안',
    input_schema: {
      type: 'object',
      properties: {
        sentences: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', enum: list.map((c) => c.alias) }, text: { type: 'string' } }, required: ['id', 'text'] } },
        headlines: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', enum: ROLE_KEYS }, text: { type: 'string' } }, required: ['role', 'text'] } },
        conclusion: { type: 'string' },
      },
      required: ['sentences', 'headlines', 'conclusion'],
    },
  };
  const user = [
    intro, '',
    '아래 근거로 추진 배경 절 초안을 써.',
    '- sentences: 카드마다 개조식 문서 문장 정확히 1개(80자 이내). 그 카드 발췌에 있는 내용만. id는 카드 앞 대괄호 안 번호(C1, C2 …) 그대로.',
    '- headlines: 역할마다 헤드라인 1개(30자 이내). 그 역할 카드들의 공통 주장.',
    '- conclusion: 모든 근거가 모이는 "사업 추진의 필요성" 1~2문장(100자 이내).',
    '',
    byRole.map((g) => `## ${roleLabel(g.key)}\n` + g.cards.map((c) => cardBlock(c, false)).join('\n\n')).join('\n\n'),
  ].join('\n');
  const { input } = await callTool({ system: SYSTEM, user, tool, maxTokens: 2500 });
  const find = resolver(list);
  const dropped = [];
  const sentences = [];
  for (const s of input.sentences || []) {
    const c = s && find(s.id);
    if (!c) { dropped.push({ where: `문장 ${s && s.id}`, reason: '없는 카드' }); continue; }
    if (sentences.some((x) => x.id === c.id)) continue;   // 카드당 첫 문장만
    const why = checkText(s.text, c.pageText, { max: 120, allowed });
    if (why) dropped.push({ where: `문장 ${c.id}`, reason: why }); else sentences.push({ id: c.id, text: trim(s.text) });
  }
  const headlines = [];
  for (const h of input.headlines || []) {
    const g = h && byRole.find((x) => x.key === h.role);
    if (!g) { dropped.push({ where: `헤드라인 ${h && h.role}`, reason: '근거 없는 역할' }); continue; }
    const why = checkText(h.text, joinSrc(g.cards), { max: 40, allowed });
    if (why) dropped.push({ where: `헤드라인 ${roleLabel(h.role)}`, reason: why }); else headlines.push({ role: h.role, text: trim(h.text) });
  }
  let conclusion = null;
  if (input.conclusion) {
    const why = checkText(input.conclusion, joinSrc(list), { max: 140, allowed });
    if (why) dropped.push({ where: '수렴점', reason: why }); else conclusion = trim(input.conclusion);
  }
  return { sentences, headlines, conclusion, dropped };
}

// ---------- 4. 장표 칸 문구 ----------
export const DECK_LIMITS = { line: 32, title: 14, summary: 34 };
export async function deckCopy(body) {
  const { list, allowed, byRole, intro } = draftContext(body);
  if (!list.length) return { headline: null, cells: [], dropped: [] };
  const tool = {
    name: 'slide_copy',
    description: '사업 이해도 장표 칸 문구',
    input_schema: {
      type: 'object',
      properties: {
        line1: { type: 'string', description: '헤드라인 윗줄' },
        line2: { type: 'string', description: '헤드라인 아랫줄' },
        cells: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', enum: list.map((c) => c.alias) }, title: { type: 'string' }, summary: { type: 'string' } }, required: ['id', 'title', 'summary'] } },
      },
      required: ['line1', 'line2', 'cells'],
    },
  };
  const user = [
    intro, '',
    '제안서 "제안 배경" 장표에 들어갈 짧은 문구를 써.',
    `- line1·line2: 장표 가운데 두 줄 헤드라인. line1은 "~을 통한"처럼 수단·배경(${DECK_LIMITS.line}자 이내), line2는 핵심 메시지(${DECK_LIMITS.line}자 이내). 예) line1 "디지털 전환 기반 교원 역량 강화를 통한" / line2 "교수학습 혁신 및 맞춤형 교육 실현"`,
    `- cells: 카드마다 하나씩(id는 카드 앞 대괄호 안 번호 C1, C2 … 그대로) title(정책 단계 이름, ${DECK_LIMITS.title - 2}자 안팎, 예 "디지털 교육 체제 전환")과 summary(칸 요약, ${DECK_LIMITS.summary - 4}자 안팎, 예 "교육부 디지털 기반 교육 혁신 방안 발표").`,
    '',
    byRole.map((g) => `## ${roleLabel(g.key)}\n` + g.cards.map((c) => cardBlock(c, false)).join('\n\n')).join('\n\n'),
  ].join('\n');
  const { input } = await callTool({ system: SYSTEM, user, tool, maxTokens: 2000 });
  const find = resolver(list);
  const dropped = [];
  let headline = null;
  const hl = input.headline && typeof input.headline === 'object' ? input.headline : input;
  if (hl.line1 || hl.line2) {
    const src = joinSrc(list) + '\n' + trim(body.notice && body.notice.name);
    const w1 = checkText(hl.line1, src, { max: DECK_LIMITS.line, allowed });
    const w2 = checkText(hl.line2, src, { max: DECK_LIMITS.line, allowed });
    if (w1 || w2) dropped.push({ where: '헤드라인', reason: w1 || w2 });
    else headline = [trim(hl.line1), trim(hl.line2)];
  }
  const cells = [];
  for (const x of input.cells || []) {
    const c = x && find(x.id);
    if (!c) { dropped.push({ where: `칸 ${x && x.id}`, reason: '없는 카드' }); continue; }
    if (cells.some((y) => y.id === c.id)) continue;
    const cell = { id: c.id };
    const wt = checkText(x.title, c.pageText, { max: DECK_LIMITS.title, allowed });
    const ws = checkText(x.summary, c.pageText, { max: DECK_LIMITS.summary, allowed });
    if (wt) dropped.push({ where: `단계 제목 ${c.id}`, reason: wt }); else cell.title = trim(x.title);
    if (ws) dropped.push({ where: `칸 요약 ${c.id}`, reason: ws }); else cell.summary = trim(x.summary);
    if (cell.title || cell.summary) cells.push(cell);
  }
  return { headline, cells, dropped };
}

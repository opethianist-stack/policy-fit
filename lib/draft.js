import rules from '../data/org-rules.json';
import { verifyQuote, getPage } from './search';
import { ROLES, ROLE_KEYS, NUMERIC, defaultRole, missingNumbers } from './roles';

// 채택된 근거 카드 → "사업 이해도·추진 배경" 문서 모델(논증 블록 구조).
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
          ['수요기관', notice.demandOrg],
          ['공고기관', notice.noticeOrg || notice.demandOrg],
          [notice.budget ? '배정예산' : '추정가격', won(notice.budget || notice.estimatedPrice)],
          ['입찰마감', (notice.closeAt || '-').slice(0, 16)],
          ['입찰공고번호', `${notice.no}${notice.ord ? '-' + notice.ord : ''}`],
        ],
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
    deck: recommendDeck(ok, numeric, used, chain, head, concl),
  };
}

// 장표 구도 추천(규칙). 제작은 하지 않고, 어느 칸에 무엇을 놓을지만 정한다.
function recommendDeck(ok, numeric, used, chain, head, concl) {
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 2) + '…' : s);
  const item = (c) => ({ source: `${c.org} ${c.title} p.${c.page}`, quote: cut(c.text || clean(c.quote), 90) });
  const pickNumeric = numeric.length >= 2;

  const first = used.length >= 2
    ? {
      key: 'A', name: '안 1 · 수렴형', when: '정책·수요 등 서로 다른 측면의 근거가 한 결론으로 모일 때',
      slots: [
        ...used.slice(0, 3).map((r) => ({
          label: `상단 · ${r.side}`,
          items: [
            ...(head(r.key) ? [{ source: '헤드라인', quote: head(r.key) }] : []),
            ...ok.filter((c) => c.role === r.key).slice(0, 2).map(item),
          ],
        })),
        { label: '하단 · 수렴점', items: concl ? [{ source: '사업 추진의 필요성', quote: concl }] : [] },
      ],
    }
    : {
      key: 'A', name: '안 1 · 계보 흐름형', when: '상위 정책에서 발주기관 계획으로 내려오는 흐름을 보여줄 때',
      slots: [
        { label: '좌 · 정책 계보', items: chain.map((c) => ({ source: c.role, quote: c.name })) },
        { label: '우 · 핵심 근거', items: ok.slice(0, 3).map(item) },
      ],
    };
  const second = {
    key: 'B', name: '안 2 · 수치 강조형', when: '수치가 들어간 근거가 2건 이상일 때',
    slots: [
      { label: '상단 · 핵심 수치', items: numeric.slice(0, 3).map(item) },
      { label: '하단 · 근거 표', items: ok.filter((c) => !numeric.slice(0, 3).includes(c)).slice(0, 4).map(item) },
    ],
  };
  return {
    recommended: pickNumeric ? 'B' : 'A',
    reason: pickNumeric
      ? `수치가 들어간 근거가 ${numeric.length}건이라 숫자를 앞세우는 구도가 맞습니다.`
      : used.length >= 2
        ? `근거가 ${used.map((r) => r.label).join(' · ')}에 걸쳐 있어 한 결론으로 모으는 구도가 맞습니다.`
        : '근거가 한 측면에 몰려 있어 계보 흐름을 축으로 놓는 구도가 맞습니다.',
    options: [first, second],
  };
}

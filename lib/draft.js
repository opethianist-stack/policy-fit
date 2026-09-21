import rules from '../data/org-rules.json';
import { orgMatches, verifyQuote } from './search';

// 채택된 근거 카드 → "사업 이해도·추진 배경" 문서 모델.
// 문서에 들어가는 문장은 세 종류뿐이다.
//   ① 색인 원문과 대조를 통과한 발췌문   ② 담당자가 쓴 연결 논리   ③ API 값으로 채운 정형 문장
// 대조에 실패한 발췌문은 모델에 넣지 않고 blocked 로 돌려준다.

const TIERS = [
  { key: 'cross', label: '범부처 정책' },
  { key: 'ministry', label: '주관부처 정책' },
  { key: 'agency', label: '발주기관 계획' },
  { key: 'related', label: '관련 기관 계획' },
];

function tierOf(card, lineage) {
  if (rules.crossGovernment.includes(card.org)) return 'cross';
  const chain = (lineage.chain || []).map((c) => c.name);
  const ministry = lineage.ministry ? [lineage.ministry] : [];
  if (ministry.length && orgMatches(card.org, ministry)) return 'ministry';
  if (chain.length && orgMatches(card.org, chain.filter((n) => !ministry.includes(n)))) return 'agency';
  if (card.category === '부처') return 'ministry';
  return 'related';
}

// 수치 근거 판정: 두 자리 이상 숫자 + 단위, 또는 백분율. 절 번호(1.3.1.)는 걸리지 않게 한다.
const NUMERIC = /(\d{1,3}(,\d{3})+|\d{2,})\s?(%|명|억|조|만|개교|개소|개|건|시간|차시)|\d+(\.\d+)?\s?%/;
const won = (n) => (n ? Number(n).toLocaleString('ko-KR') + '원' : '-');
const src = (c) => `${c.org} 「${c.title}」(${c.year}) ${c.page}쪽${c.pageEstimated ? '(추정)' : ''}`;

export function buildDraft({ notice, lineage, cards }) {
  const blocked = [];
  const ok = [];
  for (const c of cards || []) {
    if (verifyQuote(c.docId, c.page, c.quote)) ok.push({ ...c, logic: (c.logic || '').trim(), tier: tierOf(c, lineage || {}) });
    else blocked.push({ id: c.id, reason: '원문 대조 실패' });
  }

  const chain = (lineage && lineage.chain) || [];
  const chainText = chain.map((c) => `${c.name}(${c.role})`).join(' → ');
  const sections = [];

  sections.push({
    heading: '1. 사업 개요',
    blocks: [{
      type: 'table',
      rows: [
        ['사업명', notice.name],
        ['수요기관', notice.demandOrg],
        ['공고기관', notice.noticeOrg || notice.demandOrg],
        [notice.budget ? '배정예산' : '추정가격', won(notice.budget || notice.estimatedPrice)],
        ['입찰마감', (notice.closeAt || '-').slice(0, 16)],
        ['입찰공고번호', `${notice.no}${notice.ord ? '-' + notice.ord : ''}`],
      ],
    }],
  });

  sections.push({
    heading: '2. 발주처와 정책 계보',
    blocks: [
      { type: 'flow', nodes: chain.map((c) => ({ name: c.name, role: c.role })) },
      { type: 'note', text: lineage && lineage.source === 'api' ? '출처: 재정경제부 공공기관 정보 조회 서비스' : '' },
    ].filter((b) => b.type !== 'note' || b.text),
  });

  const evidence = [];
  let n = 0;
  for (const t of TIERS) {
    const list = ok.filter((c) => c.tier === t.key);
    if (!list.length) continue;
    evidence.push({ type: 'subheading', text: t.label });
    for (const c of list) {
      n += 1;
      evidence.push({ type: 'evidence', no: n, source: src(c), quote: c.quote, logic: c.logic });
    }
  }
  sections.push({ heading: '3. 정책 근거', blocks: evidence });

  sections.push({
    heading: '4. 근거 요약',
    blocks: [{
      type: 'grid',
      header: ['구분', '출처', '연결 논리'],
      rows: ok.map((c) => [TIERS.find((t) => t.key === c.tier).label, src(c), c.logic || '']),
    }],
  });

  const tiersUsed = TIERS.filter((t) => ok.some((c) => c.tier === t.key)).map((t) => t.label);
  const numeric = ok.filter((c) => NUMERIC.test(c.quote));
  return {
    title: '사업 이해도 · 추진 배경',
    subtitle: notice.name,
    chainText,
    sections,
    stats: { adopted: ok.length, blocked: blocked.length, missingLogic: ok.filter((c) => !c.logic).length, tiers: tiersUsed, numeric: numeric.length },
    blocked,
    deck: recommendDeck(ok, numeric, tiersUsed, chain),
  };
}

// 장표 구도 추천(규칙). 제작은 하지 않고, 어느 칸에 어떤 근거를 놓을지만 정한다.
function recommendDeck(ok, numeric, tiersUsed, chain) {
  const short = (c) => ({ source: `${c.org} ${c.title} p.${c.page}`, quote: c.quote.length > 90 ? c.quote.slice(0, 88) + '…' : c.quote });
  const pickNumeric = numeric.length >= 2;
  const byTier = (k) => ok.filter((c) => c.tier === k);
  const top = [...byTier('cross').slice(0, 1), ...byTier('ministry').slice(0, 1), ...byTier('agency').slice(0, 1)];
  const fill = ok.filter((c) => !top.includes(c));
  while (top.length < 3 && fill.length) top.push(fill.shift());
  return {
    recommended: pickNumeric ? 'B' : 'A',
    reason: pickNumeric
      ? `수치가 들어간 근거가 ${numeric.length}건이라 숫자를 앞세우는 구도가 맞습니다.`
      : tiersUsed.length >= 2
        ? `근거가 ${tiersUsed.join(' · ')}에 걸쳐 있어 계보 흐름을 축으로 놓는 구도가 맞습니다.`
        : '수치 근거가 적어 인용문 중심 구도가 맞습니다.',
    options: [
      { key: 'A', name: '안 1 · 계보 흐름형', when: '상위 정책에서 발주기관 계획으로 내려오는 흐름을 보여줄 때',
        slots: [{ label: '좌 · 정책 계보', items: chain.map((c) => ({ source: c.role, quote: c.name })) }, { label: '우 · 핵심 인용', items: top.map(short) }] },
      { key: 'B', name: '안 2 · 수치 강조형', when: '수치가 들어간 근거가 2건 이상일 때',
        slots: [{ label: '상단 · 핵심 수치', items: numeric.slice(0, 3).map(short) }, { label: '하단 · 근거 표', items: ok.filter((c) => !numeric.slice(0, 3).includes(c)).slice(0, 4).map(short) }] },
    ],
  };
}

import rules from '../data/org-rules.json';
import { orgMatches } from './search';

// 정책 근거 카드의 "역할" — 제안서 추진 배경 절에서 이 근거가 받치는 칸.
// 순서가 곧 문서의 논증 순서다(상위 정책 → 기술·환경 → 현장 수요 → 발주기관 계획).
export const ROLES = [
  { key: 'policy', label: '정책 기조', side: '정책·제도 측' },
  { key: 'tech', label: '기술·환경', side: '기술·환경 측' },
  { key: 'demand', label: '현장 수요', side: '현장 수요 측' },
  { key: 'agency', label: '발주기관 계획', side: '발주기관 측' },
];
export const ROLE_KEYS = ROLES.map((r) => r.key);

// 수치 근거 판정: 두 자리 이상 숫자 + 단위, 또는 백분율. 절 번호(1.3.1.)는 걸리지 않게 한다.
export const NUMERIC = /(\d{1,3}(,\d{3})+|\d{2,})\s?(%|명|억|조|만|개교|개소|개|건|시간|차시)|\d+(\.\d+)?\s?%/;

// 문서 계보상 위치: 범부처 · 주관부처 · 발주기관 · 관련 기관
export function tierOf(card, lineage) {
  if (rules.crossGovernment.includes(card.org)) return 'cross';
  const chain = (lineage.chain || []).map((c) => c.name);
  const ministry = lineage.ministry ? [lineage.ministry] : [];
  if (ministry.length && orgMatches(card.org, ministry)) return 'ministry';
  if (chain.length && orgMatches(card.org, chain.filter((n) => !ministry.includes(n)))) return 'agency';
  if (card.category === '부처') return 'ministry';
  return 'related';
}

// 역할 기본값(규칙). 기술·환경은 규칙으로 고르지 않고 담당자가 바꾼다.
export function defaultRole(card, lineage) {
  if (tierOf(card, lineage || {}) === 'agency') return 'agency';
  if (NUMERIC.test(card.quote || '')) return 'demand';
  return 'policy';
}

// 문장 속 숫자를 뽑는다. "15,000명" → "15000", "67.2%" → "67.2". 한 자리 숫자는 목록 번호일 때가 많아 뺀다.
export function numbersIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, '');
    if (n.replace('.', '').length < 2) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

// 문장 속 숫자가 원문 쪽에 글자 그대로 있는지 대조한다. 없는 숫자 목록을 돌려준다.
// 담당자 문장에는 경고로, LLM 문장에는 차단 기준으로 쓴다.
export function missingNumbers(text, sourceText) {
  let hay = String(sourceText || '').replace(/,/g, '').replace(/\s+/g, '');
  // 정부 문서의 연도 줄임표기(’25, '26~)는 2025·2026으로도 쓸 수 있게 한다(실측: 모델이 "’25~"를 "2025년"으로 풀어 써서 불릿이 버려짐)
  hay += '|' + (hay.match(/[’'‘`](\d{2})(?!\d)/g) || []).map((m) => '20' + m.slice(-2)).join('|');
  return numbersIn(text).filter((n) => !hay.includes(n));
}

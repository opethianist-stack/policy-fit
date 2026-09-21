import rules from '../data/org-rules.json';
import { pageFreq, stripJosa } from './search';

// 제안요청서 본문 → 정책 근거 검색어. LLM 없음.
//  1) 본문을 어절로 자르고 조사·어미 꼬리를 뗀다
//  2) 입찰·계약·평가 서식 용어는 뺀다
//  3) "사업 목적·추진 배경·과업 내용" 부근에 나온 말은 가중치를 준다
//  4) 정책문서 색인에 실제로 나오는 말만 남긴다(색인에 없는 말은 검색에 쓸모가 없다).
//     색인 대부분에 나오는 흔한 말도 뺀다
//  5) 제안요청서 안 빈도 × 색인 희소성으로 점수를 매겨 상위 몇 개를 고른다

const RFP_STOP = new Set([
  // 입찰·계약·평가 서식
  '목적', '배경', '필요성', '개요', '특징', '시사점', '범위', '제안서', '제안요청서', '제안사', '제안업체', '입찰', '입찰자', '낙찰자', '계약', '계약자', '계약상대자', '용역', '과업', '과업지시서', '수행', '수행사', '사업자', '발주기관', '발주처', '평가', '평가위원', '평가항목', '배점', '점수', '기술평가', '가격평가', '협상', '제출', '제출물', '서류', '서식', '별지', '붙임', '첨부', '참고', '기타', '해당', '사항', '내용', '관련', '경우', '이상', '이하', '미만', '초과', '이내', '기간', '일정', '금액', '예산', '부가가치세', '포함', '원칙', '준수', '의무', '책임', '규정', '법률', '시행령', '시행규칙', '조항', '조치', '요청', '요구', '제공', '확인', '작성', '검토', '승인', '협의', '통보', '보고', '보고서', '착수', '중간', '완료', '최종', '산출물', '하자', '보증', '지체상금', '보안', '비밀', '서약서', '개인정보', '저작권', '소유권', '인력', '투입인력', '참여인력', '업체', '기관', '담당자', '공동수급', '하도급', '대표', '페이지', '목차', '구분', '항목', '방법', '방안', '계획', '추진', '운영', '관리', '지원', '사업', '분야', '대상', '기준', '수준', '결과', '위한', '따른', '통한', '대한', '있는', '없는', '있음', '없음', '가능', '필요', '반드시', '모든', '각종', '다음', '아래', '위의', '본', '당해', '해당연도', '년도', '연도',
]);

const FOCUS = /(사업\s*(의\s*)?(목적|배경|개요|필요성)|추진\s*배경|과업\s*(의\s*)?(내용|범위|개요)|주요\s*(과업|내용)|사업\s*내용)/;
const BOILER = /(입찰\s*참가\s*자격|제안서\s*(작성|평가|제출)|평가\s*(기준|방법|항목)|계약\s*(조건|일반|특수)|보안\s*(사항|준수|서약)|제출\s*서류|별지\s*(제|서식))/;

export function termsFromRfp(text, { exclude = [], limit = 8 } = {}) {
  const lines = String(text || '').split('\n');
  const tf = new Map();
  let focus = 0, boiler = 0;
  for (const line of lines) {
    if (FOCUS.test(line)) { focus = 40; boiler = 0; }
    else if (BOILER.test(line)) { boiler = 60; focus = 0; }
    const w = focus > 0 ? 2 : boiler > 0 ? 0.3 : 1;
    if (focus > 0) focus--; if (boiler > 0) boiler--;
    for (const raw of line.split(/[^가-힣A-Za-z0-9·]+/)) {
      let t = stripJosa(raw.replace(/^·+|·+$/g, ''));
      if (t.length < 2 || t.length > 12) continue;
      if (/^\d/.test(t)) continue;
      if (/^[A-Za-z]{1,2}$/.test(t)) continue;
      if (RFP_STOP.has(t) || rules.stopwords.includes(t)) continue;
      tf.set(t, (tf.get(t) || 0) + w);
    }
  }
  const skip = new Set(exclude.map((x) => x.toLowerCase()));
  const cand = [...tf.entries()].filter(([t, n]) => n >= 2 && !skip.has(t.toLowerCase()))
    .sort((a, b) => b[1] - a[1]).slice(0, 160).map(([t]) => t);
  const { df, total } = pageFreq(cand);
  const scored = cand
    .filter((t) => df[t] > 0 && df[t] / total < 0.25)
    .map((t) => ({ t, score: Math.log(1 + Math.min(tf.get(t), 30)) * Math.log(total / df[t]) }))
    .sort((a, b) => b.score - a.score);
  // 긴 말에 포함된 짧은 말은 하나만(예: "교원역량" 이 있으면 "역량" 은 뺀다)
  const out = [];
  for (const { t } of scored) {
    if (out.some((o) => o.includes(t) || t.includes(o))) continue;
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// 제안요청서 첫머리에서 사업명·발주기관을 찾는다(나라장터 밖 사업용 입력칸 채우기). 못 찾으면 빈 값.
export function guessMeta(text) {
  const head = String(text || '').split('\n').slice(0, 120);
  const pick = (re) => { for (const l of head) { const m = l.match(re); const v = m && m[1].replace(/^[\s:：)\]·\-–]+/, '').trim(); if (v && v.length >= 2) return v.slice(0, 80); } return ''; };
  return {
    name: pick(/(?:사\s*업\s*명|용\s*역\s*명|과\s*업\s*명)\s*[:：]?\s*(.+)/),
    org: pick(/(?:발\s*주\s*기\s*관|수\s*요\s*기\s*관|주\s*관\s*기\s*관)\s*[:：]?\s*(.+)/),
  };
}

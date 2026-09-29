import { getPage, pageFreq, squash } from './search';
import { words } from './rfp';

// 2차 관련도: 제안요청서 목적·배경 문장 ↔ 후보 쪽 원문 문장 대조(규칙, LLM 없음, STEP38).
// 짝 점수 = 두 문장에 함께 나오는 말(제안요청서 문장의 낱말이 정책 문장 안에 띄어쓰기 무시로 들어 있는지)의 흔하지 않은 정도 합.
// 함께 나오는 말이 2개 이상이고 점수가 PAIR_MIN 이상인 짝만 낸다. 짝 문장은 둘 다 원문 그대로(공백만 한 칸으로)
const flat = (s) => squash(String(s || '').toLowerCase());
function sentences(text, { min = 8, max = 300 } = {}) {
  const out = [];
  for (const line of String(text || '').split(/\n|\u2002/)) {   // 표 칸(\u2002)도 한 문장처럼
    for (let s of line.split(/(?<=[다함음임됨][.。])\s+|(?<=\.)\s+(?=[□■○◦▪●◾◯\-–·•❶-❿①-⑳])/)) {
      s = s.replace(/\u2002/g, ' ').replace(/\s+/g, ' ').trim();
      const n = s.replace(/\s/g, '').length;
      if (n >= min && n <= max) out.push(s);
    }
  }
  return out;
}

// 문장을 잇는 데만 쓰이는 말(낱말 거르기를 지나온 기능어). 흔한 말은 색인 빈도로 따로 거른다
const GLUE = new Set(['있도록', '통해', '위해', '위하여', '대해', '함께', '등을', '다양한', '기반', '마련', '강화', '제고', '확대', '추진', '지원', '운영', '활용', '관련', '필요', '중심', '기존', '향후', '최근', '현재', '또한', '이를', '이에', '따라', '통한', '위한', '대한', '가능']);
const MAX_DF = 0.3;    // 색인 쪽의 30% 넘게 나오는 말(교육·학생·역량 등)은 짝을 맺는 근거로 치지 않는다
export const PAIR_MIN = 5;   // 이보다 낮은 짝은 버린다(흔한 말 두 개로 맺어진 짝)
// PDF에서 한 문장이 줄바꿈으로 끊긴 것을 잇는다(다음 줄이 글머리·번호로 시작하지 않으면 앞 줄에 붙인다)
const BULLET = /^(?:[□■○◦▪●◾◯•\-–*※ㆍ·❶-❿①-⑳]|\d+\s*[.)]|[가-하]\s*[.)]|\(?[가-하0-9]\))/;
function joinWrapped(lines) {
  const out = [];
  for (const l of lines) {
    if (out.length && !BULLET.test(l) && !/[.。:：]$/.test(out[out.length - 1]) && out[out.length - 1].length < 300) out[out.length - 1] += ' ' + l;
    else out.push(l);
  }
  return out;
}
// 제안요청서 목적 구역 줄(또는 공고명 한 줄) → 대조할 문장과 낱말 가중치(색인 쪽 빈도의 로그 역수, 흔한 말·연결어는 0)
export function prepareRfp(purposeLines, title = '') {
  const src = (title ? [title] : []).concat(sentences(joinWrapped(purposeLines).join('\n'), { min: 12, max: 300 }));
  const sents = src.map((s, i) => ({ s, title: !!title && i === 0, toks: [...words(s)].filter((t) => !GLUE.has(t)) })).filter((x) => x.toks.length >= 2);
  const all = [...new Set(sents.flatMap((x) => x.toks))];
  const { df, total } = pageFreq(all);
  const w = {};
  for (const t of all) { const d = df[t] || 0; w[t] = d === 0 || d > total * MAX_DF ? 0 : Math.log(total / (1 + d)); }
  return { sents, w, chars: purposeLines.join('').length };
}

// 후보 한 건(문서·쪽)에서 가장 잘 맞는 문장 쌍
export function bestPair(rfp, docId, page) {
  const pg = getPage(docId, page);
  if (!pg) return null;
  let best = null;
  for (const ps of sentences(pg.text)) {
    const f = flat(ps);
    for (const r of rfp.sents) {
      const shared = r.toks.filter((t) => rfp.w[t] > 0 && f.includes(flat(t)));
      if (shared.length < 2) continue;
      const score = shared.reduce((n, t) => n + rfp.w[t], 0);
      if (score < PAIR_MIN) continue;
      if (!best || score > best.score) best = { score: +score.toFixed(1), shared, rfp: r.s, fromTitle: r.title, policy: ps };
    }
  }
  return best;
}

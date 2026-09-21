import index from '../data/corpus-index.json';
import rules from '../data/org-rules.json';
import links from '../data/corpus-links.json';   // { "문서번호": "원문 URL" } — 드라이브 공유 링크를 넣으면 '원문 열기'가 켜진다

// 색인(data/corpus-index.json)에서 쪽 단위로 찾는다. 외부 호출·LLM 없음.
// 발췌문은 색인 본문에서 잘라낸 원문이고, 반환 직전에 원문 포함 여부를 다시 대조한다.

const DOCS = new Map(index.docs.map((d) => [d.id, d]));
const PAGES = index.pages.map((p) => ({ ...p, lower: p.text.toLowerCase() }));
const STOP = new Set(rules.stopwords);
export const squash = (s) => s.replace(/\s+/g, '');

// 발췌문이 색인 원문에 그대로 있는지 다시 확인한다(산출 단계의 차단 장치).
export function verifyQuote(docId, page, quote) {
  const p = PAGES.find((x) => x.doc === docId && x.page === page);
  return !!p && !!quote && squash(p.text).includes(squash(quote));
}

// 한 쪽의 원문 전체(검토 화면의 원문 쪽 보기, 숫자 대조에 쓴다).
export function getPage(docId, page) {
  const d = DOCS.get(docId);
  const p = PAGES.find((x) => x.doc === docId && x.page === page);
  if (!d || !p) return null;
  const pages = PAGES.filter((x) => x.doc === docId).map((x) => x.page);
  return {
    docId, org: d.org, title: d.title, year: d.year, file: d.file, pageEstimated: !!d.pageEstimated, url: links[d.id] || '',
    page, text: p.text,
    prev: pages.filter((n) => n < page).pop() ?? null,
    next: pages.find((n) => n > page) ?? null,
  };
}

// 발췌문이 원문 쪽의 어디에 있는지 [시작, 끝) 글자 위치로 찾는다. 공백 차이는 무시한다.
export function locateQuote(text, quote) {
  const q = squash(quote || '');
  if (!q) return null;
  const idx = []; let flat = '';
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { idx.push(i); flat += text[i]; }
  const at = flat.indexOf(q);
  if (at < 0) return null;
  return [idx[at], idx[at + q.length - 1] + 1];
}

export function corpusInfo() {
  return { builtAt: index.builtAt, docs: index.docs.length, pages: index.pages.length, orgs: [...new Set(index.docs.map((d) => d.org))] };
}

// 공고명 → 검색어. 띄어쓰기 단위 + 사전에 있는 용어가 공고명 안에 들어 있으면 함께 쓴다.
export function extractTerms(title) {
  const cleaned = title.replace(/[\[\](){}<>「」『』【】"'“”‘’·,.:;/\\|~!?+=*&^%$#@_-]/g, ' ');
  const out = [];
  const add = (t) => { if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t); };
  for (const raw of cleaned.split(/\s+/)) {
    let t = raw.trim();
    if (t.length > 3) t = t.replace(/(위탁|임차|대행|연구|학술)?용역$/, '');   // "위탁용역" 같은 계약 용어 꼬리 제거
    if (t.length < 2) continue;
    if (/^\d+(년|년도|차|차년도|기|회|월|일|학년도)?$/.test(t)) continue;
    if (STOP.has(t)) continue;
    add(t);
  }
  const flat = squash(title).toLowerCase();
  for (const w of rules.lexicon) {
    if (flat.includes(w.toLowerCase())) add(w);
  }
  return out.slice(0, 14);
}

// 색인의 기관 표기(KERIS, 과기정통부 …)와 API의 정식 명칭을 맞춘다.
export function orgMatches(docOrg, names) {
  const variants = [docOrg, ...(rules.aliases[docOrg] || [])].map(squash);
  return names.some((n) => {
    const s = squash(n);
    return variants.some((v) => v === s || s.includes(v) || v.includes(s));
  });
}

function countOf(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

const BULLET = /^\s*([□■○●ㅇ◦▪▸▶◆◇※\-–•*]|\d+[.)]|[①-⑳]|[가-하][.)])/;

function looksLikeToc(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 6) return false;
  const numbered = lines.filter((l) => /(\.{3,}|·{3,}|…)\s*\d+\s*$/.test(l) || /\s\d{1,3}\s*$/.test(l)).length;
  return numbered / lines.length > 0.5;
}

function pickQuote(text, terms) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let best = -1, bestScore = 0;
  lines.forEach((l, i) => {
    const low = l.toLowerCase();
    let s = 0;
    for (const t of terms) if (low.includes(t)) s += 1;
    if (l.length < 20) s *= 0.5;               // 제목·표 머리글보다 서술 문장을 고른다
    if (s > bestScore) { bestScore = s; best = i; }
  });
  if (best < 0) return '';
  // 문장이 줄바꿈으로 끊겨 있으면 앞줄(같은 항목의 시작)까지 거슬러 올라간다
  let start = best;
  while (start > 0 && best - start < 2 && !BULLET.test(lines[start])) start--;
  let end = best;
  let len = lines.slice(start, end + 1).join(' ').length;
  // 같은 항목의 이어지는 줄은 붙이고, 너무 짧으면 다음 항목 한두 줄까지 붙인다
  while (end + 1 < lines.length && len < 240) {
    const next = lines[end + 1];
    const sameItem = !BULLET.test(next);
    if (!sameItem && len >= 70) break;
    if (len + next.length > 260) break;
    end++; len += next.length + 1;
  }
  let q = lines.slice(start, end + 1).join(' ');
  if (q.length > 260) q = lines[best].slice(0, 260);
  return q.replace(/^\s*([□■○●ㅇ◦▪▸▶◆◇※§⦁•*\-–]\s*)+/, '');   // 맨 앞 글머리 기호는 뗀다
}

export function searchEvidence({ terms, orgs = [], scope = 'lineage', limit = 10 }) {
  const ts = terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 2);
  if (!ts.length) return { results: [], scopeDocs: 0 };

  const inScope = (d) => scope === 'all' || rules.crossGovernment.includes(d.org) || orgMatches(d.org, orgs);
  const pool = PAGES.filter((p) => inScope(DOCS.get(p.doc)));
  const scopeDocs = new Set(pool.map((p) => p.doc)).size;
  if (!pool.length) return { results: [], scopeDocs: 0 };

  const df = {};
  for (const t of ts) df[t] = pool.reduce((n, p) => n + (p.lower.includes(t) ? 1 : 0), 0);

  const scored = [];
  for (const p of pool) {
    let score = 0; const matched = [];
    for (const t of ts) {
      const tf = countOf(p.lower, t);
      if (!tf) continue;
      matched.push(t);
      score += Math.log(1 + pool.length / df[t]) * (1 + Math.log(Math.min(tf, 5)));
    }
    if (!matched.length) continue;
    score *= Math.pow(matched.length, 0.8);      // 여러 검색어가 함께 나오는 쪽을 우대
    const d = DOCS.get(p.doc);
    if (orgs.length && orgMatches(d.org, orgs.slice(0, 1))) score *= 1.3;  // 발주처 자체 문서
    if (looksLikeToc(p.text)) score *= 0.2;
    scored.push({ p, d, score, matched });
  }
  scored.sort((a, b) => b.score - a.score);

  const perDoc = {}; const results = [];
  for (const s of scored) {
    perDoc[s.p.doc] = (perDoc[s.p.doc] || 0) + 1;
    if (perDoc[s.p.doc] > 3) continue;           // 한 문서가 결과를 독점하지 않게
    const quote = pickQuote(s.p.text, s.matched);
    if (!quote) continue;
    const verified = squash(s.p.text).includes(squash(quote));
    if (!verified) continue;                      // 원문에 없는 문장은 내보내지 않는다
    results.push({
      id: `${s.p.doc}-p${s.p.page}`,
      docId: s.d.id, org: s.d.org, category: s.d.category, title: s.d.title, year: s.d.year, file: s.d.file,
      page: s.p.page, pageEstimated: !!s.d.pageEstimated, url: links[s.d.id] || '',
      quote, matched: s.matched, score: Math.round(s.score * 10) / 10,
    });
    if (results.length >= limit) break;
  }
  return { results, scopeDocs };
}

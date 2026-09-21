import { portalKey, portalGet, portalError, failReason } from './portal';

// 과학기술정보통신부 게시판 오픈API 4종(공공데이터포털 통합 인증키 하나로 호출).
// 응답 구조가 같다: subject, pressDt, deptName, managerName, managerTel, viewUrl(상세페이지), files[{fileName, fileUrl}].
// 키워드 검색 파라미터가 없고 한 페이지 최대 10건이라, 최근 몇 쪽을 받아 제목으로 거른다.
// (전체 이력은 수집 파이프라인에서 받아 색인에 넣는 게 맞다. 여기는 "최근 게시물" 확인용)

const BASE = 'https://apis.data.go.kr/1721000';
export const SOURCES = [
  { key: 'policy01', label: '주요정책', path: '/msitmainpolicyinfo/mainPolicyList', params: { policyType: 'POLICY01' }, pages: 3 },   // 연구개발정책
  { key: 'policy03', label: '주요정책', path: '/msitmainpolicyinfo/mainPolicyList', params: { policyType: 'POLICY03' }, pages: 3 },   // 정보통신정책
  { key: 'policy10', label: '주요정책', path: '/msitmainpolicyinfo/mainPolicyList', params: { policyType: 'POLICY10' }, pages: 3 },   // 기타
  { key: 'notice', label: '사업공고', path: '/msitannouncementinfo/businessAnnouncMentList', params: {}, pages: 10 },
  { key: 'press', label: '보도자료', path: '/msitpressreleaseinfo/pressReleaseList', params: {}, pages: 10 },
  { key: 'explain', label: '보도설명', path: '/msitpressexplaininfo/pressExplainList', params: {}, pages: 3 },
];
const READABLE = /\.(hwpx|hwp|pdf|odt|docx)$/i;

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// 포털 응답 → 게시물 목록. response 가 [ {header}, {body} ] 배열로 온다.
export function parseItems(json, src) {
  const arr = asArray(json && json.response);
  const header = (arr.find((x) => x && x.header) || {}).header || {};
  const body = (arr.find((x) => x && x.body) || {}).body;
  if (!body) return { ok: false, error: header.resultMsg || '응답 형식이 다릅니다.' };
  const items = asArray(body.items).map((x) => x.item || x).filter(Boolean).map((it) => ({
    source: src.key, sourceLabel: src.label,
    title: String(it.subject || '').replace(/\s+/g, ' ').trim(),
    date: it.pressDt || '',
    dept: String(it.deptName || '').trim(),
    viewUrl: it.viewUrl || '',
    files: asArray(it.files).map((f) => f.file || f).filter((f) => f && f.fileUrl).map((f) => ({
      name: f.fileName || '', url: f.fileUrl, readable: READABLE.test(f.fileName || ''),
    })),
  }));
  return { ok: true, total: Number(body.totalCount) || 0, items };
}

async function fetchPage(src, pageNo, key) {
  const r = await portalGet(BASE + src.path, { ServiceKey: key, pageNo, numOfRows: 10, returnType: 'json', ...src.params }, 10000);
  if (!r.json) return { ok: false, error: portalError(r.text) || `HTTP ${r.status}` };
  return parseItems(r.json, src);
}

// 동시 호출 수를 제한해 순서대로 돌린다
async function pool(tasks, n) {
  const out = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

let CACHE = { at: 0, data: null };
const TTL = 30 * 60 * 1000;

// 최근 게시물 묶음(30분 캐시). 같은 게시물이 여러 분류에 걸리면 상세 URL 로 한 번만 남긴다.
export async function recentMsit() {
  if (CACHE.data && Date.now() - CACHE.at < TTL) return CACHE.data;
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  const tasks = SOURCES.flatMap((s) => Array.from({ length: s.pages }, (_, p) => () => fetchPage(s, p + 1, key).catch((e) => ({ ok: false, error: failReason(e) }))));
  const pages = await pool(tasks, 8);
  const seen = new Set(); const items = []; const errors = [];
  for (const p of pages) {
    if (!p.ok) { errors.push(p.error); continue; }
    for (const it of p.items) { const k = it.viewUrl || it.title; if (seen.has(k)) continue; seen.add(k); items.push(it); }
  }
  if (!items.length) return { ok: false, error: errors[0] || '게시물을 받지 못했습니다.' };
  const data = { ok: true, items, fetchedAt: new Date().toISOString(), partial: errors.length > 0 };
  CACHE = { at: Date.now(), data };
  return data;
}

// 검색어로 제목을 거른다. 맞는 검색어가 많을수록, 계획·전략류 문서일수록, 최근일수록 위로.
const PLANISH = /(계획|시행계획|기본계획|종합계획|전략|로드맵|방안|정책|추진|공고)/;
export function matchMsit(items, terms, limit = 8) {
  const ts = [...new Set(terms.map((t) => String(t).toLowerCase()).filter((t) => t.length >= 2))];
  if (!ts.length) return [];
  return items
    .map((it) => {
      const low = it.title.toLowerCase();
      const hit = ts.filter((t) => low.includes(t));
      return { it, hit, score: hit.length * 10 + (PLANISH.test(it.title) ? 3 : 0) + (it.files.some((f) => f.readable) ? 1 : 0) };
    })
    .filter((x) => x.hit.length)
    .sort((a, b) => b.score - a.score || (b.it.date > a.it.date ? 1 : -1))
    .slice(0, limit)
    .map((x) => ({ ...x.it, matched: x.hit }));
}

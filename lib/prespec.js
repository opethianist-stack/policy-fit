import { portalKey, portalGet, portalError, failReason } from './portal';

// 나라장터 사전규격정보(조달청 `HrcspSsstndrdInfoService`, 주소에 /ao/ 세그먼트).
// 공고가 뜨기 전 단계라 제안요청서·과업지시서가 먼저 공개된다(실측: 규격서 첨부가 곧 그 문서였다).
// 검색 조건이 등록일시·변경일시·사전규격등록번호뿐이고 기관·규격명 필터가 없다(참고자료 1.0 확인).
// 그래서 최근 며칠치를 통째로 받아(한 번에 999건) 서버에서 거른다. 결과는 30분 캐시.
const BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServc';
const TTL = 30 * 60 * 1000;
const MAX_PAGES = 4;   // 용역 기준 최근 9일 1,499건 → 4쪽(3,996건)이면 21일치가 대부분 담긴다
export const MAX_SPAN_DAYS = 21;   // 검색어 조건이 없어 구간 전체를 받아야 한다. 길면 20초를 넘긴다
let CACHE = {};

const stamp = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const flat = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

function shape(x) {
  const files = [1, 2, 3, 4, 5].map((i) => x['specDocFileUrl' + i]).filter(Boolean);
  return {
    no: x.bfSpecRgstNo || '',
    name: String(x.prdctClsfcNoNm || '').replace(/\s+/g, ' ').trim(),
    org: String(x.rlDminsttNm || x.orderInsttNm || '').trim(),   // 실수요기관
    orderOrg: String(x.orderInsttNm || '').trim(),
    kind: x.bsnsDivNm || '',
    budget: Number(x.asignBdgtAmt) || 0,
    openAt: (x.rcptDt || '').slice(0, 16),
    opinionCloseAt: (x.opninRgstClseDt || '').slice(0, 16),   // 의견등록 마감
    files,
    notices: String(x.bidNtceNoList || '').split(',').map((s) => s.trim()).filter(Boolean),   // 이어진 입찰공고번호
  };
}

export async function recentPrespec(days = 7) {
  const d = Math.min(MAX_SPAN_DAYS, Math.max(1, Number(days) || 7));
  const end = new Date();
  return rangePrespec(new Date(end.getTime() - d * 24 * 3600 * 1000), end);
}

// 등록일시 구간(과거 구간도 된다). 캐시 키는 날짜 두 개
export async function rangePrespec(bgn, end) {
  const ck = stamp(bgn) + '|' + stamp(end);
  const hit = CACHE[ck];
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  const items = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let r;
    try {
      r = await portalGet(BASE, {
        ServiceKey: key, type: 'json', inqryDiv: '1', numOfRows: '999', pageNo: String(page),
        inqryBgnDt: stamp(bgn) + '0000', inqryEndDt: stamp(end) + '2359',
      }, 20000);
    } catch (e) {
      return items.length ? done(ck, items, total, true) : { ok: false, error: failReason(e) };
    }
    const body = r.json && r.json.response && r.json.response.body;
    if (!body) return { ok: false, error: portalError(r.text) || `HTTP ${r.status}` };
    total = Number(body.totalCount) || 0;
    const list = Array.isArray(body.items) ? body.items : [];
    for (const x of list) items.push(shape(x));
    if (items.length >= total || list.length < 999) break;
  }
  return done(ck, items, total, items.length < total);
}

function done(ck, items, total, partial) {
  const data = { ok: true, items, total, partial, fetchedAt: new Date().toISOString() };
  CACHE[ck] = { at: Date.now(), data };
  return data;
}

// 규격명·기관명으로 거른다(둘 다 비면 최근 것부터). 띄어쓰기는 무시한다.
export function matchPrespec(items, { terms = [], orgs = [], limit = 20 } = {}) {
  const ts = terms.map(flat).filter((t) => t.length >= 2);
  const os = orgs.map(flat).filter((t) => t.length >= 2);
  const out = [];
  for (const it of items) {
    const name = flat(it.name), org = flat(it.org) + flat(it.orderOrg);
    const hit = ts.filter((t) => name.includes(t));
    if (ts.length && !hit.length) continue;
    if (os.length && !os.some((o) => org.includes(o) || o.includes(org))) continue;
    out.push({ ...it, matched: hit });
  }
  // 맞은 검색어가 많은 순 → 의견등록 마감이 남은 것 → 최근 등록순
  const today = new Date().toISOString().slice(0, 10);
  out.sort((a, b) => b.matched.length - a.matched.length
    || (b.opinionCloseAt.slice(0, 10) >= today) - (a.opinionCloseAt.slice(0, 10) >= today)
    || (b.openAt > a.openAt ? 1 : -1));
  return out.slice(0, limit);
}

// 사전규격등록번호 하나로 찾는다. ① 이미 받아 둔 최근 목록 ② 번호 조회(inqryDiv=2, bfSpecRgstNo)
// ③ 그래도 없으면 최근 14일치에서 찾는다(②의 조건이 먹지 않는 경우 대비). 번호가 다른 건은 버린다.
export const normSpecNo = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');

// 규격서 파일 이름. 사전규격 API 응답에는 파일 주소만 있고 이름이 없다 → 파일 앞 1바이트만 받아 Content-Disposition에서 이름을 읽는다
// (HEAD는 나라장터가 403으로 거절한다, 2026-09-30 실측). 실패하면 "규격서 N"
async function fileName(url, i) {
  const fallback = '규격서 ' + (i + 1);
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: ctl.signal });
    clearTimeout(t);
    const cd = r.headers.get('content-disposition') || '';
    try { await r.body?.cancel(); } catch { /* 본문은 버린다 */ }
    const m = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    if (!m) return fallback;
    let n = m[1].trim();
    try { n = decodeURIComponent(n); } catch { /* 그대로 */ }
    n = n.replace(/^[★☆※*\s]+/, '').trim();
    return n || fallback;
  } catch { return fallback; }
}
export async function specFileList(urls) {
  return Promise.all((urls || []).map(async (url, i) => ({ name: await fileName(url, i), url })));
}
// 나라장터 사전규격 상세 화면 주소(입찰공고 bidNtceDtlUrl과 같은 /link/<화면>/single 형식). 나라장터 로그인 확인을 거쳐 열린다
export const specDetailUrl = (no) => 'https://www.g2b.go.kr/link/PRCA001_04/single/?bfSpecRegNo=' + encodeURIComponent(no);

export async function prespecByNo(no) {
  const n = normSpecNo(no);
  const same = (it) => normSpecNo(it.no) === n;
  for (const v of Object.values(CACHE)) {
    const it = v.data.items.find(same);
    if (it) return { ok: true, item: it };
  }
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  try {
    const r = await portalGet(BASE, { ServiceKey: key, type: 'json', inqryDiv: '2', bfSpecRgstNo: n, numOfRows: '20', pageNo: '1' }, 15000);
    const body = r.json && r.json.response && r.json.response.body;
    const list = body && Array.isArray(body.items) ? body.items.map(shape) : [];
    const it = list.find(same);
    if (it) return { ok: true, item: it };
  } catch { /* 아래 최근 목록으로 넘어간다 */ }
  const all = await recentPrespec(14);
  if (!all.ok) return { ok: false, error: all.error };
  const it = all.items.find(same);
  return it ? { ok: true, item: it } : { ok: false, notFound: true, error: '해당 번호의 사전규격이 없습니다(용역·최근 14일 기준).' };
}

import { portalKey, portalGet, portalError, failReason } from './portal';

// 나라장터 사전규격정보(조달청 `HrcspSsstndrdInfoService`, 주소에 /ao/ 세그먼트).
// 공고가 뜨기 전 단계라 제안요청서·과업지시서가 먼저 공개된다(실측: 규격서 첨부가 곧 그 문서였다).
// 검색 조건이 등록일시·변경일시·사전규격등록번호뿐이고 기관·규격명 필터가 없다(참고자료 1.0 확인).
// 그래서 최근 며칠치를 통째로 받아(한 번에 999건) 서버에서 거른다. 결과는 30분 캐시.
const BASE = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServc';
const TTL = 30 * 60 * 1000;
const MAX_PAGES = 3;   // 용역 기준 최근 9일 1,499건 → 3쪽이면 2주치도 담긴다
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
  const d = Math.min(21, Math.max(1, Number(days) || 7));
  const hit = CACHE[d];
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  const end = new Date();
  const bgn = new Date(end.getTime() - d * 24 * 3600 * 1000);
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
      return items.length ? done(d, items, total, true) : { ok: false, error: failReason(e) };
    }
    const body = r.json && r.json.response && r.json.response.body;
    if (!body) return { ok: false, error: portalError(r.text) || `HTTP ${r.status}` };
    total = Number(body.totalCount) || 0;
    const list = Array.isArray(body.items) ? body.items : [];
    for (const x of list) items.push(shape(x));
    if (items.length >= total || list.length < 999) break;
  }
  return done(d, items, total, false);
}

function done(d, items, total, partial) {
  const data = { ok: true, items, total, partial, fetchedAt: new Date().toISOString() };
  CACHE[d] = { at: Date.now(), data };
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

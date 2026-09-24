import { portalKey, portalGet, portalError, failReason } from './portal';

// 입찰공고 키워드 검색(용역). 입찰공고정보서비스의 나라장터 검색조건 조회(`…ServcPPSSrch`)에 공고명(bidNtceNm)과
// 게시일시 구간을 넣는다. 공고명 조건이 부분 일치로 먹는다는 전제지만, 조건이 무시돼 와도 결과가 틀리지 않게
// 서버에서 공고명을 다시 대조한다(띄어쓰기 무시). 검색어 여러 개는 따로 부르고 합친다(최대 3개). 10분 캐시.
const BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch';
const TTL = 10 * 60 * 1000;
const ROWS = 100;
const CACHE = new Map();

const stamp = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const flat = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

function shape(x) {
  return {
    no: x.bidNtceNo || '',
    ord: x.bidNtceOrd || '',
    name: String(x.bidNtceNm || '').replace(/\s+/g, ' ').trim(),
    org: String(x.dminsttNm || x.ntceInsttNm || '').trim(),
    budget: Number(x.asignBdgtAmt) || 0,
    postedAt: String(x.bidNtceDt || '').slice(0, 16),
    closeAt: String(x.bidClseDt || '').slice(0, 16),
  };
}

async function fetchTerm(key, term, days) {
  const ck = term + '|' + days;
  const hit = CACHE.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const end = new Date();
  const bgn = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const r = await portalGet(BASE, {
    ServiceKey: key, type: 'json', inqryDiv: '1', numOfRows: String(ROWS), pageNo: '1',
    inqryBgnDt: stamp(bgn) + '0000', inqryEndDt: stamp(end) + '2359', bidNtceNm: term,
  }, 15000);
  const header = r.json && r.json.response && r.json.response.header;
  if (!header || header.resultCode !== '00') {
    return { ok: false, error: (header && header.resultMsg) || portalError(r.text) || `HTTP ${r.status}` };
  }
  const body = r.json.response.body || {};
  const data = { ok: true, items: (Array.isArray(body.items) ? body.items : []).map(shape), total: Number(body.totalCount) || 0 };
  CACHE.set(ck, { at: Date.now(), data });
  return data;
}

export async function searchBids({ terms = [], days = 14, limit = 20 } = {}) {
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  const d = Math.min(30, Math.max(1, Number(days) || 14));
  const ts = [...new Set(terms.map((t) => String(t).trim()).filter((t) => flat(t).length >= 2))].slice(0, 3);
  let res;
  try {
    res = await Promise.all((ts.length ? ts : ['']).map((t) => fetchTerm(key, t, d)));
  } catch (e) {
    return { ok: false, error: failReason(e) };
  }
  const bad = res.find((x) => !x.ok);
  if (bad) return bad;
  // 정정공고는 차수마다 한 줄씩 온다 → 공고번호당 최신 차수만
  const byNo = new Map();
  for (const it of res.flatMap((x) => x.items)) {
    const prev = byNo.get(it.no);
    if (!prev || String(it.ord).localeCompare(String(prev.ord)) > 0) byNo.set(it.no, it);
  }
  const fts = ts.map(flat);
  const out = [];
  for (const it of byNo.values()) {
    const name = flat(it.name);
    const matched = ts.filter((t, i) => name.includes(fts[i]));
    if (ts.length && !matched.length) continue;
    out.push({ ...it, matched });
  }
  out.sort((a, b) => b.matched.length - a.matched.length || (b.postedAt > a.postedAt ? 1 : b.postedAt < a.postedAt ? -1 : 0));
  return {
    ok: true, days: d, terms: ts,
    total: res.reduce((s, x) => s + x.total, 0),
    capped: res.some((x) => x.total > ROWS),
    items: out.slice(0, limit),
  };
}

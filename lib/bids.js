import { portalKey, portalGet, portalError, failReason } from './portal';

// 입찰공고 키워드 검색(용역). 입찰공고정보서비스의 나라장터 검색조건 조회(`…ServcPPSSrch`)에 공고명(bidNtceNm)과
// 게시일시 구간을 넣는다. 공고명 조건이 부분 일치로 먹는다는 전제지만, 조건이 무시돼 와도 결과가 틀리지 않게
// 서버에서 공고명을 다시 대조한다(띄어쓰기 무시). 검색어 여러 개는 따로 부르고 합친다(최대 3개). 10분 캐시.
// 실측(2026-09-24): 공고명 조건은 부분 일치이고 띄어쓰기를 무시한다("AI 교육"·"AI교육" 모두 9건).
// 결과는 게시일시 **오름차순**이라 앞쪽만 받으면 최신 공고가 빠진다 → 한 쪽을 999건으로 받고, 넘치면 마지막 두 쪽(최신)을 받는다.
// 999건 한 쪽 약 5초("교육" 14일 274건). 검색어가 없으면(7일 3천 건대) 999건 세 번이 23초라 100건 단위로 받는다.
const BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch';
const TTL = 10 * 60 * 1000;
const ROWS = 999;
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

// 조회 구간 한도: 한 번에 약 한 달(실측 2026-09-29: 32일 정상, 60일은 "입력범위값 초과"). 과거 구간도 된다(2025년 확인).
// 그래서 긴 구간은 31일씩 나눠 부르고 합친다. 화면에서 고를 수 있는 구간은 최대 92일(3번 호출)
const CHUNK_DAYS = 31;
export const MAX_SPAN_DAYS = 92;
const DAY = 24 * 3600 * 1000;

async function fetchWindow(key, term, bgn, end) {
  const ck = term + '|' + stamp(bgn) + '|' + stamp(end);
  const hit = CACHE.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const rows = term ? ROWS : 100;
  const page = async (n) => {
    const r = await portalGet(BASE, {
      ServiceKey: key, type: 'json', inqryDiv: '1', numOfRows: String(rows), pageNo: String(n),
      inqryBgnDt: stamp(bgn) + '0000', inqryEndDt: stamp(end) + '2359', bidNtceNm: term,
    }, 20000);
    const header = r.json && r.json.response && r.json.response.header;
    if (!header || header.resultCode !== '00') {
      return { ok: false, error: (header && header.resultMsg) || portalError(r.text) || `HTTP ${r.status}` };
    }
    const body = r.json.response.body || {};
    return { ok: true, items: Array.isArray(body.items) ? body.items : [], total: Number(body.totalCount) || 0 };
  };
  const first = await page(1);
  if (!first.ok) return first;
  let got = first.items;
  const last = Math.ceil(first.total / rows);
  if (last > 1) {
    // 오름차순이라 최신은 마지막 쪽에 있다. 마지막 쪽이 얇으면 그 앞 쪽까지
    const tail = await Promise.all([last - 1, last].filter((n) => n > 1).map(page));
    const bad = tail.find((x) => !x.ok);
    if (bad) return bad;
    got = tail.flatMap((x) => x.items);
  }
  const data = { ok: true, items: got.map(shape), total: first.total };
  CACHE.set(ck, { at: Date.now(), data });
  return data;
}

// 구간을 31일 조각으로 나눈다(끝 날짜 쪽부터)
function windows(bgn, end) {
  const out = [];
  let e = new Date(end);
  while (e >= bgn) {
    const b = new Date(Math.max(bgn.getTime(), e.getTime() - (CHUNK_DAYS - 1) * DAY));
    out.push([b, new Date(e)]);
    e = new Date(b.getTime() - DAY);
  }
  return out;
}

async function fetchTerm(key, term, bgn, end) {
  const res = await Promise.all(windows(bgn, end).map(([b, e]) => fetchWindow(key, term, b, e)));
  const bad = res.find((x) => !x.ok);
  if (bad) return bad;
  return { ok: true, items: res.flatMap((x) => x.items), total: res.reduce((s, x) => s + x.total, 0), capped: res.some((x) => x.items.length < x.total) };
}

// "20260901" · "2026-09-01" → Date(그날 0시). 형식이 틀리면 null
export function parseDay(v) {
  const m = String(v || '').replace(/-/g, '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
// 기간: from·to가 있으면 그 구간, 없으면 최근 days일. 잘못된 구간은 error
export function dateRange({ days, from, to }, maxSpan) {
  if (from || to) {
    const b = parseDay(from), e = parseDay(to) || new Date();
    if (!b) return { error: '시작일 형식이 아닙니다.' };
    if (b > e) return { error: '시작일이 종료일보다 늦습니다.' };
    const span = Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - b) / DAY) + 1;
    if (span > maxSpan) return { error: `기간은 ${maxSpan}일까지 조회할 수 있습니다.` };
    return { bgn: b, end: e, span };
  }
  const end = new Date();
  return { bgn: new Date(end.getTime() - days * DAY), end, span: days };
}

export async function searchBids({ terms = [], days = 14, from = '', to = '', limit = 20 } = {}) {
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  const d = Math.min(30, Math.max(1, Number(days) || 14));
  const rg = dateRange({ days: d, from, to }, MAX_SPAN_DAYS);
  if (rg.error) return { ok: false, error: rg.error, bad: true };
  const ts = [...new Set(terms.map((t) => String(t).trim()).filter((t) => flat(t).length >= 2))].slice(0, 3);
  let res;
  try {
    res = await Promise.all((ts.length ? ts : ['']).map((t) => fetchTerm(key, t, rg.bgn, rg.end)));
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
    ok: true, days: rg.span, from: stamp(rg.bgn), to: stamp(rg.end), terms: ts,
    total: res.reduce((s, x) => s + x.total, 0),
    capped: res.some((x) => x.capped),
    items: out.slice(0, limit),
  };
}

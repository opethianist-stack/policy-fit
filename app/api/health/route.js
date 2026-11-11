export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { portalReason, portalHeader, isQuota } from '../../../lib/portal';
import { noteQuota, recentOk } from '../../../lib/quota';
import { dbReady, query } from '../../../lib/db';

// 화면의 연결 상태 표시용. 호출 대상과 파라미터가 서버에 고정되어 있어
// 브라우저는 주소나 키를 넘기지 않고 결과(ok / 사유)만 받는다.
// 공공데이터포털은 인증 실패여도 HTTP 200에 오류 본문을 주므로 본문까지 확인한다.

// 호출 한도를 아끼려고(STEP72, 2026-11-02 사용자 요청) ① 화면에 보이는 두 가지(나라장터·공공기관 정보)만 점검하고
// ② 최근 10분 안에 같은 서비스의 실제 호출이 정상이었으면 부르지 않고 정상으로 보며
// ③ 결과를 DB(pf_award_cache 'health')에 두어 서버 인스턴스끼리 나눠 쓴다 — 정상은 30분, 실패는 5분(회복을 빨리 보이게)
const OK_TTL = 30 * 60 * 1000, FAIL_TTL = 5 * 60 * 1000, RECENT = 10 * 60 * 1000;
let cache = { at: 0, body: null };
const fresh = (c) => c && c.body && Date.now() - c.at < (c.body.g2b.ok && c.body.inst.ok ? OK_TTL : FAIL_TTL);
const G2B_OPS = ['getBidPblancListInfoServc', 'getBidPblancListInfoServcPPSSrch', 'getBidPblancListInfoThng', 'getBidPblancListInfoEorderAtchFileInfo'];

function resolveKey(raw) {
  if (!raw) return null;
  const k = String(raw).trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try { return decodeURIComponent(k); } catch { return k; }
  }
  return k;
}

function ymd(offsetDays) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function call(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const started = Date.now();
  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json, text/xml;q=0.9, */*;q=0.8' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const text = (await res.text()).trim();
  noteQuota(base, res.headers, res.status, isQuota(res.status, text));
  let json = null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, text, json, ms: Date.now() - started };
}

// 실패 종류: limit(일일 호출 한도 초과) · error(포털 일시 오류, 5xx) · down(그 밖). 응답 지연(slow)은 safe()에서
function fail(r, reason) {
  return { ok: false, ms: r.ms, kind: isQuota(r.status, r.text) ? 'limit' : r.status >= 500 ? 'error' : 'down', reason: reason || portalReason(r) };
}

// 입찰공고 목록 조회(`…Servc`)로 본다. 공고 찾기 키워드 검색이 쓰는 검색조건 조회(`…ServcPPSSrch`)와 일일 한도가 따로라
// 점검이 검색 한도를 먹지 않는다(2026-10-30 검색조건 조회만 한도 초과, 목록 조회는 정상)
async function checkG2b(key) {
  const r = await call('https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc', {
    ServiceKey: key, inqryDiv: '1', inqryBgnDt: ymd(-1) + '0000', inqryEndDt: ymd(0) + '2359',
    pageNo: '1', numOfRows: '1', type: 'json',
  });
  const hdr = portalHeader(r.json);
  if (r.status === 200 && hdr && hdr.resultCode === '00') return { ok: true, ms: r.ms };
  return fail(r, hdr && hdr.resultMsg);
}

async function checkInst(key) {
  const r = await call('https://apis.data.go.kr/1051000/public_inst/list', {
    serviceKey: key, pageNo: '1', numOfRows: '1', resultType: 'json',
  });
  const j = r.json;
  if (r.status === 200 && j && (Array.isArray(j.result) || j.totalCount !== undefined)) return { ok: true, ms: r.ms };
  return fail(r, j && j.resultMsg);
}

async function safe(fn, key) {
  try { return await fn(key); }
  catch (e) { return e && e.name === 'TimeoutError' ? { ok: false, kind: 'slow', reason: '응답 지연(8초 넘게 답이 없음)' } : { ok: false, kind: 'down', reason: '연결 실패' }; }
}

export async function GET() {
  if (fresh(cache)) return Response.json(cache.body);
  if (dbReady()) {
    try {
      const r = await query(`SELECT data, fetched_at FROM pf_award_cache WHERE key = 'health'`);
      const row = r.rows[0];
      const c = row && { at: new Date(row.fetched_at).getTime(), body: row.data };
      if (fresh(c)) { cache = c; return Response.json(c.body); }
    } catch (e) { /* 직접 점검 */ }
  }

  const key = resolveKey(process.env.DATA_GO_KR_KEY);
  let body;
  if (!key) {
    const miss = { ok: false, reason: '인증키 미등록' };
    body = { g2b: miss, inst: miss };
  } else {
    const recent = { ok: true, recent: true };
    const [g2b, inst] = await Promise.all([
      recentOk(G2B_OPS, RECENT) ? recent : safe(checkG2b, key),
      recentOk(['public_inst/list'], RECENT) ? recent : safe(checkInst, key),
    ]);
    body = { g2b, inst };
  }
  body.checkedAt = new Date().toISOString();
  cache = { at: Date.now(), body };
  if (dbReady() && key) {
    await query(`INSERT INTO pf_award_cache (key, data, fetched_at) VALUES ('health', $1, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`, [JSON.stringify(body)]).catch(() => {});
  }
  return Response.json(body);
}

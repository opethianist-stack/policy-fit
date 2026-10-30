export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { portalReason, isQuota } from '../../../lib/portal';

// 화면의 연결 상태 표시용. 호출 대상과 파라미터가 서버에 고정되어 있어
// 브라우저는 주소나 키를 넘기지 않고 결과(ok / 사유)만 받는다.
// 공공데이터포털은 인증 실패여도 HTTP 200에 오류 본문을 주므로 본문까지 확인한다.

const TTL_MS = 60 * 1000; // 같은 서버 인스턴스에서는 1분간 결과를 재사용해 호출 한도를 아낀다.
let cache = { at: 0, body: null };

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
  const code = r.json && r.json.response && r.json.response.header && r.json.response.header.resultCode;
  if (r.status === 200 && code === '00') return { ok: true, ms: r.ms };
  const hdr = r.json && r.json.response && r.json.response.header;
  return fail(r, hdr && hdr.resultMsg);
}

// 낙찰정보서비스·계약정보서비스(수주 현황, STEP64). 활용신청이 따로라 각각 확인한다
async function checkPps(key, path, params) {
  const r = await call('https://apis.data.go.kr/1230000' + path, { serviceKey: key, pageNo: '1', numOfRows: '1', type: 'json', ...params });
  const code = r.json && r.json.response && r.json.response.header && r.json.response.header.resultCode;
  if (r.status === 200 && code === '00') return { ok: true, ms: r.ms };
  const err = r.json && r.json['nkoneps.com.response.ResponseError'];
  const hdr = (r.json && r.json.response && r.json.response.header) || (err && err.header);
  return fail(r, hdr && hdr.resultMsg);
}
const checkAward = (key) => checkPps(key, '/as/ScsbidInfoService/getScsbidListSttusServcPPSSrch', { inqryDiv: '1', inqryBgnDt: ymd(-7) + '0000', inqryEndDt: ymd(0) + '2359' });
const checkCntrct = (key) => checkPps(key, '/ao/CntrctInfoService/getCntrctInfoListServcPPSSrch', { inqryDiv: '1', inqryBgnDate: ymd(-7), inqryEndDate: ymd(0) });

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
  if (cache.body && Date.now() - cache.at < TTL_MS) return Response.json(cache.body);

  const key = resolveKey(process.env.DATA_GO_KR_KEY);
  let body;
  if (!key) {
    const miss = { ok: false, reason: '인증키 미등록' };
    body = { g2b: miss, inst: miss, award: miss, cntrct: miss };
  } else {
    const [g2b, inst, award, cntrct] = await Promise.all([safe(checkG2b, key), safe(checkInst, key), safe(checkAward, key), safe(checkCntrct, key)]);
    body = { g2b, inst, award, cntrct };
  }
  body.checkedAt = new Date().toISOString();
  cache = { at: Date.now(), body };
  return Response.json(body);
}

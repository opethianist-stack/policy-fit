export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// 포털 공통 오류 본문(XML)에서 사유만 뽑는다.
function portalError(text) {
  const m = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || text.match(/<errMsg>([^<]*)<\/errMsg>/);
  return m ? m[1] : null;
}

async function checkG2b(key) {
  const r = await call('https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch', {
    ServiceKey: key, inqryDiv: '1', inqryBgnDt: ymd(-7) + '0000', inqryEndDt: ymd(0) + '2359',
    pageNo: '1', numOfRows: '1', type: 'json',
  });
  const code = r.json && r.json.response && r.json.response.header && r.json.response.header.resultCode;
  if (r.status === 200 && code === '00') return { ok: true, ms: r.ms };
  const hdr = r.json && r.json.response && r.json.response.header;
  return { ok: false, ms: r.ms, reason: (hdr && hdr.resultMsg) || portalError(r.text) || `HTTP ${r.status}` };
}

async function checkInst(key) {
  const r = await call('https://apis.data.go.kr/1051000/public_inst/list', {
    serviceKey: key, pageNo: '1', numOfRows: '1', resultType: 'json',
  });
  const j = r.json;
  if (r.status === 200 && j && (Array.isArray(j.result) || j.totalCount !== undefined)) return { ok: true, ms: r.ms };
  return { ok: false, ms: r.ms, reason: (j && j.resultMsg) || portalError(r.text) || `HTTP ${r.status}` };
}

async function safe(fn, key) {
  try { return await fn(key); }
  catch (e) { return { ok: false, reason: e && e.name === 'TimeoutError' ? '응답 시간 초과' : '연결 실패' }; }
}

export async function GET() {
  if (cache.body && Date.now() - cache.at < TTL_MS) return Response.json(cache.body);

  const key = resolveKey(process.env.DATA_GO_KR_KEY);
  let body;
  if (!key) {
    const miss = { ok: false, reason: '인증키 미등록' };
    body = { g2b: miss, inst: miss };
  } else {
    const [g2b, inst] = await Promise.all([safe(checkG2b, key), safe(checkInst, key)]);
    body = { g2b, inst };
  }
  body.checkedAt = new Date().toISOString();
  cache = { at: Date.now(), body };
  return Response.json(body);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 200000;

// 프록시는 요청받은 주소에 서버의 인증키를 붙여 대신 호출한다.
// 주소를 제한하지 않으면 외부에서 자기 서버 주소를 넣어 인증키를 그대로 받아갈 수 있으므로,
// 허용 호스트를 고정한다.
const ALLOWED_HOSTS = new Set([
  'apis.data.go.kr',
  'api.odcloud.kr',
  'openapi.alioplus.go.kr',
]);

// 공공데이터포털은 '인코딩 키'와 '디코딩 키' 두 벌을 준다.
// 인코딩 키(%2B, %2F 포함)를 그대로 다시 인코딩하면 인증에 실패하므로 여기서 한 번 정규화한다.
// 알리오플러스 키도 동일하게 처리한 뒤 URLSearchParams가 다시 정확히 인코딩한다.
function resolveKey(raw) {
  if (!raw) return null;
  const k = String(raw).trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try { return decodeURIComponent(k); } catch { return k; }
  }
  return k;
}

function pickKey(source) {
  const raw = source === 'alio' ? process.env.ALIO_API_KEY : process.env.DATA_GO_KR_KEY;
  return resolveKey(raw);
}

function maskValue(sp, keyParam) {
  const copy = new URLSearchParams(sp.toString());
  if (copy.has(keyParam)) copy.set(keyParam, '****MASKED****');
  return copy.toString();
}

export async function GET() {
  return Response.json({
    dataKeyConfigured: Boolean(process.env.DATA_GO_KR_KEY),
    alioKeyConfigured: Boolean(process.env.ALIO_API_KEY),
  });
}

export async function POST(req) {
  const started = Date.now();

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 });
  }

  const endpoint = String(body.endpoint || '').trim();
  const method = String(body.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  const keyParam = String(body.keyParam || 'serviceKey').trim();
  const keySource = body.keySource === 'alio' ? 'alio' : 'data';
  const params = body.params && typeof body.params === 'object' ? body.params : {};

  if (!/^https?:\/\//i.test(endpoint)) {
    return Response.json({ ok: false, error: 'endpoint는 http(s)로 시작하는 전체 URL이어야 합니다.' }, { status: 400 });
  }

  let host;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return Response.json({ ok: false, error: 'endpoint URL 파싱에 실패했습니다.' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return Response.json({
      ok: false,
      error: `허용되지 않은 호스트입니다: ${host}. 허용 목록: ${[...ALLOWED_HOSTS].join(', ')}`,
    }, { status: 403 });
  }

  const key = pickKey(keySource);
  if (!key) {
    const name = keySource === 'alio' ? 'ALIO_API_KEY' : 'DATA_GO_KR_KEY';
    return Response.json({
      ok: false,
      error: `${name} 환경변수가 설정되지 않았습니다. Vercel 프로젝트 Settings → Environment Variables 에서 등록한 뒤 재배포하세요.`,
    }, { status: 500 });
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return Response.json({ ok: false, error: 'endpoint URL 파싱에 실패했습니다.' }, { status: 400 });
  }

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k && v !== undefined && v !== null && String(v) !== '') sp.set(k, String(v));
  }
  sp.set(keyParam, key);

  let requestUrl;
  let init;

  if (method === 'POST') {
    // 알리오플러스는 POST + application/x-www-form-urlencoded 방식.
    requestUrl = `POST ${url.toString()}  [body] ${maskValue(sp, keyParam)}`;
    init = {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/xml;q=0.9, */*;q=0.8',
      },
      body: sp.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    };
  } else {
    for (const [k, v] of sp.entries()) url.searchParams.set(k, v);
    const masked = new URL(url.toString());
    if (masked.searchParams.has(keyParam)) masked.searchParams.set(keyParam, '****MASKED****');
    requestUrl = `GET ${masked.toString()}`;
    init = {
      method: 'GET',
      headers: { accept: 'application/json, text/xml;q=0.9, */*;q=0.8' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    };
  }

  let res, text;
  try {
    res = await fetch(url.toString(), init);
    text = await res.text();
  } catch (e) {
    return Response.json({
      ok: false,
      requestUrl,
      elapsedMs: Date.now() - started,
      error: '외부 요청 실패: ' + (e && e.message ? e.message : String(e)),
    }, { status: 502 });
  }

  const contentType = res.headers.get('content-type') || '';
  const trimmed = text.trim();
  let parsed = null;
  let format = 'text';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      parsed = JSON.parse(trimmed);
      format = 'json';
    } catch {
      format = 'text';
    }
  } else if (trimmed.startsWith('<')) {
    format = 'xml';
  }

  return Response.json({
    ok: res.ok,
    status: res.status,
    contentType,
    format,
    elapsedMs: Date.now() - started,
    requestUrl,
    bytes: text.length,
    truncated: text.length > MAX_BODY,
    bodyText: text.slice(0, MAX_BODY),
    parsed,
  });
}

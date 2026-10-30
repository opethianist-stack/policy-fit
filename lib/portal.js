// 공공데이터포털 호출 공통부. 인증키는 서버 환경변수에서만 읽는다.

export function resolveKey(raw) {
  if (!raw) return null;
  const k = String(raw).trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try { return decodeURIComponent(k); } catch { return k; }
  }
  return k;
}

export function portalKey() {
  return resolveKey(process.env.DATA_GO_KR_KEY);
}

// 포털은 인증 실패에도 HTTP 200에 XML 오류 본문을 준다. 본문에서 사유를 뽑는다.
// type=json으로 불러도 게이트웨이 오류(한도 초과·서버 오류)는 JSON의 cmmMsgHeader로 온다 — 둘 다 본다
export function portalError(text) {
  const m = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || text.match(/<errMsg>([^<]*)<\/errMsg>/)
    || text.match(/"returnAuthMsg"\s*:\s*"([^"]*)"/) || text.match(/"errMsg"\s*:\s*"([^"]*)"/);
  return m ? m[1] : null;
}

// 화면에 보일 사유. 일일 호출 한도 초과(429)는 다시 불러도 같으니 quota로 따로 알린다(자정 KST에 풀린다)
export const QUOTA_MSG = '일일 호출 한도 초과(자정에 풀림)';
export function isQuota(status, text) {
  return status === 429 || /요청제한|LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(String(text || ''));
}
export function portalReason(r) {
  if (isQuota(r.status, r.text)) return QUOTA_MSG;
  const msg = portalError(r.text);
  if (r.status >= 500 || /APPLICATION_ERROR|어플리케이션 에러/.test(msg || '')) return '공공데이터포털 일시 오류(HTTP ' + r.status + ')';
  return msg || `HTTP ${r.status}`;
}

export async function portalGet(base, params, timeoutMs = 10000) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json, text/xml;q=0.9, */*;q=0.8' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = (await res.text()).trim();
  let json = null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, text, json };
}

export function failReason(e) {
  return e && e.name === 'TimeoutError' ? '응답 시간 초과' : '외부 API 연결 실패';
}

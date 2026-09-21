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
export function portalError(text) {
  const m = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || text.match(/<errMsg>([^<]*)<\/errMsg>/);
  return m ? m[1] : null;
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

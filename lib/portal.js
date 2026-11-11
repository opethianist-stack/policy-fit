// 공공데이터포털 호출 공통부. 인증키는 서버 환경변수에서만 읽는다.
import { noteQuota } from './quota';

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

// 응답 머리. 나라장터는 오류(입력범위값 초과 등)를 HTTP 200에 다른 모양 {"nkoneps.com.response.ResponseError": {header}}으로 준다(2026-11-11 실측)
export function portalHeader(json) {
  if (!json) return null;
  return (json.response && json.response.header) || (json['nkoneps.com.response.ResponseError'] && json['nkoneps.com.response.ResponseError'].header) || null;
}
// 나라장터 조회 기간 한도: 시작일~종료일 7일(날짜 기준, 2026-11 확인 — 그 전에는 한 달). 입찰공고·개찰결과·최종낙찰·계약 모두. 사전규격은 21일 그대로
export const G2B_MAX_DAYS = 7;
export const RANGE_MSG = '조회 기간 초과(나라장터는 한 번에 7일까지)';

// 화면에 보일 사유. 일일 호출 한도 초과(429)는 다시 불러도 같으니 quota로 따로 알린다(자정 KST에 풀린다)
export const QUOTA_MSG = '일일 호출 한도 초과(자정에 풀림)';
// 초당 한도(오퍼레이션마다 초당 30회, 2026-11-11 실측: 40개를 한꺼번에 부르면 7개가 429 "…PER_SECOND_EXCEEDS_ERROR")는
// 일일 한도와 같은 429로 오지만 잠깐 뒤 다시 부르면 된다 — portalGet이 알아서 다시 부르고, 일일 한도로 세지 않는다
export function isBurst(status, text) {
  return status === 429 && /PER_SECOND/.test(String(text || ''));
}
export function isQuota(status, text) {
  if (isBurst(status, text)) return false;
  return status === 429 || /요청제한|LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(String(text || ''));
}
export function portalReason(r) {
  if (isQuota(r.status, r.text)) return QUOTA_MSG;
  if (isBurst(r.status, r.text)) return '호출이 몰려 잠시 막힘(초당 한도) — 다시 조회해 주세요';
  const h = portalHeader(r.json);
  if (h && h.resultCode === '07') return RANGE_MSG;
  if (h && h.resultCode && h.resultCode !== '00' && h.resultMsg) return h.resultMsg;
  const msg = portalError(r.text);
  if (r.status >= 500 || /APPLICATION_ERROR|어플리케이션 에러/.test(msg || '')) return '공공데이터포털 일시 오류(HTTP ' + r.status + ')';
  return msg || `HTTP ${r.status}`;
}

// 초당 한도를 넘지 않게 오퍼레이션(주소)마다 1초 안에 시작하는 호출을 PER_SEC개로 묶는다(이 인스턴스 안에서).
// 7일 조각으로 나눈 뒤 수주 현황 12개월이 오퍼레이션마다 약 60번을 동시에 불러 초당 한도에 걸렸다(2026-11-11)
const PER_SEC = 20;
const STARTS = new Map();   // 주소 → 최근 시작 시각들
async function slot(base) {
  for (;;) {
    const now = Date.now();
    const list = (STARTS.get(base) || []).filter((t) => now - t < 1000);
    if (list.length < PER_SEC) { list.push(now); STARTS.set(base, list); return; }
    STARTS.set(base, list);
    await new Promise((ok) => setTimeout(ok, 1000 - (now - list[0]) + 5));
  }
}

export async function portalGet(base, params, timeoutMs = 10000) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v));
  }
  let res, text;
  for (let i = 0; ; i++) {
    await slot(base);
    res = await fetch(url.toString(), {
      headers: { accept: 'application/json, text/xml;q=0.9, */*;q=0.8' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = (await res.text()).trim();
    if (!isBurst(res.status, text) || i >= 3) break;
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1) + Math.random() * 1000));   // 초당 한도: 조금씩 더 기다려 다시(최대 3번)
  }
  if (!isBurst(res.status, text)) noteQuota(base, res.headers, res.status, isQuota(res.status, text));   // 초당 한도 응답의 헤더(한도 30)는 일일 값이 아니다
  let json = null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, text, json };
}

export function failReason(e) {
  return e && e.name === 'TimeoutError' ? '응답 시간 초과' : '외부 API 연결 실패';
}

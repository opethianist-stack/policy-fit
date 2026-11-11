// 수주 현황 최근 조회 결과를 이 브라우저(localStorage)에 남긴다(STEP79).
// 다른 탭에 다녀오거나 새로 조회해 앞 결과를 덮어써도 다시 부르지 않고 바로 연다 — 7일 조각으로 나눠 부르게 된 뒤
// 12개월 조회 한 번에 포털 호출이 수백 번이라(STEP77). 공개 조달 자료만 담고 계정 정보는 넣지 않는다.
// 화면마다 5건, 하루가 지나면 버린다. 저장 공간이 모자라면 오래된 것부터 뺀다.
const MAX = 5;
const TTL = 24 * 3600 * 1000;

function readAll(store) {
  try {
    const list = JSON.parse(localStorage.getItem(store) || '[]');
    const now = Date.now();
    return Array.isArray(list) ? list.filter((x) => x && x.k && x.data && now - x.at < TTL) : [];
  } catch { return []; }
}

export function recentList(store) {
  return readAll(store).map(({ k, label, at, cond }) => ({ k, label, at, cond }));
}

export function recentGet(store, k) {
  const hit = readAll(store).find((x) => x.k === k);
  return hit || null;
}

export function recentPut(store, entry) {
  let list = [{ ...entry, at: entry.at || Date.now() }, ...readAll(store).filter((x) => x.k !== entry.k)].slice(0, MAX);
  while (list.length) {
    try { localStorage.setItem(store, JSON.stringify(list)); return; } catch { list = list.slice(0, -1); }   // 공간이 모자라면 오래된 것부터
  }
  try { localStorage.removeItem(store); } catch { /* 저장 못 함 */ }
}

export function ago(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  return `${Math.round(m / 60)}시간 전`;
}

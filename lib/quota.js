import { dbReady, query } from './db';

// 공공데이터포털 일일 호출 한도(관리자 대시보드). 포털 게이트웨이가 응답마다 오퍼레이션별
// x-ratelimit-limit(하루 한도, 개발계정 1000) · x-ratelimit-remaining(오늘 남은 횟수)을 준다(2026-11-02 실측).
// 한도는 인증키 하나에 오퍼레이션마다 따로이고 자정(KST)에 다시 찬다.
// 응답을 받을 때 값을 기억해 두고 pf_quota(날짜·오퍼레이션별 그날 최대 사용 수)에 남긴다. 계정 정보는 없다.
// 한도 초과(429) 응답에는 헤더가 없어 남은 횟수 0으로 적는다.
export const OPS = {
  getBidPblancListInfoServcPPSSrch: '입찰공고 검색 (공고 찾기 키워드 · 수주 현황 · 작년 같은 사업)',
  getBidPblancListInfoServc: '입찰공고 번호 조회 · 연결 점검',
  getBidPblancListInfoThng: '입찰공고 번호 조회(물품)',
  getBidPblancListInfoCnstwk: '입찰공고 번호 조회(공사)',
  getBidPblancListInfoFrgcpt: '입찰공고 번호 조회(외자)',
  getBidPblancListInfoEorderAtchFileInfo: '제안요청정보 첨부',
  getBidPblancListInfoLicenseLimit: '투찰 제한(업종)',
  getBidPblancListInfoPrtcptPsblRgn: '투찰 제한(참가가능지역)',
  getPublicPrcureThngInfoServc: '사전규격 목록',
  getOpengResultListInfoServcPPSSrch: '개찰결과 검색 (수주 현황)',
  getScsbidListSttusServcPPSSrch: '최종낙찰 검색 (수주 현황 · 업체로 찾기)',
  getOpengResultListInfoOpengCompt: '개찰순위 (수주 현황)',
  getCntrctInfoListServcPPSSrch: '계약 검색 (수주 현황)',
  getPrcrmntCorpBasicInfo02: '업체 정보 (업체로 찾기)',
  'public_inst/list': '공공기관 정보 (발주처 계보)',
  'biz/list': '공공기관 사업정보',
  mainPolicyList: '과기정통부 주요정책',
  businessAnnouncMentList: '과기정통부 사업공고',
  pressReleaseList: '과기정통부 보도자료',
  pressExplainList: '과기정통부 보도설명',
};

const HOUR = 3600 * 1000;
const kstDay = (ms = Date.now()) => new Date(ms + 9 * HOUR).toISOString().slice(0, 10);
function opOf(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return /^(list|brnch)$/.test(last) ? parts.slice(-2).join('/') : last;
  } catch { return ''; }
}

// 인스턴스 메모리: 오퍼레이션 → { day, lim, rem, at }. DB 쓰기는 아래 조건일 때만(동시 호출 20개가 DB를 20번 두드리지 않게)
const MEM = new Map();
const WROTE = new Map();
export function noteQuota(url, headers, status, quota) {
  const op = opOf(url);
  if (!op) return;
  const day = kstDay();
  const prev = MEM.get(op);
  let lim = Number(headers && headers.get && headers.get('x-ratelimit-limit'));
  let rem = Number(headers && headers.get && headers.get('x-ratelimit-remaining'));
  if (quota) { lim = lim || (prev && prev.lim) || 0; rem = 0; }
  if (!Number.isFinite(lim) || !lim || !Number.isFinite(rem)) return;
  const now = Date.now();
  // 동시 호출은 응답 순서가 뒤섞이므로 같은 날 더 적은 남은 횟수를 남긴다
  if (prev && prev.day === day && prev.rem < rem) rem = prev.rem;
  MEM.set(op, { day, lim, rem, at: now, hit: quota || (prev && prev.day === day && prev.hit) || false });
  if (!dbReady()) return;
  // 15초가 지났거나, 마지막으로 적은 뒤 20번 넘게 줄었거나(동시 호출 묶음), 거의 다 썼으면 적는다 — 하루 최대가 최대 20번 덜 셀 수 있다
  const w = WROTE.get(op);
  if (w && w.day === day && now - w.at < 15000 && w.rem - rem < 20 && rem > 50 && !quota) return;
  WROTE.set(op, { day, at: now, rem });
  query(`INSERT INTO pf_quota (day, op, lim, used, hit, at) VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (day, op) DO UPDATE SET lim = EXCLUDED.lim, used = GREATEST(pf_quota.used, EXCLUDED.used),
      hit = pf_quota.hit OR EXCLUDED.hit, at = now()`, [day, op, lim, lim - rem, !!quota]).catch(() => {});
}

// 대시보드: 오늘 오퍼레이션별 사용·남은 횟수 + 최근 30일 하루 최대 사용·한도 도달 일수
export async function quotaStats(days = 30) {
  const today = kstDay();
  const rows = new Map();
  for (const [op, v] of MEM) if (v.day === today) rows.set(op, { op, lim: v.lim, used: v.lim - v.rem, hit: v.hit, at: v.at });
  let history = [];
  if (dbReady()) {
    try {
      const [t, h] = await Promise.all([
        query(`SELECT op, lim, used, hit, at FROM pf_quota WHERE day = $1`, [today]),
        query(`SELECT op, max(lim) AS lim, max(used) AS peak, round(avg(used)) AS avg, count(*) FILTER (WHERE hit OR used >= lim) AS hits, count(*) AS days
          FROM pf_quota WHERE day > (now() AT TIME ZONE 'Asia/Seoul')::date - $1::int GROUP BY op`, [days]),
      ]);
      for (const r of t.rows) {
        const m = rows.get(r.op);
        const used = Math.max(Number(r.used), m ? m.used : 0);
        rows.set(r.op, { op: r.op, lim: Number(r.lim), used, hit: r.hit || (m && m.hit), at: Math.max(new Date(r.at).getTime(), m ? m.at : 0) });
      }
      history = h.rows.map((r) => ({ op: r.op, label: OPS[r.op] || r.op, lim: Number(r.lim), peak: Number(r.peak), avg: Number(r.avg), hits: Number(r.hits), days: Number(r.days) }))
        .sort((a, b) => b.peak / b.lim - a.peak / a.lim);
    } catch (e) { /* 오늘 값만 보인다 */ }
  }
  const todayRows = [...rows.values()].map((r) => ({ ...r, label: OPS[r.op] || r.op })).sort((a, b) => b.used / b.lim - a.used / a.lim);
  return { today: todayRows, history, db: dbReady() };
}

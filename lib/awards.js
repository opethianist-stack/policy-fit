import { portalKey, portalGet, portalReason, isQuota, QUOTA_MSG } from './portal';
import { dbReady, query } from './db';

// 낙찰·계약 조회(수주 현황). 사업명 키워드 + 기간으로 입찰공고·개찰결과·최종낙찰·계약을 받아 공고 단위로 묶는다.
// 실측(2026-10-28~29, 다른 세션 + 이 세션 재확인):
// - 네 목록 모두 조회 구간이 약 한 달까지다(두 달을 넣으면 "입력범위값 초과 에러"(07)) → 달력 한 달씩 나눠 부른다
// - 입찰공고·개찰결과·최종낙찰 PPSSrch의 inqryDiv=1은 공고 게시일 기준이다(2월 게시·3월 개찰인 서울 공고가 2월 구간에 나온다)
// - 계약 목록은 계약일 기준이라 공고 뒤 몇 달에 걸쳐 나온다 → 계약은 공고 구간 끝에서 넉 달 뒤(오늘까지)까지 본다
// - 공고명 조건은 띄어쓰기를 무시하는 부분 일치. 계약명 조건은 띄어쓰기를 가린다(강원 "AI디지털 배움터")
// - 개찰결과 목록은 1순위 한 곳만, 개찰순위 전체는 …OpengCompt를 공고마다 부른다
// - 계약은 변경 등록마다 행이 늘어난다(같은 dcsnCntrctNo 앞 13자리) → rgstDt가 가장 늦은 한 행
// - 조달청 대행 계약은 totCntrctAmt가 0 → thtmCntrctAmt
// - 계약의 ntceNo가 빈 경우가 있다(제주) → 같은 기관·같은 사업명으로 보조 매칭하고 매칭 방식을 남긴다
const BASE = 'https://apis.data.go.kr/1230000';
const OPS = {
  bid: '/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch',
  openg: '/as/ScsbidInfoService/getOpengResultListInfoServcPPSSrch',
  scs: '/as/ScsbidInfoService/getScsbidListSttusServcPPSSrch',
  cntrct: '/ao/CntrctInfoService/getCntrctInfoListServcPPSSrch',
  rank: '/as/ScsbidInfoService/getOpengResultListInfoOpengCompt',
};
export const MAX_MONTHS = 12;
const CONTRACT_TAIL_MONTHS = 4;
const ROWS = 100;
const MAX_PAGES = 10;
const RANK_LIMIT = 60; // 개찰순위를 한 번에 받는 공고 수 상한(넘으면 화면에서 공고별로 부른다)
const HOUR = 3600 * 1000;

const flat = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const num = (v) => { const n = Number(String(v || '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const kstNow = () => new Date(Date.now() + 9 * HOUR);
const pad = (n) => String(n).padStart(2, '0');

// ── 캐시: 같은 인스턴스는 메모리, DB가 있으면 pf_award_cache에도 남긴다(포털 일일 호출 한도 때문)
const MEM = new Map();
async function cacheGet(key, ttl) {
  const m = MEM.get(key);
  if (m && Date.now() - m.at < ttl) return m.data;
  if (!dbReady()) return null;
  try {
    const r = await query('SELECT data, fetched_at FROM pf_award_cache WHERE key = $1', [key]);
    const row = r.rows[0];
    if (row && Date.now() - new Date(row.fetched_at).getTime() < ttl) {
      MEM.set(key, { at: new Date(row.fetched_at).getTime(), data: row.data });
      return row.data;
    }
  } catch (e) { /* 캐시 실패는 조회에 영향 없음 */ }
  return null;
}
async function cachePut(key, data) {
  MEM.set(key, { at: Date.now(), data });
  if (MEM.size > 500) MEM.delete(MEM.keys().next().value);
  if (!dbReady()) return;
  try {
    await query(`INSERT INTO pf_award_cache (key, data, fetched_at) VALUES ($1, $2, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`, [key, JSON.stringify(data)]);
  } catch (e) { /* 무시 */ }
}

// ── 포털 호출: 연결이 끊기는 경우가 있어(실측) 1.5초 간격으로 두 번 더 해 본다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(op, params) {
  const key = portalKey();
  if (!key) return { ok: false, error: '인증키 미등록' };
  let last = '외부 API 연결 실패';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await portalGet(BASE + OPS[op], { serviceKey: key, type: 'json', numOfRows: String(ROWS), ...params }, 20000);
      const j = r.json || {};
      const header = (j.response && j.response.header) || (j['nkoneps.com.response.ResponseError'] && j['nkoneps.com.response.ResponseError'].header);
      if (header && header.resultCode === '00') {
        const body = j.response.body || {};
        return { ok: true, items: Array.isArray(body.items) ? body.items : [], total: num(body.totalCount) };
      }
      last = (header && header.resultMsg) || portalReason(r);
      if (header || isQuota(r.status, r.text)) break; // 포털이 준 오류(키·범위·일일 한도)는 다시 불러도 같다
    } catch (e) {
      last = e && e.name === 'TimeoutError' ? '응답 시간 초과' : '외부 API 연결 실패';
    }
    if (i < 2) await sleep(1500);
  }
  return { ok: false, error: last };
}

async function callAll(op, params, ttl, maxPages = MAX_PAGES) {
  const ck = op + '|' + JSON.stringify(params) + (maxPages !== MAX_PAGES ? '|p' + maxPages : '');
  const hit = await cacheGet(ck, ttl);
  if (hit) return { ok: true, items: hit, cached: true };
  let items = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await call(op, { ...params, pageNo: String(page) });
    if (!r.ok) return r;
    items = items.concat(r.items);
    if (page * ROWS >= r.total) break;
  }
  // DB에 남기는 건 기다리지 않는다(끝에서 한꺼번에 마무리, flushCache)
  PENDING.push(cachePut(ck, items));
  return { ok: true, items, fetched: true };
}
const PENDING = [];
export async function flushCache() {
  const all = PENDING.splice(0);
  if (all.length) await Promise.race([Promise.allSettled(all), sleep(3000)]);
}

// 동시에 n개까지. 공고명 키워드 검색은 한 번에 2~4초라 동시 수가 곧 조회 시간이다(2026-10-29 실측 "디지털배움터" 10개월: 6개 19초 → 10개 18초 → 20개 7.5초, 30개 7초. 20개에서도 포털 오류 없음)
async function pool(tasks, n = 20) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
  }));
  return out;
}

// ── 기간: "2026-01" 형식의 달 두 개 → 달력 한 달씩
function months(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({ y, m, bgn: `${y}${pad(m)}01`, end: `${y}${pad(m)}${pad(last)}` });
  }
  return out;
}
// 지난달 이전 구간은 바뀔 일이 적어 하루, 최근 두 달은 한 시간
function listTtl(mon) {
  const now = kstNow();
  const age = (now.getUTCFullYear() - mon.y) * 12 + (now.getUTCMonth() + 1 - mon.m);
  return age >= 2 ? 24 * HOUR : HOUR;
}

// ── 응답 정리
function corpList(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/\[([^\]]+)\]/g)) {
    const p = m[1].split('^');
    const kind = p[2] || '';
    const share = p[6] === '' || p[6] === undefined ? (kind === '단독' ? 100 : null) : num(p[6]);
    out.push({ role: p[1] === '주계약업체' ? '주관' : p[1] === '도급업체' ? '구성원' : (p[1] || ''), kind, name: p[3] || '', ceo: p[4] || '', share, biz: p[9] || '' });
  }
  // 주관이 먼저
  return out.sort((a, b) => (a.role === '주관' ? 0 : 1) - (b.role === '주관' ? 0 : 1));
}
function openingInfo(x) {
  const c = String(x.opengCorpInfo || '').split('^');
  return {
    no: x.bidNtceNo, ord: x.bidNtceOrd || '000', clsfc: x.bidClsfcNo || '', at: String(x.opengDt || '').slice(0, 16),
    count: num(x.prtcptCnum), status: x.progrsDivCdNm || '', note: String(x.opengRsltNtcCntnts || '').trim(),
    first: c[0] ? { name: c[0], biz: c[1] || '', amount: num(c[3]), rate: c[4] || '' } : null,
  };
}
function contractInfo(x) {
  const tot = num(x.totCntrctAmt);
  return {
    id: String(x.dcsnCntrctNo || x.untyCntrctNo || '').slice(0, 13), no: x.untyCntrctNo || '', ntceNo: x.ntceNo || '',
    name: String(x.cntrctNm || '').replace(/\s+/g, ' ').trim(), inst: x.cntrctInsttNm || '',
    date: x.cntrctCnclsDate || '', method: x.cntrctCnclsMthdNm || '', amount: tot > 0 ? tot : num(x.thtmCntrctAmt),
    rgstDt: x.rgstDt || '', corps: corpList(x.corpList), url: x.cntrctDtlInfoUrl || '',
    dminst: (String(x.dminsttList || '').match(/^\[\d+\^[^^]*\^([^^]*)/) || [])[1] || '',
  };
}
function rankRow(x) {
  const rank = String(x.opengRank || '').trim();
  return {
    rank: rank ? num(rank) : null, name: x.prcbdrNm || '', biz: x.prcbdrBizno || '', ceo: x.prcbdrCeoNm || '',
    amount: num(x.bidprcAmt), at: String(x.bidprcDt || '').slice(0, 16),
    tech: x.techEvlVal || '', techRaw: x.techEvlNaturVal || '', price: x.bidPrceEvlVal || '', total: x.totalEvlAmtVal || '',
    note: x.rmrk || '', clsfc: x.bidClsfcNo || '',
  };
}

// 공고명 묶기: 앞뒤 꾸밈말((긴급)·[긴급]·(협상)·(가격협상)·_협상에의한계약 등)과 띄어쓰기·기호를 지운다.
// 제주처럼 협상 공고와 가격협상 공고가 따로 나온 것, 대구처럼 취소 후 다시 낸 것, 유찰 뒤 재공고가 한 사업으로 묶인다
export function normName(s) {
  return flat(String(s || '').replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, '').replace(/_[^_]*$/, ''))
    .replace(/[「」『』‘’'"“”·.,:;!?~\-–—]/g, '');
}

// 시도 이름(표에 짧게). 공고명을 먼저 보고(전남광주통합특별시 광주청사처럼 기관명이 둘을 품는 경우), 없으면 기관명
const REGIONS = [
  ['서울', /서울/], ['부산', /부산/], ['대구', /대구/], ['인천', /인천/], ['광주', /광주광역시|광주청사|광주시/], ['대전', /대전/],
  ['울산', /울산/], ['세종', /세종/], ['경기', /경기/], ['강원', /강원/], ['충북', /충북|충청북도/], ['충남', /충남|충청남도/],
  ['전북', /전북|전라북도/], ['전남', /전남(?!광주)|전라남도|무안청사/], ['경북', /경북|경상북도/], ['경남', /경남|경상남도/], ['제주', /제주/],
];
function region(name, org) {
  for (const src of [name, org]) {
    for (const [label, re] of REGIONS) if (re.test(src || '')) return label;
  }
  return '';
}

const STATUS_ORDER = { '계약': 0, '낙찰(계약 미확인)': 1, '1순위(낙찰 미등록)': 2, '개찰완료(낙찰 미등록)': 2, '유찰': 3, '개찰 전': 4, '공고 취소': 5 };
function groupKey(org, name) { return flat(org) + '|' + normName(name); }

// ── 조회 본체
export async function searchAwards({ q, from, to, org }) {
  q = String(q || '').trim();
  org = String(org || '').trim();
  if (!q) return { ok: false, bad: true, error: '사업명 키워드를 넣어 주세요.' };
  const re = /^\d{4}-\d{2}$/;
  if (!re.test(from) || !re.test(to) || from > to) return { ok: false, bad: true, error: '기간을 다시 확인해 주세요.' };
  const t0 = Date.now();
  const sk = 'search|' + [q, from, to, org].join('|');
  const saved = await cacheGet(sk, HOUR);
  if (saved) return { ...saved, cached: true, ms: { total: Date.now() - t0 } };
  const mons = months(from, to);
  const orgOk = (...names) => !org || names.some((n) => flat(n).includes(flat(org)));
  if (mons.length > MAX_MONTHS) return { ok: false, bad: true, error: `기간은 최대 ${MAX_MONTHS}개월까지입니다.` };

  // 계약은 공고 구간 끝에서 넉 달 뒤까지(오늘을 넘지 않게)
  const now = kstNow();
  const nowMonth = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const [ty, tm] = to.split('-').map(Number);
  const tailEnd = new Date(Date.UTC(ty, tm - 1 + CONTRACT_TAIL_MONTHS, 1));
  let cTo = `${tailEnd.getUTCFullYear()}-${pad(tailEnd.getUTCMonth() + 1)}`;
  if (cTo > nowMonth) cTo = nowMonth < to ? to : nowMonth;
  const cMons = months(from, cTo);

  const tasks = [];
  const lists = { bid: [], openg: [], scs: [], cntrct: [] };
  const errors = [];
  let calls = 0;
  const push = (op, mon, params) => tasks.push(async () => {
    const r = await callAll(op, params, listTtl(mon));
    if (r.fetched) calls++;
    if (r.ok) lists[op].push(...r.items); else errors.push(`${op} ${mon.y}-${pad(mon.m)}: ${r.error}`);
  });
  for (const mon of mons) {
    const dt = { inqryDiv: '1', inqryBgnDt: mon.bgn + '0000', inqryEndDt: mon.end + '2359', bidNtceNm: q };
    push('bid', mon, org ? { ...dt, dminsttNm: org } : dt);
    push('openg', mon, dt);
    push('scs', mon, dt);
  }
  const cPush = (term) => { for (const mon of cMons) push('cntrct', mon, { inqryDiv: '1', inqryBgnDate: mon.bgn, inqryEndDate: mon.end, cntrctNm: term }); };
  cPush(q);
  await pool(tasks);
  const tLists = Date.now() - t0;
  // 계약명 조건은 공고명과 달리 띄어쓰기를 가린다(실측: "디지털배움터"로는 강원 "AI디지털 배움터" 계약이 안 나온다).
  // 공고명에 실제로 쓰인 띄어쓰기 변형으로 한 번 더 찾는다(최대 3개)
  const spaced = new RegExp(Array.from(q.replace(/\s+/g, '')).map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'i');
  const variants = new Set();
  for (const x of lists.bid.concat(lists.openg, lists.scs)) {
    const m = String(x.bidNtceNm || '').match(spaced);
    if (m && m[0] !== q) variants.add(m[0].replace(/\s+/g, ' '));
  }
  tasks.length = 0;
  [...variants].slice(0, 3).forEach(cPush);
  if (tasks.length) await pool(tasks);
  // 개찰순위 전체는 여기서 받지 않는다 — 화면이 표를 먼저 띄운 뒤 rankings()로 따로 받는다(조회 시간을 반으로 줄임)
  if (errors.length && !lists.bid.length && !lists.openg.length && !lists.cntrct.length) {
    return { ok: false, error: '나라장터 조회 실패: ' + errors[0] };
  }


  // 공고: (번호, 차수)로 중복 제거. 취소공고가 하나라도 있는 번호는 취소로 본다
  const notices = new Map(); // no → { ... }
  const cancelled = new Set();
  for (const x of lists.bid) {
    if (!orgOk(x.dminsttNm, x.ntceInsttNm)) continue;
    const no = x.bidNtceNo; if (!no) continue;
    if (/취소/.test(x.ntceKindNm || '')) cancelled.add(no);
    const prev = notices.get(no);
    const ord = x.bidNtceOrd || '000';
    if (prev && prev.ord >= ord) continue;
    notices.set(no, {
      no, ord, kind: x.ntceKindNm || '', name: String(x.bidNtceNm || '').replace(/\s+/g, ' ').trim(),
      org: String(x.dminsttNm || x.ntceInsttNm || '').trim(), ntceOrg: x.ntceInsttNm || '',
      budget: num(x.asignBdgtAmt), presmpt: num(x.presmptPrce), postedAt: String(x.bidNtceDt || '').slice(0, 16),
      method: x.sucsfbidMthdNm || '', url: x.bidNtceDtlUrl || x.bidNtceUrl || '',
    });
  }
  // 개찰·낙찰 목록에만 있는 공고(공고 목록 구간 밖에 게시된 것)도 넣는다
  const addFrom = (x) => {
    const no = x.bidNtceNo; if (!no || notices.has(no) || !orgOk(x.dminsttNm, x.ntceInsttNm)) return;
    notices.set(no, { no, ord: x.bidNtceOrd || '000', kind: '', name: String(x.bidNtceNm || '').replace(/\s+/g, ' ').trim(),
      org: String(x.dminsttNm || x.ntceInsttNm || '').trim(), ntceOrg: x.ntceInsttNm || '', budget: 0, presmpt: 0, postedAt: '', method: '', url: '' });
  };
  lists.openg.forEach(addFrom); lists.scs.forEach(addFrom);

  const openings = new Map(); // no → [opening]
  const seenO = new Set();
  for (const x of lists.openg) {
    const k = [x.bidNtceNo, x.bidNtceOrd, x.bidClsfcNo, x.rbidNo].join('|');
    if (seenO.has(k) || !notices.has(x.bidNtceNo)) continue;
    seenO.add(k);
    if (!openings.has(x.bidNtceNo)) openings.set(x.bidNtceNo, []);
    openings.get(x.bidNtceNo).push(openingInfo(x));
  }
  const awards = new Map(); // no → 최종낙찰(가장 늦게 등록된 것)
  for (const x of lists.scs) {
    if (!notices.has(x.bidNtceNo)) continue;
    const a = { no: x.bidNtceNo, ord: x.bidNtceOrd || '000', name: x.bidwinnrNm || '', biz: x.bidwinnrBizno || '', ceo: x.bidwinnrCeoNm || '',
      addr: x.bidwinnrAdrs || '', amount: num(x.sucsfbidAmt), date: x.fnlSucsfDate || '', rgstDt: x.rgstDt || '' };
    const prev = awards.get(a.no);
    if (!prev || prev.rgstDt < a.rgstDt) awards.set(a.no, a);
  }

  // 계약: 같은 계약(앞 13자리)은 가장 늦게 등록된 행만
  const cmap = new Map();
  for (const x of lists.cntrct) {
    const c = contractInfo(x);
    const prev = cmap.get(c.id);
    if (!prev || prev.rgstDt < c.rgstDt) cmap.set(c.id, c);
  }
  const contracts = [...cmap.values()].filter((c) => !org || orgOk(c.inst, c.dminst) || notices.has(c.ntceNo));

  // 사업 묶음
  const groups = new Map();
  for (const n of notices.values()) {
    const key = groupKey(n.org, n.name);
    if (!groups.has(key)) groups.set(key, { key, org: n.org, name: n.name, notices: [] });
    groups.get(key).notices.push(n);
  }

  const used = new Set();
  const out = [];
  for (const g of groups.values()) {
    g.notices.sort((a, b) => (a.postedAt || '').localeCompare(b.postedAt || '') || a.no.localeCompare(b.no));
    for (const n of g.notices) n.cancelled = cancelled.has(n.no);
    const live = g.notices.filter((n) => !n.cancelled);
    const ops = live.flatMap((n) => openings.get(n.no) || []);
    // 대표 개찰: 개찰완료 중 가장 늦은 것 → 없으면 가장 늦은 개찰
    const done = ops.filter((o) => /개찰완료/.test(o.status) && o.count > 0).sort((a, b) => a.at.localeCompare(b.at));
    const opening = done[done.length - 1] || ops.sort((a, b) => a.at.localeCompare(b.at))[ops.length - 1] || null;
    const main = (opening && live.find((n) => n.no === opening.no)) || live[live.length - 1] || g.notices[g.notices.length - 1];
    const award = (opening && awards.get(opening.no)) || live.map((n) => awards.get(n.no)).filter(Boolean).pop() || null;
    // 계약: 공고번호로 → 없으면 같은 기관·같은 사업명(계약명이 공고명 안에 들거나 그 반대)
    const nos = new Set(g.notices.map((n) => n.no));
    let contract = contracts.filter((c) => nos.has(c.ntceNo)).sort((a, b) => a.rgstDt.localeCompare(b.rgstDt)).pop() || null;
    let match = contract ? '공고번호' : '';
    if (!contract) {
      const gn = normName(g.name);
      const cand = contracts.filter((c) => !c.ntceNo && !used.has(c.id)
        && [c.inst, c.dminst].some((i) => flat(i) && (flat(i).includes(flat(g.org)) || flat(g.org).includes(flat(i))))
        && (() => { const cn = normName(c.name); return cn.length >= 6 && (gn.includes(cn) || cn.includes(gn)); })());
      const target = (award && award.amount) || (opening && opening.first && opening.first.amount) || 0;
      cand.sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target));
      if (cand[0]) { contract = cand[0]; match = '계약명·기관'; }
    }
    if (contract) used.add(contract.id);

    const flags = [];
    let status;
    if (!live.length) status = '공고 취소';
    else if (contract) status = '계약';
    else if (award) status = '낙찰(계약 미확인)';
    else if (opening && /개찰완료/.test(opening.status) && opening.first) status = /낙찰자\s*없음/.test(opening.note) ? '1순위(낙찰 미등록)' : '개찰완료(낙찰 미등록)';
    else if (opening && /유찰/.test(opening.status)) status = '유찰';
    else status = '개찰 전';
    if (status === '1순위(낙찰 미등록)' || status === '개찰완료(낙찰 미등록)') flags.push('1순위를 낙찰자로 단정할 수 없음(최종낙찰·계약 미등록)');
    if (opening && opening.count === 1) flags.push('1인 투찰 — 기술점수 없음');
    if (match === '계약명·기관') flags.push('계약에 공고번호가 없어 계약명·기관으로 매칭');
    const bidAmt = (award && award.amount) || (opening && opening.first && opening.first.amount) || 0;
    if (contract && bidAmt && contract.amount && contract.amount !== bidAmt) flags.push('낙찰액과 계약액이 다름');
    if (g.notices.some((n) => n.cancelled)) flags.push('취소된 공고 포함');
    if (ops.filter((o) => /유찰/.test(o.status)).length && status !== '유찰') flags.push('유찰 이력 있음');

    out.push({
      key: g.key, region: region(main.name, main.org), org: main.org, name: main.name,
      no: main.no, ord: (opening && opening.ord) || main.ord, budget: main.budget || Math.max(0, ...g.notices.map((n) => n.budget)),
      notices: g.notices.map(({ no, ord, kind, name, postedAt, budget, cancelled: cx }) => ({ no, ord, kind, name, postedAt, budget, cancelled: cx })),
      openings: ops, opening, award, contract, match, status, flags, ranking: null,
    });
  }

  // 정렬: 계약·낙찰된 큰 사업 먼저(예산 큰 순), 그다음 나머지
  out.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (b.budget - a.budget));

  const related = contracts.filter((c) => !used.has(c.id)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const result = {
    ok: true, q, from, to, org, contractTo: cTo, groups: out, related,
    partial: errors.length ? errors.slice(0, 5) : null,
    counts: { notices: notices.size, openings: seenO.size, awards: awards.size, contracts: contracts.length },
  };
  // 같은 조건은 한 시간 동안 결과째 다시 쓴다(일부 구간이 실패했으면 남기지 않음)
  if (!errors.length) PENDING.push(cachePut(sk, result));
  await flushCache();
  return { ...result, calls, ms: { lists: tLists, total: Date.now() - t0 } };
}

// 개찰순위 전체 여러 건(화면이 표를 띄운 뒤 부른다). pairs: [[공고번호, 차수], …]
export async function rankings(pairs) {
  const out = {};
  await pool(pairs.slice(0, RANK_LIMIT).map(([no, ord]) => async () => { out[no + '-' + ord] = await ranking(no, ord); }));
  await flushCache();
  return { ok: true, rankings: out };
}

// 공고 하나의 개찰순위 전체. 개찰완료는 바뀌지 않으므로 오래(7일) 둔다
export async function ranking(no, ord) {
  if (!/^[A-Z0-9]{8,20}$/i.test(String(no || ''))) return { ok: false, error: '공고번호 형식이 아닙니다.' };
  ord = /^\d{3}$/.test(String(ord || '')) ? ord : '000';
  const r = await callAll('rank', { bidNtceNo: no, bidNtceOrd: ord }, 7 * 24 * HOUR);
  if (!r.ok) return { ok: false, error: r.error };
  const seen = new Set();
  const rows = [];
  for (const x of r.items) {
    const row = rankRow(x);
    const k = [row.clsfc, row.rank, row.biz].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(row);
  }
  rows.sort((a, b) => (a.rank == null) - (b.rank == null) || (a.rank || 0) - (b.rank || 0));
  return { ok: true, no, ord, rows };
}

// ── 작년 같은 사업(공고 검색 화면의 공고 카드). 공고명 핵심어 + 수요기관으로 지난 12개월 공고를 찾아
// 이름이 가장 비슷한 사업의 낙찰·계약을 붙인다.
// 수요기관만으로 1년치를 받으면 너무 느리다(실측 2026-10-30: 서울특별시교육청 한 달 60초 넘어 끊김) → 공고명 조건을 꼭 넣는다.
// 수요기관 조건은 넣지 않는다: 디지털배움터처럼 작년엔 중앙 기관(한국지능정보사회진흥원)이 시도별로, 올해는 시도가 직접 낸 사업이 있다
// → 같은 수요기관이거나, 다른 기관이 공고명에 이 공고의 시도를 적어 낸 것(시도별로 나눠 낸 중앙 사업)이면 같은 사업 후보로 본다.
//   공고명에 시도가 없는 다른 기관 공고(같은 서울의 다른 학교 수학여행 등)는 같은 사업이 아니다
const PREV_GENERIC = /^(교육|운영|용역|사업|위탁|및|지원|관리|추진|수행|대행|구축|개발|프로그램|과정|협상|긴급|재공고|일반|제한|등|관련|계약|위탁운영|운영용역|교육운영|위탁용역|기관|선정|모집|입찰|공고|입찰공고|학교|고등학교|중학교|초등학교|대학교|대학|유치원|산학협력단|공사|설계|실시설계|보수공사)$/;
// 핵심어 하나로 한 달 200건이 넘으면 너무 흔한 말이다 — 더 받지 않는다.
// 이 조회(입찰공고 검색조건 조회)는 공고 찾기 키워드 검색과 일일 호출 한도를 같이 쓴다(2026-10-30 한도 초과). 3쪽 → 2쪽
const PREV_PAGES = 2;
const PREV_REGION = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청북|충청남|전라북|전라남|경상북|경상남)(특별시|광역시|특별자치시|특별자치도|도|시)?$/;
// 연도·기수를 뺀 사업명 뼈대(같은 사업의 해마다 바뀌는 부분을 지운다)
// 시도 이름도 지운다 — 작년엔 중앙 기관이 "2025년 세종특별자치시 디지털배움터"로, 올해는 세종시가 "2026년 AI디지털배움터"로 낸 경우
const REGION_WORD = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충청남|충북|충남|전라북|전라남|전북|전남|경상북|경상남|경북|경남|제주)(특별자치시|특별자치도|특별시|광역시|도)?/g;
// 공고명에 시도를 낱말로 적었을 때만(서울영상고등학교의 "서울"은 아니다)
const REGION_TOKEN = /(?:^|[\s(\[·,_])(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청북|충청남|전라북|전라남|경상북|경상남)(?:특별자치시|특별자치도|특별시|광역시|도|시)?(?=[\s)\],·_]|$)/;
function nameRegion(s) { const m = String(s || '').match(REGION_TOKEN); return m ? region(m[1], '') : ''; }
function coreName(s) {
  return normName(String(s || '').replace(/(19|20)\d{2}\s*(년도|학년도|년)?|['’]\d{2}\s*년?|제?\s*\d+\s*(기|차|회)(?![가-힣])/g, ' ').replace(REGION_WORD, ' '))
    .replace(/^[0-9a-z]+(?=[가-힣])/, '').replace(/(입찰공고|계약공고|공고)$/, '').replace(/(위탁)?용역$/, '');
}
function bigrams(s) { const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out; }
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return a === b ? 1 : 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
}
export function prevKeywords(name, org) {
  const s = String(name || '').replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, ' ').replace(/_[^_\s]*$/, ' ')
    .replace(/(19|20)\d{2}\s*(년도|학년도|년)?|['’]\d{2}\s*년?|제?\s*\d+\s*(기|차|회|학기|학년|권역)/g, ' ');
  const o = flat(org);
  const out = [];
  for (let t of s.split(/[\s·ㆍ‧・,/「」『』"“”]+/)) {
    t = t.replace(/[^0-9A-Za-z가-힣]/g, '');
    // "AI디지털배움터"처럼 앞에 붙은 영문은 떼어 찾는다 — 작년 이름이 "디지털배움터"였을 수 있다
    const h = t.replace(/^[0-9A-Za-z]+(?=[가-힣]{3,})/, '');
    if (h.length < 2 || PREV_GENERIC.test(h) || PREV_REGION.test(h) || (o && o.includes(flat(h)))) continue;
    if (!out.includes(h)) out.push(h);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, 2);
}
function monthAdd(y, m, d) { const t = new Date(Date.UTC(y, m - 1 + d, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; }

export async function prevAwards({ no, name, org, at }) {
  name = String(name || '').trim(); org = String(org || '').trim(); no = String(no || '').trim();
  if (!name || !org) return { ok: false, bad: true, error: '공고명과 수요기관이 필요합니다.' };
  const t0 = Date.now();
  // 기준 달: 공고 게시일(없으면 이번 달). 그 앞 12개월을 본다
  const m = String(at || '').match(/^(\d{4})-?(\d{2})/);
  const now = kstNow();
  const [by, bm] = m ? [Number(m[1]), Number(m[2])] : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const from = monthAdd(by, bm, -12), to = monthAdd(by, bm, -1);
  const keywords = prevKeywords(name, org);
  const base = { ok: true, from, to, keywords, items: [] };
  if (!keywords.length) return { ...base, reason: '공고명에서 찾을 말을 뽑지 못했습니다.' };
  const sk = 'prev6|' + [no, name, org, from].join('|');
  const saved = await cacheGet(sk, HOUR);
  if (saved) return { ...saved, cached: true };

  // 1) 후보 공고: 핵심어로 12개월 입찰공고. 첫 핵심어로 비슷한 사업이 나오면 두 번째 핵심어는 부르지 않는다
  //    (핵심어 2개 × 12개월 × 3쪽을 한꺼번에 부르던 것이 공고 하나에 최대 72번 — 일일 한도를 금방 채웠다)
  const myRegion = region(name, org);
  const found = new Map(); // no → { notice, kw }
  const errors = [];
  const fetchKw = (kw) => pool(months(from, to).map((mon) => async () => {
    const r = await callAll('bid', { inqryDiv: '1', inqryBgnDt: mon.bgn + '0000', inqryEndDt: mon.end + '2359', bidNtceNm: kw }, listTtl(mon), PREV_PAGES);
    if (!r.ok) { errors.push(r.error); return; }
    for (const x of r.items) {
      if (!x.bidNtceNo || x.bidNtceNo === no || /취소/.test(x.ntceKindNm || '')) continue;
      const o2 = x.dminsttNm || x.ntceInsttNm || '';
      const sameOrg = flat(o2).includes(flat(org)) || flat(org).includes(flat(o2));
      if (!sameOrg && !(myRegion && nameRegion(x.bidNtceNm) === myRegion)) continue;
      const prev = found.get(x.bidNtceNo);
      if (!prev || (prev.x.bidNtceOrd || '') < (x.bidNtceOrd || '')) found.set(x.bidNtceNo, { x, kw });
    }
  }));

  // 2) 이름이 비슷한 사업끼리 묶어 점수순. 같은 이름(연도 포함)으로 반년 안에 낸 공고는 올해 재공고로 보고 뺀다
  const myCore = coreName(name), myNorm = normName(name);
  const groups = new Map();
  const group = () => { groups.clear(); for (const { x, kw } of found.values()) {
    const nm = String(x.bidNtceNm || '').replace(/\s+/g, ' ').trim();
    const posted = String(x.bidNtceDt || '').slice(0, 10);
    if (normName(nm) === myNorm && m && posted >= monthAdd(by, bm, -6)) continue;
    const sim = similarity(myCore, coreName(nm));
    const o2 = x.dminsttNm || x.ntceInsttNm || '';
    const sameOrg = flat(o2).includes(flat(org)) || flat(org).includes(flat(o2));
    if (sim < (sameOrg ? 0.6 : 0.7)) continue;
    // "2026년도 …"와 "2026년 …"처럼 연도 표기만 다른 공고는 한 사업으로. 한 기관이 시도별로 낸 공고는 시도마다 따로
    const key = flat(o2) + '|' + coreName(nm) + '|' + nameRegion(nm);
    const g = groups.get(key) || { key, name: nm, org: o2, sameOrg, sim, kw, months: new Set(), posted };
    g.months.add(posted.slice(0, 7));
    if (posted > g.posted) { g.posted = posted; g.name = nm; }
    groups.set(key, g);
  } };
  let usedKw = 0;
  for (const kw of keywords) {
    await fetchKw(kw); usedKw++;
    group();
    if (groups.size || errors.some((e) => e === QUOTA_MSG)) break;
  }
  if (!found.size && errors.length) return { ok: false, error: '나라장터 조회 실패: ' + errors[0] };
  // 같은 기관을 조금 앞에 둔다
  const score = (g) => g.sim + (g.sameOrg ? 0.1 : 0);
  const picked = [...groups.values()].sort((a, b) => score(b) - score(a) || b.posted.localeCompare(a.posted)).slice(0, 3);

  // 3) 고른 사업마다 그 공고 달만 수주 현황으로 다시 묶는다(개찰·최종낙찰·계약까지) + 개찰순위 전체
  const items = await Promise.all(picked.map(async (g) => {
    const ms = [...g.months].sort();
    const r = await searchAwards({ q: g.kw, from: ms[0], to: ms[ms.length - 1], org: g.org });
    // 수주 현황 묶음 중 같은 기관·같은 뼈대 이름, 여럿이면 계약에 가까운 것
    const hit = r.ok && r.groups.filter((x) => flat(x.org) + '|' + coreName(x.name) + '|' + nameRegion(x.name) === g.key).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])[0];
    if (!hit) return { kw: g.kw, months: ms, name: g.name, org: g.org, sameOrg: g.sameOrg, sim: Math.round(g.sim * 100) / 100, same: coreName(g.name) === myCore, posted: g.posted, status: '확인 못 함' };
    let rank = null;
    if (hit.opening && hit.opening.count) {
      const rr = await ranking(hit.opening.no, hit.opening.ord);
      if (rr.ok) {
        const valid = rr.rows.filter((x) => x.rank != null);
        const top = valid[0];
        rank = { count: valid.length, top: top ? { name: top.name, amount: top.amount, tech: top.tech, price: top.price, total: top.total } : null };
      }
    }
    return {
      kw: g.kw, months: ms, name: hit.name, org: hit.org, sameOrg: g.sameOrg, sim: Math.round(g.sim * 100) / 100, same: coreName(hit.name) === myCore, posted: g.posted,
      no: hit.no, ord: hit.ord, budget: hit.budget, status: hit.status, match: hit.match,
      // 협상 공고는 혼자 들어와도 기술평가를 한다 — 점수가 있으면 "기술점수 없음"을 떼어 낸다
      flags: hit.flags.map((f) => (/^1인 투찰/.test(f) && rank && rank.top && rank.top.tech ? '1인 투찰' : f)),
      opening: hit.opening ? { at: hit.opening.at, count: hit.opening.count, first: hit.opening.first } : null,
      award: hit.award ? { name: hit.award.name, amount: hit.award.amount, date: hit.award.date } : null,
      contract: hit.contract ? { amount: hit.contract.amount, date: hit.contract.date, corps: hit.contract.corps.map(({ role, name: n, share }) => ({ role, name: n, share })) } : null,
      rank,
    };
  }));
  const result = { ...base, keywords: keywords.slice(0, usedKw), items };   // 실제로 부른 핵심어만
  if (!errors.length) PENDING.push(cachePut(sk, result));
  await flushCache();
  return { ...result, ms: Date.now() - t0 };
}

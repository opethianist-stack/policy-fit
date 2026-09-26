// 산하기관 공고 게시판 vs 나라장터 중복 조사(일회성). GitHub Actions에서 돌린다(클라우드 작업 환경은 기관 사이트가 막힘).
// 게시판 목록 첫 쪽들에서 제목·날짜를 뽑고, 같은 기간 나라장터 입찰공고(용역·물품, 공고기관·수요기관 기준)와 제목을 대조한다.
// 결과는 표준 출력과 $GITHUB_STEP_SUMMARY 에 쓴다. 필요: DATA_GO_KR_KEY
import fs from 'node:fs';

const DAYS = 60;
const AG = [
  { id: 'NIPA', name: '정보통신산업진흥원', boards: [['입찰', 'https://www.nipa.kr/home/2-3'], ['사업공고', 'https://www.nipa.kr/home/2-2'], ['공지', 'https://www.nipa.kr/home/2-1']] },
  { id: 'NIA', name: '한국지능정보사회진흥원', boards: [['입찰', 'https://www.nia.or.kr/site/nia_kor/ex/bbs/List.do?cbIdx=78336'], ['공지', 'https://www.nia.or.kr/site/nia_kor/ex/bbs/List.do?cbIdx=99835']] },
  { id: 'KERIS', name: '한국교육학술정보원', boards: [['입찰', 'https://www.keris.or.kr/main/tender/view/selectTenderList.do?mi=1076'], ['공지', 'https://www.keris.or.kr/main/na/ntt/selectNttList.do?mi=1051&bbsId=1088']] },
  { id: 'KOSAC', name: '한국과학창의재단', boards: [['입찰', 'https://www.kosac.re.kr/menus/275/boards/403/posts'], ['사업공고', 'https://www.kosac.re.kr/menus/274/bns'], ['공지', 'https://www.kosac.re.kr/menus/270/boards/386/posts']] },
  { id: 'KEDI', name: '한국교육개발원', boards: [['입찰', 'https://www.kedi.re.kr/khome/mobile2/announce/listBidAnnounceForm.do'], ['공지', 'https://www.kedi.re.kr/khome/mobile2/announce/listNoticeAnnounceForm.do']] },
];
const PAGE_PARAM = { NIPA: 'curPage', NIA: 'pageIndex', KERIS: 'pageIndex', KOSAC: 'page', KEDI: 'pageIndex' };

const out = [];
const log = (s = '') => { console.log(s); out.push(s); };
const today = new Date();
const since = new Date(today.getTime() - DAYS * 864e5);
const ymd = (d) => d.toISOString().slice(0, 10);

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const DATE = /(20\d\d)[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/;

// 목록 한 줄(tr·li)마다 날짜 하나 + 가장 긴 링크 글자(없으면 가장 긴 칸 글자)를 제목으로
function parseRows(html) {
  const rows = [];
  for (const chunk of html.split(/<\/tr>|<\/li>/i)) {
    const t = text(chunk);
    const m = t.match(DATE);
    if (!m) continue;
    const anchors = [...chunk.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((a) => text(a[1])).filter((x) => x.length >= 6);
    const cells = [...chunk.matchAll(/<(?:td|strong|p|span|div)\b[^>]*>([\s\S]*?)<\/(?:td|strong|p|span|div)>/gi)].map((a) => text(a[1])).filter((x) => x.length >= 8 && !DATE.test(x));
    const title = (anchors.sort((a, b) => b.length - a.length)[0] || cells.sort((a, b) => b.length - a.length)[0] || '').replace(/\s*(새글|NEW|new|첨부파일)\s*$/g, '').trim();
    if (!title || title.length < 6 || title.length > 200) continue;
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    rows.push({ title, date });
  }
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.title) ? false : seen.add(r.title)));
}

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (policy-fit overlap probe)' }, signal: AbortSignal.timeout(25000) });
  return { status: r.status, html: await r.text() };
}

async function board(ag, kind, url) {
  const rows = []; const notes = [];
  for (let p = 1; p <= 4; p++) {
    const u = p === 1 ? url : url + (url.includes('?') ? '&' : '?') + PAGE_PARAM[ag.id] + '=' + p;
    let r;
    try { r = await get(u); } catch (e) { notes.push(`p${p} 오류 ${e.message}`); break; }
    if (r.status !== 200) { notes.push(`p${p} HTTP ${r.status}`); break; }
    const got = parseRows(r.html).filter((x) => !rows.some((y) => y.title === x.title));
    if (p === 1 && !got.length) {
      const i = r.html.search(DATE);
      notes.push('목록을 못 읽음. 날짜 주변 HTML: ' + (i < 0 ? '(날짜 없음) ' + text(r.html).slice(0, 300) : r.html.slice(Math.max(0, i - 700), i + 200).replace(/\s+/g, ' ')));
    }
    if (!got.length) break;
    rows.push(...got);
    if (got.every((x) => x.date < ymd(since))) break;
  }
  return { kind, url, rows: rows.filter((x) => x.date >= ymd(since)), all: rows.length, notes };
}

// 나라장터: 용역·물품, 공고기관·수요기관 이름으로. 게시일시 구간은 30일 단위
const KEY = decodeURIComponent(process.env.DATA_GO_KR_KEY || '');
const OPS = { 용역: 'getBidPblancListInfoServcPPSSrch', 물품: 'getBidPblancListInfoThngPPSSrch' };
const st = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
async function nara(name) {
  const items = [];
  for (const [kind, op] of Object.entries(OPS)) {
    for (let e = today; e > since; e = new Date(e.getTime() - 30 * 864e5)) {
      const b = new Date(Math.max(since.getTime(), e.getTime() - 30 * 864e5));
      for (const field of ['ntceInsttNm', 'dminsttNm']) {
        const q = new URLSearchParams({ ServiceKey: KEY, type: 'json', inqryDiv: '1', numOfRows: '200', pageNo: '1', inqryBgnDt: st(b) + '0000', inqryEndDt: st(e) + '2359', [field]: name });
        const j = await (await fetch(`https://apis.data.go.kr/1230000/ad/BidPublicInfoService/${op}?${q}`, { signal: AbortSignal.timeout(30000) })).json().catch(() => null);
        for (const x of (j && j.response && j.response.body && j.response.body.items) || []) {
          if (!items.some((y) => y.no === x.bidNtceNo)) items.push({ no: x.bidNtceNo, title: String(x.bidNtceNm || '').trim(), date: String(x.bidNtceDt || '').slice(0, 10), kind, org: x.ntceInsttNm, dem: x.dminsttNm });
        }
      }
    }
  }
  return items;
}

const norm = (s) => s.replace(/\[[^\]]*\]|\([^)]*(재공고|긴급|정정|변경)[^)]*\)|재공고|긴급|정정공고|입찰공고|공고|알림|안내/g, '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
function sim(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const A = grams(a), B = grams(b); let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
const KIND_OF = (t) => /입찰|용역|구매|임차|제안서|제안요청|계약|협상에 의한/.test(t) ? '조달' : /모집|공모|선발|신청|참가|접수|지원사업|참여기관|수요조사/.test(t) ? '사업 모집' : '기타';

log(`# 산하기관 게시판 vs 나라장터 (최근 ${DAYS}일, ${ymd(since)} ~ ${ymd(today)})`);
const summary = [];
for (const ag of AG) {
  const n = await nara(ag.name);
  log(`\n## ${ag.id} ${ag.name} — 나라장터 ${n.length}건(용역·물품, 공고기관 또는 수요기관)`);
  for (const [kind, url] of ag.boards) {
    const b = await board(ag, kind, url);
    b.notes.forEach((x) => log(`- (${kind}) ${x.slice(0, 900)}`));
    let matched = 0; const miss = [];
    for (const r of b.rows) {
      const best = n.map((x) => ({ x, s: sim(r.title, x.title) })).sort((p, q) => q.s - p.s)[0];
      const hit = best && best.s >= 0.6;
      if (hit) matched++; else miss.push(r);
      r.best = best; r.hit = hit;
    }
    const byKind = {};
    for (const r of miss) byKind[KIND_OF(r.title)] = (byKind[KIND_OF(r.title)] || 0) + 1;
    log(`### ${kind} 게시판: 기간 내 ${b.rows.length}건(읽은 글 ${b.all}) · 나라장터와 일치 ${matched} · 게시판에만 ${miss.length} ${JSON.stringify(byKind)}`);
    for (const r of b.rows) log(`- ${r.hit ? '✅' : '⬜'} ${r.date} ${r.title.slice(0, 70)}${r.best ? `  ↔ ${r.best.s.toFixed(2)} ${r.best.x.no} ${r.best.x.title.slice(0, 50)}` : ''}${r.hit ? '' : ' [' + KIND_OF(r.title) + ']'}`);
    summary.push({ ag: ag.id, kind, n: b.rows.length, matched, only: miss.length, byKind });
  }
  const boardTitles = ag.boards.length;
  void boardTitles;
}
log('\n## 요약');
log('| 기관 | 게시판 | 기간 내 글 | 나라장터와 일치 | 게시판에만 | 게시판에만(분류) |');
log('|---|---|---|---|---|---|');
for (const s of summary) log(`| ${s.ag} | ${s.kind} | ${s.n} | ${s.matched} | ${s.only} | ${Object.entries(s.byKind).map(([k, v]) => k + ' ' + v).join(', ')} |`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');

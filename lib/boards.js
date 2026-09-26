// 산하기관 공고 게시판. 나라장터에 올라오지 않는 사업 공모·모집이 여기에만 있다(2026-09-26 조사, docs/handoff-from-harvest.md).
//   kosac  한국과학창의재단 사업공고 — 운영기관·수행기관 공모. 최근 60일 11건 모두 나라장터에 없음
//   nipa   정보통신산업진흥원 사업공고 — 기업 지원 모집 위주, 용역 입찰이 가끔 섞인다
//   keris  한국교육학술정보원 공지사항 — 선도교사 연수 같은 사업 모집이 공지로만 올라온다(채용·점검 같은 공지는 뺀다)
// NIA는 입찰을 거의 모두 나라장터(조달청)로 올려 넣지 않는다. 게시판 주소·첨부 호스트는 이 파일에 고정한다(임의 주소를 부르지 않게).
const TTL = 30 * 60 * 1000;
const CACHE = new Map();
const UA = { 'user-agent': 'Mozilla/5.0 (policy-fit)', 'accept-language': 'ko' };

const decode = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/tr>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n[\s\n]*/g, '\n').trim();
const line = (s) => decode(s).replace(/\s+/g, ' ').trim();
const ymd = (s) => { const m = String(s || '').match(/(20\d\d)[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const readable = (name) => /\.(hwpx?|pdf|docx|odt)$/i.test(name);
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 날짜
// 접수 기간으로 상태를 정한다(게시판이 상태를 따로 주지 않을 때)
const statusOf = (from, to) => !to ? '' : to < today() ? '접수마감' : from && from > today() ? '접수예정' : '접수중';

async function get(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/* ---------- 한국과학창의재단 사업공고: 표(등록일·공고번호 2026-P094·제목·접수기간·상태), 첨부는 pmsnew.kosac.re.kr 토큰 주소 ---------- */
const KOSAC = 'https://www.kosac.re.kr/menus/274/bns';
function kosacRows(html) {
  const body = html.split(/<tbody>/i)[1] || '';
  const out = [];
  for (const tr of body.split(/<\/tr>/i)) {
    const tit = tr.match(/<div class="tit">\s*<a href="([^"]*\/bns\/(PBANC_\d+)[^"]*)">([\s\S]*?)<\/a>/);
    if (!tit) continue;
    const info = tr.match(/<div class="info">\s*<span>([^<]*)<\/span>\s*<span>([^<]*)<\/span>/);
    const period = line((tr.match(/<p class="period">([\s\S]*?)<\/p>/) || [])[1]).match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    out.push({
      id: tit[2], no: info ? line(info[2]) : '', postedAt: info ? ymd(info[1]) : '', title: line(tit[3]),
      from: period ? period[1] : '', to: period ? period[2] : '',
      status: line((tr.match(/<em class="receipt[^"]*">([\s\S]*?)<\/em>/) || [])[1]),
      url: `${KOSAC}/${tit[2]}`,
    });
  }
  return out;
}
function kosacFiles(html) {
  const files = [];
  const re = /<span class="fileBr">[\s\S]*?<span>([^<]+)<\/span>\s*<\/span>[\s\S]*?href="(https:\/\/pmsnew\.kosac\.re\.kr\/common\/file\/download\.do\?token=[^"]+)"/g;
  for (const m of html.matchAll(re)) { const name = line(m[1]); files.push({ name, url: m[2].replace(/&amp;/g, '&'), readable: readable(name) }); }
  return files;
}

/* ---------- 정보통신산업진흥원 사업공고: 표(번호·D-day/종료·제목·사업명·신청기간·작성일), 첨부는 /comm/getFile ---------- */
const NIPA = 'https://www.nipa.kr/home/2-2';
function nipaRows(html) {
  const body = (html.split(/<tbody>/i)[1] || '').split(/<\/tbody>/i)[0];
  const out = [];
  for (const tr of body.split(/<\/tr>/i)) {
    const a = tr.match(/<a href="\/home\/2-2\/(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const period = line((tr.match(/신청기간\s*:([\s\S]*?)<\/span>/) || [])[1]).match(/(\d{4}-\d{2}-\d{2})[^~]*~\s*(\d{4}-\d{2}-\d{2})/);
    const dates = [...tr.matchAll(/<span class="bco">\s*(20\d\d-\d\d-\d\d)\s*<\/span>/g)];
    const from = period ? period[1] : '', to = period ? period[2] : '';
    out.push({
      id: a[1], no: '', postedAt: dates.length ? dates[dates.length - 1][1] : '', title: line(a[2]),
      biz: line((tr.match(/<span class="box[^"]*">([\s\S]*?)<\/span>/) || [])[1]),
      from, to, status: /종료/.test(line((tr.match(/<div class="point[^"]*">([\s\S]*?)<\/div>/) || [])[1])) ? '접수마감' : statusOf(from, to),
      url: `${NIPA}/${a[1]}`,
    });
  }
  return out;
}
function nipaFiles(html) {
  const files = [];
  for (const m of html.matchAll(/<a href="(\/comm\/getFile\?[^"]+)"[^>]*>([\s\S]*?)(?:\(파일크기|<\/a>)/g)) {
    const name = line(m[2]).replace(/^\d+\.\s*/, '');
    files.push({ name, url: 'https://www.nipa.kr' + m[1].replace(/&amp;/g, '&'), readable: readable(name) });
  }
  return files;
}
const nipaBody = (html) => decode((html.match(/<td class="tc bg_lightgray">\s*내용\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/) || [])[1]);

/* ---------- 한국교육학술정보원 공지사항: 표(번호·구분·제목 nttView('글번호')·등록일), 첨부는 /common/nttFileDownload.do ---------- */
const KERIS = 'https://www.keris.or.kr/main/na/ntt';
const kerisView = (id) => `${KERIS}/selectNttInfo.do?mi=1051&nttSn=${id}&bbsId=1088`;
// 사업 모집이 아닌 공지(채용·시험·점검·사칭·결과 발표 등)는 뺀다
const KERIS_NOISE = /채용|공익제보|시험|점검|사칭|합격|휴무|개인정보|청렴|윤리|이전\s*안내|(선정|심사|평가)?\s*결과\s*(안내|발표|공고|공개)|논문|학술대회|콘퍼런스|컨퍼런스|세미나|포럼\s*개최/;
function kerisRows(html) {
  const body = (html.split(/<tbody>/i)[1] || '').split(/<\/tbody>/i)[0];
  const out = [];
  for (const tr of body.split(/<\/tr>/i)) {
    const a = tr.match(/nttView\('(\d+)'\)"?[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const title = line(a[2]);
    if (KERIS_NOISE.test(title)) continue;
    // 제목 끝의 "(~5/8)"·"(9/28~10/19)"에서 마감일을 읽는다(연도는 등록일 기준)
    const postedAt = ymd((tr.match(/<td class="date">([\s\S]*?)<\/td>/) || [])[1]);
    const par = (title.match(/\(([^()]*~[^()]*)\)[^()]*$/) || [])[1] || '';
    const [before, after] = par.split('~');
    const md = (s) => { const d = String(s || '').match(/(\d{1,2})\s*[/.]\s*(\d{1,2})/); return d ? `${postedAt.slice(0, 4)}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}` : ''; };
    const from = md(before), to = md(after);
    out.push({ id: a[1], no: '', postedAt, title, from, to, status: statusOf(from, to), url: kerisView(a[1]) });
  }
  return out;
}
function kerisFiles(html) {
  const files = [];
  for (const m of html.matchAll(/<a href="(\/common\/nttFileDownload\.do\?fileKey=[0-9a-f]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const name = line(m[2].replace(/<strong[\s\S]*?<\/strong>/g, ''));
    files.push({ name, url: 'https://www.keris.or.kr' + m[1], readable: readable(name) });
  }
  return files;
}
const kerisBody = (html) => decode((html.match(/<div class="view_cont">([\s\S]*?)<!--\s*\/\/\s*내용\s*-->/) || [])[1]);

export const BOARDS = {
  kosac: { org: '한국과학창의재단', board: '사업공고', pages: 3, list: (p) => (p === 1 ? KOSAC : `${KOSAC}?page=${p}`), rows: kosacRows,
    idRe: /^PBANC_\d{1,20}$/, view: (id) => `${KOSAC}/${id}`, files: kosacFiles, body: () => '' },
  nipa: { org: '정보통신산업진흥원', board: '사업공고', pages: 3, list: (p) => (p === 1 ? NIPA : `${NIPA}?curPage=${p}`), rows: nipaRows,
    idRe: /^\d{1,10}$/, view: (id) => `${NIPA}/${id}`, files: nipaFiles, body: nipaBody },
  keris: { org: '한국교육학술정보원', board: '공지사항', pages: 4, list: (p) => `${KERIS}/selectNttList.do?mi=1051&bbsId=1088&currPage=${p}`, rows: kerisRows,
    idRe: /^\d{1,10}$/, view: kerisView, files: kerisFiles, body: kerisBody },
};

// 한 게시판의 최근 글. 30분 캐시. 첫 쪽을 못 읽으면 실패, 뒤쪽 실패는 읽은 만큼만
async function boardList(src) {
  const B = BOARDS[src];
  const hit = CACHE.get('list:' + src);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const items = [];
  try {
    for (let p = 1; p <= B.pages; p++) {
      const got = B.rows(await get(B.list(p)));
      if (!got.length) { if (p === 1) return { ok: false, src, error: `${B.org} ${B.board} 목록을 읽지 못했습니다(게시판 구조가 바뀌었을 수 있습니다).` }; break; }
      for (const x of got) if (!items.some((y) => y.id === x.id)) items.push({ src, org: B.org, board: B.board, ...x });
    }
  } catch (e) {
    if (!items.length) return { ok: false, src, error: `${B.org} ${B.board}에 연결하지 못했습니다(${e.message}).` };
  }
  const data = { ok: true, src, items };
  CACHE.set('list:' + src, { at: Date.now(), data });
  return data;
}

// 모든 게시판을 함께 부른다. 한 곳이 실패해도 나머지는 돌려주고 실패한 곳은 failed 에 적는다
export async function allBoards() {
  const rs = await Promise.all(Object.keys(BOARDS).map(boardList));
  return { items: rs.flatMap((r) => (r.ok ? r.items : [])), failed: rs.filter((r) => !r.ok).map((r) => ({ src: r.src, org: BOARDS[r.src].org, error: r.error })) };
}

// 상세: 첨부(이름·주소·본문 읽기 가능 여부) + 본문 글(첨부가 없을 때 검색어 재료, 2만 자까지)
export async function boardDetail(src, id) {
  const B = BOARDS[src];
  if (!B) return { ok: false, error: '알 수 없는 게시판입니다.' };
  if (!B.idRe.test(String(id || ''))) return { ok: false, error: '공고 번호 형식이 아닙니다.' };
  const key = `${src}:${id}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const html = await get(B.view(id));
    const data = { ok: true, src, id, url: B.view(id), files: B.files(html), text: B.body(html).slice(0, 20000) };
    CACHE.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    return { ok: false, error: `공고 상세를 열지 못했습니다(${e.message}).` };
  }
}

const flat = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
// 검색어(쉼표로 여러 개)가 제목(NIPA는 사업명까지)에 든 것. open: 접수중·접수예정만
export function matchBoards(items, { terms = [], open = false, limit = 30 } = {}) {
  const ts = terms.map(flat).filter(Boolean);
  return items
    .filter((x) => !open || !/마감/.test(x.status))
    .map((x) => ({ ...x, hits: ts.filter((t) => flat(x.title + ' ' + (x.biz || '')).includes(t)).length }))
    .filter((x) => !ts.length || x.hits)
    .sort((a, b) => b.hits - a.hits || String(b.postedAt).localeCompare(String(a.postedAt)))
    .slice(0, limit);
}

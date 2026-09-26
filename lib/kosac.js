// 한국과학창의재단(KOSAC) 사업공고 게시판. 나라장터에 올라오지 않는 운영기관·수행기관 공모가 여기에만 있다
// (2026-09-26 조사: 최근 60일 11건 모두 나라장터에 없음, docs/handoff-from-harvest.md).
// 목록은 서버가 그린 HTML 표(한 쪽 10건): 등록일·공고번호(2026-P094)·제목·접수기간·상태(접수중/접수마감/접수예정).
// 상세 페이지 첨부는 pmsnew.kosac.re.kr 의 토큰 주소(공고문·제안요청서 hwp/hwpx/pdf). 주소는 이 파일에 고정한다(임의 주소를 부르지 않게).
const HOST = 'https://www.kosac.re.kr';
const LIST = HOST + '/menus/274/bns';
const TTL = 30 * 60 * 1000;
const CACHE = new Map();
const UA = { 'user-agent': 'Mozilla/5.0 (policy-fit)', 'accept-language': 'ko' };

const decode = (s) => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();

async function get(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export function parseList(html) {
  const body = html.split(/<tbody>/i)[1] || '';
  const out = [];
  for (const tr of body.split(/<\/tr>/i)) {
    const tit = tr.match(/<div class="tit">\s*<a href="([^"]*\/bns\/(PBANC_\d+)[^"]*)">([\s\S]*?)<\/a>/);
    if (!tit) continue;
    const info = tr.match(/<div class="info">\s*<span>([^<]*)<\/span>\s*<span>([^<]*)<\/span>/);
    const period = decode((tr.match(/<p class="period">([\s\S]*?)<\/p>/) || [])[1]).match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    out.push({
      id: tit[2],
      no: info ? decode(info[2]) : '',
      postedAt: info ? decode(info[1]) : '',
      title: decode(tit[3]),
      from: period ? period[1] : '',
      to: period ? period[2] : '',
      status: decode((tr.match(/<em class="receipt[^"]*">([\s\S]*?)<\/em>/) || [])[1]),
      url: `${LIST}/${tit[2]}`,
    });
  }
  return out;
}

export function parseFiles(html) {
  const files = [];
  const re = /<span class="fileBr">[\s\S]*?<span>([^<]+)<\/span>\s*<\/span>[\s\S]*?href="(https:\/\/pmsnew\.kosac\.re\.kr\/common\/file\/download\.do\?token=[^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const name = decode(m[1]);
    files.push({ name, url: m[2].replace(/&amp;/g, '&'), readable: /\.(hwpx?|pdf|docx|odt)$/i.test(name) });
  }
  return files;
}

// 최근 공고 목록(기본 3쪽 = 30건). 30분 캐시
export async function kosacList(pages = 3) {
  const hit = CACHE.get('list');
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const items = [];
  try {
    for (let p = 1; p <= pages; p++) {
      const got = parseList(await get(p === 1 ? LIST : `${LIST}?page=${p}`));
      if (!got.length) { if (p === 1) return { ok: false, error: '사업공고 목록을 읽지 못했습니다(게시판 구조가 바뀌었을 수 있습니다).' }; break; }
      for (const x of got) if (!items.some((y) => y.id === x.id)) items.push(x);
    }
  } catch (e) {
    if (!items.length) return { ok: false, error: `한국과학창의재단 사업공고에 연결하지 못했습니다(${e.message}).` };
  }
  const data = { ok: true, items, fetchedAt: new Date().toISOString() };
  CACHE.set('list', { at: Date.now(), data });
  return data;
}

export async function kosacDetail(id) {
  if (!/^PBANC_\d{1,20}$/.test(id)) return { ok: false, error: '공고 번호 형식이 아닙니다.' };
  const hit = CACHE.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const files = parseFiles(await get(`${LIST}/${id}`));
    const data = { ok: true, id, url: `${LIST}/${id}`, files };
    CACHE.set(id, { at: Date.now(), data });
    return data;
  } catch (e) {
    return { ok: false, error: `공고 상세를 열지 못했습니다(${e.message}).` };
  }
}

const flat = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
// 검색어(쉼표로 여러 개)가 제목에 든 것. open: 접수중·접수예정만
export function matchKosac(items, { terms = [], open = false, limit = 20 } = {}) {
  const ts = terms.map(flat).filter(Boolean);
  return items
    .filter((x) => !open || !/마감/.test(x.status))
    .map((x) => ({ ...x, hits: ts.filter((t) => flat(x.title).includes(t)).length }))
    .filter((x) => !ts.length || x.hits)
    .sort((a, b) => b.hits - a.hits || String(b.postedAt).localeCompare(String(a.postedAt)))
    .slice(0, limit);
}

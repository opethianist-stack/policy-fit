import { extractText, ExtractError } from '../../../lib/extract';
import { termsFromRfp, guessMeta } from '../../../lib/rfp';
import { titleTokens } from '../../../lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 제안요청서 → 본문 텍스트 + 검색어. 파일은 저장하지 않고 응답으로만 돌려준다.
//   GET  /api/rfp?url=<나라장터·과기정통부 첨부 URL>&name=<파일명>&title=<공고명>   공고 첨부파일을 서버가 받아서 읽는다
//   POST /api/rfp?name=<파일명>&title=<공고명>  (본문 = 파일 바이트)       담당자가 올린 파일을 읽는다
//
// 첨부 URL은 나라장터·과기정통부 호스트만 받는다. 아무 주소나 받으면 이 서버를 거쳐 내부망·임의 주소를 부르는 통로가 된다.
const ALLOWED = new Set(['www.g2b.go.kr', 'g2b.go.kr', 'www.msit.go.kr']);   // 나라장터 첨부 + 과기정통부 게시판 첨부
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 80000;

function fail(error, status = 400) { return Response.json({ ok: false, error }, { status }); }

async function respond(buf, name, title) {
  try {
    const { kind, text } = await extractText(buf, name);
    const base = title ? titleTokens(title) : [];
    return Response.json({
      ok: true, name, kind, chars: text.length,
      terms: termsFromRfp(text, { exclude: base }),
      meta: guessMeta(text),
      text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT,
    });
  } catch (e) {
    if (e instanceof ExtractError) return fail(e.message, 422);
    return fail('파일을 읽지 못했습니다.', 422);
  }
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const name = sp.get('name') || '';
  let u;
  try { u = new URL(sp.get('url') || ''); } catch { return fail('첨부파일 주소가 올바르지 않습니다.'); }
  if (!['https:', 'http:'].includes(u.protocol) || !ALLOWED.has(u.hostname)) return fail('나라장터·과기정통부 첨부파일만 받을 수 있습니다.');
  let r;
  try {
    r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.g2b.go.kr/' } });
  } catch (e) {
    return fail('첨부파일을 받지 못했습니다(연결 실패). 파일을 직접 올려 주세요.', 502);
  }
  if (!r.ok) return fail(`첨부파일을 받지 못했습니다(HTTP ${r.status}). 파일을 직접 올려 주세요.`, 502);
  const finalHost = new URL(r.url || u).hostname;
  if (!ALLOWED.has(finalHost)) return fail('나라장터 밖 주소로 넘어가는 첨부파일은 받지 않습니다.', 502);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return fail('첨부파일이 너무 큽니다(20MB 초과).', 413);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) return fail('첨부파일이 너무 큽니다(20MB 초과).', 413);
  if (/^\s*</.test(buf.subarray(0, 64).toString('latin1'))) return fail('첨부파일 대신 웹페이지가 왔습니다. 파일을 직접 올려 주세요.', 502);
  return respond(buf, name, sp.get('title') || '');
}

export async function POST(req) {
  const sp = new URL(req.url).searchParams;
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return fail('파일이 비어 있습니다.');
  if (buf.length > MAX_BYTES) return fail('파일이 너무 큽니다.', 413);
  return respond(buf, sp.get('name') || '', sp.get('title') || '');
}

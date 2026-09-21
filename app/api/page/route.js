import { getPage, locateQuote } from '../../../lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/page?doc=01&page=12&quote=발췌문 → 그 쪽의 원문 전체와 발췌문 위치.
// 검토 화면 왼쪽의 원문 쪽 보기가 쓴다. 외부 호출 없음.
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const doc = (sp.get('doc') || '').trim();
  const page = sp.has('page') ? Number(sp.get('page')) : NaN;
  if (!doc || !Number.isInteger(page)) return Response.json({ ok: false, error: 'doc과 page가 필요합니다.' }, { status: 400 });
  const p = getPage(doc, page);
  if (!p) return Response.json({ ok: false, error: '색인에 없는 쪽입니다.' }, { status: 404 });
  return Response.json({ ok: true, ...p, hit: locateQuote(p.text, sp.get('quote') || '') });
}

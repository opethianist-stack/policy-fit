import { kosacList, kosacDetail, matchKosac } from '../../../lib/kosac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/kosac?q=AI,교육&open=1&limit=20 → 한국과학창의재단 사업공고 중 제목에 검색어가 든 것(open=1이면 접수중·접수예정만)
// GET /api/kosac?id=PBANC_00000000000511 → 그 공고의 첨부(이름·다운로드 주소·본문 읽기 가능 여부)
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  if (sp.has('id')) {
    const r = await kosacDetail(sp.get('id'));
    return Response.json(r, { status: r.ok ? 200 : 502 });
  }
  const all = await kosacList();
  if (!all.ok) return Response.json(all, { status: 502 });
  const terms = (sp.get('q') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.min(30, Math.max(1, Number(sp.get('limit') || 20)));
  return Response.json({ ok: true, fetchedAt: all.fetchedAt, pool: all.items.length, items: matchKosac(all.items, { terms, open: sp.get('open') === '1', limit }) });
}

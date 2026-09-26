import { allBoards, boardDetail, matchBoards } from '../../../lib/boards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/boards?q=AI,교육&open=1&limit=30 → 산하기관 게시판(한국과학창의재단·정보통신산업진흥원 사업공고, 한국교육학술정보원 공지) 중 제목에 검색어가 든 것
// GET /api/boards?src=keris&id=43507 → 그 글의 첨부(이름·다운로드 주소·본문 읽기 가능 여부)와 본문 글
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  if (sp.has('id')) {
    const r = await boardDetail(sp.get('src') || '', sp.get('id'));
    return Response.json(r, { status: r.ok ? 200 : 502 });
  }
  const all = await allBoards();
  if (!all.items.length && all.failed.length) return Response.json({ ok: false, error: all.failed.map((f) => f.error).join(' '), failed: all.failed }, { status: 502 });
  const terms = (sp.get('q') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 30)));
  return Response.json({ ok: true, pool: all.items.length, failed: all.failed, items: matchBoards(all.items, { terms, open: sp.get('open') === '1', limit }) });
}

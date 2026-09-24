import { searchBids } from '../../../lib/bids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/bids?q=AI 교육,연수&days=14&limit=20
// 용역 입찰공고 중 공고명이 검색어와 맞는 것(쉼표로 여러 개, 하나라도 맞으면). 검색어가 없으면 최근 공고.
// 각 건: 공고번호, 차수, 공고명, 수요기관, 배정예산, 게시일시, 마감일시, 맞은 검색어
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const terms = (sp.get('q') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 20)));
  const r = await searchBids({ terms, days: sp.get('days'), limit });
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 502 });
  return Response.json(r);
}

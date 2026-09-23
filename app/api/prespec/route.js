import { recentPrespec, matchPrespec } from '../../../lib/prespec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/prespec?days=7&q=교육,연수&orgs=한국지능정보사회진흥원&limit=20
// 나라장터 사전규격(용역) 중 규격명·기관이 맞는 것. 공고 전 단계라 제안요청서·과업지시서를 먼저 볼 수 있다.
// 각 건: 사전규격등록번호, 규격명, 수요기관, 배정예산, 의견등록 마감, 규격서 파일 주소, 이어진 입찰공고번호
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const list = (k) => (sp.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const days = Number(sp.get('days') || 7);
  const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 20)));
  const all = await recentPrespec(days);
  if (!all.ok) return Response.json({ ok: false, error: all.error }, { status: 502 });
  return Response.json({
    ok: true, fetchedAt: all.fetchedAt, pool: all.items.length, total: all.total, partial: all.partial,
    items: matchPrespec(all.items, { terms: list('q'), orgs: list('orgs'), limit }),
  });
}

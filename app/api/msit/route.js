import { recentMsit, matchMsit } from '../../../lib/msit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/msit?terms=a,b,c → 과기정통부 최근 게시물(주요정책·사업공고·보도자료·보도설명) 중 제목이 검색어와 맞는 것
// 각 게시물: 출처 구분, 제목, 게시일, 담당부서, 상세페이지 URL, 첨부파일 목록(이름·다운로드 URL·본문 읽기 가능 여부)
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const terms = (sp.get('terms') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const all = await recentMsit();
  if (!all.ok) return Response.json({ ok: false, error: all.error }, { status: 502 });
  return Response.json({
    ok: true, fetchedAt: all.fetchedAt, pool: all.items.length, partial: all.partial,
    items: matchMsit(all.items, terms),
    loose: matchMsit(all.items, terms, 5, { loose: true }),   // 흔한 말 하나만 겹친 것(화면에서 접어서 표시)
  });
}

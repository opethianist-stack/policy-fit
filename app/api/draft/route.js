import { buildDraft } from '../../../lib/draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { notice, lineage, cards:[{...근거, logic}] } → 문서 모델(JSON). 화면 미리보기와 구도 추천이 이걸 쓴다.
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 }); }
  if (!body || !body.notice || !Array.isArray(body.cards)) return Response.json({ ok: false, error: 'notice와 cards가 필요합니다.' }, { status: 400 });
  return Response.json({ ok: true, draft: buildDraft(body) });
}

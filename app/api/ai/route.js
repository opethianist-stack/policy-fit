import { suggestTerms, classifyRoles, draftText, deckCopy } from '../../../lib/ai';
import { LlmError, llmReady, MODEL } from '../../../lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST { task: 'terms'|'roles'|'draft'|'deck', ... } → 검증을 통과한 칸만. GET → 사용 가능 여부.
const TASKS = { terms: suggestTerms, roles: classifyRoles, draft: draftText, deck: deckCopy };

export async function GET() {
  return Response.json({ ok: true, ready: llmReady(), model: llmReady() ? MODEL : null });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 }); }
  const fn = body && TASKS[body.task];
  if (!fn) return Response.json({ ok: false, error: '알 수 없는 작업입니다.' }, { status: 400 });
  if (body.task !== 'terms' && !Array.isArray(body.cards)) return Response.json({ ok: false, error: 'cards가 필요합니다.' }, { status: 400 });
  try {
    const result = await fn(body);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof LlmError ? e.message : 'AI 처리 중 오류가 났습니다.' }, { status });
  }
}

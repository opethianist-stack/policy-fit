import { suggestTerms, classifyRoles, draftText, deckCopy, rankEvidence } from '../../../lib/ai';
import { LlmError, llmReady, MODEL } from '../../../lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;   // 초안은 건너뛴 카드를 한 번 더 요청할 수 있다(첫 호출 ~6초 + 재요청 ≤15초)

// POST { task: 'terms'|'roles'|'draft'|'deck'|'rank', ... } → 검증을 통과한 칸만. GET → 사용 가능 여부.
const TASKS = { terms: suggestTerms, roles: classifyRoles, draft: draftText, deck: deckCopy, rank: rankEvidence };

// 공개 링크라 누구나 부를 수 있다 → 접속자(IP)별 호출 한도. 서버 인스턴스마다 따로 세므로 완벽하지 않고,
// 반복·자동 호출을 늦추는 용도다. 요금 상한은 Anthropic 콘솔의 사용 한도로 건다.
const LIMIT = { perIp: 30, ipWindowMs: 10 * 60 * 1000, total: 300, totalWindowMs: 60 * 60 * 1000 };
const hits = new Map();   // ip → [시각…]
let all = [];
function allow(ip) {
  const now = Date.now();
  all = all.filter((t) => now - t < LIMIT.totalWindowMs);
  const mine = (hits.get(ip) || []).filter((t) => now - t < LIMIT.ipWindowMs);
  if (mine.length >= LIMIT.perIp || all.length >= LIMIT.total) { hits.set(ip, mine); return false; }
  mine.push(now); all.push(now); hits.set(ip, mine);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function GET() {
  return Response.json({ ok: true, ready: llmReady(), model: llmReady() ? MODEL : null });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 }); }
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (!allow(ip)) return Response.json({ ok: false, error: 'AI 호출이 너무 잦습니다. 몇 분 뒤 다시 시도해 주세요.' }, { status: 429 });
  const fn = body && TASKS[body.task];
  if (!fn) return Response.json({ ok: false, error: '알 수 없는 작업입니다.' }, { status: 400 });
  if (body.task === 'rank' && !Array.isArray(body.candidates)) return Response.json({ ok: false, error: 'candidates가 필요합니다.' }, { status: 400 });
  if (body.task !== 'terms' && body.task !== 'rank' && !Array.isArray(body.cards)) return Response.json({ ok: false, error: 'cards가 필요합니다.' }, { status: 400 });
  try {
    const result = await fn(body);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 500;
    return Response.json({ ok: false, error: e instanceof LlmError ? e.message : 'AI 처리 중 오류가 났습니다.' }, { status });
  }
}

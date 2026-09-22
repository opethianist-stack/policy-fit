// Claude API 호출 한 곳. 키는 서버 환경변수(ANTHROPIC_API_KEY)에서만 읽고, 응답·오류에 싣지 않는다.
// 답은 자유 글이 아니라 정해진 틀(도구 입력 JSON)로만 받는다 — 칸마다 코드가 검증할 수 있게.
const BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export const llmReady = () => !!process.env.ANTHROPIC_API_KEY;

export class LlmError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// 모델이 배열·객체 칸을 JSON 글자로 감싸 보내는 경우가 있어 한 번 풀어 준다.
function normalizeInput(input) {
  const fix = (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) { try { return JSON.parse(t); } catch { /* 그대로 둔다 */ } }
    return v;
  };
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, fix(v)]));
}

export async function callTool({ system, user, tool, maxTokens = 2000, timeoutMs = 25000 }) {
  if (!llmReady()) throw new LlmError('AI 기능을 쓸 수 없습니다(키 미설정).', 503);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: maxTokens, temperature: 0.2, system,
        messages: [{ role: 'user', content: user }],
        tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (d && d.error && d.error.type) || `HTTP ${r.status}`;
      throw new LlmError(r.status === 401 ? 'AI 키가 올바르지 않습니다.' : r.status === 429 ? 'AI 호출 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.' : `AI 호출 실패(${msg})`, r.status === 429 ? 429 : 502);
    }
    const block = (d.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (!block) throw new LlmError('AI 응답 형식이 맞지 않습니다.');
    const input = normalizeInput(block.input || {});
    // 틀과 다른 모양으로 오면 서버 로그에 남긴다(공개 문서 발췌에서 나온 글만 있고 키는 없다)
    const want = Object.keys((tool.input_schema && tool.input_schema.properties) || {});
    const bad = want.filter((k) => input[k] == null || (tool.input_schema.properties[k].type === 'array' && !Array.isArray(input[k])) || (tool.input_schema.properties[k].type === 'object' && typeof input[k] !== 'object'));
    if (bad.length) console.warn('[ai] 응답 모양 불일치', tool.name, bad.join(','), d.stop_reason, JSON.stringify(block.input).slice(0, 800));
    return { input, usage: d.usage || null };
  } catch (e) {
    if (e instanceof LlmError) throw e;
    throw new LlmError(e && e.name === 'AbortError' ? 'AI 응답이 늦어 중단했습니다.' : 'AI 서버에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timer);
  }
}

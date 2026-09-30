import { NextResponse } from 'next/server';
import { currentUser } from '../../../auth';
import { dbReady, query } from '../../../lib/db';

// 계정별 최근 검색·저장된 작업(STEP57). 로그인한 이메일로만 읽고 쓴다.
// GET            → { recent, works:[{no, at, step, sel}] }  (작업 본문은 빼고 요약만)
// GET ?key=      → { work }                                   (작업 한 건 본문)
// PUT {recent}   → 최근 검색 목록을 바꾸고, 목록에 없는 작업은 지운다
// PUT {work}     → 작업 한 건 저장(서버 것이 더 새것이면 덮어쓰지 않는다)
// DB가 연결되지 않았으면 { ok:false, db:false } — 화면은 브라우저 저장만 쓴다.
export const dynamic = 'force-dynamic';

const RECENT_MAX = 20;
const WORK_MAX = 1.5 * 1024 * 1024;   // 작업 한 건 상한(제안요청서 본문 2만 자 + 검색 결과가 보통 50KB 안쪽)
const KEY_RE = /^[A-Za-z0-9_\-.]{1,80}$/;

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: { 'cache-control': 'no-store' } });

async function who() {
  const u = await currentUser();
  return u && u.email ? String(u.email).trim().toLowerCase() : '';
}

export async function GET(req) {
  const email = await who();
  if (!email) return json({ ok: false, error: '로그인이 필요합니다.' }, 401);
  if (!dbReady()) return json({ ok: false, db: false });
  const key = req.nextUrl.searchParams.get('key');
  try {
    if (key) {
      if (!KEY_RE.test(key)) return json({ ok: false, error: '잘못된 작업 키' }, 400);
      const r = await query('SELECT data FROM pf_work WHERE email = $1 AND key = $2', [email, key]);
      return json({ ok: true, db: true, work: r.rows[0] ? r.rows[0].data : null });
    }
    const [a, b] = await Promise.all([
      query('SELECT list FROM pf_recent WHERE email = $1', [email]),
      query('SELECT key, at, step, sel FROM pf_work WHERE email = $1', [email]),
    ]);
    return json({ ok: true, db: true, email, recent: a.rows[0] ? a.rows[0].list : [],
      works: b.rows.map((x) => ({ no: x.key, at: Number(x.at), step: x.step, sel: x.sel })) });
  } catch (e) {
    console.error('[work] GET', e.message);
    return json({ ok: false, db: true, error: '저장소를 읽지 못했습니다.' }, 502);
  }
}

function cleanRecent(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set(), out = [];
  for (const x of list) {
    if (!x || typeof x !== 'object' || typeof x.no !== 'string' || !KEY_RE.test(x.no) || seen.has(x.no)) continue;
    const s = JSON.stringify(x);
    if (s.length > 4000) continue;
    seen.add(x.no); out.push(x);
    if (out.length >= RECENT_MAX) break;
  }
  return out;
}

export async function PUT(req) {
  const email = await who();
  if (!email) return json({ ok: false, error: '로그인이 필요합니다.' }, 401);
  if (!dbReady()) return json({ ok: false, db: false });
  const raw = await req.text();
  if (raw.length > WORK_MAX + 100000) return json({ ok: false, error: '작업이 너무 큽니다.' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: '잘못된 요청' }, 400); }
  try {
    if (body && body.recent) {
      const list = cleanRecent(body.recent);
      if (!list) return json({ ok: false, error: '잘못된 목록' }, 400);
      await query(`INSERT INTO pf_recent (email, list, updated_at) VALUES ($1, $2, now())
        ON CONFLICT (email) DO UPDATE SET list = EXCLUDED.list, updated_at = now()`, [email, JSON.stringify(list)]);
      // 목록에서 밀려나거나 지운 항목의 작업도 지운다(개인정보처리방침 3항)
      await query('DELETE FROM pf_work WHERE email = $1 AND NOT (key = ANY($2::text[]))', [email, list.map((x) => x.no)]);
      return json({ ok: true });
    }
    const w = body && body.work;
    if (w && typeof w === 'object' && typeof w.no === 'string' && KEY_RE.test(w.no)) {
      const at = Number(w.at) || Date.now();
      const sel = Array.isArray(w.CARDS) ? w.CARDS.filter((c) => c && c.sel).length : 0;
      const r = await query(`INSERT INTO pf_work (email, key, at, step, sel, data, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (email, key) DO UPDATE SET at = EXCLUDED.at, step = EXCLUDED.step, sel = EXCLUDED.sel, data = EXCLUDED.data, updated_at = now()
        WHERE pf_work.at <= EXCLUDED.at`, [email, w.no, at, String(w.step || '').slice(0, 20), sel, JSON.stringify(w)]);
      return json({ ok: true, saved: r.rowCount > 0 });
    }
    return json({ ok: false, error: '잘못된 요청' }, 400);
  } catch (e) {
    console.error('[work] PUT', e.message);
    return json({ ok: false, db: true, error: '저장하지 못했습니다.' }, 502);
  }
}

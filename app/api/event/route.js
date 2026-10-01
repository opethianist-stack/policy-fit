import { NextResponse } from 'next/server';
import { currentUser } from '../../../auth';
import { dbReady, query } from '../../../lib/db';

// 이용 기록(STEP60). 화면이 공고 찾기·정책 근거 검색·산출 때 한 줄씩 남긴다.
// 관리자 대시보드의 집계(검색 수·키워드·근거가 약한 발주기관·색인 문서가 없는 기관)에만 쓰고, 1년이 지나면 지운다(/privacy 3항).
// 기록을 못 남겨도 화면 동작에는 영향이 없다(DB 없음·오류 모두 조용히 넘김).
export const dynamic = 'force-dynamic';

const KINDS = new Set(['find', 'evidence', 'export']);
const KEEP_DAYS = 365;

export async function POST(req) {
  const u = await currentUser();
  if (!u || !u.email) return NextResponse.json({ ok: false }, { status: 401 });
  if (!dbReady()) return NextResponse.json({ ok: false, db: false });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const kind = body && body.kind;
  const data = body && body.data && typeof body.data === 'object' ? body.data : {};
  const txt = JSON.stringify(data);
  if (!KINDS.has(kind) || txt.length > 8000) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    await query('INSERT INTO pf_event (email, kind, data) VALUES ($1, $2, $3)', [String(u.email).trim().toLowerCase(), kind, txt]);
    if (Math.random() < 0.02) await query(`DELETE FROM pf_event WHERE at < now() - interval '${KEEP_DAYS} days'`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[event]', e.message);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

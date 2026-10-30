import { searchAwards, ranking, rankings, prevAwards, flushCache } from '../../../lib/awards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/awards?q=디지털배움터&from=2026-01&to=2026-10&org= → 공고 단위로 묶은 개찰·낙찰·계약(개찰순위는 빼고)
// GET /api/awards?ranks=R26BK01330784-000,R26BK01394978-000 → 여러 공고의 개찰순위 전체(화면이 표를 띄운 뒤 부른다)
// GET /api/awards?no=R26BK01330784&ord=000 → 공고 하나의 개찰순위 전체
// GET /api/awards?prev=1&no=&name=&org=&at=2026-02-11 → 작년 같은 사업(공고 검색 화면의 공고 카드)
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  if (sp.get('prev')) {
    const r = await prevAwards({ no: sp.get('no'), name: sp.get('name'), org: sp.get('org'), at: sp.get('at') });
    return Response.json(r, { status: r.ok ? 200 : r.bad ? 400 : 502 });
  }
  if (sp.get('ranks')) {
    const pairs = sp.get('ranks').split(',').map((x) => x.trim().split('-')).filter((p) => p[0]);
    return Response.json(await rankings(pairs.map(([no, ord]) => [no, ord || '000'])));
  }
  if (sp.get('no')) {
    const r = await ranking(sp.get('no'), sp.get('ord'));
    await flushCache();
    return Response.json(r, { status: r.ok ? 200 : 502 });
  }
  const r = await searchAwards({ q: sp.get('q'), from: sp.get('from') || '', to: sp.get('to') || '', org: sp.get('org') || '' });
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: r.bad ? 400 : 502 });
  return Response.json(r);
}

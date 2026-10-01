import { dbReady, query } from './db';

// 관리자 대시보드 "실제 기록" 집계(STEP60). pf_event(공고 찾기 find · 정책 근거 검색 evidence · 산출 export)에서 최근 N일.
// evidence 한 줄: { no, name, org, ministry, scope, n, top, scale, n5, match, missing:[색인 문서 없는 계보 기관] }
export async function realStats(days = 30) {
  if (!dbReady()) return { ok: false, reason: 'DB가 연결되지 않았습니다.' };
  const since = `now() - interval '${Number(days) | 0} days'`;
  try {
    const [tiles, daily, terms, weak, gaps, first] = await Promise.all([
      query(`SELECT
          count(*) FILTER (WHERE kind = 'evidence') AS searches,
          count(DISTINCT email) AS users,
          count(*) FILTER (WHERE kind = 'export') AS exports,
          count(*) FILTER (WHERE kind = 'evidence' AND (data->>'scale') = '5') AS ranked,
          count(*) FILTER (WHERE kind = 'evidence' AND (data->>'scale') = '5' AND coalesce((data->>'n5')::int, 0) = 0) AS weak
        FROM pf_event WHERE at >= ${since}`),
      query(`SELECT to_char(at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS d, count(*) AS n
        FROM pf_event WHERE kind = 'evidence' AND at >= ${since} GROUP BY 1`),
      query(`SELECT trim(t) AS term, count(*) AS n FROM pf_event, regexp_split_to_table(coalesce(data->>'q', ''), ',') AS t
        WHERE kind = 'find' AND at >= ${since} AND trim(t) <> '' GROUP BY 1 ORDER BY n DESC, term LIMIT 10`),
      query(`SELECT data->>'org' AS org, max(data->>'ministry') AS ministry, count(*) AS n
        FROM pf_event WHERE kind = 'evidence' AND at >= ${since} AND (data->>'scale') = '5' AND coalesce((data->>'n5')::int, 0) = 0 AND coalesce(data->>'org', '') <> ''
        GROUP BY 1 ORDER BY n DESC, org LIMIT 8`),
      query(`SELECT m AS org, count(*) AS n, count(DISTINCT data->>'no') AS notices
        FROM pf_event, jsonb_array_elements_text(coalesce(data->'missing', '[]'::jsonb)) AS m
        WHERE kind = 'evidence' AND at >= ${since} GROUP BY 1 ORDER BY n DESC, org LIMIT 10`),
      query(`SELECT min(at) AS first FROM pf_event`),
    ]);
    const t = tiles.rows[0];
    const byDay = {}; daily.rows.forEach((r) => { byDay[r.d] = Number(r.n); });
    const kst = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
    const now = Date.now(), series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = kst(now - i * 86400000);
      series.push({ label: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`, value: byDay[d] || 0 });
    }
    return {
      ok: true,
      since: first.rows[0].first,
      searches: Number(t.searches), users: Number(t.users), exports: Number(t.exports),
      weakRate: Number(t.ranked) ? Math.round((Number(t.weak) / Number(t.ranked)) * 100) : null,
      daily: series,
      terms: terms.rows.map((r) => ({ label: r.term, value: Number(r.n) })),
      weak: weak.rows.map((r) => ({ org: r.org, ministry: r.ministry || '', n: Number(r.n) })),
      gaps: gaps.rows.map((r) => ({ org: r.org, n: Number(r.n), notices: Number(r.notices) })),
    };
  } catch (e) {
    console.error('[stats]', e.message);
    return { ok: false, reason: '기록을 읽지 못했습니다.' };
  }
}

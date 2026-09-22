import { extractTerms, searchEvidence, corpusInfo, coverageOf, MAX_TERMS } from '../../../lib/search';
import { defaultRole } from '../../../lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/evidence?title=공고명&orgs=발주처,주관부처&ministry=주관부처&terms=직접,지정&scope=lineage|all&limit=10
// limit: 기본 10, AI 관련도 정렬 때는 후보를 넓게(최대 30) 받는다. coverage: 계보 기관별 색인 문서 수(누락 위험 표시)
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const title = (sp.get('title') || '').trim();
  const list = (k) => (sp.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const terms = sp.has('terms') ? list('terms') : extractTerms(title);
  const orgs = list('orgs');
  const ministry = (sp.get('ministry') || '').trim();
  const scope = sp.get('scope') === 'all' ? 'all' : 'lineage';
  const limit = Math.min(30, Math.max(1, parseInt(sp.get('limit') || '10', 10) || 10));
  const coverage = coverageOf(orgs);
  if (!terms.length) return Response.json({ ok: true, terms: [], results: [], scopeDocs: 0, coverage, corpus: corpusInfo() });
  const { results, scopeDocs } = searchEvidence({ terms: terms.slice(0, MAX_TERMS), orgs, scope, limit });
  const lineage = { chain: orgs.map((name) => ({ name })), ministry };
  for (const r of results) r.role = defaultRole(r, lineage);
  return Response.json({ ok: true, terms: terms.slice(0, MAX_TERMS), scope, scopeDocs, results, coverage, corpus: corpusInfo() });
}

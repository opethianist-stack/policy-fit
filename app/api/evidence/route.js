import { extractTerms, searchEvidence, corpusInfo } from '../../../lib/search';
import { defaultRole } from '../../../lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/evidence?title=공고명&orgs=발주처,주관부처&ministry=주관부처&terms=직접,지정&scope=lineage|all
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const title = (sp.get('title') || '').trim();
  const list = (k) => (sp.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const terms = sp.has('terms') ? list('terms') : extractTerms(title);
  const orgs = list('orgs');
  const ministry = (sp.get('ministry') || '').trim();
  const scope = sp.get('scope') === 'all' ? 'all' : 'lineage';
  if (!terms.length) return Response.json({ ok: true, terms: [], results: [], scopeDocs: 0, corpus: corpusInfo() });
  const { results, scopeDocs } = searchEvidence({ terms: terms.slice(0, 20), orgs, scope });
  const lineage = { chain: orgs.map((name) => ({ name })), ministry };
  for (const r of results) r.role = defaultRole(r, lineage);
  return Response.json({ ok: true, terms, scope, scopeDocs, results, corpus: corpusInfo() });
}

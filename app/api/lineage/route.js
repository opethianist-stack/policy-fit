import { portalKey, portalGet, portalError, failReason } from '../../../lib/portal';
import rules from '../../../data/org-rules.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 발주처 이름 → 계보. 순서: ① 중앙부처 본부 ② 규칙(교육청·학교·대학) ③ 공공기관 정보 API(주관부처)
const INST = 'https://apis.data.go.kr/1051000/public_inst/list';

function candidates(name) {
  const base = name.replace(/\(주\)|㈜|\(재\)|\(사\)|주식회사/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = base.split(' ');
  const out = [base];
  if (parts.length > 1) { out.push(parts[0]); out.push(parts[parts.length - 1]); }
  return [...new Set(out)].filter((s) => s.length >= 2);
}

function byRule(name) {
  const compact = name.replace(/\s+/g, '');
  for (const m of rules.centralMinistries) {
    if (compact === m || name.split(' ')[0] === m) {
      return { source: 'rule', chain: [{ name: m, role: '중앙부처' }], ministry: m, orgs: [m] };
    }
  }
  for (const r of rules.rules) {
    if (!new RegExp(r.pattern).test(name)) continue;
    let chain = [{ name, role: r.type }];
    const orgs = [name];
    if (r.type === '교육지원청') {
      // "서울특별시중부교육지원청" → "서울특별시교육청"
      const m = compact.match(/^(.+?(특별자치시|특별자치도|특별시|광역시|도))/);
      if (m) { chain.push({ name: m[1] + '교육청', role: '시도교육청' }); orgs.push(m[1] + '교육청'); }
    } else if (r.type === '시도교육청' && !/교육청$/.test(compact) && /^.+?교육청/.test(compact) && !/\s/.test(name)) {
      // "세종특별자치시교육청평생교육원"처럼 소속기관 이름이 붙여 쓰여 오는 경우
      const head = compact.match(/^(.+?교육청)/)[1];
      chain = [{ name, role: '교육청 소속기관' }, { name: head, role: '시도교육청' }];
      orgs.push(head);
    } else if (r.type === '시도교육청') {
      const head = name.split(' ')[0];
      // "경기도교육청 경기도교육청남부연수원"처럼 소속기관이 붙어 오는 경우
      if (head !== name && /교육청$/.test(head)) {
        chain = [{ name: name.slice(head.length).trim(), role: '교육청 소속기관' }, { name: head, role: '시도교육청' }];
        orgs.push(head);
      }
    }
    chain.push({ name: r.ministry, role: r.relation });
    orgs.push(r.ministry);
    return { source: 'rule', chain, ministry: r.ministry, orgs };
  }
  return null;
}

export async function GET(req) {
  const name = (new URL(req.url).searchParams.get('name') || '').trim();
  if (name.length < 2) return Response.json({ ok: false, error: '기관명이 필요합니다.' }, { status: 400 });

  const ruled = byRule(name);
  if (ruled) return Response.json({ ok: true, ...ruled });

  const key = portalKey();
  if (!key) return Response.json({ ok: false, error: '인증키 미등록' }, { status: 500 });

  for (const q of candidates(name)) {
    let r;
    try {
      r = await portalGet(INST, { serviceKey: key, pageNo: '1', numOfRows: '10', resultType: 'json', instNm: q });
    } catch (e) {
      return Response.json({ ok: false, error: failReason(e) }, { status: 502 });
    }
    if (!r.json || !Array.isArray(r.json.result)) {
      return Response.json({ ok: false, error: (r.json && r.json.resultMsg) || portalError(r.text) || `HTTP ${r.status}` }, { status: 502 });
    }
    const rows = r.json.result.map((x) => x.item || x);
    if (!rows.length) continue;
    // 포함 검색이라 여러 건이 올 수 있다. 이름이 정확히 같은 건, 없으면 가장 짧은 이름을 고른다.
    const hit = rows.find((x) => x.instNm === q) || rows.sort((a, b) => a.instNm.length - b.instNm.length)[0];
    const chain = [{ name: hit.instNm, role: hit.instTypeNm || '공공기관' }];
    const orgs = [hit.instNm];
    // API에 주관부처가 비어 오는 기관은 org-rules.json의 knownParents로 보완한다(예: 세종학당재단 → 문화체육관광부)
    const parent = hit.sprvsnInstNm || (rules.knownParents || {})[hit.instNm] || '';
    if (parent) { chain.push({ name: parent, role: '주관부처' }); orgs.push(parent); }
    return Response.json({
      ok: true, source: 'api', chain, ministry: parent, orgs,
      inst: { code: hit.instCd, stdCode: hit.pbadmsStdInstCd, field: hit.instClsfNm, siteUrl: hit.siteUrl || '' },
      alternatives: rows.length > 1 ? rows.slice(0, 5).map((x) => x.instNm) : [],
    });
  }
  const known = (rules.knownParents || {})[name.replace(/\s+/g, '')];
  if (known) return Response.json({ ok: true, source: 'rule', chain: [{ name, role: '발주처' }, { name: known, role: '주관부처' }], ministry: known, orgs: [name, known] });
  return Response.json({ ok: true, source: 'none', chain: [{ name, role: '발주처' }], ministry: '', orgs: [name] });
}

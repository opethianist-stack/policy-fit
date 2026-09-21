import { portalKey, portalGet, portalError, failReason } from '../../../lib/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 입찰공고번호 → 공고 요약. 업무구분을 모르므로 용역 → 물품 → 공사 → 외자 순으로 찾는다.
const BASE = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/';
const KINDS = [
  ['용역', 'getBidPblancListInfoServc'],
  ['물품', 'getBidPblancListInfoThng'],
  ['공사', 'getBidPblancListInfoCnstwk'],
  ['외자', 'getBidPblancListInfoFrgcpt'],
];

function shape(x, kind) {
  const files = [];
  for (let i = 1; i <= 10; i++) {
    const name = x['ntceSpecFileNm' + i];
    const url = x['ntceSpecDocUrl' + i];
    if (name && url) files.push({ name, url });
  }
  return {
    no: x.bidNtceNo,
    ord: x.bidNtceOrd,
    kind,
    name: x.bidNtceNm,
    noticeOrg: x.ntceInsttNm,
    demandOrg: x.dminsttNm || x.ntceInsttNm,
    demandOrgCode: x.dminsttCd || '',
    budget: Number(x.asignBdgtAmt) || 0,
    estimatedPrice: Number(x.presmptPrce) || 0,
    postedAt: x.bidNtceDt || '',
    closeAt: x.bidClseDt || '',
    detailUrl: x.bidNtceDtlUrl || x.bidNtceUrl || '',
    files,
  };
}

export async function GET(req) {
  const no = (new URL(req.url).searchParams.get('no') || '').trim().toUpperCase().split('-')[0];
  if (!/^[A-Z0-9]{8,20}$/.test(no)) {
    return Response.json({ ok: false, error: '입찰공고번호 형식이 아닙니다.' }, { status: 400 });
  }
  const key = portalKey();
  if (!key) return Response.json({ ok: false, error: '인증키 미등록' }, { status: 500 });

  let lastReason = null;
  for (const [kind, op] of KINDS) {
    let r;
    try {
      r = await portalGet(BASE + op, { ServiceKey: key, inqryDiv: '2', bidNtceNo: no, pageNo: '1', numOfRows: '20', type: 'json' });
    } catch (e) {
      return Response.json({ ok: false, error: failReason(e) }, { status: 502 });
    }
    const header = r.json && r.json.response && r.json.response.header;
    if (!header || header.resultCode !== '00') {
      lastReason = (header && header.resultMsg) || portalError(r.text) || `HTTP ${r.status}`;
      continue;
    }
    const items = (r.json.response.body && r.json.response.body.items) || [];
    if (items.length) {
      // 정정공고가 있으면 차수(bidNtceOrd)가 여러 개 온다. 가장 최신 차수를 쓴다.
      items.sort((a, b) => String(b.bidNtceOrd).localeCompare(String(a.bidNtceOrd)));
      return Response.json({ ok: true, notice: shape(items[0], kind), revisions: items.length });
    }
  }
  if (lastReason) return Response.json({ ok: false, error: lastReason }, { status: 502 });
  return Response.json({ ok: false, notFound: true, error: '해당 번호의 공고가 없습니다.' }, { status: 404 });
}

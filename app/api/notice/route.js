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
    // 투찰 제한: 공고 조회 응답에는 여부·기준만 있다. 업종·지역 목록은 limits() 가 따로 채운다
    limits: {
      industry: x.indstrytyLmtYn === 'Y',
      regionBasis: x.rgnLmtBidLocplcJdgmBssNm || '',          // 본사소재지 등
      jointDuty: [x.jntcontrctDutyRgnNm1, x.jntcontrctDutyRgnNm2, x.jntcontrctDutyRgnNm3].filter(Boolean),
      jointDutyRate: x.rgnDutyJntcontrctRt || '',
      joint: String(x.cmmnSpldmdMethdNm || '').replace(/^\([^)]*\)/, '').trim(),   // "(없음)공동수급불허" → 공동수급불허
      licenses: [], regions: [],
    },
  };
}

// 업종(면허)제한·참가가능지역 목록. 차수(bidNtceOrd)가 없으면 "필수값 입력 에러"가 난다.
// 업종은 "학술.연구용역/1169"처럼 이름/코드로 오고, 제한 그룹 번호(lmtGrpNo)가 붙는다. 실패하면 빈 목록(공고 조회는 그대로)
async function limitList(key, op, no, ord) {
  try {
    const r = await portalGet(BASE + op, { ServiceKey: key, inqryDiv: '2', bidNtceNo: no, bidNtceOrd: ord, pageNo: '1', numOfRows: '50', type: 'json' });
    const items = r.json && r.json.response && r.json.response.body && r.json.response.body.items;
    return { ok: !!(r.json && r.json.response && r.json.response.header && r.json.response.header.resultCode === '00'), items: Array.isArray(items) ? items : [] };
  } catch {
    return { ok: false, items: [] };
  }
}
async function limits(key, no, ord) {
  const [lic, rgn] = await Promise.all([
    limitList(key, 'getBidPblancListInfoLicenseLimit', no, ord),
    limitList(key, 'getBidPblancListInfoPrtcptPsblRgn', no, ord),
  ]);
  const licenses = lic.items.map((x) => {
    const m = String(x.lcnsLmtNm || '').match(/^(.*)\/(\w+)$/);
    return { group: String(x.lmtGrpNo || '1'), name: (m ? m[1] : x.lcnsLmtNm || '').trim(), code: m ? m[2] : '', allowed: x.permsnIndstrytyList || '' };
  }).filter((x) => x.name);
  const regions = [...new Set(rgn.items.map((x) => String(x.prtcptPsblRgnNm || '').trim()).filter(Boolean))];
  return { licenses, regions, checked: lic.ok && rgn.ok };
}

async function eorderFiles(key, no, ord) {
  try {
    const r = await portalGet(BASE + 'getBidPblancListInfoEorderAtchFileInfo', { ServiceKey: key, inqryDiv: '2', bidNtceNo: no, pageNo: '1', numOfRows: '30', type: 'json' });
    const items = (r.json && r.json.response && r.json.response.body && r.json.response.body.items) || [];
    const list = Array.isArray(items) ? items : [];
    const same = list.filter((x) => x.bidNtceOrd === ord);
    return (same.length ? same : list).filter((x) => x.eorderAtchFileUrl).map((x) => ({
      name: x.eorderAtchFileNm || `${x.eorderDocDivNm || '첨부'}_${x.atchSno || ''}`,
      url: x.eorderAtchFileUrl,
      doc: x.eorderDocDivNm || '',   // 제안요청서 · 기타문서 등
    }));
  } catch {
    return [];
  }
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
      const notice = shape(items[0], kind);
      // 나라장터 화면의 "제안요청정보"(e발주 첨부)는 공고 첨부(ntceSpecFile)와 따로 있다. 조달청이 대행한 공고는
      // 공고서만 공고 첨부에 있고 제안요청서는 여기에만 있는 경우가 많다(실측: NIA·NIPA 공고 4건). 실패해도 공고 조회는 그대로 돌려준다.
      const [eorder, lim] = await Promise.all([eorderFiles(key, no, notice.ord), limits(key, no, notice.ord)]);
      notice.files = notice.files.concat(eorder);
      Object.assign(notice.limits, lim);
      return Response.json({ ok: true, notice, revisions: items.length });
    }
  }
  if (lastReason) return Response.json({ ok: false, error: lastReason }, { status: 502 });
  return Response.json({ ok: false, notFound: true, error: '해당 번호의 공고가 없습니다.' }, { status: 404 });
}

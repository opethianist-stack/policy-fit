'use client';

import { useEffect, useState } from 'react';

function ymd(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function makePresets() {
  return [
    {
      id: 'msit',
      group: 'data',
      label: '과기정통부 주요정책',
      method: 'GET',
      keySource: 'data',
      keyParam: 'ServiceKey',
      endpoint: 'https://apis.data.go.kr/1721000/msitmainpolicyinfo/mainPolicyList',
      params: [
        { k: 'pageNo', v: '1' },
        { k: 'numOfRows', v: '10' },
        { k: 'policyType', v: 'POLICY01' },
        { k: 'returnType', v: 'json' },
      ],
      note: '공공데이터포털 계열. policyType은 정책 분야 코드(POLICY01 = 연구개발정책 등)라 값에 따라 결과가 달라집니다.',
    },
    {
      id: 'g2b',
      group: 'data',
      label: '나라장터 입찰공고(용역)',
      method: 'GET',
      keySource: 'data',
      keyParam: 'ServiceKey',
      endpoint: 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch',
      params: [
        { k: 'inqryDiv', v: '1' },
        { k: 'inqryBgnDt', v: ymd(-30) + '0000' },
        { k: 'inqryEndDt', v: ymd(0) + '2359' },
        { k: 'pageNo', v: '1' },
        { k: 'numOfRows', v: '10' },
        { k: 'type', v: 'json' },
      ],
      note: '베이스 주소에 /ad/ 세그먼트가 들어갑니다. 업무구분(물품·용역·공사·외자)마다 오퍼레이션이 달라서, 용역이 아닌 건은 끝부분 오퍼레이션명을 바꿔야 합니다.',
    },
    {
      id: 'inst',
      group: 'data',
      label: '공공기관 정보 조회(포털)',
      method: 'GET',
      keySource: 'data',
      keyParam: 'serviceKey',
      endpoint: 'https://apis.data.go.kr/1051000/public_inst',
      params: [
        { k: 'page', v: '1' },
        { k: 'perPage', v: '10' },
      ],
      note: '공공데이터포털에 등록된 재정경제부 API. 활용신청 목록에는 베이스 주소까지만 공시되어 오퍼레이션 경로를 붙여야 합니다. 소관부처 정보를 준다면 계보 매핑의 1순위 후보입니다.',
    },
    {
      id: 'biz',
      group: 'data',
      label: '공공기관 사업정보(포털)',
      method: 'GET',
      keySource: 'data',
      keyParam: 'serviceKey',
      endpoint: 'https://apis.data.go.kr/1051000/biz',
      params: [
        { k: 'page', v: '1' },
        { k: 'perPage', v: '10' },
      ],
      note: '위와 동일하게 베이스 주소만 공시된 건입니다.',
    },
    {
      id: 'alio-apba',
      group: 'alio',
      label: '알리오플러스 · 기관',
      method: 'POST',
      keySource: 'alio-apba',
      keyParam: 'X-API-AUTH-KEY',
      endpoint: 'http://openapi.alioplus.go.kr/api/apba',
      params: [
        { k: 'pageSize', v: '10' },
        { k: 'schApbaGb', v: 'APBA' },
        { k: 'schApbaCate', v: '' },
        { k: 'schSiNa', v: '' },
        { k: 'schSggNa', v: '' },
        { k: 'schCont', v: '한국교육학술정보원' },
      ],
      note: 'schApbaGb: APBA(본점) / AFLT(지점). 응답은 apbaNa(본점명)·apbaTypeNa(기관유형)·bsnMstList(주요사업목록)·oprSiteList 등. 주무부처 필드는 응답 항목표에 없습니다.',
    },
    {
      id: 'alio-biz',
      group: 'alio',
      label: '알리오플러스 · 사업',
      method: 'POST',
      keySource: 'alio-biz',
      keyParam: 'X-API-AUTH-KEY',
      endpoint: 'http://openapi.alioplus.go.kr/api/business',
      params: [
        { k: 'pageSize', v: '10' },
        { k: 'schFstCateCd', v: '' },
        { k: 'schScdCateCd', v: '' },
        { k: 'schTrdCateCd', v: '' },
        { k: 'schLifeCycle', v: '' },
        { k: 'schSvcCate', v: '' },
        { k: 'schBsnNa', v: '교육' },
      ],
      note: '응답은 apbaNa(기관명)·bsnNa(사업명)·bsnDsc(사업소개)·lifeCycleNa·guideTar 등. 코드값은 가이드 4장 요청항목 코드표 참조.',
    },
    {
      id: 'alio-facility',
      group: 'alio',
      label: '알리오플러스 · 시설',
      method: 'POST',
      keySource: 'alio-facility',
      keyParam: 'X-API-AUTH-KEY',
      endpoint: 'http://openapi.alioplus.go.kr/api/facility',
      params: [
        { k: 'pageSize', v: '10' },
        { k: 'schFstCateCd', v: '' },
        { k: 'schScdCateCd', v: '' },
        { k: 'schSiNa', v: '' },
        { k: 'schSggNa', v: '' },
        { k: 'schFacltNa', v: '' },
      ],
      note: '공공기관 개방시설 정보. 이번 과제와 직접 관련은 적지만 ALIO_FACILITY_KEY 발급·연결 확인용으로 함께 둡니다.',
    },
    {
      id: 'alio-event',
      group: 'alio',
      label: '알리오플러스 · 행사',
      method: 'POST',
      keySource: 'alio-event',
      keyParam: 'X-API-AUTH-KEY',
      endpoint: 'http://openapi.alioplus.go.kr/api/event',
      params: [
        { k: 'pageSize', v: '10' },
        { k: 'schFstCateCd', v: '' },
        { k: 'schScdCateCd', v: '' },
        { k: 'schSiNa', v: '' },
        { k: 'schSggNa', v: '' },
        { k: 'schEvtNa', v: '' },
      ],
      note: '공공기관 행사 정보.',
    },
  ];
}

// 프록시(app/api/proxy/route.js)의 KEY_SOURCES 와 id 가 1:1로 맞아야 한다.
const KEY_SOURCES = [
  { id: 'data', env: 'DATA_GO_KR_KEY' },
  { id: 'alio-apba', env: 'ALIO_APBA_KEY' },
  { id: 'alio-biz', env: 'ALIO_BIZ_KEY' },
  { id: 'alio-facility', env: 'ALIO_FACILITY_KEY' },
  { id: 'alio-event', env: 'ALIO_EVENT_KEY' },
];

const APPLIED = [
  ['조달청', '나라장터 입찰공고정보서비스', 'data.go.kr', '2028-09-03'],
  ['과학기술정보통신부', '주요정책', 'data.go.kr', '2028-09-03'],
  ['재정경제부', '공공기관 정보 조회 서비스', 'data.go.kr', '2028-09-03'],
  ['재정경제부', '공공기관 사업정보 조회서비스', 'data.go.kr', '2028-09-07'],
  ['기획재정부', '알리오플러스 기관정보', 'alioplus.go.kr', 'API별 별도 발급'],
  ['기획재정부', '알리오플러스 사업정보', 'alioplus.go.kr', 'API별 별도 발급'],
  ['기획재정부', '알리오플러스 시설정보', 'alioplus.go.kr', 'API별 별도 발급'],
  ['기획재정부', '알리오플러스 행사정보', 'alioplus.go.kr', 'API별 별도 발급'],
];

function summarize(result) {
  if (!result) return null;
  if (result.format === 'json' && result.parsed) {
    const top = Object.keys(result.parsed);
    let arr = null;
    let path = '';
    const walk = (obj, p, depth) => {
      if (arr || depth > 5 || !obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
          arr = v;
          path = p ? `${p}.${k}` : k;
          return;
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object') walk(v, p ? `${p}.${k}` : k, depth + 1);
      }
    };
    walk(result.parsed, '', 0);
    return { kind: 'JSON', top, path, count: arr ? arr.length : 0, fields: arr ? Object.keys(arr[0]) : [] };
  }
  if (result.format === 'xml' && result.bodyText) {
    const items = result.bodyText.match(/<item>/g) || [];
    const first = result.bodyText.match(/<item>([\s\S]*?)<\/item>/);
    const fields = first
      ? Array.from(new Set((first[1].match(/<([A-Za-z_][\w.-]*)>/g) || []).map((t) => t.slice(1, -1))))
      : [];
    return { kind: 'XML', top: [], path: 'item', count: items.length, fields };
  }
  return { kind: result.format ? result.format.toUpperCase() : 'TEXT', top: [], path: '', count: 0, fields: [] };
}

export default function ApiTest() {
  const [presets] = useState(makePresets);
  const [active, setActive] = useState('msit');
  const [endpoint, setEndpoint] = useState(presets[0].endpoint);
  const [method, setMethod] = useState(presets[0].method);
  const [keyParam, setKeyParam] = useState(presets[0].keyParam);
  const [keySource, setKeySource] = useState(presets[0].keySource);
  const [rows, setRows] = useState(presets[0].params);
  const [note, setNote] = useState(presets[0].note);
  const [keys, setKeys] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/proxy')
      .then((r) => r.json())
      .then(setKeys)
      .catch(() => setKeys({ configured: {} }));
  }, []);

  function applyPreset(p) {
    const fresh = makePresets().find((x) => x.id === p.id);
    setActive(fresh.id);
    setEndpoint(fresh.endpoint);
    setMethod(fresh.method);
    setKeyParam(fresh.keyParam);
    setKeySource(fresh.keySource);
    setRows(fresh.params);
    setNote(fresh.note);
    setResult(null);
    setError(null);
  }

  function setRow(i, field, value) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  async function call() {
    setLoading(true);
    setError(null);
    setResult(null);
    const params = {};
    rows.forEach((r) => {
      if (r.k.trim()) params[r.k.trim()] = r.v;
    });
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint, method, keyParam, keySource, params }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      setResult(data.requestUrl || data.bodyText ? data : null);
    } catch (e) {
      setError('호출 실패: ' + (e && e.message ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  const shape = summarize(result);

  return (
    <div className="page">
      <div className="eyebrow">3단계 · API 연결 체크</div>
      <h1>오픈API 연결 테스트</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {KEY_SOURCES.map((s) => {
          const ok = Boolean(keys && keys.configured && keys.configured[s.id]);
          return (
            <div
              key={s.id}
              className={`keystate ${keys ? (ok ? 'on' : 'off') : 'wait'}`}
              style={{ marginBottom: 0 }}
            >
              {!keys ? `${s.env} 확인 중…` : ok ? `${s.env} 등록됨` : `${s.env} 없음`}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>인증 체계가 둘로 갈립니다</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>구분</th><th>공공데이터포털</th><th>알리오플러스</th></tr>
            </thead>
            <tbody>
              <tr><td>호스트</td><td>apis.data.go.kr (HTTPS)</td><td>openapi.alioplus.go.kr (HTTP, SSL 미지원)</td></tr>
              <tr><td>방식</td><td>GET · 쿼리스트링</td><td>POST · form-urlencoded</td></tr>
              <tr><td>인증 파라미터</td><td>serviceKey / ServiceKey</td><td>X-API-AUTH-KEY</td></tr>
              <tr><td>키 발급처</td><td>data.go.kr 마이페이지</td><td>alioplus.go.kr 소셜 로그인 → Open API</td></tr>
              <tr><td>키 개수</td><td>1개로 4종 공용</td><td>API 4종마다 별도 발급</td></tr>
              <tr><td>환경변수</td><td>DATA_GO_KR_KEY</td><td>ALIO_APBA_KEY · ALIO_BIZ_KEY · ALIO_FACILITY_KEY · ALIO_EVENT_KEY</td></tr>
            </tbody>
          </table>
        </div>
        <div className="note">
          알리오플러스는 HTTPS를 지원하지 않아 브라우저에서 직접 호출하면 혼합 콘텐츠로 차단됩니다. 서버 프록시를 거치는 구조가 필수입니다.
        </div>
      </div>

      <div className="card">
        <h2>활용신청 현황</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>소관기관</th><th>API</th><th>발급처</th><th>만료예정</th></tr>
            </thead>
            <tbody>
              {APPLIED.map((r) => (
                <tr key={r[1]}>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="presets">
        {presets.map((p) => (
          <button key={p.id} className={`preset ${active === p.id ? 'on' : ''}`} onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="card">
        <h2>요청 설정</h2>
        <div style={{ marginBottom: 12 }}>
          <label className="f">ENDPOINT</label>
          <input className="t" value={endpoint} placeholder="https://..." onChange={(e) => setEndpoint(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ minWidth: 130 }}>
            <label className="f">메서드</label>
            <select className="t" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="GET">GET</option>
              <option value="POST">POST (form)</option>
            </select>
          </div>
          <div style={{ minWidth: 190 }}>
            <label className="f">인증 파라미터명</label>
            <select className="t" value={keyParam} onChange={(e) => setKeyParam(e.target.value)}>
              <option value="serviceKey">serviceKey</option>
              <option value="ServiceKey">ServiceKey</option>
              <option value="X-API-AUTH-KEY">X-API-AUTH-KEY</option>
            </select>
          </div>
          <div style={{ minWidth: 210 }}>
            <label className="f">사용할 키</label>
            <select className="t" value={keySource} onChange={(e) => setKeySource(e.target.value)}>
              {KEY_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>{s.env}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="f">요청 파라미터</label>
        {rows.map((r, i) => (
          <div className="row" key={i}>
            <input className="t" value={r.k} placeholder="이름" onChange={(e) => setRow(i, 'k', e.target.value)} />
            <input className="t" value={r.v} placeholder="값" onChange={(e) => setRow(i, 'v', e.target.value)} />
            <button className="del" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>×</button>
          </div>
        ))}
        <button className="btn soft" style={{ marginTop: 4 }} onClick={() => setRows((rs) => [...rs, { k: '', v: '' }])}>
          + 파라미터 추가
        </button>

        <div style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={call} disabled={loading || !endpoint}>
            {loading ? '호출 중…' : 'API 호출'}
          </button>
        </div>

        {note && <div className="note">{note}</div>}
      </div>

      {error && (
        <div className="card">
          <div className="err">{error}</div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2>응답</h2>
          <div className="stats">
            <span className={`chip ${result.ok ? 'ok' : 'bad'}`}>HTTP {result.status}</span>
            <span className="chip">{result.elapsedMs}ms</span>
            <span className="chip">{result.format}</span>
            <span className="chip">{result.bytes?.toLocaleString()} bytes</span>
            {result.contentType && <span className="chip">{result.contentType.split(';')[0]}</span>}
          </div>

          {result.requestUrl && <div className="urlline">{result.requestUrl}</div>}

          {shape && (
            <div className="shape" style={{ marginBottom: 14 }}>
              <div>
                응답 형태: <b>{shape.kind}</b>
                {shape.count > 0 && (
                  <>
                    {' · '}목록 경로 <b>{shape.path}</b> · <b>{shape.count}</b>건
                  </>
                )}
              </div>
              {shape.top.length > 0 && <div>최상위 키: {shape.top.join(', ')}</div>}
              {shape.fields.length > 0 && <div>항목 필드: {shape.fields.join(', ')}</div>}
            </div>
          )}

          <pre className="out">{result.bodyText}{result.truncated ? '\n\n… (이하 생략)' : ''}</pre>
        </div>
      )}
    </div>
  );
}

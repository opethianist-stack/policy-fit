'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadXlsx } from './xlsx';
import CorpSearch from './CorpSearch';

// 수주 현황: 사업명 키워드 + 기간으로 나라장터 공고·개찰순위·최종낙찰·계약(공동수급 지분)을 공고 단위로 묶어 본다.
// 서버(/api/awards)가 묶어 주고, 표 여섯 개와 엑셀은 화면에서 고른 사업만으로 만든다(키워드 잡음은 담당자가 빼게)
const won = (n) => (n ? Math.round(n).toLocaleString('ko-KR') : '');
const pct = (a, b) => (a && b ? (a / b * 100).toFixed(1) + '%' : '');
const short = (s) => String(s || '').replace(/주식회사|\(주\)|㈜|\(사\)|사단법인|재단법인|\(재\)/g, '').replace(/\s+/g, ' ').trim();
const ckey = (name, biz) => biz || short(name);
const ALIAS = { '한국지능정보사회진흥원': 'NIA', '정보통신산업진흥원': 'NIPA', '한국교육학술정보원': 'KERIS', '한국과학창의재단': 'KOSAC' };
const shortOrg = (o) => { const s = short(o); return ALIAS[s] || (s.length > 9 ? s.slice(0, 8) + '…' : s); };
const label = (g) => g.region || shortOrg(g.org);
// 같은 이름표가 둘 이상이면(경기 사업 두 개 등) 뒤에 번호를 붙인다(업체×기관 순위 머리글용)
function labels(gs) {
  const n = {}; const seen = {};
  gs.forEach((g) => { n[label(g)] = (n[label(g)] || 0) + 1; });
  return gs.map((g) => { const l = label(g); if (n[l] < 2) return l; seen[l] = (seen[l] || 0) + 1; return l + ' ' + seen[l]; });
}
const firstOf = (g) => (g.top ? { name: g.top.name, biz: g.top.biz, amount: g.top.amount } : (g.opening && g.opening.first) || null);
const corpsText = (c) => (c ? c.corps.map((x) => short(x.name) + (x.role === '주관' && c.corps.length > 1 ? '[주관]' : '') + (c.corps.length > 1 && x.share != null ? ' ' + x.share : '')).join(', ') + (c.corps.length === 1 ? ' (단독)' : '') : '');
const STATUS_CLS = { '계약': 'ok', '낙찰(계약 미확인)': 'mid', '1순위(낙찰 미등록)': 'warn', '개찰완료(낙찰 미등록)': 'warn', '유찰': 'dim', '개찰 전': 'dim', '공고 취소': 'dim' };

function monthNow(offset = 0) {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
}

// ── 표 데이터(화면·엑셀 공용)
function statusTable(gs) {
  const head = ['시도·기관', '사업명', '공고번호', '배정예산', '개찰일', '참여', '1순위', '1순위 투찰액', '예산 대비', '기술', '가격', '종합', '2순위', '상태', '최종낙찰액', '계약일', '계약액', '계약업체(공동수급 지분)', '확인할 점'];
  const rows = gs.map((g) => {
    const f = firstOf(g);
    const t = g.top || {};
    return [label(g), g.name, g.no + '-' + g.ord, g.budget || '', g.opening ? g.opening.at.slice(0, 10) : '', g.opening ? g.opening.count : '',
      f ? short(f.name) : '', f ? f.amount : '', f ? pct(f.amount, g.budget) : '', num(t.tech), num(t.price), num(t.total),
      g.second ? short(g.second.name) : '', g.status, g.award ? g.award.amount : '', g.contract ? g.contract.date : '', g.contract ? g.contract.amount : '',
      corpsText(g.contract), g.flags.join(' · ')];
  });
  return { head, rows };
}
function num(v) { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? '' : n; }
function rankTable(gs) {
  const head = ['시도·기관', '공고번호', '순위', '업체', '사업자번호', '대표자', '투찰액', '투찰일시', '기술(환산)', '기술(원점수)', '가격', '종합', '비고'];
  const rows = [];
  for (const g of gs) for (const r of (g.ranking && g.ranking.rows) || []) {
    rows.push([label(g), g.opening.no + '-' + g.opening.ord, r.rank == null ? '' : r.rank, r.name, r.biz, r.ceo, r.amount || '', r.at, num(r.tech), num(r.techRaw), num(r.price), num(r.total), r.note]);
  }
  return { head, rows };
}
function consortiumTable(gs) {
  const head = ['시도·기관', '공고번호', '계약번호', '계약일', '계약액', '역할', '단독/공동', '업체', '사업자번호', '지분(%)', '지분 환산액', '매칭'];
  const rows = [];
  for (const g of gs) {
    const c = g.contract;
    if (!c) continue;
    for (const x of c.corps) rows.push([label(g), g.no, c.no, c.date, c.amount, x.role, x.kind, x.name, x.biz, x.share == null ? '' : x.share,
      x.share == null ? '' : Math.round(c.amount * x.share / 100), g.match]);
  }
  return { head, rows };
}
function companyStats(gs) {
  const m = new Map();
  const get = (name, biz) => {
    const k = ckey(name, biz);
    if (!m.has(k)) m.set(k, { name: short(name), biz, bids: 0, ranks: [], firsts: [], leads: [], members: [], amount: 0 });
    return m.get(k);
  };
  for (const g of gs) {
    for (const r of (g.ranking && g.ranking.rows) || []) {
      const c = get(r.name, r.biz);
      c.bids++;
      if (r.rank != null) c.ranks.push(r.rank);
      if (r.rank === 1) c.firsts.push(label(g));
    }
    const ct = g.contract;
    if (ct) for (const x of ct.corps) {
      const c = get(x.name, x.biz);
      if (x.role === '주관') c.leads.push(label(g)); else c.members.push(label(g));
      if (x.share != null) c.amount += ct.amount * x.share / 100;
    }
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount || b.firsts.length - a.firsts.length || b.bids - a.bids);
}
function companyTable(gs) {
  const head = ['업체', '사업자번호', '입찰 참여', '1순위', '1순위 지역', '주관 수주', '주관 수주 지역', '구성원 참여 지역', '지분 환산 수주액', '평균 순위'];
  const rows = companyStats(gs).map((c) => [c.name, c.biz, c.bids, c.firsts.length, c.firsts.join(', '), c.leads.length, c.leads.join(', '), c.members.join(', '),
    Math.round(c.amount) || '', c.ranks.length ? Number((c.ranks.reduce((s, x) => s + x, 0) / c.ranks.length).toFixed(2)) : '']);
  return { head, rows };
}
function matrixTable(gs) {
  const cols = gs.filter((g) => g.ranking && g.ranking.rows && g.ranking.rows.length);
  const m = new Map();
  cols.forEach((g, ci) => {
    for (const r of g.ranking.rows) {
      const k = ckey(r.name, r.biz);
      if (!m.has(k)) m.set(k, { name: short(r.name), cells: new Array(cols.length).fill(''), n: 0 });
      const row = m.get(k);
      row.cells[ci] = r.rank != null ? r.rank : (/미제출/.test(r.note) ? '미제출' : '부적격');
      row.n++;
    }
  });
  const head = ['업체', '참여', ...labels(cols)];
  const rows = [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko')).map((r) => [r.name, r.n, ...r.cells]);
  return { head, rows, titles: ['', '', ...cols.map((g) => g.name)] };
}
function relatedTable(list) {
  const head = ['계약일', '계약기관', '계약명', '계약방법', '계약액', '계약업체(지분)', '연결 공고번호', '계약번호'];
  const rows = list.map((c) => [c.date, c.inst, c.name, c.method, c.amount, corpsText(c), c.ntceNo, c.no]);
  return { head, rows };
}

const VIEWS = [
  { key: 'status', label: '기관별 수주 현황' },
  { key: 'rank', label: '개찰순위 전체' },
  { key: 'consortium', label: '낙찰 컨소시엄' },
  { key: 'company', label: '업체별 집계' },
  { key: 'matrix', label: '업체×기관 순위' },
  { key: 'related', label: '관련 계약' },
];

export default function Awards() {
  const [mode, setMode] = useState('name');
  const [corpQ, setCorpQ] = useState(null);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(monthNow().slice(0, 4) + '-01');
  const [to, setTo] = useState(monthNow());
  const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [view, setView] = useState('status');
  const [open, setOpen] = useState(null);
  const timer = useRef(null);
  const rankSeq = useRef(0);
  const [rankState, setRankState] = useState(null);

  useEffect(() => () => clearInterval(timer.current), []);
  // 공고 검색 화면의 "작년 같은 사업"에서 넘어오면(?q=&from=&to=&org=) 바로 조회한다
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('corp')) { setMode('corp'); setCorpQ({ v: p.get('corp').trim(), n: 1 }); return; }
    const q0 = (p.get('q') || '').trim();
    if (!q0) return;
    const ym = /^\d{4}-\d{2}$/;
    const o = { q: q0, from: ym.test(p.get('from') || '') ? p.get('from') : from, to: ym.test(p.get('to') || '') ? p.get('to') : to, org: p.get('org') || '' };
    setQ(o.q); setFrom(o.from); setTo(o.to); setOrg(o.org);
    run(null, o);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(e, over) {
    if (e) e.preventDefault();
    const c = over || { q, from, to, org };
    if (!c.q.trim()) { setErr('사업명 키워드를 넣어 주세요.'); return; }
    setBusy(true); setErr(''); setSec(0);
    const t0 = Date.now();
    clearInterval(timer.current);
    timer.current = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 500);
    try {
      const u = `/api/awards?q=${encodeURIComponent(c.q.trim())}&from=${c.from}&to=${c.to}&org=${encodeURIComponent(c.org.trim())}`;
      const r = await fetch(u, { cache: 'no-store' });
      const j = await r.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다.' }));
      if (!j.ok) { setErr(j.error || '조회에 실패했습니다.'); setData(null); }
      else {
        setData(j);
        setSel(new Set(j.groups.filter((g) => g.status !== '공고 취소').map((g) => g.key)));
        setView('status'); setOpen(null);
        clearInterval(timer.current); setBusy(false);
        loadRanks(j);
        return;
      }
    } catch { setErr('조회에 실패했습니다. 잠시 뒤 다시 시도해 주세요.'); }
    clearInterval(timer.current);
    setBusy(false);
  }

  // 표를 먼저 띄운 뒤 개찰순위 전체를 12건씩 나눠 함께 받는다(2순위·평가점수·업체 집계가 여기서 채워진다)
  async function loadRanks(j) {
    const keys = [...new Set(j.groups.filter((g) => g.opening && /개찰완료/.test(g.opening.status) && g.opening.count > 0)
      .map((g) => g.opening.no + '-' + g.opening.ord))];
    if (!keys.length) return;
    const seq = ++rankSeq.current;
    setRankState({ done: 0, total: keys.length, failed: 0 });
    const chunks = [];
    for (let i = 0; i < keys.length; i += 12) chunks.push(keys.slice(i, i + 12));
    await Promise.all(chunks.map(async (c) => {
      let got = {};
      try {
        const r = await fetch('/api/awards?ranks=' + c.join(','), { cache: 'no-store' });
        const x = await r.json();
        got = (x && x.rankings) || {};
      } catch { /* 아래에서 실패로 센다 */ }
      if (seq !== rankSeq.current) return;
      setData((d) => (d && d.q === j.q && d.from === j.from && d.to === j.to ? {
        ...d, groups: d.groups.map((g) => {
          const k = g.opening ? g.opening.no + '-' + g.opening.ord : '';
          const rk = got[k];
          if (!rk) return g;
          const rows = rk.ok ? rk.rows : [];
          return { ...g, ranking: rk, top: rows.find((r) => r.rank === 1) || null, second: rows.find((r) => r.rank === 2) || null };
        }),
      } : d));
      const bad = c.filter((k) => !got[k] || !got[k].ok).length;
      setRankState((s) => (s ? { ...s, done: s.done + c.length, failed: s.failed + bad } : s));
    }));
  }

  const chosen = useMemo(() => (data ? data.groups.filter((g) => sel.has(g.key)) : []), [data, sel]);
  const tables = useMemo(() => (data ? {
    status: statusTable(chosen), rank: rankTable(chosen), consortium: consortiumTable(chosen),
    company: companyTable(chosen), matrix: matrixTable(chosen), related: relatedTable(data.related),
  } : null), [data, chosen]);

  // 펼칠 때 개찰순위가 아직 없거나 실패했으면 그 공고만 다시 받는다
  async function toggleOpen(g) {
    if (open === g.key) { setOpen(null); return; }
    setOpen(g.key);
    if (!g.opening || !/개찰완료/.test(g.opening.status) || !g.opening.count || (g.ranking && g.ranking.ok)) return;
    try {
      const r = await fetch(`/api/awards?no=${g.opening.no}&ord=${g.opening.ord}`, { cache: 'no-store' });
      const rk = await r.json();
      if (!rk.ok) return;
      setData((d) => (d ? { ...d, groups: d.groups.map((x) => (x.key === g.key
        ? { ...x, ranking: rk, top: rk.rows.find((v) => v.rank === 1) || null, second: rk.rows.find((v) => v.rank === 2) || null } : x)) } : d));
    } catch { /* 그대로 둔다 */ }
  }

  function openCorp(biz) { setCorpQ({ v: biz, n: Date.now() }); setMode('corp'); window.scrollTo(0, 0); }
  function toggle(k) { const s = new Set(sel); s.has(k) ? s.delete(k) : s.add(k); setSel(s); }
  function all(on) { setSel(on ? new Set(data.groups.map((g) => g.key)) : new Set()); }

  function exportXlsx() {
    const t = tables;
    const w = (n) => new Array(n).fill(14);
    const sheets = [
      { name: '기관별 수주 현황', rows: [t.status.head, ...t.status.rows], widths: [10, 44, 18, 14, 11, 6, 22, 14, 9, 8, 8, 8, 22, 16, 14, 11, 14, 48, 40] },
      { name: '개찰순위 전체', rows: [t.rank.head, ...t.rank.rows], widths: [10, 18, 6, 28, 13, 10, 14, 17, 9, 9, 8, 8, 16] },
      { name: '낙찰 컨소시엄', rows: [t.consortium.head, ...t.consortium.rows], widths: [10, 16, 16, 11, 14, 8, 9, 28, 13, 8, 14, 12] },
      { name: '업체별 집계', rows: [t.company.head, ...t.company.rows], widths: [24, 13, 9, 7, 30, 9, 30, 30, 16, 9] },
      { name: '업체×기관 순위', rows: [t.matrix.head, ...t.matrix.rows], widths: [24, 6, ...w(t.matrix.head.length - 2).map(() => 8)] },
      { name: '관련 계약', rows: [t.related.head, ...t.related.rows], widths: [11, 22, 50, 10, 14, 40, 16, 16] },
    ];
    downloadXlsx(`수주현황_${data.q}_${data.from}_${data.to}.xlsx`, sheets);
  }

  const cell = (v, i, head) => {
    const isNum = typeof v === 'number';
    return <td key={i} className={isNum ? 'n' : undefined}>{isNum && !/순위|참여|기술|가격|종합|지분\(%\)|평균/.test(head[i]) ? won(v) : String(v === '' || v == null ? '' : v)}</td>;
  };

  return (
    <main className="page awards">
      <h1>수주 현황</h1>
      <p className="aw-lead">{mode === 'name'
        ? '사업명 키워드와 기간으로 나라장터 공고의 개찰순위·최종낙찰·계약(공동수급 지분)을 사업 단위로 묶어 봅니다.'
        : '업체의 조달청 등록 정보와 그 업체가 대표로 낙찰받은 사업을 봅니다.'}</p>
      <nav className="aw-mode" aria-label="찾는 방법">
        <button type="button" className={mode === 'name' ? 'on' : ''} aria-pressed={mode === 'name'} onClick={() => setMode('name')}>사업명으로 찾기</button>
        <button type="button" className={mode === 'corp' ? 'on' : ''} aria-pressed={mode === 'corp'} onClick={() => setMode('corp')}>업체로 찾기</button>
      </nav>
      <div hidden={mode !== 'corp'}><CorpSearch initial={corpQ} /></div>
      <div hidden={mode !== 'name'}>

      <form className="aw-form" onSubmit={run}>
        <label className="grow"><span>사업명 키워드</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 디지털배움터" /></label>
        <label><span>공고 게시 기간</span>
          <span className="aw-period">
            <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작 월" />
            <em>~</em>
            <input type="month" value={to} onChange={(e) => setTo(e.target.value)} aria-label="끝 월" />
          </span></label>
        <label><span>수요기관(선택)</span>
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="예: 경상북도" /></label>
        <button className="btn primary" disabled={busy}>{busy ? `조회 중 ${sec}초` : '조회'}</button>
      </form>
      <p className="aw-hint">기간은 최대 12개월입니다. 계약은 기간 끝에서 넉 달 뒤까지 찾습니다. 처음 조회는 10초 안팎 걸리고, 같은 조건은 한 시간 동안 바로 나옵니다. 2순위·평가점수는 표가 뜬 뒤 이어서 채워집니다.</p>
      {err && <p className="aw-err" role="alert">{err}</p>}

      <details className="aw-limits">
        <summary>데이터로 알 수 없는 것</summary>
        <ul>
          <li>탈락한 입찰자의 컨소시엄 구성은 나라장터 공개 데이터에 없습니다. 개찰결과에는 대표사만 나오고, 구성원은 계약을 맺은 낙찰자만 계약정보로 공개됩니다.</li>
          <li>협상 결렬, 나라장터 밖에서 맺은 계약은 데이터로 구분할 수 없습니다. 1순위가 있어도 최종낙찰·계약이 없으면 "1순위(낙찰 미등록)"로 두고 낙찰자로 단정하지 않습니다.</li>
          <li>낙찰금액과 최종 계약금액은 협상 과정에서 달라질 수 있습니다. 다르면 "확인할 점"에 표시합니다.</li>
          <li>키워드가 들어간 다른 사업도 함께 잡힙니다. 기관별 수주 현황에서 대상 사업만 남기면 나머지 표와 엑셀이 그 사업으로 계산됩니다.</li>
        </ul>
      </details>

      {data && (<>
        <div className="aw-summary">
          <span>사업 <b>{data.groups.length}</b>건 · 선택 <b>{sel.size}</b>건 · 관련 계약 <b>{data.related.length}</b>건</span>
          {rankState && rankState.done < rankState.total && <span className="aw-busy">개찰순위 불러오는 중 {rankState.done}/{rankState.total}</span>}
          {rankState && rankState.done >= rankState.total && rankState.failed > 0 && <span className="aw-warn">개찰순위 {rankState.failed}건을 불러오지 못했습니다(사업명을 눌러 다시 보기)</span>}
          {data.partial && <span className="aw-warn">일부 구간을 불러오지 못했습니다: {data.partial[0]}</span>}
          <button type="button" className="btn soft" onClick={exportXlsx} disabled={!sel.size}>엑셀 내보내기</button>
        </div>
        <nav className="aw-tabs" aria-label="보기">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" className={view === v.key ? 'on' : ''} aria-current={view === v.key ? 'page' : undefined} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </nav>

        {view === 'status' && (
          <div className="aw-scroll">
            <table className="aw-table">
              <thead><tr>
                <th className="ck"><input type="checkbox" aria-label="전체 선택" checked={sel.size === data.groups.length} onChange={(e) => all(e.target.checked)} /></th>
                <th>시도·기관</th><th>사업명 · 공고번호 · 배정예산</th><th>개찰</th>
                <th>1순위 · 투찰액(예산 대비)</th><th>2순위</th><th>상태</th><th>계약</th>
              </tr></thead>
              <tbody>
                {data.groups.map((g) => {
                  const f = firstOf(g); const t = g.top || {};
                  const rows = (g.ranking && g.ranking.rows) || [];
                  return [
                    <tr key={g.key} className={sel.has(g.key) ? '' : 'off'}>
                      <td className="ck"><input type="checkbox" aria-label={`${label(g)} 선택`} checked={sel.has(g.key)} onChange={() => toggle(g.key)} /></td>
                      <td className="rg" title={g.org}>{label(g)}</td>
                      <td className="nm">
                        <button type="button" className="aw-link" onClick={() => toggleOpen(g)} aria-expanded={open === g.key}>{g.name}</button>
                        <span className="no">{g.no}-{g.ord}{g.notices.length > 1 ? ` 외 공고 ${g.notices.length - 1}건` : ''}{g.budget ? ` · 예산 ${won(g.budget)}원` : ''}</span>
                        {g.flags.length > 0 && <span className="fl">{g.flags.join(' · ')}</span>}
                      </td>
                      <td className="op">{g.opening ? (<>{g.opening.at.slice(0, 10)}<span className="no">{g.opening.count ? `${g.opening.count}곳 참여` : g.opening.status}</span></>) : ''}</td>
                      <td className="fs">{f ? (<>
                        <b>{short(f.name)}</b>
                        <span className="no">{won(f.amount)}원{g.budget ? ` (${pct(f.amount, g.budget)})` : ''}</span>
                        {t.total && <span className="no">기술 {t.tech || '–'} · 가격 {t.price || '–'} · 종합 {t.total}</span>}
                      </>) : ''}</td>
                      <td className="fs">{g.second ? (<>{short(g.second.name)}{g.second.total && <span className="no">종합 {g.second.total}</span>}</>) : ''}</td>
                      <td><span className={'st ' + (STATUS_CLS[g.status] || '')}>{g.status}</span></td>
                      <td className="ct">{g.contract ? (<>
                        <span>{corpsText(g.contract)}</span>
                        <span className="no">{g.contract.date} · {won(g.contract.amount)}원</span>
                      </>) : ''}</td>
                    </tr>,
                    open === g.key && (
                      <tr key={g.key + '-d'} className="aw-detail"><td colSpan={8}>
                        <div className="aw-detail-in">
                          <div>
                            <h3>개찰순위 {rows.length ? `(${rows.length}곳)` : ''}</h3>
                            {rows.length ? (
                              <table className="aw-mini">
                                <thead><tr><th className="n">순위</th><th>업체</th><th className="n">투찰액</th><th className="n">기술</th><th className="n">가격</th><th className="n">종합</th><th>비고</th></tr></thead>
                                <tbody>{rows.map((r, i) => (
                                  <tr key={i} className={r.rank === 1 ? 'top' : r.rank == null ? 'bad' : ''}>
                                    <td className="n">{r.rank ?? '–'}</td>
                                    <td>{r.biz ? <button type="button" className="aw-link plain" title="이 업체의 낙찰 사업 보기" onClick={() => openCorp(r.biz)}>{r.name}</button> : r.name}</td>
                                    <td className="n">{won(r.amount)}</td>
                                    <td className="n">{r.tech}{r.techRaw ? ` (${r.techRaw})` : ''}</td><td className="n">{r.price}</td><td className="n">{r.total}</td><td>{r.note}</td>
                                  </tr>))}</tbody>
                              </table>
                            ) : <p className="aw-muted">개찰순위가 없습니다{g.opening ? ` (${g.opening.status}${g.opening.note ? ' · ' + g.opening.note : ''})` : ''}.</p>}
                          </div>
                          <div>
                            <h3>공고</h3>
                            <ul className="aw-list">{g.notices.map((n) => (
                              <li key={n.no + n.ord} className={n.cancelled ? 'bad' : ''}>{n.no}-{n.ord} · {n.kind || '공고'}{n.cancelled ? '(취소)' : ''} · {n.postedAt.slice(0, 10)}<br /><span>{n.name}</span></li>))}</ul>
                            {g.openings.length > 1 && (<>
                              <h3>개찰 이력</h3>
                              <ul className="aw-list">{g.openings.map((o, i) => <li key={i}>{o.at.slice(0, 10)} · {o.no} · {o.status}{o.note ? ' · ' + o.note : ''} · 참여 {o.count}</li>)}</ul>
                            </>)}
                            {g.award && (<><h3>최종낙찰</h3><p className="aw-p">{g.award.name} · {won(g.award.amount)}원 · {g.award.date}</p></>)}
                            {g.contract && (<>
                              <h3>계약 <span className="aw-muted">({g.match} 매칭)</span></h3>
                              <p className="aw-p">{g.contract.no} · {g.contract.date} · {g.contract.method} · {won(g.contract.amount)}원
                                {g.contract.url && <> · <a href={g.contract.url} target="_blank" rel="noreferrer">나라장터 계약 상세</a></>}</p>
                              <ul className="aw-list">{g.contract.corps.map((x, i) => <li key={i}>{x.role} · {x.name} · {x.kind}{x.share != null ? ` · ${x.share}%` : ''}</li>)}</ul>
                            </>)}
                          </div>
                        </div>
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        {view !== 'status' && (() => {
          const t = tables[view];
          const desc = {
            rank: '선택한 사업의 개찰순위 1위부터 끝까지입니다. 순위가 빈 줄은 부적격·제안서 미제출입니다.',
            consortium: '계약을 맺은 낙찰자의 공동수급 구성입니다. 단독 계약은 지분 100%로 봅니다.',
            company: '선택한 사업에서 업체별로 셉니다. 지분 환산 수주액 = 계약액 × 지분.',
            matrix: '업체가 각 사업에서 받은 순위입니다.',
            related: '공고와 연결되지 않은 계약입니다(운영지원·성과관리 수의계약, 설계감리, 홍보 등). 선택과 상관없이 모두 보입니다.',
          }[view];
          return (<>
            <p className="aw-muted aw-desc">{desc}</p>
            {t.rows.length ? (
              <div className="aw-scroll">
                <table className={'aw-table ' + view}>
                  <thead><tr>{t.head.map((h, i) => <th key={i} className={view === 'matrix' && i > 0 ? 'n' : undefined} title={t.titles ? t.titles[i] || undefined : undefined}>{h}</th>)}</tr></thead>
                  <tbody>{t.rows.map((r, ri) => (
                    <tr key={ri} className={view === 'rank' ? (r[2] === 1 ? 'top' : r[2] === '' ? 'bad' : '') : ''}>
                      {view === 'matrix'
                        ? r.map((v, i) => <td key={i} className={i > 0 ? 'n' + (v === 1 ? ' top' : typeof v === 'string' && i > 1 && v ? ' bad' : '') : undefined}>{v}</td>)
                        : r.map((v, i) => cell(v, i, t.head))}
                    </tr>))}</tbody>
                </table>
              </div>
            ) : <p className="aw-muted">표시할 내용이 없습니다.</p>}
          </>);
        })()}
      </>)}
      </div>
    </main>
  );
}

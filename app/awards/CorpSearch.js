'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadXlsx } from './xlsx';

// 업체로 찾기: 사업자등록번호로 업체 정보(조달청 사용자정보)와 그 업체가 대표로 낙찰받은 사업(최종낙찰)을 본다.
// 이름으로 넣으면 이미 받아 둔 낙찰·개찰·계약 자료에 나온 업체 중에서 후보를 띄운다
const won = (n) => (n ? Math.round(n).toLocaleString('ko-KR') : '');
const bizFmt = (b) => (/^\d{10}$/.test(b || '') ? `${b.slice(0, 3)}-${b.slice(3, 5)}-${b.slice(5)}` : b || '');
const short = (s) => String(s || '').replace(/주식회사|\(주\)|㈜|\(사\)|사단법인|재단법인|\(재\)/g, '').replace(/\s+/g, ' ').trim();
const rate = (r) => { const n = Number(r); return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(/\.?0+$/, '') + '%' : ''; };

function monthNow(offset = 0) {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
}

export default function CorpSearch({ initial }) {
  const [c, setC] = useState('');
  const [from, setFrom] = useState(monthNow(-11));
  const [to, setTo] = useState(monthNow());
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [cands, setCands] = useState(null);
  const [open, setOpen] = useState(null);
  const [ranks, setRanks] = useState({});
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { if (initial && initial.v) { setC(/^\d{10}$/.test(initial.v) ? bizFmt(initial.v) : initial.v); run(null, initial.v); } }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(e, value) {
    if (e) e.preventDefault();
    const v = String(value ?? c).trim();
    if (!v) { setErr('업체 이름이나 사업자등록번호를 넣어 주세요.'); return; }
    setBusy(true); setErr(''); setSec(0); setCands(null);
    const t0 = Date.now();
    clearInterval(timer.current);
    timer.current = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 500);
    try {
      const r = await fetch(`/api/awards?corp=${encodeURIComponent(v)}&from=${from}&to=${to}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다.' }));
      if (!j.ok) { setErr(j.error || '조회에 실패했습니다.'); }
      else if (j.candidates) {
        if (j.candidates.length === 1) { clearInterval(timer.current); setBusy(false); setC(bizFmt(j.candidates[0].biz)); return run(null, j.candidates[0].biz); }
        setCands(j.candidates);
        if (!j.candidates.length) setErr('받아 둔 자료에서 이 이름의 업체를 찾지 못했습니다. 사업자등록번호로 찾아 주세요.');
      } else { setData(j); setOpen(null); setRanks({}); }
    } catch { setErr('조회에 실패했습니다. 잠시 뒤 다시 시도해 주세요.'); }
    clearInterval(timer.current);
    setBusy(false);
  }

  async function toggleOpen(a) {
    const k = a.no + '-' + a.ord;
    if (open === k) { setOpen(null); return; }
    setOpen(k);
    if (ranks[k] && ranks[k].ok) return;
    try {
      const r = await fetch(`/api/awards?no=${a.no}&ord=${a.ord}`, { cache: 'no-store' });
      const rk = await r.json();
      setRanks((m) => ({ ...m, [k]: rk }));
    } catch { setRanks((m) => ({ ...m, [k]: { ok: false, error: '개찰순위를 불러오지 못했습니다.' } })); }
  }

  function exportXlsx() {
    const head = ['개찰일', '수요기관', '사업명', '공고번호', '참여 수', '낙찰금액', '낙찰률(%)', '최종낙찰일'];
    const rows = data.awards.map((a) => [a.openedAt.slice(0, 10), a.org, a.name, `${a.no}-${a.ord}`, a.count || '', a.amount || '', Number(a.rate) || '', a.awardedAt]);
    const name = short((data.info && data.info.name) || bizFmt(data.biz));
    downloadXlsx(`낙찰사업_${name}_${data.from}_${data.to}.xlsx`, [{ name: '낙찰 사업', rows: [head, ...rows], widths: [11, 28, 50, 18, 8, 14, 10, 11] }]);
  }

  const info = data && data.info;
  return (<>
    <form className="aw-form" onSubmit={run}>
      <label className="grow"><span>업체 이름 또는 사업자등록번호</span>
        <input value={c} onChange={(e) => setC(e.target.value)} placeholder="예: 581-88-00303 또는 엘리스그룹" /></label>
      <label><span>공고 게시 기간</span>
        <span className="aw-period">
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작 월" />
          <em>~</em>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} aria-label="끝 월" />
        </span></label>
      <button className="btn primary" disabled={busy}>{busy ? `조회 중 ${sec}초` : '조회'}</button>
    </form>
    <p className="aw-hint">사업자등록번호로 찾으면 기간 안에 그 업체가 대표로 낙찰받은 사업이 나옵니다(최대 12개월). 이름으로는 수주 현황에서 한 번이라도 조회된 업체 중에서 찾습니다.</p>
    {err && <p className="aw-err" role="alert">{err}</p>}

    <details className="aw-limits">
      <summary>이 화면으로 알 수 없는 것</summary>
      <ul>
        <li>낙찰받지 못한 입찰 참여는 나오지 않습니다. 나라장터 개찰결과는 업체 조건으로 찾을 수 없습니다.</li>
        <li>컨소시엄 구성원으로 참여한 사업은 나오지 않습니다. 대표사(주관)로 낙찰받은 사업만 나옵니다.</li>
        <li>수의계약·나라장터 밖 계약은 나오지 않습니다. 낙찰금액은 최종 계약금액과 다를 수 있습니다.</li>
      </ul>
    </details>

    {cands && cands.length > 0 && (
      <div className="aw-cands">
        <p className="aw-muted">이름이 맞는 업체 {cands.length}곳 — 눌러서 조회합니다.</p>
        <ul>{cands.map((x) => (
          <li key={x.biz}><button type="button" className="aw-link" onClick={() => { setC(bizFmt(x.biz)); run(null, x.biz); }}>{x.name}</button>
            <span className="aw-muted"> {bizFmt(x.biz)}</span></li>))}</ul>
      </div>
    )}

    {data && (<>
      <section className="aw-corp">
        <h2>{info ? info.name : bizFmt(data.biz)}{info && info.eng ? <span className="aw-muted"> {info.eng}</span> : null}</h2>
        {info ? (
          <dl>
            <div><dt>사업자등록번호</dt><dd>{bizFmt(data.biz)}</dd></div>
            <div><dt>대표</dt><dd>{info.ceo}</dd></div>
            <div><dt>주소</dt><dd>{info.addr}</dd></div>
            <div><dt>업무 구분</dt><dd>{[info.kinds.replace(/,/g, ', '), info.mfg].filter(Boolean).join(' · ')}</dd></div>
            {info.employees ? <div><dt>종업원</dt><dd>{info.employees}명</dd></div> : null}
            <div><dt>개업일 · 조달 등록일</dt><dd>{info.opened} · {info.registered}</dd></div>
          </dl>
        ) : <p className="aw-muted">조달청 업체 정보를 불러오지 못했습니다(조달 등록 업체가 아니거나 조회 실패).</p>}
      </section>

      <div className="aw-summary">
        <span>{data.from} ~ {data.to} 대표 낙찰 <b>{data.awards.length}</b>건{data.total ? <> · 낙찰금액 합계 <b>{won(data.total)}</b>원</> : null}</span>
        {data.partial && <span className="aw-warn">일부 구간을 불러오지 못했습니다: {data.partial[0]}</span>}
        <button type="button" className="btn soft" onClick={exportXlsx} disabled={!data.awards.length}>엑셀 내보내기</button>
      </div>

      {data.awards.length ? (
        <div className="aw-scroll">
          <table className="aw-table">
            <thead><tr><th>개찰일</th><th>수요기관</th><th>사업명 · 공고번호</th><th className="n">참여</th><th className="n">낙찰금액</th><th className="n">낙찰률</th></tr></thead>
            <tbody>
              {data.awards.map((a) => {
                const k = a.no + '-' + a.ord;
                const rk = ranks[k];
                const rows = (rk && rk.ok && rk.rows) || [];
                const mine = rows.find((r) => r.biz === data.biz);
                const second = rows.find((r) => r.rank === 2 && r.biz !== data.biz) || rows.find((r) => r.rank === 1 && r.biz !== data.biz);
                return [
                  <tr key={k}>
                    <td className="op">{(a.openedAt || a.awardedAt).slice(0, 10)}</td>
                    <td className="rg" title={a.org}>{a.region && !short(a.org).startsWith(a.region) ? a.region + ' · ' : ''}{short(a.org)}</td>
                    <td className="nm">
                      <button type="button" className="aw-link" onClick={() => toggleOpen(a)} aria-expanded={open === k}>{a.name}</button>
                      <span className="no">{k}</span>
                    </td>
                    <td className="n">{a.count ? a.count + '곳' : ''}</td>
                    <td className="n">{won(a.amount)}</td>
                    <td className="n">{rate(a.rate)}</td>
                  </tr>,
                  open === k && (
                    <tr key={k + '-d'} className="aw-detail"><td colSpan={6}>
                      {!rk ? <p className="aw-muted">개찰순위 불러오는 중…</p>
                        : !rk.ok ? <p className="aw-muted">개찰순위를 불러오지 못했습니다{rk.error ? ` (${rk.error})` : ''}.</p>
                          : !rows.length ? <p className="aw-muted">개찰순위가 없습니다.</p> : (<>
                            {mine && <p className="aw-p">이 업체 {mine.rank ? `${mine.rank}순위` : '순위 없음'}{mine.tech ? ` · 기술 ${mine.tech} · 가격 ${mine.price} · 종합 ${mine.total}` : ''}
                              {second && second.tech ? ` / ${second.rank}순위 ${short(second.name)} 기술 ${second.tech} · 가격 ${second.price}` : ''}</p>}
                            <table className="aw-mini">
                              <thead><tr><th className="n">순위</th><th>업체</th><th className="n">투찰액</th><th className="n">기술</th><th className="n">가격</th><th className="n">종합</th><th>비고</th></tr></thead>
                              <tbody>{rows.map((r, i) => (
                                <tr key={i} className={r.biz === data.biz ? 'top' : r.rank == null ? 'bad' : ''}>
                                  <td className="n">{r.rank ?? '–'}</td><td>{r.name}</td><td className="n">{won(r.amount)}</td>
                                  <td className="n">{r.tech}</td><td className="n">{r.price}</td><td className="n">{r.total}</td><td>{r.note}</td>
                                </tr>))}</tbody>
                            </table>
                          </>)}
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="aw-muted">이 기간에 대표로 낙찰받은 사업이 없습니다.</p>}
    </>)}
  </>);
}

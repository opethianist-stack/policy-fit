import index from '../../data/corpus-index.json';
import { Bars, Trend } from './Charts';
import { realStats } from '../../lib/stats';
import { quotaStats } from '../../lib/quota';

export const metadata = { title: 'Policy Fit · 관리자 대시보드' };
export const dynamic = 'force-dynamic';

// 관리자 대시보드. 이용 기록(pf_event, STEP60)을 최근 30일로 집계하고, ⑤ 색인 문서가 없는 기관을 보강 우선순위로 보인다.
// ④ 정책문서 색인 현황은 data/corpus-index.json, 맨 아래는 공공데이터포털 일일 호출 한도(STEP71).
// 예전의 시연용 예시 화면은 실제 기록이 쌓여 뺐다(STEP72, 2026-11-02 사용자 결정). 옛 주소 ?view=real도 같은 화면이다
export default async function Admin() {
  const [st, qt] = await Promise.all([realStats(30), quotaStats(30)]);
  const cat = {};
  for (const d of index.docs) cat[d.category] = (cat[d.category] || 0) + 1;
  const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const ocr = index.pages.filter((p) => p.ocr).length;
  const fmt = (t) => { const d = new Date(new Date(t).getTime() + 9 * 3600000).toISOString(); return d.slice(0, 10) + ' ' + d.slice(11, 16); };
  const builtText = fmt(index.builtAt);
  const corpus = (
    <section className="panel">
      <h2>④ 정책문서 색인 현황</h2>
      <p className="sub">색인 문서 {index.docs.length}개 · {index.pages.length.toLocaleString('ko-KR')}쪽(그중 OCR {ocr}쪽) · 갱신 {builtText}</p>
      <Bars data={cats} unit="개" />
    </section>
  );
  // 공공데이터포털 일일 호출 한도(실제 값). 응답 헤더에서 읽은 그날 사용 수라 마지막으로 부른 때 기준이다
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const hm = (t) => fmt(t).slice(11, 16);
  const meter = (used, lim) => (
    <span className="qbar" aria-hidden="true"><i className={pct(used, lim) >= 100 ? 'full' : pct(used, lim) >= 80 ? 'warn' : ''} style={{ width: pct(used, lim) + '%' }} /></span>
  );
  const quota = (
    <section className="panel quota">
      <h2>공공데이터포털 일일 호출 한도</h2>
      <p className="sub">인증키 하나에 API(오퍼레이션)마다 하루 한도가 따로 있고 자정(KST)에 다시 찹니다. 사용 수는 포털 응답 헤더에서 읽은 값이라 그 API를 마지막으로 부른 시각 기준입니다(이 작업 환경·Actions처럼 같은 키를 쓰는 다른 곳의 호출도 포함).{!qt.db ? ' DB가 연결되지 않아 이 서버 인스턴스가 본 값만 나옵니다.' : ''}</p>
      {qt.today.length ? (
        <table className="weak">
          <thead><tr><th>API</th><th className="n">오늘 사용</th><th className="n">한도</th><th className="n">남음</th><th className="bar"></th><th className="n">마지막 확인</th></tr></thead>
          <tbody>{qt.today.map((x) => (
            <tr key={x.op} className={x.used >= x.lim ? 'over' : ''}>
              <td title={x.op}>{x.label}</td><td className="n">{x.used.toLocaleString('ko-KR')}</td><td className="n">{x.lim.toLocaleString('ko-KR')}</td>
              <td className="n">{x.used >= x.lim ? '한도 초과' : (x.lim - x.used).toLocaleString('ko-KR')}</td><td className="bar">{meter(x.used, x.lim)}</td><td className="n">{hm(x.at)}</td>
            </tr>))}</tbody>
        </table>
      ) : <p className="sub">오늘은 아직 포털을 부른 기록이 없습니다.</p>}
      {qt.history.length > 0 && (<>
        <h3>최근 30일 · 운영계정 신청 판단용</h3>
        <table className="weak">
          <thead><tr><th>API</th><th className="n">하루 최대</th><th className="n">하루 평균</th><th className="bar"></th><th className="n">한도 도달</th><th className="n">기록 일수</th></tr></thead>
          <tbody>{qt.history.map((x) => (
            <tr key={x.op}>
              <td title={x.op}>{x.label}</td><td className="n">{x.peak.toLocaleString('ko-KR')} / {x.lim.toLocaleString('ko-KR')}</td><td className="n">{x.avg.toLocaleString('ko-KR')}</td>
              <td className="bar">{meter(x.peak, x.lim)}</td><td className="n">{x.hits ? x.hits + '일' : '–'}</td><td className="n">{x.days}일</td>
            </tr>))}</tbody>
        </table>
      </>)}
    </section>
  );
  const empty = <p className="sub">아직 기록이 없습니다.</p>;
  return (
    <main className="page admin">
      <div className="admin-head">
        <h1>관리자 대시보드</h1>
        <p className="admin-note">최근 30일 이용 기록입니다{st.ok && st.since ? ` (기록 시작 ${fmt(st.since).slice(0, 10)})` : ''}. 개별 이용자의 작업 내용은 보이지 않고 집계만 나옵니다.</p>
      </div>
      {!st.ok ? <p className="admin-note">{st.reason}</p> : (<>
        <section className="tiles" aria-label="최근 30일 요약">
          <div className="tile"><span className="k">최근 30일 정책 근거 검색</span><b>{st.searches.toLocaleString('ko-KR')}</b><span className="s">건</span></div>
          <div className="tile"><span className="k">이용자</span><b>{st.users}</b><span className="s">명</span></div>
          <div className="tile"><span className="k">문서 산출</span><b>{st.exports}</b><span className="s">건 · docx·PDF·장표</span></div>
          <div className="tile"><span className="k">5점 근거 없는 검색</span><b>{st.weakRate == null ? '–' : st.weakRate + '%'}</b><span className="s">색인 보강 신호</span></div>
        </section>
        <div className="admin-grid">
          <section className="panel">
            <h2>① 공고 찾기 키워드 상위 10</h2>
            <p className="sub">최근 30일, 공고 찾기(키워드)에 쓴 검색어 횟수</p>
            {st.terms.length ? <Bars data={st.terms} unit="회" /> : empty}
          </section>
          <section className="panel">
            <h2>② 일별 정책 근거 검색 수</h2>
            <p className="sub">최근 30일</p>
            <Trend data={st.daily} unit="건" />
          </section>
          <section className="panel">
            <h2>③ 근거가 약했던 발주기관</h2>
            <p className="sub">5점 근거가 하나도 없던 검색이 많은 발주기관 — 이 기관·주무부처 문서를 정책문서 폴더에 더 넣으면 좋아진다</p>
            {st.weak.length ? (
              <table className="weak">
                <thead><tr><th>발주기관</th><th>주무부처</th><th className="n">검색</th></tr></thead>
                <tbody>{st.weak.map((x) => <tr key={x.org}><td>{x.org}</td><td>{x.ministry}</td><td className="n">{x.n}</td></tr>)}</tbody>
              </table>
            ) : empty}
          </section>
          {corpus}
          <section className="panel">
            <h2>⑤ 정책문서 보강 우선순위</h2>
            <p className="sub">검색한 공고의 발주처 계보에서 색인 문서가 하나도 없던 기관 — 업무계획·사업계획 문서를 정책문서 폴더에 넣으면 다음 날 검색에 반영된다</p>
            {st.gaps.length ? (
              <table className="weak">
                <thead><tr><th>기관</th><th className="n">공고</th><th className="n">검색</th></tr></thead>
                <tbody>{st.gaps.map((x) => <tr key={x.org}><td>{x.org}</td><td className="n">{x.notices}</td><td className="n">{x.n}</td></tr>)}</tbody>
              </table>
            ) : empty}
          </section>
        </div>
        {quota}
      </>)}
      {!st.ok && quota}
    </main>
  );
}

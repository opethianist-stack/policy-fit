import index from '../../data/corpus-index.json';
import { Bars, Trend } from './Charts';
import { realStats } from '../../lib/stats';

export const metadata = { title: 'Policy Fit · 관리자 대시보드' };
export const dynamic = 'force-dynamic';

// 관리자 대시보드. 기본은 시연용 예시 화면(①~③·요약 타일 고정 예시, 사용자 결정 2026-10-01: 기록이 쌓일 때까지 시연은 예시로).
// "실제 기록"(?view=real)은 이용 기록(pf_event, STEP60)을 최근 30일로 집계하고, ⑤ 색인 문서가 없는 기관을 보강 우선순위로 보인다.
// ④ 정책문서 색인 현황은 두 화면 모두 data/corpus-index.json 실제 값이다.
const SAMPLE_TERMS = [
  ['AI 교육', 64], ['디지털 새싹', 41], ['교원 연수', 37], ['마이스터고', 29], ['평생교육', 26],
  ['AI 디지털교과서', 22], ['진로교육', 19], ['늘봄학교', 16], ['고교학점제', 12], ['디지털 튜터', 9],
];
const SAMPLE_WEAK = [
  ['정보통신산업진흥원', 14, '과학기술정보통신부'], ['한국지능정보사회진흥원', 11, '과학기술정보통신부'],
  ['대전광역시교육청', 7, '교육부'], ['한국교육개발원', 5, '국무조정실'], ['계명문화대학 산학협력단', 4, '교육부'],
];
function sampleDaily() {
  // 평일에 많고 주말에 적은 30일치(날짜는 오늘 기준, 값은 고정 패턴)
  const base = [9, 14, 17, 15, 12, 3, 2, 11, 16, 19, 18, 14, 4, 2, 13, 18, 21, 17, 15, 5, 3, 14, 20, 23, 19, 16, 4, 3, 17, 22];
  const today = new Date();
  return base.map((v, i) => {
    const d = new Date(today.getTime() - (base.length - 1 - i) * 86400000);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: v };
  });
}

export default async function Admin({ searchParams }) {
  const sp = (await searchParams) || {};
  const real = sp.view === 'real';
  const st = real ? await realStats(30) : null;
  const cat = {};
  for (const d of index.docs) cat[d.category] = (cat[d.category] || 0) + 1;
  const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const ocr = index.pages.filter((p) => p.ocr).length;
  const fmt = (t) => { const d = new Date(new Date(t).getTime() + 9 * 3600000).toISOString(); return d.slice(0, 10) + ' ' + d.slice(11, 16); };
  const builtText = fmt(index.builtAt);
  const corpus = (
    <section className="panel">
      <h2>④ 정책문서 색인 현황 <span className="tag real">실제 값</span></h2>
      <p className="sub">색인 문서 {index.docs.length}개 · {index.pages.length.toLocaleString('ko-KR')}쪽(그중 OCR {ocr}쪽) · 갱신 {builtText}</p>
      <Bars data={cats} unit="개" />
    </section>
  );
  const views = (
    <nav className="admin-views" aria-label="데이터 보기">
      <a href="/admin" className={real ? '' : 'on'} aria-current={real ? undefined : 'page'}>예시 화면</a>
      <a href="/admin?view=real" className={real ? 'on' : ''} aria-current={real ? 'page' : undefined}>실제 기록</a>
    </nav>
  );

  if (real) {
    const empty = <p className="sub">아직 기록이 없습니다.</p>;
    return (
      <main className="page admin">
        <div className="admin-head">
          <h1>관리자 대시보드</h1>
          {views}
          <p className="admin-note"><span className="tag real">실제 기록</span> 최근 30일 이용 기록입니다{st.ok && st.since ? ` (기록 시작 ${fmt(st.since).slice(0, 10)})` : ''}. 개별 이용자의 작업 내용은 보이지 않고 집계만 나옵니다.</p>
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
        </>)}
      </main>
    );
  }

  const daily = sampleDaily();
  const total = daily.reduce((s, x) => s + x.value, 0);
  return (
    <main className="page admin">
      <div className="admin-head">
        <h1>관리자 대시보드</h1>
        {views}
        <p className="admin-note"><span className="tag sample">예시 데이터</span> ①~③과 요약 타일은 화면 구성을 보여 주는 예시입니다. <span className="tag real">실제 값</span> ④ 정책문서 색인 현황은 현재 색인입니다.</p>
      </div>
      <section className="tiles" aria-label="최근 30일 요약(예시)">
        <div className="tile"><span className="k">최근 30일 검색</span><b>{total.toLocaleString('ko-KR')}</b><span className="s">건 · 예시</span></div>
        <div className="tile"><span className="k">이용자</span><b>18</b><span className="s">명 · 예시</span></div>
        <div className="tile"><span className="k">문서 산출</span><b>57</b><span className="s">건 · 예시</span></div>
        <div className="tile"><span className="k">5점 근거 없는 검색</span><b>34%</b><span className="s">색인 보강 신호 · 예시</span></div>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <h2>① 검색 키워드 상위 10 <span className="tag sample">예시</span></h2>
          <p className="sub">최근 30일, 공고 검색·정책 근거 검색에 쓰인 검색어 횟수</p>
          <Bars data={SAMPLE_TERMS.map(([label, value]) => ({ label, value }))} unit="회" />
        </section>
        <section className="panel">
          <h2>② 일별 검색 수 <span className="tag sample">예시</span></h2>
          <p className="sub">최근 30일</p>
          <Trend data={daily} unit="건" />
        </section>
        <section className="panel">
          <h2>③ 근거가 약했던 발주기관 <span className="tag sample">예시</span></h2>
          <p className="sub">5점 근거가 하나도 없던 검색이 많은 발주기관 — 이 기관·주무부처 문서를 정책문서 폴더에 더 넣으면 좋아진다</p>
          <table className="weak">
            <thead><tr><th>발주기관</th><th>주무부처</th><th className="n">검색</th></tr></thead>
            <tbody>{SAMPLE_WEAK.map(([o, n, m]) => <tr key={o}><td>{o}</td><td>{m}</td><td className="n">{n}</td></tr>)}</tbody>
          </table>
        </section>
        {corpus}
      </div>
    </main>
  );
}

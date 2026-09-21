const STEPS = [
  ['1', '공고번호 입력', '나라장터 입찰공고정보서비스로 공고 조회·분석'],
  ['2', '발주처 계보 자동 매핑', '공공기관 정보 조회 서비스로 발주처 → 산하·유관기관 → 주무부처'],
  ['3', '지식베이스 정책 근거 검색', '구글드라이브에 적재한 정책문서 코퍼스에서 연관 정책 과제 검색'],
  ['4', '정책 근거 카드 생성', '원문 발췌 · 문서명·발행연도·페이지 · 역할 · 원문 링크'],
  ['5', '정책 근거 선택', '담당자가 원문을 대조하고 쓸 근거만 선택'],
  ['6', '초안 생성', "'사업 이해도·추진 배경' 초안, 출처 미확보 문장은 출력 단계에서 차단"],
  ['7', '문서 산출', 'docx · hwpx로 4~5페이지 이내 문서 산출'],
  ['8', '장표 구도 추천', '근거 구성에 맞는 장표 구도를 실제 문구가 채워진 16:9 목업으로 제시 (PPT 제작 제외)'],
];

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="eyebrow">KMA AI 스프린트 · 바이브코딩 트랙</div>
        <h1 style={{ marginBottom: 12 }}>공고번호 하나로, 근거부터 장표 구도까지</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--slate)', margin: 0, maxWidth: 640 }}>
          입찰공고의 발주처 소속 계보를 자동으로 매핑하고, 구글드라이브 지식베이스에서 출처가 확인된
          정책 문장만 정책 근거 카드로 정리합니다.
        </p>

        <div className="tiles">
          <a className="tile" href="/prototype">
            <div className="t">프로토타입</div>
            <div className="d">홈 · 정책 근거 검색 · 정책 근거 선택 · 문서 산출 · 구도 추천 5개 화면</div>
          </a>
          <a className="tile" href="/api-test">
            <div className="t">API 연결 테스트</div>
            <div className="d">활용신청 완료된 오픈API 4종의 실제 호출·응답 형태 확인</div>
          </a>
        </div>

        <div className="steplist">
          <h2 style={{ marginBottom: 4 }}>처리 흐름</h2>
          {STEPS.map(([n, t, d]) => (
            <div className="steprow" key={n}>
              <div className="no">{n}</div>
              <div className="tx">
                <b>{t}</b>
                <div className="src">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

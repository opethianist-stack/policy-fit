export const metadata = { title: 'Policy Fit · 개인정보처리방침' };

// 구글 로그인(OAuth) 앱 게시에 필요한 공개 페이지. 로그인 없이 열린다.
// 받는 정보·보관 방식이 바뀌면(예: 검색 기록을 서버에 남기기 시작하면) 이 페이지를 먼저 고친다.
export default function Privacy() {
  return (
    <main className="page policy">
      <h1>개인정보처리방침</h1>
      <p className="lead">AI미래교육본부(이하 &lsquo;운영자&rsquo;)는 Policy Fit(이하 &lsquo;서비스&rsquo;) 이용자의 개인정보를 아래와 같이 처리합니다.</p>

      <h2>1. 수집하는 항목</h2>
      <p>서비스는 Google 계정으로 로그인할 때 Google이 제공하는 다음 정보만 받습니다.</p>
      <ul>
        <li>이메일 주소</li>
        <li>이름</li>
        <li>프로필 사진 주소</li>
      </ul>
      <p>그 밖의 Google 계정 정보(연락처, 드라이브 파일, 메일 등)에는 접근하지 않습니다.</p>

      <h2>2. 이용 목적</h2>
      <ul>
        <li>로그인한 이용자 확인</li>
        <li>관리자와 일반 사용자 구분(관리자 기능 표시 여부 결정)</li>
        <li>화면에 로그인한 계정 정보 표시</li>
      </ul>

      <h2>3. 보관 방법과 기간</h2>
      <ul>
        <li>받은 정보는 별도의 데이터베이스에 저장하지 않고, 로그인 상태를 유지하기 위한 암호화된 쿠키에만 담깁니다.</li>
        <li>쿠키는 로그아웃하거나 유효기간(최대 30일)이 지나면 삭제됩니다.</li>
        <li>최근 검색 목록과 작업 내용은 이용자의 브라우저 저장소(localStorage)에만 저장되며 운영자에게 전송되지 않습니다. 브라우저에서 직접 삭제할 수 있습니다.</li>
      </ul>

      <h2>4. 제3자 제공과 처리 위탁</h2>
      <ul>
        <li>개인정보를 제3자에게 제공하지 않습니다.</li>
        <li>서비스는 Vercel Inc.의 호스팅 환경에서 운영되며, 로그인 요청이 처리되는 과정에서 위 정보가 이 환경을 거칩니다.</li>
        <li>AI 기능(검색어 추천, 관련도 판정, 초안 작성 등)에는 공고 내용과 정책문서 발췌만 Anthropic의 API로 전송되며, 로그인 정보는 전송되지 않습니다.</li>
        <li>로그인 화면의 소개 영상은 YouTube(Google)의 개인정보 보호 강화 모드(youtube-nocookie.com)로 재생됩니다. 영상을 불러오는 과정에서 YouTube가 접속 기기·브라우저 정보를 받을 수 있으며, 이는 YouTube의 개인정보처리방침을 따릅니다.</li>
      </ul>

      <h2>5. 이용자의 권리</h2>
      <p>이용자는 언제든지 로그아웃할 수 있고, Google 계정의 <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">서드파티 연결 관리</a>에서 서비스와의 연결을 해제할 수 있습니다.</p>

      <h2>6. 문의</h2>
      <p>AI미래교육본부 · <a href="mailto:kmauni8@gmail.com">kmauni8@gmail.com</a></p>

      <p className="date">시행일: 2026년 9월 30일</p>
    </main>
  );
}

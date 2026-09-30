import { NextResponse } from 'next/server';
import { auth, isAdminEmail, AUTH_OFF } from './auth';

// 앱 전체 로그인 필수. 예외: 로그인 화면, 개인정보처리방침(구글 앱 게시 요건이라 공개), 로그인 처리 경로, 글꼴 파일·마스코트(로그인 화면도 쓴다).
// 로그인 안 한 요청: 화면은 /login으로 보내고, API는 401 JSON(화면이 오류 문구로 보여 준다).
// 관리자만: API 연결 테스트 화면, 관리자 대시보드, /api/proxy(서버 인증키로 외부 API를 부르는 통로)
const PUBLIC = [/^\/login(?:\/|$)/, /^\/privacy(?:\/|$)/, /^\/api\/auth\//, /^\/fonts\//, /^\/mascot\.svg$/];
const ADMIN_ONLY = [/^\/api-test(?:\/|$)/, /^\/api\/proxy(?:\/|$)/, /^\/admin(?:\/|$)/];

export default auth((req) => {
  if (AUTH_OFF) return;
  const p = req.nextUrl.pathname;
  if (PUBLIC.some((r) => r.test(p))) return;
  const user = req.auth && req.auth.user;
  const isApi = p.startsWith('/api/');
  if (!user) {
    if (isApi) return NextResponse.json({ ok: false, error: '로그인이 필요합니다. 새로고침해 다시 로그인해 주세요.' }, { status: 401 });
    const to = new URL('/login', req.nextUrl);
    if (p !== '/') to.searchParams.set('next', p + req.nextUrl.search);
    return NextResponse.redirect(to);
  }
  if (ADMIN_ONLY.some((r) => r.test(p)) && !isAdminEmail(user.email)) {
    if (isApi) return NextResponse.json({ ok: false, error: '관리자만 쓸 수 있습니다.' }, { status: 403 });
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }
});

// 정적 빌드 파일만 빼고 모두(public 폴더의 prototype.html·manual.pdf·flow 이미지 포함) 검사한다
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// 구글 로그인(Auth.js v5). 앱 전체가 로그인해야 쓸 수 있다(middleware.js).
// 환경변수(Vercel): AUTH_GOOGLE_ID · AUTH_GOOGLE_SECRET(구글 OAuth 클라이언트), AUTH_SECRET(쿠키 암호화 열쇠),
// ADMIN_EMAILS(쉼표로 여러 개, 관리자: API 연결 테스트·/api/proxy). 받는 정보는 이메일·이름·프로필 사진뿐이고
// DB 없이 암호화 쿠키(JWT)에만 둔다 — 바꾸면 /privacy(개인정보처리방침)를 먼저 고친다.
export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function isAdminEmail(email) {
  return !!email && adminEmails().includes(String(email).trim().toLowerCase());
}
// 로컬 시험(next start로 API·화면 점검)용 로그인 끄기. Vercel에서는 값이 있어도 무시한다
export const AUTH_OFF = process.env.POLICYFIT_AUTH_DISABLED === '1' && !process.env.VERCEL;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    jwt({ token }) {
      token.role = isAdminEmail(token.email) ? 'admin' : 'user';
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.role = token.role === 'admin' ? 'admin' : 'user';
      return session;
    },
  },
});

// 서버 컴포넌트·라우트에서 쓰는 현재 사용자. 로그인을 껐으면 로컬 관리자로 본다
export async function currentUser() {
  if (AUTH_OFF) return { email: 'local@test', name: '로컬 시험', role: 'admin' };
  const s = await auth();
  if (!s || !s.user) return null;
  return { email: s.user.email, name: s.user.name, image: s.user.image, role: isAdminEmail(s.user.email) ? 'admin' : 'user' };
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { signIn, currentUser } from '../../auth';

// 로그인 화면 왼쪽 영상(한국능률협회 소개). 개인정보 보호 강화 모드, 소리 끄고 자동 재생·반복. /privacy 4항에 적어 둠
const VIDEO_ID = 'MVqQQEluTLU';
const VIDEO = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${VIDEO_ID}&rel=0&playsinline=1`;

export const metadata = { title: 'Policy Fit · 로그인' };

// 로그인 뒤 돌아갈 주소는 같은 사이트 경로만 받는다(외부 주소로 보내는 통로가 되지 않게)
function safeNext(v) {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/login') ? s : '/';
}
const ERRORS = {
  AccessDenied: '이 계정으로는 로그인할 수 없습니다. 테스트 사용자로 등록된 계정인지 확인해 주세요.',
  Configuration: '로그인 설정에 문제가 있습니다. 관리자에게 알려 주세요.',
};

export default async function Login({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp && sp.next);
  if (await currentUser()) redirect(next);
  const err = sp && sp.error ? ERRORS[sp.error] || '로그인하지 못했습니다. 다시 시도해 주세요.' : '';
  async function go() {
    'use server';
    await signIn('google', { redirectTo: next });
  }
  return (
    <main className="login">
      <div className="login-in">
      <section className="login-video">
        <iframe src={VIDEO} title="한국능률협회 소개 영상" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </section>
      <div className="login-box">
        <div className="login-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
        </div>
        <h1>Policy Fit</h1>
        <p>입찰 공고에서 정책 근거까지, 사업 이해도를 높이는 초안 완성</p>
        {err ? <div className="login-err">{err}</div> : null}
        <form action={go}>
          <button type="submit" className="gbtn">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.6-.4-3.9z" /></svg>
            Google 계정으로 로그인
          </button>
        </form>
        <p className="login-note">로그인하면 Google 계정의 이메일·이름·프로필 사진을 로그인 확인에만 씁니다. <Link href="/privacy">개인정보처리방침</Link></p>
      </div>
      </div>
    </main>
  );
}

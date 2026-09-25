import { redirect } from 'next/navigation';

// 예전 주소. 공유된 링크가 깨지지 않게 새 주소로 넘긴다.
export default function PrototypePage() {
  redirect('/search');
}

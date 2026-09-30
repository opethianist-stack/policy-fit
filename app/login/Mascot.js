'use client';

import { useEffect, useRef } from 'react';

// 마스코트: 왼쪽 위 KMA 로고 가운데에서 튀어나와 가운데 카드를 한 바퀴 돌고 자리(.login-spot)에 앉아 둥둥 뜬다.
// 30초마다 자리에서 다시 카드를 한 바퀴 돈다. 움직임 줄이기 설정이면 자리에 그대로 둔다.
const DUR = 6000; // 한 바퀴(ms)
const AGAIN = 30000; // 다시 돌 때까지(ms)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function Mascot() {
  const el = useRef(null);
  useEffect(() => {
    const m = el.current;
    const root = m && m.closest('.login');
    if (!root) return;
    const card = root.querySelector('.login-card');
    const spot = root.querySelector('.login-spot');
    const logo = root.querySelector('.login-top');
    let raf = 0, timer = 0, stop = false, flying = false;

    // 모든 좌표는 .login 기준(zoom 배율을 고려해 offset 값으로 잰다)
    const box = (n) => { let x = 0, y = 0; for (let e = n; e && e !== root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y, w: n.offsetWidth, h: n.offsetHeight }; };
    const place = (x, y, s, o) => { m.style.transform = `translate(${x}px, ${y}px) scale(${s})`; m.style.opacity = o; };
    const rest = () => { const s = box(spot); m.style.width = s.w + 'px'; place(s.x, s.y, 1, 1); };

    function fly(fromLogo) {
      flying = true;
      const s = box(spot), c = box(card), rw = root.offsetWidth, rh = root.offsetHeight;
      const size = s.w;
      m.style.width = size + 'px';
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const rx = Math.min(c.w / 2 + size * 0.35, rw / 2 - size / 2 - 4);
      const ry = Math.min(c.h / 2 + size * 0.15, cy - size / 2 - 4, rh - cy - size / 2 - 4);
      const start = fromLogo ? (() => { const l = box(logo); return { x: l.x + l.w / 2, y: l.y + l.h / 2 }; })() : { x: s.x + size / 2, y: s.y + size / 2 };
      const end = { x: s.x + size / 2, y: s.y + size / 2 };
      const a0 = Math.atan2((start.y - cy) / ry, (start.x - cx) / rx);
      let a1 = Math.atan2((end.y - cy) / ry, (end.x - cx) / rx);
      while (a1 < a0) a1 += Math.PI * 2;
      a1 += Math.PI * 2; // 한 바퀴 더(시계 방향)
      const t0 = performance.now();
      const step = (now) => {
        if (stop) return;
        const t = Math.min(1, (now - t0) / DUR), e = ease(t);
        const a = a0 + (a1 - a0) * e;
        let x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
        const wi = 1 - smooth(0, 0.14, e), wo = smooth(0.86, 1, e);
        x = x + (start.x - x) * wi; y = y + (start.y - y) * wi;
        x = x + (end.x - x) * wo; y = y + (end.y - y) * wo;
        const sc = fromLogo ? 0.2 + 0.8 * smooth(0, 0.18, t) : 1;
        place(x - size / 2, y - size / 2, sc, fromLogo ? smooth(0, 0.06, t) : 1);
        if (t < 1) raf = requestAnimationFrame(step); else { flying = false; rest(); timer = setTimeout(() => fly(false), AGAIN); }
      };
      raf = requestAnimationFrame(step);
    }

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) rest(); else timer = setTimeout(() => fly(true), 400);
    const onResize = () => { if (!flying) rest(); };
    window.addEventListener('resize', onResize);
    return () => { stop = true; cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, []);
  return <div className="login-mascot" ref={el} aria-hidden="true"><img src="/mascot.svg" alt="" width="200" height="200" /></div>;
}

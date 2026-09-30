// 로그인 화면 왼쪽 장면: 코린트 양식 대문 + 현대식 "입찰" 간판. 마스코트가 날아와 문을 열어 준다(CSS 애니메이션, 한 번만).
// 건축물은 SVG(viewBox 560×520), 문짝은 3D로 돌아가야 해서 HTML(.gate-doors)로 겹친다 — 문 자리 좌표는 SVG와 같은 비율(%)로 맞춘다.
// 움직임 줄이기 설정이면 문이 열린 마지막 모습만 보여 준다(globals.css).

// 코린트 기둥 하나(너비 60, 높이 316): 위부터 주두(아바쿠스·소용돌이·아칸서스 잎 두 줄) → 홈 파인 기둥몸 → 받침
function Column({ x, y }) {
  const leafTop = [12, 21, 30, 39, 48];
  const leafLow = [8, 18, 30, 42, 52];
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* 기둥몸(아래로 조금 넓어짐)과 세로 홈 */}
      <path d="M9 58 H51 L52.5 276 H7.5 Z" fill="#fff" stroke="var(--gate-line)" />
      {[15, 21, 27, 33, 39, 45].map((fx) => <line key={fx} x1={fx} y1="64" x2={fx + (fx < 30 ? -0.4 : 0.4)} y2="270" stroke="var(--gate-flute)" />)}
      {/* 주두: 종 모양 몸 → 아칸서스 아랫줄·윗줄 → 소용돌이 → 아바쿠스 */}
      <path d="M8 12 H52 L47 56 H13 Z" fill="var(--gate-shade)" stroke="var(--gate-line)" />
      {leafLow.map((lx) => <path key={'l' + lx} d={`M${lx} 56 C${lx - 4} 46 ${lx - 1} 38 ${lx + 1} 34 C${lx + 3} 38 ${lx + 6} 46 ${lx + 2} 56 Z`} fill="#fff" stroke="var(--gate-line)" />)}
      {leafTop.map((lx) => <path key={'t' + lx} d={`M${lx} 44 C${lx - 5} 34 ${lx - 2} 22 ${lx + 1} 18 C${lx + 4} 22 ${lx + 7} 34 ${lx + 2} 44 Z`} fill="#fff" stroke="var(--gate-line)" />)}
      <path d="M-2 0 H62 L58 9 H2 Z" fill="#fff" stroke="var(--gate-line)" />
      {[[3, 15], [57, 15]].map(([cx, cy]) => (
        <g key={cx}><circle cx={cx} cy={cy} r="6" fill="#fff" stroke="var(--gate-line)" /><circle cx={cx} cy={cy} r="2.4" fill="none" stroke="var(--gate-line)" /></g>
      ))}
      <circle cx="30" cy="5" r="2.6" fill="var(--gate-accent)" />
      <rect x="10" y="55" width="40" height="4" rx="2" fill="#fff" stroke="var(--gate-line)" />
      {/* 받침: 둥근 테 두 개 사이 오목한 띠, 맨 아래 사각 받침돌 */}
      <rect x="4" y="276" width="52" height="10" rx="5" fill="#fff" stroke="var(--gate-line)" />
      <rect x="7" y="286" width="46" height="6" fill="var(--gate-shade)" stroke="var(--gate-line)" />
      <rect x="2" y="292" width="56" height="10" rx="5" fill="#fff" stroke="var(--gate-line)" />
      <rect x="0" y="302" width="60" height="14" fill="#fff" stroke="var(--gate-line)" />
    </g>
  );
}

export default function Gate() {
  return (
    <div className="gate" aria-hidden="true">
      <svg className="gate-arch" viewBox="0 0 560 520" preserveAspectRatio="xMidYMid meet">
        {/* 벽(돌 줄눈) */}
        <rect x="72" y="184" width="416" height="316" fill="var(--gate-wall)" stroke="var(--gate-line)" />
        {[224, 264, 304, 344, 384, 424, 464].map((wy) => <line key={wy} x1="72" y1={wy} x2="488" y2={wy} stroke="var(--gate-joint)" />)}
        {/* 문틀: 몰딩 두 겹 + 이맛돌 */}
        <rect x="174" y="204" width="212" height="296" fill="#fff" stroke="var(--gate-line)" />
        <rect x="181" y="211" width="198" height="289" fill="none" stroke="var(--gate-line)" />
        <path d="M268 204 L292 204 L288 222 L272 222 Z" fill="#fff" stroke="var(--gate-line)" />
        {/* 문 안쪽(빛) 자리 — 실제 빛과 문짝은 HTML이 덮는다 */}
        <rect x="185" y="214" width="190" height="286" fill="var(--gate-in)" />
        <Column x={100} y={184} />
        <Column x={400} y={184} />
        {/* 엔태블러처: 아키트레이브 → 프리즈(작은 원 장식) → 이빨 장식 → 코니스 */}
        <rect x="84" y="166" width="392" height="18" fill="#fff" stroke="var(--gate-line)" />
        <line x1="84" y1="175" x2="476" y2="175" stroke="var(--gate-joint)" />
        <rect x="80" y="140" width="400" height="26" fill="var(--gate-shade)" stroke="var(--gate-line)" />
        {[112, 150, 410, 448].map((rx) => <circle key={rx} cx={rx} cy="153" r="5" fill="#fff" stroke="var(--gate-line)" />)}
        {Array.from({ length: 34 }, (_, i) => <rect key={i} x={78 + i * 12} y="132" width="7" height="8" fill="#fff" stroke="var(--gate-line)" />)}
        <rect x="66" y="122" width="428" height="10" fill="#fff" stroke="var(--gate-line)" />
        {/* 박공(삼각 지붕)과 꼭대기 장식 */}
        <path d="M66 122 L280 44 L494 122 Z" fill="#fff" stroke="var(--gate-line)" />
        <path d="M100 116 L280 56 L460 116 Z" fill="var(--gate-shade)" stroke="var(--gate-line)" />
        <path d="M272 44 C272 32 288 32 288 44 Z" fill="#fff" stroke="var(--gate-line)" />
        {/* 계단 */}
        <rect x="60" y="500" width="440" height="10" fill="#fff" stroke="var(--gate-line)" />
        <rect x="40" y="510" width="480" height="10" fill="#fff" stroke="var(--gate-line)" />
        {/* 현대식 간판: 박공 앞에 매단 군청 패널 + 켜지는 빛 줄 */}
        <line x1="236" y1="72" x2="236" y2="84" stroke="var(--gate-dark)" strokeWidth="2" />
        <line x1="324" y1="72" x2="324" y2="84" stroke="var(--gate-dark)" strokeWidth="2" />
        <rect x="212" y="82" width="136" height="54" rx="6" fill="var(--gate-dark)" />
        <text x="280" y="116" textAnchor="middle" className="gate-sign-text">입찰</text>
        <rect className="gate-sign-led" x="236" y="125" width="88" height="3" rx="1.5" />
      </svg>
      {/* 문짝 두 짝(3D로 열린다)과 문 안쪽 빛. 좌표: x 185~375, y 214~500 */}
      <div className="gate-doorway">
        <div className="gate-light" />
        <div className="gate-door l"><i /><i /><b /></div>
        <div className="gate-door r"><i /><i /><b /></div>
      </div>
      <div className="gate-mascot"><img src="/mascot.svg" alt="" width="150" height="150" /></div>
    </div>
  );
}

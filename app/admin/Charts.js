'use client';

import { useState } from 'react';

// 단색(파랑) 가로 막대. 막대마다 값·항목을 적고, 올리면 툴팁
export function Bars({ data, unit }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars" role="table">
      {data.map((d) => (
        <div className="bar-row" role="row" key={d.label} title={`${d.label} ${d.value.toLocaleString('ko-KR')}${unit}`}>
          <span className="bl" role="cell">{d.label}</span>
          <span className="bt" role="cell"><i style={{ width: `${(d.value / max) * 100}%` }} /></span>
          <span className="bv" role="cell">{d.value.toLocaleString('ko-KR')}</span>
        </div>
      ))}
    </div>
  );
}

// 단색 선 그래프 + 마우스 위치의 날짜 값(십자선·툴팁)
export function Trend({ data, unit }) {
  const [hi, setHi] = useState(-1);
  const W = 560, H = 190, L = 30, R = 10, T = 12, B = 26;
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = Math.ceil(max / 5) * 5;
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
  const area = `${path}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, top / 2, top];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(data.length - 1, Math.round(((px - L) / (W - L - R)) * (data.length - 1)))));
  };
  const last = data.length - 1;
  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHi(-1)} role="img" aria-label={`일별 검색 수, 마지막 날 ${data[last].value}${unit}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="ax">{t}</text>
          </g>
        ))}
        {data.map((d, i) => (i % 7 === last % 7 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="ax">{d.label}</text> : null))}
        <path d={area} className="area" />
        <path d={path} className="line" />
        <circle cx={x(last)} cy={y(data[last].value)} r="4" className="dot" />
        {hi >= 0 ? (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={T} y2={y(0)} className="cross" />
            <circle cx={x(hi)} cy={y(data[hi].value)} r="4.5" className="dot" />
          </g>
        ) : null}
      </svg>
      <div className="tip" aria-hidden={hi < 0} style={{ opacity: hi < 0 ? 0 : 1, left: hi < 0 ? 0 : `${(x(hi) / W) * 100}%` }}>
        {hi >= 0 ? `${data[hi].label} · ${data[hi].value}${unit}` : ''}
      </div>
    </div>
  );
}

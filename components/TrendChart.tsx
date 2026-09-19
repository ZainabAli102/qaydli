'use client';

// Tiny inline-SVG trend chart: two lines (in, out) with the profit area shaded.
// Tapping a month calls onMonthClick. No external chart library.

export interface TrendPoint {
  month: string;
  in: number;
  out: number;
  profit: number;
}

export function TrendChart({
  data,
  onMonthClick,
}: {
  data: TrendPoint[];
  onMonthClick?: (month: string) => void;
}) {
  const W = 320;
  const H = 150;
  const padX = 8;
  const padTop = 8;
  const padBottom = 22;
  const n = data.length;

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  const minProfit = Math.min(0, ...data.map((d) => d.profit));
  const top = maxVal;
  const bottom = minProfit;
  const span = top - bottom || 1;

  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => padTop + ((top - v) / span) * (H - padTop - padBottom);

  const line = (key: 'in' | 'out') => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d[key])}`).join(' ');

  // Profit area: from the zero baseline down/up to each profit point.
  const zeroY = y(0);
  const profitArea =
    `M${x(0)},${zeroY} ` +
    data.map((d, i) => `L${x(i)},${y(d.profit)}`).join(' ') +
    ` L${x(n - 1)},${zeroY} Z`;

  const shortMonth = (m: string) => m.slice(5); // 'MM'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="6-month trend">
      {/* zero baseline */}
      <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} stroke="#e2e8f0" strokeWidth={1} />
      {/* profit area */}
      <path d={profitArea} fill="#0f766e" fillOpacity={0.12} stroke="none" />
      {/* out line */}
      <path d={line('out')} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinejoin="round" />
      {/* in line */}
      <path d={line('in')} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinejoin="round" />
      {/* points + tap targets + labels */}
      {data.map((d, i) => (
        <g key={d.month}>
          <circle cx={x(i)} cy={y(d.in)} r={2.5} fill="#16a34a" />
          <circle cx={x(i)} cy={y(d.out)} r={2.5} fill="#ef4444" />
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {shortMonth(d.month)}
          </text>
          <rect
            x={x(i) - (W - 2 * padX) / (2 * Math.max(1, n - 1))}
            y={0}
            width={(W - 2 * padX) / Math.max(1, n - 1)}
            height={H - padBottom + 6}
            fill="transparent"
            style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
            onClick={() => onMonthClick?.(d.month)}
          />
        </g>
      ))}
    </svg>
  );
}

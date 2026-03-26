'use client';

import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  className?: string;
}

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  color = '#22d3ee',
  fillColor,
  className = '',
}: SparklineProps) {
  const { path, fillPath, gradientId } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', fillPath: '', gradientId: '' };
    }

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const padding = 2;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    const points = data.map((value, index) => ({
      x: padding + (index / (data.length - 1)) * drawWidth,
      y: padding + drawHeight - ((value - min) / range) * drawHeight,
    }));

    // build smooth curve using cubic bezier
    let d = `M ${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const prev = points[i - 1] || current;
      const afterNext = points[i + 2] || next;

      const tension = 0.3;
      const cp1x = current.x + (next.x - prev.x) * tension;
      const cp1y = current.y + (next.y - prev.y) * tension;
      const cp2x = next.x - (afterNext.x - current.x) * tension;
      const cp2y = next.y - (afterNext.y - current.y) * tension;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
    }

    const fillD =
      d +
      ` L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

    const id = `sparkline-grad-${Math.random().toString(36).slice(2, 9)}`;

    return { path: d, fillPath: fillD, gradientId: id };
  }, [data, width, height]);

  if (!data || data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          x1={4}
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke={color}
          strokeOpacity={0.3}
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      </svg>
    );
  }

  const resolvedFill = fillColor || color;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={resolvedFill} stopOpacity={0.3} />
          <stop offset="100%" stopColor={resolvedFill} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

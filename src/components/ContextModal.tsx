'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ContextSnapshot {
  timestamp: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageIndex: number;
}

interface ContextModalData {
  projectName: string;
  sessionId: string;
  model: string;
  firstPrompt: string;
  lastPrompt: string;
  firstTimestamp: string;
  lastTimestamp: string;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  contextSnapshots: ContextSnapshot[];
}

interface ContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ContextModalData | null;
}

type TabId = 'overview' | 'first-prompt' | 'last-prompt' | 'token-usage' | 'context-timeline';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'first-prompt', label: 'First Prompt' },
  { id: 'last-prompt', label: 'Last Prompt' },
  { id: 'token-usage', label: 'Token Usage' },
  { id: 'context-timeline', label: 'Context Timeline' },
];

function formatTokenCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function renderPromptWithCodeBlocks(text: string) {
  if (!text) return <span className="text-slate-500 italic">No prompt data</span>;

  // split on code fences
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const newlineIdx = inner.indexOf('\n');
      const lang = newlineIdx > -1 ? inner.slice(0, newlineIdx).trim() : '';
      const code = newlineIdx > -1 ? inner.slice(newlineIdx + 1) : inner;

      return (
        <div key={i} className="my-2 rounded-lg overflow-hidden border border-white/[0.06]">
          {lang && (
            <div className="px-3 py-1 bg-white/[0.04] text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
              {lang}
            </div>
          )}
          <pre className="p-3 bg-white/[0.02] overflow-x-auto">
            <code
              className="text-xs text-emerald-300 leading-relaxed"
              style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
            >
              {code}
            </code>
          </pre>
        </div>
      );
    }

    return (
      <span key={i} className="whitespace-pre-wrap break-words">
        {part}
      </span>
    );
  });
}

// donut chart for token usage
function DonutChart({
  segments,
  size = 180,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-slate-500 text-sm"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  const radius = (size - 20) / 2;
  const center = size / 2;
  const strokeWidth = 24;
  const innerRadius = radius - strokeWidth / 2;

  let currentAngle = -Math.PI / 2;

  const arcs = segments
    .filter((s) => s.value > 0)
    .map((segment) => {
      const angle = (segment.value / total) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const largeArc = angle > Math.PI ? 1 : 0;

      const x1 = center + innerRadius * Math.cos(startAngle);
      const y1 = center + innerRadius * Math.sin(startAngle);
      const x2 = center + innerRadius * Math.cos(endAngle - 0.01);
      const y2 = center + innerRadius * Math.sin(endAngle - 0.01);

      const d = `M ${x1} ${y1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${x2} ${y2}`;

      return { ...segment, d };
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* background ring */}
      <circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={strokeWidth}
      />
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={arc.d}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
      {/* center text */}
      <text
        x={center}
        y={center - 6}
        textAnchor="middle"
        className="text-xl font-bold"
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
        fill="#e2e8f0"
        fontSize="18"
      >
        {formatTokenCount(total)}
      </text>
      <text
        x={center}
        y={center + 12}
        textAnchor="middle"
        fill="#64748b"
        fontSize="10"
      >
        total tokens
      </text>
    </svg>
  );
}

// line chart for context timeline
function TimelineChart({
  snapshots,
  width = 600,
  height = 200,
}: {
  snapshots: ContextSnapshot[];
  width?: number;
  height?: number;
}) {
  if (!snapshots || snapshots.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-slate-500 text-sm rounded-lg bg-white/[0.02] border border-white/[0.06]"
        style={{ width: '100%', height }}
      >
        Not enough data points for timeline
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxTokens = Math.max(...snapshots.map((s) => s.totalTokens));
  const maxIndex = Math.max(...snapshots.map((s) => s.messageIndex));

  const scaleX = (idx: number) =>
    padding.left + (idx / Math.max(maxIndex, 1)) * chartWidth;
  const scaleY = (val: number) =>
    padding.top + chartHeight - (val / Math.max(maxTokens, 1)) * chartHeight;

  // total tokens line
  const totalPath = snapshots
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(s.messageIndex)} ${scaleY(s.totalTokens)}`)
    .join(' ');

  // input tokens line
  const inputPath = snapshots
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(s.messageIndex)} ${scaleY(s.inputTokens)}`)
    .join(' ');

  // output tokens line
  const outputPath = snapshots
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(s.messageIndex)} ${scaleY(s.outputTokens)}`)
    .join(' ');

  // fill under total
  const fillPath =
    totalPath +
    ` L ${scaleX(snapshots[snapshots.length - 1].messageIndex)} ${scaleY(0)}` +
    ` L ${scaleX(snapshots[0].messageIndex)} ${scaleY(0)} Z`;

  // y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxTokens));

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={scaleY(tick)}
            x2={width - padding.right}
            y2={scaleY(tick)}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="4 4"
          />
          <text
            x={padding.left - 8}
            y={scaleY(tick) + 4}
            textAnchor="end"
            fill="#64748b"
            fontSize="9"
            style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
          >
            {formatTokenCount(tick)}
          </text>
        </g>
      ))}

      {/* x-axis label */}
      <text
        x={width / 2}
        y={height - 4}
        textAnchor="middle"
        fill="#64748b"
        fontSize="9"
      >
        Message Index
      </text>

      {/* fill */}
      <path d={fillPath} fill="url(#timeline-fill)" />

      {/* lines */}
      <path d={inputPath} fill="none" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.7" />
      <path d={outputPath} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeOpacity="0.7" />
      <path d={totalPath} fill="none" stroke="#22d3ee" strokeWidth="2" />

      {/* dots on total line */}
      {snapshots.map((s, i) => (
        <circle
          key={i}
          cx={scaleX(s.messageIndex)}
          cy={scaleY(s.totalTokens)}
          r={2.5}
          fill="#22d3ee"
          stroke="#0f172a"
          strokeWidth={1}
        />
      ))}

      {/* legend */}
      <g transform={`translate(${padding.left + 10}, ${padding.top})`}>
        <circle cx={0} cy={0} r={3} fill="#22d3ee" />
        <text x={8} y={3} fill="#94a3b8" fontSize="9">Total</text>
        <circle cx={60} cy={0} r={3} fill="#34d399" />
        <text x={68} y={3} fill="#94a3b8" fontSize="9">Input</text>
        <circle cx={115} cy={0} r={3} fill="#a78bfa" />
        <text x={123} y={3} fill="#94a3b8" fontSize="9">Output</text>
      </g>
    </svg>
  );
}

function OverviewTab({ data }: { data: ContextModalData }) {
  const stats = [
    { label: 'Model', value: data.model },
    { label: 'Messages', value: data.messageCount.toLocaleString() },
    { label: 'Total Tokens', value: formatTokenCount(data.totalTokens) },
    { label: 'Input Tokens', value: formatTokenCount(data.totalInputTokens) },
    { label: 'Output Tokens', value: formatTokenCount(data.totalOutputTokens) },
    { label: 'Cache Write', value: formatTokenCount(data.totalCacheCreationTokens) },
    { label: 'Cache Read', value: formatTokenCount(data.totalCacheReadTokens) },
    { label: 'Started', value: formatDate(data.firstTimestamp) },
    { label: 'Last Activity', value: formatDate(data.lastTimestamp) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-3"
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            {stat.label}
          </p>
          <p
            className="text-sm font-semibold text-slate-200 truncate"
            style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function PromptTab({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 max-h-[50vh] overflow-y-auto">
      <div
        className="text-sm text-slate-300 leading-relaxed"
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        {renderPromptWithCodeBlocks(text)}
      </div>
    </div>
  );
}

function TokenUsageTab({ data }: { data: ContextModalData }) {
  const segments = [
    { value: data.totalInputTokens, color: '#34d399', label: 'Input' },
    { value: data.totalOutputTokens, color: '#22d3ee', label: 'Output' },
    { value: data.totalCacheCreationTokens, color: '#f59e0b', label: 'Cache Write' },
    { value: data.totalCacheReadTokens, color: '#a78bfa', label: 'Cache Read' },
  ];

  const total = data.totalTokens || 1;

  return (
    <div className="flex flex-col items-center gap-6">
      <DonutChart segments={segments} size={200} />

      <div className="w-full space-y-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-sm text-slate-400 flex-1">{seg.label}</span>
            <span
              className="text-sm text-slate-200 font-medium"
              style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
            >
              {formatTokenCount(seg.value)}
            </span>
            <span className="text-xs text-slate-500 w-12 text-right">
              {((seg.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextTimelineTab({ snapshots }: { snapshots: ContextSnapshot[] }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <TimelineChart snapshots={snapshots} width={620} height={220} />
    </div>
  );
}

export default function ContextModal({ isOpen, onClose, data }: ContextModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // handle open/close animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // reset tab on open
  useEffect(() => {
    if (isOpen) setActiveTab('overview');
  }, [isOpen]);

  // escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isVisible || !data) return null;

  return (
    <div
      ref={backdropRef}
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-4
        transition-all duration-300 ease-out
        ${isAnimating ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'}
      `}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className={`
          relative w-full max-w-3xl max-h-[90vh] rounded-2xl
          bg-slate-900/95 backdrop-blur-xl border border-white/10
          shadow-2xl shadow-black/50
          overflow-hidden flex flex-col
          transition-all duration-300 ease-out
          ${isAnimating ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}
        `}
      >
        {/* header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2
              className="text-lg font-bold text-slate-100 truncate"
              style={{ fontFamily: 'var(--font-geist-sans), sans-serif' }}
            >
              {data.projectName}
            </h2>
            <p
              className="text-xs text-slate-500 truncate mt-0.5"
              style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
            >
              Session: {data.sessionId.slice(0, 20)}...
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-all duration-200 ml-4"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-6 pt-3 pb-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2 text-xs font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap
                ${
                  activeTab === tab.id
                    ? 'bg-white/[0.06] text-cyan-300 border-b-2 border-cyan-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'overview' && <OverviewTab data={data} />}
          {activeTab === 'first-prompt' && <PromptTab text={data.firstPrompt} />}
          {activeTab === 'last-prompt' && <PromptTab text={data.lastPrompt} />}
          {activeTab === 'token-usage' && <TokenUsageTab data={data} />}
          {activeTab === 'context-timeline' && (
            <ContextTimelineTab snapshots={data.contextSnapshots} />
          )}
        </div>

        {/* footer info bar */}
        <div className="flex items-center gap-4 px-6 py-3 border-t border-white/[0.06] text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
            {data.model}
          </span>
          <span>{data.messageCount} messages</span>
          <span>{formatTokenCount(data.totalTokens)} tokens</span>
          <span className="ml-auto">Press ESC to close</span>
        </div>
      </div>
    </div>
  );
}

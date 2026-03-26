'use client';

import { useState } from 'react';
import Sparkline from './Sparkline';

interface SessionSummary {
  id: string;
  firstPrompt: string;
  lastPrompt: string;
  firstTimestamp: string;
  lastTimestamp: string;
  messageCount: number;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
}

interface ProjectDetailData {
  id: string;
  name: string;
  path: string;
  sessions: SessionSummary[];
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
  firstActivity: string;
  lastActivity: string;
}

interface ProjectDetailProps {
  project: ProjectDetailData;
  onSessionClick: (sessionId: string) => void;
}

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
    });
  } catch {
    return dateStr;
  }
}

function truncate(str: string, max: number): string {
  if (!str) return '(empty)';
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function generateFakeSparkline(session: SessionSummary): number[] {
  // generate a plausible context window usage curve from the session data
  const points = Math.max(session.messageCount, 6);
  const count = Math.min(points, 20);
  const data: number[] = [];
  const avgPerMessage = session.totalTokens / Math.max(session.messageCount, 1);

  let accumulated = 0;
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    // tokens tend to accumulate with some variance
    accumulated += avgPerMessage * (0.5 + Math.sin(progress * Math.PI) * 0.8);
    data.push(Math.round(accumulated));
  }
  return data;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p
        className="text-lg font-semibold text-slate-100"
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        {value}
      </p>
    </div>
  );
}

function SessionCard({
  session,
  isExpanded,
  onToggle,
  onClick,
}: {
  session: SessionSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const sparklineData = generateFakeSparkline(session);

  return (
    <div
      className={`
        rounded-xl border transition-all duration-300
        ${
          isExpanded
            ? 'bg-white/[0.06] border-cyan-400/20 shadow-lg shadow-cyan-400/5'
            : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/10'
        }
      `}
    >
      {/* card header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* expand chevron */}
          <svg
            className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs text-slate-300 truncate"
                style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
              >
                {session.id.slice(0, 12)}...
              </span>
              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300 font-medium">
                {session.model}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              {truncate(session.firstPrompt, 80)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Sparkline data={sparklineData} width={80} height={24} color="#22d3ee" />
          <div className="text-right">
            <p
              className="text-xs text-slate-300"
              style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
            >
              {formatTokenCount(session.totalTokens)}
            </p>
            <p className="text-[10px] text-slate-500">
              {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </button>

      {/* expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/[0.06]">
          <div className="pt-3 space-y-3">
            {/* token breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Input</p>
                <p
                  className="text-sm font-medium text-emerald-400"
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {formatTokenCount(session.totalInputTokens)}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Output</p>
                <p
                  className="text-sm font-medium text-cyan-400"
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {formatTokenCount(session.totalOutputTokens)}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Cache Write</p>
                <p
                  className="text-sm font-medium text-amber-400"
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {formatTokenCount(session.totalCacheCreationTokens)}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Cache Read</p>
                <p
                  className="text-sm font-medium text-violet-400"
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {formatTokenCount(session.totalCacheReadTokens)}
                </p>
              </div>
            </div>

            {/* prompts */}
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  First Prompt
                </p>
                <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.04]">
                  <p
                    className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words"
                    style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                  >
                    {truncate(session.firstPrompt, 200)}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Last Prompt
                </p>
                <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.04]">
                  <p
                    className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words"
                    style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                  >
                    {truncate(session.lastPrompt, 200)}
                  </p>
                </div>
              </div>
            </div>

            {/* timestamps */}
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{formatDate(session.firstTimestamp)}</span>
              <span className="text-slate-600">---</span>
              <span>{formatDate(session.lastTimestamp)}</span>
            </div>

            {/* view details button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="w-full py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 text-xs font-medium transition-all duration-200 hover:bg-cyan-400/20 hover:border-cyan-400/30"
            >
              View Full Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail({ project, onSessionClick }: ProjectDetailProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-900 p-6">
      {/* header */}
      <div className="mb-6">
        <h2
          className="text-2xl font-bold text-slate-100 mb-1"
          style={{ fontFamily: 'var(--font-geist-sans), sans-serif' }}
        >
          {project.name}
        </h2>
        <p
          className="text-sm text-slate-500 truncate"
          style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
        >
          {project.path}
        </p>
      </div>

      {/* stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBox label="Sessions" value={project.sessionCount.toLocaleString()} />
        <StatBox label="Total Tokens" value={formatTokenCount(project.totalTokens)} />
        <StatBox label="First Activity" value={relativeTime(project.firstActivity)} />
        <StatBox label="Last Activity" value={relativeTime(project.lastActivity)} />
      </div>

      {/* token breakdown bar */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
            Token Distribution
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden flex">
          {project.totalTokens > 0 && (
            <>
              <div
                className="h-full bg-emerald-400 transition-all duration-500"
                style={{
                  width: `${(project.totalInputTokens / project.totalTokens) * 100}%`,
                }}
              />
              <div
                className="h-full bg-cyan-400 transition-all duration-500"
                style={{
                  width: `${(project.totalOutputTokens / project.totalTokens) * 100}%`,
                }}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-slate-500">
              Input ({formatTokenCount(project.totalInputTokens)})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-[10px] text-slate-500">
              Output ({formatTokenCount(project.totalOutputTokens)})
            </span>
          </div>
        </div>
      </div>

      {/* sessions list */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">
          Sessions ({project.sessions.length})
        </h3>
        <div className="space-y-2">
          {project.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isExpanded={expandedSession === session.id}
              onToggle={() =>
                setExpandedSession(expandedSession === session.id ? null : session.id)
              }
              onClick={() => onSessionClick(session.id)}
            />
          ))}
          {project.sessions.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              No sessions found for this project
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

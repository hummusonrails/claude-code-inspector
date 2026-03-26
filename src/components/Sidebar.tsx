'use client';

import { useState, useMemo } from 'react';

interface Project {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  totalTokens: number;
  lastActivity: string;
  firstActivity: string;
}

interface SidebarProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
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
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function activityLevel(lastActivity: string): { color: string; intensity: number } {
  const now = Date.now();
  const then = new Date(lastActivity).getTime();
  const hoursAgo = (now - then) / (1000 * 60 * 60);

  if (hoursAgo < 1) return { color: '#22d3ee', intensity: 1.0 };    // cyan - very recent
  if (hoursAgo < 6) return { color: '#38bdf8', intensity: 0.85 };   // sky
  if (hoursAgo < 24) return { color: '#818cf8', intensity: 0.7 };   // indigo
  if (hoursAgo < 72) return { color: '#a78bfa', intensity: 0.55 };  // violet
  if (hoursAgo < 168) return { color: '#94a3b8', intensity: 0.4 };  // slate
  return { color: '#64748b', intensity: 0.25 };                      // dim slate
}

export default function Sidebar({ projects, selectedId, onSelect, onShowTerrain, onShowAnalytics }: SidebarProps & { onShowTerrain: () => void; onShowAnalytics?: () => void }) {
  const [filter, setFilter] = useState('');

  const sortedAndFiltered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return projects
      .filter(
        (p) =>
          !lowerFilter ||
          p.name.toLowerCase().includes(lowerFilter) ||
          p.path.toLowerCase().includes(lowerFilter)
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
  }, [projects, filter]);

  return (
    <aside className="flex flex-col h-full w-72 bg-[#0f172a] border-r border-white/[0.06] flex-shrink-0">
      {/* app title */}
      <div className="px-5 pt-5 pb-3">
        <h1
          className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-sky-400"
          style={{
            textShadow: '0 0 30px rgba(34, 211, 238, 0.3)',
            fontFamily: 'var(--font-geist-sans), sans-serif',
          }}
        >
          <span className="drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]">
            Claude Code Inspector
          </span>
        </h1>
        <p className="text-[11px] text-slate-500 mt-0.5 tracking-wide">
          Project Dashboard
        </p>
      </div>

      {/* terrain view button */}
      <div className="px-4 pb-3">
        <button
          onClick={onShowTerrain}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-cyan-400/10 hover:border-cyan-400/20 hover:text-cyan-300 transition-all duration-200"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12L13 20L4 12L13 4Z" />
            <path d="M22 12L13 4L4 12" opacity="0.5" />
          </svg>
          3D Terrain View
        </button>
        {onShowAnalytics && (
          <button
            onClick={onShowAnalytics}
            className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-purple-400/10 hover:border-purple-400/20 hover:text-purple-300 transition-all duration-200"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
          </button>
        )}
      </div>

      {/* search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 transition-all duration-200"
            style={{ fontFamily: 'var(--font-geist-sans), sans-serif' }}
          />
        </div>
      </div>

      {/* project count */}
      <div className="px-5 pb-2">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
          {sortedAndFiltered.length} project{sortedAndFiltered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* project list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {sortedAndFiltered.map((project) => {
          const isSelected = project.id === selectedId;
          const activity = activityLevel(project.lastActivity);

          return (
            <button
              key={project.id}
              onClick={() => onSelect(project.id)}
              className={`
                relative w-full text-left rounded-lg px-3 py-2.5 mb-1 transition-all duration-200 group
                ${
                  isSelected
                    ? 'bg-cyan-400/10 border border-cyan-400/20'
                    : 'bg-transparent border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]'
                }
              `}
            >
              {/* activity indicator bar */}
              <div
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-all duration-300"
                style={{
                  backgroundColor: activity.color,
                  opacity: isSelected ? 1 : activity.intensity,
                }}
              />

              {/* project name */}
              <div className="flex items-center justify-between mb-1 pl-2">
                <span
                  className={`text-sm font-medium truncate ${
                    isSelected ? 'text-cyan-300' : 'text-slate-200 group-hover:text-slate-100'
                  }`}
                  style={{ fontFamily: 'var(--font-geist-sans), sans-serif' }}
                >
                  {project.name}
                </span>
                <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">
                  {relativeTime(project.lastActivity)}
                </span>
              </div>

              {/* badges */}
              <div className="flex items-center gap-2 pl-2">
                <span
                  className={`
                    inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md
                    ${
                      isSelected
                        ? 'bg-cyan-400/15 text-cyan-300'
                        : 'bg-white/[0.06] text-slate-400'
                    }
                  `}
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
                </span>
                <span
                  className={`
                    inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md
                    ${
                      isSelected
                        ? 'bg-sky-400/15 text-sky-300'
                        : 'bg-white/[0.06] text-slate-400'
                    }
                  `}
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {formatTokenCount(project.totalTokens)} tokens
                </span>
              </div>
            </button>
          );
        })}

        {sortedAndFiltered.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            {filter ? 'No matching projects' : 'No projects found'}
          </div>
        )}
      </div>
    </aside>
  );
}

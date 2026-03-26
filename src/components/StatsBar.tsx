'use client';

interface StatsBarProps {
  totalProjects: number;
  totalSessions: number;
  totalTokens: number;
  totalMessages: number;
  mostActiveProject: string;
  avgTokensPerSession: number;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3 min-w-0 transition-all duration-300 hover:bg-white/[0.08] hover:border-white/20">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium truncate">
          {label}
        </p>
        <p
          className="text-base font-semibold text-slate-100 truncate"
          style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

// inline svg icons
function ProjectsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SessionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TokensIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function AvgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export default function StatsBar({
  totalProjects,
  totalSessions,
  totalTokens,
  totalMessages,
  mostActiveProject,
  avgTokensPerSession,
}: StatsBarProps) {
  return (
    <div className="w-full px-4 py-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<ProjectsIcon />}
          label="Projects"
          value={totalProjects.toLocaleString()}
        />
        <StatCard
          icon={<SessionsIcon />}
          label="Sessions"
          value={totalSessions.toLocaleString()}
        />
        <StatCard
          icon={<TokensIcon />}
          label="Total Tokens"
          value={formatTokenCount(totalTokens)}
        />
        <StatCard
          icon={<MessagesIcon />}
          label="Messages"
          value={totalMessages.toLocaleString()}
        />
        <StatCard
          icon={<StarIcon />}
          label="Most Active"
          value={mostActiveProject || '---'}
        />
        <StatCard
          icon={<AvgIcon />}
          label="Avg Tokens/Session"
          value={formatTokenCount(avgTokensPerSession)}
        />
      </div>
    </div>
  );
}

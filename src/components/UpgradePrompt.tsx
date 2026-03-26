'use client';

import { useState, useEffect } from 'react';

interface UpgradePromptProps {
  onActivate: (key: string) => void;
  validateKey?: (key: string) => boolean;
}

// analytics features to display in the grid
const FEATURES = [
  {
    title: 'Cost & Value Analysis',
    description: 'Track spending across models with estimated cost breakdowns and ROI metrics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Daily Activity Trend',
    description: 'Visualize your coding patterns with daily token usage and session frequency',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M3 17l6-6 4 4 8-8M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Model Usage Breakdown',
    description: 'Compare token distribution across Claude models over time',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M21 12a9 9 0 11-6.219-8.56M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Activity Heatmap',
    description: 'Discover peak productivity hours with a weekly time-of-day heatmap',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Context Window Utilization',
    description: 'Monitor how much of the context window each session consumes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M4 4h16v16H4zM9 4v16M4 9h16M4 15h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Cache Efficiency',
    description: 'Analyze cache hit rates and savings from prompt caching across projects',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Top Projects',
    description: 'Rank projects by token usage, sessions, and engagement metrics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M8 21V11M12 21V3M16 21v-6M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Session Duration Distribution',
    description: 'Understand session length patterns and identify your longest workflows',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function UpgradePrompt({ onActivate, validateKey }: UpgradePromptProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  // reset error when key changes
  useEffect(() => {
    if (error) setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const handleActivate = () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('please enter a license key');
      return;
    }

    const isValid = validateKey ? validateKey(trimmed) : false;
    if (isValid) {
      setSuccess(true);
      setTimeout(() => {
        onActivate(trimmed);
      }, 1200);
    } else {
      setError('invalid license key');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActivate();
    }
  };

  // success animation overlay
  if (success) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10 text-emerald-400">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">License Activated</h2>
          <p className="text-slate-400">loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PRO FEATURE
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Unlock Analytics
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Deep insights into your Claude Code usage. Track costs, discover patterns,
            and optimize your AI-assisted development workflow.
          </p>
        </div>

        {/* feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:text-cyan-300 transition-colors">
                  {feature.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white mb-1">{feature.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* cta section */}
        <div className="text-center mb-8">
          <a
            href="https://buy.stripe.com/claude-code-inspector"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-blue-400 transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:-translate-y-0.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Get a License Key
          </a>
        </div>

        {/* license key input section */}
        <div className="max-w-md mx-auto">
          {!showKeyInput ? (
            <button
              onClick={() => setShowKeyInput(true)}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors cursor-pointer py-2"
            >
              Already have a key? Click to activate
            </button>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 animate-fade-in">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Enter your license key
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="CCI-PRO-..."
                  className="flex-1 px-4 py-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/30 transition-all"
                  autoFocus
                />
                <button
                  onClick={handleActivate}
                  className="px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 hover:text-cyan-300 transition-all"
                >
                  Activate
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-400 animate-fade-in">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

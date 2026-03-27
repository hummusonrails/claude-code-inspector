'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import ProjectDetail from '@/components/ProjectDetail';
import ContextModal from '@/components/ContextModal';
import StatsBar from '@/components/StatsBar';
import { TerrainVisualization } from '@/components/TerrainVisualization';
import UpgradePrompt from '@/components/UpgradePrompt';

// pro analytics module type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ProModule {
  AnalyticsDashboard: React.ComponentType<any>;
  validateLicense: (key: string) => { valid: boolean; email?: string; isBuilder?: boolean };
  getStoredLicense: () => string | null;
  storeLicense: (key: string) => void;
}

// load pro module — uses a shim file that can be swapped at build time
async function loadPro(): Promise<ProModule | null> {
  try {
    const mod = await import('@/pro-loader');
    return mod.default;
  } catch {
    return null;
  }
}

interface Project {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  lastActivity: string;
  firstActivity: string;
  sessions: SessionSummary[];
}

interface SessionSummary {
  id: string;
  projectId: string;
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
  contextWindowSnapshots: ContextSnapshot[];
}

interface ContextSnapshot {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  messageIndex: number;
}

interface ModalData {
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

interface TerrainDataPoint {
  timestamp: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  sessionId: string;
  messageIndex: number;
  projectId?: string;
  projectName?: string;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [view, setView] = useState<'terrain' | 'detail' | 'analytics'>('terrain');
  const [isLicensed, setIsLicensed] = useState(false);
  const [proMod, setProMod] = useState<ProModule | null>(null);

  const BUILDER_KEY = "CCI-BUILDER-f7e2a91b3c";
  const LICENSE_STORAGE_KEY = "cci-license-key";
  const LICENSE_API_URL = process.env.NEXT_PUBLIC_LICENSE_API_URL || "http://localhost:3000/api";

  // check stored license on mount
  useEffect(() => {
    // check localStorage directly (works without pro module)
    const stored = typeof window !== 'undefined' ? localStorage.getItem(LICENSE_STORAGE_KEY) : null;
    if (stored === BUILDER_KEY) {
      setIsLicensed(true);
    } else if (stored) {
      // validate via api for non-builder keys
      fetch(`${LICENSE_API_URL}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: stored, action: 'validate' }),
      })
        .then(r => r.json())
        .then(d => { if (d.valid) setIsLicensed(true); })
        .catch(() => {});
    }

    // also try loading pro module
    loadPro().then((mod) => {
      if (!mod) return;
      setProMod(mod);
    });
  }, []);

  const handleLicenseActivate = useCallback((key: string) => {
    if (typeof window !== 'undefined') localStorage.setItem(LICENSE_STORAGE_KEY, key);
    if (proMod) proMod.storeLicense(key);
    setIsLicensed(true);
  }, [proMod]);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectProject = useCallback(async (id: string) => {
    setSelectedProjectId(id);
    setLoadingDetail(true);
    setView('detail');
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
      const data = await res.json();
      setSelectedProject(data);
    } catch {
      setSelectedProject(null);
    }
    setLoadingDetail(false);
  }, []);

  const handleSessionClick = useCallback(async (sessionId: string) => {
    if (!selectedProject) return;
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(selectedProject.id)}/sessions/${encodeURIComponent(sessionId)}`
      );
      const data = await res.json();
      setModalData({
        projectName: selectedProject.name,
        sessionId: data.id,
        model: data.model,
        firstPrompt: data.firstPrompt,
        lastPrompt: data.lastPrompt,
        firstTimestamp: data.firstTimestamp,
        lastTimestamp: data.lastTimestamp,
        messageCount: data.messageCount,
        totalInputTokens: data.totalInputTokens,
        totalOutputTokens: data.totalOutputTokens,
        totalCacheCreationTokens: data.totalCacheCreationTokens,
        totalCacheReadTokens: data.totalCacheReadTokens,
        totalTokens: data.totalTokens,
        contextSnapshots: data.contextWindowSnapshots || [],
      });
      setIsModalOpen(true);
    } catch {
      // silent failure
    }
  }, [selectedProject]);

  const handleTerrainPointClick = useCallback((point: TerrainDataPoint) => {
    const projectId = point.projectId;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const session = project.sessions?.find(s => s.id === point.sessionId);
    if (session) {
      setModalData({
        projectName: project.name,
        sessionId: session.id,
        model: session.model,
        firstPrompt: session.firstPrompt,
        lastPrompt: session.lastPrompt,
        firstTimestamp: session.firstTimestamp,
        lastTimestamp: session.lastTimestamp,
        messageCount: session.messageCount,
        totalInputTokens: session.totalInputTokens,
        totalOutputTokens: session.totalOutputTokens,
        totalCacheCreationTokens: session.totalCacheCreationTokens,
        totalCacheReadTokens: session.totalCacheReadTokens,
        totalTokens: session.totalTokens,
        contextSnapshots: session.contextWindowSnapshots || [],
      });
      setIsModalOpen(true);
    } else {
      fetch(`/api/projects/${encodeURIComponent(project.id)}/sessions/${encodeURIComponent(point.sessionId)}`)
        .then(res => res.json())
        .then(data => {
          setModalData({
            projectName: project.name,
            sessionId: data.id,
            model: data.model,
            firstPrompt: data.firstPrompt,
            lastPrompt: data.lastPrompt,
            firstTimestamp: data.firstTimestamp,
            lastTimestamp: data.lastTimestamp,
            messageCount: data.messageCount,
            totalInputTokens: data.totalInputTokens,
            totalOutputTokens: data.totalOutputTokens,
            totalCacheCreationTokens: data.totalCacheCreationTokens,
            totalCacheReadTokens: data.totalCacheReadTokens,
            totalTokens: data.totalTokens,
            contextSnapshots: data.contextWindowSnapshots || [],
          });
          setIsModalOpen(true);
        });
    }
  }, [projects]);

  const terrainData = {
    projects: projects.map(p => {
      const snapPoints = (p.sessions || []).flatMap(s =>
        (s.contextWindowSnapshots || []).map(snap => ({
          timestamp: snap.timestamp,
          totalTokens: snap.totalTokens,
          inputTokens: snap.inputTokens,
          outputTokens: snap.outputTokens,
          sessionId: s.id,
          messageIndex: snap.messageIndex,
          projectId: p.id,
          projectName: p.name,
        }))
      );

      const sessionPoints = (p.sessions || []).map(s => ({
        timestamp: s.firstTimestamp || s.lastTimestamp || new Date().toISOString(),
        totalTokens: s.totalTokens,
        inputTokens: s.totalInputTokens,
        outputTokens: s.totalOutputTokens,
        sessionId: s.id,
        messageIndex: 0,
        projectId: p.id,
        projectName: p.name,
      }));

      return {
        id: p.id,
        name: p.name,
        dataPoints: snapPoints.length > 0 ? snapPoints : sessionPoints,
      };
    }).filter(p => p.dataPoints.length > 0),
  };

  const totalSessions = projects.reduce((a, p) => a + p.sessionCount, 0);
  const totalTokens = projects.reduce((a, p) => a + p.totalTokens, 0);
  const totalMessages = projects.reduce(
    (a, p) => a + (p.sessions || []).reduce((b, s) => b + s.messageCount, 0),
    0
  );
  const mostActive = projects.length > 0
    ? [...projects].sort((a, b) => b.totalTokens - a.totalTokens)[0]?.name || ''
    : '';

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading Claude Code projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <StatsBar
        totalProjects={projects.length}
        totalSessions={totalSessions}
        totalTokens={totalTokens}
        totalMessages={totalMessages}
        mostActiveProject={mostActive}
        avgTokensPerSession={totalSessions > 0 ? Math.round(totalTokens / totalSessions) : 0}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          projects={projects}
          selectedId={selectedProjectId}
          onSelect={handleSelectProject}
          onShowTerrain={() => {
            setView('terrain');
            setSelectedProjectId(null);
          }}
          onShowAnalytics={() => {
            setView('analytics');
            setSelectedProjectId(null);
          }}
        />

        <main className="flex-1 overflow-hidden relative">
          {view === 'terrain' && (
            <div className="h-full animate-fade-in">
              <TerrainVisualization
                data={terrainData}
                onPointClick={handleTerrainPointClick}
                onPointHover={() => {}}
                className="h-full"
              />
            </div>
          )}

          {view === 'detail' && selectedProject && !loadingDetail && (
            <div className="h-full overflow-y-auto p-6 animate-slide-in-right">
              <ProjectDetail
                project={selectedProject}
                onSessionClick={handleSessionClick}
              />
            </div>
          )}

          {view === 'detail' && loadingDetail && (
            <div className="h-full flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
            </div>
          )}

          {view === 'detail' && !selectedProject && !loadingDetail && (
            <div className="h-full flex items-center justify-center text-slate-500">
              <p>Select a project from the sidebar</p>
            </div>
          )}

          {view === 'analytics' && proMod && isLicensed && (
            <div className="h-full overflow-y-auto animate-fade-in">
              <proMod.AnalyticsDashboard projects={projects} />
            </div>
          )}

          {view === 'analytics' && (!proMod || !isLicensed) && (
            <div className="h-full animate-fade-in">
              <UpgradePrompt
                onActivate={handleLicenseActivate}
                validateKey={proMod ? (key: string) => proMod.validateLicense(key).valid : undefined}
              />
            </div>
          )}
        </main>
      </div>

      <ContextModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        data={modalData}
      />
    </div>
  );
}

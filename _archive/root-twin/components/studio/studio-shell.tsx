'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Code2,
  FolderTree,
  MessageSquare,
  Play,
  Plus,
  Send,
  Sparkles,
  Loader2,
  Layers,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hammer,
  RefreshCw,
  Maximize2,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Download,
  RotateCw,
  FileText,
  DollarSign,
  Settings,
  X,
  Zap,
  KeyRound,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import { AiDisclosure } from '@/components/ai-disclosure';

interface ProjectFileMeta {
  path: string;
  kind?: string;
  summary?: string;
  content?: string;
}

interface LaneCost {
  laneId: string;
  laneTitle: string;
  role: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  escalated: boolean;
}
interface BuildCost {
  buildId: string;
  at: string;
  inTok: number;
  outTok: number;
  costUsd: number;
  calls: number;
  escalations: number;
}
interface CostData {
  total: { inputTokens: number; outputTokens: number; costUsd: number; calls: number; escalations: number };
  builds: BuildCost[];
  latestBuildId: string | null;
  latestLanes: LaneCost[];
}
interface KeyMeta { provider: string; hint: string; updatedAt: string }
interface SettingsData { keys: KeyMeta[]; budgetUsd: number; preferCheap: boolean }

function fmtUsd(n: number): string {
  if (!n) return '$0.00';
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}
function fmtTok(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function hljsLang(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const m: Record<string, string> = {
    html: 'xml',
    htm: 'xml',
    js: 'javascript',
    mjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    css: 'css',
    json: 'json',
    md: 'markdown',
  };
  return m[ext] || null;
}

function CodeViewer({ path, content }: { path: string; content: string }) {
  const html = (() => {
    try {
      const lang = hljsLang(path);
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang }).value;
      }
      return hljs.highlightAuto(content).value;
    } catch {
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  })();
  const lines = content.split('\n').length;
  return (
    <div className="flex text-[12px] font-mono leading-relaxed">
      <div className="select-none border-r border-white/10 px-3 py-3 text-right text-white/20">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre className="hljs flex-1 overflow-x-auto px-4 py-3">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

interface Message {
  id: string;
  role: 'user' | 'architect' | 'builder' | 'critic' | 'system';
  content: string;
  timestamp: Date;
}

interface BuildLane {
  id: string;
  title: string;
  description: string;
  role: string;
  dependencies: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
}

interface BuildPlanData {
  projectTitle?: string;
  genre?: string;
  summary?: string;
  lanes: BuildLane[];
  estimatedComplexity?: string;
}

interface Project {
  id: string;
  title: string;
  genre: string;
  status: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  architect: '#A855F7',
  builder: '#00E5FF',
  critic: '#FF3366',
  system: '#FFD700',
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? '#ffffff';
}

function parsePlan(content: string): BuildPlanData | null {
  if (!content || !content.includes('"lanes"')) return null;
  try {
    let json = content;
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) json = m[1];
    const p = JSON.parse(json.trim());
    if (p?.lanes && Array.isArray(p.lanes)) return p;
  } catch {}
  return null;
}

function statusIcon(status: string) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-[#00FF9D]" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-[#00E5FF]" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-[#FF3366]" />;
    default:
      return <Clock className="h-4 w-4 text-white/30" />;
  }
}

/** Chat bubble that renders an architect BuildPlan as a formatted card. */
function PlanMessageCard({ plan }: { plan: BuildPlanData }) {
  const [showJson, setShowJson] = useState(false);
  return (
    <div className="rounded-xl border border-[#A855F7]/30 bg-[#A855F7]/5 overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#A855F7]" />
          <span className="font-display text-sm font-bold text-white">
            {plan.projectTitle || 'Build Plan'}
          </span>
          {plan.estimatedComplexity && (
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/50">
              {plan.estimatedComplexity}
            </span>
          )}
        </div>
        {plan.summary && <p className="mt-1.5 text-xs text-white/55 leading-relaxed">{plan.summary}</p>}
      </div>
      <div className="divide-y divide-white/5">
        {plan.lanes.map((lane) => (
          <div key={lane.id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span className="mt-0.5">{statusIcon(lane.status)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-white/90">{lane.title}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 font-mono text-[9px]"
                  style={{ background: `${roleColor(lane.role)}22`, color: roleColor(lane.role) }}
                >
                  {lane.role}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-white/40 leading-snug">{lane.description}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => setShowJson((s) => !s)}
        className="flex w-full items-center gap-1.5 border-t border-white/10 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-white/35 hover:text-white/60 transition-colors"
      >
        {showJson ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {showJson ? 'hide' : 'view'} json
      </button>
      {showJson && (
        <pre className="max-h-64 overflow-auto border-t border-white/10 bg-black/40 p-3 text-[10px] text-white/50 font-mono">
          {JSON.stringify(plan, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function StudioShell() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Welcome to NEXUS Studio. I am CELL — your AI architect. Describe what you want to build and I will decompose it into a structured BuildPlan, then execute the build across parallel work lanes.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [buildPlan, setBuildPlan] = useState<BuildPlanData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activePanel, setActivePanel] = useState<'chat' | 'plan' | 'files' | 'preview' | 'costs'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [building, setBuilding] = useState(false);
  const [projectStatus, setProjectStatus] = useState<string>('draft');
  const [artifactHtml, setArtifactHtml] = useState<string>('');
  const [previewKey, setPreviewKey] = useState(0);
  const [files, setFiles] = useState<ProjectFileMeta[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const fetchCosts = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/cell/projects/${pid}/costs`);
      const j = await res.json();
      if (j && j.total) setCosts(j);
    } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/cell/settings');
      const j = await res.json();
      if (j && Array.isArray(j.keys)) {
        setSettings(j);
        setBudgetInput(j.budgetUsd ? String(j.budgetUsd) : '');
      }
    } catch {}
  }, []);

  const saveBudget = useCallback(async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/cell/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetUsd: Number(budgetInput) || 0 }),
      });
      const j = await res.json();
      if (j && Array.isArray(j.keys)) setSettings(j);
    } catch {}
    setSavingSettings(false);
  }, [budgetInput]);

  const togglePreferCheap = useCallback(async (val: boolean) => {
    setSettings((s) => (s ? { ...s, preferCheap: val } : s));
    try {
      await fetch('/api/cell/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferCheap: val }),
      });
    } catch {}
  }, []);

  const saveKey = useCallback(async (provider: string) => {
    const apiKey = (keyInputs[provider] || '').trim();
    if (!apiKey) return;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/cell/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const j = await res.json();
      if (j && Array.isArray(j.keys)) setSettings(j);
      setKeyInputs((k) => ({ ...k, [provider]: '' }));
    } catch {}
    setSavingSettings(false);
  }, [keyInputs]);

  const deleteKey = useCallback(async (provider: string) => {
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/cell/settings?provider=${provider}`, { method: 'DELETE' });
      const j = await res.json();
      if (j && Array.isArray(j.keys)) setSettings(j);
    } catch {}
    setSavingSettings(false);
  }, []);

  const fetchFiles = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/cell/projects/${pid}/files`);
      const j = await res.json();
      if (Array.isArray(j?.files)) {
        setFiles(j.files);
        setSelectedFile((cur) => cur && j.files.some((f: ProjectFileMeta) => f.path === cur) ? cur : (j.files[0]?.path ?? null));
      }
    } catch {}
  }, []);

  const regenerateFile = useCallback(
    async (pid: string, path: string) => {
      if (regenerating) return;
      setRegenerating(path);
      try {
        await fetch(`/api/cell/projects/${pid}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'regenerate', path }),
        });
        await fetchFiles(pid);
        const pr = await fetch(`/api/cell/projects/${pid}`);
        const pj = await pr.json();
        if (pj?.project?.artifacts) {
          try {
            const a = JSON.parse(pj.project.artifacts);
            if (a?.html) {
              setArtifactHtml(a.html);
              setPreviewKey((k) => k + 1);
            }
          } catch {}
        }
      } catch {}
      setRegenerating(null);
    },
    [regenerating, fetchFiles]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buildingRef = useRef(false);

  // Load projects list
  const refreshProjectsList = useCallback(() => {
    fetch('/api/cell/projects')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (j?.projects) setProjects(j.projects);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshProjectsList();
  }, [refreshProjectsList]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Responsive: auto-collapse sidebar on narrow viewports
  useEffect(() => {
    const apply = () => setSidebarOpen(window.innerWidth >= 1100);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshProject = useCallback(
    async (pid: string) => {
      try {
        const res = await fetch(`/api/cell/projects/${pid}`);
        const j = await res.json();
        if (!j?.project) return;
        setProjectStatus(j.project.status);
        if (j.project.buildPlan) {
          try {
            setBuildPlan(JSON.parse(j.project.buildPlan));
          } catch {}
        }
        if (j.project.artifacts) {
          try {
            const a = JSON.parse(j.project.artifacts);
            if (a?.html) setArtifactHtml(a.html);
          } catch {}
        }
        if (j.project.status === 'ready' || j.project.status === 'failed' || j.project.status === 'needs-attention') {
          stopPolling();
          buildingRef.current = false;
          setBuilding(false);
          fetchFiles(pid);
          fetchCosts(pid);
        }
      } catch {}
    },
    [stopPolling, fetchFiles, fetchCosts]
  );

  const startPolling = useCallback(
    (pid: string) => {
      stopPolling();
      pollRef.current = setInterval(() => refreshProject(pid), 1500);
    },
    [refreshProject, stopPolling]
  );

  // Kick off a build for a project
  const startBuild = useCallback(
    async (pid: string, force = false) => {
      if (!pid || buildingRef.current) return;
      buildingRef.current = true;
      setBuilding(true);
      setProjectStatus('building');
      setActivePanel('plan');
      // Optimistically show lanes as pending
      setBuildPlan((prev) =>
        prev
          ? { ...prev, lanes: prev.lanes.map((l) => ({ ...l, status: 'pending' as const })) }
          : prev
      );
      startPolling(pid);
      try {
        await fetch('/api/cell/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: pid, force }),
        });
      } catch {}
      stopPolling();
      buildingRef.current = false;
      setBuilding(false);
      await refreshProject(pid);
      refreshProjectsList();
    },
    [startPolling, stopPolling, refreshProject, refreshProjectsList]
  );

  // Load a project conversation
  const loadProject = useCallback(
    async (id: string) => {
      stopPolling();
      buildingRef.current = false;
      setBuilding(false);
      setArtifactHtml('');
      setFiles([]);
      setSelectedFile(null);
      fetchFiles(id);
      try {
        const res = await fetch(`/api/cell/projects/${id}`);
        const j = await res.json();
        if (j?.project) {
          setProjectId(j.project.id);
          setProjectStatus(j.project.status);
          const msgs: Message[] = (j.project.messages ?? []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.createdAt),
          }));
          if (msgs.length === 0) {
            msgs.push({
              id: 'welcome',
              role: 'system',
              content: `Project loaded: ${j.project.title}`,
              timestamp: new Date(),
            });
          }
          setMessages(msgs);
          setBuildPlan(null);
          if (j.project.buildPlan) {
            try {
              setBuildPlan(JSON.parse(j.project.buildPlan));
            } catch {}
          }
          if (j.project.artifacts) {
            try {
              const a = JSON.parse(j.project.artifacts);
              if (a?.html) setArtifactHtml(a.html);
            } catch {}
          }
          if (j.project.status === 'building') {
            buildingRef.current = true;
            setBuilding(true);
            startPolling(j.project.id);
          }
        }
      } catch {}
    },
    [startPolling, stopPolling, fetchFiles]
  );

  // Fetch files when opening the FILES tab
  useEffect(() => {
    if (activePanel === 'files' && projectId && files.length === 0) {
      fetchFiles(projectId);
    }
    if (activePanel === 'costs' && projectId) {
      fetchCosts(projectId);
    }
  }, [activePanel, projectId, files.length, fetchFiles, fetchCosts]);

  useEffect(() => {
    if (showSettings) fetchSettings();
  }, [showSettings, fetchSettings]);

  // Send message to CELL
  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput('');
    setStreaming(true);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = `cell-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'architect', content: '', timestamp: new Date() },
    ]);

    let streamPid = projectId;

    try {
      const res = await fetch('/api/cell/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: msg, role: 'architect' }),
      });

      if (!res.ok) throw new Error('CELL unavailable');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          partialRead += decoder.decode(value, { stream: true });
          const lines = partialRead.split('\n');
          partialRead = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.type === 'meta' && evt.projectId) {
                  streamPid = evt.projectId;
                  setProjectId(evt.projectId);
                }
                if (evt.type === 'delta' && evt.content) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: m.content + evt.content } : m
                    )
                  );
                }
                if (evt.type === 'done') {
                  setMessages((prev) => {
                    const final = prev.find((m) => m.id === assistantId);
                    const plan = final ? parsePlan(final.content) : null;
                    if (plan) setBuildPlan(plan);
                    return prev;
                  });
                }
              } catch {}
            }
          }
        }
      }

      refreshProjectsList();

      // Auto-kick the build if a valid plan was produced
      setMessages((prev) => {
        const final = prev.find((m) => m.id === assistantId);
        const plan = final ? parsePlan(final.content) : null;
        if (plan && streamPid) {
          setTimeout(() => startBuild(streamPid as string), 300);
        }
        return prev;
      });
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Error: Failed to reach CELL. Please try again.', role: 'system' }
            : m
        )
      );
    } finally {
      setStreaming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, streaming, projectId, refreshProjectsList, startBuild]);

  const newProject = () => {
    stopPolling();
    buildingRef.current = false;
    setBuilding(false);
    setProjectId(null);
    setBuildPlan(null);
    setArtifactHtml('');
    setProjectStatus('draft');
    setActivePanel('chat');
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: 'New project. Tell CELL what you want to build.',
        timestamp: new Date(),
      },
    ]);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'architect':
        return <Brain className="h-4 w-4" />;
      case 'builder':
        return <Code2 className="h-4 w-4" />;
      case 'critic':
        return <Eye className="h-4 w-4" />;
      case 'system':
        return <Sparkles className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const openFullscreen = () => {
    if (!artifactHtml) return;
    const blob = new Blob([artifactHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const laneProgress = buildPlan
    ? {
        done: buildPlan.lanes.filter((l) => l.status === 'done').length,
        total: buildPlan.lanes.length,
      }
    : null;

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden">
      {/* ── Sidebar: Projects ── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a] overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#A855F7] to-[#00E5FF]">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold tracking-tight">NEXUS STUDIO</h1>
                <p className="font-mono text-[10px] text-white/40">CELL × NEXUS</p>
              </div>
            </div>

            <button
              onClick={newProject}
              className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-sm text-white/60 transition-colors hover:border-[#A855F7]/50 hover:text-[#A855F7]"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>

            <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-white/30">Projects</p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadProject(p.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    projectId === p.id
                      ? 'bg-[#A855F7]/15 border border-[#A855F7]/30'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="block truncate text-sm font-medium text-white/80">{p.title}</span>
                  <span className="font-mono text-[10px] text-white/30">
                    {p.genre || 'untitled'} · {p.status}
                  </span>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="text-center text-xs text-white/25 py-8">No projects yet</p>
              )}
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#00FF9D] animate-pulse" />
                <span className="font-mono text-[10px] text-white/40">CELL online</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main Area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-2 border-b border-white/10 bg-[#0a0a0a]/80 px-4 py-2 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <FolderTree className="h-4 w-4" />
          </button>

          <div className="mx-2 h-5 w-px bg-white/10" />

          {(['chat', 'plan', 'files', 'preview', 'costs'] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activePanel === panel
                  ? 'bg-[#A855F7]/15 text-[#A855F7] border border-[#A855F7]/30'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {panel === 'chat' && <MessageSquare className="h-3.5 w-3.5" />}
              {panel === 'plan' && <Layers className="h-3.5 w-3.5" />}
              {panel === 'files' && <FileCode2 className="h-3.5 w-3.5" />}
              {panel === 'preview' && <Play className="h-3.5 w-3.5" />}
              {panel === 'costs' && <DollarSign className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{panel.toUpperCase()}</span>
              {panel === 'files' && files.length > 0 && (
                <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[9px] text-white/60">
                  {files.length}
                </span>
              )}
              {panel === 'plan' && building && (
                <Loader2 className="h-3 w-3 animate-spin text-[#00E5FF]" />
              )}
              {panel === 'preview' && artifactHtml && !building && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#00FF9D]" />
              )}
              {panel === 'costs' && costs && costs.total.costUsd > 0 && (
                <span className="ml-0.5 rounded-full bg-[#00FF9D]/15 px-1.5 text-[9px] text-[#00FF9D]">
                  {fmtUsd(costs.total.costUsd)}
                </span>
              )}
            </button>
          ))}

          <div className="flex-1" />

          {projectId && (
            <span className="hidden md:inline font-mono text-[10px] text-white/30">
              {building ? 'building…' : projectStatus}
            </span>
          )}

          <button
            onClick={() => setShowSettings(true)}
            title="Model & budget settings"
            className="ml-1 rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>
        </header>

        {/* Panel content */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {/* ── Chat Panel ── */}
          {activePanel === 'chat' && (
            <div className="flex h-full flex-col">
              <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((msg) => {
                  const plan = msg.role === 'architect' ? parsePlan(msg.content) : null;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                    >
                      {msg.role !== 'user' && (
                        <div
                          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${roleColor(msg.role)}22`, color: roleColor(msg.role) }}
                        >
                          {getRoleIcon(msg.role)}
                        </div>
                      )}
                      <div
                        className={`min-w-0 ${plan ? 'max-w-[92%] w-full' : 'max-w-[75%]'} ${
                          plan
                            ? ''
                            : `rounded-xl px-4 py-3 ${
                                msg.role === 'user'
                                  ? 'bg-[#A855F7]/20 border border-[#A855F7]/30'
                                  : 'bg-white/5 border border-white/10'
                              }`
                        }`}
                      >
                        {plan ? (
                          <PlanMessageCard plan={plan} />
                        ) : (
                          <>
                            {msg.role !== 'user' && (
                              <span
                                className="mb-1 block font-mono text-[10px] uppercase tracking-wider"
                                style={{ color: roleColor(msg.role) }}
                              >
                                {msg.role}
                              </span>
                            )}
                            <div className="text-sm text-white/80 whitespace-pre-wrap break-words font-mono leading-relaxed">
                              {msg.content}
                              {streaming && msg.role !== 'user' && msg.content === '' && (
                                <span className="inline-flex items-center gap-1 text-white/40">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> CELL is thinking…
                                </span>
                              )}
                            </div>
                            {msg.role !== 'user' && msg.role !== 'system' && msg.content && (
                              <div className="mt-2">
                                <AiDisclosure compact />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-white/10 bg-[#0a0a0a]/80 p-4">
                <div className="mx-auto flex max-w-[900px] items-end gap-3">
                  <div className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 focus-within:border-[#A855F7]/50 transition-colors">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Describe what you want to build…  (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="w-full resize-none bg-transparent px-4 py-3 text-sm text-white placeholder-white/30 outline-none font-mono"
                      disabled={streaming}
                    />
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={streaming || !input.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#A855F7] text-white transition-all hover:bg-[#A855F7]/80 disabled:opacity-40"
                  >
                    {streaming ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-white/25">
                  CELL × NEXUS — Claude Fable 5 (architect) · GPT-5.4 (builder) · Claude Sonnet 5 (critic)
                </p>
              </div>
            </div>
          )}

          {/* ── Build Plan Panel ── */}
          {activePanel === 'plan' && (
            <div className="h-full overflow-y-auto p-6">
              {buildPlan ? (
                <div className="mx-auto max-w-[900px]">
                  <div className="mb-6 flex flex-wrap items-center gap-3">
                    <Layers className="h-6 w-6 text-[#A855F7]" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-2xl font-bold">
                        {buildPlan.projectTitle || 'BUILD PLAN'}
                      </h2>
                      {buildPlan.summary && (
                        <p className="text-xs text-white/40">{buildPlan.summary}</p>
                      )}
                    </div>
                    {laneProgress && (building || projectStatus === 'ready') && (
                      <span className="font-mono text-xs text-white/50">
                        {laneProgress.done}/{laneProgress.total} lanes
                      </span>
                    )}
                    {!building && (
                      <button
                        onClick={() => projectId && startBuild(projectId)}
                        disabled={!projectId}
                        className="flex items-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-bold text-black transition-all hover:bg-[#00E5FF]/80 disabled:opacity-40"
                      >
                        <Hammer className="h-4 w-4" />
                        {projectStatus === 'ready' && artifactHtml ? 'Rebuild' : 'Start Build'}
                      </button>
                    )}
                    {!building && projectStatus === 'ready' && artifactHtml && (
                      <button
                        onClick={() => projectId && startBuild(projectId, true)}
                        disabled={!projectId}
                        title="Ignore the build cache and regenerate every lane"
                        className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        Force
                      </button>
                    )}
                    {building && (
                      <span className="flex items-center gap-2 rounded-lg bg-[#00E5FF]/15 px-4 py-2 text-sm font-bold text-[#00E5FF]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Building…
                      </span>
                    )}
                  </div>

                  {building && (
                    <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-[#A855F7] to-[#00E5FF] transition-all duration-500"
                        style={{
                          width: laneProgress
                            ? `${Math.round((laneProgress.done / Math.max(1, laneProgress.total)) * 100)}%`
                            : '5%',
                        }}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    {buildPlan.lanes.map((lane, i) => (
                      <motion.div
                        key={lane.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-xl border bg-white/5 p-4 transition-colors ${
                          lane.status === 'running'
                            ? 'border-[#00E5FF]/40'
                            : lane.status === 'done'
                            ? 'border-[#00FF9D]/30'
                            : lane.status === 'failed'
                            ? 'border-[#FF3366]/40'
                            : 'border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {statusIcon(lane.status)}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-white/90">{lane.title}</span>
                              <span
                                className="rounded-full px-2 py-0.5 font-mono text-[10px]"
                                style={{
                                  background: `${roleColor(lane.role)}22`,
                                  color: roleColor(lane.role),
                                }}
                              >
                                {lane.role}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-white/45">{lane.description}</p>
                          </div>
                          {lane.dependencies?.length > 0 && (
                            <span className="hidden md:inline font-mono text-[10px] text-white/25">
                              deps: {lane.dependencies.join(', ')}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {projectStatus === 'ready' && artifactHtml && !building && (
                    <button
                      onClick={() => setActivePanel('preview')}
                      className="mt-6 flex items-center gap-2 rounded-lg bg-[#00FF9D] px-4 py-2.5 text-sm font-bold text-black transition-all hover:bg-[#00FF9D]/80"
                    >
                      <Play className="h-4 w-4" />
                      View Preview
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Layers className="mx-auto h-12 w-12 text-white/15 mb-4" />
                    <p className="text-white/40 text-sm">No build plan yet</p>
                    <p className="text-white/25 text-xs mt-1">Chat with CELL to generate one</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Files Panel ── */}
          {activePanel === 'files' && (
            <div className="flex h-full flex-col">
              {files.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 border-b border-white/10 bg-[#0a0a0a]/80 px-4 py-2">
                    <FileCode2 className="h-3.5 w-3.5 text-[#A855F7]" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                      Project Files
                    </span>
                    <div className="flex-1" />
                    <a
                      href={projectId ? `/api/cell/projects/${projectId}/export` : '#'}
                      className="flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/30 hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download .zip
                    </a>
                  </div>
                  <div className="flex min-h-0 flex-1">
                    {/* File tree */}
                    <div className="w-56 shrink-0 overflow-y-auto border-r border-white/10 bg-[#080808] py-2">
                      {[...files]
                        .sort((a, b) => a.path.localeCompare(b.path))
                        .map((f) => {
                          const depth = f.path.split('/').length - 1;
                          const name = f.path.split('/').pop() || f.path;
                          const active = selectedFile === f.path;
                          return (
                            <button
                              key={f.path}
                              onClick={() => setSelectedFile(f.path)}
                              title={f.path}
                              className={`flex w-full items-center gap-1.5 truncate px-3 py-1.5 text-left text-xs transition-colors ${
                                active
                                  ? 'bg-[#A855F7]/15 text-[#A855F7]'
                                  : 'text-white/55 hover:bg-white/5 hover:text-white/80'
                              }`}
                              style={{ paddingLeft: `${12 + depth * 12}px` }}
                            >
                              {f.kind === 'asset' ? (
                                <FileText className="h-3 w-3 shrink-0 opacity-60" />
                              ) : (
                                <FileCode2 className="h-3 w-3 shrink-0 opacity-60" />
                              )}
                              <span className="truncate">{name}</span>
                            </button>
                          );
                        })}
                    </div>
                    {/* Code viewer */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      {selectedFile ? (
                        <>
                          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-1.5">
                            <span className="truncate font-mono text-[11px] text-white/50">
                              {selectedFile}
                            </span>
                            {files.find((f) => f.path === selectedFile)?.summary && (
                              <span className="hidden truncate text-[10px] text-white/25 lg:inline">
                                — {files.find((f) => f.path === selectedFile)?.summary}
                              </span>
                            )}
                            <div className="flex-1" />
                            <button
                              onClick={() =>
                                projectId && selectedFile && regenerateFile(projectId, selectedFile)
                              }
                              disabled={!!regenerating || building}
                              className="flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/60 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF] disabled:opacity-40"
                            >
                              {regenerating === selectedFile ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCw className="h-3 w-3" />
                              )}
                              Regenerate
                            </button>
                          </div>
                          <div className="min-h-0 flex-1 overflow-auto bg-[#050505]">
                            <CodeViewer
                              key={selectedFile}
                              path={selectedFile}
                              content={
                                files.find((f) => f.path === selectedFile)?.content ?? ''
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-white/30">
                          Select a file to view
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <FileCode2 className="mx-auto mb-4 h-12 w-12 text-white/15" />
                    <p className="text-sm text-white/40">No files yet</p>
                    <p className="mt-1 text-xs text-white/25">Build the project to generate files</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Preview Panel ── */}
          {activePanel === 'preview' && (
            <div className="flex h-full flex-col">
              {artifactHtml ? (
                <>
                  <div className="flex items-center gap-2 border-b border-white/10 bg-[#0a0a0a]/80 px-4 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                      Live Preview
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => setPreviewKey((k) => k + 1)}
                      className="flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/60 transition-colors hover:text-white hover:border-white/30"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </button>
                    <button
                      onClick={openFullscreen}
                      className="flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/60 transition-colors hover:text-white hover:border-white/30"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Full screen
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 bg-white">
                    <iframe
                      key={previewKey}
                      srcDoc={artifactHtml}
                      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                      className="h-full w-full border-0"
                      title="CELL preview"
                    />
                  </div>
                </>
              ) : building ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#00E5FF]" />
                    <p className="text-white/60 text-sm">CELL is building your app…</p>
                    {laneProgress && (
                      <p className="mt-1 font-mono text-xs text-white/35">
                        {laneProgress.done}/{laneProgress.total} lanes complete
                      </p>
                    )}
                    <button
                      onClick={() => setActivePanel('plan')}
                      className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-xs text-white/60 hover:text-white"
                    >
                      View build progress
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <Play className="h-8 w-8 text-white/20" />
                    </div>
                    <p className="text-white/40 text-sm">No preview yet</p>
                    <p className="text-white/25 text-xs mt-1">
                      {buildPlan
                        ? 'Start a build from the PLAN tab to generate your app'
                        : 'Chat with CELL, then build to see a live preview'}
                    </p>
                    {buildPlan && projectId && (
                      <button
                        onClick={() => startBuild(projectId)}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-bold text-black hover:bg-[#00E5FF]/80"
                      >
                        <Hammer className="h-4 w-4" />
                        Start Build
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* ── Costs Panel ── */}
          {activePanel === 'costs' && (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#0a0a0a]/80 px-4 py-2">
                <DollarSign className="h-3.5 w-3.5 text-[#00FF9D]" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                  Build Cost & Tokens
                </span>
                <div className="flex-1" />
                {projectId && (
                  <button
                    onClick={() => fetchCosts(projectId)}
                    className="flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/60 transition-colors hover:text-white hover:border-white/30"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                )}
              </div>

              {!costs || costs.total.calls === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <DollarSign className="h-8 w-8 text-white/20" />
                    </div>
                    <p className="text-white/40 text-sm">No cost data yet</p>
                    <p className="text-white/25 text-xs mt-1">Run a build to see token usage and cost per lane</p>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
                  {/* Cumulative totals */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-[#00FF9D]/25 bg-[#00FF9D]/5 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Total Cost</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#00FF9D]">{fmtUsd(costs.total.costUsd)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Input Tokens</div>
                      <div className="mt-1 font-mono text-lg font-bold text-white/80">{fmtTok(costs.total.inputTokens)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Output Tokens</div>
                      <div className="mt-1 font-mono text-lg font-bold text-white/80">{fmtTok(costs.total.outputTokens)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">Escalations</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#FFD700]">{costs.total.escalations}</div>
                    </div>
                  </div>

                  {/* Per-lane breakdown (latest build) */}
                  {costs.latestLanes.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-[#00E5FF]" />
                        <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Latest Build — Per Lane</span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-white/10">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white/5 text-white/40">
                            <tr>
                              <th className="px-3 py-2 font-medium">Lane</th>
                              <th className="px-3 py-2 font-medium">Model</th>
                              <th className="px-3 py-2 text-right font-medium">In</th>
                              <th className="px-3 py-2 text-right font-medium">Out</th>
                              <th className="px-3 py-2 text-right font-medium">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costs.latestLanes.map((l, i) => (
                              <tr key={l.laneId + i} className="border-t border-white/5">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-white/80">{l.laneTitle}</span>
                                    {l.escalated && (
                                      <span className="rounded bg-[#FFD700]/15 px-1 text-[9px] text-[#FFD700]">esc</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-white/30">{l.role}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="text-white/60">{l.model}</span>
                                  <div className="text-[10px] text-white/30">{l.provider}</div>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-white/50">{fmtTok(l.inputTokens)}</td>
                                <td className="px-3 py-2 text-right font-mono text-white/50">{fmtTok(l.outputTokens)}</td>
                                <td className="px-3 py-2 text-right font-mono text-[#00FF9D]">{fmtUsd(l.costUsd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Build history */}
                  {costs.builds.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-[#A855F7]" />
                        <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Build History</span>
                      </div>
                      <div className="space-y-1.5">
                        {costs.builds.map((b) => (
                          <div key={b.buildId} className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs">
                            <span className="font-mono text-white/30">{b.buildId.slice(0, 8)}</span>
                            <span className="text-white/40">{b.calls} calls</span>
                            {b.escalations > 0 && (
                              <span className="text-[#FFD700]">{b.escalations} esc</span>
                            )}
                            <div className="flex-1" />
                            <span className="font-mono text-white/40">{fmtTok(b.inTok + b.outTok)} tok</span>
                            <span className="font-mono font-bold text-[#00FF9D]">{fmtUsd(b.costUsd)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="pt-2 text-center text-[10px] text-white/25">
                    Costs routed through the platform are estimates based on the underlying model&apos;s list price.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── Settings Modal ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
                <Settings className="h-4 w-4 text-[#A855F7]" />
                <span className="text-sm font-bold text-white">Model & Budget Settings</span>
                <div className="flex-1" />
                <button onClick={() => setShowSettings(false)} className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-5 space-y-6">
                {/* Budget */}
                <div>
                  <label className="text-xs font-semibold text-white/70">Budget cap (USD)</label>
                  <p className="mb-2 text-[11px] text-white/35">Builds stop gracefully once this cap is reached, saving completed lanes. 0 = no cap.</p>
                  <div className="flex gap-2">
                    <div className="flex flex-1 items-center rounded-lg border border-white/15 bg-white/5 px-3">
                      <span className="text-white/40">$</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/25"
                      />
                    </div>
                    <button
                      onClick={saveBudget}
                      disabled={savingSettings}
                      className="rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-bold text-black transition-opacity hover:opacity-80 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Prefer cheap */}
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                  <div>
                    <div className="text-xs font-semibold text-white/70">Prefer cheapest capable model</div>
                    <div className="text-[11px] text-white/35">Start every lane on the cheapest model, escalate only on failure.</div>
                  </div>
                  <button
                    onClick={() => togglePreferCheap(!(settings?.preferCheap ?? true))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${settings?.preferCheap ?? true ? 'bg-[#00FF9D]' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-transform ${settings?.preferCheap ?? true ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* API keys */}
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-[#FFD700]" />
                    <label className="text-xs font-semibold text-white/70">Your provider API keys (optional)</label>
                  </div>
                  <p className="mb-3 text-[11px] text-white/35">
                    Add a key to route that provider&apos;s models directly (billed to you, often cheaper). Without a key, the platform routes it for you. Keys are encrypted and never shown again.
                  </p>
                  <div className="space-y-2">
                    {(['openai', 'anthropic', 'google'] as const).map((prov) => {
                      const existing = settings?.keys.find((k) => k.provider === prov);
                      const label = prov === 'openai' ? 'OpenAI' : prov === 'anthropic' ? 'Anthropic' : 'Google';
                      return (
                        <div key={prov} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-xs font-medium text-white/80">{label}</span>
                            {existing ? (
                              <span className="rounded bg-[#00FF9D]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#00FF9D]">
                                ••••{existing.hint}
                              </span>
                            ) : (
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/40">platform-routed</span>
                            )}
                            {existing && (
                              <button
                                onClick={() => deleteKey(prov)}
                                disabled={savingSettings}
                                className="ml-auto rounded p-1 text-white/30 hover:bg-white/10 hover:text-[#FF3366] disabled:opacity-40"
                                title="Remove key"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={keyInputs[prov] || ''}
                              onChange={(e) => setKeyInputs((k) => ({ ...k, [prov]: e.target.value }))}
                              placeholder={existing ? 'Replace key…' : `Paste ${label} API key…`}
                              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#A855F7]/50"
                            />
                            <button
                              onClick={() => saveKey(prov)}
                              disabled={savingSettings || !(keyInputs[prov] || '').trim()}
                              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:border-[#A855F7]/50 hover:text-white disabled:opacity-30"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
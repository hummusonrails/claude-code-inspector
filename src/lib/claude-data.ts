import fs from "fs";
import path from "path";
import readline from "readline";
import os from "os";

// types

export interface ContextSnapshot {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  messageIndex: number;
}

export interface SessionSummary {
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

export interface Project {
  id: string;
  name: string;
  path: string;
  sessions: SessionSummary[];
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  sessionCount: number;
  firstActivity: string;
  lastActivity: string;
}

export interface SessionMessage {
  type: string;
  timestamp: string;
  role?: string;
  text?: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface GlobalStats {
  totalProjects: number;
  totalSessions: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  dailyActivity: DailyActivity[];
}

// helpers

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");

// projects to exclude from the dashboard
const EXCLUDED_PROJECTS = ["cashclaw"];

// derive a short human-readable name from the encoded directory name
function deriveProjectName(encoded: string): string {
  if (encoded === "-" || encoded === "") return "home";

  const projectPath = deriveProjectPath(encoded);
  const segments = projectPath.split("/").filter(Boolean);
  if (segments.length === 0) return encoded;

  const last = segments[segments.length - 1];
  if (segments.length >= 2 && ["Dev", "personal", "src", "lib"].includes(last)) {
    return segments.slice(-2).join("/");
  }
  return last;
}

// derive the original filesystem path from the encoded directory name
function deriveProjectPath(encoded: string): string {
  if (encoded.startsWith("-")) {
    return "/" + encoded.slice(1).replace(/-/g, "/");
  }
  return "/" + encoded.replace(/-/g, "/");
}

// read a jsonl file line-by-line via a stream, skipping blank and unparseable lines
async function readJsonlStream(
  filePath: string,
  onLine: (obj: Record<string, unknown>, lineIndex: number) => void | "stop",
  options?: { filterTypes?: string[] }
): Promise<void> {
  const filterTypes = options?.filterTypes;

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineIndex = 0;
    let stopped = false;

    rl.on("line", (line: string) => {
      if (stopped) return;
      const trimmed = line.trim();
      if (!trimmed) {
        lineIndex++;
        return;
      }

      // fast pre-filter for desired types
      if (filterTypes) {
        let matched = false;
        for (const t of filterTypes) {
          if (trimmed.includes(`"type":"${t}"`) || trimmed.includes(`"type": "${t}"`)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          lineIndex++;
          return;
        }
      }

      try {
        const obj = JSON.parse(trimmed);
        const result = onLine(obj, lineIndex);
        if (result === "stop") {
          stopped = true;
          rl.close();
          stream.destroy();
        }
      } catch {
        // skip unparseable line
      }
      lineIndex++;
    });

    rl.on("close", () => resolve());
    rl.on("error", (err: Error) => reject(err));
    stream.on("error", (err: Error) => {
      rl.close();
      reject(err);
    });
  });
}

// extract text content from a user message object
function extractUserText(message: Record<string, unknown>): string {
  const msg = message.message as Record<string, unknown> | undefined;
  if (!msg) return "";
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as Record<string, unknown>).type === "text"
      ) {
        return ((part as Record<string, unknown>).text as string) || "";
      }
    }
  }
  return "";
}

// extract usage data from an assistant message object
function extractAssistantData(message: Record<string, unknown>): {
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
} {
  const msg = message.message as Record<string, unknown> | undefined;
  const model = (msg?.model as string) || "";
  const rawUsage = (msg?.usage as Record<string, unknown>) || {};
  return {
    model,
    usage: {
      input_tokens: (rawUsage.input_tokens as number) || 0,
      output_tokens: (rawUsage.output_tokens as number) || 0,
      cache_creation_input_tokens:
        (rawUsage.cache_creation_input_tokens as number) || 0,
      cache_read_input_tokens:
        (rawUsage.cache_read_input_tokens as number) || 0,
    },
  };
}

// build a full session summary by streaming the entire jsonl file
async function parseSessionFull(
  filePath: string,
  projectId: string
): Promise<SessionSummary> {
  const sessionId = path.basename(filePath, ".jsonl");

  let firstPrompt = "";
  let lastPrompt = "";
  let firstTimestamp = "";
  let lastTimestamp = "";
  let messageCount = 0;
  let model = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  const snapshots: ContextSnapshot[] = [];
  let assistantIndex = 0;

  await readJsonlStream(filePath, (obj) => {
    const type = obj.type as string;
    const timestamp = (obj.timestamp as string) || "";

    if (type === "user") {
      messageCount++;
      const text = extractUserText(obj);
      if (!firstPrompt) {
        firstPrompt = text;
      }
      lastPrompt = text;
      if (!firstTimestamp && timestamp) firstTimestamp = timestamp;
      if (timestamp) lastTimestamp = timestamp;
    } else if (type === "assistant") {
      messageCount++;
      const data = extractAssistantData(obj);
      if (data.model) model = data.model;
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;
      totalCacheCreationTokens += data.usage.cache_creation_input_tokens;
      totalCacheReadTokens += data.usage.cache_read_input_tokens;

      const snapshotTotal =
        data.usage.input_tokens +
        data.usage.output_tokens +
        data.usage.cache_creation_input_tokens +
        data.usage.cache_read_input_tokens;

      snapshots.push({
        timestamp: timestamp || lastTimestamp,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        cacheCreationTokens: data.usage.cache_creation_input_tokens,
        cacheReadTokens: data.usage.cache_read_input_tokens,
        totalTokens: snapshotTotal,
        messageIndex: assistantIndex,
      });
      assistantIndex++;

      if (!firstTimestamp && timestamp) firstTimestamp = timestamp;
      if (timestamp) lastTimestamp = timestamp;
    }
  }, { filterTypes: ["user", "assistant"] });

  const totalTokens =
    totalInputTokens +
    totalOutputTokens +
    totalCacheCreationTokens +
    totalCacheReadTokens;

  // downsample snapshots if too many, keep max 100
  const maxSnapshots = 100;
  let finalSnapshots = snapshots;
  if (snapshots.length > maxSnapshots) {
    const step = snapshots.length / maxSnapshots;
    finalSnapshots = [];
    for (let i = 0; i < maxSnapshots; i++) {
      finalSnapshots.push(snapshots[Math.floor(i * step)]);
    }
    // always include the last snapshot
    finalSnapshots[finalSnapshots.length - 1] = snapshots[snapshots.length - 1];
  }

  return {
    id: sessionId,
    projectId,
    firstPrompt: firstPrompt.slice(0, 200),
    lastPrompt: lastPrompt.slice(0, 200),
    firstTimestamp,
    lastTimestamp,
    messageCount,
    model,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens,
    contextWindowSnapshots: finalSnapshots,
  };
}

// lightweight session summary, delegates to full parse since totals are needed
async function parseSessionSummary(
  filePath: string,
  projectId: string
): Promise<SessionSummary> {
  return parseSessionFull(filePath, projectId);
}

// parse a session jsonl into full detail including all messages
async function parseSessionDetail(
  filePath: string,
  projectId: string
): Promise<SessionDetail> {
  const sessionId = path.basename(filePath, ".jsonl");

  let firstPrompt = "";
  let lastPrompt = "";
  let firstTimestamp = "";
  let lastTimestamp = "";
  let messageCount = 0;
  let model = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  const snapshots: ContextSnapshot[] = [];
  const messages: SessionMessage[] = [];
  let assistantIndex = 0;

  await readJsonlStream(filePath, (obj) => {
    const type = obj.type as string;
    const timestamp = (obj.timestamp as string) || "";

    if (type === "user") {
      messageCount++;
      const text = extractUserText(obj);
      if (!firstPrompt) firstPrompt = text;
      lastPrompt = text;
      if (!firstTimestamp && timestamp) firstTimestamp = timestamp;
      if (timestamp) lastTimestamp = timestamp;

      messages.push({
        type: "user",
        timestamp,
        role: "user",
        text,
      });
    } else if (type === "assistant") {
      messageCount++;
      const data = extractAssistantData(obj);
      if (data.model) model = data.model;
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;
      totalCacheCreationTokens += data.usage.cache_creation_input_tokens;
      totalCacheReadTokens += data.usage.cache_read_input_tokens;

      const snapshotTotal =
        data.usage.input_tokens +
        data.usage.output_tokens +
        data.usage.cache_creation_input_tokens +
        data.usage.cache_read_input_tokens;

      snapshots.push({
        timestamp: timestamp || lastTimestamp,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        cacheCreationTokens: data.usage.cache_creation_input_tokens,
        cacheReadTokens: data.usage.cache_read_input_tokens,
        totalTokens: snapshotTotal,
        messageIndex: assistantIndex,
      });
      assistantIndex++;

      if (!firstTimestamp && timestamp) firstTimestamp = timestamp;
      if (timestamp) lastTimestamp = timestamp;

      // extract assistant text content
      const msg = obj.message as Record<string, unknown> | undefined;
      let assistantText = "";
      if (msg) {
        const content = msg.content;
        if (typeof content === "string") {
          assistantText = content;
        } else if (Array.isArray(content)) {
          const textParts: string[] = [];
          for (const part of content) {
            if (
              part &&
              typeof part === "object" &&
              (part as Record<string, unknown>).type === "text"
            ) {
              textParts.push(
                ((part as Record<string, unknown>).text as string) || ""
              );
            }
          }
          assistantText = textParts.join("\n");
        }
      }

      messages.push({
        type: "assistant",
        timestamp,
        role: "assistant",
        text: assistantText,
        model: data.model,
        usage: data.usage,
      });
    }
  }, { filterTypes: ["user", "assistant"] });

  const totalTokens =
    totalInputTokens +
    totalOutputTokens +
    totalCacheCreationTokens +
    totalCacheReadTokens;

  return {
    id: sessionId,
    projectId,
    firstPrompt: firstPrompt.slice(0, 500),
    lastPrompt: lastPrompt.slice(0, 500),
    firstTimestamp,
    lastTimestamp,
    messageCount,
    model,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens,
    contextWindowSnapshots: snapshots,
    messages,
  };
}

// quick session scanner for basic metadata without full parsing
async function quickScanSession(
  filePath: string,
  projectId: string
): Promise<SessionSummary> {
  const sessionId = path.basename(filePath, ".jsonl");

  let firstPrompt = "";
  let lastPrompt = "";
  let firstTimestamp = "";
  let lastTimestamp = "";
  let messageCount = 0;
  let model = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  await readJsonlStream(filePath, (obj) => {
    const type = obj.type as string;
    const timestamp = (obj.timestamp as string) || "";

    if (type === "user") {
      messageCount++;
      if (!firstPrompt) {
        firstPrompt = extractUserText(obj);
      }
      lastPrompt = extractUserText(obj);
      if (!firstTimestamp && timestamp) firstTimestamp = timestamp;
      if (timestamp) lastTimestamp = timestamp;
    } else if (type === "assistant") {
      messageCount++;
      const data = extractAssistantData(obj);
      if (data.model) model = data.model;
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;
      totalCacheCreationTokens += data.usage.cache_creation_input_tokens;
      totalCacheReadTokens += data.usage.cache_read_input_tokens;
      if (!firstTimestamp && timestamp) firstTimestamp = timestamp;
      if (timestamp) lastTimestamp = timestamp;
    }
  }, { filterTypes: ["user", "assistant"] });

  const totalTokens =
    totalInputTokens + totalOutputTokens +
    totalCacheCreationTokens + totalCacheReadTokens;

  return {
    id: sessionId,
    projectId,
    firstPrompt: firstPrompt.slice(0, 200),
    lastPrompt: lastPrompt.slice(0, 200),
    firstTimestamp,
    lastTimestamp,
    messageCount,
    model,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens,
    contextWindowSnapshots: [],
  };
}

// public api

// list all projects with session summaries, no context snapshots
export async function getProjects(): Promise<Project[]> {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const projects: Project[] = [];

  // process all projects concurrently
  const projectPromises = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const name = entry.name.toLowerCase();
      return !EXCLUDED_PROJECTS.some((ex) => name.includes(ex));
    })
    .map(async (entry) => {
      const projectId = entry.name;
      const projectDir = path.join(PROJECTS_DIR, projectId);
      const projectName = deriveProjectName(projectId);
      const projectPath = deriveProjectPath(projectId);

      let jsonlFiles: string[] = [];
      try {
        jsonlFiles = fs
          .readdirSync(projectDir)
          .filter((f) => f.endsWith(".jsonl"))
          .map((f) => path.join(projectDir, f));
      } catch {
        return null;
      }

      if (jsonlFiles.length === 0) return null;

      const sessions: SessionSummary[] = [];

      // process sessions concurrently within each project
      const sessionResults = await Promise.allSettled(
        jsonlFiles.map((file) => quickScanSession(file, projectId))
      );

      for (const result of sessionResults) {
        if (result.status === "fulfilled" && result.value.messageCount > 0) {
          sessions.push(result.value);
        }
      }

      if (sessions.length === 0) return null;

      sessions.sort(
        (a, b) =>
          new Date(b.firstTimestamp).getTime() -
          new Date(a.firstTimestamp).getTime()
      );

      let totalTokens = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreationTokens = 0;
      let totalCacheReadTokens = 0;
      let firstActivity = "";
      let lastActivity = "";

      for (const s of sessions) {
        totalTokens += s.totalTokens;
        totalInputTokens += s.totalInputTokens;
        totalOutputTokens += s.totalOutputTokens;
        totalCacheCreationTokens += s.totalCacheCreationTokens;
        totalCacheReadTokens += s.totalCacheReadTokens;

        if (
          !firstActivity ||
          (s.firstTimestamp &&
            new Date(s.firstTimestamp) < new Date(firstActivity))
        ) {
          firstActivity = s.firstTimestamp;
        }
        if (
          !lastActivity ||
          (s.lastTimestamp && new Date(s.lastTimestamp) > new Date(lastActivity))
        ) {
          lastActivity = s.lastTimestamp;
        }
      }

      return {
        id: projectId,
        name: projectName,
        path: projectPath,
        sessions,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreationTokens,
        totalCacheReadTokens,
        sessionCount: sessions.length,
        firstActivity,
        lastActivity,
      } as Project;
    });

  const results = await Promise.allSettled(projectPromises);
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      projects.push(result.value);
    }
  }

  // sort projects by last activity descending
  projects.sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  return projects;
}

// get full detail for a single project
export async function getProjectDetail(projectId: string): Promise<Project> {
  const projectDir = path.join(PROJECTS_DIR, projectId);

  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const lower = projectId.toLowerCase();
  if (EXCLUDED_PROJECTS.some((ex) => lower.includes(ex))) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const projectName = deriveProjectName(projectId);
  const projectPath = deriveProjectPath(projectId);

  const jsonlFiles = fs
    .readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(projectDir, f));

  const sessions: SessionSummary[] = [];

  for (const file of jsonlFiles) {
    try {
      const summary = await parseSessionFull(file, projectId);
      if (summary.messageCount > 0) {
        sessions.push(summary);
      }
    } catch {
      // skip unreadable session
    }
  }

  sessions.sort(
    (a, b) =>
      new Date(b.firstTimestamp).getTime() -
      new Date(a.firstTimestamp).getTime()
  );

  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let firstActivity = "";
  let lastActivity = "";

  for (const s of sessions) {
    totalTokens += s.totalTokens;
    totalInputTokens += s.totalInputTokens;
    totalOutputTokens += s.totalOutputTokens;
    totalCacheCreationTokens += s.totalCacheCreationTokens;
    totalCacheReadTokens += s.totalCacheReadTokens;

    if (
      !firstActivity ||
      (s.firstTimestamp && new Date(s.firstTimestamp) < new Date(firstActivity))
    ) {
      firstActivity = s.firstTimestamp;
    }
    if (
      !lastActivity ||
      (s.lastTimestamp && new Date(s.lastTimestamp) > new Date(lastActivity))
    ) {
      lastActivity = s.lastTimestamp;
    }
  }

  return {
    id: projectId,
    name: projectName,
    path: projectPath,
    sessions,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    sessionCount: sessions.length,
    firstActivity,
    lastActivity,
  };
}

// get full session detail including all messages
export async function getSessionDetail(
  projectId: string,
  sessionId: string
): Promise<SessionDetail> {
  const filePath = path.join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return parseSessionDetail(filePath, projectId);
}

// read daily activity from stats-cache.json
export async function getDailyActivity(): Promise<DailyActivity[]> {
  const statsPath = path.join(CLAUDE_DIR, "stats-cache.json");

  if (!fs.existsSync(statsPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(statsPath, "utf-8");
    const data = JSON.parse(raw);

    // handle both array and object formats
    if (Array.isArray(data)) {
      return data.map(
        (entry: Record<string, unknown>): DailyActivity => ({
          date: (entry.date as string) || "",
          messageCount: (entry.messageCount as number) ||
            (entry.messages as number) || 0,
          sessionCount: (entry.sessionCount as number) ||
            (entry.sessions as number) || 0,
          toolCallCount: (entry.toolCallCount as number) ||
            (entry.toolCalls as number) || 0,
        })
      );
    }

    if (typeof data === "object" && data !== null) {
      const activities: DailyActivity[] = [];
      for (const [dateKey, value] of Object.entries(data)) {
        const val = value as Record<string, unknown>;
        activities.push({
          date: dateKey,
          messageCount: (val.messageCount as number) ||
            (val.messages as number) || 0,
          sessionCount: (val.sessionCount as number) ||
            (val.sessions as number) || 0,
          toolCallCount: (val.toolCallCount as number) ||
            (val.toolCalls as number) || 0,
        });
      }
      activities.sort((a, b) => a.date.localeCompare(b.date));
      return activities;
    }

    return [];
  } catch {
    return [];
  }
}

// get aggregated global stats across all projects
export async function getGlobalStats(): Promise<GlobalStats> {
  const projects = await getProjects();
  const dailyActivity = await getDailyActivity();

  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let totalSessions = 0;

  for (const p of projects) {
    totalTokens += p.totalTokens;
    totalInputTokens += p.totalInputTokens;
    totalOutputTokens += p.totalOutputTokens;
    totalCacheCreationTokens += p.totalCacheCreationTokens;
    totalCacheReadTokens += p.totalCacheReadTokens;
    totalSessions += p.sessionCount;
  }

  return {
    totalProjects: projects.length,
    totalSessions,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    dailyActivity,
  };
}

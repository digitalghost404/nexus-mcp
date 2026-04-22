#!/usr/bin/env node
/**
 * nexus-mcp — MCP server wrapping the nexus CLI for cross-session memory.
 *
 * Exposes 9 tools that shell out to the nexus binary via child_process.execFile.
 * Communicates over stdio using the standard MCP JSON-RPC transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";

const NEXUS_BIN = process.env.NEXUS_BIN || "nexus";
const TIMEOUT_MS = 30_000;

// ─── Helper: run nexus command ───────────────────────────────────────────────

function runNexus(args, opts = {}) {
  return new Promise((resolve) => {
    const agent = process.env.NEXUS_AGENT;
    if (agent && !args.includes("--agent")) {
      args = ["--agent", agent, ...args];
    }

    execFile(NEXUS_BIN, args, { timeout: TIMEOUT_MS, ...opts }, (err, stdout, stderr) => {
      if (err) {
        // Binary not found
        if (err.code === "ENOENT") {
          resolve({
            isError: true,
            text: `nexus binary not found at "${NEXUS_BIN}". Install nexus or set NEXUS_BIN env var.`,
          });
          return;
        }
        // Timeout
        if (err.killed) {
          resolve({
            isError: true,
            text: `Command timed out after ${TIMEOUT_MS / 1000}s: nexus ${args.join(" ")}`,
          });
          return;
        }
        // Non-zero exit
        const msg = (stderr || stdout || err.message).trim();
        resolve({ isError: true, text: msg || `nexus exited with code ${err.code}` });
        return;
      }

      const output = stdout.trim();
      resolve({ isError: false, text: output || "No results" });
    });
  });
}

function toContent(result) {
  return {
    content: [{ type: "text", text: result.text }],
    ...(result.isError ? { isError: true } : {}),
  };
}

async function nexusTool(args, opts = {}) {
  const result = await runNexus(args, opts);
  return toContent(result);
}

/**
 * Resolve a project name to its filesystem path via `nexus show`.
 * Returns the path string, or null if parsing fails.
 */
async function resolveProjectPath(project) {
  const result = await runNexus(["show", project]);
  if (result.isError) return null;
  const match = result.text.match(/Path:\s+(.+)/);
  return match ? match[1].trim() : null;
}

// ─── Server ──────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "nexus",
  version: "1.0.0",
});

// ─── Tools ───────────────────────────────────────────────────────────────────

// 1. context — full project context export
server.tool(
  "context",
  "Export full project context (sessions, notes, health) for loading into a new conversation",
  { project: z.string().describe("Project name") },
  async ({ project }) => nexusTool(["context", project])
);

// 2. resume — pick up where you left off
server.tool(
  "resume",
  "Show last session with commits, files changed, and uncommitted changes. Project name is required because the MCP server cannot detect the user's working directory.",
  { project: z.string().describe("Project name") },
  async ({ project }) => nexusTool(["resume", project])
);

// 3. note — save a note
server.tool(
  "note",
  "Save a note to a project's context for future sessions. Project name is required because the MCP server cannot detect the user's working directory.",
  {
    project: z.string().describe("Project name to attach the note to"),
    message: z.string().describe("Note content to save"),
  },
  async ({ project, message }) => {
    const projectPath = await resolveProjectPath(project);
    if (!projectPath) {
      return toContent({
        isError: true,
        text: `Could not resolve path for project "${project}". Check the name with the 'projects' tool.`,
      });
    }
    return nexusTool(["note", message], { cwd: projectPath });
  }
);

// 4. search — full-text search
server.tool(
  "search",
  "Full-text search across sessions and notes",
  {
    query: z.string().describe("Search query"),
    project: z.string().optional().describe("Filter by project name"),
    files: z.string().optional().describe("Filter by file pattern"),
  },
  async ({ query, project, files }) => {
    const args = ["search", query];
    if (project) args.push("--project", project);
    if (files) args.push("--files", files);
    return nexusTool(args);
  }
);

// 5. where — find which projects/files match
server.tool(
  "where",
  "Find which projects and files match a query, grouped by project",
  { query: z.string().describe("Search query") },
  async ({ query }) => nexusTool(["where", query])
);

// 6. report — activity summary
server.tool(
  "report",
  "Generate activity summary with sessions, commits, files, and language breakdown",
  {
    period: z
      .enum(["week", "month"])
      .optional()
      .describe("Time period: 'week' (default) or 'month'"),
  },
  async ({ period }) => {
    const args = ["report"];
    if (period === "month") args.push("--month");
    else if (period === "week") args.push("--week");
    return nexusTool(args);
  }
);

// 7. projects — list tracked projects
server.tool(
  "projects",
  "List all tracked projects with health status",
  {
    filter: z
      .enum(["active", "dirty", "stale"])
      .optional()
      .describe("Filter: 'active', 'dirty', or 'stale'"),
  },
  async ({ filter }) => {
    const args = ["projects"];
    if (filter) args.push(`--${filter}`);
    return nexusTool(args);
  }
);

// 8. show — detailed project info
server.tool(
  "show",
  "Show detailed info for a specific project including health, recent sessions, and notes",
  { project: z.string().describe("Project name") },
  async ({ project }) => nexusTool(["show", project])
);

// 9. sessions — session history
server.tool(
  "sessions",
  "List OpenCode session history with filtering options",
  {
    project: z.string().optional().describe("Filter by project name"),
    since: z.string().optional().describe("Show sessions since duration (e.g. '7d', '24h')"),
    today: z.boolean().optional().describe("Show only today's sessions"),
    tag: z.string().optional().describe("Filter by user tag"),
  },
  async ({ project, since, today, tag }) => {
    const args = ["sessions"];
    if (project) args.push("--project", project);
    if (since) args.push("--since", since);
    if (today) args.push("--today");
    if (tag) args.push("--tag", tag);
    return nexusTool(args);
  }
);

// 10. diff — summarize changes across sessions
server.tool(
  "diff",
  "Summarize changes (commits, files changed) across sessions in a time window",
  {
    project: z.string().optional().describe("Project name to filter by"),
    since: z.string().optional().describe("Time window (e.g. '7d', '24h', '1m')"),
  },
  async ({ project, since }) => {
    const args = ["diff"];
    if (project) args.push(project);
    if (since) args.push("--since", since);
    return nexusTool(args);
  }
);

// 11. streak — show coding streak
server.tool(
  "streak",
  "Show consecutive days with sessions, plus weekly activity bars",
  {},
  async () => nexusTool(["streak"])
);

// 12. stale — list stale branches and dirty projects
server.tool(
  "stale",
  "List stale branches and dirty projects. Use --cleanup for interactive cleanup.",
  {
    cleanup: z.boolean().optional().describe("Enable interactive branch cleanup"),
  },
  async ({ cleanup }) => {
    const args = ["stale"];
    if (cleanup) args.push("--cleanup");
    return nexusTool(args);
  }
);

// 13. tag — add user tag to a session
server.tool(
  "tag",
  "Add a user tag to a session. Without session ID, tags the latest session.",
  {
    label: z.string().describe("Tag label to add"),
    sessionId: z.string().optional().describe("Session ID to tag"),
  },
  async ({ label, sessionId }) => {
    const args = ["tag"];
    if (sessionId) args.push(sessionId);
    args.push(label);
    return nexusTool(args);
  }
);

// 14. deps — scan for outdated dependencies
server.tool(
  "deps",
  "Scan tracked projects for outdated Go, npm, and pip dependencies.",
  {
    project: z.string().optional().describe("Project to check"),
  },
  async ({ project }) => {
    const args = ["deps"];
    if (project) args.push("--project", project);
    return nexusTool(args);
  }
);

// 15. recall — semantic search
server.tool(
  "recall",
  "Semantic search across sessions, notes, and preferences",
  {
    query: z.string().describe("Search query"),
    limit: z.number().optional().default(5).describe("Maximum results"),
    types: z
      .array(z.string())
      .optional()
      .default(["session", "note", "preference"])
      .describe("Result types to search"),
    project: z.string().optional().describe("Project scope"),
  },
  async ({ query, limit, types, project }) => {
    const args = ["recall", query, "--limit", String(limit)];
    if (project) args.push("--project", project);
    args.push("--types", types.join(","));
    return nexusTool(args);
  }
);

// 16. remember — save a preference
server.tool(
  "remember",
  "Save a preference, decision, or pattern for future sessions",
  {
    content: z.string().describe("The preference or pattern to remember"),
    category: z
      .enum(["workflow", "style", "tool", "preference", "pattern"])
      .optional()
      .default("preference"),
    source: z
      .enum(["stated", "observed", "inferred"])
      .optional()
      .default("stated"),
    project: z.string().optional().describe("Project scope (optional)"),
  },
  async ({ content, category, source, project }) => {
    const args = ["remember", content, "--category", category, "--source", source];
    if (project) args.push("--project", project);
    return nexusTool(args);
  }
);

// 17. preferences — read preferences
server.tool(
  "preferences",
  "Read preferences and patterns for a project or globally",
  {
    project: z.string().optional().describe("Project scope (optional, omits for global)"),
    category: z
      .enum(["workflow", "style", "tool", "preference", "pattern"])
      .optional(),
  },
  async ({ project, category }) => {
    const args = ["preferences"];
    if (project) args.push("--project", project);
    if (category) args.push("--category", category);
    return nexusTool(args);
  }
);

// 18. inject — smart context injection
server.tool(
  "inject",
  "Build smart context for session start or mid-session project switch",
  {
    project: z.string().describe("Project name"),
    task_description: z.string().optional().describe("What the user seems to be working on"),
  },
  async ({ project, task_description }) => {
    const args = ["inject", project];
    if (task_description) args.push("--task", task_description);
    return nexusTool(args);
  }
);

server.setResourceRequestHandlers();
server.setPromptRequestHandlers();

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

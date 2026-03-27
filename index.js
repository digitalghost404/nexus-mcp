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
  "List Claude Code session history with filtering options",
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

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

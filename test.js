#!/usr/bin/env node
/**
 * nexus-mcp — Test suite
 * Spawns the MCP server as a subprocess and communicates via JSON-RPC over stdio.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Colours ─────────────────────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const B = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

// ─── MCP client ──────────────────────────────────────────────────────────────
class McpTestClient {
  constructor() {
    this.proc = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn("node", [path.join(__dirname, "index.js")], {
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc.stdout.on("data", (chunk) => {
        this.buffer += chunk.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const resolve = this.pending.get(msg.id);
            if (resolve) {
              this.pending.delete(msg.id);
              resolve(msg);
            }
          } catch {
            /* ignore non-JSON lines */
          }
        }
      });

      this.proc.stderr.on("data", () => {});

      this.proc.on("error", reject);

      this.call("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "nexus-mcp-test", version: "1" },
      })
        .then((res) => {
          const notif =
            JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
              params: {},
            }) + "\n";
          this.proc.stdin.write(notif);
          resolve(res);
        })
        .catch(reject);
    });
  }

  call(method, params = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc.stdin.write(msg);
    });
  }

  tool(name, args = {}, timeoutMs = 35000) {
    return this.call("tools/call", { name, arguments: args }, timeoutMs);
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.proc) return resolve();
      this.proc.on("close", resolve);
      this.proc.kill();
    });
  }
}

// ─── Test runner ─────────────────────────────────────────────────────────────
const results = [];

function assert(condition, testName, detail = "") {
  results.push({ name: testName, pass: !!condition, detail });
}

function getText(res) {
  return res?.result?.content?.[0]?.text ?? "";
}

function isError(res) {
  return !!(res?.error || res?.result?.isError);
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(B("\nnexus-mcp — Test Suite\n"));

const client = new McpTestClient();

// ── Server Init ──────────────────────────────────────────────────────────────
console.log(Y("Server Init"));
let initRes;
try {
  initRes = await client.start();
  const serverName = initRes?.result?.serverInfo?.name ?? "";
  assert(
    serverName === "nexus",
    "server init: name is 'nexus'",
    `serverInfo.name = "${serverName}"`
  );
} catch (e) {
  assert(false, "server init: name is 'nexus'", `Failed to start: ${e.message}`);
  console.log(R("Fatal: could not start server. Aborting."));
  process.exit(1);
}

// ── tools/list ───────────────────────────────────────────────────────────────
console.log(Y("\ntools/list"));
try {
  const res = await client.call("tools/list");
  const tools = res?.result?.tools ?? [];
  const toolNames = tools.map((t) => t.name).sort();
  const expected = [
    "context",
    "deps",
    "diff",
    "inject",
    "note",
    "preferences",
    "projects",
    "recall",
    "remember",
    "report",
    "resume",
    "search",
    "sessions",
    "show",
    "stale",
    "streak",
    "tag",
    "where",
  ];
  assert(
    JSON.stringify(toolNames) === JSON.stringify(expected),
    "tools/list: all 18 tools registered",
    `got: [${toolNames.join(", ")}]`
  );
} catch (e) {
  assert(false, "tools/list: all 14 tools registered", e.message);
}

// ── projects ─────────────────────────────────────────────────────────────────
console.log(Y("\nprojects"));
try {
  const res = await client.tool("projects");
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "projects: returns non-empty output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "projects: returns non-empty output", e.message);
}

// ── projects with filter ─────────────────────────────────────────────────────
console.log(Y("\nprojects (active filter)"));
try {
  const res = await client.tool("projects", { filter: "active" });
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "projects(active): returns output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "projects(active): returns output", e.message);
}

// ── sessions ─────────────────────────────────────────────────────────────────
console.log(Y("\nsessions"));
try {
  const res = await client.tool("sessions");
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "sessions: returns non-empty output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "sessions: returns non-empty output", e.message);
}

// ── sessions with today flag ─────────────────────────────────────────────────
console.log(Y("\nsessions (today)"));
try {
  const res = await client.tool("sessions", { today: true });
  const text = getText(res);
  assert(
    !isError(res),
    "sessions(today): does not error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "sessions(today): does not error", e.message);
}

// ── diff ─────────────────────────────────────────────────────────────────────
console.log(Y("\ndiff"));
try {
  const res = await client.tool("diff", { project: "nexus", since: "7d" });
  const text = getText(res);
  assert(
    !isError(res),
    "diff(project=nexus, since=7d): does not error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "diff(project=nexus, since=7d): does not error", e.message);
}

// ── streak ───────────────────────────────────────────────────────────────────
console.log(Y("\nstreak"));
try {
  const res = await client.tool("streak");
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "streak: returns non-empty output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "streak: returns non-empty output", e.message);
}

// ── stale ─────────────────────────────────────────────────────────────────────
console.log(Y("\nstale"));
try {
  const res = await client.tool("stale");
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "stale: returns non-empty output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "stale: returns non-empty output", e.message);
}

// ── tag ───────────────────────────────────────────────────────────────────────
console.log(Y("\ntag"));
try {
  const res = await client.tool("tag", { label: "test-tag" });
  const text = getText(res);
  assert(
    isError(res) && text.includes("not inside a tracked project"),
    "tag outside project: returns expected error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "tag outside project: returns expected error", e.message);
}

// ── deps ──────────────────────────────────────────────────────────────────────
console.log(Y("\ndeps"));
try {
  const res = await client.tool("deps");
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "deps: returns non-empty output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "deps: returns non-empty output", e.message);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(Y("\nreport"));
try {
  const res = await client.tool("report");
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "report: returns non-empty output",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "report: returns non-empty output", e.message);
}

// ── search ───────────────────────────────────────────────────────────────────
console.log(Y("\nsearch"));
try {
  const res = await client.tool("search", { query: "nexus" });
  const text = getText(res);
  assert(
    !isError(res),
    "search: does not error for 'nexus' query",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "search: does not error for 'nexus' query", e.message);
}

// ── where ────────────────────────────────────────────────────────────────────
console.log(Y("\nwhere"));
try {
  const res = await client.tool("where", { query: "mcp" });
  const text = getText(res);
  assert(
    !isError(res),
    "where: does not error for 'mcp' query",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "where: does not error for 'mcp' query", e.message);
}

// ── note ─────────────────────────────────────────────────────────────────────
console.log(Y("\nnote"));
try {
  const res = await client.tool("note", { project: "nexus", message: "nexus-mcp test note" });
  const text = getText(res);
  assert(
    !isError(res),
    "note: saves a note without error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "note: saves a note without error", e.message);
}

// ── resume (no project — required param missing → validation error) ──────────
console.log(Y("\nresume (no project)"));
try {
  const res = await client.tool("resume");
  // MCP SDK may return error in res.error or as isError in result content
  const hasError = !!(res?.error || res?.result?.isError);
  assert(
    hasError,
    "resume(no project): rejects when project omitted",
    res?.error?.message?.slice(0, 100) || getText(res).slice(0, 100) || "no error found"
  );
} catch (e) {
  assert(false, "resume(no project): rejects when project omitted", e.message);
}

// ── resume (with project name) ───────────────────────────────────────────────
console.log(Y("\nresume (with project)"));
try {
  const res = await client.tool("resume", { project: "ollama-mcp" });
  const text = getText(res);
  assert(
    !isError(res) && text.length > 0,
    "resume(ollama-mcp): returns output for known project",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "resume(ollama-mcp): returns output for known project", e.message);
}

// ── show ─────────────────────────────────────────────────────────────────────
console.log(Y("\nshow (invalid project)"));
try {
  const res = await client.tool("show", { project: "nonexistent-fake-project-xyz" });
  assert(
    isError(res),
    "show(invalid): returns error for nonexistent project",
    getText(res).slice(0, 100)
  );
} catch (e) {
  assert(false, "show(invalid): returns error for nonexistent project", e.message);
}

// ── context (invalid project) ────────────────────────────────────────────────
console.log(Y("\ncontext (invalid project)"));
try {
  const res = await client.tool("context", { project: "nonexistent-fake-project-xyz" });
  assert(
    isError(res),
    "context(invalid): returns error for nonexistent project",
    getText(res).slice(0, 100)
  );
} catch (e) {
  assert(false, "context(invalid): returns error for nonexistent project", e.message);
}

// ── recall ───────────────────────────────────────────────────────────────────
console.log(Y("\nrecall"));
try {
  const res = await client.tool("recall", { query: "nexus", limit: 3 });
  const text = getText(res);
  assert(
    !isError(res),
    "recall: does not error for 'nexus' query",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "recall: does not error for 'nexus' query", e.message);
}

// ── remember ─────────────────────────────────────────────────────────────────
console.log(Y("\nremember"));
try {
  const res = await client.tool("remember", {
    content: "Use conventional commits for all changes",
    category: "workflow",
    source: "stated",
  });
  const text = getText(res);
  assert(
    !isError(res),
    "remember: saves a preference without error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "remember: saves a preference without error", e.message);
}

// ── preferences (no project) ────────────────────────────────────────────────
console.log(Y("\npreferences (global)"));
try {
  const res = await client.tool("preferences");
  const text = getText(res);
  assert(
    !isError(res),
    "preferences(global): returns output without error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "preferences(global): returns output without error", e.message);
}

// ── preferences (with project) ──────────────────────────────────────────────
console.log(Y("\npreferences (with project)"));
try {
  const res = await client.tool("preferences", { project: "nexus" });
  const text = getText(res);
  assert(
    !isError(res),
    "preferences(project=nexus): returns output without error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "preferences(project=nexus): returns output without error", e.message);
}

// ── inject ───────────────────────────────────────────────────────────────────
console.log(Y("\ninject"));
try {
  const res = await client.tool("inject", {
    project: "nexus",
    task_description: "adding MCP tools for persistent memory",
  });
  const text = getText(res);
  assert(
    !isError(res),
    "inject(project=nexus): returns output without error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "inject(project=nexus): returns output without error", e.message);
}

// ─── Cleanup & Report ────────────────────────────────────────────────────────
await client.stop();

const passed = results.filter((r) => r.pass);
const failed = results.filter((r) => !r.pass);

console.log(B("\n─────────────────────────────────────────"));
console.log(B("Results\n"));

for (const r of results) {
  if (r.pass) {
    console.log(
      `${G("PASS")} ${r.name.padEnd(55)} ${DIM(String(r.detail).replace(/\n/g, " ").slice(0, 80))}`
    );
  } else {
    console.log(`${R("FAIL")} ${r.name.padEnd(55)} ${Y(String(r.detail))}`);
  }
}

console.log(B("\n─────────────────────────────────────────"));
console.log(
  `${G(`PASS ${passed.length}`)}  ${failed.length ? R(`FAIL ${failed.length}`) : ""}  / ${results.length} total\n`
);

if (failed.length) process.exit(1);

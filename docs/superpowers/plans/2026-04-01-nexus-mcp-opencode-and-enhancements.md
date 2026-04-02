# nexus-mcp OpenCode Conversion & Enhancements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all Claude Code references to OpenCode and add 5 new tools based on unexposed nexus CLI commands (diff, streak, stale, tag, deps).

**Architecture:** Single-file `index.js` MCP server that shells out to nexus CLI. New tools follow the same pattern as existing tools. Test file grows to cover new tools. Documentation updated in lockstep.

**Tech Stack:** Node.js, `@modelcontextprotocol/sdk`, Zod, child_process.execFile

---

## File Map

| File | Purpose |
|------|---------|
| `index.js` | MCP server (212 lines) — add 5 new tools |
| `README.md` | 51 lines — update Claude Code → OpenCode references |
| `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md` | 44 lines — update Claude Code reference |
| `test.js` | 360 lines — add 5 new tool test cases |

---

## Task 1: Convert Claude Code → OpenCode References

**Files:**
- Modify: `README.md:3`
- Modify: `README.md:33`
- Modify: `index.js:189`
- Modify: `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md:5`

- [ ] **Step 1: Update README.md line 3**

Change:
```markdown
MCP server that wraps the [nexus](https://github.com/digitalghost/nexus) CLI, giving Claude Code cross-session memory and project context tracking.
```
To:
```markdown
MCP server that wraps the [nexus](https://github.com/digitalghost/nexus) CLI, giving OpenCode cross-session memory and project context tracking.
```

- [ ] **Step 2: Update README.md line 33**

Change:
```
Configure in Claude Code MCP settings:
```
To:
```
Configure in OpenCode MCP settings:
```

- [ ] **Step 3: Update index.js line 189**

Change:
```javascript
  "List Claude Code session history with filtering options",
```
To:
```javascript
  "List OpenCode session history with filtering options",
```

- [ ] **Step 4: Update docs/superpowers/specs/2026-03-27-nexus-mcp-design.md line 5**

Change:
```markdown
Wrap the `nexus` CLI binary as an MCP server so Claude Code gets native tool access to cross-session memory without Bash permissions for every subcommand.
```
To:
```markdown
Wrap the `nexus` CLI binary as an MCP server so OpenCode gets native tool access to cross-session memory without Bash permissions for every subcommand.
```

- [ ] **Step 5: Commit**

```bash
cd /home/digitalghost/projects/nexus-mcp
git add README.md index.js docs/superpowers/specs/2026-03-27-nexus-mcp-design.md
git commit -m "docs: convert Claude Code references to OpenCode"
```

---

## Task 2: Add `diff` Tool — Session Change Summary

Exposes `nexus diff` to summarize changes across sessions in a time window.

**Files:**
- Modify: `index.js:206` (before `setResourceRequestHandlers`)
- Modify: `test.js` (add diff test cases)
- Modify: `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md` (add to tools table)

- [ ] **Step 1: Add test case for `diff` tool in test.js**

Add to the `expected` array in `tools/list` test (line ~149):
```javascript
"diff",
```

Add after the `where` test section (~line 265):
```javascript
// ── diff ─────────────────────────────────────────────────────────────────────
console.log(Y("\ndiff"));
try {
  const res = await client.tool("diff", { since: "7d" });
  const text = getText(res);
  assert(
    !isError(res),
    "diff(since=7d): does not error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "diff(since=7d): does not error", e.message);
}
```

- [ ] **Step 2: Add `diff` tool to index.js**

Add after the `sessions` tool definition (after line 204, before line 206):

```javascript
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
    if (project) args.push("--project", project);
    if (since) args.push("--since", since);
    return nexusTool(args);
  }
);
```

- [ ] **Step 3: Update tools/list expected array in test.js**

In test.js around line 149, update:
```javascript
const expected = [
  "context",
  "diff",
  "note",
  "projects",
  "report",
  "resume",
  "search",
  "sessions",
  "show",
  "where",
];
```

- [ ] **Step 4: Update design spec docs/superpowers/specs/2026-03-27-nexus-mcp-design.md**

Add to the Tools table after the `sessions` row:
```markdown
| `diff` | `nexus diff` | `project?: string, since?: string` | Summarize changes across sessions |
```

- [ ] **Step 5: Run tests to verify**

```bash
cd /home/digitalghost/projects/nexus-mcp && npm test
```
Expected: All tests pass including new diff test

- [ ] **Step 6: Commit**

```bash
git add index.js test.js docs/superpowers/specs/2026-03-27-nexus-mcp-design.md
git commit -m "feat: add diff tool for session change summaries"
```

---

## Task 3: Add `streak` Tool — Coding Streak Tracker

Exposes `nexus streak` to show your coding streak.

**Files:**
- Modify: `index.js`
- Modify: `test.js`
- Modify: `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md`

- [ ] **Step 1: Add test case for `streak` tool in test.js**

Add `"streak"` to the `expected` array in tools/list.

Add after the `diff` test section:
```javascript
// ── streak ───────────────────────────────────────────────────────────────────
console.log(Y("\nstreak"));
try {
  const res = await client.tool("streak");
  const text = getText(res);
  assert(
    !isError(res),
    "streak: does not error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "streak: does not error", e.message);
}
```

- [ ] **Step 2: Add `streak` tool to index.js**

Add after the `diff` tool definition:

```javascript
// 11. streak — coding streak
server.tool(
  "streak",
  "Show your coding streak (consecutive days of activity)",
  {},
  async () => nexusTool(["streak"])
);
```

- [ ] **Step 3: Update design spec**

Add to the Tools table after `diff`:
```markdown
| `streak` | `nexus streak` | (none) | Show coding streak |
```

- [ ] **Step 4: Run tests**

```bash
cd /home/digitalghost/projects/nexus-mcp && npm test
```

- [ ] **Step 5: Commit**

```bash
git add index.js test.js docs/superpowers/specs/2026-03-27-nexus-mcp-design.md
git commit -m "feat: add streak tool for coding streak tracking"
```

---

## Task 4: Add `stale` Tool — Stale Branches & Idle Projects

Exposes `nexus stale` to show stale branches and idle projects.

**Files:**
- Modify: `index.js`
- Modify: `test.js`
- Modify: `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md`

- [ ] **Step 1: Add test case for `stale` tool in test.js**

Add `"stale"` to the `expected` array.

Add after the `streak` test section:
```javascript
// ── stale ────────────────────────────────────────────────────────────────────
console.log(Y("\nstale"));
try {
  const res = await client.tool("stale");
  const text = getText(res);
  assert(
    !isError(res),
    "stale: does not error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "stale: does not error", e.message);
}
```

- [ ] **Step 2: Add `stale` tool to index.js**

Add after the `streak` tool:

```javascript
// 12. stale — stale branches and idle projects
server.tool(
  "stale",
  "Show stale branches and idle projects",
  {
    project: z.string().optional().describe("Filter to a specific project"),
  },
  async ({ project }) => {
    const args = ["stale"];
    if (project) args.push("--project", project);
    return nexusTool(args);
  }
);
```

- [ ] **Step 3: Update design spec**

Add to the Tools table:
```markdown
| `stale` | `nexus stale` | `project?: string` | Show stale branches and idle projects |
```

- [ ] **Step 4: Run tests**

```bash
cd /home/digitalghost/projects/nexus-mcp && npm test
```

- [ ] **Step 5: Commit**

```bash
git add index.js test.js docs/superpowers/specs/2026-03-27-nexus-mcp-design.md
git commit -m "feat: add stale tool for tracking idle projects and branches"
```

---

## Task 5: Add `tag` Tool — Session Tagging

Exposes `nexus tag` to tag sessions with labels.

**Files:**
- Modify: `index.js`
- Modify: `test.js`
- Modify: `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md`

- [ ] **Step 1: Add test case for `tag` tool in test.js**

Add `"tag"` to the `expected` array.

Add after the `stale` test section:
```javascript
// ── tag ──────────────────────────────────────────────────────────────────────
console.log(Y("\ntag"));
try {
  const res = await client.tool("tag", { name: "test-tag", session: "latest" });
  const text = getText(res);
  assert(
    !isError(res),
    "tag: does not error for valid inputs",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "tag: does not error for valid inputs", e.message);
}
```

- [ ] **Step 2: Add `tag` tool to index.js**

Add after the `stale` tool:

```javascript
// 13. tag — tag sessions with labels
server.tool(
  "tag",
  "Tag sessions with labels for organization and filtering",
  {
    name: z.string().describe("Tag name to apply"),
    session: z.string().optional().describe("Session ID or 'latest' (defaults to latest)"),
  },
  async ({ name, session }) => {
    const args = ["tag", name];
    if (session) args.push("--session", session);
    return nexusTool(args);
  }
);
```

- [ ] **Step 3: Update design spec**

Add to the Tools table:
```markdown
| `tag` | `nexus tag <name>` | `name: string, session?: string` | Tag sessions with labels |
```

- [ ] **Step 4: Run tests**

```bash
cd /home/digitalghost/projects/nexus-mcp && npm test
```

- [ ] **Step 5: Commit**

```bash
git add index.js test.js docs/superpowers/specs/2026-03-27-nexus-mcp-design.md
git commit -m "feat: add tag tool for session labeling"
```

---

## Task 6: Add `deps` Tool — Dependency Checker

Exposes `nexus deps` to check for outdated dependencies.

**Files:**
- Modify: `index.js`
- Modify: `test.js`
- Modify: `docs/superpowers/specs/2026-03-27-nexus-mcp-design.md`

- [ ] **Step 1: Add test case for `deps` tool in test.js**

Add `"deps"` to the `expected` array.

Add after the `tag` test section:
```javascript
// ── deps ─────────────────────────────────────────────────────────────────────
console.log(Y("\ndeps"));
try {
  const res = await client.tool("deps");
  const text = getText(res);
  assert(
    !isError(res),
    "deps: does not error",
    text.slice(0, 100)
  );
} catch (e) {
  assert(false, "deps: does not error", e.message);
}
```

- [ ] **Step 2: Add `deps` tool to index.js**

Add after the `tag` tool:

```javascript
// 14. deps — check outdated dependencies
server.tool(
  "deps",
  "Check for outdated dependencies across tracked projects",
  {
    project: z.string().optional().describe("Project to check (checks all if omitted)"),
  },
  async ({ project }) => {
    const args = ["deps"];
    if (project) args.push("--project", project);
    return nexusTool(args);
  }
);
```

- [ ] **Step 3: Update design spec**

Update the tools table header count from 9 to 14 tools. Add to the Tools table:
```markdown
| `deps` | `nexus deps` | `project?: string` | Check for outdated dependencies |
```

- [ ] **Step 4: Run tests**

```bash
cd /home/digitalghost/projects/nexus-mcp && npm test
```

- [ ] **Step 5: Commit**

```bash
git add index.js test.js docs/superpowers/specs/2026-03-27-nexus-mcp-design.md
git commit -m "feat: add deps tool for dependency checking"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /home/digitalghost/projects/nexus-mcp && npm test
```
Expected: All tests pass

- [ ] **Step 2: Verify tool count**

Confirm tools/list returns 14 tools: context, diff, note, projects, report, resume, search, sessions, show, streak, stale, tag, deps, where

- [ ] **Step 3: Verify all Claude Code references are converted**

```bash
grep -ri "claude code" --include="*.js" --include="*.md" .
```
Expected: No matches (except possibly in git history)

- [ ] **Step 4: Final commit with all changes**

```bash
git status
git log --oneline -5
```

---

## Summary

| Task | Changes | Lines Added |
|------|---------|-------------|
| 1 | Convert Claude Code → OpenCode (4 files) | ~4 |
| 2 | Add `diff` tool | ~20 |
| 3 | Add `streak` tool | ~10 |
| 4 | Add `stale` tool | ~15 |
| 5 | Add `tag` tool | ~15 |
| 6 | Add `deps` tool | ~15 |
| 7 | Verification | — |

**Total: 14 tools (was 9), ~79 lines added across 4 files**

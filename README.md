# nexus-mcp

MCP server that wraps the [nexus](https://github.com/digitalghost404/nexus) CLI, giving AI agents cross-session memory, semantic search, preference learning, and smart context injection.

## Tools

### Core Tools (Session & Project Management)

| Tool | Description |
|------|-------------|
| `context` | Export full project context (sessions, notes, health, git status) |
| `resume` | Show last session with recent commits and changes |
| `note` | Save a note to project context |
| `search` | Full-text search across sessions and notes |
| `where` | Find projects or files matching a query |
| `report` | Generate activity summary (week/month) |
| `projects` | List tracked projects with health status |
| `show` | Detailed project info with sessions and notes |
| `sessions` | List session history with filtering |

### Persistent Memory Tools (Semantic Search & Preferences)

| Tool | Description |
|------|-------------|
| `recall` | Semantic search across sessions, notes, and preferences using vector embeddings |
| `remember` | Save a preference, pattern, or decision with category and source |
| `preferences` | List, create, update, or delete preferences |
| `inject` | Build smart 3-pass context (project state + semantic recall + preferences) |

## Setup

```bash
npm install
```

Requires the `nexus` binary on PATH (or set `NEXUS_BIN` env variable).

## Usage

```bash
npm start
```

The server uses MCP stdio transport — it's designed to be launched by an MCP client, not run standalone.

## Configuration

### OpenCode

Add the nexus MCP server to your global OpenCode config (`~/opencode.json` or `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "nexus": {
      "type": "local",
      "command": ["node", "/path/to/nexus-mcp/index.js"],
      "environment": {
        "NEXUS_AGENT": "opencode"
      },
      "enabled": true
    }
  }
}
```

### Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["/path/to/nexus-mcp/index.js"],
      "env": {
        "NEXUS_AGENT": "claude"
      }
    }
  }
}
```

### Agent Isolation

The `NEXUS_AGENT` environment variable scopes all nexus operations to a specific agent namespace:

| Agent | Database Path |
|-------|--------------|
| `claude` (default) | `~/.nexus/claude/nexus.db` |
| `opencode` | `~/.nexus/opencode/nexus.db` |

This means Claude Code and OpenCode maintain **completely separate memory stores**. Preferences, sessions, and notes saved by one agent are not visible to the other.

### Agent Instructions

Create an instruction file (e.g. `~/.config/opencode/instructions/nexus.md`) and reference it in your config:

```json
{
  "instructions": ["~/.config/opencode/instructions/nexus.md"]
}
```

Recommended instruction content:

```markdown
# Nexus Memory — Cross-Session Context

On first session in a project directory, call the `nexus inject` MCP tool with
the project name to load past work, preferences, and patterns. Use the returned
context to understand what has been done before and how this project is
structured.

At session end, call `nexus remember` to save any new preferences, decisions,
or patterns observed during the session so they are available in future sessions.
```

## Tool Reference

### context

Export full project context for the current directory.

**Input:** None (uses current working directory)
**Output:** Markdown-formatted project context including recent sessions, notes, and git status.

### resume

Show what you were working on last time.

**Input:** None
**Output:** Last session summary, recent commits, and file changes.

### note

Save a free-form note to the current project.

**Input:**
```json
{
  "text": "Remember to update the API docs before release"
}
```

### search

Full-text search across session summaries and notes.

**Input:**
```json
{
  "query": "authentication system",
  "project": "myproject"
}
```

### where

Find which projects or files match a query.

**Input:**
```json
{
  "query": "database migration"
}
```

### report

Generate activity summary.

**Input:**
```json
{
  "period": "week"
}
```

**Periods:** `week` (default), `month`

### projects

List all tracked projects with health status.

**Input:**
```json
{
  "filter": "active"
}
```

**Filters:** `all` (default), `active`, `dirty`, `stale`

### show

Detailed project information.

**Input:**
```json
{
  "project": "myproject"
}
```

### sessions

List session history with optional filtering.

**Input:**
```json
{
  "project": "myproject",
  "limit": 10,
  "since": "7d"
}
```

### recall

Semantic search across sessions, notes, and preferences using vector embeddings. Falls back to FTS5 keyword search if Ollama is unavailable.

**Input:**
```json
{
  "query": "authentication system",
  "limit": 5,
  "types": ["session", "note", "preference"],
  "project": "myproject"
}
```

**Types:** `session`, `note`, `preference` (default: all)

**Output:** Ranked results with similarity scores:
```json
[
  {
    "source_type": "session",
    "source_id": 1,
    "content": "Implemented JWT auth system with rate limiting",
    "score": 0.92
  }
]
```

### remember

Save a preference, pattern, or decision.

**Input:**
```json
{
  "content": "Always run tests before committing",
  "category": "workflow",
  "source": "stated",
  "project": "myproject"
}
```

**Categories:** `workflow`, `style`, `tool`, `preference`, `pattern`
**Sources:** `stated` (default), `observed`, `inferred`

Confidence is auto-assigned based on source: stated=1.0, observed=0.7, inferred=0.4.

### preferences

List, create, update, or delete preferences.

**List (no action or action=list):**
```json
{
  "action": "list",
  "project": "myproject",
  "category": "workflow"
}
```

**Create (action=create):**
```json
{
  "action": "create",
  "content": "Prefer Go for backend services",
  "category": "tool",
  "source": "stated",
  "project": "myproject"
}
```

**Update (action=update):**
```json
{
  "action": "update",
  "id": 42,
  "content": "Updated preference content",
  "confidence": 0.9
}
```

**Delete (action=delete):**
```json
{
  "action": "delete",
  "id": 42
}
```

### inject

Build smart context for session start or mid-session project switch. Assembles context in three passes:

1. **Project State** — Current branch, status, last commit, recent sessions
2. **Semantic Recall** — Vector-similar past work based on the task description
3. **Preferences** — Active preferences (confidence > 0.3, not superseded)

**Input:**
```json
{
  "project": "myproject",
  "task_description": "adding rate limiting to auth endpoints"
}
```

**Output:** Markdown-formatted context ready to paste into an AI conversation.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_AGENT` | `claude` | Agent namespace for database isolation |
| `NEXUS_BIN` | `nexus` (PATH) | Path to the nexus binary |
| `NEXUS_TIMEOUT` | `30` | Timeout in seconds for nexus CLI calls |

## Architecture

nexus-mcp is a thin wrapper around the nexus CLI:

1. MCP client calls a tool (e.g. `recall`)
2. nexus-mcp translates the tool call into a `nexus` CLI command
3. The `NEXUS_AGENT` env var is forwarded as `--agent` to all CLI calls
4. nexus-mcp parses the CLI output and returns it to the MCP client

All commands run with a configurable timeout (default 30s) to prevent hangs.

### Probe-Before-Write

When `nexus serve` is running, CLI commands (`capture`, `note`) communicate via HTTP API. When the server is not running, they fall back to direct database writes. This means MCP tools work whether or not `nexus serve` is active.

## API Endpoints (nexus serve)

When running `nexus serve`, the following REST endpoints are available on `http://127.0.0.1:7600`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/capture` | POST | Capture session from project directory |
| `/api/notes` | GET, POST | List/create notes |
| `/api/preferences` | GET, POST | List/create preferences |
| `/api/preferences/{id}` | PATCH, DELETE | Update/delete preference |
| `/api/recall` | POST | Semantic search (FTS5 fallback) |
| `/api/inject` | POST | Build smart 3-pass context |
| `/api/embed/status` | GET | Embedding queue status |

All endpoints support CORS. The MCP server uses these endpoints when available for faster communication.

## Tech Stack

- **Node.js** (>=18)
- **`@modelcontextprotocol/sdk`** — MCP protocol implementation
- **Zod** — Schema validation for tool inputs
- Shells out to `nexus` binary with configurable timeout

## Troubleshooting

### "nexus: command not found"

Ensure the nexus binary is on your PATH, or set `NEXUS_BIN`:

```json
{
  "environment": {
    "NEXUS_BIN": "/home/digitalghost/go/bin/nexus"
  }
}
```

### No Results from recall

- Ensure Ollama is running: `curl http://localhost:11434/api/tags`
- Ensure the `nomic-embed-text` model is pulled: `ollama pull nomic-embed-text`
- If Ollama is unavailable, recall falls back to FTS5 keyword search (lower quality but still functional)

### Preferences Not Showing in inject

- Check that preferences exist: use the `preferences` tool with `action=list`
- Preferences with confidence < 0.3 are excluded (they may have decayed)
- Ensure you're using the correct `NEXUS_AGENT` — each agent has a separate database

### Agent Isolation Confusion

Data saved with `NEXUS_AGENT=claude` is NOT visible to `NEXUS_AGENT=opencode` and vice versa. This is intentional. Check which agent namespace you're using.

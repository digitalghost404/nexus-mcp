# Nexus MCP Server — Design Spec

## Purpose

Wrap the `nexus` CLI binary as an MCP server so OpenCode gets native tool access to cross-session memory without Bash permissions for every subcommand.

## Architecture

- Single-file `index.js` (< 400 lines expected)
- Node.js + `@modelcontextprotocol/sdk` + Zod
- Executes `nexus` binary via `child_process.execFile`
- Stdio transport (standard MCP pattern)

## Tools (11)

| Tool | CLI Command | Parameters | Purpose |
|------|------------|------------|---------|
| `context` | `nexus context <project>` | `project: string` | Full project context export for session loading |
| `resume` | `nexus resume [project]` | `project?: string` | Pick up where you left off |
| `note` | `nexus note <message>` | `message: string` | Save a note to current/global context |
| `search` | `nexus search <query>` | `query: string, project?: string, files?: string` | Full-text search sessions and notes |
| `where` | `nexus where <query>` | `query: string` | Find which projects/files match a query |
| `report` | `nexus report` | `period?: "week" \| "month"` | Activity summary |
| `projects` | `nexus projects` | `filter?: "active" \| "dirty" \| "stale"` | List tracked projects |
| `show` | `nexus show <project>` | `project: string` | Detailed project info |
| `sessions` | `nexus sessions` | `project?: string, since?: string, today?: boolean, tag?: string` | Session history |
| `diff` | `nexus diff` | `project?: string, since?: string` | Summarize changes across sessions |
| `streak` | `nexus streak` | none | Show consecutive days with sessions, plus weekly activity bars |

## Configuration

- `NEXUS_BIN` env var for binary path, defaults to `nexus` (relies on PATH)
- No config file needed — nexus manages its own config

## Error Handling

- 30s timeout per command
- Binary not found → clear error message with install instructions
- Non-zero exit → return stderr as error content
- Empty output → return "No results" rather than empty string

## Testing

- `test.js` following ollama-mcp pattern (spawn server, JSON-RPC over stdio)
- Test each tool with known good inputs
- Test error cases (missing binary, bad project name)

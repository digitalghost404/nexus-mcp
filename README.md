# nexus-mcp

MCP server that wraps the [nexus](https://github.com/digitalghost404/nexus) CLI, giving OpenCode cross-session memory and project context tracking.

## Tools

| Tool | Description |
|------|-------------|
| `context` | Export full project context (sessions, notes, health) |
| `resume` | Show last session with recent commits and changes |
| `note` | Save a note to project context |
| `search` | Full-text search across sessions and notes |
| `where` | Find projects or files matching a query |
| `report` | Generate activity summary (week/month) |
| `projects` | List tracked projects with health status |
| `show` | Detailed project info with sessions and notes |
| `sessions` | List session history with filtering |

## Setup

```bash
npm install
```

Requires the `nexus` binary on PATH (or set `NEXUS_BIN` env variable).

## Usage

```bash
npm start
```

Configure in OpenCode MCP settings:

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["/path/to/nexus-mcp/index.js"]
    }
  }
}
```

## Tech Stack

- Node.js (>=18)
- `@modelcontextprotocol/sdk`
- Zod for schema validation
- Shells out to `nexus` binary with 30s timeout

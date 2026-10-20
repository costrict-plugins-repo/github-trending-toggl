# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin that provides Toggl Track time tracking via MCP tools and a natural-language skill. It is published at `github.com/vpodorozh/toggl-claude-plugin` and installed via the Claude plugin system.

## Commands

```bash
npm install          # install dependencies (only @modelcontextprotocol/sdk)
node --check index.js  # syntax check
node index.js        # start the MCP server manually (requires token)
```

No build step, no test runner, no linter configured.

## Architecture

### Single-file MCP server (`index.js`)

Plain ES module. All tool definitions, handlers, and server wiring are in one file.

**Auth:** reads `TOGGL_API_TOKEN` env var first, falls back to `~/.claude/toggl/credentials` file.

**Two API bases:**
- `https://api.track.toggl.com/api/v9` — CRUD operations (time entries, projects, tasks)
- `https://api.track.toggl.com/reports/api/v3` — aggregated summaries (`toggl_get_summary`)

Both use HTTP Basic Auth: `base64(token + ":api_token")`.

**Workspace ID** is cached in memory after the first `/me` call to avoid repeated round-trips.

### Tools (7 total)

| Tool | API endpoint |
|------|-------------|
| `toggl_get_me` | GET `/me` |
| `toggl_list_projects` | GET `/workspaces/{wid}/projects` |
| `toggl_list_tasks` | GET `/workspaces/{wid}/projects/{pid}/tasks` |
| `toggl_list_time_entries` | GET `/me/time_entries` + client-side filter |
| `toggl_get_summary` | POST `/reports/api/v3/workspace/{wid}/summary/time_entries` |
| `toggl_create_time_entry` | POST `/workspaces/{wid}/time_entries` |
| `toggl_get_current_timer` | GET `/me/time_entries/current` |

**Important workspace constraint:** this Toggl workspace requires both `project_id` and `task_id` on every time entry. Always resolve project → task before calling `toggl_create_time_entry`.

### Plugin files

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Plugin name/author metadata |
| `.claude-plugin/marketplace.json` | Marketplace registration (version must match when releasing) |
| `.mcp.json` | Tells Claude Code how to start the server (`${CLAUDE_PLUGIN_ROOT}/index.js`) |
| `skills/toggl/SKILL.md` | Natural-language instructions for Claude — how to interpret time tracking requests |

### Release checklist

When adding or changing tools:
1. Update `index.js` (tool definition + handler + switch case)
2. Update `skills/toggl/SKILL.md` (add tool to table, add usage instructions)
3. Bump version in `.claude-plugin/marketplace.json`
4. Push to GitHub
5. Copy updated files to plugin cache: `~/.claude/plugins/cache/toggl/toggl/<version>/`
6. Restart Claude Code (or run `claude plugin update toggl@toggl`)

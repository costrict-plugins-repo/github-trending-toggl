# Toggl Claude Plugin

A [Claude Code](https://claude.ai/code) plugin that connects to [Toggl Track](https://toggl.com) so you can log and review time entries using natural language.

## What you can do

- **Log time** — "Log 2h on the AVA project / Login Bug task yesterday"
- **Query entries** — "What did I track this week?" / "Show Cover AIT entries for May"
- **Get summaries** — "How much time did I spend on Cover AIT this month?"
- **Check running timer** — "Is anything currently running?"

## Installation

**1. Add the marketplace and install the plugin:**

```bash
claude plugin marketplace add https://github.com/run-as-root/toggl-claude-plugin
claude plugin install toggl
```

**2. Add your Toggl API token** (found at [toggl.com/profile](https://track.toggl.com/profile)):

```bash
mkdir -p ~/.claude/toggl
echo "YOUR_API_TOKEN" > ~/.claude/toggl/credentials
```

**3. Restart Claude Code.**

## Usage

Just talk to Claude naturally — the skill activates automatically:

```
"Log 90 min on Cover Main / development today"
"What did I track last week?"
"How much time on the run_as_root project in May?"
"Log 8h public holiday on Friday"
```

Claude resolves project and task names automatically before logging.

> **Note:** If your Toggl workspace requires both a project and task on every entry (workspace-level setting), Claude will always ask for both when logging.

## Tools

| Tool | Purpose |
|------|---------|
| `toggl_get_me` | Get user info and workspace ID |
| `toggl_list_projects` | List all active projects |
| `toggl_list_tasks` | List tasks inside a project |
| `toggl_list_time_entries` | Query entries by date range / project / task |
| `toggl_get_summary` | Aggregated time totals by project and task |
| `toggl_create_time_entry` | Log a completed time entry |
| `toggl_get_current_timer` | Check what's currently running |

## Updating

```bash
claude plugin update toggl@toggl
```

## Requirements

- Claude Code
- Node.js 18+
- Toggl Track account

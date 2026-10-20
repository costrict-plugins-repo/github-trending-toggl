# Privacy Policy

**Toggl Claude Plugin**
Maintained by run-as-root GmbH · Last updated: May 2026

## Summary

This plugin does not collect, store, or transmit any personal data to run-as-root or any third party. All communication happens directly between your machine and Toggl's API.

## What the plugin does

The plugin is an MCP server that runs locally on your machine. It:

- Reads your Toggl API token from `~/.claude/toggl/credentials` on your local filesystem
- Makes API requests to `api.track.toggl.com` and `api.track.toggl.com/reports` on your behalf
- Returns the responses to Claude Code running on your machine

## Data we do not collect

- We do not receive your Toggl API token
- We do not receive your time entries, projects, or any Toggl data
- We do not run any telemetry or analytics
- We do not operate any servers that process your data

## Third-party services

Your data is sent exclusively to **Toggl Track** (toggl.com) via their official API. Toggl's own privacy policy applies to that data: [toggl.com/legal/privacy](https://toggl.com/legal/privacy/).

## Your API token

Your Toggl API token is stored in a local file (`~/.claude/toggl/credentials`) that you create. It is never transmitted to anyone other than Toggl's API servers for authentication.

## Contact

For questions about this plugin: [vlad.podorozhnyi@run-as-root.sh](mailto:vlad.podorozhnyi@run-as-root.sh)

run-as-root GmbH · [run-as-root.sh](https://run-as-root.sh)

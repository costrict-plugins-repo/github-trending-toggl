#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TOGGL_API_BASE = 'https://api.track.toggl.com/api/v9';
const REPORTS_API_BASE = 'https://api.track.toggl.com/reports/api/v3';
const CREDENTIALS_FILE = join(homedir(), '.claude', 'toggl', 'credentials');

function loadToken() {
  if (process.env.TOGGL_API_TOKEN?.trim()) return process.env.TOGGL_API_TOKEN.trim();
  if (existsSync(CREDENTIALS_FILE)) {
    const t = readFileSync(CREDENTIALS_FILE, 'utf8').trim();
    if (t) return t;
  }
  process.stderr.write(
    `toggl-mcp: API token required.\n` +
    `  Option 1: set TOGGL_API_TOKEN environment variable\n` +
    `  Option 2: create ${CREDENTIALS_FILE} with your API token\n` +
    `  Get your token at: https://track.toggl.com/profile\n`
  );
  process.exit(1);
}

const API_TOKEN = loadToken();
const AUTH_HEADER = 'Basic ' + Buffer.from(`${API_TOKEN}:api_token`).toString('base64');
const VERSION = '1.2.0';
const COMMON_HEADERS = { 'Authorization': AUTH_HEADER, 'Content-Type': 'application/json' };

let _workspaceId = null;

async function togglFetch(baseUrl, path, method = 'GET', body = null) {
  const options = { method, headers: COMMON_HEADERS };
  if (body !== null) options.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Toggl API ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const api = (path, method, body) => togglFetch(TOGGL_API_BASE, path, method, body);
const reports = (path, method, body) => togglFetch(REPORTS_API_BASE, path, method, body);

async function getWorkspaceId() {
  if (_workspaceId) return _workspaceId;
  const me = await api('/me');
  _workspaceId = me.default_workspace_id;
  return _workspaceId;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const toISO = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T09:00:00Z` : s);

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function mapEntry(e) {
  const running = e.duration < 0;
  const seconds = running ? Math.round((Date.now() - new Date(e.start).getTime()) / 1000) : e.duration;
  return {
    id: e.id,
    description: e.description || '(no description)',
    project_id: e.project_id ?? null,
    task_id: e.task_id ?? null,
    running,
    duration_seconds: seconds,
    duration_minutes: Math.round(seconds / 60),
    duration: formatDuration(seconds),
    start: e.start,
    stop: e.stop ?? null,
    tags: e.tags || [],
    billable: !!e.billable,
  };
}


// ─── Tool handlers ───────────────────────────────────────────────────────────

async function handleGetMe() {
  const me = await api('/me');
  return {
    id: me.id,
    email: me.email,
    full_name: me.fullname,
    timezone: me.timezone,
    default_workspace_id: me.default_workspace_id,
  };
}

async function handleListProjects({ active_only = true } = {}) {
  const wid = await getWorkspaceId();
  const projects = await api(`/workspaces/${wid}/projects?active=${active_only}&per_page=200`);
  return (projects || []).map(p => ({
    id: p.id, name: p.name, active: p.active, color: p.color, billable: p.billable,
    client_id: p.client_id ?? null,
  }));
}

async function handleListTasks({ project_id }) {
  const wid = await getWorkspaceId();
  const tasks = await api(`/workspaces/${wid}/projects/${project_id}/tasks`);
  return (tasks || []).map(t => ({
    id: t.id, name: t.name, active: t.active, project_id: t.project_id,
    estimated_seconds: t.estimated_seconds ?? null,
  }));
}

async function handleListTags() {
  const wid = await getWorkspaceId();
  const tags = await api(`/workspaces/${wid}/tags`);
  return (tags || []).map(t => ({ id: t.id, name: t.name }));
}

async function handleListTimeEntries({ start_date, end_date, project_id, task_id } = {}) {
  const from = start_date || todayStr();
  const to = end_date || from;
  // Toggl treats end_date as exclusive: send the day after.
  const next = new Date(`${to}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const entries = await api(
    `/me/time_entries?start_date=${from}&end_date=${next.toISOString().slice(0, 10)}`
  );
  let results = (entries || []).map(mapEntry);
  if (project_id) results = results.filter(e => e.project_id === project_id);
  if (task_id)    results = results.filter(e => e.task_id === task_id);
  const total = results.reduce((s, e) => s + Math.max(e.duration_seconds, 0), 0);
  return { period: { from, to }, count: results.length, total: formatDuration(total), total_seconds: total, entries: results };
}

async function handleGetSummary({ start_date, end_date, project_id, task_id } = {}) {
  const wid = await getWorkspaceId();
  const from = start_date || todayStr();
  const to = end_date || from;
  const body = { start_date: from, end_date: to, grouping: 'projects', sub_grouping: 'tasks' };
  if (project_id) body.project_ids = [project_id];
  if (task_id)    body.task_ids = [task_id];

  const data = await reports(`/workspace/${wid}/summary/time_entries`, 'POST', body);
  const groups = (data?.groups || []).map(g => ({
    project_id: g.id,
    project_name: g.title?.name ?? g.title ?? null,
    total_seconds: g.seconds ?? g.tracked_seconds ?? 0,
    total_hours: formatDuration(g.seconds ?? g.tracked_seconds ?? 0),
    tasks: (g.sub_groups || []).map(s => ({
      task_id: s.id,
      task_name: s.title?.name ?? s.title ?? '(no task)',
      total_seconds: s.seconds ?? s.tracked_seconds ?? 0,
      total_hours: formatDuration(s.seconds ?? s.tracked_seconds ?? 0),
    })),
  }));
  const grandTotal = groups.reduce((sum, g) => sum + g.total_seconds, 0);
  return {
    period: { from, to },
    grand_total: formatDuration(grandTotal),
    grand_total_seconds: grandTotal,
    projects: groups,
  };
}

async function handleCreateTimeEntry({
  description, duration_minutes, start, project_id, task_id, tags = [], billable = false,
}) {
  const wid = await getWorkspaceId();
  const payload = {
    description,
    duration: Math.round(duration_minutes * 60),
    start: toISO(start),
    workspace_id: wid,
    created_with: 'claude-mcp-toggl',
    billable,
  };
  if (project_id) payload.project_id = project_id;
  if (task_id)    payload.task_id = task_id;
  if (tags.length) payload.tags = tags;
  return mapEntry(await api(`/workspaces/${wid}/time_entries`, 'POST', payload));
}

async function handleStartTimer({ description = '', project_id, task_id, tags = [], billable = false }) {
  const wid = await getWorkspaceId();
  const payload = {
    description,
    start: new Date().toISOString(),
    duration: -1,
    workspace_id: wid,
    created_with: 'claude-mcp-toggl',
    billable,
  };
  if (project_id) payload.project_id = project_id;
  if (task_id)    payload.task_id = task_id;
  if (tags.length) payload.tags = tags;
  return mapEntry(await api(`/workspaces/${wid}/time_entries`, 'POST', payload));
}

async function handleStopTimer() {
  const current = await api('/me/time_entries/current');
  if (!current) return { stopped: false, entry: null };
  const wid = current.workspace_id ?? await getWorkspaceId();
  const entry = await api(`/workspaces/${wid}/time_entries/${current.id}/stop`, 'PATCH');
  return { stopped: true, entry: mapEntry(entry) };
}

async function handleUpdateTimeEntry({ id, description, duration_minutes, start, project_id, task_id, tags, billable }) {
  const wid = await getWorkspaceId();
  const payload = {};
  if (description !== undefined) payload.description = description;
  if (start !== undefined) payload.start = toISO(start);
  if (duration_minutes !== undefined) payload.duration = Math.round(duration_minutes * 60);
  if (project_id !== undefined) payload.project_id = project_id;
  if (task_id !== undefined) payload.task_id = task_id;
  if (tags !== undefined) payload.tags = tags;
  if (billable !== undefined) payload.billable = billable;
  if (!Object.keys(payload).length) throw new Error('No fields to update were provided.');
  return mapEntry(await api(`/workspaces/${wid}/time_entries/${id}`, 'PUT', payload));
}

async function handleDeleteTimeEntry({ id }) {
  const wid = await getWorkspaceId();
  await api(`/workspaces/${wid}/time_entries/${id}`, 'DELETE');
  return { deleted: true, id };
}

async function handleGetCurrentTimer() {
  const entry = await api('/me/time_entries/current');
  if (!entry) return { running: false, entry: null };
  const e = mapEntry(entry);
  return { running: true, entry: { ...e, elapsed_minutes: e.duration_minutes } };
}

// ─── MCP server wiring ───────────────────────────────────────────────────────

const server = new McpServer({ name: 'toggl', title: 'Toggl Track', version: VERSION });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const READ  = { readOnlyHint: true,  destructiveHint: false, idempotentHint: true,  openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const EDIT  = { readOnlyHint: false, destructiveHint: false, idempotentHint: true,  openWorldHint: true };
const DESTROY = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

function register(name, title, description, inputSchema, annotations, handler) {
  server.registerTool(name, { title, description, inputSchema, annotations }, async (args) => {
    try {
      const result = await handler(args ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });
}

const entryFields = {
  description: z.string().describe('What you worked on'),
  project_id: z.number().optional().describe('Project ID from toggl_list_projects'),
  task_id: z.number().optional().describe('Task ID from toggl_list_tasks'),
  tags: z.array(z.string()).optional().describe('Tag names to apply'),
  billable: z.boolean().optional().describe('Mark as billable (default: false)'),
};

register('toggl_get_me', 'Get Toggl user',
  'Get the current Toggl user info: email, full name, timezone, and default workspace ID.',
  {}, READ, handleGetMe);

register('toggl_list_projects', 'List projects',
  'List projects in the Toggl workspace. Returns id, name, color, billable and active status. ' +
  'Use this to resolve a project name to its numeric ID before logging time.',
  { active_only: z.boolean().optional().describe('Return only active projects (default: true)') },
  READ, handleListProjects);

register('toggl_list_tasks', 'List project tasks',
  'List tasks inside a specific Toggl project. Use this to resolve a task name to its numeric ID.',
  { project_id: z.number().describe('Project ID (from toggl_list_projects)') },
  READ, handleListTasks);

register('toggl_list_tags', 'List tags',
  'List tags defined in the Toggl workspace.', {}, READ, handleListTags);

register('toggl_list_time_entries', 'List time entries',
  'List time entries for an inclusive date range (with total), optionally filtered by project or task. ' +
  'Use for "what did I track today / this week / on 2025-01-10". Includes entry ids for update/delete.',
  {
    start_date: date.optional().describe('Start date YYYY-MM-DD (default: today)'),
    end_date: date.optional().describe('End date YYYY-MM-DD, inclusive (default: start_date)'),
    project_id: z.number().optional().describe('Filter by project ID'),
    task_id: z.number().optional().describe('Filter by task ID'),
  }, READ, handleListTimeEntries);

register('toggl_get_summary', 'Get time summary',
  'Aggregated time totals grouped by project and task for a date range. ' +
  'Use for "how much time did I spend on project X this week?".',
  {
    start_date: date.optional().describe('Start date YYYY-MM-DD (default: today)'),
    end_date: date.optional().describe('End date YYYY-MM-DD (default: start_date)'),
    project_id: z.number().optional().describe('Limit summary to one project'),
    task_id: z.number().optional().describe('Limit summary to one task'),
  }, READ, handleGetSummary);

register('toggl_create_time_entry', 'Log time entry',
  'Manually log a completed time entry, optionally linked to a project and/or task. ' +
  'Resolve names to ids via toggl_list_projects / toggl_list_tasks first.',
  {
    ...entryFields,
    duration_minutes: z.number().positive().describe('Duration in minutes (e.g. 90 for 1.5h)'),
    start: z.string().describe('Start: YYYY-MM-DD (assumes 09:00 UTC) or full ISO 8601 datetime'),
  }, WRITE, handleCreateTimeEntry);

register('toggl_start_timer', 'Start timer',
  'Start a running timer now (stops nothing else automatically; Toggl stops the previous one).',
  { ...entryFields, description: entryFields.description.optional() }, WRITE, handleStartTimer);

register('toggl_stop_timer', 'Stop timer',
  'Stop the currently running timer, if any. Returns the finished entry.',
  {}, EDIT, handleStopTimer);

register('toggl_update_time_entry', 'Update time entry',
  'Edit an existing time entry by id (get ids from toggl_list_time_entries). Only provided fields change.',
  {
    id: z.number().describe('Time entry ID'),
    description: z.string().optional(),
    duration_minutes: z.number().positive().optional(),
    start: z.string().optional().describe('YYYY-MM-DD (09:00 UTC) or ISO 8601 datetime'),
    project_id: z.number().optional(),
    task_id: z.number().optional(),
    tags: z.array(z.string()).optional(),
    billable: z.boolean().optional(),
  }, EDIT, handleUpdateTimeEntry);

register('toggl_delete_time_entry', 'Delete time entry',
  'Permanently delete a time entry by id. Confirm with the user before calling.',
  { id: z.number().describe('Time entry ID') }, DESTROY, handleDeleteTimeEntry);

register('toggl_get_current_timer', 'Get running timer',
  'Check if a Toggl timer is running. Returns entry with elapsed time, or {running: false}.',
  {}, READ, handleGetCurrentTimer);

process.on('unhandledRejection', err => process.stderr.write(`toggl-mcp: unhandled rejection: ${err}\n`));
process.on('uncaughtException',  err => process.stderr.write(`toggl-mcp: uncaught exception: ${err}\n`));

await server.connect(new StdioServerTransport());

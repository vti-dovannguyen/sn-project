#!/usr/bin/env node
/* Lấy dữ liệu từ Backlog REST API và ghi 4 file JSON cho dashboard:
   issues.json, flow.json, snapshot.json, members.json (+ meta.json).
   Chỉ dùng Node 18+ (fetch có sẵn), không cần cài thư viện.

   Biến môi trường:
     BACKLOG_SPACE        bắt buộc, ví dụ vti-corp
     BACKLOG_API_KEY      bắt buộc
     BACKLOG_PROJECT_KEY  mặc định SOURCENEXT_ECSITE
     BACKLOG_DOMAIN       mặc định backlog.com (dùng backlog.jp nếu space ở Nhật)
     BACKLOG_BASE_URL     ghi đè toàn bộ địa chỉ gốc (dùng khi kiểm thử)
     DATA_DIR             mặc định ./data
     TZ_NAME              mặc định Asia/Ho_Chi_Minh
*/
import './load-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ENV = process.env;
const SPACE = ENV.BACKLOG_SPACE;
const KEY = ENV.BACKLOG_API_KEY;
const PROJECT_KEY = ENV.BACKLOG_PROJECT_KEY || 'SOURCENEXT_ECSITE';
const DOMAIN = ENV.BACKLOG_DOMAIN || 'backlog.com';
const BASE = (ENV.BACKLOG_BASE_URL || `https://${SPACE}.${DOMAIN}`).replace(/\/$/, '');
const TZ = ENV.TZ_NAME || 'Asia/Ho_Chi_Minh';
const OUT = path.resolve(ENV.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'));
const PAGE = 100;
const OPEN_NAMES = ['Open', 'In Progress', 'Resolved'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), '[sync]', ...a);

async function api(p, params = {}, tries = 4) {
  const u = new URL(`${BASE}/api/v2${p}`);
  u.searchParams.set('apiKey', KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(`${k}[]`, x));
    else u.searchParams.set(k, v);
  }
  for (let i = 1; ; i++) {
    let res;
    try { res = await fetch(u); } catch (e) { if (i >= tries) throw e; await sleep(1500 * i); continue; }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && i < tries) { await sleep(2000 * i); continue; }
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Backlog ${res.status} ${p}: ${body.replace(KEY, '***')}`);
  }
}

// ---- ngày theo múi giờ Việt Nam ----
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));
function todayInTz() {
  return new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
function mondayOf(s) {
  const dow = new Date(s + 'T00:00:00Z').getUTCDay();
  return addDays(s, -((dow + 6) % 7));
}

function periods(today) {
  const out = [];
  for (let i = 13; i >= 0; i--) { const d = addDays(today, -i); out.push({grain: 'day', period: d, label: dmy(d), from: d, to: d}); }
  const mon = mondayOf(today);
  for (let i = 7; i >= 0; i--) {
    const s = addDays(mon, -7 * i);
    const e = addDays(s, 6);
    out.push({grain: 'week', period: s, label: dmy(s), from: s, to: e > today ? today : e});
  }
  const [y, m] = today.split('-').map(Number);
  for (let i = 7; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const s = ymd(d);
    const e = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    out.push({grain: 'month', period: s, label: 'T' + (d.getUTCMonth() + 1), from: s, to: e > today ? today : e});
  }
  return out;
}

const d10 = (s) => (s ? String(s).slice(0, 10) : '');
const firstName = (arr) => (Array.isArray(arr) && arr[0] && arr[0].name) || '';
function customValue(issue, name) {
  const f = (issue.customFields || []).find((c) => (c.name || '').trim() === name);
  if (!f) return '';
  const v = f.value;
  return Array.isArray(v) ? firstName(v) : (v && v.name) || '';
}
function toRow(i) {
  return {
    key: i.issueKey,
    summary: i.summary || '',
    type: i.issueType?.name || '',
    priority: i.priority?.name || '',
    status: i.status?.name || '',
    assignee: i.assignee?.name || '',
    created: d10(i.created),
    updated: d10(i.updated),
    due: d10(i.dueDate),
    defect: customValue(i, 'Defect Category'),
    process: customValue(i, 'Detected Process'),
    category: firstName(i.category),
    milestone: firstName(i.milestone),
    sub: i.parentIssueId ? 1 : 0,
    est: i.estimatedHours || 0,
    act: i.actualHours || 0,
    start: d10(i.startDate)
  };
}

async function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

export async function sync() {
  if (!KEY || (!SPACE && !ENV.BACKLOG_BASE_URL)) throw new Error('Thiếu BACKLOG_SPACE hoặc BACKLOG_API_KEY');
  const started = Date.now();
  const today = todayInTz();
  const project = await api(`/projects/${PROJECT_KEY}`);
  const pid = project.id;
  const statuses = await api(`/projects/${PROJECT_KEY}/statuses`);
  const byName = new Map(statuses.map((s) => [s.name, s.id]));
  const openIds = OPEN_NAMES.map((n) => byName.get(n)).filter(Boolean);
  if (openIds.length !== OPEN_NAMES.length) throw new Error('Không tìm thấy đủ trạng thái Open, In Progress, Resolved: ' + [...byName.keys()].join(', '));
  const closedId = byName.get('Closed');
  const doneIds = [byName.get('Resolved'), closedId].filter(Boolean);
  const types = await api(`/projects/${PROJECT_KEY}/issueTypes`);
  const bugTypeIds = types.filter((t) => t.name.startsWith('Bug')).map((t) => t.id);

  // 1) issue chưa đóng
  const rows = new Map();
  for (let off = 0; ; off += PAGE) {
    const page = await api('/issues', {projectId: [pid], statusId: openIds, count: PAGE, offset: off, sort: 'created', order: 'asc'});
    page.forEach((i) => rows.set(i.id, toRow(i)));
    if (page.length < PAGE) break;
    await sleep(150);
  }
  const issues = [...rows.values()];
  const expected = (await api('/issues/count', {projectId: [pid], statusId: openIds})).count;
  log(`issue: ${issues.length}, bộ đếm: ${expected}`);
  if (!issues.length || Math.abs(issues.length - expected) > Math.max(3, expected * 0.02)) {
    throw new Error(`Số issue (${issues.length}) lệch bộ đếm Backlog (${expected}), không ghi đè dữ liệu cũ`);
  }

  // 2) luồng tạo mới / đóng theo kỳ
  const flow = [];
  for (const p of periods(today)) {
    const created = (await api('/issues/count', {projectId: [pid], createdSince: p.from, createdUntil: p.to})).count;
    const closed = (await api('/issues/count', {projectId: [pid], statusId: doneIds, updatedSince: p.from, updatedUntil: p.to})).count;
    flow.push({grain: p.grain, period: p.period, label: p.label, created, closed});
    await sleep(80);
  }

  // 3) tổng quan
  const total = (await api('/issues/count', {projectId: [pid]})).count;
  const closedAll = closedId ? (await api('/issues/count', {projectId: [pid], statusId: [closedId]})).count : 0;
  const bugsTotal = bugTypeIds.length ? (await api('/issues/count', {projectId: [pid], issueTypeId: bugTypeIds})).count : 0;
  const bugsClosed = bugTypeIds.length && closedId ? (await api('/issues/count', {projectId: [pid], issueTypeId: bugTypeIds, statusId: [closedId]})).count : 0;
  const snapshot = [{
    as_of: today, project: PROJECT_KEY, space: SPACE || new URL(BASE).hostname.split('.')[0],
    total_issues: total, closed_issues: closedAll, bugs_total: bugsTotal, bugs_closed: bugsClosed,
    est_filled: issues.filter((r) => r.est > 0).length, issues_in_scope: issues.length
  }];

  // 4) member (không đưa email)
  const users = await api(`/projects/${PROJECT_KEY}/users`);
  const members = users.map((u) => ({name: u.name, role: u.roleType === 1 ? 'Admin' : 'Member'})).sort((a, b) => a.name.localeCompare(b.name));

  await fs.mkdir(OUT, {recursive: true});
  await writeAtomic(path.join(OUT, 'issues.json'), issues);
  await writeAtomic(path.join(OUT, 'flow.json'), flow);
  await writeAtomic(path.join(OUT, 'snapshot.json'), snapshot);
  await writeAtomic(path.join(OUT, 'members.json'), members);
  await writeAtomic(path.join(OUT, 'meta.json'), {updated_at: new Date().toISOString(), issues: issues.length, seconds: Math.round((Date.now() - started) / 1000)});
  log(`xong: ${issues.length} issue, ${members.length} member, ${Math.round((Date.now() - started) / 1000)} giây`);
  return {issues: issues.length};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  sync().catch((e) => { console.error(new Date().toISOString(), '[sync] LỖI:', e.message); process.exit(1); });
}

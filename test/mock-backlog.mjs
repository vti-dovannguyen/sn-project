/* Máy chủ Backlog giả để kiểm thử sync-backlog.mjs mà không cần API key thật. */
import http from 'node:http';
import fs from 'node:fs';
const seed = JSON.parse(fs.readFileSync(new URL('../seed-data/issues.json', import.meta.url)));
const ST = {Open: 1, 'In Progress': 2, Resolved: 3, Closed: 4};
const TYPES = [...new Set(seed.map((r) => r.type))].map((n, i) => ({id: 100 + i, name: n}));
const tid = Object.fromEntries(TYPES.map((t) => [t.name, t.id]));
const issues = seed.map((r, i) => ({
  id: 1000 + i, issueKey: r.key, summary: r.summary, issueType: {name: r.type}, priority: {name: r.priority}, status: {name: r.status},
  assignee: r.assignee ? {name: r.assignee, mailAddress: 'x@y'} : null, created: r.created + 'T03:00:00Z', updated: r.updated + 'T03:00:00Z',
  dueDate: r.due ? r.due + 'T00:00:00Z' : null, startDate: null, category: r.category ? [{name: r.category}] : [], milestone: r.milestone ? [{name: r.milestone}] : [],
  parentIssueId: r.sub ? 1 : null, estimatedHours: r.est || null, actualHours: r.act || null,
  customFields: [{name: 'Detected Process', value: r.process ? [{name: r.process}] : []}, {name: 'Defect Category', value: r.defect ? [{name: r.defect}] : []}]
}));
// thêm một ít issue Closed để bộ đếm có số liệu
for (let i = 0; i < 50; i++) issues.push({...issues[i], id: 9000 + i, issueKey: 'X-' + i, status: {name: 'Closed'}});
const multi = (u, k) => u.searchParams.getAll(k + '[]');
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (o) => { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(o)); };
  if (u.searchParams.get('apiKey') !== 'test') { res.writeHead(401); return res.end('{"errors":[{"message":"bad key"}]}'); }
  const p = u.pathname.replace('/api/v2', '');
  if (p === '/projects/PRJ') return send({id: 7, projectKey: 'PRJ'});
  if (p === '/projects/PRJ/statuses') return send(Object.entries(ST).map(([name, id]) => ({id, name})));
  if (p === '/projects/PRJ/issueTypes') return send(TYPES);
  if (p === '/projects/PRJ/users') return send([{name: 'B', roleType: 2, mailAddress: 'b@x'}, {name: 'A', roleType: 1, mailAddress: 'a@x'}]);
  const filt = () => {
    const sids = multi(u, 'statusId').map(Number), tids = multi(u, 'issueTypeId').map(Number);
    const cs = u.searchParams.get('createdSince'), cu = u.searchParams.get('createdUntil'), us = u.searchParams.get('updatedSince'), uu = u.searchParams.get('updatedUntil');
    return issues.filter((i) => (!sids.length || sids.includes(ST[i.status.name])) && (!tids.length || tids.includes(tid[i.issueType.name])) &&
      (!cs || i.created.slice(0, 10) >= cs) && (!cu || i.created.slice(0, 10) <= cu) && (!us || i.updated.slice(0, 10) >= us) && (!uu || i.updated.slice(0, 10) <= uu));
  };
  if (p === '/issues/count') return send({count: filt().length});
  if (p === '/issues') { const c = Number(u.searchParams.get('count')), o = Number(u.searchParams.get('offset')); return send(filt().slice(o, o + c)); }
  res.writeHead(404); res.end('{}');
});
srv.listen(Number(process.env.MOCK_PORT || 9911), () => console.log('mock backlog ready'));

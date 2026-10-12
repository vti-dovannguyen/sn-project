/* Máy chủ tĩnh + bộ lập lịch lấy dữ liệu Backlog. Không cần thư viện ngoài, Node 18+.
   Chạy: node server.mjs
   Biến môi trường: xem .env.example */
import './scripts/load-env.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sync} from './scripts/sync-backlog.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8080);
const TZ = process.env.TZ_NAME || 'Asia/Ho_Chi_Minh';
const TIMES = (process.env.SYNC_TIMES || '08:00,13:00,18:00').split(',').map((s) => s.trim()).filter(Boolean);
const USER = process.env.BASIC_AUTH_USER;
const PASS = process.env.BASIC_AUTH_PASS;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};
const log = (...a) => console.log(new Date().toISOString(), '[server]', ...a);

let running = false;
async function runSync(reason) {
  if (running) return log('đang có một lần lấy dữ liệu, bỏ qua', reason);
  running = true;
  log('bắt đầu lấy dữ liệu từ Backlog:', reason);
  try { await sync(); } catch (e) { log('LẤY DỮ LIỆU LỖI, giữ dữ liệu cũ:', e.message); } finally { running = false; }
}

// Lập lịch: mỗi 30 giây xem giờ hiện tại (theo TZ) có trùng mốc nào chưa chạy không.
let lastSlot = '';
function tick() {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  const hhmm = `${g('hour')}:${g('minute')}`;
  const slot = `${g('year')}-${g('month')}-${g('day')} ${hhmm}`;
  if (TIMES.includes(hhmm) && slot !== lastSlot) { lastSlot = slot; runSync('lịch ' + hhmm); }
}

async function seedIfEmpty() {
  await fs.mkdir(DATA, {recursive: true});
  try { await fs.access(path.join(DATA, 'issues.json')); return false; } catch { /* chưa có dữ liệu */ }
  const seed = path.join(ROOT, 'seed-data');
  for (const f of await fs.readdir(seed).catch(() => [])) await fs.copyFile(path.join(seed, f), path.join(DATA, f));
  log('đã chép dữ liệu mẫu (ảnh chụp ngày 09/10/2026) vào', DATA);
  return true;
}

function authorized(req) {
  if (!USER) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, ...p] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  return u === USER && p.join(':') === PASS;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!authorized(req)) { res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Dashboard"'}); return res.end('Cần đăng nhập'); }
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p === '/healthz') { res.writeHead(200, {'content-type': 'text/plain'}); return res.end('ok'); }
    if (p === '/') p = '/index.html';
    const isData = p.startsWith('/data/');
    const base = isData ? DATA : PUBLIC;
    const rel = isData ? p.slice('/data/'.length) : p.slice(1);
    const file = path.resolve(base, rel);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
    const st = await fs.stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404); return res.end('Không tìm thấy'); }
    res.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': isData || p === '/index.html' ? 'no-cache' : 'public, max-age=3600'});
    createReadStream(file).pipe(res);
  } catch (e) {
    log('lỗi', e.message);
    res.writeHead(500); res.end('Lỗi máy chủ');
  }
});

const seeded = await seedIfEmpty();
server.listen(PORT, () => log(`dashboard chạy ở cổng ${PORT}; lịch ${TIMES.join(', ')} (${TZ})${USER ? '; có đăng nhập' : '; KHÔNG có đăng nhập'}`));
if (process.env.BACKLOG_API_KEY) {
  setInterval(tick, 30000);
  if (seeded || process.env.SYNC_ON_START === '1') runSync('khởi động');
} else log('chưa có BACKLOG_API_KEY: chỉ phục vụ dữ liệu hiện có, không tự cập nhật');

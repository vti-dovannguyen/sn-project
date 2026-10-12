/* Đăng nhập Basic cho toàn bộ site (thay phần authorized() của server.mjs).
   Đặt BASIC_AUTH_USER / BASIC_AUTH_PASS trong Environment Variables của Vercel.
   /api/cron được bỏ qua vì tự kiểm tra CRON_SECRET. */
import {next} from '@vercel/functions';

export const config = {runtime: 'nodejs'};

export default function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user) return next();
  if (new URL(request.url).pathname === '/api/cron') return next();

  const h = request.headers.get('authorization') || '';
  if (h.startsWith('Basic ')) {
    const [u, ...p] = atob(h.slice(6)).split(':');
    if (u === user && p.join(':') === pass) return next();
  }
  return new Response('Cần đăng nhập', {status: 401, headers: {'WWW-Authenticate': 'Basic realm="Dashboard"'}});
}

/* Vercel Cron: lấy dữ liệu từ Backlog, ghi 5 file JSON vào Vercel Blob (private).
   Lịch nằm trong vercel.json. Vercel tự gửi "Authorization: Bearer $CRON_SECRET". */
import {put} from '@vercel/blob';
import {sync} from '../scripts/sync-backlog.mjs';

const write = (name, data) => put(`data/${name}`, JSON.stringify(data), {
  access: 'private',
  contentType: 'application/json',
  addRandomSuffix: false,
  allowOverwrite: true
});

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ok: false, error: 'Chưa đặt CRON_SECRET'}, {status: 500});
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', {status: 401});
  try {
    const r = await sync({write});
    return Response.json({ok: true, ...r});
  } catch (e) {
    console.error('[cron] LẤY DỮ LIỆU LỖI, giữ dữ liệu cũ:', e.message);
    return Response.json({ok: false, error: e.message}, {status: 500});
  }
}

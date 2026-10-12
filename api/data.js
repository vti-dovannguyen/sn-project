/* Phục vụ /data/<id>.json (vercel.json rewrite về /api/data?id=<id>).
   Đọc từ Vercel Blob (private); chưa có thì dùng dữ liệu mẫu trong seed-data/. */
import {get} from '@vercel/blob';
import fs from 'node:fs/promises';
import path from 'node:path';

const IDS = new Set(['issues', 'flow', 'snapshot', 'members', 'meta']);
const HEADERS = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-cache'};

export async function GET(request) {
  const id = (new URL(request.url).searchParams.get('id') || '').replace(/\.json$/, '');
  if (!IDS.has(id)) return new Response('Không tìm thấy', {status: 404});

  try {
    const r = await get(`data/${id}.json`, {access: 'private'});
    if (r && r.statusCode === 200) return new Response(r.stream, {headers: HEADERS});
  } catch (e) {
    console.error('[data] không đọc được Blob, dùng dữ liệu mẫu:', e.message);
  }

  try {
    const body = await fs.readFile(path.join(process.cwd(), 'seed-data', `${id}.json`));
    return new Response(body, {headers: HEADERS});
  } catch { /* không có dữ liệu mẫu cho id này */ }
  return new Response('Không tìm thấy', {status: 404});
}

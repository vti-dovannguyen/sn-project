# Sourcenext release dashboard

Dashboard theo dõi tiến độ release của dự án Backlog `SOURCENEXT_ECSITE`: tổng quan, deadline, issue và rủi ro, member, logtime, kế hoạch OT. Dữ liệu tự lấy từ Backlog lúc **08:00, 13:00 và 18:00 giờ Việt Nam** mỗi ngày.

Chỉ cần Node.js 18 trở lên (hoặc Docker). Không có bước build, không cần cài thư viện ngoài.

## Chạy nhanh

```bash
cp .env.example .env        # Windows: copy .env.example .env. Rồi điền BACKLOG_API_KEY
node server.mjs             # mở http://localhost:8080
```

Lần chạy đầu, nếu thư mục `data/` trống, server chép dữ liệu mẫu (ảnh chụp ngày 09/10/2026) vào để trang có số liệu ngay, rồi lấy dữ liệu thật từ Backlog nếu đã có `BACKLOG_API_KEY`.

## Chạy bằng Docker

```bash
cp .env.example .env        # điền thông tin
docker compose up -d --build
```

Dữ liệu nằm trong volume `dashboard-data`, nên không mất khi cập nhật bản mới. Đặt sau nginx hoặc Caddy để có HTTPS (mẫu ở `deploy/nginx.conf.example`).

Không dùng Docker: xem `deploy/sourcenext-dashboard.service` (systemd).

## Deploy lên Vercel

Trên Vercel không có tiến trình chạy nền và filesystem chỉ đọc, nên `server.mjs` không được dùng. Thay vào đó:

| Việc | Cách làm trên Vercel |
|---|---|
| Trang tĩnh | `public/` (qua `outputDirectory` trong `vercel.json`) |
| `/data/<id>.json` | `api/data.js` đọc từ Vercel Blob (private), chưa có thì dùng `seed-data/` |
| Lấy dữ liệu từ Backlog | `api/cron.js`, Vercel Cron chạy `0 1 * * *` UTC (08:00 giờ VN, gói Hobby có thể lệch trong vòng 1 giờ) |
| Đăng nhập | `middleware.js` (Basic Auth, dùng `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`) |

Các bước:

1. `npm i -g vercel`, `vercel login`, rồi `vercel link` trong thư mục dự án.
2. Tạo Blob store **private** (Dashboard, Storage, Create, Blob) và nối vào project. `BLOB_READ_WRITE_TOKEN` được đặt tự động.
3. Đặt Environment Variables: `BACKLOG_SPACE`, `BACKLOG_API_KEY`, `CRON_SECRET` (chuỗi ngẫu nhiên dài), `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`.
4. `vercel --prod`.
5. Chạy lấy dữ liệu lần đầu ngay, không chờ đến 08:00: `vercel crons run /api/cron`, rồi mở trang kiểm tra số liệu.

Nếu không đặt `BASIC_AUTH_USER`, site mở công khai. Cron lỗi thì dữ liệu cũ trong Blob được giữ nguyên, lỗi xem ở Logs của function `api/cron`.

## Lịch lấy dữ liệu (chạy bằng server.mjs, không áp dụng cho Vercel)

- `server.mjs` tự kiểm tra mỗi 30 giây, đến các mốc trong `SYNC_TIMES` (theo múi giờ `TZ_NAME`, mặc định `Asia/Ho_Chi_Minh`) thì chạy `scripts/sync-backlog.mjs`. Múi giờ của máy chủ không ảnh hưởng.
- Chỉ bật lịch khi có `BACKLOG_API_KEY`. Lần khởi động đầu cũng lấy dữ liệu một lần. Đặt `SYNC_ON_START=1` nếu muốn lấy mỗi lần khởi động lại.
- Muốn dùng cron của hệ điều hành thay thế: xem `deploy/crontab.example`.
- Chạy tay: `npm run sync` (tự đọc file `.env`).
- Nếu lần lấy lỗi (sai khóa, Backlog lỗi, số issue lệch bộ đếm quá 2%), dữ liệu cũ được giữ nguyên và lỗi ghi ở log. Dữ liệu chỉ được ghi đè khi cả bốn file đã lấy xong. `data/meta.json` cho biết lần cập nhật thành công gần nhất.

## API key Backlog

Tạo ở Backlog: Personal settings, API, Register new API key. Khóa chỉ cần quyền đọc dự án; tài khoản sở hữu khóa phải là thành viên của `SOURCENEXT_ECSITE`. Khóa chỉ nằm trong `.env` hoặc biến môi trường của server, không đưa vào mã trang. Đừng commit `.env`.

## Cấu trúc

| Đường dẫn | Việc |
|---|---|
| `server.mjs` | máy chủ tĩnh, đăng nhập Basic (tùy chọn) và bộ lập lịch |
| `scripts/sync-backlog.mjs` | gọi Backlog REST API, ghi `data/*.json` |
| `public/index.html` | toàn bộ giao diện và logic dashboard (HTML, CSS, JS) |
| `public/dash-shim.js` | lớp nhỏ nạp dữ liệu, giữ bộ lọc trên URL (`#tab=risk&who=...`) |
| `public/theme.css` | màu, cỡ chữ, chế độ tối tự theo hệ điều hành |
| `public/vendor/d3.min.js` | d3 v7.9.0 (có sẵn, không cần mạng) |
| `seed-data/` | dữ liệu mẫu ngày 09/10/2026 |
| `test/mock-backlog.mjs` | Backlog giả để thử script mà không cần khóa thật |

Dữ liệu dashboard đọc: `issues.json`, `flow.json`, `snapshot.json`, `members.json`. Mô tả issue và email thành viên không được lấy.

## Lưu ý

- Dashboard hiển thị tiêu đề, người làm và hạn của issue. Hãy bật `BASIC_AUTH_*` hoặc đặt sau VPN/SSO nếu server ra ngoài internet.
- Link ticket trong `public/index.html` trỏ tới `https://vti-corp.backlog.com/view/<mã>`. Đổi hằng `BASE` ở đầu phần script nếu space khác.
- Cách tính "ngày trễ": ngày lấy dữ liệu trừ hạn riêng của từng issue (không dùng hạn task cha). Mốc release là ô chọn trên trang (mặc định là hạn xa nhất của việc đang mở).
- Logtime: Backlog không có chấm công theo người, chỉ có trường Estimated/Actual Hours trên issue, nên tab Logtime so giờ ước tính (hoặc giờ giả định mỗi việc) với giờ khả dụng. Cần dữ liệu chấm công thật thì phải bổ sung nguồn khác.
- Kế hoạch OT là ước tính từ khối lượng còn lại, không phải dữ liệu OT đã duyệt.
- Một số số liệu tổng (`closed_issues`, `bugs_closed`) trong script tính theo trạng thái Closed. Bản chạy trong Claude có thể định nghĩa hơi khác, nên các thẻ "tỷ lệ bug đã đóng" có thể lệch nhẹ ở lần cập nhật đầu tiên.
- Script đã được thử với Backlog giả, chưa thử với Backlog thật vì không có khóa API trong môi trường đóng gói. Hãy chạy `npm run sync` một lần và kiểm tra số liệu trước khi dựa vào lịch tự động.

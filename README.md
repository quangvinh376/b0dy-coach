# b0dy-coach

App coach / logbook của B0DY Studio — demo.b0dy.studio (PWA, GitHub Pages từ `main`).

- `index.html` · `app.css` · `app.js` · `sw.js` — app (không framework, không build).
- `fonts/` — thả `SVN-Switzer-Medium.woff2` vào (xem `fonts/README.md`).
- `backend/` — `Stats.gs`, `Logbook.gs`, `Admin.gs` (chế độ Admin + IP phòng, v2.4) + hướng dẫn nối vào Apps Script (`backend/README.md`).
- `test/` — Playwright: `NODE_PATH=/opt/node22/lib/node_modules node test/flow11.js` (mock máy chủ, assert) · `node test/shot.js` (chụp 38 màn demo) · `node test/gif.js` (quay video loop) · `node test/usecases.js` (bộ use case A–O: demo + 2 viewport + mock API, ảnh lỗi vào `test/uc/`).
  v2.4: `node test/admin_mock.js` (chế độ Admin với máy chủ giả: định tuyến, không khoá IP, tab Cài đặt, outbox tách người) · `node test/edge_fx.js` (mép cuộn iOS, tràn màn hình, nền Acid màn nghỉ) · `BASE=<thư mục bản cũ> node test/edge_regress.js` (bố cục lúc nghỉ y hệt bản cũ) · `GAS_CODE=<Code.gs> node test/gas_admin.js` (chạy Admin.gs + Logbook/Stats/Code thật trên sheet giả, không cần mạng).
  v2.4.2–2.4.3: `node test/wkedge.js` (màu vùng dưới thanh trạng thái / thanh công cụ Safari 26: giả lập thuật toán WebKit `fixedContainerEdges` + đối chiếu pixel thật ở mép qua mọi màn).

Mở `?demo` trên URL để chạy bằng dữ liệu mẫu, không gọi mạng.

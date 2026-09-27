# b0dy-coach

App coach / logbook của B0DY Studio — demo.b0dy.studio (PWA, GitHub Pages từ `main`).

- `index.html` · `app.css` · `app.js` · `sw.js` — app (không framework, không build).
- `fonts/` — thả `SVN-Switzer-Medium.woff2` vào (xem `fonts/README.md`).
- `backend/` — `Stats.gs`, `Logbook.gs`, `Admin.gs` (chế độ Admin + IP phòng, v2.4) + hướng dẫn nối vào Apps Script (`backend/README.md`).
- `test/` — Playwright: `NODE_PATH=/opt/node22/lib/node_modules node test/flow11.js` (mock máy chủ, assert) · `node test/shot.js` (chụp 38 màn demo) · `node test/gif.js` (quay video loop) · `node test/usecases.js` (bộ use case A–O: demo + 2 viewport + mock API, ảnh lỗi vào `test/uc/`).
  v2.4: `node test/admin_mock.js` (chế độ Admin với máy chủ giả: định tuyến, không khoá IP, tab Cài đặt, outbox tách người) · `node test/edge_fx.js` (mép cuộn iOS, tràn màn hình, nền Ink của loop) · `BASE=<thư mục bản cũ> node test/edge_regress.js` (bố cục lúc nghỉ y hệt bản cũ) · `GAS_CODE=<Code.gs> node test/gas_admin.js` (chạy Admin.gs + Logbook/Stats/Code thật trên sheet giả, không cần mạng).
  v2.4.2–2.4.3: `node test/wkedge.js` (màu vùng dưới thanh trạng thái / thanh công cụ Safari 26: giả lập thuật toán WebKit `fixedContainerEdges` + đối chiếu pixel thật ở mép qua mọi màn).
  v2.4.4 = gộp nhánh nav theo mép mực + nhánh dải Safari 26 (tắt trong app cài, đổi màu theo từng mép vòng loang).
  v2.5: màn nghỉ **"Hạt"** — nền Ink xuyên suốt, vành hạt là đồng hồ (1 giây = 1 hạt), vành nhịp thở ra / hút về giữa set và nghỉ, số reps/kg bay xuống cụm đáy, pill chính đổi chữ + nở theo chữ; mọi chuyển động của loop chạy theo đồng hồ MT (`window.__mot.hold/step` để quay từng khung). Ngoài loop: tên khách bay sang tiêu đề hồ sơ / xác nhận (lò xo 420 ms, nội dung màn mới hiện sau — `.hlead`), trang đang rời giữ `enter-*` tới hết lúc rời (trước đây tiêu đề `.st` tắt phụt), hạt mừng ở màn hoàn thành. Test: `usecases.js` J/K kiểm vành hạt (số hạt = số giây, kéo lúc đang đếm, 10 giây cuối, 0:00), C kiểm tên bay + trang rời không tắt phụt, `node test/ink_nav.js` nay kiểm nav màn nghỉ Ink bằng điểm ảnh (cần Pillow), `edge_fx.js` E6 và `wkedge.js` W3–W7 kiểm nền/dải Ink ở mọi pha.

Mở `?demo` trên URL để chạy bằng dữ liệu mẫu, không gọi mạng.

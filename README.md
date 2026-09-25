# b0dy-coach

App coach / logbook của B0DY Studio — demo.b0dy.studio (PWA, GitHub Pages từ `main`).

- `index.html` · `app.css` · `app.js` · `sw.js` — app (không framework, không build).
- `fonts/` — thả `SVN-Switzer-Medium.woff2` vào (xem `fonts/README.md`).
- `backend/` — `Stats.gs` + hướng dẫn nối vào Apps Script (action `stats`, `installLibrary()`).
- `test/` — Playwright: `NODE_PATH=/opt/node22/lib/node_modules node test/flow11.js` (mock máy chủ, assert) · `node test/shot.js` (chụp 38 màn demo) · `node test/gif.js` (quay video loop) · `node test/usecases.js` (bộ use case A–O: demo + 2 viewport + mock API, ảnh lỗi vào `test/uc/`).

Mở `?demo` trên URL để chạy bằng dữ liệu mẫu, không gọi mạng.

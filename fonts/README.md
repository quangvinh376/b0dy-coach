# Font

App dùng **SVN-Switzer** weight 500 (Medium) làm font chữ chính.

- `SVN-Switzer-Medium.woff2` — bản trình duyệt dùng (39 KB). Chuyển không mất dữ liệu từ file ttf bằng fontTools (`TTFont(...).flavor='woff2'`): nét chữ, cmap, GPOS, hmtx giống hệt; chỉ bỏ bảng chữ ký số DSIG (trình duyệt không đọc). `index.html` nạp sẵn bằng `<link rel="preload">`, `sw.js` cài sẵn vào cache.
- `SVN-Switzer-Medium.ttf` — bản gốc (138 KB), dự phòng cho trình duyệt không đọc được woff2.

`app.css` khai báo đúng hai file này theo thứ tự woff2 → ttf (v2.15.1 bỏ hai mục .woff/.otf không có file — trước đây máy mới phải đi qua hai lượt 404 rồi mới tới ttf). Đổi font: thay cả hai file, giữ đúng tên, rồi đổi `APP_VER` + tên cache `sw.js` như mọi lần deploy. Chưa tải được font thì app lùi về Switzer (Fontshare) rồi font hệ thống. Số và nhãn dùng JetBrains Mono (Google Fonts).

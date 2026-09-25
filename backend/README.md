# Backend · những gì bản v2 cần thêm ở Apps Script

App v2 chạy được ngay với API hiện có (`coach`, `checkin_coach`, `log`). Ba việc dưới đây bổ sung dữ liệu cho trang chủ, Hiệu suất tập và thư viện bài mới. Chưa làm thì các ô liên quan hiện `—`, không lỗi.

## 1. Thêm file `Stats.gs`

Apps Script project **B0DY Discord KPI** (tài khoản hello@b0dy.studio):

1. Files ▸ **+** ▸ Script ▸ đặt tên `Stats` ▸ dán toàn bộ nội dung `backend/Stats.gs`.
2. Mở `Code.gs`, trong hàm `api_()` thêm một dòng cạnh các `case` hiện có:
   ```js
   case 'stats': return statsApi_(body);
   ```
3. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.** Bỏ bước này thì `/exec` vẫn chạy code cũ.

Action `stats` (POST `{action:'stats', pin, month:'2026-09'}`) trả:

| Trường | Nội dung | Dùng ở |
|---|---|---|
| `days` | `{ '2026-09-01': 4, … }` số buổi "Đã tập" của coach theo ngày (SESSION LOG) | Trang chủ · biểu đồ 7D/1M |
| `monthTotal` | tổng buổi trong tháng | Trang chủ · "Đã dạy n buổi" |
| `perClient` | `{ tên: { m: buổi tháng này, last: 'yyyy-MM-dd' } }` | Khách tập chậm (m < 10) · "Buổi tập gần nhất" ở màn xác nhận |
| `com` | `{ month, total }` từ tab COMMISSION, dòng coach, cột Σ Hoa hồng | Trang chủ · ô Hoa hồng |
| `hist` | `{ tên: { bài: [ {d, kg, rep, ok} … ] } }` từ sheet "Khách của <coach>", tối đa 24 set gần nhất mỗi bài | Hiệu suất tập |

Lưu ý: ô Hoa hồng đọc **tháng đang chọn** ở tab COMMISSION (ô THÁNG). Nếu tab đang xem tháng khác, app ghi rõ "Hoa hồng T8" thay vì "Hoa hồng".

## 2. Ghi thư viện bài tập mới vào tab "Bài tập" (một lần)

Trong editor: chọn hàm **`installLibrary`** ▸ Run ▸ cấp quyền nếu hỏi. Tab `Bài tập` trong *[B0DY Studio] Customer database* được ghi đè bằng 64 bài (Tên · Nhóm · Vùng · id). Action `coach` hiện có vẫn đọc cột Tên/Nhóm như cũ, nên app nhận nhóm mới ngay lần đồng bộ kế tiếp. Chưa chạy thì app dùng bản nhúng sẵn trong `app.js`, kết quả giống hệt.

## 3. Sự kiện ghi (`log`) — không đổi định dạng

App v2 vẫn gửi `SET`, `BÀI`, `CHECKOUT`, `ĐO`, `MỤC TIÊU` với `id` chống trùng như v1. Khác biệt:

- `main` luôn `0` (đã bỏ khái niệm bài chính).
- `plan` (cột "Buổi tập") = vùng cơ của bài (`Back`, `Legs`…) thay vì tên giáo án cũ.
- `SET` của set vừa ghi được **giữ trong máy** tới khi coach bắt đầu nghỉ / sang set kế / đổi bài (để hoàn tác không cần gọi máy chủ). Set hoàn tác không bao giờ tới máy chủ.

## 4. Tuỳ chọn: ngày hết hạn gói

Màn Hồ sơ hiện "Hết hạn" từ `member.exp` (hoặc `member.end` nếu thiếu). Nếu muốn đúng cột **Ngày hết hạn** của tab MEMBERS, thêm trường `exp` (chuỗi `yyyy-MM-dd`) vào từng phần tử `members` trong phản hồi của action `coach`.

## 5. Loại gói 1:1 / 1:2 và khách đã hết gói — `backend/Logbook.gs` (v2.2, bắt buộc cho màn Chọn khách)

Màn Chọn khách chia nhóm "KHÁCH 1:1 SẴN SÀNG TẬP" / "KHÁCH 1:2 SẴN SÀNG TẬP" và chỉ cho ghép cặp khách 1:2; tab Khách hàng có nhóm "KHÁCH ĐÃ HẾT GÓI" (vẫn xem được hồ sơ). Backend cũ không trả loại gói và **lọc bỏ** khách hết buổi, nên hai chỗ này rỗng/toàn 1:1 trên live cho tới khi cập nhật.

`backend/Logbook.gs` là **bản đầy đủ** của file `Logbook` trong project Apps Script (lấy từ bản đang chạy 25/09/2026, sửa 2 hàm). Cách cập nhật:

1. Apps Script **B0DY Discord KPI** ▸ mở file `Logbook.gs` ▸ chọn tất cả ▸ dán toàn bộ nội dung `backend/Logbook.gs` (thay cả file) ▸ Save.
2. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.** Không có bước này thì `/exec` vẫn chạy code cũ.
3. Kiểm tra: mở app, kéo làm mới, vào Chọn khách → khách có cột **Loại** = `1:2` trong tab MEMBERS phải nằm ở nhóm 1:2 với dấu +; tab Khách hàng phải có nhóm "KHÁCH ĐÃ HẾT GÓI".

Những gì đổi (chỉ trong `lbMembers_` và một dòng gọi ở `lbCoach_`):

| Trường mới trong `members[]` | Nguồn (tab MEMBERS của [B0DY Studio] BA) | App dùng ở |
|---|---|---|
| `kind` | cột **E "Loại"** (`1:1` / `1:2`; nhận cả "Loại gói" nếu đổi tên cột) | Chọn khách: nhóm 1:1 / 1:2, dấu + chỉ cho 1:2 |
| `pkg` | cột C "Gói" | dự phòng (hồ sơ) |
| `status` | cột W "Trạng thái" | dự phòng |
| `exp` | = `end` (cột Z "Ngày hết hạn", thiếu thì Y "Ngày kết thúc") | Hồ sơ · Hết hạn |
| khách `left ≤ 0` | trước đây bị bỏ, nay trả về với `left: 0` | Khách hàng · "KHÁCH ĐÃ HẾT GÓI" |

`lbMembers_(withDone)`: `lbCoach_` gọi với `true` (trả cả khách hết gói); `lbCheckin_` vẫn gọi mặc định (chỉ khách còn buổi) nên check-in khách hết gói vẫn bị chặn như cũ. App nhận dạng 1:2 khi `kind` khớp `1:2`, `1-2`, `đôi`, `duo`, `cặp` (không phân biệt hoa thường); thiếu trường → coi là 1:1.

Lưu ý: `coach` đi qua Cloudflare Worker `b0dy-kiosk-api`. Worker chỉ chuyển tiếp JSON nên trường mới tự đi qua; nếu Worker có cache phản hồi `coach`, xoá cache hoặc chờ hết hạn. Nếu danh sách khách hết gói quá dài theo thời gian, thêm điều kiện lọc theo `end` (ví dụ chỉ 12 tháng gần nhất) ngay chỗ `if (left <= 0 && !withDone) continue;`.

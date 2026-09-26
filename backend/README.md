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

## 6. Hai IP được check-in — ĐÃ THAY bằng mục 7 (`Admin.gs`, v2.4)
`backend/IpAllow.md` (bản nháp v2.3.2 dùng `STUDIO_IP2`) **chưa từng được áp dụng** và nay đã bị thay: `ipOk_` đang chạy đọc `STUDIO_IP` dạng **danh sách ngăn bằng dấu phẩy**, và `iplist` / `addip` / `delip` nằm trong `Admin.gs` làm việc đúng trên danh sách đó. **Không dán code của IpAllow.md.**

## 7. Chế độ Admin — `backend/Admin.gs` (v2.4, bắt buộc cho PIN admin trong app)

Đăng nhập app bằng **ADMIN_PIN** (Script Properties) → tên **Admin**: xem và check-in **toàn bộ khách của phòng, không khoá IP**, ghi buổi tập như coach, tab **Cài đặt** (thứ 3, cạnh Trang chủ · Khách hàng) quản lý IP được check-in. Mọi lệnh admin đi **thẳng Apps Script** (Worker không có chế độ admin).

Cài đặt (Apps Script **B0DY Discord KPI**):

1. Files ▸ **+** ▸ Script ▸ đặt tên `Admin` ▸ dán toàn bộ `backend/Admin.gs` ▸ Save.
2. `Code.gs` ▸ trong `switch` của `api_()`, ngay dưới dòng `case 'stats': …`, thêm 7 dòng:
   ```js
         case 'adm_data':      out = admData_(p);    break;
         case 'adm_checkin':   out = admCheckin_(p); break;
         case 'adm_log':       out = admLog_(p);     break;
         case 'adm_stats':     out = admStats_(p);   break;
         case 'iplist':        out = admIpList_(p);  break;
         case 'addip':         out = admIpAdd_(p);   break;
         case 'delip':         out = admIpDel_(p);   break;
   ```
3. **Deploy ▸ Manage deployments ▸ ✏️ (Coach API v1) ▸ Version: New version ▸ Deploy.**
4. Kiểm (không cần PIN): POST `{"action":"adm_data"}` và `{"action":"iplist"}` phải trả `sai_pin` — trả `unknown_action` nghĩa là chưa deploy bản mới.

| action | Việc | Ghi chú |
|---|---|---|
| `adm_data` | như `coach` nhưng MỌI khách (MEMBERS, mỗi tên một dòng: ưu tiên dòng còn buổi), kèm coach phụ trách, snapshot, thư viện, `checked`/`signed` hôm nay | `coach: "Admin"` |
| `adm_checkin` | check-in + ký thay một lượt, mọi khách, không khoá IP | SESSION LOG: B chuỗi `M/d/yyyy` · G · K `Đã tập` · N `app HH:mm · ký: Admin`; cột E (Coach) là công thức → KPI vẫn tính cho coach phụ trách. Không auto-retry |
| `adm_log` | ghi lô sự kiện vào sheet **Khách của <coach phụ trách>** (bỏ hậu tố "(giai đoạn 1)"), cột R = `Admin` | id trùng ở bất kỳ sheet coach nào bị bỏ qua |
| `adm_stats` | trang chủ Admin: buổi "Đã tập" cả phòng theo ngày, `perClient` mọi khách, `rev` = Doanh thu (dòng "Tổng" tab COM, cột C), `hist` từ mọi sheet coach | |
| `iplist` / `addip` / `delip` | đọc / thêm IP của thiết bị đang gọi / xoá theo giá trị trên `STUDIO_IP` (danh sách dấu phẩy) | tối đa 2 · **không bao giờ để rỗng** (rỗng = tắt khoá IP) → không xoá được IP cuối |

### 7.1 v2.4.1 — tốc độ vào Admin (26/09/2026)

Đo trên trang **Executions** (Version 21): `adm_data` ~15 s, `adm_stats` ~12 s; app v2.4.0 gọi nối đuôi Worker `coach` → `admin` → `adm_data` → `adm_stats` ≈ 30 s mới có đủ trang chủ.

**Nguyên nhân:** công thức trong file BA được kéo sẵn tới cuối bảng nên `getLastRow()` của MEMBERS ≈ 1.000 (dữ liệu thật ~65 dòng) và của SESSION LOG = 5.000 (dữ liệu thật ~850 dòng). v2.4.0 đọc nguyên các vùng đó mỗi lượt.

**Sửa:**
- `Admin.gs` đọc **một cột** để tìm dòng dữ liệu thật cuối cùng, rồi chỉ đọc phần có dữ liệu. `test/gas_perf.js` dựng bảng đúng cỡ thật và so v2.4.0 ↔ v2.4.1: kết quả giống hệt, số ô đọc giảm 60–84%.
- App: bỏ lượt hỏi `admin` riêng (`adm_data` tự kiểm PIN), gọi `adm_data` ∥ `adm_stats` song song, nhớ **mọi** tài khoản đã đăng nhập trên máy (`lb_acc`, chỉ hash PIN) → đổi qua lại coach ⇄ Admin vào ngay từ cache rồi làm mới ngầm.
- `ADM_PERF = true`: mỗi lệnh admin ghi thời gian từng bước ra Executions (chỉ số mili-giây, không có dữ liệu khách hay PIN).

**Cập nhật:** thay toàn bộ nội dung file `Admin` trong Apps Script bằng `backend/Admin.gs` ▸ Save ▸ Deploy ▸ Manage deployments ▸ ✏️ (Coach API v1) ▸ **New version**. `Code.gs` không đổi.

⚠️ **IP phòng nằm ở HAI chỗ.** Tab Cài đặt chỉ sửa `STUDIO_IP` (Apps Script). Worker Cloudflare gác bằng biến `ALLOW_IP` riêng:
- **Thêm** IP ở app → coach check-in từ IP đó vẫn được (Worker từ chối → app tự lui về Apps Script, chậm hơn vài giây). Muốn nhanh: thêm IP đó vào `ALLOW_IP`.
- **Xoá** IP ở app **không** rút quyền phía Worker. Muốn chặn hẳn một IP: xoá cả trong `ALLOW_IP` (Cloudflare → Workers & Pages → `b0dy-kiosk-api` → Settings → Variables and secrets).

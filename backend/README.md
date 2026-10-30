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

Đăng nhập app bằng **ADMIN_PIN** (Script Properties) → tên **Admin**: xem và check-in **toàn bộ khách của phòng, không khoá IP**, ghi buổi tập như coach, tab **Cài đặt** (thứ 3, cạnh Trang chủ · Khách hàng) quản lý IP được check-in. Lệnh admin chạy ở Apps Script; **từ app v2.15.2 (13/10/2026) `adm_data` · `adm_checkin` · `adm_log` đi Worker v8 trước** (bản port của `admData_` · `admCheckin_` · `admLog_`, mục 7.2), Apps Script là đường lùi. `adm_stats`, `iplist` · `addip` · `delip` chỉ ở Apps Script.

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

### 7.2 v2.15.2 — Admin trên Worker v8 (13/10/2026)

Đo 13/10: mọi lệnh Admin ở Apps Script mất ~8–9,4 s phía máy chủ (+1–1,5 s mạng), nặng thêm khi trigger `updateDiscord` (mỗi phút, 5–25 s) đang chạy → vào app Admin / check-in Admin ~10 s. Worker `b0dy-kiosk-api` **v8** (version `a893034f`, nhãn `v8-admin`) thêm `adm_data` · `adm_checkin` · `adm_log` — cùng đầu vào / đầu ra với `Admin.gs` (test đối chiếu chạy `Admin.gs` thật và Worker trên cùng bảng tính giả: 41/41), kiểm `ADMIN_PIN` của Worker (secret) trước mọi lượt ghi, không khoá IP.

- App lùi về Apps Script khi Worker trả `unknown_action` (Worker cũ) · `wk_unconfigured` · **`sai_pin`** (ADMIN_PIN của Worker khác Script Property `ADMIN_PIN` — Admin vẫn dùng được nhưng chậm như cũ; tab Cài đặt của app ghi `· APPS SCRIPT` thay vì `· WORKER`). `adm_data` (chỉ đọc) và `adm_log` (ghi khử trùng theo id — Worker ghi dở thì Apps Script bỏ qua id đã có) lùi với **mọi** lỗi: lỗi mạng, lỗi Sheets, `wk_no_sheet_coach` (`adm_log` cho khách mà sheet "Khách của <coach>" chưa có — Worker không ghi gì, Apps Script tự tạo sheet). `adm_checkin` lỗi mạng / lỗi lạ **không** lùi (Worker có thể đã ghi): app báo "Chưa check-in" + Thử lại → máy chủ trả `da_checkin` nếu dòng đã có.
- **Sửa logic `admData_` / `admCheckin_` / `admLog_` trong `Admin.gs` thì phải sửa bản port trên Worker** (mã + test đối chiếu: doc dự án `claude/b0dy-kiosk-worker-v8.md`), không thì hai đường trả khác nhau.
- Đổi `ADMIN_PIN` ở Script Properties thì đổi luôn secret `ADMIN_PIN` của Worker (Cloudflare → Workers & Pages → `b0dy-kiosk-api` → Settings → Variables and secrets) — lệch nhau thì Admin lùi về Apps Script (chậm), không hỏng.

⚠️ (Lịch sử, đúng tới 11/10 — từ `Admin.gs` v2.10 + Worker v7, tab Cài đặt chép danh sách IP sang tab "Cấu hình" ô B1 của Customer database và Worker đọc ô đó → **một nguồn**; `ALLOW_IP` chỉ còn dự phòng.) **IP phòng nằm ở HAI chỗ.** Tab Cài đặt chỉ sửa `STUDIO_IP` (Apps Script). Worker Cloudflare gác bằng biến `ALLOW_IP` riêng:
- **Thêm** IP ở app → coach check-in từ IP đó vẫn được (Worker từ chối → app tự lui về Apps Script, chậm hơn vài giây). Muốn nhanh: thêm IP đó vào `ALLOW_IP`.
- **Xoá** IP ở app **không** rút quyền phía Worker. Muốn chặn hẳn một IP: xoá cả trong `ALLOW_IP` (Cloudflare → Workers & Pages → `b0dy-kiosk-api` → Settings → Variables and secrets).

## 8. Bán cho khách mới — `backend/Sales.gs` (v2.9.0, cho màn Quét mã QR)

Luồng **Sell** (nút ở khối đỉnh Home, `sell.js`) chỉ **tính**, không ghi gì lên máy chủ. Riêng màn **Quét mã QR** cần tài khoản nhận chuyển khoản. Số tài khoản **không** nằm trong repo (repo công khai): app hỏi lệnh `bank`, Apps Script đọc Script Properties.

Cài đặt (Apps Script **B0DY Discord KPI**):

1. Files ▸ **+** ▸ Script ▸ đặt tên `Sales` ▸ dán toàn bộ `backend/Sales.gs` ▸ Save.
2. `Code.gs` ▸ trong `switch` của `api_()`, cạnh các case khác, thêm:
   ```js
         case 'bank':          out = salesBank_(p);  break;
   ```
3. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**
4. **Project Settings ▸ Script Properties** (chủ studio tự điền):

| Key | Giá trị | Bắt buộc |
|---|---|---|
| `VIETQR_ACCOUNT` | số tài khoản nhận (chỉ chữ số; dấu cách / chấm / gạch tự bỏ) | có — thiếu thì app báo "Chưa cài tài khoản nhận chuyển khoản" và không vẽ mã |
| `VIETQR_BIN` | mã ngân hàng NAPAS 6 số | không — mặc định `970407` (Techcombank) |
| `VIETQR_NAME` | tên hiện dưới thẻ mã, không dấu, ví dụ `HO KINH DOANH B0DY STUDIO` | không |

Lệnh `bank` (POST `{action:'bank', pin}` hoặc `{action:'bank', apin}`) → `{ok:true, bin, acc, bank, name}` · `sai_pin` · `no_bank`. Không khoá IP (mã dùng được cả ngoài phòng), không ghi log. App nhớ kết quả vào `localStorage.lb_bank` (mất mạng vẫn vẽ được mã), hỏi lại mỗi lần bấm **Sell**; máy chủ báo `no_bank` thì xoá bản nhớ.

Mã do app dựng là **VietQR động** (NAPAS 247 · EMVCo MPM): tài khoản + số tiền kỳ này + nội dung `HỌ TÊN + GÓI + TRA GOP` (≤ 25 ký tự; dài hơn thì họ và tên đệm rút còn chữ cái đầu). Kiểm thử: `node test/gas_sales.js` (chạy thật `Sales.gs` với PropertiesService giả) và `node test/sell.js`.

## 9. Khách gia hạn = MỘT khách — `backend/Logbook.gs` v2.11 (29/10/2026)

MEMBERS ghi mỗi hợp đồng / giai đoạn một dòng, nên khách gia hạn có hai dòng cùng tên (gói cũ hết buổi + gói mới). Trước v2.11 lệnh `coach` trả cả hai dòng (Admin thì đã gộp từ v2.4 — `admMembers_` / Worker `admPick`), app coi là hai khách: "Khách hôm nay" hiện hai lần, app lấy nhầm dòng gói cũ (đếm buổi trong logbook từ gói cũ, khách 1:2 bị bỏ chọn, hồ sơ nhảy về gói cũ).

- `lbOnePerName_(list)`: giữ dòng **còn buổi** cuối cùng, không có thì dòng cuối — cùng luật với Admin. `lbCoach_` gọi sau khi lọc khách của coach.
- "Đã tập hôm nay" (`checked` / `signed`) chỉ gắn khi khách **đang thuộc coach này** = coach của dòng cuối cùng cùng tên trên MEMBERS (cùng luật `memberCoachMap_` dùng để chặn check-in hộ). SESSION LOG nhận diện theo tên, nên trước đây khách chuyển giai đoạn sang coach khác (vd. 011A Quyết Hán → 011B Hiền Mai) tập với coach mới vẫn hiện trong "Khách hôm nay" của coach cũ.
- App v2.18.3 gộp cùng luật ở `buildClients` (`oneRowPerName`), nên chạy đúng với cả máy chủ cũ lẫn mới; bản máy chủ này để Apps Script, Worker và app trả cùng một danh sách.
- Cài đặt: dán `backend/Logbook.gs` vào file `Logbook` ▸ Save ▸ **Deploy ▸ Manage deployments ▸ ✏️ ▸ New version ▸ Deploy**. Không đổi `Code.gs`.
- Worker (lệnh `coach` đi Worker trước): `apiCoach` thêm `admPick` sau khi lọc khách của coach — một cặp thay chuỗi trên Worker v8, doc dự án `claude/b0dy-kiosk-worker-v9.md`.
- Test: `node test/gas_coach_dup.js` (Logbook.gs thật trong VM) · `node test/renew_dup.js` (app).

## 10. Nhận diện khách theo MÃ, không theo tên — `Logbook.gs` v2.12 · `Admin.gs` · `Stats.gs` · `Archive.gs` (29/10/2026)

Hai khách khác nhau trùng tên (B004DY · B069DY cùng "Nguyễn Quang Minh") làm mọi thứ đi theo tên bị lẫn: buổi tập, hoa hồng, check-in, hồ sơ. Từ v2.12 (Worker v10 cùng luật):

- **Người** = mọi dòng MEMBERS cùng **SĐT** (luật của chủ studio: khớp SĐT là cùng một khách; khách nước ngoài dùng số tượng trưng, vd. `0000000029`). SĐT trống → theo `Mã KH`, không có mã → theo tên. `pid` = `Mã KH` đầu tiên của người (ổn định qua các lần gia hạn) — app chỉ nhận `pid`, **SĐT không bao giờ rời máy chủ**.
- **Mã gói (`Mã KH`, cột U MEMBERS)**: mỗi gói một mã mới, hai giai đoạn A/B của một gói chung mã. Mã của người tại ngày *d* = dòng có "Ngày bắt đầu" ≤ *d* muộn nhất (đúng luật cột P).
- **SESSION LOG cột Q "Mã KH"**: check-in (app coach · Admin · kiosk tên duy nhất) ghi mã gói vào Q. Cột P `_mrow` tra theo Q, dòng trống Q mới tra theo tên như cũ:
  `=IF($H5="","",IFERROR(IF($Q5<>"",MATCH($Q5&"|"&MAXIFS(MEMBERS!$P$6:$P$1013,MEMBERS!$U$6:$U$1013,$Q5,MEMBERS!$P$6:$P$1013,"<="&$C5),MEMBERS!$W$6:$W$1013,0),MATCH($H5&"|"&MAXIFS(MEMBERS!$P$6:$P$1013,MEMBERS!$C$6:$C$1013,$H5,MEMBERS!$P$6:$P$1013,"<="&$C5),MEMBERS!$T$6:$T$1013,0)),""))`
  MEMBERS cột W `_mkey` = `ARRAYFORMULA(U & "|" & P)` (ẩn, như T `_key`). Đổi tên khách trên MEMBERS không còn làm rơi buổi.
- Dòng SESSION LOG → người: P (sheet đã tra) → Q → tên (chỉ khi tên thuộc đúng một người).
- **Customer database cột S "Mã KH"** (19 cột A..S): mỗi sự kiện ghi mã gói của người tại ngày sự kiện. Tab cũ 18 cột tự thêm cột S khi ghi (`lbWiden_`). Hồ sơ (snapshot) và Hiệu suất tập gom theo người (S → tên duy nhất); dòng thiếu S của tên trùng không gán bừa.
- **Khoá trả app (`key`)**: tên nếu trong danh sách trả về chỉ một người mang tên đó, trùng tên → `pid`. snapshot · perClient · plan · hist khoá theo `key`. App cũ (chỉ biết tên) chạy y nguyên ở chế độ coach; app v2.19.0 dùng `key`, gửi `pid` khi check-in / ghi nhật ký.
- Check-in (`lbCheckin_` · `admCheckin_`) dùng chung `idCheckinWrite_` (ghi Q, chặn trùng theo NGƯỜI) — `lbCheckin_` không còn qua `apiCheckin_` + `apiSign_` của Code.gs. App cũ gửi tên trùng không rõ người → `trung_ten`, không ghi gì.
- Còn theo tên (biết trước): đường kiosk của Code.gs (dự phòng khi Worker lỗi) — dòng tên trùng, trống Q được P tra theo tên; Worker điền Q khi coach ký dòng chờ. Tab `Tổng hợp bài` (lưu trữ) khoá theo tên.
- Test: `node test/gas_identity.js` (Logbook/Admin/Stats thật + SESSION LOG giả có công thức P) · `node test/same_name.js` (app) · Worker: doc dự án `claude/b0dy-kiosk-worker-v10.md`.

### 10.1 v2.13 — "Mã KH" hiện như Coach / Mã HV / Loại (30/10/2026)

Bố cục SESSION LOG từ 30/10 (máy chủ dò cột theo **tên tiêu đề**, không theo vị trí):

| Cột | Tiêu đề | Hiện/ẩn | Nội dung |
|---|---|---|---|
| I | Mã HV | hiện | `=IF($Q5="","",INDEX(MEMBERS!$B$6:$B$1013,$Q5))` — mã hợp đồng + giai đoạn (002A/002B) |
| F · J | Coach · Loại | hiện | cùng kiểu, tra theo `$Q` |
| **P** | **Mã KH** | **hiện** | `=IF($Q5="","",INDEX(MEMBERS!$U$6:$U$1013,$Q5))` — công thức, **không ghi vào** |
| Q | `_mrow` | ẩn | dòng MEMBERS (công thức mục 10, nay tra theo `$R`) |
| R | `_makh` | ẩn | **cột nhập**: check-in ghi mã gói vào đây |
| S | `_kh` | ẩn | `=IF($Q5="","",INDEX(MEMBERS!$X$6:$X$1013,$Q5))` — khoá NGƯỜI |

- MEMBERS cột X `_kh` (ẩn) = Mã KH của dòng đầu tiên cùng SĐT (không SĐT → Mã KH của chính dòng): khoá người do **sheet** tính. `idRead_` / Worker v11 dùng `_kh` làm `pid` khi có cột này.
- Máy chủ: cột nhập = `_makh` nếu có, không thì `Mã KH` (bố cục v2.12) · `_mrow` như cũ. Worker v11 cùng luật.
- **CHART** đếm khách theo `_kh`: bảng nền AX `MÃ KHÁCH` (QUERY MEMBERS X/K) · AY ngày ký HĐ đầu · AZ nguồn · BA buổi đầu (SESSION LOG S) · BB tháng bắt đầu · BC `TÊN KHÁCH`; AH/AI/AJ, D223, D261, cohort E138 đọc SESSION LOG `$S` thay `$H`.
- **P&L** dòng 7 (doanh thu buổi tập) và 13 (hoa hồng): `VLOOKUP('SESSION LOG'!$Q$5:$Q, …)` — trước 30/10 là `$P` (`_mrow` cũ). Đổi vị trí cột SESSION LOG phải rà cả P&L.
- **Mã HV vẫn bắt buộc**: MEMBERS M "Đã tập" (COUNTIFS SESSION LOG I), 🚂 1 (hoa hồng từng dòng hợp đồng), COM, đơn giá buổi trên app đều khoá theo Mã HV — một gói có thể có hai giai đoạn giá khác nhau (A/B), Mã KH không phân biệt được.

/* =====================================================================
   B0DY · Coach app — Sales.gs (v2.9.0 · 12/10/2026)
   Lệnh 'bank' cho màn "Quét mã QR" của luồng Bán cho khách mới (sell.js): trả tài khoản nhận chuyển khoản
   lấy từ Script Properties. Số tài khoản KHÔNG nằm trong repo (repo công khai) và không ghi ra log.
   Chỉ đọc, không ghi gì. Cần PIN coach (COACH_PINS) hoặc PIN admin. Không khoá IP.

   Cài (Apps Script "B0DY Discord KPI"):
     1. Files ▸ + ▸ Script ▸ đặt tên "Sales" ▸ dán toàn bộ file này ▸ Save.
     2. Code.gs ▸ trong switch của api_(), cạnh các case khác, thêm:
          case 'bank':          out = salesBank_(p);  break;
     3. Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.
     4. Project Settings ▸ Script Properties:
          VIETQR_ACCOUNT   số tài khoản nhận (bắt buộc; thiếu → app báo "Chưa cài tài khoản nhận chuyển khoản")
          VIETQR_BIN       mã ngân hàng NAPAS 6 số (không có → 970407 = Techcombank)
          VIETQR_NAME      tên hiện dưới mã, viết không dấu (ví dụ HO KINH DOANH B0DY STUDIO)

   Phản hồi: {ok:true, bin, acc, bank, name} · {ok:false, error:'sai_pin'} · {ok:false, error:'no_bank'}.
   App dựng mã VietQR động (EMVCo, CRC-16/CCITT-FALSE) ngay trên máy từ các trường này + số tiền + nội dung.
   ===================================================================== */
var SALES_BANKS = { '970407': 'TECHCOMBANK' };

function salesBank_(p) {
  p = p || {};
  var who = '';
  if (p.apin && typeof adminOk_ === 'function' && adminOk_(p)) who = 'Admin';
  else who = lbCoachByPin_(p.pin);
  if (!who) return { ok: false, error: 'sai_pin' };
  var sp = PropertiesService.getScriptProperties();
  var acc = String(sp.getProperty('VIETQR_ACCOUNT') || '').replace(/[\s.\-]/g, '');
  if (!/^\d{6,19}$/.test(acc)) return { ok: false, error: 'no_bank' };
  var bin = String(sp.getProperty('VIETQR_BIN') || '970407').replace(/\s/g, '');
  if (!/^\d{6}$/.test(bin)) bin = '970407';
  var name = String(sp.getProperty('VIETQR_NAME') || '').replace(/\s+/g, ' ').trim();
  return { ok: true, bin: bin, acc: acc, bank: SALES_BANKS[bin] || '', name: name };
}

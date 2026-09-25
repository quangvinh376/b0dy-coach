/* =====================================================================
   B0DY LOGBOOK — backend cho app coach (file riêng, thêm vào project
   "B0DY Discord KPI"). Không sửa hàm cũ. Chỉ cần 3 case trong switch
   của api_() ở Code.gs:

     case 'coach':         out = lbCoach_(p);   break;
     case 'checkin_coach': out = lbCheckin_(p); break;
     case 'log':           out = lbLog_(p);     break;

   Dữ liệu cá nhân ghi vào file "[B0DY Studio] Customer database",
   sheet "Khách của <Coach>", 1 dòng = 1 sự kiện (append-only, có id
   chống ghi trùng). Check-in vẫn đi qua apiCheckin_ + apiSign_ (BA).

   v2.2 (25/09/2026): action 'coach' trả thêm kind/pkg/status/exp cho từng
   khách và trả cả khách đã hết gói (lbMembers_(true)). Xem backend/README.md.
   ===================================================================== */
var LB_DB_ID  = '19iWnTT5eWFKCJ9Mnzuv_pcF1MMH4XGnx60Uc0OXMmeM';
var LB_PREFIX = 'Khách của ';
var LB_LIB    = 'Bài tập';
var LB_TZ     = 'Asia/Ho_Chi_Minh';
var LB_HEAD   = ['id','Ghi lúc','Ngày','Khách','Buổi #','Loại','Buổi tập','Bài tập','Set #','KG','REP','Đạt','Bài chính','Chỉ số','Giá trị','Form','Ghi chú','Coach'];
var LB_W      = LB_HEAD.length; /* 18 cột A..R */

/* ---------- coach theo PIN: đọc thẳng Script Property COACH_PINS ---------- */
function lbCoachByPin_(pin) {
  pin = String(pin == null ? '' : pin).trim();
  if (!pin) return '';
  var raw = PropertiesService.getScriptProperties().getProperty('COACH_PINS');
  var map = {};
  try { map = JSON.parse(raw || '{}') || {}; } catch (e) { map = {}; }
  for (var k in map) if (String(map[k]).trim() === pin) return String(k);
  return '';
}

/* ---------- bỏ dấu để so tên sheet / tên coach một cách khoan dung ---------- */
function lbNorm_(s) {
  s = String(s == null ? '' : s);
  if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ---------- file dữ liệu: mở 1 lần / lượt gọi ---------- */
function lbDb_() {
  if (!lbDb_._ss) lbDb_._ss = SpreadsheetApp.openById(LB_DB_ID);
  return lbDb_._ss;
}
function lbCoachSheets_() {
  var pre = lbNorm_(LB_PREFIX);
  return lbDb_().getSheets().filter(function (s) { return lbNorm_(s.getName()).indexOf(pre) === 0; });
}
/* sheet của coach; create=true → tự tạo kèm header, cột chuỗi để Sheets không tự đổi ngày */
function lbSheet_(coach, create) {
  var want = lbNorm_(LB_PREFIX + coach), hit = null;
  lbCoachSheets_().forEach(function (s) { if (!hit && lbNorm_(s.getName()) === want) hit = s; });
  if (hit && create && hit.getLastRow() === 0) lbInitSheet_(hit);   /* sheet chủ studio tạo sẵn còn trống → thêm header */
  if (hit || !create) return hit;
  var sh = lbDb_().insertSheet(LB_PREFIX + coach);
  lbInitSheet_(sh);
  return sh;
}
function lbInitSheet_(sh) {
  sh.getRange(1, 1, 1, LB_W).setValues([LB_HEAD]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 5000, 4).setNumberFormat('@');    /* id, Ghi lúc, Ngày, Khách = chuỗi */
  sh.getRange(1, 14, 5000, 1).setNumberFormat('@');   /* Chỉ số */
}

/* ---------- chuẩn hoá ngày đọc từ sheet về 'yyyy-MM-dd' (nhận cả Date lẫn chuỗi) ---------- */
function lbKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, lbDb_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);       /* M/d/yyyy (kiểu SESSION LOG) */
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return s;
}
function lbToday_() { return Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd'); }
function lbNum_(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(',', '.')); return isNaN(n) ? null : n; }

/* ---------- đọc toàn bộ sự kiện của MỌI sheet coach (khách đổi coach vẫn liền hồ sơ) ---------- */
function lbReadAll_() {
  var out = [];
  lbCoachSheets_().forEach(function (sh) {
    var n = sh.getLastRow();
    if (n < 2) return;
    var v = sh.getRange(2, 1, n - 1, LB_W).getValues();
    for (var i = 0; i < v.length; i++) {
      var r = v[i];
      if (!r[0]) continue;
      out.push({ id: String(r[0]), ts: String(r[1]), date: lbKey_(r[2]), name: String(r[3]).trim(), session: lbNum_(r[4]),
        type: String(r[5]).trim(), plan: String(r[6]).trim(), ex: String(r[7]).trim(), set: lbNum_(r[8]),
        kg: lbNum_(r[9]), rep: lbNum_(r[10]), ok: lbNum_(r[11]), main: lbNum_(r[12]),
        metric: String(r[13]).trim(), val: lbNum_(r[14]), form: lbNum_(r[15]), note: String(r[16]), coach: String(r[17]) });
    }
  });
  return out;
}

/* ---------- gom sự kiện thành snapshot cho từng khách ---------- */
function lbSnapshot_(events, names) {
  var snap = {};
  events.sort(function (a, b) { return (a.date < b.date) ? -1 : (a.date > b.date) ? 1 : (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0); });
  events.forEach(function (e) {
    if (!names[e.name]) return;
    var c = snap[e.name] || (snap[e.name] = { measures: {}, target: {}, main: '', last: {}, plans: {}, ex: {} });
    if (e.type === 'ĐO' && e.metric && e.val != null) {
      var m = c.measures[e.date] || (c.measures[e.date] = { d: e.date });
      m[e.metric] = e.val;
    } else if (e.type === 'MỤC TIÊU' && e.metric) {
      if (e.val != null) c.target[e.metric] = e.val;
      c.main = e.metric;
    } else if (e.type === 'SET' && e.ex) {
      if (e.ok === 1 && e.kg != null) c.last[e.ex] = { kg: e.kg, rep: e.rep, d: e.date };
      if (e.plan) c.plans[e.plan] = e.date;
      c.ex[e.ex] = e.date;
    } else if (e.type === 'BÀI' || e.type === 'CHECKOUT') {
      if (e.plan) c.plans[e.plan] = e.date;
    }
  });
  for (var k in snap) {
    var ms = snap[k].measures, arr = [];
    for (var d in ms) arr.push(ms[d]);
    arr.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    snap[k].measures = arr;
  }
  return snap;
}

/* ---------- thư viện bài tập: sheet "Bài tập" (Tên | Nhóm) — không có thì client dùng mặc định ---------- */
function lbLibrary_() {
  var sh = null, ss = lbDb_(), want = lbNorm_(LB_LIB);
  ss.getSheets().forEach(function (s) { if (!sh && lbNorm_(s.getName()) === want) sh = s; });
  if (!sh) return null;
  var n = sh.getLastRow();
  if (n < 2) return null;
  var v = sh.getRange(2, 1, n - 1, 2).getValues(), lib = {};
  v.forEach(function (r) {
    var name = String(r[0]).trim(), grp = String(r[1]).trim();
    if (!name || !grp) return;
    (lib[grp] = lib[grp] || []).push(name);
  });
  return lib;
}

/* ---------- MEMBERS (BA) không khoá IP — bản sao logic apiMembers_ + ngày bắt đầu/kết thúc gói nếu có cột ----------
   v2.2: thêm `kind` (cột E "Loại": 1:1 / 1:2 — app chia nhóm Chọn khách và chỉ cho ghép cặp khách 1:2),
         `pkg` (cột C "Gói"), `status` (cột W "Trạng thái"), `exp` (= end, cột Z "Ngày hết hạn").
         withDone=true → trả cả khách đã hết buổi (left ≤ 0) để app hiện nhóm "Khách đã hết gói" (vẫn xem được hồ sơ);
         mặc định (check-in) chỉ khách còn buổi như cũ. */
function lbMembers_(withDone) {
  var sh = chkSS_().getSheetByName('MEMBERS');
  var hr = memHdrRow_(sh);
  var hdr = sh.getRange(hr, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var hn = hdr.map(lbNorm_);
  var iName = hdr.indexOf('Tên'), iTotal = hdr.indexOf('Số buổi'), iDone = hdr.indexOf('Đã tập'), iLeft = hdr.indexOf('Còn lại'), iCoach = hdr.indexOf('Coach');
  var iKind = hn.indexOf('loai'), iPkg = hn.indexOf('goi'), iStatus = hn.indexOf('trang thai');
  var iStart = -1, iEnd = -1, iEndAlt = -1;
  for (var c = 0; c < hn.length; c++) {
    if (iStart < 0 && hn[c].indexOf('bat dau') >= 0) iStart = c;
    if (hn[c].indexOf('het han') >= 0) iEnd = c;                       /* Z Ngày hết hạn (nhập tay) — ưu tiên */
    if (iEnd < 0 && hn[c].indexOf('ket thuc') >= 0) iEndAlt = c;      /* Y Ngày kết thúc (công thức, trống khi đang tập) */
    if (iKind < 0 && hn[c].indexOf('loai goi') >= 0) iKind = c;       /* phòng khi đổi tên cột thành "Loại gói" */
  }
  if (iEnd < 0) iEnd = iEndAlt;
  if (iName < 0 || iLeft < 0) return { ok: false, error: 'khong_thay_cot_MEMBERS' };
  var tz = chkSS_().getSpreadsheetTimeZone();
  function dk(v) { if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd'); return lbKey_(v); }
  var vals = sh.getRange(hr + 1, 1, Math.max(1, sh.getLastRow() - hr), sh.getLastColumn()).getValues();
  var list = [];
  for (var r = 0; r < vals.length; r++) {
    var name = String(vals[r][iName] || '').trim();
    if (!name) continue;
    var left = Number(vals[r][iLeft]) || 0;
    if (left <= 0 && !withDone) continue;
    var end = iEnd >= 0 ? dk(vals[r][iEnd]) : '';
    list.push({ name: name, total: Number(vals[r][iTotal]) || 0, done: Number(vals[r][iDone]) || 0, left: Math.max(0, left),
      coach: String(vals[r][iCoach] || ''), start: iStart >= 0 ? dk(vals[r][iStart]) : '', end: end, exp: end,
      kind: iKind >= 0 ? String(vals[r][iKind] || '').trim() : '',
      pkg: iPkg >= 0 ? String(vals[r][iPkg] || '').trim() : '',
      status: iStatus >= 0 ? String(vals[r][iStatus] || '').trim() : '' });
  }
  list.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  return { ok: true, members: list };
}

/* =====================================================================
   action 'coach' — PIN → coach + khách của coach + snapshot + thư viện.
   Một lượt lấy hết để client cache; KHÔNG khoá IP (xem hồ sơ/nhập liệu
   được từ ngoài phòng).
   ===================================================================== */
function lbCoach_(p) {
  var coach = lbCoachByPin_(p && p.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  var mem = lbMembers_(true);                     /* BA: {ok, members:[{name,total,done,left,coach,start,end,exp,kind,pkg,status}]} — cả khách đã hết gói (v2.2) */
  if (!mem || !mem.ok) return { ok: false, error: (mem && mem.error) || 'members_failed' };
  var mine = [], names = {}, cn = lbNorm_(coach);
  (mem.members || []).forEach(function (m) {
    if (lbNorm_(m.coach) === cn) { mine.push(m); names[String(m.name).trim()] = 1; }
  });
  var snap = lbSnapshot_(lbReadAll_(), names);
  /* đã check-in hôm nay (bất kỳ thiết bị/kiosk nào) → checked + giờ ký, để app hiện A3.1 */
  var sg = lbSignedToday_();
  mine.forEach(function (m) { var t = sg[lbNorm_(m.name)]; if (t !== undefined) { m.checked = true; m.signed = t; } });
  return { ok: true, coach: coach, members: mine, snapshot: snap, library: lbLibrary_(), today: lbToday_(),
           server: Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm') };
}

/* SESSION LOG hôm nay → {tên chuẩn hoá: 'HH:mm'} (giờ lấy từ cột N "app HH:MM · ký: …", không có thì ''). Lỗi → {} */
function lbSignedToday_() {
  try {
    var sh = chkSS_().getSheetByName('SESSION LOG'); if (!sh) return {};
    var n = sh.getLastRow(); if (n < 5) return {};
    var v = sh.getRange(5, 2, n - 4, 13).getValues();          /* B..N */
    var tz = chkSS_().getSpreadsheetTimeZone(), today = lbToday_(), out = {};
    for (var i = 0; i < v.length; i++) {
      var d = v[i][0]; if (!d) continue;
      var k = (d instanceof Date) ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : lbKey_(d);
      if (k !== today) continue;
      var name = String(v[i][5] || '').trim(); if (!name) continue;      /* G */
      var m = String(v[i][12] || '').match(/(\d{1,2}):(\d{2})/);         /* N */
      out[lbNorm_(name)] = m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : '';
    }
    return out;
  } catch (e) { return {}; }
}

/* =====================================================================
   action 'checkin_coach' — check-in + ký PIN coach trong MỘT lượt.
   Chặn IP ngoài phòng (luật của chủ studio: chỉ check-in mới khoá IP).
   Kiểm tra khách thuộc coach TRƯỚC khi ghi để không để lại dòng treo.
   KHÔNG BAO GIỜ auto-retry lệnh này từ client.
   ===================================================================== */
function lbCheckin_(p) {
  var coach = lbCoachByPin_(p && p.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  if (!ipOk_(p)) return { ok: false, error: 'wrong_ip' };
  var name = String(p.name || '').trim();
  if (!name) return { ok: false, error: 'thieu_ten' };
  var owner = memberCoachMap_()[name];
  if (owner == null || lbNorm_(owner) !== lbNorm_(coach)) return { ok: false, error: 'khong_phai_khach_cua_ban' };
  var r = apiCheckin_(p);
  if (!r || !r.ok) return r || { ok: false, error: 'checkin_failed' };
  var s = apiSign_({ row: r.row, name: name, date: p.date || lbToday_(), pin: p.pin, ip: p.ip, apin: p.apin });
  if (!s || !s.ok) return { ok: false, error: (s && s.error) || 'sign_failed', row: r.row, member: r.member };
  /* member trả về từ apiCheckin_ được đọc TRƯỚC khi ký (Đã tập chưa cộng) → đọc lại sau khi ký */
  var me = r.member;
  try { var mem2 = lbMembers_(); if (mem2 && mem2.ok) mem2.members.forEach(function (x) { if (x.name === name) me = x; }); } catch (e) {}
  return { ok: true, row: r.row, member: me, coach: s.coach || coach, at: Utilities.formatDate(new Date(), LB_TZ, 'HH:mm') };
}

/* =====================================================================
   action 'log' — ghi batch sự kiện vào sheet của coach; id trùng bị bỏ
   qua (client được phép gửi lại thoải mái). Không khoá IP.
   events: [{id, type, date, name, session, plan, ex, set, kg, rep, ok, main, metric, val, form, note}]
   ===================================================================== */
function lbLog_(p) {
  var coach = lbCoachByPin_(p && p.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  var ev = (p && p.events) || [];
  if (!ev.length) return { ok: true, written: 0, dup: 0 };
  if (ev.length > 200) return { ok: false, error: 'qua_nhieu' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = lbSheet_(coach, true), n = sh.getLastRow(), have = {};
    if (n >= 2) sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) { if (r[0]) have[String(r[0])] = 1; });
    var now = Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm'), rows = [], dup = 0;
    ev.forEach(function (e) {
      var id = e && e.id ? String(e.id) : '';
      if (!id || have[id]) { dup++; return; }
      have[id] = 1;
      rows.push([id, now, lbKey_(e.date || lbToday_()), String(e.name || '').trim(), e.session == null ? '' : Number(e.session),
        String(e.type || ''), e.plan || '', e.ex || '', e.set == null ? '' : Number(e.set),
        e.kg == null ? '' : Number(e.kg), e.rep == null ? '' : Number(e.rep), e.ok == null ? '' : (String(e.type) === 'BÀI' ? Number(e.ok) : (e.ok ? 1 : 0)),
        e.main == null ? '' : (e.main ? 1 : 0), e.metric || '', e.val == null ? '' : Number(e.val),
        e.form == null ? '' : Number(e.form), e.note || '', coach]);
    });
    if (rows.length) sh.getRange(n + 1, 1, rows.length, LB_W).setValues(rows);
    return { ok: true, written: rows.length, dup: dup };
  } finally {
    lock.releaseLock();
  }
}

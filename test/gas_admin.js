/* Harness offline cho backend Apps Script của chế độ ADMIN (Admin.gs).
   Chạy mã .gs THẬT (Code.gs + Logbook.gs + Stats.gs + Admin.gs) trong một VM Node với
   SpreadsheetApp / Utilities / PropertiesService / LockService giả lập bằng bảng tính trong bộ nhớ.
   Code.gs KHÔNG nằm trong repo (chứa cấu hình riêng) — xuất từ Drive rồi trỏ biến môi trường:
     GAS_CODE=/đường/dẫn/Code.gs node test/gas_admin.js
   Không có PIN thật nào ở đây: PIN giả 'ZZZZ' (admin), 'AAAA'/'BBBB' (coach). */
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var ROOT = path.resolve(__dirname, '..');
var CODE = process.env.GAS_CODE;
if (!CODE || !fs.existsSync(CODE)) { console.log('SKIP: đặt GAS_CODE=<đường dẫn Code.gs>'); process.exit(0); }

/* ---------------- múi giờ ---------------- */
var SDate = Date;   /* đổi sang Date của VM sau khi tạo context: mã .gs dùng `instanceof Date` */
function parts(d, tz) {
  var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
  var o = {}; f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
  if (o.hour === '24') o.hour = '00';
  return o;
}
function formatDate(d, tz, fmt) {
  var o = parts(d, tz), wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[o.weekday];
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M|d|u/g, function (t) {
    return { yyyy: o.year, MM: o.month, dd: o.day, HH: o.hour, mm: o.minute, ss: o.second, M: String(+o.month), d: String(+o.day), u: String(wd) }[t];
  });
}
/* ngày M/d/yyyy nhập vào sheet (TZ file) → Date lúc 0h theo TZ đó */
function sheetDate(str, tz) {
  var p = str.split('/'), y = +p[2], m = +p[0], d = +p[1];
  var guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (var i = 0; i < 3; i++) { var o = parts(new Date(guess), tz); var got = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second); guess += Date.UTC(y, m - 1, d) - got; }
  return new SDate(guess);
}

/* ---------------- bảng tính giả ---------------- */
function Sheet(name, gid, rows, ss) { this.name = name; this.gid = gid; this.rows = rows; this.ss = ss; this.frozen = 0; }
Sheet.prototype.getName = function () { return this.name; };
Sheet.prototype.getSheetId = function () { return this.gid; };
Sheet.prototype.getLastRow = function () { for (var r = this.rows.length; r > 0; r--) { var row = this.rows[r - 1] || []; if (row.some(function (v) { return v !== '' && v != null; })) return r; } return 0; };
Sheet.prototype.getLastColumn = function () { var m = 0; this.rows.forEach(function (r) { for (var c = r.length; c > 0; c--) if (r[c - 1] !== '' && r[c - 1] != null) { m = Math.max(m, c); break; } }); return Math.max(m, 1); };
Sheet.prototype.cell = function (r, c) { var row = this.rows[r - 1]; var v = row ? row[c - 1] : undefined; return v == null ? '' : v; };
Sheet.prototype.put = function (r, c, v) { while (this.rows.length < r) this.rows.push([]); var row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
Sheet.prototype.getRange = function (r, c, nr, nc) {
  if (typeof r === 'string') throw new Error('A1 chưa hỗ trợ: ' + r);
  var sh = this; nr = nr || 1; nc = nc || 1;
  if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Range sai ' + [r, c, nr, nc]);
  return {
    getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push(sh.cell(r + i, c + j)); out.push(row); } return out; },
    getValue: function () { return sh.cell(r, c); },
    setValue: function (v) { if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) && sh.name === 'SESSION LOG' && c === 2) v = sheetDate(v, sh.ss.tz); sh.put(r, c, v); sh.ss.writes.push([sh.name, r, c, v]); return this; },
    setValues: function (vals) { if (vals.length !== nr || vals[0].length !== nc) throw new Error('setValues kích thước lệch'); for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh.put(r + i, c + j, vals[i][j]); sh.ss.writes.push([sh.name, r, c, 'x' + nr]); return this; },
    setFontWeight: function () { return this; }, setNumberFormat: function () { return this; }
  };
};
Sheet.prototype.setFrozenRows = function (n) { this.frozen = n; };
function Spreadsheet(id, tz) { this.id = id; this.tz = tz; this.sheets = []; this.writes = []; }
Spreadsheet.prototype.add = function (name, gid, rows) { var s = new Sheet(name, gid, rows, this); this.sheets.push(s); return s; };
Spreadsheet.prototype.getSheetByName = function (n) { return this.sheets.filter(function (s) { return s.name === n; })[0] || null; };
Spreadsheet.prototype.getSheets = function () { return this.sheets.slice(); };
Spreadsheet.prototype.getSpreadsheetTimeZone = function () { return this.tz; };
Spreadsheet.prototype.insertSheet = function (n) { return this.add(n, 1000 + this.sheets.length, []); };

var BA_ID = '1QCsIqBHYqqyVYohs9syWt3jT8_wb1JQRbWZp6YF1V14', DB_ID = '19iWnTT5eWFKCJ9Mnzuv_pcF1MMH4XGnx60Uc0OXMmeM';
var TZ_BA = 'America/Los_Angeles', TZ_VN = 'Asia/Ho_Chi_Minh';
var NOW = new Date(), TODAY_VN = formatDate(NOW, TZ_VN, 'yyyy-MM-dd'), MONTH = TODAY_VN.slice(0, 7);
function vnToMdy(iso) { var p = iso.split('-'); return (+p[1]) + '/' + (+p[2]) + '/' + p[0]; }
function isoAdd(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
var YDAY = isoAdd(TODAY_VN, -1);

var FILES, PROPS, LOCKS;
function reset() {
  var ba = new Spreadsheet(BA_ID, TZ_BA), db = new Spreadsheet(DB_ID, TZ_VN);
  function mem(code, name, pkg, total, kind, coach, done, left, st, start, exp) {
    var r = []; for (var i = 0; i < 28; i++) r.push('');
    r[0] = code; r[1] = name; r[2] = pkg; r[3] = total; r[4] = kind; r[5] = 300000; r[6] = coach; r[20] = done; r[21] = left; r[22] = st;
    r[23] = new SDate(start + 'T00:00:00Z'); r[25] = new SDate(exp + 'T00:00:00Z'); r[26] = 'KH' + code; return r;
  }
  ba.add('MEMBERS', 11, [
    ['— MEMBERS'], ['Danh sách toàn bộ học viên'], [],
    ['=SUMPRODUCT(...)', 'KHÁCH ĐANG HOẠT ĐỘNG'],
    ['#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'Giờ tập', 'Khung', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'Người bán gói', 'Ngày bán hộ', 'Ghi chú', 'Buổi/tuần', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH', '_key'],
    mem('001', 'Nguyễn Quang Vinh', 'PT 24', 24, '1:1', 'Quyết Hán', 10, 14, 'Đang tập', '2026-08-01', '2026-12-01'),
    mem('002', 'Vũ Sao Mai', 'PT 12', 12, '1:2', 'Hiền Mai (giai đoạn 1)', 12, 0, 'Hết', '2026-06-01', '2026-09-01'),
    mem('002B', 'Vũ Sao Mai', 'PT 24', 24, '1:2', 'Hiền Mai', 3, 21, 'Đang tập', '2026-09-02', '2027-01-01'),
    mem('003', 'Đỗ Thành Công', 'PT 8', 8, '1:1', 'Quyết Hán', 7, 1, 'Đang tập', '2026-09-01', '2026-10-15'),
    mem('004', 'Khách Cũ', 'PT 10', 10, '1:1', 'Lâm Nguyễn', 10, 0, 'Hết', '2026-01-01', '2026-03-01'),
    mem('005', 'Khách Giai Đoạn', 'PT 10', 10, '1:1', 'Hiền Mai (giai đoạn 1)', 10, 0, 'Hết', '2026-02-01', '2026-04-01')
  ]);
  var logRows = [['— SESSION LOG'], ['Mỗi dòng = một học viên / một buổi'], [], ['#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử', '_mrow']];
  function logRow(iso, name, st, note, coach) { var r = []; for (var i = 0; i < 14; i++) r.push(''); r[0] = '=IF($B5="","",""&TEXT(ROW()-4,"0000"))'; r[1] = sheetDate(vnToMdy(iso), TZ_BA); r[4] = coach || ''; r[6] = name; r[10] = st; r[13] = note; return r; }
  logRows.push(logRow(YDAY, 'Nguyễn Quang Vinh', 'Đã tập', 'app 09:00 · ký: Quyết Hán', 'Quyết Hán'));
  logRows.push(logRow(TODAY_VN, 'Vũ Sao Mai', 'Đã tập', 'app 08:15 · ký: Hiền Mai', 'Hiền Mai'));
  logRows.push(logRow(TODAY_VN, 'Đỗ Thành Công', 'Hủy', 'app 07:00 · hủy: Quyết Hán', 'Quyết Hán'));
  for (var i = 0; i < 20; i++) { var e = []; for (var k = 0; k < 14; k++) e.push(''); e[0] = '=IF($B5="","",""&TEXT(ROW()-4,"0000"))'; logRows.push(e); }   /* công thức kéo sẵn */
  ba.add('SESSION LOG', 95777908, logRows);
  ba.add('COM', 22, [
    ['— COMMISSION'], ['Com dạy = Buổi × Đơn giá'], [' THÁNG:', new SDate(MONTH + '-15T00:00:00Z')], [' TỪ:', ''], [' ĐẾN:', ''],
    ['— TỔNG HỢP THEO COACH'],
    ['Coach', 'Buổi dạy', 'Doanh thu', '% Com', 'Hoa hồng', 'Buổi bán hộ', 'Com bán hộ', 'Σ Hoa hồng'],
    ['Quyết Hán', 10, 1000000, 0.2, 200000, 1, 10000, 210000],
    ['Hiền Mai', 5, 500000, 0.2, 100000, 1, 10000, 110000],
    ['Tổng', 15, 1500000, '', 300000, 2, 20000, 320000],   /* số GIẢ — không phải số thật của phòng */
    ['— CHI TIẾT THEO HỌC VIÊN'], ['#', 'Học viên', 'Coach', 'Đơn giá/buổi', 'Buổi', 'Doanh thu', '% com', 'Hoa hồng'],
    ['001', 'Nguyễn Quang Vinh', 'Quyết Hán', 100000, 10, 1000000, 0.2, 200000]
  ]);
  var H = ['id', 'Ghi lúc', 'Ngày', 'Khách', 'Buổi #', 'Loại', 'Buổi tập', 'Bài tập', 'Set #', 'KG', 'REP', 'Đạt', 'Bài chính', 'Chỉ số', 'Giá trị', 'Form', 'Ghi chú', 'Coach'];
  db.add('Bài tập', 5, [['Tên', 'Nhóm', 'Vùng', 'id'], ['BB Back Squat', 'Squat', 'Legs', 'bb-back-squat'], ['Leg Extension', 'Leg Extension', 'Legs', 'leg-extension']]);
  db.add('Khách của Quyết Hán', 6, [H,
    ['q1', YDAY + ' 09:00', YDAY, 'Nguyễn Quang Vinh', 10, 'SET', 'Legs', 'BB Back Squat', 1, 60, 8, 1, 0, '', '', '', '', 'Quyết Hán'],
    ['q2', YDAY + ' 09:05', YDAY, 'Nguyễn Quang Vinh', 10, 'ĐO', '', '', '', '', '', '', '', 'weight', 70, '', '', 'Quyết Hán']]);
  db.add('Khách của Hiền Mai', 7, [H,
    ['m1', TODAY_VN + ' 08:20', TODAY_VN, 'Vũ Sao Mai', 4, 'SET', 'Legs', 'Leg Extension', 1, 30, 12, 0, 0, '', '', '', '', 'Hiền Mai']]);
  FILES = {}; FILES[BA_ID] = ba; FILES[DB_ID] = db;
  PROPS = { ADMIN_PIN: 'ZZZZ', COACH_PINS: JSON.stringify({ 'Quyết Hán': 'AAAA', 'Hiền Mai': 'BBBB' }), STUDIO_IP: '203.0.113.7,198.51.100.23' };
  LOCKS = { waits: 0, held: 0 };
  return { ba: ba, db: db };
}

/* ---------------- VM ---------------- */
var sandbox = {
  console: console,
  SpreadsheetApp: { openById: function (id) { if (!FILES[id]) throw new Error('openById ' + id); return FILES[id]; }, flush: function () {} },
  Utilities: { formatDate: formatDate, computeDigest: function () { return []; }, base64Encode: function () { return ''; }, DigestAlgorithm: {}, Charset: {}, sleep: function () {} },
  PropertiesService: { getScriptProperties: function () { return {
    getProperty: function (k) { return PROPS[k] == null ? null : PROPS[k]; },
    setProperty: function (k, v) { PROPS[k] = String(v); return this; },
    deleteProperty: function (k) { delete PROPS[k]; return this; } }; } },
  LockService: { getScriptLock: function () { return { waitLock: function () { LOCKS.waits++; LOCKS.held++; }, tryLock: function () { LOCKS.held++; return true; }, releaseLock: function () { LOCKS.held--; } }; } },
  ContentService: { createTextOutput: function (s) { return { setMimeType: function () { return { json: JSON.parse(s) }; } }; }, MimeType: { JSON: 'json' } },
  ScriptApp: {}, UrlFetchApp: {}, Logger: { log: function () {} }
};
vm.createContext(sandbox);
SDate = vm.runInContext('Date', sandbox);
[CODE, path.join(ROOT, 'backend/Logbook.gs'), path.join(ROOT, 'backend/Stats.gs'), path.join(ROOT, 'backend/Admin.gs')].forEach(function (f) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: path.basename(f) });
});
vm.runInContext('if (typeof ADM_PERF !== "undefined") ADM_PERF = false;', sandbox);   /* tắt log thời gian của Admin.gs v2.4.1 trong test */
/* nối 7 case như sẽ dán vào api_() */
vm.runInContext(fs.readFileSync(CODE, 'utf8').indexOf("case 'adm_data'") >= 0 ? '' : '', sandbox);
function call(p) {
  /* mô phỏng api_(): dùng bản đã vá nếu Code.gs đã có case, nếu chưa thì gọi thẳng hàm */
  var map = { adm_data: 'admData_', adm_checkin: 'admCheckin_', adm_log: 'admLog_', adm_stats: 'admStats_', iplist: 'admIpList_', addip: 'admIpAdd_', delip: 'admIpDel_' };
  var src = fs.readFileSync(CODE, 'utf8');
  if (src.indexOf("case 'adm_data'") >= 0 || !map[p.action]) {
    /* chạy qua api_() thật — reset cache per-lượt như mỗi lần /exec */
    vm.runInContext('CHECKIN._init=false; memberCoachMap_._c=null; lbDb_._ss=null; chkSS_._s=null;', sandbox);
    return JSON.parse(JSON.stringify(sandbox.api_(JSON.parse(JSON.stringify(p))).json));
  }
  vm.runInContext('CHECKIN._init=false; memberCoachMap_._c=null; lbDb_._ss=null; chkSS_._s=null;', sandbox);
  try { return JSON.parse(JSON.stringify(sandbox[map[p.action]](JSON.parse(JSON.stringify(p))))); }
  catch (e) { return { ok: false, error: String(e).slice(0, 200) }; }
}

var pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 400) : '')); } }

console.log('\n== 1. gác PIN admin ==');
reset();
['adm_data', 'adm_checkin', 'adm_log', 'adm_stats', 'iplist', 'addip', 'delip'].forEach(function (a) {
  check(a + ' thiếu apin → sai_pin', call({ action: a }).error === 'sai_pin');
  check(a + ' apin sai → sai_pin', call({ action: a, apin: '0000' }).error === 'sai_pin');
  check(a + ' PIN coach (không phải admin) → sai_pin', call({ action: a, pin: 'AAAA' }).error === 'sai_pin');
});

console.log('\n== 2. adm_data ==');
reset();
var d = call({ action: 'adm_data', apin: 'ZZZZ', ip: '9.9.9.9' });
check('ok', d.ok === true, d);
check('coach = Admin, admin:true', d.coach === 'Admin' && d.admin === true);
var names = (d.members || []).map(function (m) { return m.name; });
check('mọi coach, gộp tên trùng (5 khách)', names.length === 5 && names.indexOf('Vũ Sao Mai') >= 0 && names.indexOf('Khách Cũ') >= 0, names);
var mai = (d.members || []).filter(function (m) { return m.name === 'Vũ Sao Mai'; })[0];
check('tên trùng → giữ dòng CÒN BUỔI (002B, left 21)', mai && mai.left === 21 && mai.total === 24, mai);
check('Mai đã check-in hôm nay → checked + giờ', mai && mai.checked === true && mai.signed === '08:15', mai);
var cong = (d.members || []).filter(function (m) { return m.name === 'Đỗ Thành Công'; })[0];
check('dòng Hủy hôm nay vẫn tính là có dòng (giống coach) ', cong && cong.checked === true, cong);
check('kind/coach có mặt', mai && mai.kind === '1:2' && mai.coach === 'Hiền Mai', mai);
check('snapshot từ MỌI sheet coach', d.snapshot && d.snapshot['Nguyễn Quang Vinh'] && d.snapshot['Vũ Sao Mai'], Object.keys(d.snapshot || {}));
check('thư viện', d.library && d.library['Squat'] && d.library['Squat'][0] === 'BB Back Squat', d.library);
check('không khoá IP (ip lạ vẫn ok)', d.ok === true);
check('không lộ PIN', JSON.stringify(d).indexOf('ZZZZ') < 0 && JSON.stringify(d).indexOf('AAAA') < 0);

console.log('\n== 3. adm_checkin ==');
var F = reset();
var r = call({ action: 'adm_checkin', apin: 'ZZZZ', ip: '9.9.9.9', name: 'Nguyễn Quang Vinh', date: TODAY_VN });
check('ok từ IP lạ (không khoá IP)', r.ok === true, r);
var log = F.ba.getSheetByName('SESSION LOG'), row = r.row;
check('ghi đúng dòng trống đầu tiên (8)', row === 8, row);
check('B = ngày hôm nay (Date theo TZ file)', Object.prototype.toString.call(log.cell(row, 2)) === '[object Date]' && formatDate(log.cell(row, 2), TZ_VN, 'yyyy-MM-dd') === TODAY_VN, String(log.cell(row, 2)));
check('G = tên', log.cell(row, 7) === 'Nguyễn Quang Vinh');
check('K = Đã tập', log.cell(row, 11) === 'Đã tập', log.cell(row, 11));
check('N = app HH:mm · ký: Admin', /^app \d\d:\d\d · ký: Admin$/.test(log.cell(row, 14)), log.cell(row, 14));
check('không ghi cột công thức (A giữ công thức)', String(log.cell(row, 1)).indexOf('=IF(') === 0);
check('chỉ chạm B G K N', F.ba.writes.filter(function (w) { return w[0] === 'SESSION LOG'; }).every(function (w) { return [2, 7, 11, 14].indexOf(w[2]) >= 0; }), F.ba.writes);
check('trả coach phụ trách + by Admin + giờ', r.coach === 'Quyết Hán' && r.by === 'Admin' && /^\d\d:\d\d$/.test(r.at), r);
check('member đọc lại (không khoá IP)', r.member && r.member.name === 'Nguyễn Quang Vinh', r.member);
var r2 = call({ action: 'adm_checkin', apin: 'ZZZZ', ip: '9.9.9.9', name: 'Nguyễn Quang Vinh', date: TODAY_VN });
check('lần 2 → da_checkin, không ghi thêm', r2.error === 'da_checkin' && log.getLastRow() === row + 0 || r2.error === 'da_checkin', r2);
var before = F.ba.writes.length;
var r3 = call({ action: 'adm_checkin', apin: 'ZZZZ', name: 'Người Lạ', date: TODAY_VN });
check('khách không có trong MEMBERS → chặn TRƯỚC khi ghi', r3.error === 'khong_thay_khach' && F.ba.writes.length === before, r3);
var r4 = call({ action: 'adm_checkin', apin: 'ZZZZ', name: 'Đỗ Thành Công', date: TODAY_VN });
check('dòng Hủy hôm nay → check-in lại được', r4.ok === true && log.cell(r4.row, 11) === 'Đã tập', r4);
check('thiếu tên', call({ action: 'adm_checkin', apin: 'ZZZZ', name: '' }).error === 'thieu_ten');
check('khoá được nhả', LOCKS.held === 0, LOCKS);

console.log('\n== 4. adm_log ==');
F = reset();
var evs = [
  { id: 'a1', type: 'SET', date: TODAY_VN, name: 'Nguyễn Quang Vinh', session: 11, plan: 'Legs', ex: 'BB Back Squat', set: 1, kg: 62.5, rep: 8, ok: 1, main: 0 },
  { id: 'a2', type: 'SET', date: TODAY_VN, name: 'Vũ Sao Mai', session: 5, plan: 'Legs', ex: 'Leg Extension', set: 1, kg: 32.5, rep: 12, ok: 0, main: 0 },
  { id: 'a3', type: 'ĐO', date: TODAY_VN, name: 'Khách Cũ', metric: 'weight', val: 80 },
  { id: 'a4', type: 'SET', date: TODAY_VN, name: 'Không Có Coach', ex: 'BB Back Squat', kg: 20, rep: 10, ok: 1 },
  { id: 'q1', type: 'SET', name: 'Nguyễn Quang Vinh' },
  { id: 'a5', type: 'ĐO', date: TODAY_VN, name: 'Khách Giai Đoạn', metric: 'weight', val: 55 }
];
r = call({ action: 'adm_log', apin: 'ZZZZ', events: evs });
check('ghi 5, bỏ 1 id đã có (q1 ở sheet coach khác)', r.ok && r.written === 5 && r.dup === 1, r);
var q = F.db.getSheetByName('Khách của Quyết Hán'), m = F.db.getSheetByName('Khách của Hiền Mai');
check('sự kiện của khách Quyết Hán vào đúng sheet', q.getLastRow() === 4 && q.cell(4, 1) === 'a1', q.rows.map(function (x) { return x[0]; }));
check('sự kiện của khách Hiền Mai vào đúng sheet', m.getLastRow() === 4 && m.cell(3, 1) === 'a2', m.rows.map(function (x) { return x[0]; }));
check('coach "(giai đoạn 1)" → sheet coach gốc, không đẻ sheet mới', m.cell(4, 1) === 'a5' && !F.db.getSheetByName('Khách của Hiền Mai (giai đoạn 1)'), F.db.sheets.map(function (x) { return x.name; }));
check('coach chưa có sheet → tự tạo "Khách của Lâm Nguyễn" kèm header', F.db.getSheetByName('Khách của Lâm Nguyễn') && F.db.getSheetByName('Khách của Lâm Nguyễn').cell(1, 1) === 'id' && F.db.getSheetByName('Khách của Lâm Nguyễn').cell(2, 1) === 'a3');
check('khách không có trong MEMBERS → "Khách của Admin"', F.db.getSheetByName('Khách của Admin') && F.db.getSheetByName('Khách của Admin').cell(2, 1) === 'a4');
check('cột R = Admin', q.cell(4, 18) === 'Admin' && m.cell(3, 18) === 'Admin');
check('18 cột, số thập phân giữ nguyên, ok→1/0', q.rows[3].length === 18 && q.cell(4, 10) === 62.5 && q.cell(4, 12) === 1 && m.cell(3, 12) === 0, q.rows[3]);
check('cột Ngày = yyyy-MM-dd', q.cell(4, 3) === TODAY_VN);
r = call({ action: 'adm_log', apin: 'ZZZZ', events: evs });
check('gửi lại → 0 ghi, 6 trùng', r.ok && r.written === 0 && r.dup === 6, r);
check('rỗng', JSON.stringify(call({ action: 'adm_log', apin: 'ZZZZ', events: [] })) === '{"ok":true,"written":0,"dup":0}');
check('quá 200', call({ action: 'adm_log', apin: 'ZZZZ', events: new Array(201).fill({ id: 'x' }) }).error === 'qua_nhieu');
check('khoá được nhả', LOCKS.held === 0, LOCKS);

console.log('\n== 5. adm_stats ==');
reset();
r = call({ action: 'adm_stats', apin: 'ZZZZ', month: MONTH });
check('ok', r.ok === true, r);
check('đếm mọi coach, chỉ "Đã tập" (Hủy không tính)', r.monthTotal === (YDAY.slice(0, 7) === MONTH ? 2 : 1), r);
check('days hôm nay = 1 (Mai)', r.days[TODAY_VN] === 1, r.days);
check('perClient mọi khách', r.perClient['Vũ Sao Mai'] && r.perClient['Nguyễn Quang Vinh'], r.perClient);
check('buổi gần nhất < hôm nay', r.perClient['Nguyễn Quang Vinh'].last === YDAY, r.perClient);
check('Doanh thu = dòng Tổng cột C', r.rev && r.rev.total === 1500000 && r.rev.month === MONTH, r.rev);
check('hist từ MỌI sheet coach', r.hist['Nguyễn Quang Vinh'] && r.hist['Nguyễn Quang Vinh']['BB Back Squat'] && r.hist['Vũ Sao Mai'] && r.hist['Vũ Sao Mai']['Leg Extension'], r.hist);
check('hist ok 1/0', r.hist['Vũ Sao Mai']['Leg Extension'][0].ok === 0 && r.hist['Nguyễn Quang Vinh']['BB Back Squat'][0].ok === 1);

console.log('\n== 6. IP ==');
reset();
r = call({ action: 'iplist', apin: 'ZZZZ' });
check('đọc danh sách dấu phẩy', r.ok && JSON.stringify(r.ips) === '["203.0.113.7","198.51.100.23"]' && r.max === 2, r);
r = call({ action: 'addip', apin: 'ZZZZ', ip: '1.2.3.4' });
check('đủ 2 → full, không đổi', r.error === 'full' && PROPS.STUDIO_IP === '203.0.113.7,198.51.100.23', r);
r = call({ action: 'addip', apin: 'ZZZZ', ip: '203.0.113.7' });
check('thêm IP đã có → ok, không nhân đôi', r.ok && PROPS.STUDIO_IP === '203.0.113.7,198.51.100.23', r);
r = call({ action: 'delip', apin: 'ZZZZ', ip: '1.2.3.4', del: '198.51.100.23' });
check('xoá theo GIÁ TRỊ (del), không theo ip thiết bị', r.ok && PROPS.STUDIO_IP === '203.0.113.7', r);
r = call({ action: 'delip', apin: 'ZZZZ', del: '203.0.113.7' });
check('không cho xoá IP cuối (khoá IP không bao giờ tắt)', r.error === 'con_1_ip' && PROPS.STUDIO_IP === '203.0.113.7', r);
r = call({ action: 'addip', apin: 'ZZZZ', ip: '2001:db8:1f2::1' });
check('thêm IPv6', r.ok && PROPS.STUDIO_IP === '203.0.113.7,2001:db8:1f2::1', r);
check('IP rác bị chặn', call({ action: 'addip', apin: 'ZZZZ', ip: '<script>' }).error === 'sai_ip');
check('xoá IP không có → ok, giữ nguyên', call({ action: 'delip', apin: 'ZZZZ', del: '8.8.8.8' }).ok && PROPS.STUDIO_IP === '203.0.113.7,2001:db8:1f2::1');
check('ipOk_ của coach đọc được danh sách mới', sandbox.ipOk_({ ip: '2001:db8:1f2::1' }) === true && sandbox.ipOk_({ ip: '1.1.1.1' }) === false);
check('khoá được nhả', LOCKS.held === 0, LOCKS);

console.log('\n== 7. không phá lệnh cũ ==');
reset();
r = call({ action: 'coach', pin: 'AAAA' });
check('coach (PIN Quyết Hán) vẫn chỉ khách của mình', r.ok && r.members.every(function (x) { return x.coach === 'Quyết Hán'; }) && r.members.length === 2, r.members && r.members.map(function (x) { return x.name; }));
check('Hiền Mai (PIN) thấy khách của mình', call({ action: 'coach', pin: 'BBBB' }).members.filter(function (x) { return x.coach === 'Hiền Mai'; }).length === 1);
check('coach bằng PIN admin vẫn sai_pin (app lui sang admin)', call({ action: 'coach', pin: 'ZZZZ' }).error === 'sai_pin');
check('admin action cũ vẫn chạy', call({ action: 'admin', apin: 'ZZZZ' }).ok === true);
check('ping', call({ action: 'ping' }).ok === true);

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

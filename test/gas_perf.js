/* So sánh Admin.gs CŨ (v2.4.0) và MỚI (v2.4.1) trên bảng tính giả CỠ THẬT:
   MEMBERS ~60 dòng dữ liệu + công thức kéo tới dòng ~1.013; SESSION LOG ~850 dòng + công thức tới dòng 5.000;
   2 sheet "Khách của …" ~1.000 sự kiện mỗi sheet.
   Kiểm: (1) kết quả adm_data / adm_stats GIỐNG HỆT nhau; (2) adm_checkin ghi cùng dòng, cùng 4 ô;
         (3) số ô đọc (getValues) giảm bao nhiêu — thước đo tốc độ trên Apps Script (đọc ô là phần tốn nhất).
   Chạy: GAS_CODE=<Code.gs> OLD_ADMIN=<Admin.gs cũ> node test/gas_perf.js
   Chỉ PIN giả 'ZZZZ'; tên khách/số liệu đều giả. */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.resolve(__dirname, '..');
var CODE = process.env.GAS_CODE, OLD = process.env.OLD_ADMIN;
if (!CODE || !fs.existsSync(CODE) || !OLD || !fs.existsSync(OLD)) { console.log('SKIP: cần GAS_CODE và OLD_ADMIN'); process.exit(0); }

function parts(d, tz) {
  var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
  var o = {}; f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); if (o.hour === '24') o.hour = '00'; return o;
}
function formatDate(d, tz, fmt) {
  var o = parts(d, tz), wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[o.weekday];
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M|d|u/g, function (t) { return { yyyy: o.year, MM: o.month, dd: o.day, HH: o.hour, mm: o.minute, ss: o.second, M: String(+o.month), d: String(+o.day), u: String(wd) }[t]; });
}
var TZ_BA = 'America/Los_Angeles', TZ_VN = 'Asia/Ho_Chi_Minh';
var NOW = new Date(), TODAY = formatDate(NOW, TZ_VN, 'yyyy-MM-dd');
function isoAdd(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mdy(iso) { var p = iso.split('-'); return (+p[1]) + '/' + (+p[2]) + '/' + p[0]; }

/* ---- một "thế giới" = một VM + bảng tính giả + bộ đếm ô đọc ---- */
function World(adminFile) {
  var W = this; W.cells = 0; W.calls = 0;
  var sandbox = { console: { log: function () {} } };
  vm.createContext(sandbox);
  var SDate = vm.runInContext('Date', sandbox);
  function sheetDate(str, tz) { var p = str.split('/'), y = +p[2], m = +p[0], d = +p[1], g = Date.UTC(y, m - 1, d); for (var i = 0; i < 3; i++) { var o = parts(new Date(g), tz); g += Date.UTC(y, m - 1, d) - Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second); } return new SDate(g); }
  function Sheet(name, gid, rows, ss) { this.name = name; this.gid = gid; this.rows = rows; this.ss = ss; }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getSheetId = function () { return this.gid; };
  Sheet.prototype.getLastRow = function () { for (var r = this.rows.length; r > 0; r--) { var row = this.rows[r - 1] || []; for (var c = 0; c < row.length; c++) if (row[c] !== '' && row[c] != null) return r; } return 0; };
  Sheet.prototype.getLastColumn = function () { var m = 0; this.rows.forEach(function (r) { for (var c = r.length; c > 0; c--) if (r[c - 1] !== '' && r[c - 1] != null) { m = Math.max(m, c); break; } }); return Math.max(m, 1); };
  Sheet.prototype.getMaxRows = function () { return Math.max(this.rows.length, 1000); };
  Sheet.prototype.cell = function (r, c) { var row = this.rows[r - 1]; var v = row ? row[c - 1] : undefined; return v == null ? '' : v; };
  Sheet.prototype.put = function (r, c, v) { while (this.rows.length < r) this.rows.push([]); var row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    var sh = this; nr = nr || 1; nc = nc || 1;
    return {
      getValues: function () { W.cells += nr * nc; W.calls++; var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { var v = sh.cell(r + i, c + j); row.push(typeof v === 'string' && v.charAt(0) === '=' ? '' : v); } out.push(row); } return out; },
      getValue: function () { W.cells++; W.calls++; var v = sh.cell(r, c); return typeof v === 'string' && v.charAt(0) === '=' ? '' : v; },
      setValue: function (v) { if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) && sh.name === 'SESSION LOG' && c === 2) v = sheetDate(v, sh.ss.tz); sh.put(r, c, v); sh.ss.writes.push([sh.name, r, c, v]); return this; },
      setValues: function (vals) { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh.put(r + i, c + j, vals[i][j]); sh.ss.writes.push([sh.name, r, c, 'x' + nr]); return this; },
      setFontWeight: function () { return this; }, setNumberFormat: function () { return this; }
    };
  };
  Sheet.prototype.setFrozenRows = function () {};
  function SS(id, tz) { this.id = id; this.tz = tz; this.sheets = []; this.writes = []; }
  SS.prototype.add = function (n, gid, rows) { var s = new Sheet(n, gid, rows, this); this.sheets.push(s); return s; };
  SS.prototype.getSheetByName = function (n) { return this.sheets.filter(function (s) { return s.name === n; })[0] || null; };
  SS.prototype.getSheets = function () { return this.sheets.slice(); };
  SS.prototype.getSpreadsheetTimeZone = function () { return this.tz; };
  SS.prototype.insertSheet = function (n) { return this.add(n, 1000 + this.sheets.length, []); };

  var BA_ID = '1QCsIqBHYqqyVYohs9syWt3jT8_wb1JQRbWZp6YF1V14', DB_ID = '19iWnTT5eWFKCJ9Mnzuv_pcF1MMH4XGnx60Uc0OXMmeM';
  var ba = new SS(BA_ID, TZ_BA), db = new SS(DB_ID, TZ_VN); W.ba = ba; W.db = db;
  var COACHES = ['Quyết Hán', 'Hiền Mai', 'Khải Phan', 'Lâm Nguyễn', 'Bích Ngọc'];
  /* MEMBERS: 63 dòng dữ liệu (vài tên trùng = gia hạn gói) + công thức kéo tới dòng 1013 */
  var mem = [['— MEMBERS'], ['Danh sách'], [], ['=SUMPRODUCT(...)', 'KHÁCH ĐANG HOẠT ĐỘNG'],
    ['#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'Giờ tập', 'Khung', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'Người bán gói', 'Ngày bán hộ', 'Ghi chú', 'Buổi/tuần', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH', '_key']];
  W.names = [];
  for (var i = 0; i < 63; i++) {
    var nm = 'Khách Thử ' + ((i % 58) + 1), total = [8, 12, 24][i % 3], done = (i * 7) % (total + 1), coach = COACHES[i % 5] + (i === 3 ? ' (giai đoạn 1)' : '');
    var r = []; for (var c = 0; c < 28; c++) r.push('');
    r[0] = String(i + 1); r[1] = nm; r[2] = 'PT ' + total; r[3] = total; r[4] = i % 4 === 0 ? '1:2' : '1:1'; r[5] = 300000; r[6] = coach;
    r[20] = done; r[21] = total - done; r[22] = total - done > 0 ? 'Đang tập' : 'Hết';
    r[23] = new SDate(isoAdd(TODAY, -90 + i) + 'T00:00:00Z'); r[25] = new SDate(isoAdd(TODAY, 60 + i) + 'T00:00:00Z'); r[26] = 'KH' + i;
    mem.push(r); if (W.names.indexOf(nm) < 0) W.names.push(nm);
  }
  while (mem.length < 1013) { var f = []; for (var c2 = 0; c2 < 28; c2++) f.push(''); f[20] = '=COUNTIFS(...)'; f[21] = '=D0-U0'; mem.push(f); }
  ba.add('MEMBERS', 11, mem);
  /* SESSION LOG: 846 dòng dữ liệu (60 ngày gần nhất, vài dòng Hủy, 1 dòng trống giữa chừng) + công thức tới dòng 5000 */
  var log = [['— SESSION LOG'], ['Mỗi dòng = một học viên / một buổi'], [], ['#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử']];
  for (var k = 0; k < 846; k++) {
    var row = []; for (var c3 = 0; c3 < 14; c3++) row.push('');
    row[0] = '=IF($B' + (k + 5) + '="","",...)';
    var dayOff = -Math.floor((845 - k) / 14);                       /* ~14 buổi/ngày, cuối bảng là hôm nay */
    if (k !== 400) {                                                /* dòng 405 bỏ trống (bị xoá tay) */
      row[1] = sheetDate(mdy(isoAdd(TODAY, dayOff)), TZ_BA); row[4] = '=VLOOKUP(...)';
      row[6] = W.names[k % W.names.length]; row[10] = (k % 37 === 0) ? 'Hủy' : 'Đã tập';
      row[13] = 'app ' + ('0' + (7 + k % 12)).slice(-2) + ':' + ('0' + (k % 60)).slice(-2) + ' · ký: ' + COACHES[k % 5];
    }
    log.push(row);
  }
  while (log.length < 5000) { var e = []; for (var c4 = 0; c4 < 14; c4++) e.push(''); e[0] = '=IF($B' + (log.length + 1) + '="","",...)'; e[4] = '=VLOOKUP(...)'; log.push(e); }
  ba.add('SESSION LOG', 95777908, log);
  ba.add('COM', 22, [['— COMMISSION'], [''], [' THÁNG:', new SDate(TODAY.slice(0, 7) + '-15T00:00:00Z')], [], [], ['— TỔNG HỢP THEO COACH'],
    ['Coach', 'Buổi dạy', 'Doanh thu', '% Com', 'Hoa hồng', 'Buổi bán hộ', 'Com bán hộ', 'Σ Hoa hồng'], ['Quyết Hán', 10, 1000000, 0.2, 200000, 1, 10000, 210000], ['Tổng', 10, 1000000, '', 200000, 1, 10000, 210000]]);
  var H = ['id', 'Ghi lúc', 'Ngày', 'Khách', 'Buổi #', 'Loại', 'Buổi tập', 'Bài tập', 'Set #', 'KG', 'REP', 'Đạt', 'Bài chính', 'Chỉ số', 'Giá trị', 'Form', 'Ghi chú', 'Coach'];
  db.add('Bài tập', 5, [['Tên', 'Nhóm', 'Vùng', 'id'], ['BB Back Squat', 'Squat', 'Legs', 'a'], ['Leg Extension', 'Leg Extension', 'Legs', 'b']]);
  ['Quyết Hán', 'Hiền Mai'].forEach(function (co, ci) {
    var rows = [H];
    for (var x = 0; x < 1000; x++) {
      var dd = isoAdd(TODAY, -Math.floor((999 - x) / 30));
      var t = x % 10 === 0 ? 'ĐO' : 'SET';
      rows.push([co + '-' + x, dd + ' 09:00', dd, W.names[(x * 3 + ci) % W.names.length], 1 + (x % 20), t, 'Legs', t === 'SET' ? ['BB Back Squat', 'Leg Extension', 'Lat Pulldown'][x % 3] : '', t === 'SET' ? 1 + x % 5 : '', t === 'SET' ? 20 + x % 40 : '', t === 'SET' ? 8 + x % 5 : '', t === 'SET' ? (x % 4 ? 1 : 0) : '', 0, t === 'ĐO' ? 'weight' : '', t === 'ĐO' ? 60 + x % 20 : '', '', '', co]);
    }
    db.add('Khách của ' + co, 6 + ci, rows);
  });
  var FILES = {}; FILES[BA_ID] = ba; FILES[DB_ID] = db;
  var PROPS = { ADMIN_PIN: 'ZZZZ', COACH_PINS: JSON.stringify({ 'Quyết Hán': 'AAAA', 'Hiền Mai': 'BBBB' }), STUDIO_IP: '203.0.113.7' };
  sandbox.SpreadsheetApp = { openById: function (id) { return FILES[id]; }, flush: function () {} };
  sandbox.Utilities = { formatDate: formatDate, sleep: function () {} };
  sandbox.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return PROPS[k] == null ? null : PROPS[k]; }, setProperty: function (k, v) { PROPS[k] = String(v); } }; } };
  sandbox.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  sandbox.ContentService = { createTextOutput: function (s) { return { setMimeType: function () { return { json: JSON.parse(s) }; } }; }, MimeType: { JSON: 'json' } };
  sandbox.Logger = { log: function () {} }; sandbox.ScriptApp = {}; sandbox.UrlFetchApp = {};
  [CODE, path.join(ROOT, 'backend/Logbook.gs'), path.join(ROOT, 'backend/Stats.gs'), adminFile].forEach(function (f) { vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: path.basename(f) }); });
  W.call = function (p) {
    vm.runInContext('CHECKIN._init=false; memberCoachMap_._c=null; lbDb_._ss=null; chkSS_._s=null;', sandbox);
    W.cells = 0; W.calls = 0;
    var res = sandbox.api_(JSON.parse(JSON.stringify(p))).json;
    return { res: JSON.parse(JSON.stringify(res)), cells: W.cells, calls: W.calls };
  };
}

var pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 600) : '')); } }
function strip(o) { o = JSON.parse(JSON.stringify(o)); delete o.server; return o; }
function diff(a, b, p) { p = p || ''; if (JSON.stringify(a) === JSON.stringify(b)) return null; if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return p + ': ' + JSON.stringify(a).slice(0, 120) + ' ≠ ' + JSON.stringify(b).slice(0, 120); var ks = Object.keys(a).concat(Object.keys(b)); for (var i = 0; i < ks.length; i++) { var d = diff(a[ks[i]], b[ks[i]], p + '.' + ks[i]); if (d) return d; } return p + ': thứ tự khoá khác'; }

var rows = [];
['adm_data', 'adm_stats'].forEach(function (a) {
  var A = new World(OLD), B = new World(path.join(ROOT, 'backend/Admin.gs'));
  var p = { action: a, apin: 'ZZZZ', ip: '9.9.9.9', month: TODAY.slice(0, 7) };
  var ra = A.call(p), rb = B.call(p);
  check(a + ': ok cả hai', ra.res.ok && rb.res.ok, [ra.res.error, rb.res.error]);
  var d = diff(strip(ra.res), strip(rb.res));
  check(a + ': kết quả MỚI giống hệt CŨ', !d, d);
  rows.push([a, ra.cells, rb.cells, ra.calls, rb.calls]);
});
/* adm_checkin: mỗi bản ghi trên bảng riêng — phải chọn CÙNG dòng, ghi CÙNG giá trị B/G/K/N */
(function () {
  var A = new World(OLD), B = new World(path.join(ROOT, 'backend/Admin.gs'));
  var who = A.names[5];
  var p = { action: 'adm_checkin', apin: 'ZZZZ', ip: '9.9.9.9', name: who, date: TODAY };
  var ra = A.call(p), rb = B.call(p);
  if (!ra.res.ok && ra.res.error === 'da_checkin') { who = 'Khách Thử 58'; p.name = who; ra = A.call(p); rb = B.call(p); }
  check('adm_checkin: ok cả hai', ra.res.ok && rb.res.ok, [ra.res, rb.res]);
  check('adm_checkin: cùng dòng (dòng trống giữa bảng 405 được dùng trước)', ra.res.row === rb.res.row && rb.res.row === 405, [ra.res.row, rb.res.row]);
  var la = A.ba.getSheetByName('SESSION LOG'), lb = B.ba.getSheetByName('SESSION LOG'), r = rb.res.row;
  function dv(v) { return v && typeof v.getTime === 'function' ? formatDate(new Date(v.getTime()), TZ_VN, 'yyyy-MM-dd') : v; }   /* Date của VM khác realm → không dùng instanceof */
  var ca = [2, 7, 11].map(function (c) { return dv(la.cell(r, c)); }), cb = [2, 7, 11].map(function (c) { return dv(lb.cell(r, c)); });
  check('adm_checkin: B/G/K giống nhau', JSON.stringify(ca) === JSON.stringify(cb) && cb[0] === TODAY && cb[1] === who && cb[2] === 'Đã tập', [ca, cb]);
  check('adm_checkin: N cùng định dạng "app HH:mm · ký: Admin"', /^app \d\d:\d\d · ký: Admin$/.test(lb.cell(r, 14)) && /^app \d\d:\d\d · ký: Admin$/.test(la.cell(r, 14)), [la.cell(r, 14), lb.cell(r, 14)]);
  check('adm_checkin: chỉ chạm B G K N', B.ba.writes.every(function (w) { return w[0] === 'SESSION LOG' && [2, 7, 11, 14].indexOf(w[2]) >= 0; }), B.ba.writes);
  check('adm_checkin: coach/by/at như cũ', rb.res.coach === ra.res.coach && rb.res.by === 'Admin' && /^\d\d:\d\d$/.test(rb.res.at), [ra.res, rb.res]);
  check('adm_checkin: member cùng khách', rb.res.member && ra.res.member && rb.res.member.name === ra.res.member.name, [ra.res.member, rb.res.member]);
  var ra2 = A.call(p), rb2 = B.call(p);
  check('adm_checkin lần 2: cả hai chặn trùng', ra2.res.error === 'da_checkin' && rb2.res.error === 'da_checkin', [ra2.res, rb2.res]);
  /* lượt thứ 2 cho khách khác: dòng trống đầu tiên giờ là ngay dưới dữ liệu cuối (851) */
  var p3 = { action: 'adm_checkin', apin: 'ZZZZ', name: 'Khách Thử 57', date: TODAY };
  var ra3 = A.call(p3), rb3 = B.call(p3);
  if (ra3.res.error === 'da_checkin') { check('adm_checkin 3: cả hai chặn trùng như nhau', rb3.res.error === 'da_checkin', rb3.res); }
  else check('adm_checkin 3: cùng dòng ngay dưới dữ liệu (851)', ra3.res.row === rb3.res.row && rb3.res.row === 851, [ra3.res.row, rb3.res.row]);
  rows.push(['adm_checkin', ra.cells, rb.cells, ra.calls, rb.calls]);
})();
/* adm_log: cùng sheet đích, cùng số ghi */
(function () {
  var A = new World(OLD), B = new World(path.join(ROOT, 'backend/Admin.gs'));
  var evs = [{ id: 'z1', type: 'SET', date: TODAY, name: 'Khách Thử 1', ex: 'BB Back Squat', set: 1, kg: 40, rep: 8, ok: 1 }, { id: 'z2', type: 'ĐO', date: TODAY, name: 'Khách Thử 4', metric: 'weight', val: 70 }, { id: 'Quyết Hán-5', type: 'SET', name: 'Khách Thử 1' }];
  var ra = A.call({ action: 'adm_log', apin: 'ZZZZ', events: evs }), rb = B.call({ action: 'adm_log', apin: 'ZZZZ', events: evs });
  check('adm_log: cùng kết quả', JSON.stringify(ra.res) === JSON.stringify(rb.res) && rb.res.written === 2 && rb.res.dup === 1, [ra.res, rb.res]);
  var sa = A.db.sheets.map(function (s) { return s.name + ':' + s.getLastRow(); }).join(','), sb = B.db.sheets.map(function (s) { return s.name + ':' + s.getLastRow(); }).join(',');
  check('adm_log: cùng sheet đích, cùng số dòng', sa === sb, [sa, sb]);
  rows.push(['adm_log', ra.cells, rb.cells, ra.calls, rb.calls]);
})();

console.log('\n| lệnh | ô đọc v2.4.0 | ô đọc v2.4.1 | giảm | lượt đọc cũ → mới |');
console.log('|---|---|---|---|---|');
rows.forEach(function (r) { console.log('| ' + r[0] + ' | ' + r[1].toLocaleString('vi') + ' | ' + r[2].toLocaleString('vi') + ' | ' + Math.round((1 - r[2] / r[1]) * 100) + '% | ' + r[3] + ' → ' + r[4] + ' |'); });
rows.forEach(function (r) { if (r[0] !== 'adm_log') check(r[0] + ': đọc ít hơn ít nhất 60%', r[2] <= r[1] * 0.4, r); });
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

/* v2.12 máy chủ (29/10/2026) — NHẬN DIỆN KHÁCH THEO MÃ trên Apps Script (Logbook.gs · Admin.gs · Stats.gs THẬT, VM Node).
   Bảng tính giả có tính lại cột công thức đúng như file BA: SESSION LOG P (_mrow) tra theo Q "Mã KH", trống Q → theo tên;
   F (Coach) · I (Mã HV) theo P; MEMBERS "Đã tập" đếm theo Mã HV. Cùng kịch bản với test Worker v10 (dữ liệu giả, SĐT giả).
   Code.gs (không nằm trong repo) thay bằng hàm giả: chkSS_ · memHdrRow_ · chkInit_/CHECKIN · ipOk_ · adminOk_.
   Chạy: node test/gas_identity.js */
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = process.env.ROOT || path.join(__dirname, '..');
var pass = 0, fail = 0;
function check(ok, msg, extra) { if (ok) pass++; else fail++; console.log((ok ? '  ok  ' : '  FAIL ') + msg + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra).slice(0, 500))); }

var TODAY = '2026-10-29';
var FIXED = Date.parse(TODAY + 'T10:00:00+07:00'), RD = Date;
function D(iso) { return new RD(iso + 'T00:00:00+07:00'); }
function isoOf(d) { var t = new RD(d.getTime() + 7 * 3600e3); return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2); }

/* ---------- sheet giả ---------- */
function Sheet(name, rows, cols) { this.n = name; this.g = rows; this.cols = cols; }
Sheet.prototype.getName = function () { return this.n; };
Sheet.prototype.getMaxColumns = function () { return this.cols; };
Sheet.prototype.getMaxRows = function () { return Math.max(this.g.length, 1); };
Sheet.prototype.getLastRow = function () { for (var i = this.g.length - 1; i >= 0; i--) if ((this.g[i] || []).some(function (v) { return v !== '' && v != null; })) return i + 1; return 0; };
Sheet.prototype.getLastColumn = function () { var m = 0; this.g.forEach(function (r) { for (var j = (r || []).length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; };
Sheet.prototype.insertColumnsAfter = function (a, n) { this.cols += n; };
Sheet.prototype.insertRowsAfter = function () {};
Sheet.prototype.setFrozenRows = function () {};
Sheet.prototype.cell = function (r, c) { var row = this.g[r - 1] || []; var v = row[c - 1]; return v == null ? '' : v; };
Sheet.prototype.put = function (r, c, v) { while (this.g.length < r) this.g.push([]); var row = this.g[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
Sheet.prototype.getRange = function (r, c, nr, nc) {
  var self = this; nr = nr || 1; nc = nc || 1;
  if (c + nc - 1 > self.cols) throw new Error('ngoài lưới ' + self.n + ' cột ' + (c + nc - 1) + ' > ' + self.cols);
  var rg = {
    getValues: function () { recalc(); var o = []; for (var i = 0; i < nr; i++) { var x = []; for (var j = 0; j < nc; j++) x.push(self.cell(r + i, c + j)); o.push(x); } return o; },
    getValue: function () { recalc(); return self.cell(r, c); },
    setValue: function (v) { if (self.n === 'SESSION LOG' && c === 3 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(v))) { var p = String(v).split('/'); v = D(p[2] + '-' + ('0' + p[0]).slice(-2) + '-' + ('0' + p[1]).slice(-2)); } self.put(r, c, v); WR.push([self.n, r, c, v]); return rg; },
    setValues: function (v) { for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) self.put(r + i, c + j, v[i][j]); WR.push([self.n, r, 'rows', nr, nc]); return rg; },
    setNumberFormat: function () { return rg; }, setFontWeight: function () { return rg; }
  };
  return rg;
};
function Book(sheets) { this.s = sheets; }
Book.prototype.getSheetByName = function (n) { return this.s.filter(function (x) { return x.n === n; })[0] || null; };
Book.prototype.getSheets = function () { return this.s.slice(); };
Book.prototype.getSpreadsheetTimeZone = function () { return 'Asia/Ho_Chi_Minh'; };
Book.prototype.insertSheet = function (n) { var s = new Sheet(n, [], 26); this.s.push(s); return s; };
var WR = [], BA, DB;

/* v2.13 (30/10): mặc định bố cục mới — SESSION LOG P "Mã KH" (công thức hiển thị) · Q "_mrow" · R "_makh" (cột nhập, ẩn) · S "_kh"
   (khoá người), MEMBERS X "_kh". LAYOUT=v10 node test/gas_identity.js → bố cục 29/10 (P "_mrow" · Q "Mã KH" nhập). */
var NEW = process.env.LAYOUT !== 'v10';
var MEM_HEAD = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Buổi dư', '_key', 'Mã KH', 'Nguồn', '_mkey'].concat(NEW ? ['_kh'] : []);
var LOG_HEAD = ['', '#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử'].concat(NEW ? ['Mã KH', '_mrow', '_makh', '_kh'] : ['_mrow', 'Mã KH']);
var IN = NEW ? 17 : 16, MRC = NEW ? 16 : 15, DISP = NEW ? 15 : -1, KHC = NEW ? 18 : -1;
var LB_HEAD = ['id', 'Ghi lúc', 'Ngày', 'Khách', 'Buổi #', 'Loại', 'Buổi tập', 'Bài tập', 'Set #', 'KG', 'REP', 'Đạt', 'Bài chính', 'Chỉ số', 'Giá trị', 'Form', 'Ghi chú', 'Coach', 'Mã KH'];
function M(ma, name, total, coach, phone, code, start) { var r = []; for (var i = 0; i < 24; i++) r.push(''); r[1] = ma; r[2] = name; r[4] = total; r[5] = '1:1'; r[6] = 300000; r[7] = coach; r[8] = phone; r[15] = D(start); r[20] = code; return r; }
function build(o) {
  o = o || {};
  var mem = [[''], [''], [''], [''], MEM_HEAD.slice(), M('001', 'Khách Một', 72, 'Quyết Hán', '0900000001', 'B001DY', '2026-06-17'),
    M('002A', 'Khách Hai', 3, 'Thảo Định', '0900000002', 'B002DY', '2026-06-17'), M('002B', 'Khách Hai', 45, 'Hiền Mai', '0900000002', 'B002DY', '2026-09-01'),
    M('004', 'Trùng Tên', 72, 'Quyết Hán', '0900000004', 'B004DY', '2026-06-19'), M('035', 'Khách Gia Hạn', 2, 'Khải Phan', '0900000035', 'B035DY', '2026-08-19'),
    M('059', 'Khách Gia Hạn', 36, 'Khải Phan', '0900000035', 'B059DY', '2026-10-07'), M('069', o.n069 || 'Trùng Tên', 48, 'Khải Phan', '0900000069', 'B069DY', '2026-10-26'),
    M('070', 'Trùng Cùng Coach', 12, 'Quyết Hán', '0900000070', 'B070DY', '2026-10-01'), M('071', 'Trùng Cùng Coach', 12, 'Quyết Hán', '0900000071', 'B071DY', '2026-10-02')];
  var L = [[''], [''], [''], LOG_HEAD.slice()];
  function S(d, name, q) { var r = []; for (var i = 0; i < 19; i++) r.push(''); r[2] = D(d); r[7] = name; r[11] = 'Đã tập'; r[14] = 'app 08:00 · ký: X'; r[IN] = q; L.push(r); }
  S('2026-06-20', 'Khách Một', 'B001DY'); S('2026-06-21', 'Khách Hai', 'B002DY'); S('2026-06-22', 'Khách Hai', 'B002DY'); S('2026-06-23', 'Khách Hai', 'B002DY');
  S('2026-09-05', 'Khách Hai', 'B002DY'); S('2026-07-01', 'Trùng Tên', 'B004DY'); S('2026-10-27', 'Trùng Tên', 'B004DY');
  S('2026-08-20', 'Khách Gia Hạn', 'B035DY'); S('2026-08-21', 'Khách Gia Hạn', 'B035DY'); S('2026-10-08', 'Khách Gia Hạn', 'B059DY');
  function ev(id, d, name, type, x, code) { return [id, d + ' 09:00', d, name, 1, type, '', x.ex || '', 1, x.kg == null ? '' : x.kg, x.rep == null ? '' : x.rep, x.ok == null ? '' : x.ok, '', x.metric || '', x.val == null ? '' : x.val, '', '', 'c', code || '']; }
  BA = new Book([new Sheet('MEMBERS', mem, 24), new Sheet('SESSION LOG', L, 26)]);
  DB = new Book([
    new Sheet('Khách của Quyết Hán', [LB_HEAD.slice(), ev('q1', '2026-10-27', 'Trùng Tên', 'SET', { ex: 'BB Back Squat', kg: 60, rep: 8, ok: 1 }, 'B004DY'),
      ev('q2', '2026-10-27', 'Trùng Tên', 'ĐO', { metric: 'weight', val: 70 }, 'B004DY'), ev('q3', '2026-10-20', 'Khách Một', 'SET', { ex: 'Leg Extension', kg: 30, rep: 12, ok: 1 }, 'B001DY'),
      ev('q4', '2026-10-21', 'Trùng Tên', 'SET', { ex: 'Mystery', kg: 99, rep: 1, ok: 1 }, '')], 19),
    new Sheet('Khách của Khải Phan', [LB_HEAD.slice(), ev('k1', '2026-10-27', o.n069 || 'Trùng Tên', 'ĐO', { metric: 'weight', val: 55 }, 'B069DY'),
      ev('k2', '2026-10-08', 'Khách Gia Hạn', 'SET', { ex: 'Lying Leg Curl', kg: 20, rep: 10, ok: 1 }, 'B059DY'), ev('k3', '2026-08-20', 'Khách Gia Hạn', 'ĐO', { metric: 'weight', val: 80 }, 'B035DY')], 19),
    new Sheet('Khách của Hiền Mai', o.narrow ? [LB_HEAD.slice(0, 18)] : [LB_HEAD.slice()], o.narrow ? 18 : 19),
    new Sheet('Bài tập', [['Tên', 'Nhóm'], ['BB Back Squat', 'Squat']], 4)]);
  recalc();
}
var busy = false;
function recalc() {
  if (busy || !BA) return; busy = true;
  var mem = BA.getSheetByName('MEMBERS'), log = BA.getSheetByName('SESSION LOG'), mr = mem.g.slice(5);
  if (NEW) mr.forEach(function (x) { var f = mr.filter(function (y) { return y[8] && y[8] === x[8]; })[0]; x[23] = x[20] ? (x[8] && f ? f[20] : x[20]) : ''; });   /* MEMBERS X "_kh" */
  for (var i = 4; i < log.g.length; i++) {
    var r = log.g[i]; if (!r) continue; while (r.length < 19) r.push('');
    var name = String(r[7] || ''), d = r[2], q = String(r[IN] || ''), P = '';
    if (name && d instanceof RD) {
      var by = q ? function (x) { return x[20] === q; } : function (x) { return x[2] === name; }, best = null;
      mr.forEach(function (x) { if (by(x) && x[15] <= d && (!best || x[15] > best)) best = x[15]; });
      if (best) for (var k = 0; k < mr.length; k++) if (by(mr[k]) && +mr[k][15] === +best) { P = k + 1; break; }
    }
    r[MRC] = P; r[5] = P ? mr[P - 1][7] : ''; r[8] = P ? mr[P - 1][1] : ''; r[1] = name ? String(i - 3) : '';
    if (NEW) { r[DISP] = P ? mr[P - 1][20] : ''; r[KHC] = P ? mr[P - 1][23] : ''; }
  }
  mr.forEach(function (x) { x[12] = log.g.slice(4).filter(function (r) { return r && r[8] === x[1] && r[11] === 'Đã tập'; }).length; x[13] = x[4] - x[12]; });
  busy = false;
}
function fmt(d, tz, f) { var t = new RD(d.getTime() + 7 * 3600e3); function p(n) { return ('0' + n).slice(-2); }
  return f.replace('yyyy', t.getUTCFullYear()).replace('MM', p(t.getUTCMonth() + 1)).replace('M/', (t.getUTCMonth() + 1) + '/').replace('dd', p(t.getUTCDate())).replace('/d/', '/' + t.getUTCDate() + '/').replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes())); }
function FD() { var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(RD, [null].concat(a)))() : new RD(FIXED); }
FD.now = function () { return FIXED; }; FD.UTC = RD.UTC; FD.parse = RD.parse; FD.prototype = RD.prototype;
var ctx = {
  Date: FD, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, isNaN: isNaN, parseFloat: parseFloat, console: { log: function () {} }, RegExp: RegExp, Error: Error,
  Utilities: { formatDate: fmt },
  SpreadsheetApp: { openById: function (id) { return /19iWnT/.test(id) ? DB : BA; }, flush: function () { recalc(); } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'COACH_PINS' ? JSON.stringify({ 'Quyết Hán': 'AAAA', 'Khải Phan': 'BBBB', 'Hiền Mai': 'CCCC' }) : null; } }; } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  Logger: { log: function () {} },
  /* Code.gs giả */
  chkSS_: function () { return BA; },
  memHdrRow_: function (sh) { for (var i = 0; i < sh.g.length; i++) if ((sh.g[i] || []).indexOf('Tên') >= 0) return i + 1; return 5; },
  chkInit_: function () {},
  CHECKIN: { ROW1: 5, COL_DATE: 3, COL_NAME: 8, COL_STATUS: 12, COL_NOTE: 15, WIDTH: NEW ? 19 : 16, TZ: 'Asia/Ho_Chi_Minh', ST_OK: 'Đã tập', ST_CANCEL: 'Hủy' },
  LOG_SHEET: 'SESSION LOG',
  ipOk_: function (p) { return p.ip !== 'ngoai'; },
  adminOk_: function (p) { return p.apin === 'ZZZZ'; }
};
vm.createContext(ctx);
['backend/Logbook.gs', 'backend/Stats.gs', 'backend/Admin.gs'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
function fresh() { ctx.idReset_(); ctx.lbDb_._ss = null; }
function call(fn, p) { fresh(); return JSON.parse(JSON.stringify(ctx[fn](p))); }
function today() { return BA.getSheetByName('SESSION LOG').g.slice(4).filter(function (r) { return r && r[2] instanceof RD && isoOf(r[2]) === TODAY; }); }
function byName(l, n) { return (l || []).filter(function (m) { return m.name === n; }); }
function memRow(ma) { recalc(); return BA.getSheetByName('MEMBERS').g.slice(5).filter(function (r) { return r[1] === ma; })[0]; }
var ALL = [];
function C(fn, p) { var r = call(fn, p); ALL.push(r); return r; }

console.log('\n== A. coach / adm_data ==');
build();
var r = C('lbCoach_', { pin: 'AAAA' }), x;
check(r.ok, 'A1 lbCoach_ ok', r.error);
x = byName(r.members, 'Trùng Tên');
check(x.length === 1 && x[0].key === 'Trùng Tên' && x[0].pid === 'B004DY', 'A2 Quyết: Trùng Tên key = tên, pid B004DY', x);
x = byName(r.members, 'Trùng Cùng Coach');
check(x.length === 2 && x.map(function (m) { return m.key; }).sort().join() === 'B070DY,B071DY', 'A3 hai người cùng tên cùng coach → key = pid', x);
check(r.snapshot['Trùng Tên'] && r.snapshot['Trùng Tên'].measures.length === 1 && r.snapshot['Trùng Tên'].measures[0].weight === 70 && !r.snapshot['Trùng Tên'].ex.Mystery, 'A4 snapshot Trùng Tên chỉ của B004 (S), bỏ dòng thiếu S của tên trùng', r.snapshot['Trùng Tên']);
check(JSON.stringify(r).indexOf('090000') < 0 && JSON.stringify(r).indexOf('"_r"') < 0 && JSON.stringify(r).indexOf('"_P"') < 0, 'A6 không gửi SĐT / _r / _P');
r = C('lbCoach_', { pin: 'BBBB' });
x = byName(r.members, 'Khách Gia Hạn');
check(x.length === 1 && x[0].total === 36 && x[0].pid === 'B035DY', 'A7 Khải: gia hạn (mã mới, cùng SĐT) = MỘT khách, dòng gói mới', x);
check(r.snapshot['Khách Gia Hạn'] && r.snapshot['Khách Gia Hạn'].measures.length === 1 && r.snapshot['Khách Gia Hạn'].last['Lying Leg Curl'], 'A8 snapshot gộp gói cũ + mới', r.snapshot['Khách Gia Hạn']);
r = C('admData_', { apin: 'ZZZZ' });
x = byName(r.members, 'Trùng Tên');
check(x.length === 2 && x.map(function (m) { return m.key; }).sort().join() === 'B004DY,B069DY', 'A10 Admin: hai Trùng Tên tách riêng, key = pid', x);
check(r.snapshot.B004DY && r.snapshot.B069DY && r.snapshot.B069DY.measures[0].weight === 55, 'A11 Admin: snapshot theo pid', Object.keys(r.snapshot));
check(byName(r.members, 'Khách Hai').length === 1 && byName(r.members, 'Khách Hai')[0].coach === 'Hiền Mai', 'A12 Admin: Khách Hai A/B một dòng = 002B');

console.log('\n== B. checkin_coach (app cũ chỉ gửi tên) ==');
r = C('lbCheckin_', { pin: 'AAAA', name: 'Trùng Tên' });
var t = today();
check(r.ok && t.length === 1 && t[0][IN] === 'B004DY' && t[0][8] === '004' && t[0][11] === 'Đã tập' && /^app \d\d:\d\d · ký: Quyết Hán$/.test(t[0][14]), 'B1 Quyết check-in Trùng Tên → Q B004DY, P → 004, Đã tập, ký Quyết Hán', [r, t]);
check(r.member && r.member.done === 3 && r.member.pid === 'B004DY', 'B3 member = dòng 004 sau khi ghi (đã tập 3)', r.member);
check(C('lbCheckin_', { pin: 'AAAA', name: 'Trùng Tên' }).error === 'da_checkin', 'B4 lần 2 → da_checkin');
r = C('lbCheckin_', { pin: 'BBBB', name: 'Trùng Tên' });
check(r.ok && today()[1][IN] === 'B069DY' && today()[1][8] === '069', 'B5 Khải check-in Trùng Tên (người khác) → ok, Q B069DY', [r, today()[1]]);
check(memRow('004')[12] === 3 && memRow('069')[12] === 1, 'B7 MEMBERS 004 = 3, 069 = 1');
r = C('lbCoach_', { pin: 'AAAA' });
check(byName(r.members, 'Trùng Tên')[0].checked === true, 'B8 Quyết: Trùng Tên đã tập hôm nay');
r = C('lbCheckin_', { pin: 'AAAA', name: 'Trùng Cùng Coach' });
check(r.error === 'trung_ten' && today().length === 2, 'B9 cùng tên cùng coach, không pid → trung_ten, không ghi', r);
r = C('lbCheckin_', { pin: 'AAAA', name: 'Trùng Cùng Coach', pid: 'B071DY', key: 'B071DY' });
check(r.ok && today()[2][IN] === 'B071DY' && r.member.key === 'B071DY', 'B10 có pid → ok, Q B071DY, member.key = key app gửi', r);
check(C('lbCheckin_', { pin: 'AAAA', name: 'Trùng Tên', pid: 'B069DY' }).error === 'khong_phai_khach_cua_ban', 'B11 pid khách coach khác → khong_phai_khach_cua_ban');
r = C('lbCheckin_', { pin: 'BBBB', name: 'Khách Gia Hạn' });
check(r.ok && today().slice(-1)[0][IN] === 'B059DY' && r.member.total === 36, 'B12 khách gia hạn → Q gói mới B059DY', [r, today().slice(-1)[0]]);
check(C('lbCheckin_', { pin: 'AAAA', name: 'Trùng Tên', ip: 'ngoai' }).error === 'wrong_ip', 'B13 ngoài phòng → wrong_ip');

if (NEW) check(!WR.some(function (w) { return w[0] === 'SESSION LOG' && w[2] === DISP + 1; }) && WR.some(function (w) { return w[0] === 'SESSION LOG' && w[2] === IN + 1; }), 'B14 (v2.13) không ghi vào cột hiển thị "Mã KH" (P), chỉ ghi "_makh" (R)', WR.filter(function (w) { return w[0] === 'SESSION LOG'; }).map(function (w) { return w[2]; }));
if (NEW) check(today().every(function (rr) { return rr[DISP] === rr[IN] && rr[KHC]; }), 'B15 (v2.13) cột hiển thị = mã đã ghi, "_kh" có giá trị', today().map(function (rr) { return [rr[7], rr[DISP], rr[IN], rr[KHC]]; }));
console.log('\n== C. Admin ==');
check(C('admCheckin_', { apin: 'ZZZZ', name: 'Trùng Tên' }).error === 'trung_ten', 'C1 Admin tên trùng không pid → trung_ten');
check(C('admCheckin_', { apin: 'ZZZZ', name: 'Trùng Tên', pid: 'B004DY' }).error === 'da_checkin', 'C2 Admin pid B004DY → da_checkin');
r = C('admCheckin_', { apin: 'ZZZZ', name: 'Trùng Cùng Coach', pid: 'B070DY' });
check(r.ok && r.coach === 'Quyết Hán' && today().slice(-1)[0][IN] === 'B070DY' && /· ký: Admin$/.test(today().slice(-1)[0][14]), 'C3 Admin pid B070DY → ok, coach Quyết Hán, ký Admin', r);
check(C('admCheckin_', { apin: 'ZZZZ', name: 'Không Có' }).error === 'khong_thay_khach', 'C4 khách lạ → khong_thay_khach');
r = C('admData_', { apin: 'ZZZZ' });
check(r.members.filter(function (m) { return ['B004DY', 'B069DY', 'B070DY', 'B071DY'].indexOf(m.pid) >= 0; }).every(function (m) { return m.checked; }), 'C5 Admin: 4 người đã tập hôm nay đều có cờ', r.members.map(function (m) { return m.pid + ':' + !!m.checked; }));

console.log('\n== D. log / adm_log ghi cột S ==');
r = C('lbLog_', { pin: 'AAAA', events: [{ id: 'n1', type: 'SET', date: TODAY, name: 'Trùng Tên', ex: 'BB Back Squat', kg: 62.5, rep: 8, ok: 1 },
  { id: 'n2', type: 'SET', date: TODAY, name: 'Trùng Cùng Coach', pid: 'B070DY', ex: 'X', kg: 10, rep: 10, ok: 1 }, { id: 'n3', type: 'ĐO', date: TODAY, name: 'Trùng Cùng Coach', metric: 'weight', val: 60 }, { id: 'q1', type: 'SET', name: 'Trùng Tên' }] });
var qs = DB.getSheetByName('Khách của Quyết Hán').g;
function rid(rows, id) { return rows.filter(function (x) { return x && x[0] === id; })[0] || []; }
check(r.ok && r.written === 3 && r.dup === 1, 'D1 log: 3 ghi, 1 trùng id', r);
check(rid(qs, 'n1')[18] === 'B004DY' && rid(qs, 'n2')[18] === 'B070DY' && rid(qs, 'n3')[18] === '', 'D2 S: tên (một người của coach) → B004DY · pid → B070DY · tên trùng không pid → trống', [rid(qs, 'n1'), rid(qs, 'n3')]);
r = C('admLog_', { apin: 'ZZZZ', events: [{ id: 'a1', type: 'ĐO', date: TODAY, name: 'Trùng Tên', pid: 'B069DY', metric: 'weight', val: 56 }, { id: 'a2', type: 'SET', date: TODAY, name: 'Khách Hai', ex: 'Y', kg: 5, rep: 5, ok: 1 }] });
check(r.ok && rid(DB.getSheetByName('Khách của Khải Phan').g, 'a1')[18] === 'B069DY' && rid(DB.getSheetByName('Khách của Hiền Mai').g, 'a2')[18] === 'B002DY', 'D4 adm_log: pid → sheet Khải Phan S B069DY · Khách Hai → Hiền Mai S B002DY', r);

console.log('\n== E. stats / adm_stats theo người ==');
r = C('statsApi_', { pin: 'AAAA', month: '2026-10' });
check(r.ok && r.perClient['Trùng Tên'] && r.perClient['Trùng Tên'].m === 2 && r.perClient.B070DY && r.perClient.B071DY && !r.perClient['Trùng Cùng Coach'], 'E1 stats Quyết: perClient theo key (Trùng Tên = B004 2 buổi tháng 10 · B070/B071 tách)', r.perClient);
check(r.plan && ('Trùng Tên' in r.plan) && ('B070DY' in r.plan) && ('B071DY' in r.plan), 'E2 plan theo key', r.plan);
check(r.hist && r.hist['Trùng Tên'] && r.hist['Trùng Tên']['BB Back Squat'] && r.hist.B070DY && !r.hist['Trùng Cùng Coach'], 'E3 hist theo key (tab của chính coach: dòng thiếu S theo tên trong phạm vi coach)', r.hist && Object.keys(r.hist));
r = C('admStats_', { apin: 'ZZZZ', month: '2026-10' });
check(r.hist && r.hist.B004DY && r.hist.B004DY['BB Back Squat'] && !r.hist.B004DY.Mystery && !r.hist.B069DY, 'E3b adm hist theo pid, dòng thiếu S của tên trùng không gán bừa cho B004', r.hist && Object.keys(r.hist));
r = C('admStats_', { apin: 'ZZZZ', month: '2026-10' });
check(r.ok && r.perClient.B004DY && r.perClient.B069DY && r.perClient.B004DY.m === 2 && r.perClient.B069DY.m === 1 && !r.perClient['Trùng Tên'], 'E4 adm_stats: B004 2 buổi · B069 1 buổi (không gộp)', r.perClient);

console.log('\n== F. Customer database tab 18 cột (chưa có cột S) ==');
build({ narrow: true });
r = C('admLog_', { apin: 'ZZZZ', events: [{ id: 'z1', type: 'SET', date: TODAY, name: 'Khách Hai', ex: 'Y', kg: 5, rep: 5, ok: 1 }] });
var hm = DB.getSheetByName('Khách của Hiền Mai');
check(r.ok && hm.cols === 19 && hm.cell(1, 19) === 'Mã KH' && rid(hm.g, 'z1')[18] === 'B002DY', 'F1 tab 18 cột → tự thêm cột S + tiêu đề, ghi 19 cột', [r, hm.cols, hm.g[0]]);

console.log('\n== G. đổi tên 069 về đúng tên ==');
build({ n069: 'Trùng Tên (em)' });
r = C('lbCheckin_', { pin: 'BBBB', name: 'Trùng Tên (em)' });
check(r.ok && today()[0][IN] === 'B069DY', 'G1 trước đổi tên: Khải check-in 069 → Q B069DY');
BA.getSheetByName('MEMBERS').g.slice(5).filter(function (rr) { return rr[1] === '069'; })[0][2] = 'Trùng Tên';
r = C('lbCoach_', { pin: 'BBBB' });
x = byName(r.members, 'Trùng Tên')[0];
check(x && x.checked === true && x.pid === 'B069DY' && r.snapshot['Trùng Tên'] && r.snapshot['Trùng Tên'].measures[0].weight === 55, 'G2 sau đổi tên: vẫn đã tập hôm nay + hồ sơ (theo P / Q / S)', x);
check(memRow('069')[12] === 1, 'G3 MEMBERS 069 đã tập vẫn 1 (không rơi buổi khi đổi tên)');

check(!ALL.some(function (j) { return JSON.stringify(j).indexOf('090000') >= 0; }), 'H1 ' + ALL.length + ' phản hồi không chứa SĐT');
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

/* v2.7 — chạy Stats.gs + Admin.gs THẬT trên sheet giả (không mạng, không Code.gs).
   Kiểm: hoa hồng từng buổi (đơn giá × % coach, bán hộ vào ngày bán) khớp cách tính tab COM; w8/n28/lastAll; plan; Admin cũng có w8 + plan.
   v2.7.1: giờ = giờ ký trên app (cột N), thứ tự dòng SESSION LOG; Admin có Doanh thu từng buổi (sess · comMon).
   Chạy: node test/gas_stats.js            (dữ liệu giả — repo public)
         FIXTURE=/đường/dẫn.json node test/gas_stats.js   (dữ liệu khác, cùng định dạng; kỳ vọng đọc từ fixture.expect) */
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = path.join(__dirname, '..');
var pass = 0, fail = 0;
function check(ok, msg){ if (ok) pass++; else fail++; console.log((ok ? '  ok  ' : '  FAIL ') + msg); }

/* ---------- dữ liệu ---------- */
function fakeFixture(){
  /* hôm nay = 2026-10-06 (thứ Ba). Tuần hiện tại bắt đầu 2026-10-05; 8 tuần bắt đầu 2026-08-17. */
  var memHead = ['#','Tên','Gói','Số buổi','Loại','Đơn giá buổi','Coach','Giờ tập','Khung','T2','T3','T4','T5','T6','T7','CN','Người bán gói','Ngày bán hộ','Ghi chú','Buổi/tuần','Đã tập','Còn lại','Trạng thái','Ngày bắt đầu','Ngày kết thúc','Ngày hết hạn','Mã KH'];
  function mem(id, name, price, coach, plan, left, seller, sold){ var r = new Array(memHead.length).fill(''); r[0]=id; r[1]=name; r[5]=price; r[6]=coach; r[19]=plan; r[21]=left; r[16]=seller||''; r[17]=sold?{date:sold}:''; return r; }
  var members = [
    ['— MEMBERS'], ['Danh sách'], [], [9, 'KHÁCH ĐANG HOẠT ĐỘNG'], memHead,
    mem('101','Khách An',300000,'Coach Một',3,20),
    mem('102','Khách Bình',250000,'Coach Một',2,10),
    mem('103A','Khách Cường',400000,'Coach Một',3,0),
    mem('103B','Khách Cường',350000,'Coach Một',3,12),
    mem('201','Khách Dung',500000,'Coach Hai',3,8, 'Coach Một', '2026-10-02'),     /* bán hộ tháng 10 → tính cho Coach Một */
    mem('202','Khách Em',200000,'Coach Hai',3,8, 'Coach Một', '2026-09-15'),       /* bán hộ tháng 9 */
    mem('203','Khách Giang',220000,'Coach Một',3,8, 'Coach Một', '2026-10-03'),    /* tự bán cho mình → KHÔNG tính bán hộ */
    mem('204','Khách Hà',260000,'',0,36, 'Coach Một', '2026-08-20')                /* bán trước cửa sổ → không tính */
  ];
  var log = [['— SESSION LOG'], ['Mỗi dòng'], [], ['#','Ngày','Thứ','Khung giờ','Coach','Mã coach','Học viên','Mã HV','Loại','Khung','Trạng thái','_h','_tuần','Ký điện tử']];
  function us(iso){ var p = iso.split('-'); return (+p[1]) + '/' + (+p[2]) + '/' + p[0]; }
  /* cột N = vết ký trên app "app HH:mm · ký: …" (v2.7.1: giờ hiện trên trang Hoa hồng / Doanh thu); dòng nhập tay để trống */
  function s(iso, slot, coach, name, id, st, sig){ log.push(['', us(iso), '', slot, coach, '', name, id, '1:1', '', st || 'Đã tập', '', '', sig || '']); }
  s('2026-08-18','08:00 – 09:00','Coach Một','Khách An','101','','app 08:05 · ký: Một');          /* tuần 1 */
  s('2026-09-01','08:00 – 09:00','Coach Một','Khách An','101','','app 8:02 · ký: Một');           /* tuần 3 · tháng 9 · giờ 1 chữ số */
  s('2026-09-14','10:00 – 11:00','Coach Một','Khách Bình','102');                                 /* tuần 5 · tháng 9 · nhập tay → không giờ */
  s('2026-09-14','15:00 – 16:00','Coach Một','Khách An','101','Hủy','app 15:00 · ký: Một');       /* hủy → bỏ */
  s('2026-09-30','07:00 – 08:00','Coach Một','Khách Cường','103B','','app 07:10 · ký: Admin');    /* tuần 7 */
  s('2026-10-01','06:00 – 07:00','Coach Một','Khách An','101','','app 06:03 · ký: Một · ký: Một');/* tuần 7 · vết ký lặp */
  s('2026-10-05','15:00 – 16:00','Coach Một','Khách An','101','','app 15:01 · duyệt: Một');       /* tuần 8 */
  s('2026-10-06','09:00 – 10:00','Coach Một','Khách Cường','','','app 09:05 · ký: Một');          /* hôm nay · thiếu mã HV → theo tên (103B) · dòng TRƯỚC Bình dù ký muộn hơn */
  s('2026-10-06','08:00 – 09:00','Coach Một','Khách Bình','102','','app 08:01 · ký: Một');        /* hôm nay, tuần 8 */
  s('2026-10-06','10:00 – 11:00','Coach Hai','Khách Dung','201','','app 10:00 · ký: Hai');        /* coach khác → bỏ (Admin: có) */
  s('2026-10-07','10:00 – 11:00','Coach Một','Khách An','101');                                   /* tương lai → không vào sess */
  for (var k = 0; k < 40; k++) log.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);   /* công thức kéo sẵn: dòng rỗng cuối bảng */
  var cfg = [['— CONFIG 2'], ['Chỉnh sửa'], [], ['Coach','Giai đoạn','% Com'], ['Coach Một','',0.2], ['Coach Hai','01/09 -',0.15], ['Coach Hai (giai đoạn 1)','',0.1]];
  var expect = {
    coach: 'Coach Một', pin: '1111', month: '2026-10', today: '2026-10-06',
    /* v2.7.1: giờ = giờ ký (cột N), trong ngày theo thứ tự dòng SESSION LOG, bán hộ cuối ngày */
    sess: [
      ['2026-09-01','08:02','Khách An',60000,0], ['2026-09-14','','Khách Bình',50000,0], ['2026-09-15','','Khách Em',40000,1], ['2026-09-30','07:10','Khách Cường',70000,0],
      ['2026-10-01','06:03','Khách An',60000,0], ['2026-10-02','','Khách Dung',100000,1], ['2026-10-05','15:01','Khách An',60000,0],
      ['2026-10-06','09:05','Khách Cường',70000,0], ['2026-10-06','08:01','Khách Bình',50000,0]
    ],
    /* Admin — Doanh thu từng buổi = đơn giá buổi, mọi coach, cùng thứ tự dòng; không có bán hộ */
    admSess: [
      ['2026-09-01','08:02','Khách An',300000], ['2026-09-14','','Khách Bình',250000], ['2026-09-30','07:10','Khách Cường',350000],
      ['2026-10-01','06:03','Khách An',300000], ['2026-10-05','15:01','Khách An',300000],
      ['2026-10-06','09:05','Khách Cường',350000], ['2026-10-06','08:01','Khách Bình',250000], ['2026-10-06','10:00','Khách Dung',500000]
    ],
    admMon: { '2026-09': 900000, '2026-10': 1700000 },
    comMon: { '2026-09': 220000, '2026-10': 340000 },
    w8: { 'Khách An': [1,0,1,0,0,0,1,1], 'Khách Bình': [0,0,0,0,1,0,0,1], 'Khách Cường': [0,0,0,0,0,0,1,1] },
    n28: { 'Khách An': 2, 'Khách Bình': 2, 'Khách Cường': 2 },
    lastAll: { 'Khách An': '2026-10-05', 'Khách Bình': '2026-10-06', 'Khách Cường': '2026-10-06' },
    plan: { 'Khách An': 3, 'Khách Bình': 2, 'Khách Cường': 3, 'Khách Giang': 3 },
    w0: '2026-08-17'
  };
  return { members: members, log: log, cfg: cfg, cfgName: ' ⚙️ 2', expect: expect };
}

/* ---------- sheet giả ---------- */
function toVal(v){ return (v && typeof v === 'object' && v.date) ? new Date(v.date + 'T00:00:00+07:00') : v; }
function Sheet(name, rows){ this.n = name; this.rows = rows.map(function (r) { return r.map(toVal); }); this.reads = 0; }
Sheet.prototype.getName = function(){ return this.n; };
Sheet.prototype.getLastRow = function(){ for (var i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some(function (v) { return v !== '' && v != null; })) return i + 1; return 0; };
Sheet.prototype.getLastColumn = function(){ return this.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
Sheet.prototype.getRange = function(r, c, nr, nc){
  var self = this; nr = nr || 1; nc = nc || 1;
  if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('range ' + [r, c, nr, nc]);
  return { getValues: function(){ self.reads += nr * nc; var out = []; for (var i = 0; i < nr; i++) { var row = self.rows[r - 1 + i] || [], o = []; for (var j = 0; j < nc; j++) { var v = row[c - 1 + j]; o.push(v == null ? '' : v); } out.push(o); } return out; } };
};
function Book(sheets, tz){ this.s = sheets; this.tz = tz; }
Book.prototype.getSheetByName = function(n){ return this.s.filter(function (s) { return s.n === n; })[0] || null; };
Book.prototype.getSheets = function(){ return this.s.slice(); };
Book.prototype.getSpreadsheetTimeZone = function(){ return this.tz; };

function run(fx){
  var E = fx.expect, FIXED = Date.parse(E.today + 'T10:00:00+07:00');
  var log = new Sheet('SESSION LOG', fx.log), mem = new Sheet('MEMBERS', fx.members), cfg = new Sheet(fx.cfgName, fx.cfg), com = new Sheet('COM', [['— COMMISSION']]);
  var BA = new Book([mem, log, com, cfg, new Sheet(' ⚙️ 1', [['x']])], 'Asia/Ho_Chi_Minh'), CDB = new Book([], 'Asia/Ho_Chi_Minh');
  var RD = Date;
  function FD(){ var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(RD, [null].concat(a)))() : new RD(FIXED); }
  FD.now = function(){ return FIXED; }; FD.UTC = RD.UTC; FD.parse = RD.parse; FD.prototype = RD.prototype;
  function fmt(d, tz, f){ var t = new RD(d.getTime() + 7 * 3600e3); function p(n){ return ('0' + n).slice(-2); }
    return f.replace('yyyy', t.getUTCFullYear()).replace('MM', p(t.getUTCMonth() + 1)).replace('dd', p(t.getUTCDate())).replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes())); }
  var ctx = {
    Date: FD, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, isNaN: isNaN, parseFloat: parseFloat, console: console,
    Utilities: { formatDate: fmt },
    SpreadsheetApp: { openById: function(id){ return /19iWnT/.test(id) ? CDB : BA; } },
    PropertiesService: { getScriptProperties: function(){ return { getProperty: function(k){ return k === 'COACH_PINS' ? JSON.stringify((function(){ var o = {}; o[E.coach] = E.pin; return o; })()) : null; } }; } },
    LockService: { getScriptLock: function(){ return { waitLock: function(){}, releaseLock: function(){} }; } },
    Logger: { log: function(){} },
    memHdrRow_: function(sh){ for (var i = 0; i < sh.rows.length; i++) if (String(sh.rows[i][1]).trim() === 'Tên') return i + 1; return 5; },
    chkSS_: function(){ return { other: 1 }; },
    adminOk_: function(){ return true; }
  };
  vm.createContext(ctx);
  ['backend/Logbook.gs', 'backend/Stats.gs', 'backend/Admin.gs'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
  var res = ctx.statsApi_({ pin: E.pin, month: E.month });
  var logReads = log.reads; log.reads = 0;
  var adm = ctx.admStats_({ apin: 'x', month: E.month });
  return { res: res, adm: adm, logReads: logReads, logRows: fx.log.length };
}

var fx = process.env.FIXTURE ? JSON.parse(fs.readFileSync(process.env.FIXTURE, 'utf8')) : fakeFixture();
var E = fx.expect, R = run(fx), res = R.res, adm = R.adm;
console.log('stats ok:', res.ok, res.comError || '', '· sess', (res.sess || []).length);
check(res.ok === true && !res.comError, 'S1 statsApi_ ok, không comError ' + (res.comError || ''));
if (E.sess) {
  var got = (res.sess || []).map(function (x) { return [x.d, x.t, x.n, x.c, x.b ? 1 : 0]; });
  check(JSON.stringify(got) === JSON.stringify(E.sess), 'S2 danh sách buổi + bán hộ, thứ tự, hoa hồng từng buổi' + (JSON.stringify(got) === JSON.stringify(E.sess) ? '' : '\n      got ' + JSON.stringify(got) + '\n      exp ' + JSON.stringify(E.sess)));
}
check(JSON.stringify(res.comMon) === JSON.stringify(E.comMon), 'S3 tổng tháng (tháng trước + tháng này) ' + JSON.stringify(res.comMon));
check(res.comFrom === Object.keys(E.comMon).sort()[0] + '-01' && res.w0 === E.w0, 'S4 comFrom ' + res.comFrom + ' · w0 ' + res.w0);
var okW = Object.keys(E.w8).every(function (n) { var p = res.perClient[n] || {}; return JSON.stringify(p.w8) === JSON.stringify(E.w8[n]) && p.n28 === E.n28[n] && p.lastAll === E.lastAll[n]; });
check(okW, 'S5 w8 / n28 / lastAll theo khách ' + (okW ? '' : JSON.stringify(res.perClient)));
var okP = Object.keys(E.plan).every(function (n) { return res.plan && res.plan[n] === E.plan[n]; });
check(okP, 'S6 plan (Buổi/tuần) khách của coach ' + JSON.stringify(res.plan));
if (!process.env.FIXTURE) check(!('Khách Dung' in (res.plan || {})) && !res.perClient['Khách Dung'], 'S7 không lẫn khách / buổi của coach khác');
check(R.logReads < R.logRows * 14, 'S8 chỉ đọc SESSION LOG tới dòng có ngày cuối: ' + R.logReads + ' ô < ' + (R.logRows * 14));
check(adm.ok && adm.w0 === E.w0 && adm.plan && Object.keys(E.w8).every(function (n) { return JSON.stringify((adm.perClient[n] || {}).w8) === JSON.stringify(E.w8[n]); }), 'S9 Admin: w8 + plan + w0');
if (E.admSess) {
  var ga = (adm.sess || []).map(function (x) { return [x.d, x.t, x.n, x.c]; });
  check(JSON.stringify(ga) === JSON.stringify(E.admSess) && JSON.stringify(adm.comMon) === JSON.stringify(E.admMon) && adm.comFrom === res.comFrom,
    'S11 Admin Doanh thu: từng buổi = đơn giá, mọi coach, thứ tự dòng, tổng tháng ' + JSON.stringify(adm.comMon) + (JSON.stringify(ga) === JSON.stringify(E.admSess) ? '' : '\n      got ' + JSON.stringify(ga)));
}
if (E.admMon && process.env.FIXTURE) check(Object.keys(E.admMon).every(function (k) { return adm.comMon && adm.comMon[k] === E.admMon[k]; }), 'S11r Admin Doanh thu tháng khớp tab COM ' + JSON.stringify(adm.comMon));
check(!(adm.sess || []).some(function (x) { return 'r' in x; }) && !(res.sess || []).some(function (x) { return 'r' in x; }), 'S12 không gửi số dòng nội bộ (r) xuống app');
check(Object.keys(res).indexOf('hist') >= 0 && Object.keys(res).indexOf('days') >= 0 && res.monthTotal >= 0, 'S10 khoá cũ của stats giữ nguyên (days · monthTotal · hist)');
console.log(fail ? 'FAIL ' + pass + '/' + (pass + fail) : 'PASS ' + pass + '/' + pass);
process.exit(fail ? 1 : 0);

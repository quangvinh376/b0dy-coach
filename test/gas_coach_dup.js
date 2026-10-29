/* v2.11 máy chủ (29/10) — lệnh `coach` của Apps Script (Logbook.gs lbCoach_) gộp các dòng MEMBERS cùng tên.
   Chạy Logbook.gs THẬT trong VM Node; MEMBERS / SESSION LOG / Customer database thay bằng hàm giả (không mạng, không Code.gs).
   Chạy: node test/gas_coach_dup.js        (Logbook.gs trước v2.11: G1 G2 G4 G6 trượt) */
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = process.env.ROOT || path.join(__dirname, '..');
var pass = 0, fail = 0;
function check(ok, msg, extra) { if (ok) pass++; else fail++; console.log((ok ? '  ok  ' : '  FAIL ') + msg + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra).slice(0, 400))); }

function M(name, done, total, left, coach, kind, start) { return { name: name, total: total, done: done, left: left, coach: coach, start: start, end: '', exp: '', kind: kind, pkg: '', status: '' }; }
/* đúng thứ tự lbMembers_(true) trả về: sort ổn định theo tên → các dòng trùng tên giữ thứ tự sheet (dòng cũ trước) */
var MEMBERS = [
  M('Khách Đôi A', 10, 12, 0, 'Coach Một', '1:2', '2026-08-26'),
  M('Khách Đôi A', 4, 12, 8, 'Coach Một', '1:2', '2026-10-19'),
  M('Khách Hai Giai Đoạn', 17, 17, 0, 'Coach Một', '1:1', '2026-06-30'),
  M('Khách Hai Giai Đoạn', 0, 19, 19, 'Coach Hai', '1:1', '2026-09-05'),        /* giai đoạn mới ở coach khác → Coach Một chỉ còn dòng cũ */
  M('Khách Một', 31, 72, 41, 'Coach Một', '1:1', '2026-07-16'),
  M('Khách Ngược', 3, 12, 3, 'Coach Một', '1:1', '2026-10-01'),                 /* dòng còn buổi đứng TRÊN dòng hết buổi */
  M('Khách Ngược', 12, 12, 0, 'Coach Một', '1:1', '2026-07-01'),
  M('Khách Xong', 12, 12, 0, 'Coach Một', '1:1', '2026-07-01'),
  M('Khách Xong', 24, 24, 0, 'Coach Một', '1:1', '2026-08-01')
];
var ctx = {
  Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, isNaN: isNaN, console: console,
  Utilities: { formatDate: function (d, tz, f) { return f === 'HH:mm' ? '09:00' : f === 'yyyy-MM-dd' ? '2026-10-29' : '2026-10-29 09:00'; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'COACH_PINS' ? JSON.stringify({ 'Coach Một': '1111' }) : null; } }; } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  Logger: { log: function () {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'backend/Logbook.gs'), 'utf8'), ctx, { filename: 'Logbook.gs' });
/* thay phần đọc sheet bằng dữ liệu giả (hàm toàn cục của .gs → gán đè trên ctx) */
ctx.lbMembers_ = function () { return { ok: true, members: JSON.parse(JSON.stringify(MEMBERS)) }; };
ctx.lbReadAll_ = function () { return []; };
ctx.lbLibrary_ = function () { return null; };
ctx.lbToday_ = function () { return '2026-10-29'; };
ctx.lbSignedToday_ = function () { var o = {}; o[ctx.lbNorm_('Khách Đôi A')] = '08:18'; o[ctx.lbNorm_('Khách Hai Giai Đoạn')] = '10:00'; return o; };

var r = ctx.lbCoach_({ pin: '1111' });
check(r.ok === true && r.coach === 'Coach Một', 'G0 lbCoach_ ok', r.error);
var names = (r.members || []).map(function (m) { return m.name; });
check(JSON.stringify(names) === JSON.stringify(['Khách Đôi A', 'Khách Hai Giai Đoạn', 'Khách Một', 'Khách Ngược', 'Khách Xong']), 'G1 mỗi tên một dòng, giữ thứ tự', names);
var by = {}; (r.members || []).forEach(function (m) { if (!by[m.name]) by[m.name] = m; });
check(by['Khách Đôi A'] && by['Khách Đôi A'].left === 8 && by['Khách Đôi A'].start === '2026-10-19' && by['Khách Đôi A'].checked === true && by['Khách Đôi A'].signed === '08:18', 'G2 khách gia hạn → dòng gói mới, đã tập hôm nay 08:18', by['Khách Đôi A']);
check(by['Khách Ngược'] && by['Khách Ngược'].left === 3, 'G3 dòng còn buổi đứng trên vẫn được giữ', by['Khách Ngược']);
check(by['Khách Xong'] && by['Khách Xong'].total === 24, 'G4 cả hai hết buổi → dòng cuối', by['Khách Xong']);
check(by['Khách Hai Giai Đoạn'] && by['Khách Hai Giai Đoạn'].coach === 'Coach Một' && by['Khách Hai Giai Đoạn'].left === 0, 'G5 chỉ gộp trong khách của coach này (dòng coach khác không lọt vào)', by['Khách Hai Giai Đoạn']);
check(typeof ctx.lbOnePerName_ === 'function' && ctx.lbOnePerName_([]).length === 0, 'G6 lbOnePerName_ với danh sách rỗng');
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

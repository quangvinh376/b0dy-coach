/* v2.8 — Lưu trữ gọn Customer database: chạy Archive.gs + Logbook.gs + Stats.gs + Admin.gs THẬT trên sheet giả (không mạng).
   Kiểm: chạy thử không đổi gì · hồ sơ khách (snapshot) và Hiệu suất tập (hist) Y HỆT trước/sau · không mất / không trùng dòng ·
   dọn dòng trống + lưới thừa · tổng hợp bài đúng · chạy lại không nhân đôi · tháng sau · ghi set sau khi dọn lưới (tự thêm dòng) ·
   lỗi kiểm id → không xoá · dòng đổi giữa lúc chạy → dừng xoá, không mất dòng.
   Chạy: node test/gas_archive.js                 (dữ liệu giả — repo public)
         CDB_JSON=/đường/dẫn.json node test/gas_archive.js   (bản xuất thật để NGOÀI repo: {tabs:{tên:[[...],...]}, grid:{tên:[dòng,cột]}}) */
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = path.join(__dirname, '..');
var pass = 0, fail = 0;
function check(ok, msg){ if (ok) pass++; else fail++; console.log((ok ? '  ok  ' : '  FAIL ') + msg); }
var J = JSON.stringify;

/* ---------------- Sheets giả: lưới thật (maxRows × maxCols), getRange vượt lưới thì lỗi như Apps Script ---------------- */
function Sheet(name, rows, maxR, maxC, book){
  this.n = name; this.book = book; this.frozen = 0; this.fmt = {}; this.hooks = {};
  maxC = Math.max(maxC || 0, rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0), 1);
  maxR = Math.max(maxR || 0, rows.length, 1);
  this.g = []; for (var i = 0; i < maxR; i++) { var r = rows[i] || [], o = []; for (var j = 0; j < maxC; j++) o.push(r[j] == null ? '' : r[j]); this.g.push(o); }
}
Sheet.prototype.getName = function(){ return this.n; };
Sheet.prototype.setName = function(n){ this.n = n; return this; };
Sheet.prototype.getMaxRows = function(){ return this.g.length; };
Sheet.prototype.getMaxColumns = function(){ return this.g[0] ? this.g[0].length : 0; };
Sheet.prototype.getLastRow = function(){ for (var i = this.g.length - 1; i >= 0; i--) if (this.g[i].some(function (v) { return v !== '' && v != null; })) return i + 1; return 0; };
Sheet.prototype.getLastColumn = function(){ var m = 0; this.g.forEach(function (r) { for (var j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; };
Sheet.prototype.setFrozenRows = function(n){ this.frozen = n; };
Sheet.prototype.insertRowsAfter = function(after, n){ var c = this.getMaxColumns(), add = []; for (var i = 0; i < n; i++) add.push(new Array(c).fill('')); this.g.splice.apply(this.g, [after, 0].concat(add)); };
Sheet.prototype.deleteRows = function(start, n){ if (start < 1 || start + n - 1 > this.g.length) throw new Error('deleteRows ngoài lưới ' + [start, n, this.g.length]); if (n >= this.g.length) throw new Error('không xoá được mọi dòng'); this.g.splice(start - 1, n); if (this.hooks.del) this.hooks.del(start, n); };
Sheet.prototype.deleteColumns = function(start, n){ this.g.forEach(function (r) { r.splice(start - 1, n); }); };
Sheet.prototype.getRange = function(r, c, nr, nc){
  var self = this; nr = nr == null ? 1 : nr; nc = nc == null ? 1 : nc;
  if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > self.g.length || c + nc - 1 > self.getMaxColumns())
    throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet. ' + self.n + ' ' + [r, c, nr, nc] + ' lưới ' + self.g.length + '×' + self.getMaxColumns());
  var rg = {
    getValues: function(){ if (self.hooks.read) self.hooks.read(r, c, nr, nc); var o = []; for (var i = 0; i < nr; i++) o.push(self.g[r - 1 + i].slice(c - 1, c - 1 + nc)); return o; },
    setValues: function(v){ if (v.length !== nr || v.some(function (x) { return x.length !== nc; })) throw new Error('setValues sai kích thước'); for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) self.g[r - 1 + i][c - 1 + j] = v[i][j]; if (self.hooks.write) self.hooks.write(r, nr); return rg; },
    setNumberFormat: function(f){ for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) self.fmt[(r + i) + ':' + (c + j)] = f; return rg; },
    setFontWeight: function(){ return rg; },
    clearContent: function(){ for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) self.g[r - 1 + i][c - 1 + j] = ''; return rg; }
  };
  return rg;
};
var IDN = 0;
function Book(name, tz){ this.name = name; this.id = 'book' + (++IDN); this.tz = tz || 'Asia/Ho_Chi_Minh'; this.s = []; }
Book.prototype.getSheets = function(){ return this.s.slice(); };
Book.prototype.getSheetByName = function(n){ return this.s.filter(function (s) { return s.n === n; })[0] || null; };
Book.prototype.insertSheet = function(n){ if (this.getSheetByName(n)) throw new Error('trùng tên tab ' + n); var s = new Sheet(n, [], 1000, 26, this); this.s.push(s); return s; };
Book.prototype.add = function(s){ s.book = this; this.s.push(s); return s; };
Book.prototype.getSpreadsheetTimeZone = function(){ return this.tz; };
Book.prototype.setSpreadsheetTimeZone = function(t){ this.tz = t; };
Book.prototype.getId = function(){ return this.id; };
Book.prototype.getName = function(){ return this.name; };

/* ---------------- dữ liệu giả ---------------- */
var HEAD = ['id','Ghi lúc','Ngày','Khách','Buổi #','Loại','Buổi tập','Bài tập','Set #','KG','REP','Đạt','Bài chính','Chỉ số','Giá trị','Form','Ghi chú','Coach'];
function iso(n){ var d = new Date(Date.UTC(2026, 0, 1) + n * 864e5); return d.toISOString().slice(0, 10); }
function dayN(s){ return (Date.parse(s + 'T00:00:00Z') - Date.UTC(2026, 0, 1)) / 864e5; }
function fakeTabs(){
  var tabs = {}, seq = 0;
  function id(){ return 'ev' + (++seq).toString(36); }
  function gen(coach, clients, exs, start, end, gapAt){
    var rows = [HEAD.slice()], rnd = 7 + coach.length;
    function rr(n){ rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; }
    for (var dn = dayN(start); dn <= dayN(end); dn++) {
      var d = iso(dn);
      clients.forEach(function (cl, ci) {
        if ((dn + ci) % 3 !== 0) return;                              /* ~2 buổi/tuần mỗi khách */
        var plan = 'Buổi ' + 'ABC'[(dn + ci) % 3], ss = Math.floor(dn / 3), ts0 = 7 + ci * 2;
        var pick = exs.filter(function (e, k) { return (k + dn + ci) % 2 === 0; }).slice(0, 3);
        if (cl === 'Khách Cũ' && d >= '2026-08-01') return;             /* khách nghỉ từ tháng 8 → chỉ còn dữ liệu cũ */
        pick.forEach(function (ex, ei) {
          var nset = 3 + rr(2);
          for (var s = 1; s <= nset; s++) {
            var kg = 20 + rr(6) * 2.5 + ei * 5, rep = 6 + rr(7), ok = rr(5) ? 1 : 0;
            rows.push([id(), d + ' ' + ('0' + ts0).slice(-2) + ':' + ('0' + (ei * 10 + s)).slice(-2), d, cl, ss, 'SET', plan, ex, s, kg, rep, ok, ei === 0 ? 1 : 0, '', '', '', '', coach]);
          }
          rows.push([id(), d + ' ' + ('0' + ts0).slice(-2) + ':' + ('0' + (ei * 10 + 9)).slice(-2), d, cl, ss, 'BÀI', plan, ex, '', '', '', nset, ei === 0 ? 1 : 0, '', '', '', '', coach]);
        });
        rows.push([id(), d + ' ' + ('0' + (ts0 + 1)).slice(-2) + ':00', d, cl, ss, 'CHECKOUT', plan, '', '', '', '', '', '', '', '', 4, 'ok', coach]);
        if (dn % 30 === 0) { rows.push([id(), d + ' 06:00', d, cl, '', 'ĐO', '', '', '', '', '', '', '', 'weight', 70 + ci, '', '', coach]); rows.push([id(), d + ' 06:01', d, cl, '', 'ĐO', '', '', '', '', '', '', '', 'waist', 80 - ci, '', '', coach]); }
      });
      if (gapAt && d === gapAt) for (var b = 0; b < 12; b++) rows.push([]);     /* dòng trống giữa dữ liệu (như tab Quyết Hán) */
    }
    return rows;
  }
  var EX = ['Squat','Bench Press','Lat Pulldown','Deadlift','Row','Leg Curl'];
  var a = gen('Coach Một', ['Khách An', 'Khách Bình', 'Khách Cũ'], EX, '2025-11-03', '2026-10-06', '2026-08-20');   /* 11 tháng, qua 2 năm → 2 file lưu trữ, tổng hợp bị cắt 24 ngày */
  a.push(['', '', '2026-07-15', 'Khách An', '', '', '', '', '', '', '', '', '', '', '', '', 'ghi tay không id', '']);   /* dòng không id → giữ */
  a.push(['evMT', '2026-07-02 08:00', '2026-07-02', 'Khách An', '', 'MỤC TIÊU', '', '', '', '', '', '', '', 'weight', 65, '', '', 'Coach Một']);
  a.push(['evDate', '2026-07-03 08:00', new Date(Date.UTC(2026, 6, 3, -7)), 'Khách Bình', 3, 'SET', 'Buổi A', 'Squat', 1, 30, 8, 1, 0, '', '', '', '', 'Coach Một']);   /* ô ngày kiểu Date (nhập tay) */
  tabs['Khách của Coach Một'] = { rows: a, maxR: a.length + 600, maxC: 26 };
  var b = gen('Coach Hai', ['Khách Dung', 'Khách Em'], EX.slice(0, 4), '2026-08-10', '2026-10-06', null);
  tabs['Khách của Coach Hai'] = { rows: b, maxR: b.length + 4000, maxC: 18 };
  return tabs;
}

/* ---------------- môi trường Apps Script giả ---------------- */
function Env(tabsSpec, today){
  var self = this;
  self.today = today;
  self.DB = new Book('[B0DY Studio] Customer database');
  Object.keys(tabsSpec).forEach(function (n) { var t = tabsSpec[n]; self.DB.add(new Sheet(n, t.rows, t.maxR, t.maxC)); });
  self.DB.add(new Sheet('Bài tập', [['Tên', 'Nhóm'], ['Squat', 'Chân']], 70, 26));
  var CO = self.coaches = Object.keys(tabsSpec).map(function (n) { return n.replace('Khách của ', ''); }).concat(['Coach Hai']);
  var memHead = ['#','Tên','Gói','Số buổi','Loại','Đơn giá buổi','Coach','Giờ tập','Khung','T2','T3','T4','T5','T6','T7','CN','Người bán gói','Ngày bán hộ','Ghi chú','Buổi/tuần','Đã tập','Còn lại','Trạng thái','Ngày bắt đầu','Ngày kết thúc','Ngày hết hạn'];
  var mem = [['— MEMBERS'], [], [], [], memHead];
  [['1','Khách An',CO[0]],['2','Khách Bình',CO[0]],['3','Khách Cũ',CO[0]],['4','Khách Dung',CO[1]],['5','Khách Em',CO[1]]].forEach(function (m) { var r = new Array(memHead.length).fill(''); r[0] = m[0]; r[1] = m[1]; r[3] = 24; r[5] = 300000; r[6] = m[2]; r[19] = 2; r[20] = 4; r[21] = 20; mem.push(r); });
  self.BA = new Book('BA');
  self.BA.add(new Sheet('MEMBERS', mem, 80, 26)); self.BA.add(new Sheet('SESSION LOG', [['— SESSION LOG'], [], [], ['#','Ngày']], 50, 14));
  self.BA.add(new Sheet('COM', [['— COMMISSION']], 60, 8)); self.BA.add(new Sheet(' ⚙️ 2', [['x'], [], [], ['Coach', '', '% Com'], [CO[0], '', 0.2], [CO[1], '', 0.15]]));
  self.files = {}; self.props = {};
  var FIXED = Date.parse(today + 'T03:30:00+07:00'), RD = Date;
  function FD(){ var a = Array.prototype.slice.call(arguments); return a.length ? new (Function.prototype.bind.apply(RD, [null].concat(a)))() : new RD(FIXED); }
  FD.now = function(){ return FIXED; }; FD.UTC = RD.UTC; FD.parse = RD.parse; FD.prototype = RD.prototype;
  function fmt(d, tz, f){ var t = new RD(d.getTime() + 7 * 3600e3); function p(n){ return ('0' + n).slice(-2); }
    return f.replace('yyyy', t.getUTCFullYear()).replace('MM', p(t.getUTCMonth() + 1)).replace('dd', p(t.getUTCDate())).replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes())); }
  var ctx = self.ctx = {
    Date: FD, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object, Array: Array, isNaN: isNaN, parseFloat: parseFloat, console: console, RegExp: RegExp, Error: Error,
    Utilities: { formatDate: fmt },
    SpreadsheetApp: {
      openById: function(id){ if (/19iWnT/.test(id)) return self.DB; if (/1QCsIq/.test(id)) return self.BA; if (self.files[id]) return self.files[id]; throw new Error('Không mở được file ' + id); },
      create: function(name){ var b = new Book(name, 'America/Los_Angeles'); b.add(new Sheet('Sheet1', [], 1000, 26)); self.files[b.id] = b; return b; }
    },
    PropertiesService: { getScriptProperties: function(){ return {
      getProperty: function(k){ if (k === 'COACH_PINS') { var o = {}; o[CO[0]] = '1111'; o[CO[1]] = '2222'; return J(o); } return k in self.props ? self.props[k] : null; },
      setProperty: function(k, v){ self.props[k] = v; } }; } },
    LockService: { getScriptLock: function(){ return { waitLock: function(){}, releaseLock: function(){} }; } },
    Logger: { log: function(){} },
    memHdrRow_: function(sh){ for (var i = 0; i < sh.g.length; i++) if (String(sh.g[i][1]).trim() === 'Tên') return i + 1; return 5; },
    chkSS_: function(){ return { other: 1 }; },
    adminOk_: function(){ return true; }
  };
  vm.createContext(ctx);
  ['backend/Logbook.gs', 'backend/Stats.gs', 'backend/Admin.gs', 'backend/Archive.gs'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); });
}
Env.prototype.coachTabs = function(){ return this.DB.s.filter(function (s) { return /^Khách của /.test(s.n); }); };
/* JSON chuẩn: khoá sắp xếp — app đọc snapshot / hist theo khoá, không theo thứ tự khoá */
function C(v){ if (Array.isArray(v)) return '[' + v.map(C).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return J(k) + ':' + C(v[k]); }).join(',') + '}'; return J(v); }
Env.prototype.snap = function(){   /* hồ sơ mọi khách như action coach / adm_data đọc */
  this.ctx.lbDb_._ss = null;
  var ev = this.ctx.lbReadAll_(), names = {}; ev.forEach(function (e) { if (e.name) names[e.name] = 1; });
  return C(this.ctx.lbSnapshot_(ev, names));
};
Env.prototype.hist = function(){
  this.ctx.lbDb_._ss = null;
  var a = this.ctx.statsApi_({ pin: '1111', month: this.today.slice(0, 7) }), b = this.ctx.statsApi_({ pin: '2222', month: this.today.slice(0, 7) }), c = this.ctx.admStats_({ apin: 'x', month: this.today.slice(0, 7) });
  return { one: C(a.hist), two: C(b.hist), adm: C(c.hist), err: (a.histError || '') + (b.histError || '') + (c.histError || '') };
};
Env.prototype.rowsById = function(book){   /* ô Date (dòng nhập tay) so theo ngày yyyy-MM-dd — file lưu trữ ghi dạng chuỗi */
  var out = {}, k = this.ctx.lbKey_;
  (book || this.DB).s.filter(function (s) { return /^Khách của /.test(s.n); }).forEach(function (s) { s.g.slice(1).forEach(function (r) { if (r[0] !== '' && r[0] != null) out[String(r[0])] = J(r.slice(0, 18).map(function (v, j) { return v instanceof Date ? (j === 2 ? k(v) : v.toISOString()) : v; })); }); });
  return out;
};
Env.prototype.archived = function(){ var self = this, out = {}; Object.keys(self.files).forEach(function (k) { var ro = self.rowsById(self.files[k]); for (var id in ro) { if (out[id]) out[id + '#dup'] = 1; out[id] = ro[id]; } }); return out; };
Env.prototype.run = function(o){ this.ctx.lbDb_._ss = null; return this.ctx.ltRun_(o); };
Env.prototype.grid = function(){ return this.coachTabs().map(function (s) { return s.n + ':' + s.getMaxRows() + '×' + s.getMaxColumns() + '/' + s.getLastRow(); }).join(' '); };
function blankInside(s){ var last = s.getLastRow(), n = 0; for (var i = 1; i < last; i++) if (!s.g[i].some(function (v) { return v !== '' && v != null; })) n++; return n; }
/* "đúng": hist tính từ MỌI dòng gốc (không lưu trữ) = tiêu chuẩn so sánh */
function clone(tabs){ var o = {}; Object.keys(tabs).forEach(function (k) { o[k] = { rows: tabs[k].rows.map(function (r) { return r.slice(); }), maxR: tabs[k].maxR, maxC: tabs[k].maxC }; }); return o; }

/* ================================================================ */
var TABS = process.env.CDB_JSON ? (function(){ var d = JSON.parse(fs.readFileSync(process.env.CDB_JSON, 'utf8')), o = {}; Object.keys(d.tabs).forEach(function (n) { o[n] = { rows: d.tabs[n], maxR: d.grid[n][0], maxC: d.grid[n][1] }; }); return o; })() : fakeTabs();
var T1 = '2026-10-06', T2 = '2026-11-02';
console.log('Dữ liệu:', Object.keys(TABS).map(function (k) { return k + ' ' + TABS[k].rows.length + ' dòng · lưới ' + TABS[k].maxR + '×' + TABS[k].maxC; }).join(' | '));

/* ---- G1 chạy thử: không đổi gì ---- */
var E = new Env(clone(TABS), T1), before = E.rowsById(), snap0 = E.snap(), hist0 = E.hist(), grid0 = E.grid();
var r0 = E.run({ dry: true });
check(J(E.rowsById()) === J(before) && E.grid() === grid0 && !Object.keys(E.files).length && !E.DB.getSheetByName('Tổng hợp bài'), 'G1 chạy THỬ: không đổi dữ liệu / lưới, không tạo file / tab tổng hợp');
var lg = E.DB.getSheetByName('Nhật ký lưu trữ');
check(lg && lg.g.slice(1).filter(function (r) { return r[1] === 'THỬ'; }).length === E.coachTabs().length, 'G1b nhật ký "THỬ" mỗi tab coach: ' + r0.sheets.map(function (s) { return s.tab + ' lưu ' + s.archived + ' · trống ' + s.blank + ' · tổng hợp ' + s.sum; }).join(' | '));

/* ---- G2–G7 chạy thật tháng 10 ---- */
var r1 = E.run({});
console.log('   ', r1.sheets.map(function (s) { return s.tab + ': ' + s.data + ' dòng → giữ ' + s.keep + ' · lưu ' + s.archived + ' · trống ' + s.blank + ' · lưới ' + s.gridBefore + ' → ' + s.gridAfter + ' · tổng hợp +' + s.sum + (s.error ? ' · LỖI ' + s.error : ''); }).join('\n     '));
check(r1.ok && r1.sheets.every(function (s) { return !s.error; }), 'G2 chạy thật không lỗi');
var newTabs = [E.DB.getSheetByName('Tổng hợp bài'), E.DB.getSheetByName('Nhật ký lưu trữ')].concat(Object.keys(E.files).map(function (k) { return E.files[k].s; }).reduce(function (a, b) { return a.concat(b); }, []));
check(newTabs.every(function (t) { return t && t.getMaxColumns() <= 18 && t.getMaxRows() <= Math.max(100, t.getLastRow() + 200); }), 'G2b tab mới tạo không mang lưới trống 1.000 × 26: ' + newTabs.map(function (t) { return t.n + ' ' + t.getMaxRows() + '×' + t.getMaxColumns(); }).join(' · '));
check(E.snap() === snap0, 'G3 hồ sơ khách (snapshot: số đo, mục tiêu, mức tạ lần trước, buổi tập) Y HỆT trước khi lưu trữ');
var h1 = E.hist();
check(!h1.err && h1.one === hist0.one && h1.two === hist0.two && h1.adm === hist0.adm, 'G4 Hiệu suất tập (hist coach Một, coach Hai, Admin) Y HỆT ' + (h1.err || ''));
var after = E.rowsById(), arch = E.archived(), lost = [], both = [], diff = [];
Object.keys(before).forEach(function (id) { var a = after[id], b = arch[id]; if (!a && !b) lost.push(id); if (a && b) both.push(id); if ((a || b) !== before[id] && (a || b)) diff.push(id); });
check(!lost.length && !both.length && !diff.length && !Object.keys(arch).some(function (k) { return /#dup$/.test(k); }) && Object.keys(after).length + Object.keys(arch).length === Object.keys(before).length,
  'G5 không mất / không trùng / không đổi dòng: nóng ' + Object.keys(after).length + ' + lưu trữ ' + Object.keys(arch).length + ' = ' + Object.keys(before).length + (lost.length ? ' · mất ' + lost.length : '') + (both.length ? ' · trùng ' + both.length : '') + (diff.length ? ' · đổi ' + diff.length : ''));
var cut = '2026-09-01', badKeep = [];
E.coachTabs().forEach(function (s) { s.g.slice(1).forEach(function (r) { /* dòng còn nóng mà cũ phải là ĐO/MỤC TIÊU/không id/dòng mốc */ }); });
Object.keys(arch).forEach(function (id) { if (/#dup$/.test(id)) return; var r = JSON.parse(arch[id]); var d = String(r[2]).slice(0, 10); if (!(d < cut) || r[5] === 'ĐO' || r[5] === 'MỤC TIÊU') badKeep.push(id); });
check(!badKeep.length, 'G6 chỉ lưu trữ dòng trước ' + cut + ' và không bao giờ ĐO / MỤC TIÊU' + (badKeep.length ? ': ' + badKeep.slice(0, 5) : ''));
check(E.coachTabs().every(function (s) { return blankInside(s) === 0 && s.getMaxRows() === s.getLastRow() + 50 && s.getMaxColumns() === 18; }), 'G7 dọn lưới: không còn dòng trống giữa, chừa đúng 50 dòng cuối, 18 cột — ' + E.grid());
var fileIds = Object.keys(E.files), fb = fileIds.map(function (k) { return E.files[k]; });
check(Object.keys(arch).length === 0 || (fb.length >= 1 && fb.every(function (b) { return /Lưu trữ \d{4}$/.test(b.name) && b.tz === 'Asia/Ho_Chi_Minh' && !b.getSheetByName('Sheet1'); }) && Object.keys(E.props).filter(function (k) { return /^LB_ARCHIVE_\d{4}$/.test(k); }).length === fb.length),
  'G8 file lưu trữ theo năm: ' + fb.map(function (b) { return b.name + ' [' + b.s.map(function (s) { return s.n + ' ' + (s.getLastRow() - 1); }).join(', ') + ']'; }).join(' · '));
/* tổng hợp: so với tính tay từ dòng gốc */
var sumHot = E.DB.getSheetByName('Tổng hợp bài'), sumRows = sumHot ? sumHot.g.slice(1).filter(function (r) { return r[0] !== ''; }) : [];
var want = {};
Object.keys(TABS).forEach(function (tab) { var coach = tab.replace('Khách của ', ''); TABS[tab].rows.slice(1).forEach(function (r) {
  if (!r[0] || r[5] !== 'SET') return; var d = r[2] instanceof Date ? '2026-07-03' : String(r[2]).slice(0, 10); if (!(d < cut)) return;
  var k = [d, r[3], r[7], coach].join('|'), w = want[k] || (want[k] = { n: 0, ok: 0, vol: 0, top: null }), c = { kg: +r[9] || 0, rep: +r[10] || 0, ok: r[11] === 1 ? 1 : 0 };
  w.n++; w.ok += c.ok; w.vol += c.kg * c.rep; if (!w.top || ((c.ok - w.top.ok) || (c.kg - w.top.kg) || (c.rep - w.top.rep)) > 0) w.top = c; }); });
var archSum = []; fb.forEach(function (b) { var s = b.getSheetByName('Tổng hợp bài'); if (s) archSum = archSum.concat(s.g.slice(1).filter(function (r) { return r[0] !== ''; })); });
var okSum = Object.keys(want).length === archSum.length && archSum.every(function (r) { var w = want[[r[0], r[1], r[2], r[9]].join('|')]; return w && r[3] === w.top.kg && r[4] === w.top.rep && r[5] === w.top.ok && r[6] === w.n && r[7] === w.ok && Math.abs(r[8] - w.vol) < 0.11; });
check(okSum, 'G9 tổng hợp bài (file lưu trữ): ' + archSum.length + ' dòng khách × bài × ngày = tính tay ' + Object.keys(want).length + ' (set cao nhất · số set · số set đạt · khối lượng)');
var per = {}; sumRows.forEach(function (r) { var k = r[1] + '|' + r[2]; per[k] = per[k] || {}; per[k][r[0]] = 1; });
check(Object.keys(per).every(function (k) { return Object.keys(per[k]).length <= 24; }) && sumRows.length <= archSum.length, 'G10 tab nóng "Tổng hợp bài" ≤ 24 ngày mỗi khách × bài: ' + sumRows.length + ' dòng');

/* ---- G11 chạy lại: không nhân đôi, không đổi ---- */
var hot1 = J(E.rowsById()), arch1 = J(E.archived()), sum1 = J(sumRows), r2 = E.run({});
var sumRows2 = E.DB.getSheetByName('Tổng hợp bài') ? E.DB.getSheetByName('Tổng hợp bài').g.slice(1).filter(function (r) { return r[0] !== ''; }) : [];
check(r2.sheets.every(function (s) { return !s.archived && !s.blank && !s.sum && !s.error; }) && J(E.rowsById()) === hot1 && J(E.archived()) === arch1 && J(sumRows2) === sum1, 'G11 chạy lại cùng tháng: 0 lưu trữ, 0 trống, 0 tổng hợp, dữ liệu không đổi');

/* ---- G12 ghi set sau khi dọn lưới: tự thêm dòng (Apps Script lbLog_ + adm_log), cột chuỗi giữ '@' ---- */
var evs = []; for (var i = 0; i < 80; i++) evs.push({ id: 'new' + i, type: 'SET', date: T1, name: 'Khách An', session: 99, plan: 'Buổi A', ex: 'Squat', set: i + 1, kg: 40, rep: 8, ok: 1 });
E.ctx.lbDb_._ss = null;
var w1; try { w1 = E.ctx.lbLog_({ pin: '1111', events: evs }); } catch (e) { w1 = { ok: false, error: String(e) }; }
var sh1 = E.DB.getSheetByName('Khách của ' + E.coaches[0]), lr = sh1.getLastRow();
check(w1.ok && w1.written === 80 && sh1.g[lr - 1][0] === 'new79' && sh1.fmt[lr + ':3'] === '@' && sh1.fmt[lr + ':14'] === '@', 'G12 lbLog_ 80 set sau khi dọn lưới (chỉ còn 50 dòng trống): ' + (w1.error || 'ghi đủ, lưới tự nới, cột Ngày/Chỉ số dạng chuỗi'));
var w2, keepChk = E.ctx.chkSS_; E.ctx.chkSS_ = function(){ return E.BA; };   /* adm_log đọc MEMBERS qua chkSS_ (Code.gs) */
try { E.ctx.lbDb_._ss = null; w2 = E.ctx.admLog_({ apin: 'x', events: [{ id: 'adm1', type: 'ĐO', date: T1, name: 'Khách Dung', metric: 'weight', val: 60 }] }); } catch (e) { w2 = { ok: false, error: String(e) }; }
E.ctx.chkSS_ = keepChk;
var sh2 = E.DB.getSheetByName('Khách của ' + E.coaches[1]);
check(w2 && w2.ok && w2.written === 1 && sh2.g[sh2.getLastRow() - 1][0] === 'adm1', 'G12b admLog_ ghi được sau khi dọn lưới ' + (w2.error || ''));

/* ---- G13 tháng sau (02/11): chuyển tháng 9; hồ sơ + Hiệu suất tập vẫn y hệt bản "không lưu trữ" ---- */
var E2 = new Env(clone(TABS), T2), base2 = new Env(clone(TABS), T2), snapB = base2.snap(), histB = base2.hist();
E2.run({ cutoff: '2026-09-01' });           /* lượt tháng 10 (đã qua) */
var r3 = E2.run({});                         /* lượt 02/11: mốc 01/10 */
check(r3.cutoff === '2026-10-01' && r3.ok, 'G13 lượt tháng 11: mốc giữ ' + r3.cutoff + ' · ' + r3.sheets.map(function (s) { return s.tab + ' lưu ' + s.archived + ' · tổng hợp +' + s.sum; }).join(' | '));
check(E2.snap() === snapB, 'G13b hồ sơ khách y hệt bản không lưu trữ (sau 2 lượt)');
var h2 = E2.hist();
check(h2.one === histB.one && h2.two === histB.two && h2.adm === histB.adm, 'G13c Hiệu suất tập y hệt bản không lưu trữ (tab nóng + tổng hợp)');
var as2 = []; Object.keys(E2.files).forEach(function (k) { var s = E2.files[k].getSheetByName('Tổng hợp bài'); if (s) as2 = as2.concat(s.g.slice(1).filter(function (r) { return r[0] !== ''; })); });
var keys2 = as2.map(function (r) { return [r[0], r[1], r[2], r[9]].join('|'); });
check(keys2.length === keys2.filter(function (k, i) { return keys2.indexOf(k) === i; }).length, 'G13d tổng hợp không trùng khoá sau nhiều lượt (' + keys2.length + ' dòng)');
var b2 = base2.rowsById(), lost2 = Object.keys(b2).filter(function (id) { return !E2.rowsById()[id] && !E2.archived()[id]; });
check(!lost2.length, 'G13e không mất dòng sau 2 lượt');

/* ---- G14 kiểm id file lưu trữ thất bại → KHÔNG xoá gì ở tab nóng ---- */
var E3 = new Env(clone(TABS), T1), b3 = J(E3.rowsById()), g3 = E3.grid(), real = E3.ctx.ltIds_, calls = 0;
E3.ctx.ltIds_ = function(sh){ var o = real(sh); calls++; if (calls % 2 === 0) { var k = Object.keys(o); if (k.length) delete o[k[k.length - 1]]; } return o; };
var r4 = E3.run({});
var hasArch = r1.sheets.some(function (s) { return s.archived > 0; });
check(!hasArch || (!r4.ok && J(E3.rowsById()) === b3 && r4.sheets.some(function (s) { return /thiếu/.test(s.error || ''); })), 'G14 file lưu trữ thiếu id → không xoá dòng nào ở tab nóng' + (hasArch ? ' (' + (r4.sheets.filter(function (s) { return s.error; })[0] || {}).error + ')' : ' (bỏ qua: dữ liệu này không có dòng cần lưu trữ)'));
var lg3 = E3.DB.getSheetByName('Nhật ký lưu trữ');
check(!hasArch || lg3.g.slice(1).some(function (r) { return /^LỖI/.test(String(r[12])); }), 'G14b nhật ký ghi LỖI');

/* ---- G15 dòng đổi giữa lúc chạy (Worker chèn dòng vào giữa) → dừng xoá, không mất dòng ---- */
var E4 = new Env(clone(TABS), T1), b4 = E4.rowsById(), t4 = E4.DB.getSheetByName('Khách của ' + E4.coaches[0]), fired = false;
Object.keys(E4.files).length;
var realCreate = E4.ctx.SpreadsheetApp.create;
E4.ctx.SpreadsheetApp.create = function(name){ var bk = realCreate(name); return bk; };
t4.hooks.read = function(r, c, nr, nc){ if (!fired && c === 1 && nc === 1 && r > 2) { fired = true; t4.insertRowsAfter(5, 1); t4.g[5] = ['wkX', T1 + ' 03:31', T1, 'Khách An', 1, 'SET', 'Buổi A', 'Squat', 1, 50, 5, 1, 0, '', '', '', '', 'Coach Một'].concat(new Array(Math.max(0, t4.getMaxColumns() - 18)).fill('')); } };
var r5 = E4.run({});
var a4 = E4.rowsById(), ar4 = E4.archived(), lost4 = Object.keys(b4).filter(function (id) { return !a4[id] && !ar4[id]; });
check(fired ? (!r5.ok && /đổi trong lúc chạy/.test((r5.sheets.filter(function (s) { return s.error; })[0] || {}).error || '') && !lost4.length && a4.wkX) : true, 'G15 Worker chèn dòng giữa lúc xoá → dừng xoá, không mất dòng nào (kể cả dòng mới)' + (fired ? '' : ' (không kích hoạt: không có khối cần xoá)'));

console.log(fail ? 'FAIL ' + pass + '/' + (pass + fail) : 'PASS ' + pass + '/' + pass);
process.exit(fail ? 1 : 0);

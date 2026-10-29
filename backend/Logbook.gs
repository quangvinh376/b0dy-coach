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
   v2.11 (29/10/2026): action 'coach' gộp các dòng MEMBERS cùng tên (khách gia
   hạn) thành MỘT khách — lbOnePerName_, cùng luật với Admin. README mục 9.
   v2.12 (29/10/2026): NHẬN DIỆN KHÁCH THEO MÃ, không theo tên (cùng luật Worker v10).
   Người = mọi dòng MEMBERS cùng SĐT; SESSION LOG cột Q "Mã KH" (ghi lúc check-in),
   Customer database cột S "Mã KH" (ghi kèm từng sự kiện). README mục 10.
   ===================================================================== */
var LB_DB_ID  = '19iWnTT5eWFKCJ9Mnzuv_pcF1MMH4XGnx60Uc0OXMmeM';
var LB_PREFIX = 'Khách của ';
var LB_LIB    = 'Bài tập';
var LB_TZ     = 'Asia/Ho_Chi_Minh';
var LB_HEAD   = ['id','Ghi lúc','Ngày','Khách','Buổi #','Loại','Buổi tập','Bài tập','Set #','KG','REP','Đạt','Bài chính','Chỉ số','Giá trị','Form','Ghi chú','Coach','Mã KH'];
var LB_W      = LB_HEAD.length; /* v2.12: 19 cột A..S (S = Mã KH của người tại ngày sự kiện) */

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
  /* v2.8: chỉ định dạng lưới đang có (trước: ép 5.000 dòng → lưới trống khổng lồ); dòng thêm sau do lbAppend_ định dạng */
  var R = Math.max(2, sh.getMaxRows());
  sh.getRange(1, 1, R, 4).setNumberFormat('@');       /* id, Ghi lúc, Ngày, Khách = chuỗi */
  sh.getRange(1, 14, R, 1).setNumberFormat('@');      /* Chỉ số */
}
/* v2.8 — ghi nối đuôi sau dòng dữ liệu cuối; TỰ thêm dòng khi lưới hết chỗ (từ khi Archive.gs dọn lưới trống,
   tab coach chỉ chừa ~50 dòng trống — getRange(n + 1) vượt lưới sẽ lỗi). Dòng mới: cột A–D + N dạng chuỗi. */
var LB_GROW = 200;
/* v2.12: tab cũ chỉ có 18 cột (A..R, lưới đã thu gọn) → thêm cột S + tiêu đề "Mã KH" trước khi ghi 19 cột */
function lbWiden_(sh) {
  var mc = sh.getMaxColumns();
  if (mc < LB_W) sh.insertColumnsAfter(mc, LB_W - mc);
  var h = sh.getRange(1, LB_W).getValue();
  if (sh.getLastRow() > 0 && String(h || '') === '') sh.getRange(1, LB_W).setValue(LB_HEAD[LB_W - 1]).setFontWeight('bold');
}
function lbAppend_(sh, rows) {
  if (!rows || !rows.length) return 0;
  lbWiden_(sh);
  var n = sh.getLastRow(), need = n + rows.length, max = sh.getMaxRows();
  if (max < need) {
    var add = need - max + LB_GROW;
    sh.insertRowsAfter(max, add);
    sh.getRange(max + 1, 1, add, 4).setNumberFormat('@');
    sh.getRange(max + 1, 14, add, 1).setNumberFormat('@');
  }
  sh.getRange(n + 1, 1, rows.length, LB_W).setValues(rows);
  return rows.length;
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
    var v = sh.getRange(2, 1, n - 1, Math.min(LB_W, sh.getMaxColumns())).getValues();   /* v2.12: tab chưa có cột S → đọc A..R */
    for (var i = 0; i < v.length; i++) {
      var r = v[i];
      if (!r[0]) continue;
      out.push({ id: String(r[0]), ts: String(r[1]), date: lbKey_(r[2]), name: String(r[3]).trim(), session: lbNum_(r[4]),
        type: String(r[5]).trim(), plan: String(r[6]).trim(), ex: String(r[7]).trim(), set: lbNum_(r[8]),
        kg: lbNum_(r[9]), rep: lbNum_(r[10]), ok: lbNum_(r[11]), main: lbNum_(r[12]),
        metric: String(r[13]).trim(), val: lbNum_(r[14]), form: lbNum_(r[15]), note: String(r[16]), coach: String(r[17]),
        code: String(r[18] == null ? '' : r[18]).trim() });
    }
  });
  return out;
}

/* ---------- gom sự kiện thành snapshot cho từng khách ----------
   v2.12: theo NGƯỜI (cột S Mã KH → tên thuộc đúng một người); keyOf = { pid: khoá trả app } (idKeys_) */
function lbSnapshot_(events, I, keyOf) {
  var snap = {}, names = keyOf === undefined ? I : null;    /* gọi kiểu cũ lbSnapshot_(events, {tên: 1}) → theo tên (test cũ, công cụ) */
  events.sort(function (a, b) { return (a.date < b.date) ? -1 : (a.date > b.date) ? 1 : (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0); });
  events.forEach(function (e) {
    var k;
    if (names) { if (!names[e.name]) return; k = e.name; }
    else { var P = idOfLog_(I, 0, e.code, e.name); if (!P || !(P.pid in keyOf)) return; k = keyOf[P.pid]; }
    var c = snap[k] || (snap[k] = { measures: {}, target: {}, main: '', last: {}, plans: {}, ex: {} });
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
    list.push(idTag_({ name: name, total: Number(vals[r][iTotal]) || 0, done: Number(vals[r][iDone]) || 0, left: Math.max(0, left),
      coach: String(vals[r][iCoach] || ''), start: iStart >= 0 ? dk(vals[r][iStart]) : '', end: end, exp: end,
      kind: iKind >= 0 ? String(vals[r][iKind] || '').trim() : '',
      pkg: iPkg >= 0 ? String(vals[r][iPkg] || '').trim() : '',
      status: iStatus >= 0 ? String(vals[r][iStatus] || '').trim() : '' }, r + 1));   /* v2.12: _r = số dòng MEMBERS như cột P */
  }
  list.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  return { ok: true, members: list };
}

/* v2.11 (29/10/2026): MEMBERS có thể nhiều dòng cùng tên (khách gia hạn: dòng gói cũ hết buổi + dòng gói mới; giai đoạn A/B
   cùng coach). Giữ dòng CÒN BUỔI cuối cùng, không có thì dòng cuối. v2.12: không còn dùng ở 'coach' (thay bằng idPick_ theo
   NGƯỜI) — giữ lại cho test cũ. */
function lbOnePerName_(list) {
  var pick = {}, order = [];
  (list || []).forEach(function (m) {
    var k = String(m.name).trim(), cur = pick[k];
    if (!cur) { pick[k] = m; order.push(k); return; }
    if (m.left > 0 || !(cur.left > 0)) pick[k] = m;
  });
  return order.map(function (k) { return pick[k]; });
}

/* =====================================================================
   v2.12 (29/10/2026) — NHẬN DIỆN KHÁCH THEO MÃ (cùng luật Worker v10)
   MEMBERS = mỗi gói / giai đoạn một dòng. NGƯỜI = mọi dòng cùng SĐT (cột "SĐT"; trống → theo "Mã KH",
   không có mã → theo tên). pid = Mã KH đầu tiên của người — gửi app thay SĐT (SĐT KHÔNG BAO GIỜ rời máy chủ).
   Dòng SESSION LOG → người: cột P "_mrow" (công thức sheet đã tra) → cột Q "Mã KH" → tên (chỉ khi tên thuộc MỘT người).
   Sự kiện nhật ký → người: cột S "Mã KH" → tên (một người). Khoá trả app (`key`) = tên nếu trong phạm vi trả về chỉ
   MỘT người mang tên đó (app cũ chạy y nguyên), trùng tên → pid.
   ===================================================================== */
function idTag_(o, r) { Object.defineProperty(o, '_r', { value: r, enumerable: false, configurable: true, writable: true }); return o; }
function idPhone_(v) {
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.indexOf('84') === 0) d = '0' + d.slice(2);
  if (d.length === 9) d = '0' + d;
  return d;
}
function idReset_() { idRead_._I = null; idRead_._ss = null; }
function idRead_(ss) {
  ss = ss || chkSS_();
  if (idRead_._I && idRead_._ss === ss) return idRead_._I;
  var I = { ok: false, rows: [], persons: [], byCode: {}, byMrow: {}, byPid: {}, byName: {} };
  var sh = null;
  try { sh = ss.getSheetByName('MEMBERS'); } catch (e) { sh = null; }   /* không đọc được MEMBERS → mọi thứ theo tên như trước v2.12 */
  if (!sh) return I;
  var hr = memHdrRow_(sh), lastC = sh.getLastColumn();
  var h = sh.getRange(hr, 1, 1, lastC).getValues()[0].map(lbNorm_);
  var iN = h.indexOf('ten'), iC = h.indexOf('coach'), iL = h.indexOf('con lai'), iU = h.indexOf('ma kh'), iI = h.indexOf('sdt'), iS = -1;
  for (var c = 0; c < h.length; c++) if (iS < 0 && h[c].indexOf('bat dau') >= 0) iS = c;
  if (iN < 0) return I;
  var last = (typeof admLastRow_ === 'function') ? admLastRow_(sh, iN + 1, hr + 1) : sh.getLastRow();
  var v = last > hr ? sh.getRange(hr + 1, 1, last - hr, lastC).getValues() : [];
  var tz = ss.getSpreadsheetTimeZone(), byKey = {};
  for (var r = 0; r < v.length; r++) {
    var name = String(v[r][iN] == null ? '' : v[r][iN]).trim();
    if (!name) continue;
    var code = iU >= 0 ? String(v[r][iU] == null ? '' : v[r][iU]).trim() : '', st = iS >= 0 ? v[r][iS] : '';
    var x = { mrow: r + 1, name: name, coach: iC >= 0 ? String(v[r][iC] || '').trim() : '', code: code,
              left: iL >= 0 ? (Number(v[r][iL]) || 0) : 0, start: (st instanceof Date) ? Utilities.formatDate(st, tz, 'yyyy-MM-dd') : lbKey_(st) };
    var pk = idPhone_(iI >= 0 ? v[r][iI] : '') || (code ? 'c:' + code : 'n:' + lbNorm_(name));
    var P = byKey[pk];
    if (!P) { P = byKey[pk] = { pid: '', rows: [] }; I.persons.push(P); }
    P.rows.push(x); x.P = P;
    I.rows.push(x);
    I.byMrow[x.mrow] = x;
    if (code && !I.byCode[code]) I.byCode[code] = x;
  }
  I.persons.forEach(function (P) {
    var cur = null;
    P.rows.forEach(function (x) { if (!cur || x.left > 0 || !(cur.left > 0)) cur = x; });   /* dòng còn buổi cuối, không có thì dòng cuối */
    var c0 = P.rows.filter(function (x) { return x.code; })[0];
    P.pid = c0 ? c0.code : P.rows[0].name;
    P.cur = cur; P.name = cur.name; P.owner = P.rows[P.rows.length - 1].coach;                /* coach hiện hành = dòng cuối (như memberCoachMap_) */
    if (!I.byPid[P.pid]) I.byPid[P.pid] = P;
    var seen = {};
    P.rows.forEach(function (x) { var k = lbNorm_(x.name); if (seen[k]) return; seen[k] = 1; (I.byName[k] = I.byName[k] || []).push(P); });
  });
  I.ok = true;
  idRead_._I = I; idRead_._ss = ss;
  return I;
}
/* Mã KH của người tại ngày d (yyyy-MM-dd): dòng có "Ngày bắt đầu" ≤ d muộn nhất (đúng luật công thức cột P), không có thì dòng hiện hành */
function idCodeAt_(P, d) {
  var best = null;
  P.rows.forEach(function (x) { if (x.code && x.start && x.start <= d && (!best || x.start > best.start)) best = x; });
  return (best || P.cur).code;
}
function idOfLog_(I, mrow, code, name) {
  var m = Number(mrow);
  if (m > 0 && I.byMrow[m]) return I.byMrow[m].P;
  var c = String(code == null ? '' : code).trim();
  if (c && I.byCode[c]) return I.byCode[c].P;
  var l = I.byName[lbNorm_(name)] || [];
  return l.length === 1 ? l[0] : null;
}
/* khách app gửi lên → người: pid (hoặc key = pid) trước; app cũ chỉ gửi tên → người mang tên đó trong pool (đúng một) */
function idFind_(I, p, pool) {
  var ids = [String(p.pid || '').trim(), String(p.key || '').trim()];
  for (var i = 0; i < ids.length; i++) if (ids[i] && I.byPid[ids[i]]) return { P: I.byPid[ids[i]], n: 1 };
  var all = I.byName[lbNorm_(p.name)] || [], l = pool ? all.filter(pool) : all;
  return l.length === 1 ? { P: l[0], n: 1 } : { P: null, n: l.length };
}
/* danh sách dòng MEMBERS (có _r) → MỘT dòng mỗi người (còn buổi cuối, không có thì dòng cuối, theo thứ tự sheet); m._P = người */
function idPick_(I, list) {
  var by = {}, order = [];
  list.slice().sort(function (a, b) { return (a._r || 0) - (b._r || 0); }).forEach(function (m) {
    var x = I.byMrow[m._r], k = x ? 'p:' + x.P.pid : 'n:' + String(m.name).trim(), cur = by[k];
    if (!cur) { by[k] = m; order.push(k); Object.defineProperty(m, '_P', { value: x ? x.P : null, enumerable: false, configurable: true, writable: true }); return; }
    if (m.left > 0 || !(cur.left > 0)) { Object.defineProperty(m, '_P', { value: cur._P, enumerable: false, configurable: true, writable: true }); by[k] = m; }
  });
  var out = order.map(function (k) { return by[k]; });
  out.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi') || (a._r || 0) - (b._r || 0); });
  return out;
}
/* gắn pid + key cho danh sách trả app; trả { pid: key } */
function idKeys_(list) {
  var cnt = {}, keyOf = {};
  list.forEach(function (m) { var k = lbNorm_(m.name); cnt[k] = (cnt[k] || 0) + 1; });
  list.forEach(function (m) {
    var P = m._P;
    m.pid = P ? P.pid : m.name;
    m.key = (P && cnt[lbNorm_(m.name)] > 1) ? P.pid : m.name;
    if (P) keyOf[P.pid] = m.key;
  });
  return keyOf;
}
/* cùng luật idPick_ + idKeys_ nhưng chạy thẳng trên MEMBERS (stats không cần cả danh sách khách). keep(x) lọc dòng. */
function idScopeKeys_(I, keep) {
  var pick = {}, order = [];
  I.rows.forEach(function (x) {
    if (keep && !keep(x)) return;
    var cur = pick[x.P.pid];
    if (!cur) { pick[x.P.pid] = x; order.push(x.P); return; }
    if (x.left > 0 || !(cur.left > 0)) pick[x.P.pid] = x;
  });
  var cnt = {}, keyOf = {};
  order.forEach(function (P) { var k = lbNorm_(pick[P.pid].name); cnt[k] = (cnt[k] || 0) + 1; });
  order.forEach(function (P) { var nm = pick[P.pid].name; keyOf[P.pid] = cnt[lbNorm_(nm)] > 1 ? P.pid : nm; });
  return keyOf;
}
/* khoá app của một người trong phạm vi keyOf; người ngoài phạm vi → tên hiện hành */
function idKeyOf_(keyOf, P, name) { return P ? ((P.pid in keyOf) ? keyOf[P.pid] : P.name) : String(name || '').trim(); }

/* =====================================================================
   action 'coach' — PIN → coach + khách của coach + snapshot + thư viện.
   Một lượt lấy hết để client cache; KHÔNG khoá IP (xem hồ sơ/nhập liệu
   được từ ngoài phòng). v2.12: khách = NGƯỜI có dòng của coach này.
   ===================================================================== */
function lbCoach_(p) {
  var coach = lbCoachByPin_(p && p.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  var mem = lbMembers_(true);                     /* BA: {ok, members:[{name,total,done,left,coach,start,end,exp,kind,pkg,status}]} — cả khách đã hết gói (v2.2) */
  if (!mem || !mem.ok) return { ok: false, error: (mem && mem.error) || 'members_failed' };
  var I = idRead_(), cn = lbNorm_(coach);
  var mine = idPick_(I, (mem.members || []).filter(function (m) { return lbNorm_(m.coach) === cn; }));
  var keyOf = idKeys_(mine);
  var snap = lbSnapshot_(lbReadAll_(), I, keyOf);
  /* đã check-in hôm nay (bất kỳ thiết bị/kiosk nào) → checked + giờ ký — chỉ khi người ĐANG thuộc coach này (v2.11) */
  var sg = lbSignedToday_(I);
  mine.forEach(function (m) {
    var P = m._P, t = P ? sg[P.pid] : undefined;
    if (t !== undefined && lbNorm_(P.owner) === cn) { m.checked = true; m.signed = t; }
  });
  return { ok: true, coach: coach, members: mine, snapshot: snap, library: lbLibrary_(), today: lbToday_(),
           server: Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm') };
}

/* SESSION LOG hôm nay → {pid: 'HH:mm'} (giờ lấy từ cột "Ký điện tử" "app HH:MM · ký: …", không có thì ''). Lỗi → {} */
function lbSignedToday_(I) {
  try {
    var ss = chkSS_(), sh = ss.getSheetByName('SESSION LOG'); if (!sh) return {};
    I = I || idRead_(ss);
    var L = statsLogCols_(sh), n = sh.getLastRow(); if (n < L.r1) return {};   /* v2.9: cột theo tiêu đề (cột lề A) */
    var v = sh.getRange(L.r1, 1, n - L.r1 + 1, L.w).getValues();
    var tz = ss.getSpreadsheetTimeZone(), today = lbToday_(), out = {};
    for (var i = 0; i < v.length; i++) {
      var d = v[i][L.d]; if (!d) continue;
      var k = (d instanceof Date) ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : lbKey_(d);
      if (k !== today) continue;
      var name = String(v[i][L.n] || '').trim(); if (!name) continue;    /* Học viên */
      var P = idOfLog_(I, L.mr >= 0 ? v[i][L.mr] : '', L.q >= 0 ? v[i][L.q] : '', name); if (!P) continue;
      var m = String(v[i][L.sig] || '').match(/(\d{1,2}):(\d{2})/);      /* Ký điện tử */
      out[P.pid] = m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : '';
    }
    return out;
  } catch (e) { return {}; }
}

/* =====================================================================
   v2.12 — ghi MỘT dòng check-in (đã ký) cho người P: ngày (CHUỖI M/d/yyyy) · tên (như MEMBERS) · "Đã tập" ·
   "app HH:mm<tag>" · cột Q "Mã KH" (gói hiệu lực hôm nay). Chặn trùng theo NGƯỜI (dòng Hủy coi như chưa).
   Dùng chung cho lbCheckin_ (coach) và admCheckin_ (Admin). Ghi xong đọc lại chính dòng đó.
   ===================================================================== */
function idCheckinWrite_(I, P, tag) {
  chkInit_();
  var today = Utilities.formatDate(new Date(), CHECKIN.TZ, 'yyyy-MM-dd');
  var code = idCodeAt_(P, today), row0 = code ? I.byCode[code] : null, name = row0 ? row0.name : P.name;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ix = admLogB_();
    if (!ix) return { ok: false, error: 'khong_thay_SESSION_LOG' };
    var log = ix.log, R1 = ix.R1, L = statsLogCols_(log), W = Math.max(CHECKIN.WIDTH || 0, L.w), cnt = ix.last - R1 + 1;
    var vals = cnt > 0 ? log.getRange(R1, 1, cnt, W).getValues() : [];
    var firstEmpty = -1;
    for (var r = 0; r < vals.length; r++) {
      var d = vals[r][CHECKIN.COL_DATE - 1];
      if (d instanceof Date) {
        if (Utilities.formatDate(d, CHECKIN.TZ, 'yyyy-MM-dd') === today &&
            String(vals[r][CHECKIN.COL_STATUS - 1]).trim() !== CHECKIN.ST_CANCEL &&
            idOfLog_(I, L.mr >= 0 ? vals[r][L.mr] : '', L.q >= 0 ? vals[r][L.q] : '', vals[r][CHECKIN.COL_NAME - 1]) === P) {
          return { ok: false, error: 'da_checkin', status: String(vals[r][CHECKIN.COL_STATUS - 1]).trim() };
        }
      } else if (firstEmpty < 0 && String(d) === '' && String(vals[r][CHECKIN.COL_NAME - 1]) === '') {
        firstEmpty = r + R1;
      }
    }
    if (firstEmpty < 0) firstEmpty = vals.length + R1;
    var now = new Date(), hm = Utilities.formatDate(now, CHECKIN.TZ, 'HH:mm');
    /* Ghi dạng chuỗi M/d/yyyy để Sheets (locale US) tự parse thành ngày — giống nhập tay, KHÔNG setValue(Date) */
    log.getRange(firstEmpty, CHECKIN.COL_DATE).setValue(Utilities.formatDate(now, CHECKIN.TZ, 'M/d/yyyy'));
    log.getRange(firstEmpty, CHECKIN.COL_NAME).setValue(name);
    log.getRange(firstEmpty, CHECKIN.COL_STATUS).setValue(CHECKIN.ST_OK);
    log.getRange(firstEmpty, CHECKIN.COL_NOTE).setValue('app ' + hm + tag);
    if (L.q >= 0) log.getRange(firstEmpty, L.q + 1).setValue(code);
    SpreadsheetApp.flush();
    var back = log.getRange(firstEmpty, 1, 1, W).getValues()[0];
    if (String(back[CHECKIN.COL_NAME - 1]).trim() !== name || String(back[CHECKIN.COL_STATUS - 1]).trim() !== CHECKIN.ST_OK) {
      return { ok: false, error: 'dong_bi_chiem', row: firstEmpty };     /* máy khác ghi đè đúng lúc — client báo lỗi, thử lại sẽ chặn trùng */
    }
    return { ok: true, row: firstEmpty, at: hm, code: code, mrow: row0 ? row0.mrow : 0, name: name };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
   action 'checkin_coach' — check-in + ký PIN coach trong MỘT lượt.
   Chặn IP ngoài phòng (luật của chủ studio: chỉ check-in mới khoá IP).
   Kiểm tra khách thuộc coach TRƯỚC khi ghi để không để lại dòng treo.
   KHÔNG BAO GIỜ auto-retry lệnh này từ client.
   v2.12: người theo pid (app mới) / tên đang thuộc coach này (app cũ, đúng một người); ghi cột Q "Mã KH"
   bằng idCheckinWrite_ (không còn qua apiCheckin_ + apiSign_ của Code.gs — hai hàm đó chặn trùng theo tên).
   ===================================================================== */
function lbCheckin_(p) {
  var coach = lbCoachByPin_(p && p.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  if (!ipOk_(p)) return { ok: false, error: 'wrong_ip' };
  var name = String(p.name || '').trim();
  if (!name && !p.pid) return { ok: false, error: 'thieu_ten' };
  var I = idRead_(), cn = lbNorm_(coach);
  var f = idFind_(I, p, function (X) { return lbNorm_(X.owner) === cn; });
  if (!f.P) return { ok: false, error: f.n > 1 ? 'trung_ten' : 'khong_phai_khach_cua_ban' };
  if (lbNorm_(f.P.owner) !== cn) return { ok: false, error: 'khong_phai_khach_cua_ban' };
  var w = idCheckinWrite_(I, f.P, ' · ký: ' + coach);
  if (!w.ok) return w;
  idReset_();
  var me = null;
  try { var mem2 = lbMembers_(true); if (mem2 && mem2.ok) mem2.members.forEach(function (x) { if (w.mrow ? x._r === w.mrow : x.name === w.name) me = x; }); } catch (e) {}
  if (me) { me.pid = f.P.pid; if (p.key) me.key = String(p.key); }
  return { ok: true, row: w.row, member: me, coach: coach, at: w.at };
}

/* =====================================================================
   action 'log' — ghi batch sự kiện vào sheet của coach; id trùng bị bỏ
   qua (client được phép gửi lại thoải mái). Không khoá IP.
   events: [{id, type, date, name, pid?, session, plan, ex, set, kg, rep, ok, main, metric, val, form, note}]
   v2.12: cột S = Mã KH của người tại ngày sự kiện (pid; app cũ: tên thuộc đúng một người của coach / của phòng).
   ===================================================================== */
function lbEvRow_(e, now, who, code, by) {
  return [String(e.id), now, lbKey_(e.date || lbToday_()), who, e.session == null ? '' : Number(e.session),
    String(e.type || ''), e.plan || '', e.ex || '', e.set == null ? '' : Number(e.set),
    e.kg == null ? '' : Number(e.kg), e.rep == null ? '' : Number(e.rep), e.ok == null ? '' : (String(e.type) === 'BÀI' ? Number(e.ok) : (e.ok ? 1 : 0)),
    e.main == null ? '' : (e.main ? 1 : 0), e.metric || '', e.val == null ? '' : Number(e.val),
    e.form == null ? '' : Number(e.form), e.note || '', by, code || ''];
}
function idWho_(I, e, pool) {
  var f = idFind_(I, e, pool), P = f.P || (pool ? idFind_(I, e).P : null);
  return P ? { P: P, code: idCodeAt_(P, lbKey_(e.date || lbToday_())) } : { P: null, code: '' };
}
function lbLog_(p) {
  var coach = lbCoachByPin_(p && p.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  var ev = (p && p.events) || [];
  if (!ev.length) return { ok: true, written: 0, dup: 0 };
  if (ev.length > 200) return { ok: false, error: 'qua_nhieu' };
  var I = idRead_(), cn = lbNorm_(coach);
  var mine = function (X) { return X.rows.some(function (x) { return lbNorm_(x.coach) === cn; }); };
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
      rows.push(lbEvRow_(e, now, String(e.name || '').trim(), idWho_(I, e, mine).code, coach));
    });
    if (rows.length) lbAppend_(sh, rows);                 /* v2.8: tự thêm dòng khi lưới hết chỗ · v2.12: tự thêm cột S */
    return { ok: true, written: rows.length, dup: dup };
  } finally {
    lock.releaseLock();
  }
}

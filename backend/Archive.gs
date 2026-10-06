/* =====================================================================
   B0DY · Coach app — Archive.gs (v2.8 · 06/10/2026) — LƯU TRỮ GỌN Customer database
   Thêm file này vào project Apps Script "B0DY Discord KPI" (cạnh Logbook.gs, Stats.gs, Admin.gs).

   Bước 0 — dọn lưới: xoá dòng trống giữa dữ liệu + lưới trống cuối tab coach (chừa LT_BUF dòng), cột thừa sau R.
   Bước 2 — tầng nóng / lạnh: tab "Khách của <coach>" chỉ giữ THÁNG NÀY + THÁNG TRƯỚC. Dòng cũ hơn chuyển sang
            file lưu trữ theo năm "[B0DY Studio] Customer database · Lưu trữ <năm>" (cùng tên tab, cùng 18 cột),
            kèm tab "Tổng hợp bài" (1 dòng = khách × bài × ngày: set cao nhất · số set · số set đạt · khối lượng).
            Tab nóng "Tổng hợp bài" giữ 24 ngày gần nhất mỗi khách × bài → Hiệu suất tập vẫn đủ lịch sử.
   GIỮ LẠI ở tab nóng dù cũ (để hồ sơ khách trên app y hệt trước khi lưu trữ — Worker + Apps Script đọc tab nóng):
     · mọi dòng ĐO / MỤC TIÊU (số đo, mục tiêu)
     · dòng SET mới nhất mỗi khách × bài, dòng SET Đạt có KG mới nhất mỗi khách × bài (mức tạ lần trước)
     · dòng mới nhất mỗi khách × buổi tập (BÀI / CHECKOUT / SET có "Buổi tập")
     · dòng không có id hoặc ngày đọc không được (không đoán)
   An toàn: ghi file lưu trữ TRƯỚC, đọc lại kiểm đủ id rồi mới xoá ở tab nóng; xoá từng khối từ dưới lên, kiểm lại id
   từng khối ngay trước khi xoá (lệch → dừng, ghi nhật ký). Chạy lại nhiều lần không nhân đôi (bỏ id đã có ở file lưu trữ,
   bỏ tổng hợp đã có). Mọi lượt chạy ghi một dòng/tab vào tab "Nhật ký lưu trữ".

   Hàm chạy (KHÔNG bấm Run trong editor — đặt trigger ở trang Triggers):
     lbArchiveMonthly()  — trigger theo tháng: ngày 1, 3–4 giờ sáng
     lbArchiveDryRun()   — chỉ tính + ghi nhật ký "THỬ", không đổi dữ liệu
   ===================================================================== */
var LT_SUM      = 'Tổng hợp bài';
var LT_SUM_HEAD = ['Ngày','Khách','Bài tập','KG','REP','Đạt','Số set','Số set đạt','Khối lượng','Coach'];
var LT_SUM_DAYS = 24;          /* tab nóng: 24 ngày gần nhất mỗi khách × bài (= số ngày Stats trả cho Hiệu suất tập) */
var LT_LOG      = 'Nhật ký lưu trữ';
var LT_LOG_HEAD = ['Lúc','Chế độ','Tab','Mốc giữ từ','Dòng có dữ liệu','Giữ','Lưu trữ','Dòng trống xoá','Lưới trước','Lưới sau','Tổng hợp thêm','File lưu trữ','Ghi chú'];
var LT_BUF      = 50;          /* dòng trống chừa cuối tab coach */
var LT_PROP     = 'LB_ARCHIVE_';  /* Script Property: LB_ARCHIVE_<năm> = id file lưu trữ */
var LT_FILE     = '[B0DY Studio] Customer database · Lưu trữ ';
var LT_NEW      = 100;         /* tab mới tạo (tổng hợp, nhật ký, tab lưu trữ): 100 dòng, đúng số cột */

function lbArchiveMonthly() { return ltRun_({ dry: false }); }
function lbArchiveDryRun()  { return ltRun_({ dry: true }); }

/* mốc giữ: ngày 1 của tháng trước (tháng này + tháng trước ở tab nóng) */
function ltCutoff_(today) {
  var y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + ('0' + m).slice(-2) + '-01';
}
function ltBlank_(r) { for (var i = 0; i < r.length; i++) if (r[i] !== '' && r[i] != null) return false; return true; }
function ltOk_(v) { return lbNum_(v) === 1; }
/* set cao nhất trong ngày — cùng luật perfDays của app: Đạt trước, nặng hơn, nhiều rep hơn */
function ltBetter_(a, b) { return (a.ok - b.ok) || (a.kg - b.kg) || (a.rep - b.rep); }

function ltRun_(o) {
  o = o || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var rep = { ok: true, dry: !!o.dry, cutoff: o.cutoff || ltCutoff_(lbToday_()), sheets: [] };
  try {
    var db = lbDb_(), tz = db.getSpreadsheetTimeZone();
    var sumHot = ltSumSheet_(db, !o.dry), hotRows = ltSumRead_(sumHot), hotKeys = {};
    hotRows.forEach(function (r) { hotKeys[ltSumKey_(r)] = 1; });
    var newSum = [];                                   /* tổng hợp mới của lượt này (mọi tab) */
    lbCoachSheets_().forEach(function (sh) {
      var r;
      try { r = ltSheet_(sh, rep.cutoff, o, tz, hotKeys, newSum); }
      catch (e) { r = { tab: sh.getName(), error: String(e && e.message || e).slice(0, 300) }; rep.ok = false; }
      if (r.error) rep.ok = false;
      rep.sheets.push(r);
    });
    /* tab nóng "Tổng hợp bài": thêm mới + chỉ giữ 24 ngày gần nhất mỗi khách × bài */
    if (!o.dry && newSum.length) ltSumWrite_(sumHot, hotRows.concat(newSum));
    rep.sumAdded = newSum.length;
    ltLog_(db, rep, o);
    return rep;
  } finally {
    lock.releaseLock();
  }
}

function ltSheet_(sh, cutoff, o, tz, hotKeys, newSum) {
  var tab = sh.getName(), coach = tab.slice(LB_PREFIX.length).trim();
  var maxR = sh.getMaxRows(), maxC = sh.getMaxColumns(), last = sh.getLastRow(), lastC = sh.getLastColumn();
  var res = { tab: tab, cutoff: cutoff, gridBefore: maxR + '×' + maxC, data: 0, keep: 0, archived: 0, blank: 0, sum: 0, file: '', note: '' };
  if (last < 2) { res.gridAfter = res.gridBefore; return res; }
  var W = Math.max(LB_W, Math.min(lastC, maxC));
  var v = sh.getRange(2, 1, last - 1, W).getValues();

  /* 1. phân loại */
  var info = [], mark = {};
  function newer(i, k) { var j = mark[k]; if (j == null) { mark[k] = i; return; } var a = info[i], b = info[j]; if (a.d > b.d || (a.d === b.d && a.ts >= b.ts)) mark[k] = i; }
  for (var i = 0; i < v.length; i++) {
    var r = v[i];
    if (ltBlank_(r)) { info.push({ blank: 1 }); continue; }
    var x = { id: String(r[0] || '').trim(), ts: String(r[1] || ''), d: lbKey_(r[2]), name: String(r[3] || '').trim(), type: String(r[5] || '').trim(),
              plan: String(r[6] || '').trim(), ex: String(r[7] || '').trim(), kg: lbNum_(r[9]), rep: lbNum_(r[10]), ok: ltOk_(r[11]) ? 1 : 0 };
    info.push(x);
    if (!x.id || !/^\d{4}-\d{2}-\d{2}$/.test(x.d)) continue;
    if (x.type === 'SET' && x.ex) { newer(i, 'x|' + x.name + '|' + x.ex); if (x.ok && x.kg != null) newer(i, 'o|' + x.name + '|' + x.ex); }
    if (x.plan && (x.type === 'SET' || x.type === 'BÀI' || x.type === 'CHECKOUT')) newer(i, 'p|' + x.name + '|' + x.plan);
  }
  var keepIdx = {}; for (var k in mark) keepIdx[mark[k]] = 1;
  var arch = [], blanks = [];
  info.forEach(function (x, i) {
    if (x.blank) { blanks.push(i); return; }
    res.data++;
    var old = x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.d < cutoff;
    if (old && x.type !== 'ĐO' && x.type !== 'MỤC TIÊU' && !keepIdx[i]) arch.push(i);
  });
  res.archived = arch.length; res.blank = blanks.length; res.keep = res.data - arch.length;

  /* 2. tổng hợp bài cho các ngày cũ (từ MỌI dòng SET của ngày đó — kể cả dòng giữ lại), bỏ khoá đã có */
  var groups = {}, order = [];
  info.forEach(function (x) {
    if (x.blank || !x.id || x.type !== 'SET' || !x.ex || !/^\d{4}-\d{2}-\d{2}$/.test(x.d) || x.d >= cutoff) return;
    var key = ltSumKey_([x.d, x.name, x.ex, '', '', '', '', '', '', coach]);
    if (hotKeys[key]) return;
    var g = groups[key];
    if (!g) { g = groups[key] = { d: x.d, name: x.name, ex: x.ex, top: null, n: 0, nOk: 0, vol: 0 }; order.push(key); }
    var c = { kg: x.kg || 0, rep: x.rep || 0, ok: x.ok };
    if (!g.top || ltBetter_(c, g.top) > 0) g.top = c;
    g.n++; if (x.ok) g.nOk++; g.vol += (x.kg || 0) * (x.rep || 0);
  });

  if (o.dry) { res.sum = order.length; res.gridAfter = '(thử)'; res.note = 'THỬ — không đổi dữ liệu'; return res; }

  /* 3. ghi file lưu trữ theo năm TRƯỚC, kiểm đủ id */
  var byYear = {};
  arch.forEach(function (i) { var y = info[i].d.slice(0, 4); (byYear[y] = byYear[y] || []).push(i); });
  var sumByYear = {};
  order.forEach(function (key) { var g = groups[key], y = g.d.slice(0, 4); (sumByYear[y] = sumByYear[y] || []).push(key); });
  var years = Object.keys(byYear).concat(Object.keys(sumByYear)).filter(function (y, j, a) { return a.indexOf(y) === j; }).sort();
  var files = [];
  for (var yi = 0; yi < years.length; yi++) {
    var y = years[yi], ss = ltArchiveFile_(y);
    files.push(ss.getName());
    if (byYear[y]) {
      var ash = ltTab_(ss, tab, LB_HEAD), have = ltIds_(ash);
      var rows = byYear[y].filter(function (i) { return !have[info[i].id]; }).map(function (i) { return ltRow_(v[i]); });
      if (rows.length) lbAppend_(ash, rows);
      var got = ltIds_(ash), miss = byYear[y].filter(function (i) { return !got[info[i].id]; });
      if (miss.length) { res.error = 'file lưu trữ ' + y + ' thiếu ' + miss.length + ' id sau khi ghi — KHÔNG xoá gì ở tab nóng'; res.gridAfter = res.gridBefore; return res; }
    }
    if (sumByYear[y]) {
      var ssum = ltTab_(ss, LT_SUM, LT_SUM_HEAD), sk = {};
      ltSumRead_(ssum).forEach(function (r) { sk[ltSumKey_(r)] = 1; });
      var srows = sumByYear[y].filter(function (key) { return !sk[key]; }).map(function (key) { return ltSumRow_(groups[key], coach); });
      if (srows.length) ltAppendW_(ssum, srows, LT_SUM_HEAD.length, [1, 2, 3]);
    }
  }
  res.file = files.join(' · ');
  order.forEach(function (key) { hotKeys[key] = 1; newSum.push(ltSumRow_(groups[key], coach)); });
  res.sum = order.length;

  /* 4. xoá dòng đã lưu trữ + dòng trống ở tab nóng: từng khối liền nhau, từ dưới lên, kiểm id ngay trước khi xoá */
  var del = arch.concat(blanks).sort(function (a, b) { return a - b; }), blocks = [];
  del.forEach(function (i) { var b = blocks[blocks.length - 1]; if (b && b[1] === i - 1) b[1] = i; else blocks.push([i, i]); });
  for (var bi = blocks.length - 1; bi >= 0; bi--) {
    var a = blocks[bi][0], z = blocks[bi][1], n = z - a + 1;
    var now = sh.getRange(a + 2, 1, n, 1).getValues();
    for (var q = 0; q < n; q++) {
      var want = info[a + q].blank ? '' : info[a + q].id, is = String(now[q][0] || '').trim();
      if (is !== want) { res.error = 'dòng ' + (a + q + 2) + ' đổi trong lúc chạy (' + (is || 'trống') + ' ≠ ' + (want || 'trống') + ') — dừng xoá, phần đã lưu trữ an toàn ở file lưu trữ'; break; }
    }
    if (res.error) break;
    sh.deleteRows(a + 2, n);
  }

  /* 5. lưới: chừa LT_BUF dòng trống cuối, bỏ cột trống sau R */
  if (!res.error) {
    var nl = sh.getLastRow(), mr = sh.getMaxRows();
    if (mr > nl + LT_BUF) sh.deleteRows(nl + LT_BUF + 1, mr - nl - LT_BUF);
    if (sh.getLastColumn() <= LB_W && sh.getMaxColumns() > LB_W) sh.deleteColumns(LB_W + 1, sh.getMaxColumns() - LB_W);
  }
  res.gridAfter = sh.getMaxRows() + '×' + sh.getMaxColumns();
  return res;
}

/* ---------- file lưu trữ theo năm: tạo lần đầu, nhớ id ở Script Property ---------- */
function ltArchiveFile_(year) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(LT_PROP + year);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var ss = SpreadsheetApp.create(LT_FILE + year);
  try { ss.setSpreadsheetTimeZone(LB_TZ); } catch (e) {}
  props.setProperty(LT_PROP + year, ss.getId());
  return ss;
}
/* tab theo tên (tạo + header + cột chuỗi nếu chưa có; tab mặc định trống của file mới được dùng lại) */
function ltTab_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    var all = ss.getSheets();
    if (all.length === 1 && all[0].getLastRow() === 0 && !/^(Khách của|Tổng hợp)/.test(all[0].getName())) { sh = all[0]; sh.setName(name); }
    else sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    /* tab mới (mặc định 1.000 × 26 ô trống) → thu lưới về đúng số cột + LT_NEW dòng; ghi thêm thì tự nới */
    if (sh.getMaxColumns() > head.length) sh.deleteColumns(head.length + 1, sh.getMaxColumns() - head.length);
    if (sh.getMaxRows() > LT_NEW) sh.deleteRows(LT_NEW + 1, sh.getMaxRows() - LT_NEW);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var R = Math.max(2, sh.getMaxRows());
    if (head === LB_HEAD) { sh.getRange(1, 1, R, 4).setNumberFormat('@'); sh.getRange(1, 14, R, 1).setNumberFormat('@'); }
    else sh.getRange(1, 1, R, 3).setNumberFormat('@');
  }
  return sh;
}
function ltIds_(sh) {
  var out = {}, n = sh.getLastRow();
  if (n >= 2) sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) { if (r[0] !== '' && r[0] != null) out[String(r[0]).trim()] = 1; });
  return out;
}
/* dòng 18 cột như cũ; ô ngày Date (dòng nhập tay) → chuỗi yyyy-MM-dd để file lưu trữ không lệch múi giờ */
function ltRow_(r) {
  var o = r.slice(0, LB_W);
  while (o.length < LB_W) o.push('');
  if (o[2] instanceof Date) o[2] = lbKey_(o[2]);
  if (o[1] instanceof Date) o[1] = Utilities.formatDate(o[1], LB_TZ, 'yyyy-MM-dd HH:mm');
  return o;
}
/* ghi nối đuôi bảng w cột, tự thêm dòng khi hết lưới; cột chuỗi (1-based) giữ dạng '@' */
function ltAppendW_(sh, rows, w, textCols) {
  var n = sh.getLastRow(), need = n + rows.length, max = sh.getMaxRows();
  if (max < need) {
    var add = need - max + LB_GROW;
    sh.insertRowsAfter(max, add);
    (textCols || []).forEach(function (c) { sh.getRange(max + 1, c, add, 1).setNumberFormat('@'); });
  }
  sh.getRange(n + 1, 1, rows.length, w).setValues(rows);
}

/* ---------- tổng hợp bài ---------- */
function ltSumKey_(r) { return [String(r[0]).slice(0, 10), String(r[1]).trim(), String(r[2]).trim(), String(r[9]).trim()].join('|'); }
function ltSumRow_(g, coach) { return [g.d, g.name, g.ex, g.top.kg, g.top.rep, g.top.ok, g.n, g.nOk, Math.round(g.vol * 10) / 10, coach]; }
function ltSumSheet_(db, create) {
  var sh = db.getSheetByName(LT_SUM);
  if (!sh && create) sh = ltTab_(db, LT_SUM, LT_SUM_HEAD);
  return sh;
}
function ltSumRead_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, LT_SUM_HEAD.length).getValues()
    .filter(function (r) { return !ltBlank_(r); })
    .map(function (r) { r = r.slice(); if (r[0] instanceof Date) r[0] = lbKey_(r[0]); return r; });
}
/* ghi lại toàn bộ tab nóng (bảng dẫn xuất): khoá trùng → giữ dòng sau; mỗi khách × bài chỉ 24 ngày gần nhất */
function ltSumWrite_(sh, rows) {
  var by = {}, keys = [];
  rows.forEach(function (r) { var k = ltSumKey_(r); if (!(k in by)) keys.push(k); by[k] = r; });
  var per = {};
  keys.forEach(function (k) { var r = by[k], g = String(r[1]).trim() + '|' + String(r[2]).trim(); (per[g] = per[g] || []).push(r); });
  var out = [];
  Object.keys(per).sort(function (a, b) { return a.localeCompare(b, 'vi'); }).forEach(function (g) {
    per[g].sort(function (a, b) { var x = String(a[0]), y = String(b[0]); return x < y ? 1 : x > y ? -1 : 0; });
    var days = {}, n = 0;
    per[g].forEach(function (r) { var d = String(r[0]).slice(0, 10); if (!days[d]) { if (n >= LT_SUM_DAYS) return; days[d] = 1; n++; } out.push(r); });
  });
  var n0 = sh.getLastRow();
  if (n0 >= 2) sh.getRange(2, 1, n0 - 1, LT_SUM_HEAD.length).clearContent();
  if (out.length) ltAppendW_(sh, out, LT_SUM_HEAD.length, [1, 2, 3]);
}

/* ---------- nhật ký ---------- */
function ltLog_(db, rep, o) {
  try {
    var sh = db.getSheetByName(LT_LOG) || ltTab_(db, LT_LOG, LT_LOG_HEAD);
    var at = Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm');
    var rows = rep.sheets.map(function (r) {
      return [at, o.dry ? 'THỬ' : 'CHẠY', r.tab, rep.cutoff, r.data || 0, r.keep || 0, r.archived || 0, r.blank || 0, r.gridBefore || '', r.gridAfter || '', r.sum || 0, r.file || '', r.error ? 'LỖI: ' + r.error : (r.note || 'OK')];
    });
    if (!rows.length) rows.push([at, o.dry ? 'THỬ' : 'CHẠY', '—', rep.cutoff, 0, 0, 0, 0, '', '', 0, '', 'không có tab coach']);
    ltAppendW_(sh, rows, LT_LOG_HEAD.length, [1, 4]);
  } catch (e) { rep.logError = String(e).slice(0, 200); }
}

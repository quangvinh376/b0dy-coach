/* =====================================================================
   B0DY · Coach app — Admin.gs (v2.4.1 · 26/09/2026 · v2.12 nhận diện theo mã 29/10/2026)
   Chế độ ADMIN của app coach: đăng nhập bằng ADMIN_PIN (Script Property) →
   xem và check-in TOÀN BỘ khách, KHÔNG khoá IP; tab Cài đặt quản lý IP phòng.

   Thêm file này vào project Apps Script "B0DY Discord KPI" (cạnh Code.gs,
   Logbook.gs, Stats.gs) và 7 case trong switch của api_() ở Code.gs:

     case 'adm_data':    out = admData_(p);    break;
     case 'adm_checkin': out = admCheckin_(p); break;
     case 'adm_log':     out = admLog_(p);     break;
     case 'adm_stats':   out = admStats_(p);   break;
     case 'iplist':      out = admIpList_(p);  break;
     case 'addip':       out = admIpAdd_(p);   break;
     case 'delip':       out = admIpDel_(p);   break;

   Mọi hàm ở đây gọi adminOk_(p) TRƯỚC khi làm gì. Không đụng hàm cũ.
   Không bao giờ ghi giá trị PIN ra log / phản hồi.

   v2.4.1 — TỐC ĐỘ. Công thức trong file BA được kéo sẵn tới cuối bảng nên
   getLastRow() của MEMBERS ≈ 1.000 (dữ liệu thật ~60 dòng) và của SESSION LOG
   ≈ 5.000 (dữ liệu thật ~850 dòng). v2.4.0 đọc nguyên các vùng đó (28 nghìn +
   65–70 nghìn ô mỗi lượt) → adm_data ~15 s, adm_stats ~12 s, adm_checkin còn lâu hơn.
   Từ v2.4.1: đọc MỘT cột để tìm dòng dữ liệu cuối, rồi chỉ đọc đúng phần có dữ liệu.
   Kết quả trả về GIỮ NGUYÊN định dạng (test/gas_admin.js so trước/sau).
   ===================================================================== */
var ADM_NAME   = 'Admin';   /* tên hiển thị + dấu ký trong SESSION LOG cột N (" · ký: Admin") */
var ADM_IP_MAX = 2;         /* app hiện 2 ô IP (IP phòng + IP thứ 2) */
var ADM_PERF   = true;      /* ghi thời gian từng bước ra log (Executions) — không có dữ liệu khách/PIN */

function admT_() { var t0 = Date.now(), last = t0, ms = {}; return { lap: function (k) { var n = Date.now(); ms[k] = n - last; last = n; }, done: function (tag) { ms.total = Date.now() - t0; if (ADM_PERF) console.log(JSON.stringify({ adm: tag, ms: ms })); return ms; } }; }

/* ---------- dòng dữ liệu thật cuối cùng của một cột (ô công thức trả "" coi là trống) — đọc MỘT cột ---------- */
function admLastRow_(sh, col, first) {
  var n = sh.getLastRow();
  if (n < first) return first - 1;
  var v = sh.getRange(first, col, n - first + 1, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) { var x = v[i][0]; if (x !== '' && x != null) return first + i; }
  return first - 1;
}

/* ---------- MEMBERS: MỘT lần đọc, chỉ các dòng có tên ----------
   Cùng logic cột với lbMembers_ (Logbook.gs) + bản đồ tên → coach giống memberCoachMap_ (Code.gs: dòng dưới cùng thắng).
   all: mọi dòng có tên (kể cả hết buổi), đúng thứ tự trên sheet. */
function admMemRead_() {
  var sh = chkSS_().getSheetByName('MEMBERS');
  if (!sh) return { ok: false, error: 'khong_thay_MEMBERS' };
  var hr = memHdrRow_(sh), lastCol = sh.getLastColumn();
  var hdr = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(String);
  var hn = hdr.map(lbNorm_);
  var iName = hdr.indexOf('Tên'), iTotal = hdr.indexOf('Số buổi'), iDone = hdr.indexOf('Đã tập'), iLeft = hdr.indexOf('Còn lại'), iCoach = hdr.indexOf('Coach');
  var iKind = hn.indexOf('loai'), iPkg = hn.indexOf('goi'), iStatus = hn.indexOf('trang thai');
  var iStart = -1, iEnd = -1, iEndAlt = -1;
  for (var c = 0; c < hn.length; c++) {
    if (iStart < 0 && hn[c].indexOf('bat dau') >= 0) iStart = c;
    if (hn[c].indexOf('het han') >= 0) iEnd = c;
    if (iEnd < 0 && hn[c].indexOf('ket thuc') >= 0) iEndAlt = c;
    if (iKind < 0 && hn[c].indexOf('loai goi') >= 0) iKind = c;
  }
  if (iEnd < 0) iEnd = iEndAlt;
  if (iName < 0 || iLeft < 0) return { ok: false, error: 'khong_thay_cot_MEMBERS' };
  var last = admLastRow_(sh, iName + 1, hr + 1);
  var vals = last > hr ? sh.getRange(hr + 1, 1, last - hr, lastCol).getValues() : [];
  var tz = chkSS_().getSpreadsheetTimeZone();
  function dk(v) { if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd'); return lbKey_(v); }
  var all = [], coachOf = {};
  for (var r = 0; r < vals.length; r++) {
    var name = String(vals[r][iName] || '').trim();
    if (!name) continue;
    var left = Number(vals[r][iLeft]) || 0, end = iEnd >= 0 ? dk(vals[r][iEnd]) : '';
    all.push(idTag_({ name: name, total: Number(vals[r][iTotal]) || 0, done: Number(vals[r][iDone]) || 0, left: Math.max(0, left), _left: left,
      coach: String(vals[r][iCoach] || ''), start: iStart >= 0 ? dk(vals[r][iStart]) : '', end: end, exp: end,
      kind: iKind >= 0 ? String(vals[r][iKind] || '').trim() : '',
      pkg: iPkg >= 0 ? String(vals[r][iPkg] || '').trim() : '',
      status: iStatus >= 0 ? String(vals[r][iStatus] || '').trim() : '' }, r + 1));        /* v2.12: _r = số dòng MEMBERS như cột P */
    if (iCoach >= 0) coachOf[name] = String(vals[r][iCoach] || '').trim();
  }
  return { ok: true, all: all, coachOf: coachOf };
}

/* ---------- khách: mỗi NGƯỜI một dòng (v2.12 — trước: mỗi tên) ----------
   MEMBERS mỗi gói / giai đoạn một dòng; người = các dòng cùng SĐT (idRead_). Giữ dòng CÒN BUỔI cuối cùng;
   không có thì dòng cuối cùng (thứ tự dòng trên sheet). m._P = người (không gửi app). */
function admMembers_(withDone, mr, I) {
  mr = mr || admMemRead_();
  if (!mr || !mr.ok) return mr || { ok: false, error: 'members_failed' };
  var list = mr.all.filter(function (m) { return withDone || m._left > 0; }).map(function (m) {
    var o = {}; for (var k in m) if (k !== '_left') o[k] = m[k]; return idTag_(o, m._r);
  });
  return { ok: true, members: idPick_(I || idRead_(), list) };
}

/* ---------- SESSION LOG: đọc cột B (ngày) MỘT lần → dòng dữ liệu cuối; bỏ ~4.000 dòng công thức kéo sẵn phía dưới ---------- */
function admLogB_() {
  chkInit_();
  var log = chkSS_().getSheetByName(LOG_SHEET);
  if (!log) return null;
  var R1 = CHECKIN.ROW1, n = log.getLastRow();
  var b = n >= R1 ? log.getRange(R1, CHECKIN.COL_DATE, n - R1 + 1, 1).getValues() : [];
  var k = b.length - 1;
  while (k >= 0 && (b[k][0] === '' || b[k][0] == null)) k--;
  return { log: log, R1: R1, last: R1 + k, b: b.slice(0, k + 1) };
}

/* SESSION LOG hôm nay → {pid: 'HH:mm'} — cùng kết quả lbSignedToday_ nhưng chỉ đọc cột ngày + khối dòng hôm nay */
function admSignedToday_(ix, I) {
  var out = {};
  try {
    if (!ix || ix.last < ix.R1) return out;
    I = I || idRead_();
    var tz = chkSS_().getSpreadsheetTimeZone(), today = lbToday_(), hit = [];
    for (var i = 0; i < ix.b.length; i++) {
      var d = ix.b[i][0]; if (!d) continue;
      var key = (d instanceof Date) ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : lbKey_(d);
      if (key === today) hit.push(i);
    }
    if (!hit.length) return out;
    var lo = hit[0], hi = hit[hit.length - 1];
    var L = statsLogCols_(ix.log);                                                        /* v2.12: + cột P (_mrow) · Q (Mã KH) */
    var blk = ix.log.getRange(ix.R1 + lo, 1, hi - lo + 1, L.w).getValues();
    for (var j = 0; j < hit.length; j++) {
      var v = blk[hit[j] - lo];
      var name = String(v[L.n] || '').trim(); if (!name) continue;                         /* Học viên */
      var P = idOfLog_(I, L.mr >= 0 ? v[L.mr] : '', L.q >= 0 ? v[L.q] : '', name); if (!P) continue;
      var m = String(v[L.sig] || '').match(/(\d{1,2}):(\d{2})/);                          /* Ký điện tử */
      out[P.pid] = m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : '';
    }
  } catch (e) {}
  return out;
}

/* =====================================================================
   action 'adm_data' — như 'coach' nhưng cho MỌI khách của phòng.
   Trả members (kèm coach phụ trách) + snapshot + thư viện + đã check-in hôm nay.
   ===================================================================== */
function admData_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var T = admT_();
  var I = idRead_();
  var mem = admMembers_(true, null, I); T.lap('members');
  if (!mem || !mem.ok) return { ok: false, error: (mem && mem.error) || 'members_failed' };
  var keyOf = idKeys_(mem.members);                                   /* v2.12: pid + key (trùng tên → pid) */
  var snap = lbSnapshot_(lbReadAll_(), I, keyOf); T.lap('snapshot');
  var sg = admSignedToday_(admLogB_(), I); T.lap('signed');
  mem.members.forEach(function (m) { var t = m._P ? sg[m._P.pid] : undefined; if (t !== undefined) { m.checked = true; m.signed = t; } });
  var lib = lbLibrary_(); T.lap('library');
  T.done('data');
  return { ok: true, coach: ADM_NAME, admin: true, members: mem.members, snapshot: snap, library: lib,
           today: lbToday_(), server: Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm') };
}

/* =====================================================================
   action 'adm_checkin' — check-in + ký thay trong MỘT lượt, cho MỌI khách,
   không khoá IP. SESSION LOG: B ngày (CHUỖI M/d/yyyy) · G tên · K "Đã tập" ·
   N "app HH:mm · ký: Admin" — đúng trạng thái cuối của cặp apiCheckin_ + ký.
   Cột E (Coach) là công thức tra MEMBERS nên KPI vẫn tính cho coach phụ trách.
   Chặn trùng theo ngày + tên (dòng Hủy coi như chưa), dò dòng trống đầu tiên
   y như apiCheckin_, nhưng chỉ đọc tới dòng dữ liệu cuối (không 5.000 dòng).
   Ghi xong đọc lại chính dòng đó để chắc không bị máy khác chiếm.
   KHÔNG BAO GIỜ auto-retry lệnh này từ client.
   ===================================================================== */
function admCheckin_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var name = String(p.name || '').trim();
  if (!name && !p.pid) return { ok: false, error: 'thieu_ten' };
  var T = admT_();
  var mr = admMemRead_(); T.lap('members');
  if (!mr || !mr.ok) return { ok: false, error: (mr && mr.error) || 'members_failed' };
  var I = idRead_(), f = idFind_(I, p);                                 /* v2.12: người theo pid; app cũ: tên thuộc đúng một người */
  if (!f.P) return { ok: false, error: f.n > 1 ? 'trung_ten' : 'khong_thay_khach' };     /* kiểm TRƯỚC khi ghi: không để lại dòng treo */
  var w = idCheckinWrite_(I, f.P, ' · ký: ' + ADM_NAME); T.lap('write');
  if (!w.ok) { T.done('checkin'); return w; }
  /* member: số buổi TRƯỚC lượt này (client tự cộng 1 — xem sendCheckin) — dòng gói vừa ghi (Mã KH) */
  var me = null;
  var mm = admMembers_(false, mr, I);
  if (mm && mm.ok) mm.members.forEach(function (x) { if (x._P === f.P) me = x; });
  if (me) { me.pid = f.P.pid; if (p.key) me.key = String(p.key); }
  T.done('checkin');
  return { ok: true, row: w.row, member: me, coach: f.P.owner, by: ADM_NAME, at: w.at };
}

/* =====================================================================
   action 'adm_log' — ghi lô sự kiện buổi tập do admin nhập vào đúng sheet
   "Khách của <coach phụ trách>" (hồ sơ khách liền mạch, thống kê của coach
   thấy được). Cột R (Coach) = "Admin" để biết ai ghi. id trùng ở BẤT KỲ
   sheet coach nào đều bị bỏ qua (client được gửi lại thoải mái).
   ===================================================================== */
function admLog_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var ev = (p && p.events) || [];
  if (!ev.length) return { ok: true, written: 0, dup: 0 };
  if (ev.length > 200) return { ok: false, error: 'qua_nhieu' };
  var mr = admMemRead_();
  if (!mr || !mr.ok) return { ok: false, error: (mr && mr.error) || 'members_failed' };
  var mc = mr.coachOf, I = idRead_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var have = {};
    lbCoachSheets_().forEach(function (sh) {
      var n = sh.getLastRow();
      if (n >= 2) sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) { if (r[0]) have[String(r[0])] = 1; });
    });
    var now = Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm'), groups = {}, order = [], dup = 0;
    ev.forEach(function (e) {
      var id = e && e.id ? String(e.id) : '';
      if (!id || have[id]) { dup++; return; }
      have[id] = 1;
      /* coach phụ trách hiện tại (dòng dưới cùng thắng); bỏ hậu tố "(giai đoạn 1)" để
         không đẻ sheet "Khách của Hiền Mai (giai đoạn 1)" — hồ sơ khách vẫn liền vì snapshot đọc mọi sheet */
      /* v2.12: người theo pid / tên (một người) → coach hiện hành của NGƯỜI; tên trùng không rõ người → coach dòng cuối cùng tên (như cũ) */
      var who = String(e.name || '').trim(), w = idWho_(I, e), owner = String(w.P ? w.P.owner : (mc[who] || '')).split('(')[0].trim() || ADM_NAME;
      if (!groups[owner]) { groups[owner] = []; order.push(owner); }
      groups[owner].push(lbEvRow_(e, now, who, w.code, ADM_NAME));
    });
    var written = 0;
    order.forEach(function (owner) {
      var rows = groups[owner], sh = lbSheet_(owner, true);
      lbAppend_(sh, rows);                                   /* v2.8: tự thêm dòng khi lưới hết chỗ (Archive.gs dọn lưới) */
      written += rows.length;
    });
    return { ok: true, written: written, dup: dup };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
   action 'adm_stats' — thống kê TOÀN PHÒNG cho trang chủ Admin:
   days / monthTotal (buổi "Đã tập" theo ngày trong tháng, mọi coach),
   perClient (buổi tháng này + buổi gần nhất, mọi khách), rev (Doanh thu —
   dòng "Tổng" của bảng TỔNG HỢP THEO COACH tab COM, cột C), hist (lịch sử
   set theo bài từ MỌI sheet "Khách của …", tối đa 24 set gần nhất mỗi bài).
   v2.4.1: SESSION LOG chỉ đọc cột B..K tới dòng dữ liệu cuối; dùng lại file BA đã mở.
   ===================================================================== */
function admStats_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var T = admT_();
  var month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? p.month : Utilities.formatDate(new Date(), STATS_TZ, 'yyyy-MM');
  var today = Utilities.formatDate(new Date(), STATS_TZ, 'yyyy-MM-dd');
  var out = { ok: true, coach: ADM_NAME, admin: true, month: month, days: {}, monthTotal: 0, perClient: {}, com: null, rev: null, hist: {}, today: today };
  var ba = (typeof SS_ID !== 'undefined' && SS_ID === STATS_BA_ID) ? chkSS_() : SpreadsheetApp.openById(STATS_BA_ID);
  var tz = ba.getSpreadsheetTimeZone();

  /* 1. SESSION LOG — mọi buổi "Đã tập" (B ngày · G tên · K trạng thái) */
  var ix = (ba === chkSS_()) ? admLogB_() : null;
  var log = ix ? ix.log : ba.getSheetByName('SESSION LOG');
  var ctx = statsCtx_(today); out.w0 = ctx.w0;                        /* v2.7: w8/n28/lastAll cho trang Khách tập chậm */
  var cFrom = statsPrevMonth_(month) + '-01', raw = [];                /* v2.7.1: trang Doanh thu — buổi từ đầu tháng trước */
  out.comFrom = cFrom;
  var I = idRead_(ba), keyOf = idScopeKeys_(I, null);                 /* v2.12: khoá = key của adm_data (trùng tên → pid) */
  if (log) {
    var r1 = ix ? ix.R1 : 1, nr = ix ? (ix.last - ix.R1 + 1) : log.getLastRow(), L = statsLogCols_(log);   /* v2.9: cột theo tiêu đề (cột lề A) */
    var vals = nr > 0 ? log.getRange(r1, 1, nr, L.w).getValues() : [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i], d = statsIso_(r[L.d], tz), name = String(r[L.n] || '').trim(), st = String(r[L.st] || '');
      if (!d || !name) continue;
      if (st.indexOf('ã tập') < 0) continue;
      var who = idKeyOf_(keyOf, idOfLog_(I, L.mr >= 0 ? r[L.mr] : '', L.q >= 0 ? r[L.q] : '', name), name);
      var pc = out.perClient[who] || (out.perClient[who] = { m: 0, last: '' });
      if (d.slice(0, 7) === month) { out.days[d] = (out.days[d] || 0) + 1; out.monthTotal++; pc.m++; }
      if (d < today && d > pc.last) pc.last = d;
      statsPcAdd_(pc, d, ctx);
      if (d >= cFrom && d <= today) raw.push({ d: d, t: statsSigned_(r[L.sig]), n: name, id: String(r[L.id] || '').trim(), co: String(r[L.co] || '').trim(), r: i });
    }
  }
  try {                                                               /* v2.7: buổi/tuần đăng ký (MEMBERS) mọi khách */
    var memA = statsMem_(ba);
    if (memA) { out.plan = {}; memA.rows.forEach(function (m) { var x = I.byMrow[m.r], k = idKeyOf_(keyOf, x ? x.P : null, m.name); if (!(k in out.plan) || m.left > 0) out.plan[k] = m.plan; }); }
    /* v2.7.1 — Doanh thu từng buổi = đơn giá buổi (MEMBERS theo mã HV) — cùng công thức cột "Doanh thu" tab COM.
       sess giữ thứ tự dòng SESSION LOG trong ngày; comMon = doanh thu theo tháng (ô Doanh thu trang chủ + trang chi tiết). */
    var sessA = [], monA = {}; monA[statsPrevMonth_(month)] = 0; monA[month] = 0;
    raw.forEach(function (x) {
      var m = memA ? (memA.byId[x.id] || statsMemByName_(memA, x.n, statsCoachKey_(x.co))) : null, c = m ? m.price : 0;
      sessA.push({ d: x.d, t: x.t, n: x.n, c: Math.round(c), r: x.r });
      monA[x.d.slice(0, 7)] = (monA[x.d.slice(0, 7)] || 0) + c;
    });
    sessA.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.r - b.r; });
    sessA.forEach(function (x) { delete x.r; });
    for (var mk in monA) monA[mk] = Math.round(monA[mk]);
    out.sess = sessA; out.comMon = monA;
  } catch (errP) { out.planError = String(errP).slice(0, 200); }
  T.lap('log');

  /* 2. COM — Doanh thu cả phòng: dòng "Tổng" (cột A) của bảng tổng hợp, cột C. Tháng = ô "THÁNG:". */
  var com = ba.getSheetByName('COMMISSION') || ba.getSheetByName('COM');
  if (com) {
    var cv = com.getRange(1, 1, Math.max(1, Math.min(com.getLastRow(), 60)), statsW_(com, 11)).getValues(), comMonth = '', rev = null;
    var c0 = statsHdrAt_(cv, 'coach').c;                              /* v2.9: cột "Coach" (A cũ · B khi có cột lề) */
    for (var j = 0; j < cv.length; j++) {
      var row = cv[j], a = String(row[c0] || '').trim();
      if (!comMonth && /THÁNG/i.test(a)) comMonth = statsMonthLabel_(row[c0 + 1]);
      if (rev === null && /^tổng$/i.test(a) && row[c0 + 2] !== '') rev = statsNum_(row[c0 + 2]);
    }
    if (rev !== null) out.rev = { month: comMonth || month, total: rev };
  }
  T.lap('com');

  /* 3. Lịch sử set theo bài — mọi sheet "Khách của …" + tab "Tổng hợp bài" (v2.8: set cao nhất mỗi ngày, 24 ngày — Stats.gs) */
  try {
    var ctz = lbDb_().getSpreadsheetTimeZone(), acc = {};
    var whoOf = function (code, nm) { return idKeyOf_(keyOf, idOfLog_(I, 0, code, nm), nm); };
    lbCoachSheets_().forEach(function (sh) {
      if (sh.getLastRow() < 2) return;
      statsHistRows_(acc, sh.getRange(2, 1, sh.getLastRow() - 1, statsW_(sh, 19)).getValues(), ctz, whoOf);
    });
    statsHistSum_(acc, lbDb_().getSheetByName(STATS_SUM), ctz, null, whoOf);
    out.hist = statsHistOut_(acc);
  } catch (err) { out.histError = String(err).slice(0, 200); }
  T.lap('hist');
  T.done('stats');
  return out;
}

/* =====================================================================
   IP được check-in (tab Cài đặt của Admin).
   Nguồn sự thật: Script Property STUDIO_IP = danh sách ngăn bằng dấu phẩy
   (đúng định dạng ipOk_ đang đọc). Không bao giờ để danh sách RỖNG: ipOk_
   coi rỗng là "tắt khoá IP" → ai có PIN coach cũng check-in được từ bất kỳ đâu.
   v2.10 (11/10): MỘT nguồn cho cả hai máy chủ — mỗi lần đọc / thêm / xoá, danh sách
   được chép sang tab "Cấu hình" ô B1 của Customer database; Worker Cloudflare đọc ô đó
   (nhớ 60 giây), biến ALLOW_IP của Worker chỉ còn là dự phòng khi ô trống / chưa có tab.
   (Trước 11/10 Worker chỉ đọc ALLOW_IP → hai danh sách lệch nhau, mọi check-in từ phòng
   bị Worker từ chối rồi phải lùi về Apps Script.)
   ===================================================================== */
var ADM_CFG_TAB = 'Cấu hình';
/* chép danh sách sang tab Cấu hình (B1, dạng chữ). Lỗi chép không chặn việc đổi IP. */
function admIpMirror_(list) {
  try {
    var ss = lbDb_(), sh = ss.getSheetByName(ADM_CFG_TAB);
    if (!sh) {
      sh = ss.insertSheet(ADM_CFG_TAB);
      sh.getRange(1, 1, 2, 1).setValues([['IP phòng được check-in'], ['Sửa ở app coach: đăng nhập Admin → Cài đặt. Worker và Apps Script cùng đọc ô B1 — không sửa tay.']]);
    }
    var want = list.join(','), cell = sh.getRange(1, 2);
    if (String(cell.getDisplayValue() || '') !== want) cell.setNumberFormat('@').setValue(want);
    return true;
  } catch (e) { return false; }
}
function admIpGet_() {
  var raw = String(PropertiesService.getScriptProperties().getProperty('STUDIO_IP') || '');
  var out = [];
  raw.split(',').forEach(function (s) { s = s.trim(); if (s && out.indexOf(s) < 0) out.push(s); });
  return out;
}
function admIpList_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var list = admIpGet_();
  if (list.length) admIpMirror_(list);                    /* mở tab Cài đặt = đồng bộ sang Worker */
  return { ok: true, ips: list, max: ADM_IP_MAX };
}
/* thêm IP của THIẾT BỊ ĐANG GỌI (p.ip do app lấy từ ipify) */
function admIpAdd_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var ip = String(p.ip || '').trim();
  if (!ip) return { ok: false, error: 'thieu_ip' };
  if (!/^[0-9A-Fa-f:.]{3,45}$/.test(ip)) return { ok: false, error: 'sai_ip' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var list = admIpGet_();
    if (list.indexOf(ip) < 0) {
      if (list.length >= ADM_IP_MAX) return { ok: false, error: 'full', ips: list, max: ADM_IP_MAX };
      list.push(ip);
      PropertiesService.getScriptProperties().setProperty('STUDIO_IP', list.join(','));
    }
    admIpMirror_(list);
    return { ok: true, ips: list, max: ADM_IP_MAX };
  } finally { lock.releaseLock(); }
}
/* xoá một IP theo GIÁ TRỊ (p.del). Không cho xoá IP cuối cùng. */
function admIpDel_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var ip = String(p.del || '').trim();
  if (!ip) return { ok: false, error: 'thieu_ip' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var list = admIpGet_(), k = list.indexOf(ip);
    if (k < 0) return { ok: true, ips: list, max: ADM_IP_MAX };
    if (list.length <= 1) return { ok: false, error: 'con_1_ip', ips: list, max: ADM_IP_MAX };
    list.splice(k, 1);
    PropertiesService.getScriptProperties().setProperty('STUDIO_IP', list.join(','));
    admIpMirror_(list);
    return { ok: true, ips: list, max: ADM_IP_MAX };
  } finally { lock.releaseLock(); }
}

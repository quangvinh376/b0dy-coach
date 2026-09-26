/* =====================================================================
   B0DY · Coach app — Admin.gs (v2.4.1 · 26/09/2026)
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
    all.push({ name: name, total: Number(vals[r][iTotal]) || 0, done: Number(vals[r][iDone]) || 0, left: Math.max(0, left), _left: left,
      coach: String(vals[r][iCoach] || ''), start: iStart >= 0 ? dk(vals[r][iStart]) : '', end: end, exp: end,
      kind: iKind >= 0 ? String(vals[r][iKind] || '').trim() : '',
      pkg: iPkg >= 0 ? String(vals[r][iPkg] || '').trim() : '',
      status: iStatus >= 0 ? String(vals[r][iStatus] || '').trim() : '' });
    if (iCoach >= 0) coachOf[name] = String(vals[r][iCoach] || '').trim();
  }
  return { ok: true, all: all, coachOf: coachOf };
}

/* ---------- khách: mỗi tên một dòng ----------
   MEMBERS có thể có nhiều dòng cùng tên (khách gia hạn gói). Giữ dòng CÒN BUỔI
   cuối cùng; không có thì dòng cuối cùng (sort ổn định nên thứ tự trùng tên = thứ tự dòng trên sheet). */
function admMembers_(withDone, mr) {
  mr = mr || admMemRead_();
  if (!mr || !mr.ok) return mr || { ok: false, error: 'members_failed' };
  var list = mr.all.filter(function (m) { return withDone || m._left > 0; }).map(function (m) {
    var o = {}; for (var k in m) if (k !== '_left') o[k] = m[k]; return o;
  });
  list.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  var pick = {}, order = [];
  list.forEach(function (m) {
    var k = String(m.name).trim(), cur = pick[k];
    if (!cur) { pick[k] = m; order.push(k); return; }
    if (m.left > 0 || !(cur.left > 0)) pick[k] = m;
  });
  return { ok: true, members: order.map(function (k) { return pick[k]; }) };
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

/* SESSION LOG hôm nay → {tên chuẩn hoá: 'HH:mm'} — cùng kết quả lbSignedToday_ nhưng chỉ đọc cột B + khối dòng hôm nay */
function admSignedToday_(ix) {
  var out = {};
  try {
    if (!ix || ix.last < ix.R1) return out;
    var tz = chkSS_().getSpreadsheetTimeZone(), today = lbToday_(), hit = [];
    for (var i = 0; i < ix.b.length; i++) {
      var d = ix.b[i][0]; if (!d) continue;
      var key = (d instanceof Date) ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : lbKey_(d);
      if (key === today) hit.push(i);
    }
    if (!hit.length) return out;
    var lo = hit[0], hi = hit[hit.length - 1];
    var blk = ix.log.getRange(ix.R1 + lo, CHECKIN.COL_DATE, hi - lo + 1, 13).getValues();   /* B..N */
    for (var j = 0; j < hit.length; j++) {
      var v = blk[hit[j] - lo];
      var name = String(v[5] || '').trim(); if (!name) continue;                           /* G */
      var m = String(v[12] || '').match(/(\d{1,2}):(\d{2})/);                              /* N */
      out[lbNorm_(name)] = m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : '';
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
  var mem = admMembers_(true); T.lap('members');
  if (!mem || !mem.ok) return { ok: false, error: (mem && mem.error) || 'members_failed' };
  var names = {};
  mem.members.forEach(function (m) { names[String(m.name).trim()] = 1; });
  var snap = lbSnapshot_(lbReadAll_(), names); T.lap('snapshot');
  var sg = admSignedToday_(admLogB_()); T.lap('signed');
  mem.members.forEach(function (m) { var t = sg[lbNorm_(m.name)]; if (t !== undefined) { m.checked = true; m.signed = t; } });
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
  if (!name) return { ok: false, error: 'thieu_ten' };
  var T = admT_();
  var mr = admMemRead_(); T.lap('members');
  if (!mr || !mr.ok) return { ok: false, error: (mr && mr.error) || 'members_failed' };
  var owner = mr.coachOf[name];
  if (owner == null) return { ok: false, error: 'khong_thay_khach' };     /* kiểm TRƯỚC khi ghi: không để lại dòng treo */
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ix = admLogB_(); T.lap('logB');
    if (!ix) return { ok: false, error: 'khong_thay_SESSION_LOG' };
    var log = ix.log, R1 = ix.R1, W = CHECKIN.WIDTH, cnt = ix.last - R1 + 1;
    var today = Utilities.formatDate(new Date(), CHECKIN.TZ, 'yyyy-MM-dd');
    var vals = cnt > 0 ? log.getRange(R1, 1, cnt, W).getValues() : [];
    var firstEmpty = -1;
    for (var r = 0; r < vals.length; r++) {
      var d = vals[r][CHECKIN.COL_DATE - 1];
      if (d instanceof Date) {
        if (Utilities.formatDate(d, CHECKIN.TZ, 'yyyy-MM-dd') === today &&
            String(vals[r][CHECKIN.COL_NAME - 1]).trim() === name &&
            String(vals[r][CHECKIN.COL_STATUS - 1]).trim() !== CHECKIN.ST_CANCEL) {
          return { ok: false, error: 'da_checkin', status: String(vals[r][CHECKIN.COL_STATUS - 1]).trim() };
        }
      } else if (firstEmpty < 0 && String(d) === '' && String(vals[r][CHECKIN.COL_NAME - 1]) === '') {
        firstEmpty = r + R1;
      }
    }
    if (firstEmpty < 0) firstEmpty = vals.length + R1;                     /* = dòng ngay dưới dữ liệu cuối */
    T.lap('scan');
    var now = new Date(), hm = Utilities.formatDate(now, CHECKIN.TZ, 'HH:mm');
    /* Ghi dạng chuỗi M/d/yyyy để Sheets (locale US) tự parse thành ngày — giống nhập tay, KHÔNG setValue(Date) */
    log.getRange(firstEmpty, CHECKIN.COL_DATE).setValue(Utilities.formatDate(now, CHECKIN.TZ, 'M/d/yyyy'));
    log.getRange(firstEmpty, CHECKIN.COL_NAME).setValue(name);
    log.getRange(firstEmpty, CHECKIN.COL_STATUS).setValue(CHECKIN.ST_OK);
    log.getRange(firstEmpty, CHECKIN.COL_NOTE).setValue('app ' + hm + ' · ký: ' + ADM_NAME);
    SpreadsheetApp.flush();
    T.lap('write');
    var back = log.getRange(firstEmpty, 1, 1, W).getValues()[0];
    if (String(back[CHECKIN.COL_NAME - 1]).trim() !== name || String(back[CHECKIN.COL_STATUS - 1]).trim() !== CHECKIN.ST_OK) {
      T.done('checkin');
      return { ok: false, error: 'dong_bi_chiem', row: firstEmpty };     /* máy khác ghi đè đúng lúc — client báo lỗi, thử lại sẽ chặn trùng */
    }
    /* member: số buổi TRƯỚC lượt này (client tự cộng 1 — xem sendCheckin) */
    var me = null;
    var mm = admMembers_(false, mr);
    if (mm && mm.ok) mm.members.forEach(function (x) { if (x.name === name) me = x; });
    T.done('checkin');
    return { ok: true, row: firstEmpty, member: me, coach: owner, by: ADM_NAME, at: hm };
  } finally {
    lock.releaseLock();
  }
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
  var mc = mr.coachOf;
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
      var who = String(e.name || '').trim(), owner = String(mc[who] || '').split('(')[0].trim() || ADM_NAME;
      if (!groups[owner]) { groups[owner] = []; order.push(owner); }
      groups[owner].push([id, now, lbKey_(e.date || lbToday_()), who, e.session == null ? '' : Number(e.session),
        String(e.type || ''), e.plan || '', e.ex || '', e.set == null ? '' : Number(e.set),
        e.kg == null ? '' : Number(e.kg), e.rep == null ? '' : Number(e.rep), e.ok == null ? '' : (String(e.type) === 'BÀI' ? Number(e.ok) : (e.ok ? 1 : 0)),
        e.main == null ? '' : (e.main ? 1 : 0), e.metric || '', e.val == null ? '' : Number(e.val),
        e.form == null ? '' : Number(e.form), e.note || '', ADM_NAME]);
    });
    var written = 0;
    order.forEach(function (owner) {
      var rows = groups[owner], sh = lbSheet_(owner, true), n = sh.getLastRow();
      sh.getRange(n + 1, 1, rows.length, LB_W).setValues(rows);
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
  if (log) {
    var r1 = ix ? ix.R1 : 1, nr = ix ? (ix.last - ix.R1 + 1) : log.getLastRow();
    var vals = nr > 0 ? log.getRange(r1, 2, nr, 10).getValues() : [];      /* B..K */
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i], d = statsIso_(r[0], tz), name = String(r[5] || '').trim(), st = String(r[9] || '');
      if (!d || !name) continue;
      if (st.indexOf('ã tập') < 0) continue;
      var pc = out.perClient[name] || (out.perClient[name] = { m: 0, last: '' });
      if (d.slice(0, 7) === month) { out.days[d] = (out.days[d] || 0) + 1; out.monthTotal++; pc.m++; }
      if (d < today && d > pc.last) pc.last = d;
    }
  }
  T.lap('log');

  /* 2. COM — Doanh thu cả phòng: dòng "Tổng" (cột A) của bảng tổng hợp, cột C. Tháng = ô "THÁNG:". */
  var com = ba.getSheetByName('COMMISSION') || ba.getSheetByName('COM');
  if (com) {
    var cv = com.getRange(1, 1, Math.min(com.getLastRow(), 60), 8).getValues(), comMonth = '', rev = null;
    for (var j = 0; j < cv.length; j++) {
      var row = cv[j], a = String(row[0] || '').trim();
      if (!comMonth && /THÁNG/i.test(a)) comMonth = statsMonthLabel_(row[1]);
      if (rev === null && /^tổng$/i.test(a) && row[2] !== '') rev = statsNum_(row[2]);
    }
    if (rev !== null) out.rev = { month: comMonth || month, total: rev };
  }
  T.lap('com');

  /* 3. Lịch sử set theo bài — mọi sheet "Khách của …" */
  try {
    var ctz = lbDb_().getSpreadsheetTimeZone();
    lbCoachSheets_().forEach(function (sh) {
      if (sh.getLastRow() < 2) return;
      var hv = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
      for (var k = 0; k < hv.length; k++) {
        var h = hv[k]; if (String(h[5]) !== 'SET') continue;
        var who = String(h[3] || '').trim(), ex = String(h[7] || '').trim(), dd = statsIso_(h[2], ctz);
        if (!who || !ex || !dd) continue;
        var byEx = out.hist[who] || (out.hist[who] = {}), arr = byEx[ex] || (byEx[ex] = []);
        arr.push({ d: dd, kg: statsNum_(h[9]), rep: statsNum_(h[10]), ok: (h[11] === 1 || h[11] === true || /^(1|true|x|✓)$/i.test(String(h[11]))) ? 1 : 0 });
      }
    });
    for (var w in out.hist) for (var e in out.hist[w]) {
      var arr2 = out.hist[w][e];
      arr2.sort(function (x, y) { return x.d < y.d ? 1 : x.d > y.d ? -1 : 0; });
      if (arr2.length > 24) out.hist[w][e] = arr2.slice(0, 24);
    }
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
   Lưu ý: Worker Cloudflare đọc biến ALLOW_IP riêng — đổi ở đây chỉ đổi phía
   Apps Script (app tự lui về Apps Script khi Worker trả wrong_ip).
   ===================================================================== */
function admIpGet_() {
  var raw = String(PropertiesService.getScriptProperties().getProperty('STUDIO_IP') || '');
  var out = [];
  raw.split(',').forEach(function (s) { s = s.trim(); if (s && out.indexOf(s) < 0) out.push(s); });
  return out;
}
function admIpList_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  return { ok: true, ips: admIpGet_(), max: ADM_IP_MAX };
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
    return { ok: true, ips: list, max: ADM_IP_MAX };
  } finally { lock.releaseLock(); }
}

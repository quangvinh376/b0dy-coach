/* =====================================================================
   B0DY · Coach app — Admin.gs (v2.4 · 26/09/2026)
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
   ===================================================================== */
var ADM_NAME   = 'Admin';   /* tên hiển thị + dấu ký trong SESSION LOG cột N (" · ký: Admin") */
var ADM_IP_MAX = 2;         /* app hiện 2 ô IP (IP phòng + IP thứ 2) */

/* ---------- khách: MEMBERS (mọi coach), mỗi tên một dòng ----------
   MEMBERS có thể có nhiều dòng cùng tên (khách gia hạn gói). Giữ dòng CÒN BUỔI
   cuối cùng; không có thì dòng cuối cùng (sort của lbMembers_ ổn định nên thứ
   tự trùng tên = thứ tự dòng trên sheet). */
function admMembers_(withDone) {
  var mem = lbMembers_(withDone);
  if (!mem || !mem.ok) return mem || { ok: false, error: 'members_failed' };
  var pick = {}, order = [];
  mem.members.forEach(function (m) {
    var k = String(m.name).trim(), cur = pick[k];
    if (!cur) { pick[k] = m; order.push(k); return; }
    if (m.left > 0 || !(cur.left > 0)) pick[k] = m;
  });
  return { ok: true, members: order.map(function (k) { return pick[k]; }) };
}

/* =====================================================================
   action 'adm_data' — như 'coach' nhưng cho MỌI khách của phòng.
   Trả members (kèm coach phụ trách) + snapshot + thư viện + đã check-in hôm nay.
   ===================================================================== */
function admData_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var mem = admMembers_(true);
  if (!mem || !mem.ok) return { ok: false, error: (mem && mem.error) || 'members_failed' };
  var names = {};
  mem.members.forEach(function (m) { names[String(m.name).trim()] = 1; });
  var snap = lbSnapshot_(lbReadAll_(), names);
  var sg = lbSignedToday_();
  mem.members.forEach(function (m) { var t = sg[lbNorm_(m.name)]; if (t !== undefined) { m.checked = true; m.signed = t; } });
  return { ok: true, coach: ADM_NAME, admin: true, members: mem.members, snapshot: snap, library: lbLibrary_(),
           today: lbToday_(), server: Utilities.formatDate(new Date(), LB_TZ, 'yyyy-MM-dd HH:mm') };
}

/* =====================================================================
   action 'adm_checkin' — check-in + ký thay trong MỘT lượt, cho MỌI khách,
   không khoá IP (ipOk_ cho qua khi adminOk_). SESSION LOG: B ngày · G tên ·
   K "Đã tập" · N "app HH:mm · ký: Admin". Cột E (Coach) là công thức tra
   MEMBERS nên KPI vẫn tính cho coach phụ trách.
   KHÔNG BAO GIỜ auto-retry lệnh này từ client.
   ===================================================================== */
function admCheckin_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var name = String(p.name || '').trim();
  if (!name) return { ok: false, error: 'thieu_ten' };
  var owner = memberCoachMap_()[name];
  if (owner == null) return { ok: false, error: 'khong_thay_khach' };     /* kiểm TRƯỚC khi ghi: không để lại dòng treo */
  var r = apiCheckin_(p);                                                 /* chặn trùng theo ngày + tên; dòng Hủy coi như chưa */
  if (!r || !r.ok) return r || { ok: false, error: 'checkin_failed' };
  var s = admSign_(r.row, name, p.date || lbToday_());
  if (!s.ok) return { ok: false, error: s.error, row: r.row, member: r.member };
  /* member của apiCheckin_ đọc TRƯỚC khi ký (Đã tập chưa cộng) và bị khoá IP → đọc lại không khoá IP */
  var me = r.member;
  try { var mem2 = admMembers_(false); if (mem2 && mem2.ok) mem2.members.forEach(function (x) { if (x.name === name) me = x; }); } catch (e) {}
  return { ok: true, row: r.row, member: me, coach: owner, by: ADM_NAME, at: Utilities.formatDate(new Date(), LB_TZ, 'HH:mm') };
}

/* ký thay: dòng phải khớp ngày + tên + đang "Chờ xác nhận" (số dòng chỉ là gợi ý) */
function admSign_(row, name, date) {
  chkInit_();
  var log = chkSS_().getSheetByName(LOG_SHEET);
  if (!log) return { ok: false, error: 'khong_thay_SESSION_LOG' };
  var rr = chkRow_({ row: row, name: name, date: date });
  if (!rr || rr < CHECKIN.ROW1) return { ok: false, error: 'sai_dong' };
  if (String(log.getRange(rr, CHECKIN.COL_STATUS).getValue()).trim() !== CHECKIN.ST_PEND) return { ok: false, error: 'khong_o_trang_thai_cho' };
  log.getRange(rr, CHECKIN.COL_STATUS).setValue(CHECKIN.ST_OK);
  var note = log.getRange(rr, CHECKIN.COL_NOTE).getValue();
  log.getRange(rr, CHECKIN.COL_NOTE).setValue(String(note == null ? '' : note) + ' · ký: ' + ADM_NAME);
  SpreadsheetApp.flush();
  return { ok: true };
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
  var mc = memberCoachMap_();
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
      /* coach phụ trách hiện tại (memberCoachMap_: dòng dưới cùng thắng); bỏ hậu tố "(giai đoạn 1)" để
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
   ===================================================================== */
function admStats_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var month = /^\d{4}-\d{2}$/.test(String(p.month || '')) ? p.month : Utilities.formatDate(new Date(), STATS_TZ, 'yyyy-MM');
  var today = Utilities.formatDate(new Date(), STATS_TZ, 'yyyy-MM-dd');
  var out = { ok: true, coach: ADM_NAME, admin: true, month: month, days: {}, monthTotal: 0, perClient: {}, com: null, rev: null, hist: {}, today: today };
  var ba = SpreadsheetApp.openById(STATS_BA_ID), tz = ba.getSpreadsheetTimeZone();

  /* 1. SESSION LOG — mọi buổi "Đã tập" */
  var log = ba.getSheetByName('SESSION LOG');
  if (log) {
    var vals = log.getRange(1, 1, log.getLastRow(), 14).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i], d = statsIso_(r[1], tz), name = String(r[6] || '').trim(), st = String(r[10] || '');
      if (!d || !name) continue;
      if (st.indexOf('ã tập') < 0) continue;
      var pc = out.perClient[name] || (out.perClient[name] = { m: 0, last: '' });
      if (d.slice(0, 7) === month) { out.days[d] = (out.days[d] || 0) + 1; out.monthTotal++; pc.m++; }
      if (d < today && d > pc.last) pc.last = d;
    }
  }

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

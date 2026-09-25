/* =====================================================================
   B0DY · Coach app v2 — Stats.gs
   Thêm file này vào project Apps Script "B0DY Discord KPI" (cạnh Code.gs, Logbook.gs).
   Cung cấp:
     1. statsApi_(body)   — action "stats": buổi dạy theo ngày trong tháng, số buổi/khách, hoa hồng (tab COMMISSION),
                            lịch sử set theo bài (sheet "Khách của <coach>") cho trang chủ + Hiệu suất tập.
     2. installLibrary()  — ghi thư viện bài tập mới (64 bài · Tên · Nhóm · Vùng · id) vào tab "Bài tập". Chạy tay MỘT lần.
   Nối vào api_() trong Code.gs:   case 'stats': return statsApi_(body);
   Sau khi dán: Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy (bắt buộc, nếu không /exec vẫn chạy code cũ).
   ===================================================================== */
var STATS_BA_ID  = '1QCsIqBHYqqyVYohs9syWt3jT8_wb1JQRbWZp6YF1V14';   // [B0DY Studio] BA
var STATS_CDB_ID = '19iWnTT5eWFKCJ9Mnzuv_pcF1MMH4XGnx60Uc0OXMmeM';   // [B0DY Studio] Customer database
var STATS_TZ     = 'Asia/Ho_Chi_Minh';

/* ---- coach theo PIN (COACH_PINS = JSON {"Tên coach":"PIN"} trong Script Properties) ---- */
function statsCoach_(pin){
  try{
    var map = JSON.parse(PropertiesService.getScriptProperties().getProperty('COACH_PINS') || '{}');
    for (var name in map) if (String(map[name]) === String(pin || '')) return name;
  }catch(e){}
  return null;
}
/* Tên coach trong SESSION LOG có thể mang hậu tố "(giai đoạn 1)" → so theo phần trước dấu ngoặc, không phân biệt hoa thường. */
function statsCoachKey_(s){ return String(s || '').split('(')[0].trim().toLowerCase(); }

/* ---- ngày → 'yyyy-MM-dd' (nhận Date, 'M/d/yyyy', 'dd/MM/yy', 'yyyy-MM-dd') ---- */
function statsIso_(v, tz){
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, tz || STATS_TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    var a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + (+m[3]) : +m[3];
    // SESSION LOG cột B ghi 'M/d/yyyy' (US); ô hiển thị 'dd/MM/yy' (VN). Phân biệt: 4 số năm = US, 2 số năm = VN.
    var mo = m[3].length === 4 ? a : b, d = m[3].length === 4 ? b : a;
    if (mo > 12) { var t = mo; mo = d; d = t; }
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  return '';
}
function statsMonthLabel_(v){   // "September, 2026" | Date | "2026-09" → "2026-09"
  if (v instanceof Date) return Utilities.formatDate(v, STATS_TZ, 'yyyy-MM');
  var s = String(v || ''), m;
  if ((m = s.match(/(\d{4})-(\d{2})/))) return m[1] + '-' + m[2];
  var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var mm = s.toLowerCase().match(/([a-z]+)\D+(\d{4})/);
  if (mm && months.indexOf(mm[1]) >= 0) return mm[2] + '-' + ('0' + (months.indexOf(mm[1]) + 1)).slice(-2);
  return '';
}
function statsNum_(v){ if (typeof v === 'number') return v; var n = parseFloat(String(v || '').replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n; }

function statsApi_(body){
  var coach = statsCoach_(body.pin);
  if (!coach) return { ok: false, error: 'sai_pin' };
  var month = /^\d{4}-\d{2}$/.test(String(body.month || '')) ? body.month : Utilities.formatDate(new Date(), STATS_TZ, 'yyyy-MM');
  var today = Utilities.formatDate(new Date(), STATS_TZ, 'yyyy-MM-dd');
  var out = { ok: true, coach: coach, month: month, days: {}, monthTotal: 0, perClient: {}, com: null, hist: {}, today: today };
  var ba = SpreadsheetApp.openById(STATS_BA_ID), tz = ba.getSpreadsheetTimeZone();

  /* 1. SESSION LOG: buổi "Đã tập" của coach — theo ngày trong tháng + theo khách (số buổi tháng, buổi gần nhất) */
  var log = ba.getSheetByName('SESSION LOG');
  if (log) {
    var vals = log.getRange(1, 1, log.getLastRow(), 14).getValues(), key = statsCoachKey_(coach);
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i], d = statsIso_(r[1], tz), name = String(r[6] || '').trim(), st = String(r[10] || '');
      if (!d || !name || statsCoachKey_(r[4]) !== key) continue;
      if (st.indexOf('ã tập') < 0) continue;                       // chỉ buổi đã tập (cột K)
      var pc = out.perClient[name] || (out.perClient[name] = { m: 0, last: '' });
      if (d.slice(0, 7) === month) { out.days[d] = (out.days[d] || 0) + 1; out.monthTotal++; pc.m++; }
      if (d < today && d > pc.last) pc.last = d;
    }
  }

  /* 2. COMMISSION: dòng của coach trong "TỔNG HỢP THEO COACH", cột Σ Hoa hồng (H). Tháng = ô "THÁNG:". */
  var com = ba.getSheetByName('COMMISSION') || ba.getSheetByName('COM');
  if (com) {
    var cv = com.getRange(1, 1, Math.min(com.getLastRow(), 60), 8).getValues(), comMonth = '', total = null, key2 = statsCoachKey_(coach);
    for (var j = 0; j < cv.length; j++) {
      var row = cv[j];
      if (!comMonth && /THÁNG/i.test(String(row[0]))) comMonth = statsMonthLabel_(row[1]);
      if (statsCoachKey_(row[0]) === key2 && row[1] !== '' && total === null) total = statsNum_(row[7]);
    }
    if (total !== null) out.com = { month: comMonth || month, total: total };
  }

  /* 3. Lịch sử set theo bài — sheet "Khách của <coach>" (id · Ghi lúc · Ngày · Khách · Buổi # · Loại · Buổi tập · Bài tập · Set # · KG · REP · Đạt) */
  try {
    var cdb = SpreadsheetApp.openById(STATS_CDB_ID), sh = cdb.getSheetByName('Khách của ' + coach);
    if (sh && sh.getLastRow() > 1) {
      var hv = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
      for (var k = 0; k < hv.length; k++) {
        var h = hv[k]; if (String(h[5]) !== 'SET') continue;
        var who = String(h[3] || '').trim(), ex = String(h[7] || '').trim(), dd = statsIso_(h[2], cdb.getSpreadsheetTimeZone());
        if (!who || !ex || !dd) continue;
        var byEx = out.hist[who] || (out.hist[who] = {}), arr = byEx[ex] || (byEx[ex] = []);
        arr.push({ d: dd, kg: statsNum_(h[9]), rep: statsNum_(h[10]), ok: (h[11] === 1 || h[11] === true || /^(1|true|x|✓)$/i.test(String(h[11]))) ? 1 : 0 });
      }
      for (var w in out.hist) for (var e in out.hist[w]) { var a = out.hist[w][e]; a.sort(function (p, q) { return p.d < q.d ? 1 : p.d > q.d ? -1 : 0; }); if (a.length > 24) out.hist[w][e] = a.slice(0, 24); }
    }
  } catch (err) { out.histError = String(err); }
  return out;
}

/* =====================================================================
   THƯ VIỆN BÀI TẬP — b0dy-exercise-library v1 (Tên · Nhóm · Vùng · id)
   Chạy installLibrary() MỘT lần: ghi đè tab "Bài tập" trong Customer database.
   Cột A/B giữ đúng nghĩa cũ (Tên/Nhóm) nên action "coach" hiện có đọc được ngay.
   ===================================================================== */
var STATS_LIBRARY = [
  ['Lat Pulldown (Wide Pronated Grip)','Lat Pulldown','Back','lat-pulldown-wide-pronated-grip'],
  ['Lat Pulldown (Medium Supinated Grip)','Lat Pulldown','Back','lat-pulldown-medium-supinated-grip'],
  ['Lat Pulldown (Neutral Grip)','Lat Pulldown','Back','lat-pulldown-neutral-grip'],
  ['Seated Cable Row (Close Neutral Grip)','Row','Back','seated-cable-row-close-neutral-grip'],
  ['Seated Cable Row (Wide/Medium Pronated Grip)','Row','Back','seated-cable-row-wide-medium-pronated-grip'],
  ['DB Bent-Over Row','Row','Back','db-bent-over-row'],
  ['T-Bar Row','Row','Back','t-bar-row'],
  ['Incline DB Press (15°)','Incline Press','Chest','incline-db-press-15deg'],
  ['Incline DB Press (35°)','Incline Press','Chest','incline-db-press-35deg'],
  ['Incline BB Press (35°)','Incline Press','Chest','incline-bb-press-35deg'],
  ['Push-Up','Push-Up','Chest','push-up'],
  ['Incline Push-Up','Push-Up','Chest','incline-push-up'],
  ['Weighted Push-Up','Push-Up','Chest','weighted-push-up'],
  ['Ring Push-Up','Push-Up','Chest','ring-push-up'],
  ['Standing BB Overhead Press','Overhead Press','Shoulders','standing-bb-overhead-press'],
  ['Seated DB Shoulder Press (65°)','Overhead Press','Shoulders','seated-db-shoulder-press-65deg'],
  ['Arnold Press','Overhead Press','Shoulders','arnold-press'],
  ['Scott Press','Overhead Press','Shoulders','scott-press'],
  ['DB Lateral Raise','Lateral Raise','Shoulders','db-lateral-raise'],
  ['Single-Arm Cable Lateral Raise','Lateral Raise','Shoulders','single-arm-cable-lateral-raise'],
  ['Chest-Supported DB Rear Delt Raise (35°)','Rear Delt','Shoulders','chest-supported-db-rear-delt-raise-35deg'],
  ['Dual Cable Rear Delt Fly','Rear Delt','Shoulders','dual-cable-rear-delt-fly'],
  ['Incline DB Curl (65°)','Biceps','Arms','incline-db-curl-65deg'],
  ['BB Curl','Biceps','Arms','bb-curl'],
  ['Reverse BB Curl','Biceps','Arms','reverse-bb-curl'],
  ['Alternating DB Curl (Offset Grip)','Biceps','Arms','alternating-db-curl-offset-grip'],
  ['Single-Arm Preacher Curl','Biceps','Arms','single-arm-preacher-curl'],
  ['DB Preacher Curl (Neutral Grip)','Biceps','Arms','db-preacher-curl-neutral-grip'],
  ['Cable Overhead Triceps Extension (Rope, Mid Pulley)','Triceps','Arms','cable-overhead-triceps-extension-rope-mid-pulley'],
  ['Lying BB Triceps Extension','Triceps','Arms','lying-bb-triceps-extension'],
  ['Lying DB Triceps Extension','Triceps','Arms','lying-db-triceps-extension'],
  ['Ring Triceps Extension','Triceps','Arms','ring-triceps-extension'],
  ['Cable Triceps Pushdown (Rope)','Triceps','Arms','cable-triceps-pushdown-rope'],
  ['Decline Knee Raise','Abs','Core','decline-knee-raise'],
  ['Hanging Leg Raise','Abs','Core','hanging-leg-raise'],
  ['Cable Crunch','Abs','Core','cable-crunch'],
  ['Ring Bent-Arm Pullover','Abs','Core','ring-bent-arm-pullover'],
  ['BB Back Squat','Squat','Legs','bb-back-squat'],
  ['BB Front Squat','Squat','Legs','bb-front-squat'],
  ['Zercher Squat','Squat','Legs','zercher-squat'],
  ['BB Hack Squat','Squat','Legs','bb-hack-squat'],
  ['DB Hack Squat','Squat','Legs','db-hack-squat'],
  ['Cyclist Squat','Squat','Legs','cyclist-squat'],
  ['Goblet Squat','Squat','Legs','goblet-squat'],
  ['DB Split Squat','Split Squat','Legs','db-split-squat'],
  ['BB Split Squat','Split Squat','Legs','bb-split-squat'],
  ['DB Bulgarian Split Squat','Split Squat','Legs','db-bulgarian-split-squat'],
  ['BB Bulgarian Split Squat','Split Squat','Legs','bb-bulgarian-split-squat'],
  ['Leg Extension','Leg Extension','Legs','leg-extension'],
  ['BB Romanian Deadlift','Hip Hinge','Legs','bb-romanian-deadlift'],
  ['DB Romanian Deadlift','Hip Hinge','Legs','db-romanian-deadlift'],
  ['Deficit Romanian Deadlift','Hip Hinge','Legs','deficit-romanian-deadlift'],
  ['Wide-Stance Good Morning','Hip Hinge','Legs','wide-stance-good-morning'],
  ['Good Morning','Hip Hinge','Legs','good-morning'],
  ['Lying Leg Curl','Leg Curl','Legs','lying-leg-curl'],
  ['Nordic Hamstring Curl','Leg Curl','Legs','nordic-hamstring-curl'],
  ['Glute-Ham Raise','Leg Curl','Legs','glute-ham-raise'],
  ['Hip Adduction Machine','Hip Adduction','Legs','hip-adduction-machine'],
  ['Hip Abduction Machine','Hip Abduction','Legs','hip-abduction-machine'],
  ['Glute Kickback','Glute Kickback','Legs','glute-kickback'],
  ['Standing Smith Calf Raise','Calf Raise','Legs','standing-smith-calf-raise'],
  ['Seated Smith Calf Raise','Calf Raise','Legs','seated-smith-calf-raise'],
  ['Soleus Push-Up','Calf Raise','Legs','soleus-push-up'],
  ['Johnson Calf Raise','Calf Raise','Legs','johnson-calf-raise']
];
function installLibrary(){
  var ss = SpreadsheetApp.openById(STATS_CDB_ID), sh = ss.getSheetByName('Bài tập') || ss.insertSheet('Bài tập');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    sh.clearContents();
    var rows = [['Tên', 'Nhóm', 'Vùng', 'id']].concat(STATS_LIBRARY);
    sh.getRange(1, 1, rows.length, 4).setValues(rows);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    sh.setFrozenRows(1);
  } finally { lock.releaseLock(); }
  Logger.log('Đã ghi ' + STATS_LIBRARY.length + ' bài vào tab "Bài tập"');
  return STATS_LIBRARY.length;
}
/* Kiểm nhanh trong editor: chọn testStats ▸ Run, đọc Logger (thay PIN bằng PIN coach thật, KHÔNG commit giá trị). */
function testStats(){ Logger.log(JSON.stringify(statsApi_({ pin: PropertiesService.getScriptProperties().getProperty('TEST_PIN') || '' })).slice(0, 2000)); }

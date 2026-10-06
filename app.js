/* =====================================================================
   B0DY · Coach app (logbook) — v2
   UI theo Figma "Exploring UX journey" (714soNBELbh3mro8qZZ4Ar · 117:2).
   Lớp hạ tầng (API, outbox có id, cache stale-while-revalidate, PWA) kế thừa v1.7.
   Data thật qua Cloudflare Worker + Apps Script (action coach / checkin_coach / log / stats).
   Không có API hoặc ?demo → chạy bằng data mẫu (không gọi mạng).
   ===================================================================== */
'use strict';
var $=function(id){ return document.getElementById(id); };
var APP_VER='v2.6.2';

/* ---------------- tiện ích ---------------- */
function isoToday(d){ d=d||new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function isoAdd(iso, n){ var p=iso.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]+n); return isoToday(d); }
function vn(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0].slice(2) : iso; }
function vnFull(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso; }
function vnLong(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3 ? (+p[2])+' tháng '+p[1]+', '+p[0] : iso; }
var TODAY_ISO=isoToday(), TODAY=vn(TODAY_ISO);
function fmt1(v){ return (Math.round(v*10)/10).toFixed(1).replace('.',','); }
function fmtN(v){ v=+v; return (Math.round(v*10)%10===0) ? String(Math.round(v)) : fmt1(v); }
function fmtTr(v){ return (Math.round(v/100000)/10).toFixed(1).replace('.',','); }   /* 9.769.250 → 9,8 */
function pct(a,b){ return b>0 ? Math.min(100, a/b*100) : 0; }
function upper(s){ return String(s||'').toUpperCase(); }
function firstName(n){ var p=String(n||'').trim().split(/\s+/); return p.length>1 ? p.slice(-2).join(' ') : p[0]; }
/* tên coach trên trang chủ: luôn "đệm + tên" (Quyết Hán, Hiền Mai, Khải Phan, Lâm Nguyễn, Bích Ngọc) */
var COACH_FULL={quyet:'Quyết Hán', hien:'Hiền Mai', khai:'Khải Phan', lam:'Lâm Nguyễn', ngoc:'Bích Ngọc'};
function coachName(n){ n=String(n||'').trim(); if(!n) return 'Coach'; var w=n.split(/\s+/), k=norm(w[w.length-1]); if(COACH_FULL[k]) return COACH_FULL[k]; return w.length>1 ? w.slice(-2).join(' ') : n; }
function norm(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/g,'d').replace(/\u0110/g,'D').toLowerCase(); }
function nowHM(){ var d=new Date(); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
function mmss(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
function pad2(n){ return ('0'+n).slice(-2); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function ico(name, cls){ return '<svg class="ic'+(cls?' '+cls:'')+'"><use href="#'+name+'"/></svg>'; }
var UD='<svg class="ud" viewBox="0 0 9 12"><path d="M0 4.5L4.5 0 9 4.5zM0 7.5L4.5 12 9 7.5z"/></svg>';
var UD13='<svg class="ic ud13"><use href="#i-ud13"/></svg>';

/* ---------------- CHỈ SỐ ĐO (6) ---------------- */
var METRICS=[
  {id:'weight',name:'Cân nặng',unit:'KG',ic:'m-weight',step:.5,max:200,def:60},
  {id:'arm',name:'Bắp tay',unit:'CM',ic:'m-arm',step:.5,max:80,def:32},
  {id:'waist',name:'Eo',unit:'CM',ic:'m-waist',step:.5,max:160,def:75},
  {id:'hip',name:'Hông',unit:'CM',ic:'m-hip',step:.5,max:160,def:90},
  {id:'chest',name:'Ngực',unit:'CM',ic:'m-chest',step:.5,max:160,def:90},
  {id:'thigh',name:'Đùi',unit:'CM',ic:'m-thigh',step:.5,max:100,def:50}
];
function metric(id){ return METRICS.filter(function(x){return x.id===id})[0]; }
function H(m,id){ return (m.measures||[]).filter(function(x){return x[id]!=null}).map(function(x){return x[id]}); }
function last(a){ return a.length?a[a.length-1]:null; }

/* ---------------- THƯ VIỆN BÀI TẬP (b0dy-exercise-library v1) ----------------
   Máy chủ có sheet "Bài tập" (Tên · Nhóm · Vùng · id) thì ghi đè; đây là bản mặc định để app chạy được ngay. */
var EX_LIB=[
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
].map(function(r){ return {name:r[0], group:r[1], part:r[2], id:r[3]}; });
var EX_BY_NAME={}; EX_LIB.forEach(function(e){ EX_BY_NAME[e.name]=e; });
/* tên hiển thị rút gọn (≤ 4 từ): PD = Pulldown · OH = Overhead · Tri = Triceps · Ext = Extension · RDL = Romanian Deadlift · Alt = Alternating · 1-Arm = Single-Arm.
   Tên đầy đủ vẫn là khoá dữ liệu (sheet, outbox, last). */
var EX_SHORT={
 'Lat Pulldown (Wide Pronated Grip)':'PD Wide Pronated','Lat Pulldown (Medium Supinated Grip)':'PD Medium Supinated','Lat Pulldown (Neutral Grip)':'PD Neutral',
 'Seated Cable Row (Close Neutral Grip)':'Seated Row Close Neutral','Seated Cable Row (Wide/Medium Pronated Grip)':'Seated Row Wide Pronated','DB Bent-Over Row':'DB Bent-Over Row','T-Bar Row':'T-Bar Row',
 'Incline DB Press (15°)':'Incline DB Press 15°','Incline DB Press (35°)':'Incline DB Press 35°','Incline BB Press (35°)':'Incline BB Press 35°',
 'Push-Up':'Push-Up','Incline Push-Up':'Incline Push-Up','Weighted Push-Up':'Weighted Push-Up','Ring Push-Up':'Ring Push-Up',
 'Standing BB Overhead Press':'Standing BB OHP','Seated DB Shoulder Press (65°)':'Seated DB Press 65°','Arnold Press':'Arnold Press','Scott Press':'Scott Press',
 'DB Lateral Raise':'DB Lateral Raise','Single-Arm Cable Lateral Raise':'1-Arm Cable Lateral','Chest-Supported DB Rear Delt Raise (35°)':'DB Rear Delt 35°','Dual Cable Rear Delt Fly':'Cable Rear Delt Fly',
 'Incline DB Curl (65°)':'Incline DB Curl 65°','BB Curl':'BB Curl','Reverse BB Curl':'Reverse BB Curl','Alternating DB Curl (Offset Grip)':'Alt DB Curl Offset','Single-Arm Preacher Curl':'1-Arm Preacher Curl','DB Preacher Curl (Neutral Grip)':'DB Preacher Curl Neutral',
 'Cable Overhead Triceps Extension (Rope, Mid Pulley)':'Cable OH Tri Ext','Lying BB Triceps Extension':'Lying BB Tri Ext','Lying DB Triceps Extension':'Lying DB Tri Ext','Ring Triceps Extension':'Ring Tri Ext','Cable Triceps Pushdown (Rope)':'Cable Pushdown Rope',
 'Decline Knee Raise':'Decline Knee Raise','Hanging Leg Raise':'Hanging Leg Raise','Cable Crunch':'Cable Crunch','Ring Bent-Arm Pullover':'Ring Bent-Arm Pullover',
 'BB Back Squat':'BB Back Squat','BB Front Squat':'BB Front Squat','Zercher Squat':'Zercher Squat','BB Hack Squat':'BB Hack Squat','DB Hack Squat':'DB Hack Squat','Cyclist Squat':'Cyclist Squat','Goblet Squat':'Goblet Squat',
 'DB Split Squat':'DB Split Squat','BB Split Squat':'BB Split Squat','DB Bulgarian Split Squat':'DB Bulgarian Split Squat','BB Bulgarian Split Squat':'BB Bulgarian Split Squat','Leg Extension':'Leg Extension',
 'BB Romanian Deadlift':'BB RDL','DB Romanian Deadlift':'DB RDL','Deficit Romanian Deadlift':'Deficit RDL','Wide-Stance Good Morning':'Wide Good Morning','Good Morning':'Good Morning',
 'Lying Leg Curl':'Lying Leg Curl','Nordic Hamstring Curl':'Nordic Curl','Glute-Ham Raise':'Glute-Ham Raise','Hip Adduction Machine':'Hip Adduction','Hip Abduction Machine':'Hip Abduction','Glute Kickback':'Glute Kickback',
 'Standing Smith Calf Raise':'Standing Smith Calf','Seated Smith Calf Raise':'Seated Smith Calf','Soleus Push-Up':'Soleus Push-Up','Johnson Calf Raise':'Johnson Calf Raise'
};
var EX_ABBR=[[/\bLat Pulldown\b/gi,'PD'],[/\bPulldown\b/gi,'PD'],[/\bPull ?Down\b/gi,'PD'],[/\bRomanian Deadlift\b/gi,'RDL'],[/\bOverhead Press\b/gi,'OHP'],[/\bOverhead\b/gi,'OH'],[/\bTriceps\b/gi,'Tri'],[/\bExtension\b/gi,'Ext'],[/\bSingle-Arm\b/gi,'1-Arm'],[/\bAlternating\b/gi,'Alt'],[/\bDumbbell\b/gi,'DB'],[/\bBarbell\b/gi,'BB'],[/\bMachine\b/gi,''],[/\bGrip\b/gi,''],[/\bCable Row\b/gi,'Row'],[/\bChest-Supported\b/gi,''],[/\bRaise\b/gi,'']];
function exShort(n){
  n=String(n||''); if(EX_SHORT[n]) return EX_SHORT[n];
  var t=n.replace(/\(([^)]*)\)/g,' $1 ').replace(/,/g,' ');
  EX_ABBR.forEach(function(r){ t=t.replace(r[0], r[1]); });
  var w=t.split(/\s+/).filter(Boolean); if(w.length>4) w=w.slice(0,4);
  return w.join(' ')||n;
}
/* thư viện đang dùng: máy chủ trả {Nhóm:[Tên]} (sheet "Bài tập") → hợp với vùng cơ của bản nhúng */
/* Bản nhúng là gốc; sheet "Bài tập" trên máy chủ chỉ BỔ SUNG bài chưa có (nhóm theo cột Nhóm của sheet).
   Nhờ vậy sheet cũ (Upper/Lower/…) không ghi đè thư viện mới; chạy installLibrary() rồi thì hai bên trùng nhau. */
function libEntries(){
  var srv=state.lib, out=EX_LIB.slice(), seen={}; EX_LIB.forEach(function(e){ seen[e.name]=1; });
  if(srv && typeof srv==='object' && !Array.isArray(srv)){
    Object.keys(srv).forEach(function(g){ (srv[g]||[]).forEach(function(n){ n=String(n||'').trim(); if(!n||seen[n]) return; seen[n]=1; out.push({name:n, group:g, part:'', id:norm(n).replace(/[^a-z0-9]+/g,'-')}); }); });
  }
  return out;
}
function libGroups(){
  var by={}, order=[];
  libEntries().forEach(function(e){ if(!by[e.group]){ by[e.group]=[]; order.push(e.group); } by[e.group].push(e); });
  return order.map(function(g){ return {name:g, items:by[g]}; });
}
function exPart(name){ var k=EX_BY_NAME[name]; if(k) return k.part; var e=libEntries().filter(function(x){return x.name===name})[0]; return e?(e.part||e.group):''; }
function exGroup(name){ var e=libEntries().filter(function(x){return x.name===name})[0]; return e?e.group:(EX_BY_NAME[name]?EX_BY_NAME[name].group:''); }

/* =====================================================================
   LỚP DỮ LIỆU — API, cache, hàng đợi ghi (kế thừa v1.7)
   ===================================================================== */
var API='https://script.google.com/macros/s/AKfycbyyCRs0JkV1k8npUpprP44RN-rgNnagWELRBwncBKAiiRKO6hNLDqFcnUrJz7hC_To41g/exec'; /* deployment "Coach API v1" */
var API_WK='https://b0dy-kiosk-api.little-bonus-1d87.workers.dev/';
var WK_ON={coach:1,log:1,checkin_coach:1}, WK_OFF={wk_unconfigured:1,wrong_ip:1,unknown_action:1,wk_no_sheet_coach:1}, WK_SAFE={coach:1,log:1};
var DEMO=!API || /[?&]demo\b/.test(location.search);
/* ADMIN (v2.4): PIN admin → "Admin": mọi khách của phòng, check-in không khoá IP, tab Cài đặt (IP phòng).
   Cùng các màn và luồng của coach; api() đổi tên lệnh sang bản admin (backend Admin.gs, chỉ có ở Apps Script → không đi Worker). */
var ADM_ACT={coach:'adm_data', stats:'adm_stats', log:'adm_log', checkin_coach:'adm_checkin'};
var ST=function(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } };
var SS=function(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
var SES=function(k,v){ try{ if(v===undefined) return sessionStorage.getItem(k); if(v==null) sessionStorage.removeItem(k); else sessionStorage.setItem(k,v); }catch(e){ return null; } };

function fetchJson(url, opts, timeoutMs){
  return new Promise(function(resolve, reject){
    var ctrl=new AbortController(), to=setTimeout(function(){ ctrl.abort(); }, timeoutMs||14000);
    opts=opts||{}; opts.signal=ctrl.signal;
    fetch(url, opts).then(function(r){ clearTimeout(to); return r.json(); }).then(resolve, function(e){ clearTimeout(to); reject(e); });
  });
}
/* api(body, tries, wait, t0, tmo): retry theo hạn chót. Lệnh ghi đi qua outbox, KHÔNG retry trần. */
function api(body, tries, wait, t0, tmo){
  tries=(tries===undefined)?2:tries; wait=wait||600; t0=t0||Date.now(); tmo=tmo||30000;
  body.ip=state.ip; if(state.pin && !body.pin && !body.apin) body.pin=state.pin;
  if(state.admin && state.apin){ if(!body.apin) body.apin=state.apin; if(ADM_ACT[body.action]) body.action=ADM_ACT[body.action]; }
  if(DEMO) return demoApi(body);
  var payload=JSON.stringify(body);
  if(WK_ON[body.action] && !body._gas){
    var wtmo=(body.action==='checkin_coach')?20000:15000;
    return fetchJson(API_WK,{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:payload}, wtmo)
      .then(function(r){ if(r && WK_OFF[r.error]) throw new Error('wk_off'); return r; })
      .catch(function(e){ if(e.message!=='wk_off' && !WK_SAFE[body.action]) throw e; var b2=JSON.parse(payload); b2._gas=1; return api(b2, tries, wait, Date.now(), tmo); });
  }
  return fetchJson(API,{method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:payload}, tmo)
    .catch(function(e){
      if(tries>0 && (Date.now()-t0)<(tmo+1000)){
        return new Promise(function(res){ setTimeout(res, wait); }).then(function(){ return api(JSON.parse(payload), tries-1, Math.min(wait*2,6000), t0, tmo); });
      }
      throw e;
    });
}
function warm(){ if(DEMO) return; var wo=function(){ return {method:'POST',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ping'})}; }; fetchJson(API,wo(),6000).catch(function(){}); fetchJson(API_WK,wo(),6000).catch(function(){}); }
function refreshIp(){
  if(DEMO) return Promise.resolve();
  return fetchJson('https://api.ipify.org?format=json',{},5000).then(function(j){ if(j&&j.ip){ state.ip=j.ip; SS('lb_ip',j.ip); } }).catch(function(){});
}

/* ---- khách của coach: members (BA) + snapshot (Customer database) → state.clients ---- */
function buildClients(res, t0){
  var snap=res.snapshot||{};
  state.coach=res.coach; state.lib=res.library||null;
  state.clients=(res.members||[]).map(function(m){
    var c=snap[m.name]||{};
    return {name:m.name, done:+m.done||0, total:+m.total||0, left:(m.left!=null?+m.left:Math.max(0,(+m.total||0)-(+m.done||0))), coach:m.coach,
            start:m.start||'', end:m.end||'', exp:m.exp||m.expiry||'', kind:m.kind||m.type||'', checked:!!m.checked, signed:m.signed||'',
            measures:(c.measures||[]).slice().sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:0}), target:c.target||{}, main:c.main||'weight', last:c.last||{}, plans:c.plans||{}};
  });
  if(res.today) TODAY_ISO=res.today, TODAY=vn(TODAY_ISO);
  /* máy chủ nói CHƯA check-in hôm nay (ví dụ dòng SESSION LOG đã bị xoá) → bỏ bản ghi "đã tập" trong máy, trừ check-in vừa xong sau lúc gửi yêu cầu */
  if(t0){ var ch=false; state.clients.forEach(function(m){ var ci=CI[m.name]; if(ci && ci.day===TODAY_ISO && ci.status==='ok' && !m.checked && (ci.t||0)<t0){ delete CI[m.name]; ch=true; } }); if(ch) ciSave(); }
  applyPending();
}
/* sự kiện còn nằm trong hàng đợi (máy chủ chưa nhận) vẫn phải hiện trên UI */
function applyPending(){
  OUT.q.forEach(function(e){
    var c=findClient(e.name); if(!c) return;
    if(e.type==='ĐO'){ var m=c.measures.filter(function(x){return x.d===e.date})[0]; if(!m){ m={d:e.date}; c.measures.push(m); c.measures.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:0}); } m[e.metric]=e.val; }
    else if(e.type==='MỤC TIÊU'){ c.target[e.metric]=e.val; c.main=e.metric; }
    else if(e.type==='SET'){ if(e.ok) c.last[e.ex]={kg:e.kg,rep:e.rep,d:e.date}; }
  });
}
function saveCache(res){
  SS('lb_data_'+res.coach, JSON.stringify({ts:Date.now(), res:res}));
  var h=hashPin(curPin()), rec={coach:res.coach, h:h, adm:state.admin?1:0}, a=accLoad();
  SS('lb_last', JSON.stringify(rec)); a[h]={coach:rec.coach, adm:rec.adm}; SS('lb_acc', JSON.stringify(a));
}
/* v2.4.1 — nhớ TỪNG tài khoản đã đăng nhập trên máy (hash PIN → coach | Admin), không chỉ người cuối:
   đổi qua lại coach ⇄ Admin vẫn vào ngay từ cache rồi làm mới ngầm (trước đây PIN khác người cuối → luôn đi đường mạng). */
function curPin(){ return state.admin ? state.apin : state.pin; }
function accLoad(){ try{ var a=JSON.parse(ST('lb_acc')||'null'); return (a && typeof a==='object' && !Array.isArray(a)) ? a : {}; }catch(e){ return {}; } }
function accFind(pin){
  if(!pin) return null;
  var h=hashPin(pin), a=accLoad()[h], l=null;
  if(a && a.coach) return {coach:String(a.coach), adm:a.adm?1:0};
  try{ l=JSON.parse(ST('lb_last')||'null'); }catch(e){}
  return (l && l.h===h && l.coach) ? {coach:String(l.coach), adm:l.adm?1:0} : null;
}
/* máy chủ báo PIN không còn hiệu lực → quên tài khoản đó (không cho vào bằng cache lần sau) */
function accDrop(pin){
  if(!pin) return; var h=hashPin(pin), a=accLoad(), l=null;
  if(a[h]){ delete a[h]; SS('lb_acc', JSON.stringify(a)); }
  try{ l=JSON.parse(ST('lb_last')||'null'); }catch(e){}
  if(l && l.h===h) SS('lb_last', null);
}
/* đã đăng nhập: PIN coach, hoặc PIN admin */
function authed(){ return !!(state.pin || (state.admin && state.apin)); }
/* mỗi lần đổi người dùng (đăng nhập / đăng xuất / coach ⇄ Admin) tăng AUTH_EP: nút hành động của pill tạo ở phiên trước
   (ví dụ "Thử lại" check-in của coach) không được chạy dưới phiên của người khác */
var AUTH_EP=0;
function setAdmin(on, pin){
  AUTH_EP++; state._refreshing=null; state._stats=null;   /* lệnh làm mới đang bay thuộc phiên cũ: bỏ (xem refreshData/refreshStats) */
  state.admin=!!on; state.apin=on?String(pin||''):'';
  if(on){ state.pin=''; state.coach='Admin'; }
  document.body.classList.toggle('adm', !!on);
}
function loadCache(coach){ try{ var c=JSON.parse(ST('lb_data_'+coach)||'null'); return c&&c.res?c:null; }catch(e){ return null; } }
function hashPin(p){ var h=2166136261; p=String(p||''); for(var i=0;i<p.length;i++){ h^=p.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h.toString(16); }
function findClient(name){ return (state.clients||[]).filter(function(c){return c.name===name})[0]; }
/* đồng bộ ngầm: lấy lại toàn bộ (stale-while-revalidate) */
/* v2.4.1: danh sách + thống kê chạy SONG SONG (trước đây thống kê chờ danh sách xong mới gọi → Admin chờ ~15 s + ~12 s).
   ep=AUTH_EP: kết quả về sau khi đã đổi người dùng (coach ⇄ Admin, đăng xuất) bị bỏ — không đổ dữ liệu phiên cũ vào phiên mới. */
function refreshData(quiet){
  if(state._refreshing) return state._refreshing;
  var t0=Date.now(), ep=AUTH_EP;
  refreshStats(true);
  var p=state._refreshing=api({action:'coach'}, 2, 600, 0, 30000).then(function(res){
    if(ep!==AUTH_EP) return;
    state._refreshing=null;
    if(!res||!res.ok){ if(res&&res.error==='sai_pin') pinGone(ep); return; }
    var before=JSON.stringify(state.clients);
    buildClients(res, t0); saveCache(res); state.dataTs=Date.now();
    if(state.client) state.client=findClient(state.client.name)||state.client;
    if(JSON.stringify(state.clients)!==before && HOOK[state.screen] && REFRESHABLE[state.screen]){ HOOK[state.screen](null,true); afterShow($(state.screen)); }
    /* máy chủ vừa đổi TODAY_ISO sang tháng mới mà thống kê đã về theo tháng cũ → lấy lại */
    if(!state._stats && state.stats && state.stats.month && state.stats.month!==TODAY_ISO.slice(0,7)) refreshStats(true);
  }).catch(function(){ if(ep!==AUTH_EP) return; state._refreshing=null; if(!quiet) notify('Máy chủ chậm', {err:true}); });
  return p;
}
var REFRESHABLE={'p-home':1,'p-clients':1,'p-profile':1,'p-pick':1,'p-confirm':1,'p-measure':1,'p-perf':1};
/* thống kê cho trang chủ + hiệu suất tập (action stats · Apps Script). Thiếu cũng không sao: ô hiện "—". */
function refreshStats(quiet, again){
  if(state._stats) return state._stats;
  var ep=AUTH_EP, month=TODAY_ISO.slice(0,7);
  var p=state._stats=api({action:'stats', month:month, _gas:1}, 1, 800, 0, 30000).then(function(res){
    if(ep!==AUTH_EP) return;
    state._stats=null;
    if(!res||!res.ok) return;
    if(month!==TODAY_ISO.slice(0,7) && !again) return refreshStats(true, 1);   /* sang tháng mới giữa chừng */
    statsApply(res);
  }).catch(function(){ if(ep===AUTH_EP) state._stats=null; });
  return p;
}
function statsApply(res){
  state.stats=res; SS('lb_stats_'+state.coach, JSON.stringify({ts:Date.now(), res:res}));
  if(state.screen==='p-home') renderHome(false);
  else if(state.screen==='p-perf') renderPerf(false);
  else if(state.screen==='p-confirm') HOOK['p-confirm'](null,true);
}
function loadStats(coach){ try{ var c=JSON.parse(ST('lb_stats_'+coach)||'null'); return c&&c.res?c.res:null; }catch(e){ return null; } }
function logout(msg){ state.pin=''; setAdmin(false); hidePill(); SES('lb_pin',null); state.loading=false; state.clients=[]; state.stats=null; go('p-pin','back'); if(msg) setTimeout(function(){ pinError(msg); },300); }
/* máy chủ trả sai_pin cho PIN của phiên này → quên tài khoản đó rồi về màn PIN. ep khác = kết quả của phiên cũ → bỏ qua. */
function pinGone(ep){ if(ep!=null && ep!==AUTH_EP) return; accDrop(curPin()); logout('MÃ PIN KHÔNG CÒN HIỆU LỰC'); }

/* ---- hàng đợi ghi (outbox): UI cập nhật ngay, nền gửi theo lô, id chống trùng ----
   ev.hold=1: sự kiện "đang giữ" (set vừa ghi, còn hoàn tác được) → chưa gửi cho tới khi release().
   v2.6: set giữ suốt vòng nghỉ (đặt giờ + đang nghỉ) và chỉ nhả khi coach đi tiếp (vào set mới · đổi bài · xong bài · kết thúc). */
var OUT={q:[], busy:false, timer:0};
try{ OUT.q=JSON.parse(ST('lb_outbox')||'[]'); if(!Array.isArray(OUT.q)) OUT.q=[]; }catch(e){ OUT.q=[]; }
OUT.q.forEach(function(e){ delete e.hold; });               /* mở lại app: set đã ghi thì đứng, không giữ nữa */
function uid(){ return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8); }
function outSave(){ SS('lb_outbox', JSON.stringify(OUT.q)); }
function enqueue(ev, hold){
  ev.id=uid(); ev.date=ev.date||TODAY_ISO; ev.name=ev.name||''; ev.coach=state.coach; if(hold) ev.hold=1;
  OUT.q.push(ev); outSave();
  clearTimeout(OUT.timer); OUT.timer=setTimeout(function(){ flush(); }, 4000);
  return ev;
}
function release(id){ var ch=false; OUT.q.forEach(function(e){ if((!id||e.id===id) && e.hold){ delete e.hold; ch=true; } }); if(ch){ outSave(); clearTimeout(OUT.timer); OUT.timer=setTimeout(function(){ flush(); }, 1500); } }
function unqueue(id){ var n=OUT.q.length; OUT.q=OUT.q.filter(function(e){ return e.id!==id; }); if(OUT.q.length!==n){ outSave(); return true; } return false; }
/* sự kiện còn đang giữ (chưa từng rời máy) → xoá được mà không để lại bản ghi ma trên máy chủ */
function held(id){ return OUT.q.some(function(e){ return e.id===id && e.hold; }); }
/* sự kiện gửi được bằng phiên hiện tại: phiên Admin chỉ gửi sự kiện ghi trong chế độ Admin, phiên coach không gửi sự kiện của Admin
   (máy dùng chung: không để dữ liệu của người này đi dưới PIN của người kia — chờ đúng người đăng nhập lại) */
function mine(e){ return state.admin ? e.coach==='Admin' : e.coach!=='Admin'; }
function flush(){
  if(OUT.busy || !authed()) return Promise.resolve();
  var batch=OUT.q.filter(function(e){ return !e.hold && mine(e); }).slice(0,150), ids={}; batch.forEach(function(e){ ids[e.id]=1; });
  if(!batch.length) return Promise.resolve();
  OUT.busy=true; var ep=AUTH_EP;
  return api({action:'log', events:batch}, 1, 800, 0, 30000).then(function(res){
    OUT.busy=false;
    if(res&&res.ok){ OUT.q=OUT.q.filter(function(e){ return !ids[e.id]; }); outSave(); OUT.fail=0; if(OUT.q.some(function(e){return !e.hold && mine(e)})) flush(); }
    else if(res&&res.error==='sai_pin'){ pinGone(ep); }
    else { OUT.fail=(OUT.fail||0)+1; }
  }).catch(function(){ OUT.busy=false; OUT.fail=(OUT.fail||0)+1; });
}
function pendingCount(){ return OUT.q.filter(function(e){return !e.hold && mine(e)}).length; }
setInterval(function(){ if(pendingCount() && !OUT.busy) flush(); }, 30000);
['online','pageshow'].forEach(function(ev){ window.addEventListener(ev, function(){ flush(); refreshIp(); }); });
document.addEventListener('visibilitychange', function(){ if(!document.hidden){ flush(); refreshIp(); } });

/* ---- buổi đang ghi dở: cất localStorage để mở lại app không mất set ---- */
function saveSession(){ var s=state.session; if(!s){ SS('lb_session',null); return; } SS('lb_session', JSON.stringify(s)); }
function loadSession(){
  try{ var s=JSON.parse(ST('lb_session')||'null'); if(!s||s.day!==TODAY_ISO||s.coach!==state.coach||!s.people||!s.people.length) return null; return s; }catch(e){ return null; }
}
/* check-in theo từng khách: {name, day, no, status:'pending'|'ok'|'fail', at} — cất localStorage.
   Mở lại app khi còn 'pending' → coi như 'fail' (thử lại thì máy chủ trả da_checkin nếu đã ghi, KHÔNG ghi trùng). */
var CI={};
try{ var _ci=JSON.parse(ST('lb_ci')||'null'); if(_ci && _ci.name) CI[_ci.name]=_ci; else if(_ci && typeof _ci==='object') CI=_ci; Object.keys(CI).forEach(function(k){ if(CI[k].status==='pending') CI[k].status='fail'; }); }catch(e){ CI={}; }
function ciSave(){ SS('lb_ci', JSON.stringify(CI)); }
function ciFor(name){ var c=CI[name]; return (c && c.day===TODAY_ISO) ? c : null; }

/* ---- DEMO: máy chủ giả (data mẫu) — chỉ chạy khi không có API hoặc ?demo ---- */
var DEMO_DB=null;
function demoDb(){
  if(DEMO_DB) return DEMO_DB;
  function mk(name,done,total,measures,target,exp,kind){ return {name:name,done:done,total:total,left:total-done,coach:'Quyết',start:'2026-06-17',end:'',exp:exp||'2026-11-21',kind:kind||'',snap:{measures:measures,target:target||{},main:'weight',last:{},plans:{}}}; }
  var D=[
    mk('Bùi Doãn Quang',14,24,[{d:'2026-07-28',weight:75.2,arm:41.8,waist:85,hip:97,chest:97},{d:'2026-08-11',weight:74.5,waist:84},{d:'2026-08-25',weight:74.5,arm:41.8,waist:85,hip:97,chest:97,thigh:56},{d:'2026-09-08',weight:72.4,arm:40,waist:82,hip:96,chest:98,thigh:56},{d:'2026-09-22',weight:75,arm:40,waist:82,hip:96,chest:98,thigh:56}],{weight:65},'','PT 1:2'),
    mk('Nguyễn Quang Vinh',11,12,[{d:'2026-08-20',weight:68.5,waist:78},{d:'2026-09-05',weight:68,waist:77}],{weight:65},'2027-01-17','PT 1:2'),
    mk('Lê Trường Giang',21,24,[{d:'2026-06-01',weight:81},{d:'2026-08-01',weight:82.5,arm:37.5,chest:103},{d:'2026-09-01',weight:83.2}],{weight:85},'','PT 1:2'),
    mk('Đỗ Thành Công',7,8,[{d:'2026-09-01',weight:70}],{}),
    mk('Nguyễn Châu Khang',0,24,[],{}),
    mk('Nguyễn Thành Long',3,12,[{d:'2026-09-02',weight:71.4,arm:34.5,chest:97}],{weight:75}),
    mk('Phan Việt Hoàng',12,12,[{d:'2026-05-05',weight:62}],{})
  ];
  /* khách của coach khác — chỉ chế độ Admin thấy (PIN demo admin 0000) */
  var E=[mk('Vũ Sao Mai',3,24,[{d:'2026-09-10',weight:54.5}],{weight:52},'2027-01-01','PT 1:2'), mk('Trần Minh Anh',5,12,[],{})];
  E.forEach(function(c){ c.coach='Hiền Mai'; });
  D[0].snap.last={'Lat Pulldown (Wide Pronated Grip)':{kg:40,rep:12,d:'2026-09-22'},'Seated Cable Row (Close Neutral Grip)':{kg:55,rep:10,d:'2026-09-22'},'Zercher Squat':{kg:60,rep:8,d:'2026-09-18'},'Lying Leg Curl':{kg:35,rep:12,d:'2026-09-18'}};
  var days={}, d0=TODAY_ISO.slice(0,7);
  for(var i=1;i<=31;i++){ var iso=d0+'-'+pad2(i); if(iso>TODAY_ISO) break; if(i%7!==0) days[iso]=2+((i*7)%6); }
  var hist={}; hist[D[0].name]={'Lat Pulldown (Wide Pronated Grip)':[{d:'2026-08-25',kg:40,rep:12,ok:1},{d:'2026-09-08',kg:40,rep:12,ok:1},{d:'2026-09-22',kg:40,rep:12,ok:1}],'Seated Cable Row (Close Neutral Grip)':[{d:'2026-09-08',kg:55,rep:10,ok:1},{d:'2026-09-22',kg:55,rep:10,ok:0}]};
  var per={}; D.forEach(function(c,i){ per[c.name]={m:[12,11,9,7,0,3,0][i], last:['2026-09-16','2026-09-22','2026-09-20','2026-09-19','','2026-09-21',''][i]}; });
  var perAll=JSON.parse(JSON.stringify(per)); perAll['Vũ Sao Mai']={m:3,last:'2026-09-23'}; perAll['Trần Minh Anh']={m:11,last:'2026-09-24'};
  var daysAll={}; Object.keys(days).forEach(function(k){ daysAll[k]=days[k]*3; });
  var ci={checked:{}, at:{}}; try{ ci=JSON.parse(SES('demo_ci')||'null')||ci; }catch(e){}   /* demo: check-in hôm nay giữ qua reload (như máy chủ thật) */
  DEMO_DB={clients:D.concat(E), checked:ci.checked||{}, at:ci.at||{}, log:[], stats:{ok:true, month:d0, days:days, perClient:per, com:{month:d0,total:9769250}, hist:hist},
           astats:{ok:true, admin:true, month:d0, days:daysAll, perClient:perAll, rev:{month:d0,total:96500000}, hist:hist}};
  return DEMO_DB;
}
function demoApi(body){
  var db=demoDb();
  return new Promise(function(res){ setTimeout(function(){
    if(body.action==='ping') return res({ok:true,pong:1});
    if(body.action==='admin') return res(body.apin==='0000' ? {ok:true} : {ok:false,error:'sai_pin'});
    if(body.action==='setip') return res(body.apin==='0000' ? {ok:true, ip:body.ip||'demo'} : {ok:false,error:'sai_pin'});
    if(body.action==='iplist'||body.action==='addip'||body.action==='delip'){ if(body.apin!=='0000') return res({ok:false,error:'sai_pin'});
      var ips=[]; try{ ips=JSON.parse(SES('demo_ips')||'null')||['203.0.113.7']; }catch(e){ ips=['203.0.113.7']; }
      ips=ips.filter(Boolean);
      if(body.action==='addip'){ var ip=body.ip||'198.51.100.'+(1+Math.floor(Math.random()*200)); if(ips.indexOf(ip)<0){ if(ips.length>=2) return res({ok:false,error:'full',ips:ips,max:2}); ips.push(ip); } }
      if(body.action==='delip'){ var k=ips.indexOf(String(body.del||'')); if(k>=0){ if(ips.length<=1) return res({ok:false,error:'con_1_ip',ips:ips,max:2}); ips.splice(k,1); } }
      SES('demo_ips', JSON.stringify(ips)); return res({ok:true, ips:ips, max:2}); }
    /* chế độ Admin (demo): mọi khách của phòng */
    if(/^adm_/.test(body.action) && body.apin!=='0000') return res({ok:false,error:'sai_pin'});
    if(body.action==='adm_data'){ var snapA={}; db.clients.forEach(function(c){ snapA[c.name]=c.snap; });
      return res({ok:true, admin:true, coach:'Admin', members:db.clients.map(function(c){return {name:c.name,done:c.done,total:c.total,left:c.left,coach:c.coach==='Quyết'?'Quyết Hán':c.coach,start:c.start,exp:c.exp,kind:c.kind||'',checked:db.checked[c.name]===isoToday(),signed:db.checked[c.name]===isoToday()?(db.at[c.name]||''):''}}), snapshot:JSON.parse(JSON.stringify(snapA)), library:null, today:isoToday()}); }
    if(body.action==='adm_stats'){ var sa=JSON.parse(JSON.stringify(db.astats)); var ta=0; Object.keys(sa.days).forEach(function(k){ ta+=sa.days[k]; }); sa.monthTotal=ta; return res(sa); }
    if(body.action==='adm_checkin'){ body.action='checkin_coach'; body._adm=1; }
    if(body.action==='adm_log'){ body.action='log'; }
    if(body.pin==='0000') return res({ok:false,error:'sai_pin'});
    if(body.action==='coach'){ var snap={}, own=db.clients.filter(function(c){ return c.coach==='Quyết'; }); own.forEach(function(c){ snap[c.name]=c.snap; });
      return res({ok:true, coach:'Quyết Hán', members:own.map(function(c){return {name:c.name,done:c.done,total:c.total,left:c.left,coach:c.coach,start:c.start,exp:c.exp,kind:c.kind||'',checked:db.checked[c.name]===isoToday(),signed:db.checked[c.name]===isoToday()?(db.at[c.name]||''):''}}), snapshot:JSON.parse(JSON.stringify(snap)), library:null, today:isoToday()}); }
    if(body.action==='stats'){ var st=JSON.parse(JSON.stringify(db.stats)); var t=0; Object.keys(st.days).forEach(function(k){ t+=st.days[k]; }); st.monthTotal=t; return res(st); }
    if(body.action==='checkin_coach'){ var c=db.clients.filter(function(x){return x.name===body.name && (body._adm || x.coach==='Quyết');})[0]; if(!c) return res({ok:false,error:body._adm?'khong_thay_khach':'khong_phai_khach_cua_ban'});
      if(db.checked[c.name]===isoToday()) return res({ok:false,error:'da_checkin',at:db.at[c.name]});
      db.checked[c.name]=isoToday(); db.at[c.name]=nowHM(); c.done++; c.left--; SES('demo_ci', JSON.stringify({checked:db.checked, at:db.at})); return res({ok:true,row:0,member:{name:c.name,done:c.done,total:c.total,left:c.left,coach:c.coach},coach:'Quyết Hán',at:db.at[c.name]}); }
    if(body.action==='log'){ var n=0; (body.events||[]).forEach(function(e){ if(db.log.some(function(x){return x.id===e.id})) return; db.log.push(e); n++;
        var c=db.clients.filter(function(x){return x.name===e.name})[0]; if(!c) return; var sn=c.snap;
        if(e.type==='ĐO'){ var m=sn.measures.filter(function(x){return x.d===e.date})[0]; if(!m){ m={d:e.date}; sn.measures.push(m); } m[e.metric]=e.val; }
        else if(e.type==='MỤC TIÊU'){ sn.target[e.metric]=e.val; sn.main=e.metric; }
        else if(e.type==='SET'){ if(e.ok) sn.last[e.ex]={kg:e.kg,rep:e.rep,d:e.date}; }
      }); return res({ok:true,written:n,dup:(body.events||[]).length-n}); }
    res({ok:false,error:'unknown'});
  }, 350); });
}

var state={screen:null, pin:'', apin:'', admin:false, coach:'', clients:[], lib:null, stats:null, ip:ST('lb_ip')||'', dataTs:0, loading:false,
           client:null, back:'p-clients', sel:[], session:null, homeRange:'1m',
           msForm:{}, msActive:'weight', tgMetric:'weight', tgVal:0, pfMetric:'weight', sumIdx:0};

/* =====================================================================
   CHUYỂN MÀN
   ===================================================================== */
var RM_MQ=window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function rm(){ return !!(RM_MQ && RM_MQ.matches); }
/* Chỉ animate phần THAY ĐỔI: nội dung (head/body) trượt + mờ; nav đáy đứng yên nếu nút giống nhau giữa hai màn
   (so chữ ký từng nút: class + nhãn); nút mới/khác thì hiện mờ vào, nút biến mất thì mờ ra; nút tab đổi trạng thái .cur thì đổi màu mềm. */
function navOf(pg){ return pg.querySelector(':scope>.nav, :scope>.sfoot>.nav'); }
function navSig(b){ return b.tagName+'|'+b.className.replace(/\b(cur|away|off|paper|dark|still|swap|gone|curswap|fade)\b/g,'').replace(/\s+/g,' ').trim()+'|'+(b.getAttribute('aria-label')||b.textContent.trim()); }
function navMatch(cur, el){
  var a=cur?navOf(cur):null, b=navOf(el); if(!b) return;
  var ab=a?[].slice.call(a.querySelectorAll('button')):[], used=[];
  [].slice.call(b.querySelectorAll('button')).forEach(function(x){
    x.classList.remove('still','swap','curswap'); var s=navSig(x), m=null;
    ab.forEach(function(y,i){ if(!m && !used[i] && navSig(y)===s){ m=y; used[i]=1; } });
    x.classList.add(m?'still':'swap');
    if(m && m.classList.contains('cur')!==x.classList.contains('cur')) x.classList.add('curswap');
  });
  ab.forEach(function(y,i){ y.classList.remove('still','swap','curswap'); y.classList.add(used[i]?'gone':'fade'); });
}
function navClean(pg){ var n=pg&&navOf(pg); if(n) n.querySelectorAll('button').forEach(function(b){ b.classList.remove('still','swap','curswap','gone','fade'); }); }
function show(id, dir){
  dir=dir||'fwd';
  var el=$(id), cur=(state.screen && $(state.screen)) || document.querySelector('.page.on');
  if(cur===el) cur=null;
  navMatch(cur, el);
  if(cur){
    if(cur._t){ clearTimeout(cur._t); cur._t=0; }
    /* GIỮ enter-* trong lúc rời: .st>* có opacity gốc 0 và chỉ hiện nhờ rise (fill forwards) của .enter-* → gỡ enter-* là tiêu đề/tầng nội dung
       tắt phụt ngay khung đầu trong khi phần còn lại trượt ra (lỗi có từ v2.4). leave-* đứng sau trong app.css nên thắng animation/z-index. */
    cur.classList.remove('leave-fwd','leave-back','hlead');
    void cur.offsetWidth;
    cur.classList.add(dir==='fwd'?'leave-fwd':'leave-back');
    cur._t=(function(c){ return setTimeout(function(){ c.classList.remove('on','leave-fwd','leave-back','enter-fwd','enter-back'); navClean(c); c._t=0; }, 230); })(cur);
  }
  if(el._t){ clearTimeout(el._t); el._t=0; }
  el.classList.remove('leave-fwd','leave-back','enter-fwd','enter-back','hlead');
  el.classList.add('on'); void el.offsetWidth;
  el.classList.add(dir==='fwd'?'enter-fwd':'enter-back');
  el._t=setTimeout(function(){ navClean(el); el._t=0; }, 700);   /* giữ class enter-*: các animation fill forwards (.st>*) cần nó */
  state.screen=id;
}
var HOOK={};
function go(id, dir){
  var prev=state.screen; mqStopAll(); closeLib(true); FX.heroCancel();
  if(HOOK[id]) HOOK[id](dir);
  show(id, dir);
  var s=$(id);
  edgeFit(s);                                   /* đo ngay khi trang vừa hiện → khung đầu tiên đã đúng chỗ */
  if(id!=='p-loop') loopSleep();
  if(prev==='p-loop' && id!=='p-loop') setTimeout(syncTheme, 100); else syncTheme();   /* rời loop: trang mờ đi .2s → vùng thanh đổi ở giữa quãng */
  setTimeout(function(){ afterShow(s); }, 40);
}
function afterShow(s){ s.querySelectorAll('.scroll').forEach(fogUpdate); mqInit(s); if(s._after){ s._after(); s._after=null; } }
function countUp(el, to, dur, delay){
  if(rm()){ el.textContent=String(to); return; }
  el.textContent='0';
  setTimeout(function(){ var t0=performance.now(); (function f(t){ var p=Math.min(1,(t-t0)/dur); p=1-Math.pow(1-p,3); el.textContent=Math.round(to*p); if(p<1) requestAnimationFrame(f); })(t0); }, delay||0);
}

/* ---- PILL THÔNG BÁO: pill nhỏ đẩy từ đỉnh xuống, lớp phủ, không đụng layout.
   icon + chữ (số tô Acid) · lỗi = icon/số đỏ + nút hành động · o: {err, sticky, ms, icon, spin, action:{label,fn}} ---- */
var PILL={t:0, h:0, s:0, y0:0, drag:false};
function notify(text, o){
  o=o||{}; var el=$('pill'); clearTimeout(PILL.t); clearTimeout(PILL.h); clearTimeout(PILL.s); el.hidden=false;
  var was=el.classList.contains('on');
  el.className='pill'+(was?' on':'')+(o.err?' err':'');
  el.innerHTML=(o.spin?'<i class="spin"></i>':ico(o.icon||(o.err?'i-x':'i-check')))+'<span class="tx">'+esc(text).replace(/(\d[\d:,\.\/×]*)/g,'<span class="n">$1</span>')+'</span>'+(o.action?'<button class="act">'+esc(o.action.label)+'</button>':'');
  var act=el.querySelector('.act'), ep=AUTH_EP; if(act) act.onclick=function(e){ e.stopPropagation(); hidePill(); if(ep===AUTH_EP) o.action.fn(); };
  el.onclick=function(){ if(!PILL.drag) hidePill(); };
  if(!was){ void el.offsetWidth; el.classList.add('on'); }
  PILL.s=setTimeout(syncTheme, 420);            /* pill vừa đi qua điểm lấy mẫu màu thanh (mép trên) → cho WebKit lấy mẫu lại */
  PILL.t=setTimeout(function(){ hidePill(); }, o.ms||(o.err||o.sticky?6000:2400));
}
/* Safari 26 lấy màu thanh bằng hit-test ở giữa mép trên (y = 4px): pill ẩn bằng opacity/transform (translateY −16px) vẫn "chạm" được
   và che dải .wkedge → ẩn hẳn (display:none) sau khi mờ xong rồi tính lại màu mép. */
function hidePill(){ clearTimeout(PILL.t); clearTimeout(PILL.h); var el=$('pill'); el.classList.remove('on','drag'); el.style.transform='';
  PILL.h=setTimeout(function(){ if(!el.classList.contains('on')){ el.hidden=true; syncTheme(); } }, 240); }
/* vuốt lên để tắt pill (kéo theo ngón tay, nhả >18px hoặc nhanh → bay lên) */
(function(){ var el=$('pill'), y=0, t0=0;
  el.addEventListener('pointerdown', function(e){ PILL.y0=e.clientY; y=0; t0=performance.now(); PILL.drag=false; if(e.target.closest && e.target.closest('.act')) return; /* nút hành động: không bắt pointer — bắt thì click bị chuyển sang pill, fn không chạy */ el.setPointerCapture(e.pointerId); }, {passive:true});
  el.addEventListener('pointermove', function(e){ if(!el.hasPointerCapture || !el.hasPointerCapture(e.pointerId)) return; y=Math.min(0, e.clientY-PILL.y0); if(y<-3) PILL.drag=true; if(PILL.drag){ el.classList.add('drag'); el.style.transform='translate(-50%,'+y+'px)'; } }, {passive:true});
  function end(e){ if(!PILL.drag){ el.classList.remove('drag'); el.style.transform=''; return; } var v=-y/Math.max(1,performance.now()-t0); el.classList.remove('drag');
    if(y<-18 || v>.5){ hidePill(); } else { el.style.transform=''; } setTimeout(function(){ PILL.drag=false; }, 0); }
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
})();
var BUSY_N=0;
function busyLine(on){ BUSY_N=Math.max(0, BUSY_N+(on?1:-1)); $('busy').classList.toggle('on', BUSY_N>0); }

/* ---- FOG: mask trong suốt của chính nội dung, co theo vị trí cuộn (chỉ còn cho vùng cuộn KHÔNG phải .ex, ví dụ tổng kết) ---- */
var FOG_TOP=32, FOG_BOT=72;
/* khoảng ghost cuối vùng cuộn = chiều cao đúng bằng phần tử cuối (tạo nhịp với nav bên dưới).
   Danh sách .ex (mép cuộn iOS) tràn tới đáy màn hình → cộng thêm chiều cao thanh đáy (--bz) để phần tử cuối vẫn dừng đúng chỗ cũ. */
function tailPad(el){
  if(el.id==='pl-scroll') return;
  var lc=el.lastElementChild; while(lc && lc.lastElementChild && /\b(exrows|rows|next)\b/.test(lc.className)) lc=lc.lastElementChild;
  var pad=lc ? Math.round(lc.getBoundingClientRect().height) : 0;
  if(el._tp!==pad){ el._tp=pad; el.style.paddingBottom=el.classList.contains('ex') ? 'calc(var(--bz,0px) + '+pad+'px)' : pad+'px'; }
}
function fogUpdate(el){
  tailPad(el);
  if(el.classList.contains('ex')){ if(el._fogM){ el._fogM=''; el.style.webkitMaskImage=''; el.style.maskImage=''; } edgeScroll(el); return; }   /* mép do lớp .eg đảm nhận */
  var top=el._fogTop!=null?el._fogTop:FOG_TOP, bot=el._fogBot!=null?el._fogBot:FOG_BOT;
  var t=Math.min(top, el.scrollTop), b=Math.min(bot, el.scrollHeight-el.clientHeight-el.scrollTop);
  if(t<1) t=0; if(b<1) b=0;
  var m='linear-gradient(to bottom,'+(t?'transparent 0,#000 '+t+'px':'#000 0')+',#000 calc(100% - '+b+'px),'+(b?'transparent':'#000')+' 100%)';
  if(el._fogM!==m){ el._fogM=m; el.style.webkitMaskImage=m; el.style.maskImage=m; }
}
document.querySelectorAll('.scroll').forEach(function(el){
  el.addEventListener('scroll', el.classList.contains('ex') ? function(){ edgeScroll(el); } : function(){ fogUpdate(el); }, {passive:true});
  if(window.ResizeObserver){ new ResizeObserver(function(){ fogUpdate(el); }).observe(el); }
});

/* ---- MÉP CUỘN KIỂU iOS (v2.4) ----
   Khung .edge (trang / sheet) chứa một danh sách .scroll.ex. Danh sách được đặt tuyệt đối phủ KÍN khung (mép trên màn hình →
   mép dưới màn hình) và đệm lại đúng khoảng cũ, nên lúc chưa cuộn mọi thứ nằm y chỗ cũ; khi cuộn, nội dung trôi dưới khối đỉnh
   và dưới nav qua hai lớp .eg (làm tối + blur tăng dần). edgeFit() đo khung bằng offsetTop/offsetHeight (không bị transform
   của hiệu ứng chuyển màn làm lệch) rồi ghi biến CSS lên phần tử chứa danh sách. */
function edgeFit(fr){
  if(!fr || !fr.classList || !fr.classList.contains('edge')) return;
  var list=fr.querySelector('.scroll.ex'); if(!list) return;
  if(!fr.clientHeight) return;                                  /* khung đang ẩn: đo lúc hiện (go / ResizeObserver) */
  var C=list.parentNode, same=(C===fr), mk=C.querySelector(':scope>.eg-m'), bar=fr.querySelector(':scope>.nav, :scope>.foot');
  var W=fr.clientWidth, H=fr.clientHeight, ct=same?0:C.offsetTop, cl=same?0:C.offsetLeft;
  var cs=getComputedStyle(C), v={
    xt:ct, xl:cl, xr:same?0:Math.max(0, W-(cl+C.clientWidth)), xb:same?0:Math.max(0, H-(ct+C.clientHeight)),
    pl:parseFloat(cs.paddingLeft)||0, pr:parseFloat(cs.paddingRight)||0 };
  v.tz=ct+(mk?mk.offsetTop:0)+(parseFloat(getComputedStyle(list).getPropertyValue('--lmt'))||0);
  v.bz=bar ? Math.max(0, H-bar.offsetTop) : v.xb;
  var sig=[v.xt,v.xl,v.xr,v.xb,v.pl,v.pr,v.tz,v.bz].join(',');
  if(C._edge!==sig){ C._edge=sig; for(var k in v) C.style.setProperty('--'+k, v[k]+'px'); }
  edgeScroll(list);
}
/* dải chuyển của lớp mép theo vị trí cuộn (luật fog cũ): đầu danh sách → 0, cuộn quá 32px → đủ; dải đáy tương tự theo quãng còn lại.
   Chỉ ghi biến --r lên chính lớp mép (4 phần tử) → không làm tính lại style cả danh sách mỗi khung hình cuộn. */
var EDGE_R={t:32, b:48};
function edgeScroll(el){
  var t=el._egT, b=el._egB; if(!t || !b) return;
  var st=el.scrollTop, max=el.scrollHeight-el.clientHeight;
  var rt=Math.round(Math.max(0, Math.min(EDGE_R.t, st))), rb=Math.round(Math.max(0, Math.min(EDGE_R.b, max-st)));
  if(t._r!==rt){ t._r=rt; t.style.setProperty('--r', rt+'px'); }
  if(b._r!==rb){ b._r=rb; b.style.setProperty('--r', rb+'px'); }
}
var EDGE_RO=window.ResizeObserver ? new ResizeObserver(function(es){ var seen=[]; es.forEach(function(e){ var fr=e.target.closest('.edge'); if(fr && seen.indexOf(fr)<0){ seen.push(fr); edgeFit(fr); } }); }) : null;
function edgeInit(){
  document.querySelectorAll('.edge').forEach(function(fr){
    var list=fr.querySelector('.scroll.ex'); if(!list) return; var C=list.parentNode;
    if(!C.querySelector(':scope>.eg-m')){ var mk=document.createElement('i'); mk.className='eg-m'; C.insertBefore(mk, list); }
    if(!C.querySelector(':scope>.eg')) ['t','b'].forEach(function(k){ var g=document.createElement('div'); g.className='eg '+k; g.setAttribute('aria-hidden','true'); g.innerHTML='<i class="d"></i><i class="b1"></i><i class="b2"></i><i class="b3"></i>'; C.appendChild(g); });
    list._egT=C.querySelector(':scope>.eg.t'); list._egB=C.querySelector(':scope>.eg.b');
    if(EDGE_RO){
      EDGE_RO.observe(fr);
      [].forEach.call(C.children, function(ch){ if(!ch.classList.contains('ex') && !ch.classList.contains('eg')) EDGE_RO.observe(ch); });   /* ô tìm / chip / nhãn đổi cao → mép trên danh sách đổi */
      [].forEach.call(fr.querySelectorAll(':scope>.head, :scope>.nav, :scope>.foot'), function(el){ EDGE_RO.observe(el); });
    }
  });
}
edgeInit();
window.addEventListener('resize', function(){ document.querySelectorAll('.edge').forEach(edgeFit); });

/* ---- MARQUEE: tên/tiêu đề 1 dòng; dài quá → "…" → chạy trái 32px/s → giữ → mờ → lặp ---- */
var MQ=[];
function mqPrune(){ MQ=MQ.filter(function(m){ if(document.contains(m.el)) return true; clearTimeout(m.t); return false; }); }
var MQ_RUN=false;   /* 25/09: tắt marquee — tên dài chỉ "…", tuyệt đối không clip chữ */
function mqInit(root){
  mqPrune(); MQ=MQ.filter(function(m){ if(root.contains(m.el)){ clearTimeout(m.t); return false; } return true; });
  root.querySelectorAll('.mq').forEach(function(el){ var inner=el.firstElementChild; el.classList.remove('run','fade'); el.classList.add('ell'); if(inner){ inner.style.transition='none'; inner.style.transform='none'; } });
  if(!MQ_RUN || rm()) return;
  var pend=[];
  root.querySelectorAll('.mq').forEach(function(el){ var inner=el.firstElementChild; if(!inner) return; el.classList.remove('run','fade'); el.classList.add('ell'); inner.style.transition='none'; inner.style.transform='none'; pend.push(el); });
  pend.forEach(function(el){ var inner=el.firstElementChild, ov=el.scrollWidth-el.clientWidth; if(ov<=1) return; var m={el:el,inner:inner,ov:ov+24,t:0}; MQ.push(m); mqCycle(m); });
}
function mqCycle(m){
  var el=m.el, inner=m.inner, dur=m.ov/32;
  m.t=setTimeout(function(){
    el.classList.remove('ell'); el.classList.add('run'); void inner.offsetWidth;
    inner.style.transition='transform '+dur.toFixed(2)+'s linear'; inner.style.transform='translateX(-'+m.ov+'px)';
    m.t=setTimeout(function(){ el.classList.add('fade'); m.t=setTimeout(function(){ inner.style.transition='none'; inner.style.transform='none'; el.classList.remove('run'); el.classList.add('ell'); void inner.offsetWidth; el.classList.remove('fade'); mqCycle(m); },320); }, dur*1000+1600);
  },1600);
}
function mqStopAll(){ MQ.forEach(function(m){ clearTimeout(m.t); m.el.classList.remove('run','fade'); m.el.classList.add('ell'); m.inner.style.transition='none'; m.inner.style.transform='none'; }); MQ=[]; }

/* =====================================================================
   BÁNH XE SỐ — kéo dọc trên con số để đổi (mặt trụ 3D, mờ dần hai đầu)
   opts: {values, index, format, live, row (px/1 bước), z (bán kính trụ), boxH, ghost, onPick, down (gọi lúc chạm, trước khi mở), cls, big}
   ===================================================================== */
var DEG=Math.PI/180, WSTEP=26, openWheel=null;
function Wheel(host, opts){
  var line=host.querySelector('.line'), P=parseFloat(getComputedStyle(line).perspective)||0, K=P?(P-opts.z)/P:1, nodes=[], pos=opts.index||0, reveal=0, raf=0, revealRaf=0, closeTimer=0, api;
  for(var i=0;i<9;i++){ var el=document.createElement('div'); el.className='v'; line.appendChild(el); nodes.push(el); }
  function render(){
    var base=Math.round(pos);
    for(var i=0;i<nodes.length;i++){
      var idx=base+i-4, el=nodes[i];
      if(idx<0||idx>=opts.values.length){ el.style.opacity=0; el.textContent=''; continue; }
      var off=idx-pos, c=Math.cos(off*WSTEP*DEG);
      if(c<=0.03){ el.style.opacity=0; continue; }
      el.textContent=(reveal<0.02 && Math.abs(off)<0.001 && opts.live) ? opts.live() : opts.format(opts.values[idx]);
      el.style.transform='rotateX('+(-off*WSTEP)+'deg) translateZ('+opts.z+'px) scale('+K+')';
      var w=Math.max(0,1-Math.abs(off));
      el.style.opacity=Math.pow(c,1.8)*Math.max(w, reveal*(opts.ghost+(1-opts.ghost)*w));
    }
  }
  function scale(){ var r=host.getBoundingClientRect(); return r.height/opts.boxH||1; }
  function tween(to){
    cancelAnimationFrame(revealRaf); var from=reveal, dur=(to>from?190:240), t0=performance.now();
    if(rm()){ reveal=to; render(); return; }
    (function step(now){ var k=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-k,3); reveal=from+(to-from)*e; render(); if(k<1) revealRaf=requestAnimationFrame(step); })(t0);
  }
  function open(){ clearTimeout(closeTimer); if(openWheel && openWheel!==api) openWheel.close(); openWheel=api; host.classList.add('open'); if(opts.dim) opts.dim(true, host); tween(1); }
  function close(){ clearTimeout(closeTimer); if(openWheel===api) openWheel=null; host.classList.remove('open'); if(opts.dim) opts.dim(false, host); tween(0); }
  var dragging=false, startY=0, startPos=0, moved=0, lastIdx=Math.round(pos);
  function commit(){ var i=Math.round(pos); if(i!==lastIdx){ lastIdx=i; if(opts.onPick) opts.onPick(opts.values[i], i); if(navigator.vibrate) navigator.vibrate(3); } }
  host.addEventListener('pointerdown', function(e){ if(opts.down) opts.down(); dragging=true; moved=0; startY=e.clientY; startPos=pos; try{ host.setPointerCapture(e.pointerId); }catch(x){} cancelAnimationFrame(raf); open(); e.stopPropagation(); });
  host.addEventListener('pointermove', function(e){ if(!dragging) return; var dy=(e.clientY-startY)/scale(); moved=Math.max(moved,Math.abs(dy)); pos=startPos-dy/opts.row; if(pos<0) pos=0; if(pos>opts.values.length-1) pos=opts.values.length-1; commit(); render(); });
  function settle(e){
    if(!dragging) return; dragging=false;
    var target=Math.round(pos), from=pos, t0=performance.now(), tap=(moved<4);
    if(tap){ closeTimer=setTimeout(close, 4000); } else { lastIdx=-1; pos=target; commit(); pos=from; close(); }
    (function step(now){ var k=Math.min(1,(now-t0)/180), ease=1-Math.pow(1-k,3); pos=from+(target-from)*ease; render(); if(k<1) raf=requestAnimationFrame(step); })(t0);
    if(e) e.stopPropagation();
  }
  host.addEventListener('pointerup', settle); host.addEventListener('pointercancel', settle);
  host.addEventListener('touchmove', function(e){ e.preventDefault(); }, {passive:false});
  api={host:host, isOpen:function(){ return openWheel===api; }, render:render, close:close, set:function(v){ var k=opts.values.indexOf(v); if(k<0){ var best=0; for(var i=0;i<opts.values.length;i++) if(Math.abs(opts.values[i]-v)<Math.abs(opts.values[best]-v)) best=i; k=best; } pos=k; lastIdx=k; render(); }, value:function(){ return opts.values[Math.round(pos)]; }, setValues:function(vals){ opts.values=vals; } };
  render(); return api;
}
function range(a,b,step){ var o=[]; for(var v=a; v<=b+1e-9; v+=step) o.push(Math.round(v*100)/100); return o; }
var REPS_VALS=range(1,50,1), KG_VALS=range(0,300,2.5), REST_VALS=range(15,600,15);

/* =====================================================================
   ĐỒNG HỒ CHUYỂN ĐỘNG (MT) — v2.5
   Mọi chuyển động do JS điều khiển (vành hạt, vành nhịp, chữ/nút/bộ đếm của màn loop, số bay, tên bay giữa hai màn)
   chạy theo MT (giây), tiến theo khung hình (dt ≤ 50 ms) trong MỘT vòng rAF duy nhất (v2.6.1: thật sự chỉ một — xem motTick) → chữ, nút và hạt khớp từng khung.
   Mỗi tween có key: gọi lại cùng key = đi tiếp từ giá trị đang hiện (ngắt được, không nhảy). rAF tự ngủ khi không còn
   gì chạy và màn loop không mở. Giờ thật của đồng hồ nghỉ vẫn tính bằng Date.now() (restStart), không theo MT.
   Giảm chuyển động: tween không đánh dấu keepRM thì nhảy thẳng tới cuối; keepRM = mờ ngắn tại chỗ (nhẹ hơn, không bằng không).
   ===================================================================== */
function bez(x1,y1,x2,y2){
  var cx=3*x1, bx=3*(x2-x1)-cx, ax=1-cx-bx, cy=3*y1, by=3*(y2-y1)-cy, ay=1-cy-by;
  function sx(t){ return ((ax*t+bx)*t+cx)*t; } function sy(t){ return ((ay*t+by)*t+cy)*t; } function dx(t){ return (3*ax*t+2*bx)*t+cx; }
  return function(x){
    if(x<=0) return 0; if(x>=1) return 1;
    var t=x, i, e, d;
    for(i=0;i<8;i++){ e=sx(t)-x; if(Math.abs(e)<1e-6) return sy(t); d=dx(t); if(Math.abs(d)<1e-6) break; t-=e/d; }
    var lo=0, hi=1; t=x;
    for(i=0;i<24;i++){ if(sx(t)<x) lo=t; else hi=t; t=(lo+hi)/2; }
    return sy(t);
  };
}
var EO=bez(.22,.85,.22,1), EIO=bez(.65,0,.35,1), OUT3=function(k){ return 1-Math.pow(1-k,3); }, LIN=function(k){ return k; };
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
var MT=0, MTW=[], MTT=[], MOT={raf:0, last:0, inFrame:false, st:null};
function tw(o){
  if(o.key) twKill(o.key);
  o.t0=MT+(o.delay||0); o.ease=o.ease||EO;
  if(rm()){ if(!o.keepRM){ o.set(o.to); if(o.done) o.done(); return o; } if(o.rmDur!=null){ o.dur=o.rmDur; o.t0=MT; } }
  MTW.push(o); if(o.delay && o.pre!==false) o.set(o.from);
  motWake(); return o;
}
function twKill(key){ for(var i=MTW.length-1;i>=0;i--) if(MTW[i].key===key) MTW.splice(i,1); }
function twHas(key){ for(var i=0;i<MTW.length;i++) if(MTW[i].key===key) return true; return false; }
function twRun(){
  for(var i=0;i<MTW.length;i++){
    var o=MTW[i]; if(MT<o.t0) continue;
    var k=o.dur>0?clamp((MT-o.t0)/o.dur,0,1):1;
    o.set(lerp(o.from,o.to,o.ease(k)));
    if(k>=1){ var j=MTW.indexOf(o); if(j>=0){ MTW.splice(j,1); if(j<=i) i--; } if(o.done) o.done(); }
  }
}
function after(sec, fn, key){ if(key) MTT=MTT.filter(function(t){ return t.key!==key; }); MTT.push({at:MT+sec, fn:fn, key:key}); motWake(); }
function afterKill(key){ MTT=MTT.filter(function(t){ return t.key!==key; }); }
function afterRun(){ for(var i=0;i<MTT.length;i++){ if(MT>=MTT[i].at){ var f=MTT[i].fn; MTT.splice(i,1); i--; f(); } } }
/* v2.6.1 — MỘT vòng rAF, không bao giờ hai. Trước đây motTick đặt MOT.raf=0 rồi mới chạy khung: tween/after khởi động NGAY TRONG khung
   (nửa sau của fadeSwap / swapIcon, mốc 10 giây cuối, 0:00 …) gọi motWake() thấy raf=0 → hẹn thêm một vòng, trong khi motTick vẫn tự
   hẹn vòng của nó → nhân đôi; LOOP_ON giữ mọi vòng sống suốt màn loop (~6 vòng mỗi set, ~100 vòng sau 16 set) → mỗi khung vẽ lại cùng
   một hình hàng chục lần (dt = 0, không ai thấy) = nóng máy + rớt khung cuối buổi. Vòng thừa đầu tiên trong khung còn nhận dt = 1/60
   (motWake xoá MOT.last) → MT nhảy cóc 16 ms mỗi lần đổi pha.
   Nay: đang ở trong khung thì motWake() không hẹn (và không xoá MOT.last); motTick hẹn khung kế đúng một lần ở cuối, kể cả khi khung
   ném lỗi (finally) — thứ vừa khởi động trong khung (MTW / MTT / FX) nằm sẵn trong điều kiện hẹn. MOT.st: số đo cho màn chẩn đoán. */
function motWake(){ if(!MOT.raf && !MOT.hold && !MOT.inFrame){ MOT.last=0; MOT.raf=requestAnimationFrame(motTick); } }
function motTick(now){
  MOT.raf=0; if(MOT.hold) return;
  var dt=MOT.last?(now-MOT.last)/1000:1/60, S=MOT.st, t0=S?performance.now():0; MOT.last=now;
  MOT.inFrame=true;
  try{ motFrame(dt); }
  finally{
    MOT.inFrame=false;
    if(S && LOOP_ON){ S.n++; S.ms+=performance.now()-t0; if(now===S.at) S.dup++; else { S.at=now; S.f++; S.sec+=Math.min(dt,.25); } }
    if(LOOP_ON || MTW.length || MTT.length || FX.busy()){ if(!MOT.raf && !MOT.hold) MOT.raf=requestAnimationFrame(motTick); }
    else MOT.last=0;
  }
}
/* một khung: đồng hồ → hẹn giờ → trạng thái loop (rụng hạt theo giờ thật) → tween → vẽ */
function motFrame(dt){
  dt=Math.max(0,dt); var dv=Math.min(dt,0.05); MT+=dv;
  afterRun();
  if(LOOP_ON) for(var i=0;i<LOOPS.length;i++) LOOPS[i].update(dt);
  twRun();
  if(LOOP_ON) for(var j=0;j<LOOPS.length;j++) LOOPS[j].draw(dv);
  FX.draw(dv);
}
document.addEventListener('visibilitychange', function(){ MOT.last=0; });
/* kiểm chứng chuyển động (test/quay khung): giữ MT rồi tự bước từng khung — __mot.hold(true); __mot.step(1000/60) */
window.__mot={hold:function(on){ MOT.hold=!!on; if(on){ cancelAnimationFrame(MOT.raf); MOT.raf=0; } else motWake(); }, step:function(ms){ motFrame((ms==null?1000/60:ms)/1000); }, t:function(){ return MT; }};
/* màn chẩn đoán: lượt loop gần nhất — khung/giây thật · ms JS mỗi khung · số vòng vẽ mỗi khung (đúng = 1) · thời gian ở loop */
function mtDiag(){
  var S=MOT.st; if(!S || !S.f) return 'MT CHƯA VÀO LOOP';
  function d(v,k){ return v.toFixed(k).replace('.',','); }
  return 'MT '+Math.round(S.f/Math.max(S.sec,1e-3))+' KHUNG/S · '+d(S.ms/S.f,2)+' MS JS/KHUNG · '+d(S.n/S.f,1)+' VÒNG/KHUNG · '+d(S.sec/60,1)+' PHÚT LOOP';
}

/* =====================================================================
   FX — hiệu ứng xuyên màn (v2.5), chạy theo MT:
   · heroPrep/heroFly: PHẦN TỬ CHUNG giữa hai màn — tên khách / tên bài bay từ dòng vừa chạm tới tiêu đề màn mới (co/giãn bằng scale,
     bản sao dựng ở cỡ chữ ĐÍCH rồi thu nhỏ lúc đầu → nét sắc). Tên đầy đủ → tên rút gọn: phần họ mờ tại chỗ, phần giữ lại bay.
     Tiêu đề đích ẩn tới lúc hạ cánh. Không bay khi giảm chuyển động hoặc khi chữ nguồn đang bị cắt "…".
   · burst: hạt Acid bay lên từ vệt Acid của thẻ ở màn hoàn thành (cùng họ hạt với đồng hồ nghỉ; Acid → Paper → tan).
   Lớp phủ tuyệt đối trong body (không fixed — Safari 26 lấy màu thanh từ element fixed), z 45 < vạch bận 50 < dải mép 59 < pill 70;
   canvas hidden khi rảnh.
   ===================================================================== */
var FX=(function(){
  /* đường bay = lò xo tới hạn thả từ nghỉ (như push của iOS): rời dòng ngay dưới ngón tay (38 % quãng sau 90 ms) rồi hạ cánh êm;
     bản cũ bez(.3,0,.1,1) đứng yên ~100 ms trên dòng → chữ bay đè nội dung màn mới đang hiện lên */
  var cv=null, ctx=null, W=0, Hh=0, G=[], flights=[], SPK=6.64, SPN=1-(1+SPK)*Math.exp(-SPK);
  function EH(v){ return v>=1 ? 1 : (1-(1+SPK*v)*Math.exp(-SPK*v))/SPN; }
  function fxCanvas(){
    if(!cv){ cv=document.createElement('canvas'); cv.className='fxc'; cv.setAttribute('aria-hidden','true'); document.body.appendChild(cv); ctx=cv.getContext('2d'); }
    var w=document.body.clientWidth, h=document.body.clientHeight, k=Math.min(window.devicePixelRatio||1,3);
    if(w!==W || h!==Hh){ W=w; Hh=h; cv.width=Math.round(w*k); cv.height=Math.round(h*k); ctx.setTransform(k,0,0,k,0,0); }
    cv.hidden=false; return ctx;
  }
  /* hạt mừng: n hạt phát từ vùng r (toạ độ màn hình), so le trong 0,3 s sau delay giây */
  function burst(r, n, delay){
    if(rm() || !r || !r.width) return;
    fxCanvas();
    for(var i=0;i<n;i++){
      var x=r.left+Math.random()*r.width;
      G.push({x:x, y:r.top+Math.random()*r.height, vx:(Math.random()-0.5)*52, vy:-(60+Math.random()*110), age:-(delay||0)-Math.random()*0.35, life:1.5+Math.random()*0.9, r:1.2+2.1*Math.pow(Math.random(),1.5)});
    }
    motWake();
  }
  function draw(dv){
    if(!cv || cv.hidden) return;
    ctx.clearRect(0,0,W,Hh);
    if(!G.length){ cv.hidden=true; return; }
    for(var i=G.length-1;i>=0;i--){
      var g=G[i]; g.age+=dv; if(g.age<0) continue;
      var dm=Math.exp(-1.15*dv); g.vx*=dm; g.vy=g.vy*dm+14*dv; g.x+=g.vx*dv; g.y+=g.vy*dv;
      var k=g.age/g.life; if(k>=1){ G.splice(i,1); continue; }
      var a=Math.pow(1-k,1.4)*0.95, ac=clamp(1-g.age/0.4,0,1), r=g.r*(1-0.35*k);
      if(ac>0){ ctx.globalAlpha=a*ac; ctx.fillStyle='#D4FF00'; ctx.beginPath(); ctx.arc(g.x,g.y,r,0,TAU); ctx.fill(); }
      if(ac<1){ ctx.globalAlpha=a*(1-ac); ctx.fillStyle='#FAFAFA'; ctx.beginPath(); ctx.arc(g.x,g.y,r,0,TAU); ctx.fill(); }
    }
    ctx.globalAlpha=1;
  }
  function textNode(el){ var w=document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n; while((n=w.nextNode())){ if(n.nodeValue.trim()) return n; } return null; }
  function rangeRect(n, a, b){ var r=document.createRange(); r.setStart(n,a); r.setEnd(n,b); return r.getBoundingClientRect(); }
  /* chụp chữ nguồn TRƯỚC khi chuyển màn. keep: đoạn chữ sẽ bay (mặc định cả chuỗi) */
  function heroPrep(el, keep){
    if(!el || rm()) return null;
    var n=textNode(el); if(!n) return null;
    var full=n.nodeValue; keep=keep||full.trim(); var i=full.lastIndexOf(keep); if(i<0) return null;
    var box=el.getBoundingClientRect(), rk=rangeRect(n, i, i+keep.length), cs=getComputedStyle(el), fs=parseFloat(cs.fontSize)||16;
    if(!rk.width || rk.right>box.right+1 || rk.left<box.left-1 || rk.height>fs*1.9) return null;   /* chữ bị cắt "…" hoặc xuống dòng: không bay */
    var pre=full.slice(0,i).replace(/\s+$/,''), rp=pre?rangeRect(n, 0, pre.length):null;
    return {el:el, keep:keep, rk:rk, pre:pre, rp:rp, fs:parseFloat(cs.fontSize), cs:{fontFamily:cs.fontFamily, fontWeight:cs.fontWeight, letterSpacing:cs.letterSpacing, color:cs.color}};
  }
  function heroCancel(){ flights.forEach(function(f){ twKill(f.key); f.end(); }); flights=[]; }
  /* bay tới phần tử đích (màn mới đã dựng + đang vào). Toạ độ đích đọc theo bố cục (offset), bỏ qua transform của hiệu ứng vào màn */
  function layoutRect(el){ var x=0, y=0, e=el; while(e && e!==document.body){ x+=e.offsetLeft; y+=e.offsetTop; e=e.offsetParent; } return {left:x, top:y, width:el.offsetWidth, height:el.offsetHeight}; }
  function heroFly(h, dst, o){
    if(!h || !dst) return; o=o||{};
    var dn=textNode(dst); if(!dn || dn.nodeValue.trim()!==h.keep) return;
    var pg=dst.closest('.page'); if(pg) pg.classList.add('hlead');   /* tên dẫn đầu: nội dung dưới đường bay hiện sau (app.css .hlead) */
    var dcs=getComputedStyle(dst), fsD=parseFloat(dcs.fontSize)||h.fs, k0=h.fs/fsD;
    var d0=layoutRect(dst), di=dn.nodeValue.indexOf(h.keep), dr=rangeRect(dn, di, di+h.keep.length), vis=dst.getBoundingClientRect();
    var tx=d0.left+(dr.left-vis.left), ty=d0.top+(dr.top-vis.top);          /* vị trí chữ đích lúc đứng yên */
    var body=document.body, f=document.createElement('div'); f.className='herofly'; f.textContent=h.keep;
    f.style.fontFamily=dcs.fontFamily; f.style.fontWeight=dcs.fontWeight; f.style.fontSize=fsD+'px'; f.style.lineHeight=dr.height+'px'; f.style.letterSpacing=dcs.letterSpacing; f.style.color=dcs.color;
    f.style.left=tx.toFixed(2)+'px'; f.style.top=ty.toFixed(2)+'px';
    body.appendChild(f);
    var sx=h.rk.left-tx, sy=h.rk.top+(h.rk.height-dr.height*k0)/2-ty;         /* bắt đầu: đè khít chữ nguồn */
    var p=null;
    if(h.pre && h.rp){ p=document.createElement('div'); p.className='herofly'; p.textContent=h.pre; for(var k in h.cs) p.style[k]=h.cs[k]; p.style.fontSize=h.fs+'px'; p.style.lineHeight=h.rk.height+'px'; p.style.left=h.rp.left.toFixed(2)+'px'; p.style.top=h.rk.top.toFixed(2)+'px'; body.appendChild(p); }
    /* ẩn chữ nguồn + chữ đích TỨC THÌ (.mq có transition opacity .3s — không tắt thì chữ thật còn mờ mờ cạnh bản bay) */
    var srcO=h.el.style.opacity, srcT=h.el.style.transition, dstT=dst.style.transition;
    h.el.style.transition='none'; dst.style.transition='none'; h.el.style.opacity='0'; dst.style.opacity='0';
    var col0=h.cs.color, col1=dcs.color, key='FX:h'+(++FX_N);
    var rec={key:key, end:function(){ if(f.parentNode) f.remove(); if(p && p.parentNode) p.remove(); dst.style.opacity=''; h.el.style.opacity=srcO;
      requestAnimationFrame(function(){ dst.style.transition=dstT; h.el.style.transition=srcT; }); }};
    flights.push(rec);
    function fx(v){
      var e=EH(v), s=lerp(k0,1,e);
      f.style.transform='translate('+(sx*(1-e)).toFixed(2)+'px,'+(sy*(1-e)).toFixed(2)+'px) scale('+s.toFixed(4)+')';
      if(p){ var pa=clamp(1-v*3.2,0,1); p.style.opacity=pa; p.style.transform='translateX('+(-10*EO(Math.min(1,v*2.5))).toFixed(2)+'px)'; }
      if(col0!==col1) f.style.color=e<0.5?col0:col1;
    }
    fx(0);
    tw({key:key, from:0, to:1, dur:o.dur||.42, delay:o.delay||0, pre:false, ease:LIN, set:fx, done:function(){ rec.end(); var i=flights.indexOf(rec); if(i>=0) flights.splice(i,1); }});
  }
  return {burst:burst, draw:draw, heroPrep:heroPrep, heroFly:heroFly, heroCancel:heroCancel, busy:function(){ return G.length>0 || flights.length>0; }};
})();
var FX_N=0;

/* =====================================================================
   VÀNH — một canvas cho mỗi Loop, hai vành cùng một họ chấm, cùng phối cảnh, cùng tỷ lệ chữ 0 của wordmark:
   · VÀNH NHỊP (Chase) — 208 chấm, sóng chạy + xoáy vào (artifact "Loop buổi tập"). Thiết lập set: lặng (calm 1, Paper,
     alpha .75). Trong set: thức dậy (calm 0, lõi sóng Acid, chấm tâm). calm/dot là số thực → đổi pha bằng tween, không nảy.
   · VÀNH HẠT (v2.5 · artifact "Bộ đếm nghỉ Hạt") — đồng hồ nghỉ. Một giây = một hạt = một lát 5 chấm trên elip 1:1,3
     (RX 156 · RY 204 · ống 13 · nghiêng 0,22 rad · tiêu cự 540 → cao 401, tâm quang học trùng tâm con số).
     Đặt giờ: hạt Paper thở · kéo ▲▼: hạt đổ ra từ con số / rút về con số, vành dãn bằng lò xo tới hạn ω 15 ·
     bắt đầu: sóng Acid một vòng 560 ms · mỗi giây: hạt đầu lỏng dần rồi rụng ĐÚNG LÚC số nhảy (5 chấm bung, Acid → Paper, tan) ·
     10 giây cuối: gom thành 10 hạt tròn + nhịp đập mỗi giây · 0:00: vòng vọng Acid mảnh ·
     vào set: hạt + bóng số 0 hút về tâm, vành nhịp nở ra từ tâm · set xong: vành nhịp THỞ RA thành vành hạt.
   Hình học vành hạt tính trong "không gian thiết kế" 393×852 của Figma rồi ánh xạ quanh tâm quang học (cx, cyp) với tỷ lệ s
   (1:1 = 1; nửa màn 1:2 co theo vùng trống). Vẽ: chấm gom lô theo màu + 24 bậc alpha, xếp xa → gần, mảng kiểu, không cấp phát.
   ===================================================================== */
var TAU=Math.PI*2;
var RING={SPEED:1.33, N:208, BAND:0.21, GAIN:0.81, G_RATE:0.10, G_DEPTH:0.40, G_SPREAD:0.20, G_ASYM:0.38, G_LIFT:0.20, G_SWIRL:0.70, YAW:0.20, PITCH:0.24, RX:88, RY:115, TUBE:18};
var RING_DOTS=(function(){ var seed=987654321, d=[]; function rnd(){ seed=(seed*1664525+1013904223)%4294967296; return seed/4294967296; }
  for(var i=0;i<RING.N;i++) d.push({a:rnd()*Math.PI*2, b:rnd()*Math.PI*2, tr:Math.sqrt(rnd()), r:0.75+1.9*Math.pow(rnd(),2.2), al:0.10+0.26*rnd(), s1:rnd(), s2:rnd()}); return d; })();
var HAT={CX:196.5, CY3:458, CYP:441.5, RX:156, RY:204, TUBE:13, PITCH:0.22, FOC:540, KD:5, H:401};
var HAT_GH=(function(){ var g=[], cP=Math.cos(HAT.PITCH), sP=Math.sin(HAT.PITCH);
  for(var i=0;i<720;i++){ var th=i/720*TAU, x0=Math.sin(th)*HAT.RX, y0=-Math.cos(th)*HAT.RY, y2=y0*cP, z2=y0*sP, sp=HAT.FOC/(HAT.FOC+z2); g.push({th:th, x:HAT.CX+x0*sp, y:HAT.CY3+y2*sp}); } return g; })();
function mulberry(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; var t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function ringPhase(t){ return t-Math.floor(t); }
function ringWrap(d){ d=d-Math.round(d); return Math.abs(d); }
function ringFall(d,w){ var u=d/w; return u>=1?0:Math.pow(1-u*u,2); }
function ringGather(u){ u=u-Math.floor(u); if(u<RING.G_ASYM) return (1-Math.cos(Math.PI*u/RING.G_ASYM))/2; return (1+Math.cos(Math.PI*(u-RING.G_ASYM)/(1-RING.G_ASYM)))/2; }

/* src: {key, seed, rest() → đang đếm nghỉ?, left() → giây còn lại (thực), lastTen() → đang trong 10 giây cuối?} */
function Field(cv, src){
  var ctx=cv.getContext('2d'), W=0, Hh=0, K=src.key||'F:';
  var CAP=7200, PX=new Float32Array(CAP), PY=new Float32Array(CAP), PR=new Float32Array(CAP), PA=new Float32Array(CAP), PZ=new Float32Array(CAP), PC=new Uint8Array(CAP), IDX=new Uint16Array(CAP), PN=0;
  var COL=['#FAFAFA','#D4FF00'], rng=mulberry(20260927+(src.seed||0)*7919);
  var cP=Math.cos(HAT.PITCH), sP=Math.sin(HAT.PITCH), cyw=Math.cos(RING.YAW), syw=Math.sin(RING.YAW), cpt=Math.cos(RING.PITCH), spt=Math.sin(RING.PITCH);
  var F={cx:196.5, cy:442, h:324, cyp:441.5, s:1, sx:1,   /* s: tỷ lệ vành hạt theo chiều dọc · sx: chiều ngang (≥ s: luôn chừa chỗ cho con số) */
         CH:{on:false, alpha:0, scale:1, calm:1, dot:0, oy:0},
         CR:{slices:[], exit:[], N:90, Nan:90, Nv:0, acid:false, ignT0:-99, dsT0:-99, dsPhi:0, merge:0, hbT:-99, echoT:-99, ghostOn:false},
         parts:[], inh:[]};
  var CH=F.CH, CR=F.CR;
  function dot(x,y,r,a,c,z){ if(PN>=CAP || r<0.2 || a<0.012) return; PX[PN]=x; PY[PN]=y; PR[PN]=r; PA[PN]=a>1?1:a; PC[PN]=c; PZ[PN]=z; IDX[PN]=PN; PN++; }
  function flushDots(){
    var ix=IDX.subarray(0,PN); ix.sort(function(p,q){ return PZ[q]-PZ[p]; });
    var cc=-1, ca=-1, open=false;
    for(var k=0;k<PN;k++){
      var i=ix[k], ab=Math.round(PA[i]*24)/24;
      if(PC[i]!==cc || ab!==ca){ if(open) ctx.fill(); ctx.beginPath(); cc=PC[i]; ca=ab; ctx.fillStyle=COL[cc]; ctx.globalAlpha=ab; open=true; }
      ctx.moveTo(PX[i]+PR[i],PY[i]); ctx.arc(PX[i],PY[i],PR[i],0,TAU);
    }
    if(open) ctx.fill(); ctx.globalAlpha=1; PN=0;
  }
  function mx(x){ return F.cx+(x-HAT.CX)*F.sx; }
  function my(y){ return F.cyp+(y-HAT.CYP)*F.s; }

  /* ---- vành hạt ---- */
  function newDot(){ return {u:rng(), b0:rng()*TAU, tr:Math.sqrt(rng()), r0:0.75+1.35*Math.pow(rng(),1.8), a0:0.5+0.5*rng(), ph:rng(), fx:0, fy:0, fr:-1, fa:0, fc:0, del:0}; }
  function newSlice(idx){ var d=[]; for(var k=0;k<HAT.KD;k++) d.push(newDot()); return {idx:idx, dots:d, st:'on', t0:0, dur:0, fade:false}; }
  /* môi trường khung hình, tính một lần rồi dùng cho mọi chấm */
  var E={w:TAU/90, roll:0, phi:-1, swFade:0, head:-1, L:0, hb:0, lt:false, rest:false};
  function env(){
    var R=rm(), w0=TAU/Math.max(1,CR.Nan); E.w=lerp(w0, Math.max(w0,0.06), CR.merge);
    E.roll=R?0:0.30*MT;
    if(CR.acid && CR.dsT0>CR.ignT0){   /* hoàn tác bắt đầu nghỉ: sóng Acid rút ngược từ đầu cung còn lại về 12 giờ */
      var q=clamp((MT-CR.dsT0)/0.42,0,1); E.phi=CR.dsPhi*(1-EO(q)); E.swFade=1-q; if(q>=1){ CR.acid=false; E.phi=-1; E.swFade=0; }
    }
    else if(CR.acid){ var p=clamp((MT-CR.ignT0)/0.56,0,1); E.phi=R?TAU+1:TAU*EO(p); E.swFade=R?0:1-clamp((MT-CR.ignT0-0.56)/0.25,0,1); }
    else { E.phi=-1; E.swFade=0; }
    E.rest=src.rest(); E.lt=src.lastTen(); E.head=-1; E.L=0;
    if(E.rest && !R){ var L=src.left(); if(L>0){ var Rr=Math.ceil(L-1e-9), q=1-(L-(Rr-1)); E.head=Rr-1; E.L=q*q; } }
    E.hb=(E.rest && MT>=CR.hbT)?Math.exp(-(MT-CR.hbT)/0.11):0;
  }
  var O={x:0,y:0,z:0,r:0,a:0,c:0};
  function evalDot(s, d, forceL){
    var R=rm(), w=E.w, thS=s.idx*w, mid=thS+w*0.5;
    var breath=R?1:1+0.12*Math.sin(TAU*MT/5.6-mid*2);
    var sw=0;
    if(E.phi>=0 && E.swFade>0){ var dd=E.phi-mid; if(dd>=0 && dd<=0.55){ var u=dd/0.55; sw=(1-u*u)*(1-u*u)*E.swFade; } }
    var acid=CR.acid && mid<=E.phi;
    var Ls=(forceL!==undefined)?forceL:(s.idx===E.head?E.L:0);
    var hb=E.lt?E.hb:0, mg=CR.merge;
    var tube=HAT.TUBE*breath*(1-0.95*mg)*(1+0.9*sw)*(1+1.3*Ls);
    var th=thS+lerp(d.u,0.5,mg*0.97)*w, b=d.b0+E.roll, tr=d.tr*tube;
    var jit=Ls>0?1.4*Ls*Math.sin(MT*23+d.ph*40):0;
    var rr=5*Ls+2.4*hb+tr*Math.cos(b)+jit;
    var x0=Math.sin(th)*(HAT.RX+rr), y0=-Math.cos(th)*(HAT.RY+rr), z0=tr*Math.sin(b);
    var y2=y0*cP-z0*sP, z2=y0*sP+z0*cP, sp=HAT.FOC/(HAT.FOC+z2), near=clamp(1-(z2+55)/110,0,1);
    O.x=mx(HAT.CX+x0*sp); O.y=my(HAT.CY3+y2*sp); O.z=z2;
    O.r=d.r0*Math.pow(sp,1.6)*(1+0.7*sw)*(1+0.25*hb)*(1+0.45*mg)*F.s;
    O.a=Math.min(1,(acid?(0.72+0.28*near):d.a0*(0.40+0.60*near))+0.25*sw+0.15*Ls+0.2*hb+0.2*mg);
    O.c=acid?1:0;
    if(s.st==='enter'){
      var p=clamp((MT-s.t0-d.del)/s.dur,0,1), e=EO(p);
      if(s.fade){ O.a*=p; }
      else {
        O.x=lerp(d.fx,O.x,e); O.y=lerp(d.fy,O.y,e);
        O.r=d.fr<0?O.r*(0.35+0.65*e):lerp(d.fr,O.r,e);
        O.a=d.fr<0?O.a*clamp(p*2.2,0,1):lerp(d.fa,O.a,e);
        if(d.fr>=0 && p<1) O.c=lerp(d.fc,O.c,e)>0.5?1:0;
      }
    }
    return O;
  }
  function drawRing(){
    var i, k, s, d;
    for(i=0;i<CR.slices.length;i++){
      s=CR.slices[i];
      if(s.st==='enter' && MT>s.t0+s.dur+0.06) s.st='on';
      for(k=0;k<s.dots.length;k++){ d=s.dots[k]; evalDot(s,d); dot(O.x,O.y,O.r,O.a,O.c,O.z); }
    }
    for(i=CR.exit.length-1;i>=0;i--){   /* lát bị rút về con số / tắt tại chỗ */
      var x=CR.exit[i], p=clamp((MT-x.t0)/x.dur,0,1), e=EIO(p);
      for(k=0;k<x.pts.length;k++){ var q=x.pts[k]; dot(lerp(q.x,q.tx,e), lerp(q.y,q.ty,e), q.r*(1-0.8*e), q.a*(1-e), q.c, q.z); }
      if(p>=1) CR.exit.splice(i,1);
    }
    if(CR.ghostOn){   /* bóng số 0 ở phần đã trôi qua: đậm dần trong 10 giây cuối */
      var thR=CR.slices.length*E.w, L=src.left(), ga=E.rest?(L<=0?0.24:0.10+0.13*clamp((10-L)/10,0,1)):0.10;
      for(i=0;i<HAT_GH.length;i++){ var g=HAT_GH[i]; if(g.th>=thR) dot(mx(g.x),my(g.y),0.85*F.s,ga,0,900); }
    }
  }
  function drawParts(dt){
    var s=F.s;
    for(var i=F.parts.length-1;i>=0;i--){
      var p=F.parts[i];
      p.vy+=26*s*dt; var dm=Math.exp(-0.9*dt); p.vx*=dm; p.vy*=dm; p.x+=p.vx*dt; p.y+=p.vy*dt; p.age+=dt;
      var k=p.age/p.life; if(k>=1){ F.parts.splice(i,1); continue; }
      var a=Math.pow(1-k,1.4)*0.95, ac=clamp(1-p.age/0.35,0,1), r=p.r*(1-0.4*k);
      if(ac>0) dot(p.x,p.y,r,a*ac,1,-500);
      if(ac<1) dot(p.x,p.y,r,a*(1-ac),0,-500);
    }
    for(var j=F.inh.length-1;j>=0;j--){
      var q=F.inh[j], pp=clamp((MT-q.t0)/q.dur,0,1), e=EIO(pp);
      if(q.r1!=null) dot(lerp(q.x,q.tx,e), lerp(q.y,q.ty,e), lerp(q.r,q.r1,e), lerp(q.a,q.a1,e), e<0.5?q.c:q.c1, q.z);   /* quay ngược: về đúng chấm Chase */
      else dot(lerp(q.x,q.tx,e), lerp(q.y,q.ty,e), q.r*(1-0.7*e), q.a*(1-e), q.c, -400);
      if(pp>=1) F.inh.splice(j,1);
    }
  }
  function drawEcho(){   /* 0:00 · một vòng Acid mảnh nở +16 rồi tan, không phát sáng */
    if(MT<CR.echoT || MT>CR.echoT+0.8) return;
    var p=clamp((MT-CR.echoT)/0.76,0,1), e=EO(p), grow=16*e, a=(1-p)*0.9;
    ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle='#D4FF00'; ctx.lineWidth=1.5*Math.max(0.7,F.s); ctx.beginPath();
    for(var i=0;i<=180;i++){ var th=i/180*TAU, x0=Math.sin(th)*(HAT.RX+grow), y0=-Math.cos(th)*(HAT.RY+grow), y2=y0*cP, z2=y0*sP, sp=HAT.FOC/(HAT.FOC+z2), X=mx(HAT.CX+x0*sp), Y=my(HAT.CY3+y2*sp); if(i) ctx.lineTo(X,Y); else ctx.moveTo(X,Y); }
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  function releaseHead(silent){   /* hạt đầu rụng thành 5 chấm tự do */
    var s=CR.slices.pop(); if(!s || silent) return;
    if(rm()){ fadeSlice(s); return; }
    var strong=E.lt?1.4:1, sc=F.s;
    for(var k=0;k<s.dots.length;k++){
      var d=s.dots[k]; evalDot(s,d,1);
      var dx=O.x-F.cx, dy=O.y-F.cyp, n=Math.sqrt(dx*dx+dy*dy)||1; dx/=n; dy/=n;
      var v0=((22+30*rng())*strong+10)*sc, tg=(rng()-0.5)*20*sc, ang=rng()*TAU, sp2=(8+16*rng())*strong*sc;
      F.parts.push({x:O.x, y:O.y, vx:dx*v0-dy*tg+Math.cos(ang)*sp2, vy:dy*v0+dx*tg-6*sc+Math.sin(ang)*sp2, age:0, life:1.5+0.7*rng(), r:O.r*1.1});
    }
  }
  function fadeSlice(s){ var pts=[]; for(var k=0;k<s.dots.length;k++){ evalDot(s,s.dots[k],0); pts.push({x:O.x,y:O.y,tx:O.x,ty:O.y,r:O.r,a:O.a,c:O.c,z:O.z}); } CR.exit.push({pts:pts, t0:MT, dur:.2}); }
  function exitSlice(s){
    var pts=[];
    for(var k=0;k<s.dots.length;k++){ var d=s.dots[k]; evalDot(s,d,0); pts.push({x:O.x,y:O.y,tx:mx(HAT.CX+(rng()-0.5)*120),ty:my(438+(rng()-0.5)*36),r:O.r,a:O.a,c:O.c,z:O.z}); }
    CR.exit.push({pts:pts, t0:MT, dur:.32});
  }
  /* đổi số lát: thêm = hạt đổ ra từ con số bay vào vành (so le ≤ 9 ms/lát, cả đợt ≤ stag giây) · bớt = rút về con số */
  F.setCount=function(v, instant, stag){
    var have=CR.slices.length, i, s, k, R=rm();
    env();
    if(v>have){
      var st=Math.min(0.009, (stag||0.5)/Math.max(1,v-have));
      for(i=have;i<v;i++){
        s=newSlice(i);
        if(!instant){
          s.st='enter'; s.t0=MT+(R?0:(i-have)*st); s.dur=R?0.2:0.46;
          if(R) s.fade=true;
          else for(k=0;k<s.dots.length;k++){ s.dots[k].fx=mx(HAT.CX+(rng()-0.5)*150); s.dots[k].fy=my(438+(rng()-0.5)*44); s.dots[k].del=rng()*0.04; }
        }
        CR.slices.push(s);
      }
    } else if(v<have){
      var gone=CR.slices.splice(v);
      if(!instant) for(i=0;i<gone.length;i++){ if(R) fadeSlice(gone[i]); else exitSlice(gone[i]); }
    }
  };
  F.setN=function(n, instant){ CR.N=Math.max(1,n); if(instant || rm()){ CR.Nan=CR.N; CR.Nv=0; } };
  F.fill=function(n){ CR.slices=[]; CR.exit=[]; F.setN(n,true); F.setCount(n,true); };
  /* giây đã trôi → hạt đầu rụng đúng lúc số nhảy. Tụt nhiều giây một lúc (app vừa mở lại) → rụng im, chỉ bung 3 hạt cuối */
  F.releaseTo=function(R){
    env(); var pending=CR.slices.length-R;
    while(CR.slices.length>R){ var silent=pending>3 && CR.slices.length>R+2; releaseHead(silent); if(E.lt || src.left()<=10) CR.hbT=MT; }
  };
  F.ignite=function(instant){ CR.acid=true; CR.ignT0=instant?MT-2:MT; CR.dsT0=-99; CR.ghostOn=true; };
  /* hoàn tác "bắt đầu nghỉ" (tua ngược ignite): sóng Acid rút ngược từ đầu cung còn lại về 12 giờ (420 ms --eo, env()),
     bóng số 0 tắt tại chỗ, hạt gom 10 giây cuối tản lại, vòng vọng 0:00 dừng. Hạt đã rụng về lại vành: setCount (nơi gọi) */
  F.douse=function(){
    env(); CR.echoT=-99; F.merge(false);
    if(CR.ghostOn){ var thR=CR.slices.length*E.w; for(var i=0;i<HAT_GH.length;i+=2){ var g=HAT_GH[i]; if(g.th>=thR) F.inh.push({x:mx(g.x),y:my(g.y),tx:mx(g.x),ty:my(g.y),r:.85*F.s,a:.18,c:0,t0:MT,dur:.2}); } CR.ghostOn=false; }
    if(!CR.acid) return;
    if(rm()){ CR.acid=false; return; }
    CR.dsT0=MT; CR.dsPhi=Math.min(TAU, CR.slices.length*E.w);   /* hạt đổ lại (ngoài cung còn lại) vào vành đã là Paper */
  };
  F.merge=function(on, instant){
    if(instant){ twKill(K+'mg'); CR.merge=on?1:0; return; }
    tw({key:K+'mg', from:CR.merge, to:on?1:0, dur:.42, ease:EIO, set:function(v){ CR.merge=v; }});
  };
  F.echo=function(){ if(!rm()) CR.echoT=MT; };
  /* vào set: mọi hạt + bóng số 0 hút về tâm con số (280 ms --eio) */
  F.inhale=function(){
    var i, k, s, d, tx=F.cx, ty=F.cyp;
    env(); CR.exit=[]; F.parts=[];
    if(rm()){ for(i=0;i<CR.slices.length;i++) fadeSlice(CR.slices[i]); }
    else {
      for(i=0;i<CR.slices.length;i++){ s=CR.slices[i]; for(k=0;k<s.dots.length;k++){ d=s.dots[k]; evalDot(s,d); F.inh.push({x:O.x,y:O.y,tx:tx+(rng()-0.5)*14*F.s,ty:ty+(rng()-0.5)*14*F.s,r:O.r,a:O.a,c:O.c,t0:MT+rng()*0.04,dur:.28}); } }
      if(CR.ghostOn){ var thR=CR.slices.length*E.w; for(i=0;i<HAT_GH.length;i+=2){ var g=HAT_GH[i]; if(g.th>=thR) F.inh.push({x:mx(g.x),y:my(g.y),tx:tx,ty:ty,r:.85*F.s,a:.18,c:0,t0:MT,dur:.28}); } }
    }
    CR.slices=[]; CR.ghostOn=false; CR.acid=false; twKill(K+'mg'); CR.merge=0; CR.echoT=-99;
  };
  /* bỏ kết quả vừa chấm (tua ngược exhale): vành hạt QUAY NGƯỢC thành vành nhịp — mỗi chấm bay về đúng chỗ, cỡ, độ sáng, màu của
     một chấm Chase ở trạng thái đích `to` (mặc định lúc lặng), tính tại lúc hạ cánh (vành đang thức vẫn trôi); so le ngược chiều
     thở ra; vành nhịp hiện lên đúng lúc chấm hạ cánh (nơi gọi). Khác "vào set" (hút về tâm): đây là tua lại, không phải bước tiếp.
     Giảm chuyển động → tắt tại chỗ, trả false. */
  F.rewind=function(to){
    if(rm()){ F.inhale(); return false; }
    to=to||{calm:1, dot:0};
    var i, k, s, d, n=CR.slices.length, keep={alpha:CH.alpha, scale:CH.scale, calm:CH.calm, dot:CH.dot, oy:CH.oy}, tg=[], land=MT+0.47;
    CH.calm=to.calm; CH.dot=to.dot; CH.scale=1; CH.oy=0; CH.alpha=1;
    for(i=0;i<RING.N;i++){ chaseDot(i, land); tg.push({x:CO.x, y:CO.y, r:CO.r, a:CO.a*chA(), c:CO.c, z:CO.z}); }
    for(var kk in keep) CH[kk]=keep[kk];
    env(); CR.exit=[]; F.parts=[];
    for(i=0;i<n;i++){
      s=CR.slices[i]; var ang=(i+0.5)/Math.max(1,n);
      for(k=0;k<s.dots.length;k++){ d=s.dots[k]; evalDot(s,d); var t=tg[(i*HAT.KD+k)*37%RING.N];
        F.inh.push({x:O.x, y:O.y, tx:t.x, ty:t.y, r:O.r, r1:t.r, a:O.a, a1:t.a, c:O.c, c1:t.c, z:t.z, t0:MT+(1-ang)*0.10, dur:.42}); }
    }
    if(CR.ghostOn){ var thR=n*E.w; for(i=0;i<HAT_GH.length;i+=2){ var g=HAT_GH[i]; if(g.th>=thR) F.inh.push({x:mx(g.x),y:my(g.y),tx:mx(g.x),ty:my(g.y),r:.85*F.s,a:.18,c:0,t0:MT,dur:.2}); } }
    CR.slices=[]; CR.ghostOn=false; CR.acid=false; twKill(K+'mg'); CR.merge=0; CR.echoT=-99;
    return true;
  };
  /* set xong: vành nhịp THỞ RA thành vành hạt — mỗi chấm mới xuất phát đúng vị trí/cỡ/độ sáng/màu của một chấm Chase */
  F.exhale=function(n){
    var srcDots=[], i, k, R=rm();
    if(!R && CH.on && CH.alpha>0.01){ var A=chA(); for(i=0;i<RING.N;i++){ chaseDot(i); srcDots.push({x:CO.x,y:CO.y,r:CO.r,a:CO.a*A,c:CO.c}); } }
    CR.acid=false; twKill(K+'mg'); CR.merge=0; CR.ghostOn=false; CR.exit=[]; CR.echoT=-99; F.setN(n,true); CR.slices=[];
    for(i=0;i<n;i++){
      var s=newSlice(i); s.st='enter'; s.t0=MT; s.dur=R?0.2:0.52;
      if(!srcDots.length) s.fade=true;
      else { var ang=(i+0.5)/n; for(k=0;k<s.dots.length;k++){ var o=srcDots[(i*HAT.KD+k)*37%RING.N], d=s.dots[k]; d.fx=o.x; d.fy=o.y; d.fr=o.r; d.fa=o.a; d.fc=o.c; d.del=ang*0.10; } }
      CR.slices.push(s);
    }
    twKill(K+'cha'); twKill(K+'chs'); twKill(K+'chc'); twKill(K+'chd'); CH.on=false; CH.alpha=0;
  };
  F.clearHat=function(){ CR.slices=[]; CR.exit=[]; F.parts=[]; F.inh=[]; CR.ghostOn=false; CR.acid=false; CR.merge=0; CR.echoT=-99; };

  /* ---- vành nhịp (Chase) ---- */
  var CO={x:0,y:0,r:0,a:0,c:0,z:0};
  function chA(){ return CH.alpha*(1-0.25*CH.calm); }
  function chaseDot(i, at){   /* at: thời điểm MT cần tính (mặc định bây giờ) — rewind tính đích ở lúc hạ cánh */
    var SC=F.h/(2*(RING.RY+RING.TUBE))*CH.scale, t=at==null?MT:at, calm=CH.calm, chasePh=ringPhase(t*0.30*RING.SPEED)*2, breath=ringPhase(t*RING.G_RATE*RING.SPEED);
    var d=RING_DOTS[i], k=ringGather(breath+d.s1*RING.G_SPREAD)*(1-calm), pull=1-RING.G_DEPTH*k*(0.45+0.55*d.s2), a=d.a+RING.G_SWIRL*k*(0.55+0.45*d.s1);
    var tt=RING.TUBE*d.tr, cb=Math.cos(d.b), sb=Math.sin(d.b);
    var x0=Math.cos(a)*(RING.RX+tt*cb)*pull, y0=Math.sin(a)*(RING.RY+tt*cb)*pull, z0=tt*sb*pull;
    var x1=x0*cyw+z0*syw, z1=-x0*syw+z0*cyw, y2=y0*cpt-z1*spt, z2=y0*spt+z1*cpt;
    var sp=540/(540+z2), dep=(z2+110)/220; dep=dep<0?0:(dep>1?1:dep); dep=1-dep;
    var e=ringFall(ringWrap((d.a/TAU+0.25)*2-chasePh), RING.BAND*1.4)*RING.GAIN;
    CO.x=F.cx+x1*sp*SC; CO.y=F.cy+CH.oy+y2*sp*SC; CO.r=(d.r*(1+2.6*e))*Math.pow(sp,1.6)*SC;
    CO.a=clamp((d.al+0.78*e+RING.G_LIFT*k)*(0.32+0.68*dep),0,1); CO.c=(e>0.72+0.12*calm)?1:0; CO.z=z2;   /* lõi sóng hoá Acid dần khi thức dậy */
    return CO;
  }
  function drawChase(){
    if(!CH.on || CH.alpha<=0.002) return;
    var A=chA();
    for(var i=0;i<RING.N;i++){ chaseDot(i); dot(CO.x,CO.y,CO.r,CO.a*A,CO.c,CO.z); }
    if(CH.dot>0.01){ var SC=F.h/(2*(RING.RY+RING.TUBE))*CH.scale; dot(F.cx,F.cy+CH.oy,6.2*SC*(0.55+0.45*CH.dot),0.9*A*CH.dot,0,-900); }
  }
  /* đặt tức thì */
  F.chaseSet=function(o){ CH.on=true; for(var k in o) CH[k]=o[k]; };
  /* thức dậy / lặng đi: calm, dot, alpha trôi tới đích (--eo) */
  F.chaseTo=function(o, dur){
    CH.on=true;
    ['calm','dot','alpha'].forEach(function(k){ if(o[k]==null) return; tw({key:K+'ch'+k.charAt(0)+'2', from:CH[k], to:o[k], dur:dur||.42, ease:EO, set:function(v){ CH[k]=v; }}); });
  };
  /* nở ra từ tâm: scale .2 → 1, alpha 0 → 1 (320 ms --eo, trễ 80 ms); oy = lệch tâm lúc đầu (tâm con số → tâm vành) */
  F.chaseBloom=function(o){
    o=o||{}; var dl=o.delay!=null?o.delay:.08, R=rm();
    CH.on=true; CH.calm=o.calm!=null?o.calm:1; CH.dot=o.dot||0; CH.alpha=0; CH.scale=R?1:.2; CH.oy=R?0:(o.oy||0);
    tw({key:K+'cha', from:0, to:1, dur:.32, ease:EO, delay:R?0:dl, pre:false, keepRM:true, rmDur:.2, set:function(v){ CH.alpha=v; }});
    tw({key:K+'chs', from:.2, to:1, dur:.32, ease:EO, delay:dl, pre:false, set:function(v){ CH.scale=v; }});
    if(CH.oy) tw({key:K+'cho', from:CH.oy, to:0, dur:.32, ease:EO, delay:dl, pre:false, set:function(v){ CH.oy=v; }});
  };
  F.chaseOff=function(){ CH.on=false; CH.alpha=0; };

  /* ---- khung ---- */
  F.size=function(){
    var b=cv.getBoundingClientRect(), w=Math.max(1,Math.round(b.width)), h=Math.max(1,Math.round(b.height));
    var k=Math.min(window.devicePixelRatio||1, 3); if(h*k>2600) k=2600/h;
    if(w===W && h===Hh && cv.width===Math.round(w*k)) return;
    W=w; Hh=h; cv.width=Math.round(w*k); cv.height=Math.round(h*k); ctx.setTransform(k,0,0,k,0,0);
  };
  F.update=function(dt){   /* lò xo tới hạn cho tổng số lát: vành dãn / khít lại khi đổi giờ */
    if(rm()){ CR.Nan=CR.N; CR.Nv=0; return; }
    var ds=Math.min(dt,0.05), target=CR.N, sub=Math.max(1,Math.ceil(ds/0.004)), h=ds/sub, om=15;
    for(var i=0;i<sub;i++){ var a=om*om*(target-CR.Nan)-2*om*CR.Nv; CR.Nv+=a*h; CR.Nan+=CR.Nv*h; }
    if(Math.abs(target-CR.Nan)<0.001 && Math.abs(CR.Nv)<0.001){ CR.Nan=target; CR.Nv=0; }
  };
  F.draw=function(dv){
    if(!W) return;
    ctx.clearRect(0,0,W,Hh);
    env(); drawRing(); drawChase(); drawParts(dv); flushDots(); drawEcho();
  };
  F.state=function(){ return {slices:CR.slices.length, N:CR.N, Nan:CR.Nan, acid:CR.acid, merge:CR.merge, ghost:CR.ghostOn, parts:F.parts.length, inhale:F.inh.length,
    chase:CH.on, calm:CH.calm, dot:CH.dot, alpha:CH.alpha, scale:CH.scale, cx:F.cx, cy:F.cy, cyp:F.cyp, s:F.s, sx:F.sx, h:F.h, phi:E.phi}; };
  return F;
}

/* =====================================================================
   0 — PIN
   ===================================================================== */
var pinState={val:''};
function startPin(){
  pinState.val=''; $('pin-err').textContent=''; renderDots();
  var pad=$('pin-pad'); pad.innerHTML='';
  ['1','2','3','4','5','6','7','8','9','XÓA','0','⌫'].forEach(function(k,i){
    var b=document.createElement('button');
    b.className='key keyin'+((k==='XÓA'||k==='⌫')?' mut':'')+(k==='⌫'?' bks':'');
    b.style.animationDelay=(120+i*16)+'ms';
    if(k==='⌫') b.innerHTML=ico('i-bks'); else b.textContent=k;
    b.onclick=function(){
      if(k==='XÓA') pinState.val=''; else if(k==='⌫') pinState.val=pinState.val.slice(0,-1); else if(pinState.val.length<4) pinState.val+=k;
      $('pin-err').textContent=''; renderDots();
      if(pinState.val.length===4){ pinSweep(); setTimeout(tryPin,200); }
    };
    pad.appendChild(b);
  });
}
/* đủ 4 số: một sóng chạy qua 4 chấm Acid (35 ms/chấm, nảy 1,3) rồi mới kiểm tra — đăng nhập là khoảnh khắc hiếm, được phép có cảm xúc */
function pinSweep(){
  if(rm()) return;
  [].forEach.call($('pin-dots').children, function(d,i){ if(d.animate) d.animate([{transform:'scale(1)'},{transform:'scale(1.32)',offset:.4},{transform:'scale(1)'}], {duration:240, delay:i*35, easing:'cubic-bezier(.22,.85,.22,1)'}); });
}
function renderDots(){ var el=$('pin-dots'); el.classList.remove('err'); el.innerHTML=''; for(var i=0;i<4;i++){ var d=document.createElement('div'); d.className='dot'+(i<pinState.val.length?' f':''); el.appendChild(d); } }
function pinError(msg){ $('pin-err').textContent=msg; pinState.val=''; var el=$('pin-dots'); el.innerHTML=''; for(var i=0;i<4;i++){ var d=document.createElement('div'); d.className='dot'; el.appendChild(d); } el.classList.add('err'); setTimeout(function(){ el.classList.remove('err'); }, 500); }
function tryPin(){
  var pin=pinState.val, acc=accFind(pin), c=acc?loadCache(acc.coach):null;
  if(c){
    /* PIN đã từng vào được trên máy này (coach hoặc Admin): vào NGAY từ cache, làm mới ngầm */
    if(acc.adm) setAdmin(true, pin); else { setAdmin(false); state.pin=pin; }
    SES('lb_pin',pin); state.loading=false; buildClients(c.res); state.stats=loadStats(state.coach); state.dataTs=c.ts; go('p-home','fwd'); refreshData(true); flush(); return;
  }
  /* đường mạng. state.pin chỉ gán khi máy chủ đã nhận PIN — trước đó authed()=false nên flush() không gửi hàng đợi bằng một PIN chưa rõ của ai */
  state.pin=''; setAdmin(false); state.coach=''; state.clients=[]; state.stats=null; state.loading=true; state.dataTs=Date.now();
  go('p-home','fwd');
  var ep=AUTH_EP, t0=Date.now(), n=1, end=function(){ if(n){ n=0; busyLine(false); } };
  busyLine(true);
  if(acc && acc.adm){ adminLoad(pin, t0, ep, end); return; }      /* PIN Admin đã biết (chỉ mất cache dữ liệu): khỏi hỏi Worker */
  api({action:'coach', pin:pin}, 2, 600, 0, 30000).then(function(res){
    if(ep!==AUTH_EP){ end(); return; }
    if(res&&res.ok){ end(); state.pin=pin; state.loading=false; SES('lb_pin',pin); buildClients(res, t0); saveCache(res); state.dataTs=Date.now(); state.stats=loadStats(state.coach); if(state.screen==='p-home') renderHome(true); refreshStats(true); flush(); return; }
    /* không phải PIN coach → thử Admin NGAY (adm_data tự kiểm PIN — bỏ lượt hỏi 'admin' riêng như v2.4.0) */
    if(res&&res.error==='sai_pin'){ adminLoad(pin, t0, ep, end); return; }
    end(); backToPin('MÁY CHỦ LỖI — THỬ LẠI');
  }).catch(function(){ end(); if(ep===AUTH_EP) backToPin('MÁY CHỦ CHẬM — THỬ LẠI'); });
}
/* v2.4.1 — PIN Admin: adm_data (tự kiểm PIN) và adm_stats chạy SONG SONG trên Apps Script
   (v2.4.0: admin → adm_data → adm_stats nối đuôi ≈ 30 s). Giao diện Admin chỉ bật khi adm_data trả ok → PIN sai không nháy tab Cài đặt.
   end(): tắt vạch bận của tryPin (đúng một lần). */
function adminLoad(pin, t0, ep, end){
  var month=TODAY_ISO.slice(0,7);
  var ps=api({action:'adm_stats', apin:pin, month:month}, 1, 800, 0, 30000).catch(function(){ return null; });
  api({action:'adm_data', apin:pin}, 2, 600, 0, 30000).then(function(res){
    end(); if(ep!==AUTH_EP) return;
    if(!(res&&res.ok)){ backToPin(res&&res.error==='sai_pin' ? 'MÃ PIN KHÔNG ĐÚNG' : res&&res.error==='unknown_action' ? 'MÁY CHỦ CHƯA CÓ CHẾ ĐỘ ADMIN' : 'MÁY CHỦ LỖI — THỬ LẠI'); return; }
    setAdmin(true, pin); SES('lb_pin', pin); state.loading=false;
    buildClients(res, t0); saveCache(res); state.dataTs=Date.now(); state.stats=loadStats(state.coach);
    var ep2=AUTH_EP;
    state._stats=ps.then(function(st){
      if(ep2!==AUTH_EP) return; state._stats=null;
      if(st && st.ok){ if(month===TODAY_ISO.slice(0,7)) statsApply(st); else refreshStats(true); }   /* sang tháng mới giữa chừng → lấy lại */
    });
    if(state.screen==='p-home') renderHome(true); flush();
  }).catch(function(){ end(); if(ep===AUTH_EP) backToPin('MÁY CHỦ CHẬM — THỬ LẠI'); });
}
function backToPin(msg){ state.pin=''; setAdmin(false); hidePill(); SES('lb_pin',null); state.loading=false; state.clients=[]; go('p-pin','back'); setTimeout(function(){ pinError(msg); },300); }
HOOK['p-pin']=function(){ startPin(); warm(); };
/* chẩn đoán bố cục trên máy thật: chạm wordmark 5 lần */
(function(){ var n=0, t=0; $('wordmark').addEventListener('click', function(){
  var now=Date.now(); n=(now-t<1500)?n+1:1; t=now; if(n<5) return; n=0;
  var pr=document.createElement('div'); pr.style.cssText='position:fixed;left:0;top:0;width:0;height:0;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0;visibility:hidden'; document.body.appendChild(pr);
  var cs=getComputedStyle(pr), vv=window.visualViewport;
  $('diag').hidden=false;
  var rs=getComputedStyle(document.documentElement), bot=(function(){ var q=document.createElement('div'); q.style.cssText='position:fixed;left:0;right:0;bottom:0;height:1px;visibility:hidden'; document.body.appendChild(q); var y=Math.round(q.getBoundingClientRect().bottom); q.remove(); return y; })();
  $('diag').textContent='WIN '+innerWidth+'×'+innerHeight+' · SCREEN '+screen.width+'×'+screen.height+' · VV '+(vv?Math.round(vv.height):'-')+' · SAT '+cs.paddingTop+' · SAB '+cs.paddingBottom+' · '+(matchMedia('(display-mode: standalone)').matches?'STANDALONE':'BROWSER')+(navigator.standalone?' · NAV.SA':'')+' · '+(document.documentElement.classList.contains('sb-legacy')?'BẢN CÀI CŨ (THANH ĐEN)':'TRÀN MÀN HÌNH')+' · TOP '+rs.getPropertyValue('--top').trim()+' · ĐÁY FIXED '+bot+' · DPR '+devicePixelRatio+' · '+APP_VER+' · '+mtDiag();
  pr.remove();
}); })();

/* ---- ADMIN · TAB CÀI ĐẶT: IP được check-in ----
   Nguồn: Script Property STUDIO_IP (danh sách ngăn dấu phẩy — đúng thứ ipOk_ của Apps Script đang đọc) qua iplist/addip/delip (Admin.gs).
   Ô 1 = IP phòng, ô 2 = IP thứ 2. "Thêm IP" ghi IP của thiết bị đang mở app vào ô trống; × xoá theo GIÁ TRỊ.
   Không xoá được IP cuối cùng (danh sách rỗng = Apps Script tắt khoá IP). Worker Cloudflare đọc ALLOW_IP riêng — app tự lui về Apps Script. */
var ADM={ips:[], max:2, busy:false, loaded:false};
HOOK['p-admin']=function(){
  $('am-ip').textContent=state.ip||'—'; $('am-ver').textContent='ADMIN · KHÔNG KHOÁ IP · '+upper(APP_VER);
  renderIps(); refreshIp().then(function(){ if(state.screen==='p-admin'){ $('am-ip').textContent=state.ip||'—'; renderIps(); } }); loadIps();
};
function renderIps(){
  var el=$('am-list'), ips=ADM.ips, max=Math.max(ADM.max||2, ips.length), n=ips.length; el.innerHTML='';
  $('am-note').textContent='IP ĐƯỢC CHECK-IN · '+(ADM.loaded?n:'—')+'/'+max;
  for(var i=0;i<max;i++)(function(i){
    var ip=ips[i]||'', b=document.createElement('div'); b.className='row'+(ip?'':' off');
    b.innerHTML='<span class="lt"><span class="nm mono">'+(ip?esc(ip):'—')+'</span><span class="lab">'+(i===0?'IP PHÒNG':'IP THỨ '+(i+1))+(ip && ip===state.ip?' · THIẾT BỊ NÀY':'')+'</span></span>'+(ip && n>1?'<button class="ghost x" aria-label="Xoá IP">'+ico('i-x')+'</button>':'');
    var x=b.querySelector('.x'); if(x) x.onclick=function(){ delIp(ip); };
    el.appendChild(b);
  })(i);
  var add=$('am-add'), full=n>=(ADM.max||2), dup=!!state.ip && ips.indexOf(state.ip)>=0;
  add.classList.toggle('off', !ADM.loaded || full || dup || !state.ip || ADM.busy);
  add.textContent= dup ? 'IP này đã có' : full ? 'Đã đủ '+(ADM.max||2)+' IP · xoá bớt' : 'Thêm IP';
}
function ipsFrom(res){ ADM.ips=(res.ips||[]).map(String).filter(Boolean); ADM.max=+res.max||ADM.max||2; ADM.loaded=true; renderIps(); }
function ipErr(res){
  var e=res&&res.error; if(e==='sai_pin'){ pinGone(); return; }
  notify(e==='full'?'Đã đủ '+(ADM.max||2)+' IP':e==='con_1_ip'?'Phải giữ ít nhất 1 IP':e==='unknown_action'?'Máy chủ chưa có chế độ Admin':(e==='sai_ip'||e==='thieu_ip')?'Chưa lấy được IP thiết bị':'Không lưu được', {err:true});
}
function loadIps(){ api({action:'iplist'}, 1, 800, 0, 30000).then(function(res){ if(res&&res.ok) ipsFrom(res); else ipErr(res); }).catch(function(){ notify('Máy chủ chậm', {err:true}); }); }
function addIp(){
  if(ADM.busy) return; ADM.busy=true; busyLine(true); renderIps();
  refreshIp().then(function(){ $('am-ip').textContent=state.ip||'—'; if(!state.ip) throw new Error('no_ip'); return api({action:'addip'}, 1, 800, 0, 30000); })
  .then(function(res){ busyLine(false); ADM.busy=false; if(res&&res.ok){ ipsFrom(res); notify('Đã thêm IP '+state.ip); } else { renderIps(); ipErr(res); } })
  .catch(function(e){ busyLine(false); ADM.busy=false; renderIps(); notify(e&&e.message==='no_ip'?'Chưa lấy được IP thiết bị':'Máy chủ chậm', {err:true}); });
}
function delIp(ip){
  if(ADM.busy || !ip) return; ADM.busy=true; busyLine(true); renderIps();
  api({action:'delip', del:ip}, 1, 800, 0, 30000).then(function(res){ busyLine(false); ADM.busy=false;
    if(res&&res.ok){ ipsFrom(res); notify('Đã xoá IP'); } else { renderIps(); ipErr(res); } })
  .catch(function(){ busyLine(false); ADM.busy=false; renderIps(); notify('Máy chủ chậm', {err:true}); });
}
function adminLogout(){ logout(); }

/* =====================================================================
   1 — TRANG CHỦ
   ===================================================================== */
function monthOf(iso){ return iso.slice(0,7); }
function statsFor(name){ var s=state.stats; return (s && s.perClient && s.perClient[name]) || null; }
function slowClients(){ var s=state.stats; if(!s||!s.perClient) return null; return state.clients.filter(function(c){ var p=s.perClient[c.name]; return c.left>0 && p && (+p.m||0)<10; }); }
HOOK['p-home']=function(dir, quiet){ renderHome(!quiet); };
function homeRange(r){ state.homeRange=r; $('h-7d').classList.toggle('on', r==='7d'); $('h-1m').classList.toggle('on', r==='1m'); renderBars(true); }
/* tween số: từ from → to trong dur ms, ease-out cubic (cùng ngôn ngữ countUp). Huỷ tween cũ trên cùng phần tử. */
function tweenNum(el, from, to, dur){
  if(el._tw) cancelAnimationFrame(el._tw); el._tw=0;
  if(rm() || from===to || !(dur>0)){ el.textContent=String(to); return; }
  var t0=performance.now();
  (function f(t){ var p=Math.min(1,(t-t0)/dur); p=1-Math.pow(1-p,3); el.textContent=Math.round(from+(to-from)*p); el._tw= p<1 ? requestAnimationFrame(f) : 0; })(t0);
}
/* trạng thái hero khi scrub biểu đồ: mode 'month' | 'day' · total = tổng tháng · cur = cột đang chọn */
var HB={mode:'month', total:null, cur:null, scrub:false, t:0};
function heroL1(text, fade){ var l1=$('h-month'); l1.classList.remove('sw'); l1.textContent=text; if(fade && !rm()){ void l1.offsetWidth; l1.classList.add('sw'); } }
function heroNum(){ var n=$('h-taught').querySelector('.n'); return n ? (parseInt(n.textContent,10)||0) : 0; }
/* dòng 2 của hero: coach "Đã dạy n buổi" · Admin "Tổng n buổi" (cả phòng, Figma Admin 538:193) */
function heroWord(){ return state.admin ? 'Tổng' : 'Đã dạy'; }
function heroL2(to){ var ht=$('h-taught'), from=heroNum(); ht.innerHTML=heroWord()+' <span class="n">'+from+'</span> buổi'; tweenNum(ht.querySelector('.n'), from, to, 260); }
function heroDay(k, v){ var sw=HB.mode!=='day'; HB.mode='day'; heroL1(k.slice(8,10)+'/'+k.slice(5,7), sw); heroL2(v); }
function heroMonth(){
  clearTimeout(HB.t); HB.t=0; if(HB.cur){ HB.cur.classList.remove('hit'); HB.cur=null; }
  if(HB.mode==='month') return; HB.mode='month';
  heroL1('Tháng '+TODAY_ISO.slice(5,7), true);
  if(HB.total==null) $('h-taught').textContent=heroWord()+' — buổi'; else heroL2(HB.total);
}
function renderHome(animate){
  var s=state.stats, m=monthOf(TODAY_ISO), cur=s && s.month===m;
  $('h-name').textContent=state.loading?'Đang tải…':coachName(state.coach);
  clearTimeout(HB.t); HB.t=0; HB.mode='month'; HB.cur=null; HB.scrub=false;
  heroL1('Tháng '+TODAY_ISO.slice(5,7), false);
  var total=cur ? (s.monthTotal!=null ? s.monthTotal : Object.keys(s.days||{}).reduce(function(a,k){ return k.slice(0,7)===m ? a+(+s.days[k]||0) : a; },0)) : null;
  HB.total=total;
  var ht=$('h-taught');
  if(total==null) ht.textContent=heroWord()+' — buổi';
  else { ht.innerHTML=heroWord()+' <span class="n">'+total+'</span> buổi'; if(animate) countUp(ht.querySelector('.n'), total, 700, 420); }
  renderBars(animate);
  var active=state.clients.filter(function(c){ return c.left>0; }).length;
  var slow=slowClients(), today=state.clients.filter(function(c){ return c.checked || (ciFor(c.name)&&ciFor(c.name).status==='ok'); }).length;
  /* ô tiền: coach = Hoa hồng của mình (tab COM) · Admin = Doanh thu cả phòng (dòng Tổng tab COM). Tháng COM khác tháng này → ghi rõ "T8". */
  var com=state.admin ? (s && s.rev && s.rev.total!=null ? s.rev : null) : (s && s.com && s.com.total!=null ? s.com : null),
      comLab=(state.admin?'Doanh thu':'Hoa hồng')+(com && com.month && com.month!==m ? ' T'+(+com.month.slice(5,7)) : '');
  var tiles=[
    {l:'Tổng số khách', v:state.loading?'—':String(active), ic:'t-people', go:'p-clients'},
    {l:'Khách tập chậm', v:slow?String(slow.length):'—', ic:'t-trend', go:'p-clients', q:'slow'},
    {l:'Khách hôm nay', v:state.loading?'—':String(today), ic:'t-bar', acid:true, go:'p-clients', q:'today'},
    {l:comLab, v:com?fmtTr(com.total):'—', small:com?'TR':'', ic:'t-dong', thin:true}
  ];
  var el=$('h-tiles'); el.innerHTML='';
  tiles.forEach(function(t,i){
    var b=document.createElement('button'); b.className='tile'+(t.acid?' acid':'')+(animate?' rowin':''); if(animate) b.style.animationDelay=(120+i*50)+'ms';
    b.innerHTML='<div><div class="tl">'+t.l+'</div><div class="tv"><span class="n">'+t.v+'</span>'+(t.small?'<small> '+t.small+'</small>':'')+'</div></div>'+ico(t.ic, t.thin?'thin':'');
    if(animate && /^\d+$/.test(t.v)) countUp(b.querySelector('.n'), +t.v, 600, 300+i*60);
    if(t.go) b.onclick=function(){ if(t.q==='slow'||t.q==='today') openClientSheet(t.q); else { state.clFilter=t.q||''; go(t.go,'fwd'); } };
    el.appendChild(b);
  });
  $('h-go').textContent= loadSession() ? 'Tiếp tục buổi tập' : 'Vào buổi tập';
}
/* cột 2px, cách đều; quá khứ Paper · hôm nay Acid · ngày trống / tương lai 1px 16%. Cao = v/max·64 (tối thiểu 2px).
   Chạm + kéo ngang (scrub): cột gần ngón tay nhất sáng Acid, hero đổi thành ngày dd/mm + số buổi ngày đó; nhấc tay ~900ms thì về tháng. */
function renderBars(animate){
  var s=state.stats, days=(s&&s.days)||{}, el=$('h-bars'), list=[], m=monthOf(TODAY_ISO);
  if(state.homeRange==='7d'){ for(var i=6;i>=0;i--) list.push(isoAdd(TODAY_ISO,-i)); }
  else { var p=TODAY_ISO.split('-'), n=new Date(+p[0],+p[1],0).getDate(); for(var d=1; d<=n; d++) list.push(m+'-'+pad2(d)); }
  var max=1; list.forEach(function(k){ max=Math.max(max, +days[k]||0); });
  clearTimeout(HB.t); HB.t=0; HB.cur=null; HB.scrub=false; if(HB.mode==='day') heroMonth();
  el.classList.remove('in'); el.innerHTML='';
  list.forEach(function(k,i){
    var b=document.createElement('i'), v=+days[k]||0, fut=k>TODAY_ISO;
    b.className= k===TODAY_ISO ? 'on' : (fut || !v) ? 'off' : '';
    b.style.height= (fut || !v) ? '1px' : Math.max(2, Math.round(v/max*64))+'px';
    b.dataset.k=k; b.dataset.v=fut?0:v;
    if(animate) b.style.transitionDelay=(i*8)+'ms, 0ms';   /* chỉ trễ transform; màu đổi tức thì khi chọn */
    el.appendChild(b);
  });
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.add('in'); }); });
  if(!el._scrub){ el._scrub=1;
    var cx=[];
    function pick(x){ var best=-1, bd=1e9; for(var j=0;j<cx.length;j++){ var dd=Math.abs(cx[j]-x); if(dd<bd){ bd=dd; best=j; } } return best>=0 ? el.children[best] : null; }
    function sel(b){
      if(!b || b===HB.cur) return;
      if(HB.cur) HB.cur.classList.remove('hit'); HB.cur=b; b.classList.add('hit');
      heroDay(b.dataset.k, +b.dataset.v);
      if(navigator.vibrate) try{ navigator.vibrate(4); }catch(e){}
    }
    function up(){ if(!HB.scrub) return; HB.scrub=false; el.classList.remove('scrub'); clearTimeout(HB.t); heroMonth(); }   /* nhả tay: về trạng thái mặc định NGAY */
    el.addEventListener('pointerdown', function(e){
      if(!el.children.length) return; e.preventDefault();
      try{ el.setPointerCapture(e.pointerId); }catch(x){}
      cx=[]; for(var j=0;j<el.children.length;j++){ var br=el.children[j].getBoundingClientRect(); cx.push(br.left+br.width/2); }
      clearTimeout(HB.t); HB.t=0; HB.scrub=true; el.classList.add('scrub'); sel(pick(e.clientX));
    });
    el.addEventListener('pointermove', function(e){ if(HB.scrub) sel(pick(e.clientX)); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  }
}
/* ---- WINDOW KHÁCH từ ô trang chủ: kind 'slow' = khách tập chậm · 'today' = khách đã tập hôm nay.
   Cùng phong cách window thư viện (#lib): dimmer + sheet trượt từ dưới (.36s var(--eo)); vuốt handle >80px / chạm dimmer / "Đóng" → đóng.
   Chạm một khách → đóng window rồi mở hồ sơ (quay lại về trang chủ). Không sửa go(): đóng ngay trong onclick trước khi chuyển màn. ---- */
var CS_OPEN=false, CS_KIND='';
function csClients(kind){
  if(kind==='slow') return slowClients()||[];                       /* chưa có thống kê → rỗng */
  return state.clients.filter(function(c){ return c.checked || (ciFor(c.name)&&ciFor(c.name).status==='ok'); });
}
function csMeta(m, kind){
  if(kind==='today'){ var ci=ciFor(m.name), at=(ci && ci.status==='ok' && ci.at) || m.signed || ''; return 'ĐÃ TẬP HÔM NAY'+(at?' · '+at:''); }
  return clientMeta(m)+' <svg class="ic s13 slow"><use href="#t-trend"/></svg>';
}
function openClientSheet(kind){ CS_KIND=kind; CS_OPEN=true; $('cs-q').value=''; renderClientSheet(true); $('cs-dim').classList.add('on'); $('csheet').classList.add('on'); syncTheme(); }
function closeClientSheet(silent){ if(!CS_OPEN) return; CS_OPEN=false; $('cs-dim').classList.remove('on'); $('csheet').classList.remove('on'); $('csheet').style.transform=''; setTimeout(syncTheme, 380); }
function renderClientSheet(animate){
  var kind=CS_KIND, q=norm($('cs-q').value), el=$('cs-list'), title=kind==='slow'?'KHÁCH TẬP CHẬM':'KHÁCH HÔM NAY'; el.innerHTML=''; var i=0;
  var all=csClients(kind), list=all.filter(function(m){ return !q || norm(m.name).indexOf(q)>=0; });
  $('cs-q').closest('.search').hidden=!all.length;   /* rỗng: không ô tìm, chỉ một dòng chữ */
  if(list.length){
    var d=document.createElement('div'); d.className='lab sec'; d.textContent=title+' · '+list.length; el.appendChild(d);
    list.forEach(function(m){ el.appendChild(clientRow(m, animate, i++, csMeta(m, kind), function(){ var h=FX.heroPrep(this.querySelector('.nm'), firstName(m.name)); closeClientSheet(true); state.client=m; state.back='p-home'; go('p-profile','fwd'); FX.heroFly(h, $('pf-name')); }, kind==='today'?false:undefined)); });   /* khách hôm nay: không icon mũi tên */
  } else { var e=document.createElement('div'); e.className='lab empty'; e.textContent= q && all.length ? 'KHÔNG TÌM THẤY TÊN NÀY' : (kind==='slow' ? 'KHÔNG CÓ KHÁCH TẬP CHẬM' : 'CHƯA CÓ KHÁCH HÔM NAY'); el.appendChild(e); }
  el._fogTop=32; fogUpdate(el); if(!animate) mqInit(el);
}
(function(){ var y0=0, on=false, h=$('cs-handle');
  h.addEventListener('touchstart', function(e){ on=true; y0=e.touches[0].clientY; }, {passive:true});
  h.addEventListener('touchmove', function(e){ if(!on) return; var dy=e.touches[0].clientY-y0; if(dy>0) $('csheet').style.transform='translateY('+dy+'px)'; }, {passive:true});
  h.addEventListener('touchend', function(e){ if(!on) return; on=false; var dy=(e.changedTouches[0].clientY-y0); $('csheet').style.transform=''; if(dy>80) closeClientSheet(); }, {passive:true});
  h.addEventListener('click', function(){ closeClientSheet(); });
})();
function enterSession(){
  var s=loadSession();
  if(s){ state.session=s; if(s.plan && s.plan.length && s.started){ go('p-loop','fwd'); } else go('p-plan','fwd'); return; }
  state.sel=[]; go('p-pick','fwd');
}

/* =====================================================================
   SUB 1 — KHÁCH HÀNG
   ===================================================================== */
HOOK['p-clients']=function(dir, quiet){ if(!quiet){ $('cl-q').value=''; } renderClients(!quiet); };
function clientRow(m, animate, i, meta, onclick, icon, cls){
  var b=document.createElement('button'); b.className='row'+(animate?' rowin':''); if(animate) b.style.animationDelay=Math.min(i*24,280)+'ms';
  b.innerHTML='<span class="lt"><span class="nm mq"><span>'+esc(m.name)+'</span></span><span class="lab">'+meta+'</span></span>'+(icon===false?'':ico(icon||'i-arr', cls));
  b.onclick=onclick; return b;
}
function clientMeta(m){ return 'GÓI '+m.total+' · '+(m.left>0?'CÒN '+m.left+' BUỔI':'ĐÃ HẾT')+(state.admin && m.coach ? ' · '+upper(String(m.coach).split('(')[0].trim()) : ''); }   /* Admin: kèm coach phụ trách */
var SLOW_ICO=' <svg class="ic s13 slow"><use href="#t-trend"/></svg>';   /* khách tập chậm: icon chậm tiến độ (như ô trang chủ) thay chữ */
function renderClients(animate){
  var q=norm($('cl-q').value), el=$('cl-list'), f=state.clFilter||''; el.innerHTML=''; var i=0;
  var all=state.clients.filter(function(m){ return !q || norm(m.name).indexOf(q)>=0; });
  var slow=slowClients(), slowN={}; (slow||[]).forEach(function(c){ slowN[c.name]=1; });
  if(f==='slow') all=all.filter(function(m){ return slowN[m.name]; });
  if(f==='today') all=all.filter(function(m){ return m.checked || (ciFor(m.name)&&ciFor(m.name).status==='ok'); });
  var act=all.filter(function(m){ return m.left>0; }), done=all.filter(function(m){ return m.left<=0; });
  if(f==='today'){ act=all; done=[]; }   /* lọc "Khách hôm nay": khách vừa dùng hết gói vẫn thuộc nhóm hôm nay, không rơi sang "ĐÃ HẾT GÓI" */
  function sec(t, list, first){
    if(!list.length) return;
    var d=document.createElement('div'); d.className='lab sec'+(first?' first':''); d.textContent=t+' · '+list.length; el.appendChild(d);
    list.forEach(function(m){ el.appendChild(clientRow(m, animate, i++, clientMeta(m)+(slowN[m.name]?SLOW_ICO:''), function(){ var h=FX.heroPrep(this.querySelector('.nm'), firstName(m.name)); state.client=m; state.back='p-clients'; go('p-profile','fwd'); FX.heroFly(h, $('pf-name')); })); });
  }
  sec(f==='slow'?'KHÁCH TẬP CHẬM':f==='today'?'KHÁCH HÔM NAY':'KHÁCH ĐANG HOẠT ĐỘNG', act, true);
  sec('KHÁCH ĐÃ HẾT GÓI', done, !act.length);
  if(!all.length){ var e=document.createElement('div'); e.className='lab empty'; e.textContent=q?'KHÔNG TÌM THẤY TÊN NÀY':state.loading?'ĐANG TẢI DANH SÁCH…':f==='today'?'CHƯA CÓ KHÁCH HÔM NAY':f==='slow'?'KHÔNG CÓ KHÁCH TẬP CHẬM':'CHƯA CÓ KHÁCH'; el.appendChild(e); }
  state.clFilter=''; fogUpdate(el); if(!animate) mqInit(el);
}

/* =====================================================================
   SUB 2 — HỒ SƠ
   ===================================================================== */
HOOK['p-profile']=function(dir, quiet){
  var m=state.client; if(!m) return;
  $('pf-name').textContent=firstName(m.name);
  $('pf-done').innerHTML='Đã tập <span class="n">'+m.done+'</span>'; $('pf-left').innerHTML='Còn <span class="n">'+m.left+'</span> buổi';
  var mt=$('pf-meter'); mt.classList.remove('in'); mt.innerHTML='<i class="b" style="width:'+pct(m.done,m.total).toFixed(1)+'%"></i>';
  $('pf-pkg').textContent=m.total+' buổi'; $('pf-exp').textContent=m.exp?vn(m.exp):(m.end?vn(m.end):'—');
  if(!METRICS.some(function(x){return x.id===state.pfMetric})) state.pfMetric=m.main||'weight';
  renderProfileMetric();
  $('p-profile')._after=function(){ mt.classList.add('in'); if(!quiet){ countUp($('pf-done').querySelector('.n'), m.done, 700, 420); countUp($('pf-left').querySelector('.n'), m.left, 700, 480); } };
  if(!quiet) $('pf-scroll').scrollTop=0;
};
function renderProfileMetric(){
  var m=state.client, x=metric(state.pfMetric), h=H(m,x.id), cur=last(h), tg=m.target[x.id];
  var vl={weight:'Nặng',arm:'Bắp tay',waist:'Eo',hip:'Hông',chest:'Ngực',thigh:'Đùi'}[x.id];
  $('pf-mval').textContent= cur==null ? vl+' —' : vl+' '+fmtN(cur)+' '+x.unit.toLowerCase();
  $('pf-target').innerHTML=(tg!=null ? 'Mục tiêu '+fmtN(tg)+' '+x.unit.toLowerCase() : 'Đặt mục tiêu')+ico('i-pen');
  var tabs=$('pf-tabs'); tabs.innerHTML='';
  METRICS.forEach(function(y){ var b=document.createElement('button'); b.className=y.id===state.pfMetric?'on':''; b.innerHTML=ico(y.ic); b.setAttribute('aria-label',y.name); b.onclick=function(){ state.pfMetric=y.id; renderProfileMetric(); }; tabs.appendChild(b); });
}
function openTarget(){ state.tgMetric=state.pfMetric; go('p-target','fwd'); }

/* ---- SUB 3 — ĐO LƯỜNG (danh sách lần đo, chạm mở rộng) ---- */
HOOK['p-measure']=function(dir, quiet){ renderMeasureList(!quiet); };
function renderMeasureList(animate){
  var m=state.client, el=$('ms-list'), list=m.measures.slice().reverse(); el.innerHTML='';
  $('ms-count').textContent='LẦN ĐO · '+list.length; $('ms-count').hidden=!list.length;   /* rỗng: chỉ còn dòng CHƯA CÓ LẦN ĐO NÀO */
  list.forEach(function(ms,i){
    var b=document.createElement('button'); b.className='row r51'+(animate?' rowin':''); if(animate) b.style.animationDelay=Math.min(i*24,280)+'ms';
    b.innerHTML='<span class="lt"><span class="nm">'+vnLong(ms.d)+'</span></span>'+ico('i-chev','dn');
    var sub=document.createElement('div'); sub.className='xp';
    sub.innerHTML=METRICS.map(function(x){ var v=ms[x.id]; return '<div class="kv'+(v==null?' none':'')+'"><span>'+x.name+'</span><span class="v">'+(v==null?'—':fmtN(v)+'<i>'+x.unit+'</i>')+'</span></div>'; }).join('');
    b.onclick=function(){ var open=b.classList.toggle('open'); el.querySelectorAll('.row.open').forEach(function(r){ if(r!==b) r.classList.remove('open'); }); setTimeout(function(){ fogUpdate(el); },20); };
    el.appendChild(b); el.appendChild(sub);
  });
  if(!list.length){ var e=document.createElement('div'); e.className='lab empty'; e.textContent='CHƯA CÓ LẦN ĐO NÀO'; el.appendChild(e); }
  fogUpdate(el);
}

/* ---- SUB 3.2 — NHẬP SỐ ĐO MỚI ---- */
function openMeasure(){ state.msForm={}; state.msActive='weight'; go('p-measure-new','fwd'); }
HOOK['p-measure-new']=function(){
  renderMs(true);
  var pad=$('mn-pad'); pad.innerHTML='';
  ['1','2','3','4','5','6','7','8','9',',','0','⌫'].forEach(function(k,i){
    var b=document.createElement('button'); b.className='key keyin'+(k===','?' comma':k==='⌫'?' bks':''); b.style.animationDelay=(120+i*16)+'ms';
    if(k==='⌫') b.innerHTML=ico('i-bks'); else b.textContent=k;
    b.onclick=function(){ msKey(k); }; pad.appendChild(b);
  });
};
function renderMs(animate){
  var g=$('mn-grid'), m=state.client; g.innerHTML='';
  METRICS.forEach(function(x,i){
    var v=state.msForm[x.id], lastv=last(H(m,x.id)), b=document.createElement('button');
    b.className='mt'+(state.msActive===x.id?' on':'')+(animate?' rowin':''); if(animate) b.style.animationDelay=Math.min(i*24,200)+'ms';
    b.innerHTML='<div class="h"><span>'+x.name+'</span>'+ico(x.ic)+'</div><div class="v'+(v?'':' none')+'"><span>'+(v||(lastv!=null?fmtN(lastv):'—'))+'</span><i>'+x.unit+'</i></div>';
    b.onclick=function(){ state.msActive=x.id; renderMs(false); };
    g.appendChild(b);
  });
}
function msKey(k){
  var id=state.msActive, v=state.msForm[id]||'';
  if(k==='⌫') v=v.slice(0,-1);
  else if(k===','){ if(v && v.indexOf(',')<0) v+=','; }
  else { if(v.indexOf(',')>=0 && v.split(',')[1].length>=1) return; if(v.indexOf(',')<0 && v.length>=3) return; v+=k; }
  state.msForm[id]=v; renderMs(false);
}
function clearMeasure(){ state.msForm={}; renderMs(false); }
function saveMeasure(){
  var m=state.client, n=0, today=last(m.measures);
  if(!today || today.d!==TODAY_ISO){ today={d:TODAY_ISO}; m.measures.push(today); }
  METRICS.forEach(function(x){ var v=state.msForm[x.id]; if(!v) return; var num=parseFloat(v.replace(',','.')); if(isNaN(num)) return; today[x.id]=num; n++; enqueue({type:'ĐO', name:m.name, metric:x.id, val:num, session:sessionNoFor(m.name)}); });
  if(!n){ if(Object.keys(today).length===1) m.measures.pop(); notify('Chưa nhập số đo nào', {err:true}); return; }
  flush(); go('p-measure','back'); notify('Đã lưu số đo');
}
function sessionNoFor(name){ var s=state.session; if(!s) return null; var p=s.people.filter(function(p){return p.name===name})[0]; return p?p.no:null; }

/* ---- SUB 4 — ĐẶT MỤC TIÊU ---- */
var tgWheel=null;
HOOK['p-target']=function(){
  var m=state.client, tabs=$('tg-tabs'); tabs.innerHTML='';
  METRICS.forEach(function(x){ var b=document.createElement('button'); b.textContent=x.name; b.className=x.id===state.tgMetric?'on':''; b.onclick=function(){ state.tgMetric=x.id; HOOK['p-target'](); }; tabs.appendChild(b); });
  var on=tabs.querySelector('.on'); if(on) tabs.scrollTo({left:Math.max(0,on.offsetLeft-24), behavior:'smooth'});
  var x=metric(state.tgMetric), vals=range(0,x.max,x.step);
  var v=m.target[x.id]!=null ? m.target[x.id] : (last(H(m,x.id))!=null ? last(H(m,x.id)) : x.def);
  state.tgVal=v; $('tg-hint').textContent=upper(x.name)+' · '+x.unit;
  if(!tgWheel) tgWheel=Wheel($('tg-wheel'), {values:vals, index:0, format:fmtN, row:80, z:283, boxH:126, ghost:.26, onPick:function(val){ state.tgVal=val; }, dim:function(on){ $('p-target').querySelectorAll('.dimable').forEach(function(el){ el.classList.toggle('dimx', on); }); }});
  else tgWheel.setValues(vals);
  tgWheel.set(v);
};
function saveTarget(){
  var m=state.client, x=metric(state.tgMetric);
  m.main=x.id; m.target[x.id]=state.tgVal; state.pfMetric=x.id;
  enqueue({type:'MỤC TIÊU', name:m.name, metric:x.id, val:state.tgVal, session:sessionNoFor(m.name)}); flush();
  go('p-profile','back'); notify('Đã đặt mục tiêu');
}

/* ---- SUB 5 — HIỆU SUẤT TẬP (lịch sử set theo bài) ---- */
HOOK['p-perf']=function(dir, quiet){ if(!quiet) $('pe-q').value=''; renderPerf(!quiet); };
function perfHist(m){
  var h={}, srv=state.stats && state.stats.hist && state.stats.hist[m.name];
  if(srv) Object.keys(srv).forEach(function(ex){ h[ex]=(srv[ex]||[]).slice(); });
  Object.keys(m.last||{}).forEach(function(ex){ var l=m.last[ex]; if(!h[ex]) h[ex]=[]; if(!h[ex].some(function(r){ return r.d===l.d && r.kg===l.kg && r.rep===l.rep; })) h[ex].push({d:l.d,kg:l.kg,rep:l.rep,ok:1}); });
  var s=state.session; if(s) s.people.forEach(function(p){ if(p.name!==m.name) return; Object.keys(p.ex).forEach(function(ex){ (p.ex[ex].sets||[]).forEach(function(st){ if(!h[ex]) h[ex]=[]; h[ex].push({d:TODAY_ISO,kg:st[0],rep:st[1],ok:st[2],live:1}); }); }); });
  OUT.q.forEach(function(e){ if(e.type==='SET' && e.name===m.name){ if(!h[e.ex]) h[e.ex]=[]; if(!h[e.ex].some(function(r){return r.live && r.kg===e.kg && r.rep===e.rep})) h[e.ex].push({d:e.date,kg:e.kg,rep:e.rep,ok:e.ok}); } });
  Object.keys(h).forEach(function(ex){ h[ex].sort(function(a,b){ return a.d<b.d?1:a.d>b.d?-1:0; }); });
  return h;
}
/* Hiệu suất tập (v2.6.2): mỗi ngày chỉ MỘT dòng = set cao nhất của bài trong ngày đó (khớp Figma 493:2335).
   Set cao nhất = set Đạt có mức tạ lớn nhất, bằng tạ thì nhiều rep hơn; ngày không có set Đạt nào → set nặng nhất, tô đỏ (.er). */
function perfBetter(a, b){ return (a.kg-b.kg) || (a.rep-b.rep); }
function perfDays(rows){
  var by={}, out=[];
  (rows||[]).forEach(function(r){ if(!r || !r.d) return; var k=String(r.d).slice(0,10), cur=by[k];
    var c={d:k, kg:+r.kg||0, rep:+r.rep||0, ok:r.ok?1:0};
    if(!cur || (c.ok && !cur.ok) || (c.ok===cur.ok && perfBetter(c, cur)>0)) by[k]=c; });
  Object.keys(by).forEach(function(k){ out.push(by[k]); });
  return out.sort(function(a,b){ return a.d<b.d?1:a.d>b.d?-1:0; });
}
function perfRowsHtml(rows){ return perfDays(rows).slice(0,12).map(function(r){ return '<div class="kv"><span>'+vnLong(r.d)+'</span><span class="v'+(r.ok?'':' er')+'">'+r.rep+' × '+fmtN(r.kg)+'<i>KG</i></span></div>'; }).join(''); }
function renderPerf(animate){
  var m=state.client, q=norm($('pe-q').value), el=$('pe-list'), hist=perfHist(m); el.innerHTML=''; var i=0, any=false;
  var hasData=Object.keys(hist).some(function(ex){ return (hist[ex]||[]).length; });
  $('pe-q').closest('.search').hidden=!hasData;   /* chưa có dữ liệu: không có ô tìm, chỉ còn dòng CHƯA CÓ DỮ LIỆU NÀO */
  libGroups().forEach(function(g){
    /* chỉ bài đã có dữ liệu set */
    var items=g.items.filter(function(e){ return (hist[e.name]||[]).length && (!q || norm(e.name).indexOf(q)>=0 || norm(exShort(e.name)).indexOf(q)>=0); }); if(!items.length) return; any=true;
    var d=document.createElement('div'); d.className='lab sec'; d.textContent=upper(g.name)+' · '+items.length; el.appendChild(d);
    items.forEach(function(e){
      var rows=hist[e.name]||[], b=document.createElement('button'); b.className='row r51'+(animate?' rowin':''); if(animate) b.style.animationDelay=Math.min(i++*20,240)+'ms';
      b.innerHTML='<span class="lt"><span class="nm mq"><span>'+esc(exShort(e.name))+'</span></span></span>'+ico('i-chev','dn');
      var sub=document.createElement('div'); sub.className='xp';
      sub.innerHTML=perfRowsHtml(rows);
      b.onclick=function(){ b.classList.toggle('open'); setTimeout(function(){ fogUpdate(el); },20); };
      el.appendChild(b); el.appendChild(sub);
    });
  });
  Object.keys(hist).forEach(function(ex){ if(libEntries().some(function(e){return e.name===ex})) return; if(q && norm(ex).indexOf(q)<0) return; any=true;
    var b=document.createElement('button'); b.className='row'; b.innerHTML='<span class="lt"><span class="nm mq"><span>'+esc(exShort(ex))+'</span></span><span class="lab">BÀI CŨ</span></span>'+ico('i-chev','dn');
    var sub=document.createElement('div'); sub.className='xp'; sub.innerHTML=perfRowsHtml(hist[ex]);
    b.onclick=function(){ b.classList.toggle('open'); setTimeout(function(){ fogUpdate(el); },20); }; el.appendChild(b); el.appendChild(sub); });
  if(!any){ var e=document.createElement('div'); e.className='lab empty'; e.textContent=q?'KHÔNG TÌM THẤY BÀI NÀY':'CHƯA CÓ DỮ LIỆU NÀO'; el.appendChild(e); }
  fogUpdate(el); if(!animate) mqInit(el);
}

/* =====================================================================
   2 — CHỌN KHÁCH (1 hoặc 2 khách một buổi)
   ===================================================================== */
HOOK['p-pick']=function(dir, quiet){ if(!quiet) $('pk-q').value=''; renderPick(!quiet); };
function doneToday(m){
  if(state.session && state.session.people.some(function(p){ return p.name===m.name; })) return null;
  var s=loadSession(); if(s && s.people.some(function(p){ return p.name===m.name; })) return null;
  var ci=ciFor(m.name); if(ci && ci.status==='ok') return ci.at||m.signed||'';
  if(m.checked) return m.signed||'';
  return null;
}
/* gói 1:2 (2 khách/buổi) — chỉ khách này mới được ghép; backend chưa gửi kind thì coi là 1:1 */
function isDuo(m){ return /1\s*[:\-–]\s*2|đôi|duo|cặp/i.test(String(m&&m.kind||'')); }
function pickMeta(m, at){ return at!=null ? 'ĐÃ TẬP HÔM NAY · '+(at||'—') : clientMeta(m); }
/* chip tên khách 1:2 đã chọn — vào/ra bằng transition (ngắt được), xoá sau khi mờ hết */
function pickChip(n){
  var c=document.createElement('button'); c.className='chip pre'; c.setAttribute('data-name', n);
  c.innerHTML='<span>'+esc(firstName(n))+'</span>'+ico('i-x'); c.onclick=function(){ togglePick(n); }; return c;
}
function pickChipsSync(){
  var chips=$('pk-chips'), wrap=$('pk-chipw'), go=$('pk-go'), keep={};
  state.sel.forEach(function(n){ keep[n]=1; var c=chips.querySelector('.chip[data-name="'+n.replace(/"/g,'\\"')+'"]');
    if(c){ if(c._t){ clearTimeout(c._t); c._t=null; } c.classList.remove('out','pre'); return; }
    c=pickChip(n); chips.appendChild(c); c.offsetWidth; c.classList.remove('pre'); });
  [].slice.call(chips.querySelectorAll('.chip')).forEach(function(c){ var n=c.getAttribute('data-name'); if(keep[n] || c._t) return;
    c.classList.add('out'); c._t=setTimeout(function(){ if(c.parentNode) c.parentNode.removeChild(c); }, 170); });
  wrap.classList.toggle('on', !!state.sel.length);
  go.classList.toggle('away', !state.sel.length); go.textContent='Xác nhận · 1:'+(state.sel.length>1?'2':'1');
  clearTimeout(pickChipsSync._f); pickChipsSync._f=setTimeout(function(){ fogUpdate($('pk-list')); }, 280);
}
/* đổi icon của một dòng bằng crossfade nhỏ (cũ mờ + co .8 ra, mới vào .18s) — không rebuild danh sách */
function pickIcon(b, name, cls){
  var w=b.querySelector('.icw'), old=w.querySelector('.ic:not(.icout)'); if(old && old.getAttribute('data-i')===name) return;
  var d=document.createElement('span'); d.innerHTML=ico(name, cls+' icin'); var nu=d.firstChild; nu.setAttribute('data-i', name);
  [].slice.call(w.querySelectorAll('.ic')).forEach(function(o){ o.classList.add('icout'); setTimeout(function(){ if(o.parentNode) o.parentNode.removeChild(o); }, 190); });
  w.appendChild(nu); nu.offsetWidth; nu.classList.remove('icin');
}
function pickRow(m, animate, i){
  var at=doneToday(m), duo=isDuo(m), sel=duo && state.sel.indexOf(m.name)>=0, b;
  if(at!=null) b=clientRow(m, animate, i, pickMeta(m, at), null, false);
  else if(duo) b=clientRow(m, animate, i, clientMeta(m), function(){ togglePick(m.name); }, sel?'i-check':'i-plus', sel?'acid':'paper');
  else b=clientRow(m, animate, i, clientMeta(m), function(){ var h=FX.heroPrep(this.querySelector('.nm'), firstName(m.name)); state.sel=[m.name]; if(navigator.vibrate) navigator.vibrate(6); go('p-confirm','fwd'); FX.heroFly(h, $('cf-body').querySelector('.head .t1')); }, 'i-arr');
  var ic=b.querySelector('.ic'); if(ic){ var w=document.createElement('span'); w.className='icw'; ic.setAttribute('data-i', ic.querySelector('use').getAttribute('href').slice(1)); b.replaceChild(w, ic); w.appendChild(ic); }
  b.setAttribute('data-name', m.name); if(duo) b.classList.add('duo'); if(sel) b.classList.add('sel'); if(at!=null) b.classList.add('off');
  return b;
}
function renderPick(animate){
  var q=norm($('pk-q').value), el=$('pk-list'); el.innerHTML='';
  /* chỉ khách 1:2 còn buổi, chưa tập hôm nay mới giữ được chip (1:1 đi thẳng màn xác nhận, quay lại thì bỏ chọn) */
  state.sel=state.sel.filter(function(n){ var m=findClient(n); return m && m.left>0 && isDuo(m) && doneToday(m)==null; });
  var all=state.clients.filter(function(m){ return m.left>0 && (!q || norm(m.name).indexOf(q)>=0); }), i=0;
  var done=all.filter(function(m){ return doneToday(m)!=null; }), ready=all.filter(function(m){ return doneToday(m)==null; });
  var solo=ready.filter(function(m){ return !isDuo(m); }), duo=ready.filter(isDuo);
  function sec(t, list){
    if(!list.length) return;
    var d=document.createElement('div'); d.className='lab sec'; d.textContent=t+' · '+list.length; el.appendChild(d);
    list.forEach(function(m){ el.appendChild(pickRow(m, animate, i++)); });
  }
  sec('KHÁCH 1:1 SẴN SÀNG TẬP', solo); sec('KHÁCH 1:2 SẴN SÀNG TẬP', duo); sec('KHÁCH ĐÃ TẬP HÔM NAY', done);
  if(!all.length){ var e=document.createElement('div'); e.className='lab empty'; e.textContent=q?'KHÔNG TÌM THẤY TÊN NÀY':'CHƯA CÓ KHÁCH'; el.appendChild(e); }
  pickChipsSync();
  fogUpdate(el); if(!animate) mqInit(el);
}
function togglePick(name){
  var k=state.sel.indexOf(name), m=findClient(name);
  if(k>=0) state.sel.splice(k,1);
  else { if(!m || !isDuo(m)) return; if(state.sel.length>=2){ notify('Tối đa 2 khách', {err:true}); return; } state.sel.push(name); if(navigator.vibrate) navigator.vibrate(6); }
  /* cập nhật đúng dòng + chip, không dựng lại danh sách */
  var el=$('pk-list'); [].slice.call(el.querySelectorAll('.row.duo')).forEach(function(b){
    var on=state.sel.indexOf(b.getAttribute('data-name'))>=0; if(on===b.classList.contains('sel')) return;
    b.classList.toggle('sel', on); pickIcon(b, on?'i-check':'i-plus', on?'acid':'paper');
  });
  pickChipsSync();
}

/* =====================================================================
   3 — XÁC NHẬN · CHECK-IN
   ===================================================================== */
function personNo(m){
  var s=state.session||loadSession(); if(s){ var p=s.people.filter(function(p){return p.name===m.name})[0]; if(p) return p.no; }
  var ci=ciFor(m.name); if(ci && ci.no) return ci.no;
  return m.done+1;
}
function lastSessionDay(m){
  var p=statsFor(m.name), d=(p&&p.last)||'';
  Object.keys(m.last||{}).forEach(function(ex){ var l=m.last[ex]; if(l && l.d && l.d>d && l.d!==TODAY_ISO) d=l.d; });
  return d;
}
/* THẺ SỐ BUỔI: vệt Paper (--x = % đã tập) + vệt Acid (--y = 1 buổi, hôm nay) chạy từ trái khi thẻ có class "in".
   Chữ 3 lớp chồng khít: lớp dưới = màu ngoài vệt (Paper/Gray); lớp .top.b cắt đúng vệt Paper, lớp .top.a cắt đúng vệt Acid = màu Ink
   (clip-path chạy cùng nhịp/độ trễ với vệt → mép màu chữ luôn trùng mép vệt). Thẻ done: chỉ vệt Acid toàn phần + .top.b. */
function cardHtml(m, no, cls, done){
  var doneP=pct(done?no:no-1,m.total), addP=done?0:(m.total>0?100/m.total:0), x=doneP.toFixed(2)+'%', y=addP.toFixed(2)+'%';
  var txt='<div class="n">'+no+'</div><div class="of">/ '+m.total+'</div>';
  return '<div class="card '+cls+(done?' done':'')+'" style="--x:'+x+';--y:'+y+'"><i class="fill b" style="width:'+x+'"></i>'+(done?'':'<i class="fill a" style="width:'+y+';left:'+x+'"></i>')
        +txt+'<div class="top b">'+txt+'</div>'+(done?'':'<div class="top a">'+txt+'</div>')+'</div>';
}
/* vào màn: chạy vệt + đếm số (mọi lớp chữ cùng một nhịp, không sửa countUp gốc) */
function cardsIn(body){ body.querySelectorAll('.card').forEach(function(c){ c.classList.add('in'); var ns=c.querySelectorAll('.n'); countUpAll(ns, +ns[0].textContent, 700, 420); }); }
/* dựng lại lúc màn đang hiển thị (làm mới nền / check-in xong): hiện thẳng trạng thái cuối, không chạy lại */
function cardsStill(body){ body.querySelectorAll('.card').forEach(function(c){ c.classList.add('still'); c.classList.add('in'); }); Array.prototype.forEach.call(body.children, function(w){ w.classList.add('still'); }); }
function countUpAll(els, to, dur, delay){
  var set=function(v){ els.forEach(function(e){ e.textContent=String(v); }); };
  if(rm()){ set(to); return; }
  set(0);
  setTimeout(function(){ var t0=performance.now(); (function f(t){ var p=Math.min(1,(t-t0)/dur); p=1-Math.pow(1-p,3); set(Math.round(to*p)); if(p<1) requestAnimationFrame(f); })(t0); }, delay||0);
}
HOOK['p-confirm']=function(dir, quiet){
  var names=state.sel.length?state.sel:(state.session?state.session.people.map(function(p){return p.name}):[]);
  var body=$('cf-body'), pg=$('p-confirm'), two=names.length>1, anyDone=false, ss=loadSession(), html='';
  names.forEach(function(n){
    var m=findClient(n); if(!m) return; var at=doneToday(m), no=personNo(m), resumed=!!(ss && ss.people.some(function(p){return p.name===n}));
    if(at!=null) anyDone=true;
    var lines= at!=null
      ? '<div class="a ac">Buổi thứ '+no+' đã xong</div><div class="a">Còn '+m.left+' buổi</div><div class="lab">ĐÃ KÝ LÚC <span class="ac">'+(at||'—')+'</span> · '+vnFull(TODAY_ISO)+'</div>'
      : '<div class="a">'+(resumed?'Đang ghi buổi '+no:'Buổi thứ '+no)+'</div><div class="b">Đã tập '+m.done+', còn '+m.left+' buổi</div>'+(two?'':'<div class="lab">'+(lastSessionDay(m)?'BUỔI TẬP GẦN NHẤT · '+vnFull(lastSessionDay(m)):'CHƯA CÓ BUỔI NÀO')+'</div>');
    html+='<div'+(two?' class="half"':'')+'><div class="head"><span class="t1 mq"><span>'+esc(firstName(m.name))+'</span></span></div>'+cardHtml(m, no, two?'sm':'big', at!=null)+'<div class="lines'+(two?' sm':'')+'">'+lines+'</div></div>';
  });
  /* dựng lại nền lúc màn đang hiển thị (refreshData/refreshStats): dữ liệu không đổi → giữ nguyên DOM (không chớp);
     đổi → dựng lại nhưng hiện thẳng trạng thái cuối (vệt giữ nguyên, số không đếm lại). Lần vào màn (go) → chạy vệt + đếm như cũ. */
  var live=!!quiet && state.screen==='p-confirm' && !pg._after;
  if(!(live && body._sig===html)){ body.innerHTML=html; body._sig=html; if(live) cardsStill(body); }
  body.className='body'+(two?' halves':' st');
  var btn=$('cf-go'), back=$('cf-back');
  if(anyDone && !two){ btn.textContent='Về trang chủ'; btn.className='cta paper'; btn.onclick=function(){ state.sel=[]; go('p-home','back'); }; back.hidden=true; }
  else { btn.textContent= ss ? 'Tiếp tục buổi tập' : (two?'Check-in 2 khách':'Check-in'); btn.className='cta'+(anyDone?' off':''); btn.onclick=doCheckin; back.hidden=false; }
  if(!live) pg._after=function(){ cardsIn(body); };
  if(!state.loading && Date.now()-state.dataTs>30000) refreshData(true);
};
/* CHECK-IN LẠC QUAN: sang "Bài tập hôm nay" NGAY, lệnh check-in chạy nền từng khách, báo trên đảo. */
/* CHECK-IN CHẶN: bấm Check-in → pill "Đang check-in" → mọi khách phải OK mới sang "Bài tập hôm nay".
   Thất bại (sai phòng, máy chủ, không phải khách của coach) → ở lại màn xác nhận, pill lỗi có "Thử lại" (một lần mỗi lần bấm, không tự thử lại). */
function doCheckin(){
  var ss=loadSession();
  if(ss){ state.session=ss; go(ss.started&&ss.plan.length?'p-loop':'p-plan','fwd'); return; }
  var names=state.sel.slice(); if(!names.length || state.ciBusy) return;
  var todo=names.filter(function(n){ var ci=ciFor(n); return !(ci && ci.status==='ok'); });
  if(!todo.length){ startSession(names); return; }
  state.ciBusy=true; var btn=$('cf-go'); btn.classList.add('off'); notify('Đang check-in', {spin:true, ms:40000});
  Promise.all(todo.map(function(n){ return sendCheckin(findClient(n), todo.length>1); })).then(function(rs){
    state.ciBusy=false; btn.classList.remove('off');
    if(rs.every(Boolean) && state.screen==='p-confirm') startSession(names);
  });
}
function startSession(names){
  var people=names.map(function(n){ var m=findClient(n); var no=personNo(m); return {name:n, no:no, cur:0, setNo:1, phase:'setup', reps:10, kg:20, restTotal:90, restStart:0, ex:{}, form:0, note:'', okDone:false}; });
  state.session={day:TODAY_ISO, coach:state.coach, kind:names.length>1?'1:2':'1:1', people:people, plan:[], started:0, startedAt:0};
  saveSession(); state.sel=[];
  go('p-plan','fwd');
}
/* một lượt check-in cho một khách → Promise<true|false>; many = đang check-in 2 khách (pill ghi tên) */
function sendCheckin(m, many){
  var prev=ciFor(m.name), day=TODAY_ISO, localNo=(prev&&prev.no)||personNo(m);
  if(prev && prev.status==='ok') return Promise.resolve(true);
  CI[m.name]={name:m.name, day:day, no:localNo, status:'pending'}; ciSave();
  busyLine(true);
  var live=function(){ return findClient(m.name)||m; };
  return api({action:'checkin_coach', name:m.name, date:day}, 0, 600, 0, 30000).then(function(res){
    busyLine(false); m=live(); var ci=ciFor(m.name); if(!ci) return false;
    var err=res&&res.error;
    if(res && res.ok){
      if(res.member){ var sd=+res.member.done||0; m.total=+res.member.total||m.total; m.done=Math.max(sd, m.done+1); m.left=(sd>=m.done && res.member.left!=null)?+res.member.left:Math.max(0,m.total-m.done); }
      else { m.done+=1; m.left=Math.max(0,m.total-m.done); }
      ciOk(m, ci, m.done, res.at, many);
      var c=loadCache(state.coach); if(c){ var mm=(c.res.members||[]).filter(function(x){return x.name===m.name})[0]; if(mm){ mm.done=m.done; mm.left=m.left; mm.checked=true; mm.signed=ci.at; saveCache(c.res); } }
      return true;
    }
    if(err==='da_checkin'){ ciOk(m, ci, ci.no, res.at||m.signed||'', many); return true; }
    if(err==='sai_pin'){ delete CI[m.name]; ciSave(); pinGone(); return false; }
    ciFail(m, ci, err==='wrong_ip' ? 'Chỉ check-in được ở phòng' : err==='khong_phai_khach_cua_ban' ? 'Không phải khách của bạn' : err==='khong_thay_khach' ? 'Không thấy khách trong MEMBERS' : 'Chưa check-in', many);
    return false;
  }).catch(function(){ busyLine(false); m=live(); var ci=ciFor(m.name); if(ci) ciFail(m, ci, 'Chưa check-in', many); return false; });
}
function ciOk(m, ci, no, at, many){
  var old=ci.no; ci.no=no; ci.status='ok'; ci.at=at||ci.at||nowHM(); ci.t=Date.now(); ciSave();
  m.checked=true; if(!m.signed) m.signed=ci.at;
  var s=state.session; if(s){ s.people.forEach(function(p){ if(p.name===m.name && p.no!==no){ p.no=no; } }); saveSession(); }
  if(old!==no){ var ch=false; OUT.q.forEach(function(e){ if(e.name===m.name && e.date===ci.day && e.session===old){ e.session=no; ch=true; } }); if(ch) outSave(); }
  if(state.screen!=='p-pin') notify('Đã check-in'+(many?' '+firstName(m.name):''));
  if(state.screen==='p-done') HOOK['p-done']();
}
function ciFail(m, ci, text, many){
  ci.status='fail'; ciSave();
  notify(text+(many?' · '+firstName(m.name):''), {err:true, action:{label:'Thử lại', fn:function(){ if(state.screen==='p-confirm') doCheckin(); }}});
}

/* =====================================================================
   4 — BÀI TẬP HÔM NAY (lưới kéo thả) + WINDOW THƯ VIỆN
   ===================================================================== */
HOOK['p-plan']=function(dir, quiet){ renderPlan(!quiet); if(!quiet && !state.session.plan.length) setTimeout(openLib, 380); };
function planCounts(name){ var s=state.session, n=0; s.people.forEach(function(p){ var e=p.ex[name]; if(e) n=Math.max(n, e.sets.length); }); return n; }
function renderPlan(animate){
  var s=state.session, g=$('pl-grid'); g.innerHTML='';
  s.plan.forEach(function(n,i){
    var t=document.createElement('div'); t.className='ptile'+(animate?' rowin':''); if(animate) t.style.animationDelay=Math.min(i*30,240)+'ms'; t.dataset.i=i;
    var sets=planCounts(n);
    t.innerHTML='<div><div class="no">'+pad2(i+1)+'</div><div class="nm">'+esc(exShort(n))+'</div></div><div class="ft"><span class="lab">'+esc(upper(exGroup(n)))+(sets?' · '+sets+' SET':'')+'</span>'+ico('i-drag')+'</div>';
    dragify(t); g.appendChild(t);
  });
  var add=document.createElement('button'); add.className='ptile add'+(animate?' rowin':''); if(animate) add.style.animationDelay=Math.min(s.plan.length*30,240)+'ms';
  add.innerHTML='<div class="no">'+pad2(s.plan.length+1)+'</div><div class="nm">Thêm bài'+ico('i-plus')+'</div>'; add.onclick=openLib; g.appendChild(add);
  var go=$('pl-go'); go.textContent=s.plan.length?'Bắt đầu · '+s.plan.length+' bài':'Bắt đầu'; go.classList.toggle('off', !s.plan.length);
}
/* kéo thả (chuẩn iOS reorder): giữ ~220ms để nhấc (ngón đã di >6px thì thôi — để cuộn lưới bình thường).
   Thẻ nhấc = bản sao bay theo ngón bằng transform (lerp mềm, hơi nghiêng theo hướng đi); thẻ gốc thành chỗ trống trong suốt
   và DI CHUYỂN TRONG DOM khi tâm thẻ bay vượt nửa thẻ khác → các thẻ còn lại TRƯỢT (FLIP) sang chỗ mới.
   Thả → bay về đúng ô rồi mới hiện lại thẻ gốc; KHÔNG dựng lại lưới (chỉ cập nhật state + đánh lại số).
   Kéo vào vùng đỏ để xoá (bài đã ghi set thì khoá, thả sẽ bay về). Huỷ (pointercancel) = trả về chỗ cũ. */
var DRAG=null;
/* các thẻ bài theo thứ tự lưới (bỏ ô Thêm bài; bản sao đang bay nằm trong khung .gdrag nên không lọt vào đây) */
function planTiles(){ return Array.prototype.filter.call($('pl-grid').children, function(c){ return c.classList.contains('ptile') && !c.classList.contains('add'); }); }
/* đánh lại số thứ tự + data-i tại chỗ (không dựng lại DOM) */
function planRenumber(){ var ts=planTiles(); ts.forEach(function(c,k){ c.dataset.i=k; var no=c.querySelector('.no'); if(no) no.textContent=pad2(k+1); }); var a=$('pl-grid').querySelector('.ptile.add .no'); if(a) a.textContent=pad2(ts.length+1); }
/* FLIP: đo vị trí đang thấy → đổi DOM → đo vị trí mới → áp transform ngược (không transition) → trượt về 0 (.26s, ngắt được) */
function flip(els, mutate){
  var first=els.map(function(el){ return el.getBoundingClientRect(); });
  mutate();
  els.forEach(function(el){ el.style.transition='none'; el.style.transform=''; });
  var last=els.map(function(el){ return el.getBoundingClientRect(); }), any=false;
  els.forEach(function(el,i){ var dx=first[i].left-last[i].left, dy=first[i].top-last[i].top; if(Math.abs(dx)<.5 && Math.abs(dy)<.5){ el.style.transition=''; return; } any=true; el.style.transform='translate3d('+dx+'px,'+dy+'px,0)'; });
  if(any){ var reflow=$('pl-grid').offsetWidth; els.forEach(function(el){ el.style.transition=''; el.style.transform=''; }); }
}
function buzz(ms){ if(navigator.vibrate){ try{ navigator.vibrate(ms); }catch(_){} } }
function dragify(t){
  /* chặn cuộn CHỈ khi đã nhấc (touchmove không passive ngay trên thẻ — trình duyệt mới chịu preventDefault) */
  t.addEventListener('touchmove', function(ev){ if(DRAG && DRAG.t===t && !DRAG.done && ev.cancelable) ev.preventDefault(); }, {passive:false});
  t.addEventListener('pointerdown', function(e){
    if(e.button>0 || t.classList.contains('ph')) return;
    if(DRAG){ if(DRAG.done && DRAG.finish) DRAG.finish(); else return; }   /* đang bay về → chốt ngay, cho nhấc tiếp (ngắt được) */
    var x0=e.clientX, y0=e.clientY, pid=e.pointerId, moved=false, timer=setTimeout(function(){ if(!moved) lift(e); }, 220);
    function mv(ev){
      if(ev.pointerId!==pid) return;
      if(!DRAG || DRAG.t!==t){ if(Math.abs(ev.clientX-x0)>6 || Math.abs(ev.clientY-y0)>6){ moved=true; clearTimeout(timer); } return; }
      if(ev.cancelable) ev.preventDefault(); move(ev);
    }
    function up(ev){ if(ev && ev.pointerId!==pid) return; clearTimeout(timer); unbind(); if(DRAG && DRAG.t===t && !DRAG.done) drop(ev && ev.type==='pointercancel'); }
    function unbind(){ document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); document.removeEventListener('pointercancel',up); }
    document.addEventListener('pointermove',mv,{passive:false}); document.addEventListener('pointerup',up); document.addEventListener('pointercancel',up);

    function lift(ev){
      var g=t.parentNode, name=state.session.plan[+t.dataset.i]; if(!g) return;
      Array.prototype.forEach.call(g.children, function(c){ c.classList.remove('rowin'); c.style.animationDelay=''; });
      var r=t.getBoundingClientRect(), slots=planTiles().map(function(c){ return c.getBoundingClientRect(); });
      /* bản sao bay: khung .gdrag (fixed trên body, translate mỗi frame) bọc thẻ .lift (scale/bóng có transition riêng) */
      var w=document.createElement('div'); w.className='gdrag'; w.style.left=r.left+'px'; w.style.top=r.top+'px'; w.style.width=r.width+'px'; w.style.height=r.height+'px';
      var c=t.cloneNode(true); c.className='ptile lift'; c.removeAttribute('data-i'); c.removeAttribute('style'); w.appendChild(c); document.body.appendChild(w);   /* gắn vào body: #pl-scroll có mask (fog) nên thẻ bay trong lưới sẽ bị mờ mép + nằm dưới vùng xoá */
      t.classList.add('ph'); g.classList.add('dragging'); t.style.touchAction='none';
      DRAG={t:t, w:w, c:c, g:g, name:name, from:+t.dataset.i, rm:rm(), pid:pid, ox:ev.clientX-r.left, oy:ev.clientY-r.top,
            x0:r.left, y0:r.top, x:r.left, y:r.top, tx:r.left, ty:r.top, rot:0, wd:r.width, ht:r.height,
            slots:slots, sc:$('pl-scroll').scrollTop, del:false, lock:planCounts(name)>0, done:false, raf:0, finish:null};
      try{ t.setPointerCapture(pid); }catch(_){}
      var dz=$('pl-drop'); dz.textContent='Thả vào đây để xoá'; dz.classList.remove('hot','lock'); dz.classList.add('show');
      buzz(8);
      requestAnimationFrame(function(){ if(DRAG && DRAG.c===c) c.classList.add('up'); tick(); });
    }
    /* mỗi frame: lerp .35 về vị trí ngón (nặng tự nhiên), nghiêng ≤2° theo vận tốc ngang, rồi xét đổi chỗ */
    function tick(){
      var d=DRAG; if(!d || d.done) return;
      var k=d.rm?1:.35, nx=d.x+(d.tx-d.x)*k, ny=d.y+(d.ty-d.y)*k, vx=nx-d.x; d.x=nx; d.y=ny;
      var want=d.rm?0:Math.max(-2, Math.min(2, vx*.16)); d.rot+=(want-d.rot)*.3;
      d.w.style.transform='translate3d('+(nx-d.x0).toFixed(2)+'px,'+(ny-d.y0).toFixed(2)+'px,0) rotate('+d.rot.toFixed(2)+'deg)';
      if(!d.del) reorder(nx+d.wd/2, ny+d.ht/2);
      d.raf=requestAnimationFrame(tick);
    }
    function move(ev){
      var d=DRAG; d.tx=ev.clientX-d.ox; d.ty=ev.clientY-d.oy;
      var dz=$('pl-drop'), zr=dz.getBoundingClientRect(), inz=ev.clientY>=zr.top-8 && ev.clientY<=zr.bottom+16;
      if(inz!==d.del){
        d.del=inz;
        if(inz && d.lock){ dz.textContent='Bài đã có set'; dz.classList.add('lock'); }
        else if(inz){ dz.textContent='Thả để xoá '+exShort(d.name); dz.classList.add('hot'); d.c.classList.add('del'); buzz(12); }
        else { dz.textContent='Thả vào đây để xoá'; dz.classList.remove('hot','lock'); d.c.classList.remove('del'); }
      }
    }
    /* tâm thẻ bay (cx,cy) vượt qua nửa ô của thẻ khác (tính từ mép gần ô hiện tại; ngưỡng 40% để thả đúng tâm vẫn ăn)
       → thẻ gốc đổi chỗ trong DOM, các thẻ khác trượt (FLIP). Ô đã đổi chỗ thì phải đi ngược 40% mới đổi lại (không rung) */
    function reorder(cx, cy){
      var d=DRAG, tiles=planTiles(), cur=tiles.indexOf(d.t), n=tiles.length, sy=d.sc-$('pl-scroll').scrollTop, best=-1;
      if(cur<0) return;
      for(var j=0;j<n;j++){
        if(j===cur) continue; var r=d.slots[j], top=r.top+sy, bot=r.bottom+sy;
        if(cx<r.left || cx>r.right || cy<top || cy>bot) continue;
        var sameRow=Math.abs(r.top-d.slots[cur].top)<1, f=sameRow ? (j>cur ? (cx-r.left)/r.width : (r.right-cx)/r.width) : (j>cur ? (cy-top)/r.height : (bot-cy)/r.height);
        if(f>=.4){ best=j; break; }
      }
      if(best<0) return;
      var others=tiles.filter(function(c){ return c!==d.t; }), ref=best>cur ? tiles[best].nextSibling : tiles[best];
      flip(others, function(){ d.g.insertBefore(d.t, ref); });
    }
    function drop(cancel){
      var d=DRAG, s=state.session; if(!d || d.done) return; d.done=true; cancelAnimationFrame(d.raf);
      try{ t.releasePointerCapture(d.pid); }catch(_){}
      t.style.touchAction=''; d.g.classList.remove('dragging'); $('pl-drop').classList.remove('show','hot','lock');
      if(d.del && !d.lock && !cancel){ deleteDrop(d); return; }
      /* huỷ = trả thẻ về chỗ cũ (các thẻ khác trượt theo) */
      if(cancel){ var ts=planTiles(); if(ts.indexOf(d.t)!==d.from){ var others=ts.filter(function(c){ return c!==d.t; }); flip(others, function(){ d.g.insertBefore(d.t, others[d.from]||$('pl-grid').querySelector('.ptile.add')); }); } }
      /* chốt thứ tự mới từ DOM, giữ bài đang tập của từng người */
      var order=planTiles().map(function(c){ return s.plan[+c.dataset.i]; }), curName=s.people.map(function(p){ return s.plan[p.cur]; });
      s.plan=order; s.people.forEach(function(p,i){ var k=s.plan.indexOf(curName[i]); if(k>=0) p.cur=k; }); saveSession(); planRenumber();
      /* bay về đúng ô (spring), scale/bóng tắt; xong mới hiện thẻ gốc */
      var tr=d.t.getBoundingClientRect();
      d.w.style.transition=d.rm ? 'transform .12s linear' : 'transform .32s cubic-bezier(.2,.9,.25,1.05)';
      d.w.style.transform='translate3d('+(tr.left-d.x0).toFixed(2)+'px,'+(tr.top-d.y0).toFixed(2)+'px,0) rotate(0deg)';
      d.c.classList.add('land'); d.c.classList.remove('up','del');
      var tm=setTimeout(finish, d.rm?140:340);
      function finish(){ clearTimeout(tm); if(DRAG!==d) return; if(d.w.parentNode) d.w.parentNode.removeChild(d.w); d.t.classList.remove('ph'); DRAG=null; }
      d.finish=finish;
    }
    /* xoá: thẻ bay co về 0 + mờ, các thẻ sau trượt lên, rồi dựng lại lưới (số set, CTA) */
    function deleteDrop(d){
      var s=state.session, curName=s.people.map(function(p){ return s.plan[p.cur]; });
      s.plan=planTiles().filter(function(c){ return c!==d.t; }).map(function(c){ return s.plan[+c.dataset.i]; });
      s.people.forEach(function(p,i){ var k=s.plan.indexOf(curName[i]); p.cur=k>=0?k:Math.min(p.cur, Math.max(0,s.plan.length-1)); }); saveSession();
      buzz(16); d.c.classList.add('gone');
      var t1=setTimeout(function(){ var others=planTiles().filter(function(c){ return c!==d.t; }); flip(others, function(){ if(d.t.parentNode) d.t.parentNode.removeChild(d.t); }); planRenumber(); }, d.rm?0:60);
      var t2=setTimeout(finish, d.rm?160:340);
      function finish(){ clearTimeout(t1); clearTimeout(t2); if(DRAG!==d) return; if(d.t.parentNode) d.t.parentNode.removeChild(d.t); if(d.w.parentNode) d.w.parentNode.removeChild(d.w); DRAG=null; renderPlan(false); }
      d.finish=finish;
    }
  });
}
/* window thư viện bài */
var LIB_OPEN=false;
function openLib(){ LIB_OPEN=true; $('lib-q').value=''; renderLib(true); $('lib-dim').classList.add('on'); $('lib').classList.add('on'); syncTheme(); }
function closeLib(silent){ if(!LIB_OPEN) return; LIB_OPEN=false; $('lib-dim').classList.remove('on'); $('lib').classList.remove('on'); if(!silent && state.session && state.screen==='p-plan') renderPlan(false); setTimeout(syncTheme, 380); }
function lastFor(name){ var s=state.session, p=s&&s.people[0], m=p&&findClient(p.name); return m&&m.last&&m.last[name]; }
function renderLib(animate){
  var s=state.session, q=norm($('lib-q').value), el=$('lib-list'); el.innerHTML=''; var i=0, any=false;
  libGroups().forEach(function(g){
    var items=g.items.filter(function(e){ return !q || norm(e.name).indexOf(q)>=0 || norm(exShort(e.name)).indexOf(q)>=0 || norm(g.name).indexOf(q)>=0; }); if(!items.length) return; any=true;
    var d=document.createElement('div'); d.className='lab sec'; d.textContent=upper(g.name)+' · '+items.length; el.appendChild(d);
    items.forEach(function(e){
      var sel=s.plan.indexOf(e.name)>=0, l=lastFor(e.name), b=document.createElement('button'); b.className='row'+(sel?' sel':'')+(animate?' rowin':''); if(animate) b.style.animationDelay=Math.min(i++*16,200)+'ms';
      b.innerHTML='<span class="lt"><span class="nm mq"><span>'+esc(exShort(e.name))+'</span></span><span class="lab">'+(l?'LẦN TRƯỚC '+l.rep+' × '+fmtN(l.kg)+' KG':'CHƯA TẬP')+'</span></span>'+ico(sel?'i-check':'i-plus',sel?'acid':'paper');
      b.onclick=function(){ var k=s.plan.indexOf(e.name); if(k>=0){ if(planCounts(e.name)){ notify('Bài đã có set', {err:true}); return; } s.plan.splice(k,1); } else s.plan.push(e.name); saveSession(); renderLib(false); };
      el.appendChild(b);
    });
  });
  if(!any){ var em=document.createElement('div'); em.className='lab empty'; em.textContent='KHÔNG TÌM THẤY BÀI NÀY'; el.appendChild(em); }
  $('lib-go').textContent=s.plan.length?'Chọn · '+s.plan.length+' bài':'Đóng'; $('lib-go').classList.toggle('paper', !s.plan.length);   /* Đóng = Paper · Chọn = Acid */
  el._fogTop=32; fogUpdate(el); if(!animate) mqInit(el);
}
(function(){ var y0=0, on=false, h=$('lib-handle');
  h.addEventListener('touchstart', function(e){ on=true; y0=e.touches[0].clientY; }, {passive:true});
  h.addEventListener('touchmove', function(e){ if(!on) return; var dy=e.touches[0].clientY-y0; if(dy>0) $('lib').style.transform='translateY('+dy+'px)'; }, {passive:true});
  h.addEventListener('touchend', function(e){ if(!on) return; on=false; var dy=(e.changedTouches[0].clientY-y0); $('lib').style.transform=''; if(dy>80) closeLib(); }, {passive:true});
  h.addEventListener('click', function(){ closeLib(); });
})();
function startLoop(){
  var s=state.session; if(!s||!s.plan.length) return;
  closeLib(true); var first=!s.started; s.started=1; if(!s.startedAt) s.startedAt=Date.now();
  /* lần bắt đầu đầu tiên luôn vào bài 01 (kéo thả đổi chỗ trước khi bắt đầu đã dời p.cur theo bài cũ) */
  s.people.forEach(function(p){ if(first || p.cur>=s.plan.length) p.cur=0; primePerson(p); });
  saveSession(); go('p-loop','fwd');
}
/* reps/kg mặc định cho bài đang chọn: set gần nhất trong buổi → lần trước của khách → 10 × 20 */
function primePerson(p){
  var s=state.session, ex=s.plan[p.cur], e=p.ex[ex]; if(!e){ e=p.ex[ex]={sets:[], done:false}; }
  var m=findClient(p.name), l=m&&m.last&&m.last[ex], ls=last(e.sets);
  if(ls){ p.kg=ls[0]; p.reps=ls[1]; } else if(l){ p.kg=+l.kg||20; p.reps=+l.rep||10; } else if(!p.primed){ p.kg=20; p.reps=10; }
  p.primed=1; p.setNo=e.sets.length+1; if(p.phase!=='setup' && p.phase!=='active' && p.phase!=='rest-setup' && p.phase!=='rest') p.phase='setup';
}

/* =====================================================================
   5–9 — VÒNG LẶP SET (một Loop cho mỗi khách; 1:2 = hai nửa)
   v2.5 · màn nghỉ "Hạt" — nền Ink xuyên suốt, thiết lập → trong set → đặt giờ nghỉ → đang nghỉ → set mới là MỘT không gian:
   · Bắt đầu set: số reps/kg BAY từ bộ đếm lớn vào cụm số (FLIP), vành nhịp thức dậy (lõi sóng hoá Acid, chấm tâm nở),
     pill Acid co thành "Đạt" và "Chưa đạt" trượt ra từ sau nó. Quay lại: số bay ngược lên, vành lặng đi.
   · Chấm set: vành nhịp THỞ RA thành vành hạt, bộ đếm nở từ tâm, pill thành "Bắt đầu nghỉ" (Paper).
   · Bắt đầu nghỉ: sóng Acid chạy một vòng; mỗi giây một hạt rụng đúng lúc số nhảy; kéo ▲▼ lúc đang đếm = đổi thời gian CÒN LẠI.
   · Vào set mới / đổi bài: hạt hút về tâm, bộ đếm co lại, vành nhịp nở ra từ tâm, bộ đếm lớn hiện lại.
   · Hai dòng đầu đổi bằng trượt 7px + mờ (240 ms); chữ nút mờ ra/vào 110 + 110 ms, bề rộng pill nở theo chữ 260 ms --eo.
   v2.6 (28/09) · nút trái là chuỗi LÙI TỪNG BƯỚC — mỗi bước lùi đúng một trạng thái, chuyển động là bước tới tua ngược:
     đang nghỉ ↩ → đặt giờ nghỉ (sóng Acid rút ngược, hạt đã rụng về lại vành) · đặt giờ nghỉ ← → đang tập (bỏ kết quả vừa chấm,
     hạt tua ngược thành vành nhịp đang thức) · đang tập ↩ → thiết lập · thiết lập ← → danh sách bài.
     Set vừa chấm GIỮ (hold) trong hàng đợi tới khi coach đi tiếp (vào set mới · đổi bài · xong bài · kết thúc) → lùi lúc nào cũng không để lại set ma trên máy chủ.
   · 1:2: mỗi nửa luôn có nav rút gọn ở đáy (nút tròn 48, icon 24, cách đáy nửa màn 28) — nút ở nửa nào tác động nửa đó.
   Mọi thứ chạy theo đồng hồ MT (motFrame) nên khớp từng khung với hạt; giờ nghỉ thật vẫn là Date.now() − restStart.
   ===================================================================== */
var LOOPS=[], LOOP_ON=false;
/* nút theo pha — trái: ← quay lại / ↩ hoàn tác (chuỗi lùi ở trên) · phải: chữ (1:1) hoặc icon (1:2 rút gọn); nền Paper chỉ lúc đặt giờ nghỉ */
var LOOP_NAV={
  'setup':      {g:'i-back', gl:'Quay lại', t:'Bắt đầu set',         i:'i-play'},
  'active':     {g:'i-undo', gl:'Hoàn tác', t:'Đạt',                 i:'i-check'},
  'rest-setup': {g:'i-back', gl:'Quay lại', t:'Bắt đầu nghỉ',        i:'i-play', paper:true},
  'rest':       {g:'i-undo', gl:'Hoàn tác', t:'Nghỉ xong · kế tiếp', i:'i-check'}
};
/* menu bước tiếp đang mở: nút chính nằm dưới màng kính, mang nghĩa "vào set mới" — Paper để kính Ink không pha Acid thành ô liu */
var LOOP_FILM_CTA={t:'Vào set mới', i:'i-play', paper:true};
/* ---- Màu vùng dưới thanh trạng thái / thanh công cụ Safari (iOS 26+, Liquid Glass) — v2.4.2 → v2.5 ----
   Safari 26 bỏ theme-color; vùng dưới hai thanh lấy màu của element fixed/sticky đầu tiên ở tâm mỗi mép (LocalFrameView::fixedContainerEdges).
   body{position:fixed} phủ kín viewport nên WebKit giữ màu lấy lần đầu → hai dải .wkedge (#wk-t / #wk-b, fixed, cao 12px) mang màu mép
   hiện hành và được đọc lại mỗi lần đổi. v2.5: màn nghỉ không còn Acid tràn màn → mọi màn đều Ink ở hai mép; v2.5.1: sheet cũng Ink
   (trước là Tile phủ mép dưới). --bg (nền html/body) = màu mép dưới: màu dự phòng của Safari và dải đáy của bản cài black-translucent (WebKit 301108). */
var EDGE_INK='#0A0A0A';
var EDGE_CUR={t:'', b:'', bg:''};
function setEdge(side, c){ if(EDGE_CUR[side]===c) return; EDGE_CUR[side]=c; document.documentElement.style.setProperty('--edge-'+side, c); }
function syncTheme(){
  var cb=EDGE_INK;   /* v2.5.1: cửa sổ (sheet) cũng nền Ink → hai mép luôn Ink, kể cả khi sheet đang mở */
  setEdge('t', EDGE_INK); setEdge('b', cb);
  if(EDGE_CUR.bg!==cb){ EDGE_CUR.bg=cb; document.documentElement.style.setProperty('--bg', cb); }
  var m=document.querySelector('meta[name=theme-color]'); if(m && m.getAttribute('content')!==EDGE_INK) m.setAttribute('content', EDGE_INK);
  /* thêm/bớt một element fixed → WebKit tính lại màu mép ở lần commit kế (didAddOrRemoveViewportConstrainedObjects) */
  var k=$('wk-k'); if(k) k.hidden=!k.hidden;
}
HOOK['p-loop']=function(){ buildLoops(); };
function buildLoops(){
  var host=$('loop-host'), s=state.session; host.innerHTML=''; LOOPS=[]; host.className='split'+(s&&s.people.length>1?' two':'');
  MTW=MTW.filter(function(o){ return !/^L\d:/.test(o.key||''); }); MTT=MTT.filter(function(t){ return !/^L\d:/.test(t.key||''); });   /* tween của loop cũ: bỏ */
  if(!s){ go('p-home','back'); return; }
  s.people.forEach(function(p,i){ primePerson(p); LOOPS.push(Loop(host, p, {half:s.people.length>1, idx:i})); });
  MOT.st={n:0, f:0, dup:0, ms:0, sec:0, at:-1};   /* số đo vòng vẽ của lượt loop này → màn chẩn đoán (chạm wordmark màn PIN 5 lần) */
  loopWake();
  $('p-loop')._after=function(){ loopLayoutAll(); LOOPS.forEach(function(l){ l.enter(); }); };
}
function loopWake(){ if(LOOP_ON) return; LOOP_ON=true; motWake(); }
function loopSleep(){ LOOP_ON=false; }
function loopLayoutAll(){
  LOOPS.forEach(function(l){ l.layout(); });
  if(LOOPS.length>1){ var sm=Math.min.apply(null, LOOPS.map(function(l){ return l.field.s; })), sx=Math.max.apply(null, LOOPS.map(function(l){ return l.field.sx; })); LOOPS.forEach(function(l){ l.field.s=sm; l.field.sx=sx; }); }   /* hai nửa: vành hạt cùng cỡ */
}
window.addEventListener('resize', function(){ if(LOOPS.length) loopLayoutAll(); });
document.addEventListener('visibilitychange', function(){ if(state.screen!=='p-loop') return; if(document.hidden) loopSleep(); else loopWake(); });

function Loop(host, p, o){
  var s=state.session, root=document.createElement('div'), K='L'+o.idx+':'; root.className='loop';
  var compact=!!o.half;   /* 1:2: nav rút gọn — nút tròn 48 chỉ có icon, luôn hiện ở đáy nửa màn */
  var who='<span class="who"'+(o.half?'':' hidden')+'>'+esc(firstName(p.name))+'</span>';
  /* cụm số reps/kg lúc đang tập: 1:1 ở đáy ngay trên nav · 1:2 ngay dưới khối đỉnh (cách 28) vì nav rút gọn chiếm đáy nửa màn */
  var numsHTML='<div class="nums" hidden><div class="fld reps dimable"><div class="line"></div><div class="hint">'+UD13+'<span>REPS</span></div></div><div class="fld kg dimable"><div class="line"></div><div class="hint"><span>KG</span>'+UD13+'</div></div></div>';
  var navHTML='<div class="nav dimable"><button class="ghost g1" aria-label="Quay lại"><svg class="ic s24"><use href="#i-back"/></svg></button><span class="sp"></span>'+
    (compact ? '<button class="cta line j0" aria-label="Chưa đạt" hidden><svg class="ic s24"><use href="#i-x"/></svg></button><button class="cta c1"><svg class="ic s24"><use href="#i-play"/></svg></button>'
             : '<button class="cta line j0" hidden>Chưa đạt</button><button class="cta c1"><span class="ct"></span></button>')+'</div>';
  root.innerHTML=
   '<canvas class="dimable" aria-hidden="true"></canvas>'+
   /* thiết lập set: reps 112 · × 72 · kg 112 (Figma 449:827) */
   '<div class="setup" hidden><div class="wheel w-reps dimable"><div class="line"></div><div class="hint"><span>SỐ REPS</span>'+UD+'</div></div><div class="x dimable">×</div><div class="wheel w-kg dimable"><div class="line"></div><div class="hint"><span>MỨC TẠ · KG</span>'+UD+'</div></div></div>'+
   /* bộ đếm nghỉ y=386 (Figma 561:225) — kéo ▲▼ khi đặt giờ và cả khi đang đếm */
   '<div class="clock" hidden><div class="wheel w-rest" role="slider" aria-label="Thời gian nghỉ" aria-valuemin="15" aria-valuemax="600"><div class="line"></div><div class="hint"><span class="rh">ĐẶT THỜI GIAN NGHỈ</span>'+UD+'</div></div></div>'+
   '<div class="lp">'+
     '<div class="head dimable">'+who+'<span class="t1 sw"></span><span class="sub sw"></span></div>'+
     (compact?numsHTML:'')+
     '<div class="mid"></div>'+
     '<div class="foot">'+(compact?'':numsHTML)+navHTML+'</div>'+
   '</div>'+
   /* màng menu bước tiếp (kính Ink 80→90 % + blur 11px): mở từ nút chính lúc đang nghỉ. Chạm ngoài danh sách để đóng. */
   '<div class="film dark"><div class="inner"><div class="exl"></div><hr><button class="act fdone"></button><button class="act fend">Kết thúc buổi tập</button></div></div>';
  host.appendChild(root);
  var q=function(sel){ return root.querySelector(sel); };
  var cv=q('canvas'), head=q('.lp .head'), t1=q('.t1'), sub=q('.sub'), setup=q('.setup'), clock=q('.clock'), wrest=q('.w-rest'), cline=q('.clock .line'), chint=q('.clock .hint'), rh=q('.rh'),
      nums=q('.lp .nums'), j0=q('.j0'), c1=q('.c1'), ct=q('.c1 .ct'), g1=q('.g1'), film=q('.film');
  var lastTen=false, zeroed=false, lastSec=-1, guardT=0, SWN=0, entered=false, frozen=null;
  var F=Field(cv, {key:K+'F', seed:o.idx, rest:function(){ return p.phase==='rest'; }, left:function(){ return restLeft(); }, lastTen:function(){ return lastTen; }});
  var L={p:p, root:root, field:F, ring:F, idx:o.idx};
  /* tiêu điểm: kéo một bánh xe → mờ mọi thứ khác. Riêng bánh xe giờ nghỉ KHÔNG làm mờ vành: hạt đổ vào chính là phản hồi của nó. */
  function dim(on, hostEl){ root.querySelectorAll('.dimable').forEach(function(el){ if(el===hostEl || el.contains(hostEl)) return; if(el===cv && hostEl.closest('.clock')) return; el.classList.toggle('dimx', on); }); }
  var repsW=Wheel(q('.w-reps'), {values:REPS_VALS, index:0, format:String, row:o.half?44:60, z:o.half?160:260, boxH:o.half?89:126, ghost:.3, dim:dim, onPick:function(v){ p.reps=v; saveSession(); }});
  var kgW=Wheel(q('.w-kg'), {values:KG_VALS, index:0, format:fmtN, row:o.half?44:60, z:o.half?160:260, boxH:o.half?89:126, ghost:.3, dim:dim, onPick:function(v){ p.kg=v; saveSession(); }});
  var restW=Wheel(wrest, {values:REST_VALS, index:5, format:mmss, row:o.half?60:80, z:o.half?200:283, boxH:o.half?89:126, ghost:.26, dim:dim,
    live:function(){ return mmss(frozen!=null ? frozen : shownRest()); },
    down:function(){ if(p.phase==='rest') restW.set(shownRest()); },          /* mở bánh xe lúc đang đếm: bắt đầu từ giờ còn lại */
    onPick:onRestPick});
  var fReps=Wheel(q('.fld.reps'), {values:REPS_VALS, index:0, format:String, row:44, z:96, boxH:57, ghost:.52, dim:dim, onPick:function(v){ p.reps=v; saveSession(); }});
  var fKg=Wheel(q('.fld.kg'), {values:KG_VALS, index:0, format:fmtN, row:44, z:96, boxH:57, ghost:.52, dim:dim, onPick:function(v){ p.kg=v; saveSession(); }});
  function ex(){ return s.plan[p.cur]; }
  function E(){ var e=p.ex[ex()]; if(!e) e=p.ex[ex()]={sets:[],done:false}; return e; }
  function restLeft(){ if(p.phase!=='rest') return p.restTotal; return Math.max(0, p.restTotal-(Date.now()-p.restStart)/1000); }
  function shownRest(){ return p.phase==='rest' ? Math.ceil(restLeft()-1e-9) : p.restTotal; }   /* số hiện = ceil: hạt rụng đúng lúc số nhảy */
  function filmOn(){ return film.classList.contains('on'); }
  function guard(){ guardT=performance.now(); }
  function guarded(){ return performance.now()-guardT<320; }   /* pill vừa đổi nghĩa ngay dưới ngón tay: chặn chạm đúp vô tình */
  function setLabel(){ var st=last(E().sets); return (st&&st[2]?'Đã đạt':'Chưa đạt')+' set '+p.setNo; }
  function restSub(){ return restLeft()<=0 ? 'Hết giờ nghỉ' : 'Đang nghỉ'; }

  /* ---- chữ: dòng cũ trượt lên 7px + mờ, dòng mới trượt vào từ dưới (dir −1: ngược lại), 240 ms; hai dòng chồng cùng ô lưới ---- */
  function line(hostEl, text, cls, dir, instant, isEx){
    var cur=hostEl.querySelector(':scope>span.on');
    if(cur && cur.textContent===text && (cur.getAttribute('data-c')||'')===(cls||'')) return;
    var nu=document.createElement('span'); nu.className='on'+(cls?' '+cls:'')+(isEx?' ex':''); nu.setAttribute('data-c', cls||''); nu.textContent=text; nu._k=K+'sw'+(++SWN);
    if(instant || !cur){ [].slice.call(hostEl.children).forEach(function(c){ if(c._k) twKill(c._k); }); hostEl.innerHTML=''; hostEl.appendChild(nu); return; }
    cur.classList.remove('on','ex'); hostEl.appendChild(nu);
    var d=(dir<0?-1:1), R=rm(), old=cur, o0=old.style.opacity===''?1:+old.style.opacity;
    twKill(old._k); nu.style.opacity='0';
    tw({key:old._k, from:0, to:1, dur:.24, ease:LIN, keepRM:true, rmDur:.16, set:function(v){ old.style.opacity=clamp(o0*(1-v*2.2),0,1); if(!R) old.style.transform='translateY('+(-7*d*EO(v)).toFixed(2)+'px)'; }, done:function(){ if(old.parentNode) old.remove(); }});
    tw({key:nu._k, from:0, to:1, dur:.24, ease:LIN, keepRM:true, rmDur:.16, set:function(v){ nu.style.opacity=clamp((v-0.3)/0.7,0,1); if(!R) nu.style.transform='translateY('+(7*d*(1-EO(v))).toFixed(2)+'px)'; }, done:function(){ nu.style.opacity=''; nu.style.transform=''; }});
  }
  /* mờ ra → đổi → mờ vào (110 + 110 ms). Gọi chồng: đi tiếp từ độ mờ đang hiện, chữ trung gian không bao giờ hiện */
  function fadeSwap(el, apply, key){
    if(rm()){ apply(); el.style.opacity=''; return; }
    var from=el.style.opacity===''?1:+el.style.opacity; el.style.transition='none';
    tw({key:key, from:from, to:0, dur:.11*Math.max(from,.2), ease:LIN, set:function(v){ el.style.opacity=v; }, done:function(){ apply(); tw({key:key, from:0, to:1, dur:.11, ease:LIN, set:function(v){ el.style.opacity=v; }, done:function(){ el.style.opacity=''; el.style.transition=''; }}); }});
  }
  /* ---- icon trong nút: co .8 + mờ ra, đổi hình, nở lại (100 + 180 ms). mid(): việc làm đúng lúc icon cũ vừa tắt (đổi màu nút) ---- */
  function swapIcon(btn, name, key, instant, mid){
    var svg=btn.querySelector('svg'), use=svg.querySelector('use'); btn._mid=mid||null;
    function fx(v){ svg._k=v; svg.style.opacity=v; svg.style.transform='scale('+(0.8+0.2*v).toFixed(3)+')'; }
    function swap(){ use.setAttribute('href','#'+btn._i); if(btn._mid) btn._mid(); }
    if(btn._i===name){ if(btn._mid) btn._mid(); return; }
    btn._i=name;
    if(instant || rm()){ twKill(key); swap(); svg.style.opacity=''; svg.style.transform=''; svg._k=1; return; }
    var k0=svg._k==null?1:svg._k;
    tw({key:key, from:k0, to:0, dur:.1*Math.max(k0,.2), ease:LIN, set:fx, done:function(){ swap(); tw({key:key, from:0, to:1, dur:.18, ease:EO, set:fx, done:function(){ svg.style.opacity=''; svg.style.transform=''; svg._k=1; }}); }});
  }
  /* ---- nút chính: MỘT nút đổi theo pha (LOOP_NAV). 1:1 = pill đổi chữ, bề rộng nở theo chữ (260 ms --eo, ngoại lệ width đã duyệt);
     1:2 rút gọn = nút tròn 48 đổi icon. Màu nút đổi đúng lúc chữ / icon cũ vừa tắt → không bao giờ thấy cái cũ trên màu mới ---- */
  var ctaM=null, CTA={t:'', i:'', paper:false, w:0};
  /* đo bề rộng chữ bằng một pill ẩn đặt thẳng trong .loop (đo chính nút lúc đang nén :active sẽ hụt) */
  function ctaWidth(text){ if(!ctaM){ ctaM=document.createElement('span'); ctaM.className='cta ctam'; ctaM.setAttribute('aria-hidden','true'); root.appendChild(ctaM); } ctaM.textContent=text; return ctaM.getBoundingClientRect().width; }
  function ctaTo(n, instant){
    var text=n.t, paper=!!n.paper;
    if(compact){
      c1.setAttribute('aria-label', text); CTA.t=text;
      if(CTA.i===n.i && CTA.paper===paper) return;
      CTA.i=n.i; CTA.paper=paper;
      swapIcon(c1, n.i, K+'ci', instant, function(){ c1.classList.toggle('paper', CTA.paper); });
      return;
    }
    if(CTA.t===text && CTA.paper===paper && CTA.w) return;
    var textChanged=CTA.t!==text; CTA.t=text; CTA.paper=paper;
    var w=ctaWidth(text);
    if(!w){ twKill(K+'cw'); c1.classList.toggle('paper', paper); c1.style.width=''; CTA.w=0; ct.textContent=text; return; }   /* trang chưa hiện: đo lại ở layout() */
    if(instant || !CTA.w){ twKill(K+'cw'); twKill(K+'ct'); c1.classList.toggle('paper', paper); CTA.w=w; c1.style.width=w.toFixed(2)+'px'; ct.textContent=text; ct.style.opacity=''; return; }
    tw({key:K+'cw', from:CTA.w, to:w, dur:.26, ease:EO, set:function(v){ CTA.w=v; c1.style.width=v.toFixed(2)+'px'; }});
    if(textChanged) fadeSwap(ct, function(){ ct.textContent=CTA.t; c1.classList.toggle('paper', CTA.paper); }, K+'ct');
    else c1.classList.toggle('paper', paper);
  }
  function ctaFit(){ if(compact) return; var w=ctaWidth(CTA.t); if(!w || twHas(K+'cw')) return; CTA.w=w; c1.style.width=w.toFixed(2)+'px'; if(!twHas(K+'ct')) ct.textContent=CTA.t; }
  function ctaNow(){ return (p.phase==='rest' && filmOn()) ? LOOP_FILM_CTA : LOOP_NAV[p.phase]; }
  function gIcon(name, label, instant){ g1.setAttribute('aria-label', label); swapIcon(g1, name, K+'gi', instant); }
  function hintTo(text, instant){ if(rh.textContent===text && !twHas(K+'hint')) return; if(instant){ twKill(K+'hint'); rh.textContent=text; chint.style.opacity=''; return; } fadeSwap(chint, function(){ rh.textContent=text; }, K+'hint'); }
  /* ---- hiện / ẩn theo MT: k 0 → 1 (vào, --eo) hoặc 1 → 0 (ra, --eio); ra xong thì hidden (không chặn chạm, không tốn vẽ) ---- */
  var PFX={
    setup:function(el,k,R){ el.style.opacity=k; el.style.transform=R?'translateY(-50%)':'translateY(-50%) scale('+(0.94+0.06*k).toFixed(4)+')'; },
    setupFade:function(el,k){ el.style.opacity=k; el.style.transform='translateY(-50%)'; },
    clock:function(el,k,R){ el.style.opacity=k; el.style.transform=R?'':'scale('+(0.3+0.7*k).toFixed(4)+')'; },
    nums:function(el,k,R){ el.style.opacity=k; el.style.transform=R?'':'translateY('+((1-k)*6).toFixed(2)+'px)'; },
    /* "Chưa đạt" trượt ra từ sau nút chính: pill 1:1 lệch 28 · nút tròn 1:2 lệch đúng một nút + khe (48 + 8) */
    j0:function(el,k,R){ el.style.opacity=k; el.style.transform=R?'':'translateX('+((1-k)*(compact?56:28)).toFixed(2)+'px) scale('+(0.96+0.04*k).toFixed(4)+')'; }
  };
  function presence(el, fx, on, op){
    op=op||{}; var key=K+'pr'+(el._pk||(el._pk=++SWN)), R=rm();
    var k0=el.hidden?0:(el._pv!=null?el._pv:1);
    if(op.instant){ twKill(key); el._pv=on?1:0; el.style.transition=''; if(on){ el.hidden=false; el.style.pointerEvents=''; fx(el,1,R); } else { el.hidden=true; fx(el,0,R); } return; }
    if(on){ if(!el.hidden && k0>=1 && !twHas(key)) return; el.hidden=false; el.style.pointerEvents=''; }
    else { if(el.hidden){ twKill(key); el._pv=0; return; } el.style.pointerEvents='none'; }
    el.style.transition='none'; fx(el,k0,R);
    tw({key:key, from:k0, to:on?1:0, dur:on?(op.din||.24):(op.dout||.18), delay:op.delay||0, pre:false, ease:on?EO:EIO, keepRM:true, rmDur:.16,
        set:function(v){ el._pv=v; fx(el,v,R); }, done:function(){ if(!on) el.hidden=true; el.style.transition=''; }});
  }
  /* ---- con số chuyển Acid trong 10 giây cuối (luật 19/09) ---- */
  var digK=0;
  function digitsAcid(on, instant){
    function fx(v){ digK=v; cline.style.color='rgb('+Math.round(lerp(250,212,v))+','+Math.round(lerp(250,255,v))+','+Math.round(lerp(250,0,v))+')'; }
    twKill(K+'dig'); if(instant){ fx(on?1:0); return; }
    tw({key:K+'dig', from:digK, to:on?1:0, dur:.18, ease:LIN, keepRM:true, set:fx});
  }
  /* ---- SỐ BAY (FLIP): mặt số đang hiện ở bộ đếm lớn ↔ cụm số reps/kg (1:1 ở đáy · 1:2 dưới khối đỉnh). Bản sao Mono giữ nguyên chữ, co/giãn bằng scale
     (cỡ đích / cỡ nguồn), x đi trước y một chút nên đường bay hơi cong. Mặt số thật ở hai đầu ẩn trong lúc bay. ---- */
  var flying=[], EX1=bez(.4,0,.2,1), EY1=bez(.6,0,.3,1);
  function flyStop(){ flying.forEach(function(f){ twKill(f.key); if(f.el.parentNode) f.el.remove(); f.restore(); }); flying=[]; }
  function alignX(r, w, ta){ return (ta==='left'||ta==='start') ? r.left : (ta==='right'||ta==='end') ? r.right-w : r.left+(r.width-w)/2; }
  function flyNum(a, b, la, lb, delay){
    var rr=root.getBoundingClientRect(), ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); if(!ra.width || !rb.width) return;
    var ca=getComputedStyle(a), cb=getComputedStyle(b), f=document.createElement('div'); f.className='fly'; f.textContent=a.textContent;
    ['fontFamily','fontSize','fontWeight','letterSpacing','lineHeight','fontVariantNumeric'].forEach(function(k){ f.style[k]=ca[k]; });
    root.appendChild(f);
    var wa=f.offsetWidth, ha=f.offsetHeight, k=(parseFloat(cb.fontSize)||40)/(parseFloat(ca.fontSize)||112), wb=wa*k, hb=ha*k;
    var xa=alignX(ra, wa, ca.textAlign)-rr.left, ya=ra.top+(ra.height-ha)/2-rr.top, xb=alignX(rb, wb, cb.textAlign)-rr.left, yb=rb.top+(rb.height-hb)/2-rr.top;
    f.style.left=xa.toFixed(2)+'px'; f.style.top=ya.toFixed(2)+'px';
    la.style.opacity='0'; lb.style.opacity='0';
    var rec={el:f, key:K+'fly'+(++SWN), restore:function(){ la.style.opacity=''; lb.style.opacity=''; }};
    flying.push(rec);
    tw({key:rec.key, from:0, to:1, dur:.3, delay:delay||0, pre:false, ease:LIN, set:function(v){
        f.style.transform='translate('+((xb-xa)*EX1(v)).toFixed(2)+'px,'+((yb-ya)*EY1(v)).toFixed(2)+'px) scale('+lerp(1,k,EIO(v)).toFixed(4)+')'; },
      done:function(){ rec.restore(); if(f.parentNode) f.remove(); var i=flying.indexOf(rec); if(i>=0) flying.splice(i,1); }});
  }
  function bigV(w){ return q('.setup .w-'+w+' .line .v:nth-child(5)'); }
  function smallV(w){ return q('.fld.'+w+' .line .v:nth-child(5)'); }
  function flyToNums(){     /* thiết lập → trong set */
    if(rm() || setup.hidden) return;
    nums.hidden=false; nums._pv=0; PFX.nums(nums,0,false);
    flyNum(bigV('reps'), smallV('reps'), q('.setup .w-reps .line'), q('.fld.reps .line'), 0);
    flyNum(bigV('kg'), smallV('kg'), q('.setup .w-kg .line'), q('.fld.kg .line'), .03);
  }
  function flyToSetup(){    /* trong set → thiết lập */
    if(rm() || nums.hidden) return;
    setup.hidden=false; setup._pv=0; PFX.setupFade(setup,0);
    flyNum(smallV('reps'), bigV('reps'), q('.fld.reps .line'), q('.setup .w-reps .line'), 0);
    flyNum(smallV('kg'), bigV('kg'), q('.fld.kg .line'), q('.setup .w-kg .line'), .03);
  }

  /* ---- trạng thái chữ/nút theo pha (dir: 1 tiến, −1 lùi) ---- */
  function render(dir, instant){
    var ph=p.phase, rest=(ph==='rest-setup'||ph==='rest'), n=LOOP_NAV[ph];
    line(t1, rest?setLabel():exShort(ex()), rest?'d55':'', dir, instant, true);
    line(sub, ph==='setup'?'Thiết lập set '+p.setNo : ph==='active'?'Đang tập set '+p.setNo : ph==='rest-setup'?'Bắt đầu nghỉ' : restSub(), rest?'':'ac', dir, instant);
    ctaTo(ctaNow(), instant);
    c1.classList.toggle('j1', ph==='active');
    presence(j0, PFX.j0, ph==='active', {din:.26, delay:.05, dout:.14, instant:instant});
    gIcon(n.g, n.gl, instant);
    hintTo(ph==='rest-setup'?'ĐẶT THỜI GIAN NGHỈ':'', instant);
    repsW.set(p.reps); kgW.set(p.kg); fReps.set(p.reps); fKg.set(p.kg);
    if(ph==='rest-setup') restW.set(p.restTotal);
    restW.render(); wrest.setAttribute('aria-valuenow', shownRest()); wrest.setAttribute('aria-valuetext', mmss(shownRest()));
    renderFilm();
  }
  function renderFilm(){
    var list=q('.exl'); list.innerHTML='';
    var allDone=s.plan.length>0 && s.plan.every(function(n){ var e=p.ex[n]; return e && e.done; });
    film.classList.toggle('alldone', allDone);
    s.plan.forEach(function(n,i){
      var e=p.ex[n]||{sets:[]}, b=document.createElement('button'); b.className=e.done?'done':'';
      var sn=(i===p.cur) ? ((p.phase==='setup'||p.phase==='active') ? p.setNo : p.setNo+1) : e.sets.length+1;
      b.innerHTML='<span class="no">'+pad2(i+1)+'</span><span class="nmx">'+esc(exShort(n))+'</span><span class="sn">Set '+sn+'</span>';
      b.onclick=function(ev){ ev.stopPropagation(); switchEx(i); }; list.appendChild(b);
    });
    q('.fdone').textContent='Đã xong '+exShort(ex());
  }
  /* rời màn nghỉ về thiết lập (vào set mới · đổi bài): hạt hút về tâm, bộ đếm co (giữ số đang hiện tới hết lúc co),
     vành nhịp nở ra từ tâm con số, bộ đếm lớn hiện lại */
  function restToSetup(dir){
    flyStop(); if(openWheel) openWheel.close();
    presence(clock, PFX.clock, false, {dout:.18});
    after(.2, function(){ frozen=null; digitsAcid(false,true); restW.render(); }, K+'unfreeze');
    F.inhale(); F.chaseBloom({calm:1, dot:0, delay:.08, oy:F.cyp-F.cy});
    presence(nums, PFX.nums, false, {instant:true});
    presence(setup, PFX.setup, true, {din:.24, delay:.16});
    lastTen=false; zeroed=false; lastSec=-1;
    render(dir);
  }
  /* ---- hành động ---- */
  function begin(){
    p.phase='active'; p.setNo=E().sets.length+1; saveSession(); guard();
    render(1);
    flyToNums();
    presence(setup, rm()?PFX.setup:PFX.setupFade, false, {dout:.12});
    presence(nums, PFX.nums, true, {din:.22, delay:rm()?0:.1});
    F.chaseTo({calm:0, dot:1}, .42);
  }
  /* ↩ lúc đang tập: về thiết lập (số bay ngược về bộ đếm lớn, vành lặng đi) */
  function cancelSet(){
    p.phase='setup'; saveSession(); guard();
    render(-1);
    flyToSetup();
    presence(setup, rm()?PFX.setup:PFX.setupFade, true, {din:.2, delay:rm()?0:.1});
    presence(nums, PFX.nums, false, {dout:.14});
    F.chaseTo({calm:1, dot:0}, .36);
  }
  function judgeSet(ok){
    if(p.phase!=='active') return;
    var e=E(), ev=enqueue({type:'SET', name:p.name, session:p.no, plan:exPart(ex()), ex:ex(), set:e.sets.length+1, kg:p.kg, rep:p.reps, ok:ok?1:0, main:0}, true);
    e.sets.push([p.kg, p.reps, ok?1:0, ev.id]); p.setNo=e.sets.length;
    var m=findClient(p.name); if(m && ok) m.last[ex()]={kg:p.kg, rep:p.reps, d:TODAY_ISO};
    p.phase='rest-setup'; p.restStart=0; saveSession(); guard();
    flyStop(); lastTen=false; zeroed=false; lastSec=-1; frozen=null; afterKill(K+'unfreeze'); digitsAcid(false,true);
    restW.set(p.restTotal);
    F.exhale(p.restTotal);
    presence(nums, PFX.nums, false, {dout:.18});
    presence(setup, PFX.setup, false, {instant:true});
    presence(clock, PFX.clock, true, {din:.24, delay:.16});
    render(1);
    notify((ok?'Đã ghi set ':'Chưa đạt set ')+p.setNo, {ms:1800});
    if(navigator.vibrate) navigator.vibrate(ok?12:[10,40,10]);
  }
  /* ← lúc đặt giờ nghỉ: bỏ kết quả vừa chấm, về lại đúng set đang tập để chấm lại — tua ngược lúc chấm set: hạt bay về thành
     vành nhịp đang thức, bộ đếm co, cụm số reps/kg hiện lại. Chỉ lùi khi set còn GIỮ trong hàng đợi: set đã gửi (mở lại app giữa
     chừng thì hàng đợi nhả hết lúc khởi động) không xoá được trên máy chủ → giữ nguyên, báo lỗi */
  function reopenSet(){
    var e=E(), st=last(e.sets);
    if(!st || !held(st[3])){ notify('Set đã gửi, không hoàn tác được', {err:true}); return; }
    e.sets.pop(); unqueue(st[3]);
    p.setNo=e.sets.length+1; p.phase='active'; saveSession(); guard();
    flyStop(); if(openWheel) openWheel.close();
    presence(clock, PFX.clock, false, {dout:.18});
    if(F.rewind({calm:0, dot:1})){   /* vành nhịp hiện lên đúng lúc chấm hạ cánh */
      F.chaseSet({calm:0, dot:1, scale:1, oy:0, alpha:0});
      tw({key:K+'Fcha', from:0, to:1, dur:.16, delay:.36, pre:false, ease:EO, set:function(v){ F.CH.alpha=v; }});
    } else { F.inhale(); F.chaseBloom({calm:0, dot:1, delay:.08, oy:F.cyp-F.cy}); }
    presence(nums, PFX.nums, true, {din:.22, delay:.16});
    render(-1);
    notify('Đã hoàn tác');
  }
  /* set vừa chấm vẫn GIỮ trong hàng đợi lúc đang nghỉ (↩ về đặt giờ rồi ← về đang tập vẫn xoá được); restPlan = giờ đã đặt để ↩ trả lại đúng */
  function startRest(){
    if(p.phase!=='rest-setup') return;
    if(openWheel) openWheel.close();
    p.phase='rest'; p.restStart=Date.now(); p.restPlan=p.restTotal; saveSession(); guard();
    lastTen=false; zeroed=false; lastSec=-1;
    F.setN(p.restTotal); F.ignite();
    render(1);
  }
  /* ↩ lúc đang nghỉ: về lại màn đặt giờ nghỉ với đúng giờ đã đặt — tua ngược lúc bắt đầu nghỉ: sóng Acid rút về 12 giờ,
     hạt đã rụng đổ lại từ con số vào vành, con số mờ ra rồi hiện giờ đã đặt (kể cả khi đã kéo đổi giờ lúc đang đếm) */
  function cancelRest(){
    if(p.phase!=='rest') return;
    if(openWheel) openWheel.close();
    frozen=shownRest();                                  /* giữ số đang hiện tới lúc mờ ra */
    restW.set(p.restPlan||p.restTotal);                  /* buổi lưu trước v2.6 chưa có restPlan: về nấc gần nhất */
    p.phase='rest-setup'; p.restStart=0; p.restTotal=restW.value(); saveSession(); guard();
    lastTen=false; zeroed=false; lastSec=-1; digitsAcid(false);
    F.setN(p.restTotal); F.douse(); F.setCount(p.restTotal);
    fadeSwap(cline, function(){ frozen=null; restW.render(); }, K+'cl');
    render(-1);
  }
  /* kéo ▲▼ khi đặt giờ: tổng mới · khi đang đếm: thời gian CÒN LẠI mới (lean-journey §4) — tổng = số hạt đã rụng + giá trị mới */
  function onRestPick(v){
    wrest.setAttribute('aria-valuenow', v); wrest.setAttribute('aria-valuetext', mmss(v));
    if(p.phase==='rest-setup'){ p.restTotal=v; saveSession(); F.setN(v); F.setCount(v); }
    else if(p.phase==='rest'){
      var gone=Math.max(0, Math.round(p.restTotal-Math.ceil(restLeft()-1e-9)));
      p.restTotal=gone+v; p.restStart=Date.now()-gone*1000; saveSession();
      F.setN(gone+v); F.setCount(v); lastSec=-1;
      if(zeroed){ zeroed=false; line(sub, 'Đang nghỉ', '', 1); }
    }
  }
  /* đi tiếp khỏi vòng nghỉ (vào set mới · đổi bài · xong bài · kết thúc): set vừa chấm hết đường lùi → nhả cho hàng đợi gửi */
  function commitLast(){ var st=last(E().sets); if(st) release(st[3]); }
  function nextSet(){ closeFilm(true, true); commitLast(); frozen=shownRest(); p.phase='setup'; p.setNo=E().sets.length+1; saveSession(); guard(); restToSetup(1); }
  /* menu bước tiếp phủ lên nav (Figma 449:1251): chạm dòng bài đang tập = vào set mới · chạm ngoài = đóng.
     Các lựa chọn BAY RA từ nút vừa bấm rồi đứng vào chỗ; đóng thì bay ngược về nút. */
  var filmOrigin=null, filmT=0;
  function flyItems(origin, open){
    var items=[].slice.call(film.querySelectorAll('.inner>*')).filter(function(el){ return getComputedStyle(el).display!=='none'; });
    items=items.reduce(function(a,el){ if(el.classList.contains('exl')) return a.concat([].slice.call(el.children)); a.push(el); return a; }, []);
    var fr=root.getBoundingClientRect(), ob=origin.getBoundingClientRect(), ox=ob.left+ob.width/2-fr.left, oy=ob.top+ob.height/2-fr.top;
    items.forEach(function(el,i){
      var r=el.getBoundingClientRect(), dx=ox-(r.left+r.width/2-fr.left), dy=oy-(r.top+r.height/2-fr.top);
      el.style.transition='none';
      if(open){ el.style.transform='translate('+dx+'px,'+dy+'px) scale(.35)'; el.style.opacity='0'; void el.offsetWidth;
        el.style.transition='transform .56s cubic-bezier(.2,.9,.25,1.03) '+(i*30)+'ms, opacity .28s linear '+(i*30)+'ms'; el.style.transform='none'; el.style.opacity='1'; }
      else { var d=(items.length-1-i)*14; el.style.transition='transform .24s cubic-bezier(.4,0,.7,.3) '+d+'ms, opacity .16s linear '+(d+60)+'ms'; el.style.transform='translate('+dx+'px,'+dy+'px) scale(.35)'; el.style.opacity='0'; }
    });
    return items;
  }
  function openFilm(from){
    if(filmOn()) return; clearTimeout(filmT); filmOrigin=from||c1;
    if(openWheel) openWheel.close();
    renderFilm(); film.classList.add('on'); root.classList.add('filmon'); ctaTo(ctaNow());
    if(!rm()) flyItems(filmOrigin, true);
  }
  /* đóng menu: chạm ngoài = các lựa chọn bay ngược về nút · đã chọn một bước (pick) = màng tan nhanh 160 ms, không bay về —
     để thấy ngay chuyển động của bước đã chọn (hạt hút về tâm) */
  function closeFilm(silent, pick){
    if(!filmOn()) return; clearTimeout(filmT); root.classList.remove('filmon');
    if(pick || rm()){ film.classList.add('fast'); film.classList.remove('on'); filmT=setTimeout(function(){ film.classList.remove('fast'); }, 220); }
    else {
      var items=flyItems(filmOrigin||c1, false);
      /* v2.5.2: trả các lựa chọn về chỗ SAU khi chữ đã tắt (.inner 160 ms) — trước đây trả ngay lúc màng bắt đầu tan
         → cả danh sách hiện lại ở chỗ cũ rồi mới mờ đi (nháy ~100 ms) */
      filmT=setTimeout(function(){ film.classList.remove('on');
        filmT=setTimeout(function(){ items.forEach(function(el){ el.style.transition=''; el.style.transform=''; el.style.opacity=''; }); }, 300); }, 200);
    }
    if(!silent && p.phase==='rest') ctaTo(LOOP_NAV.rest);
  }
  function switchEx(i){
    var wasRest=(p.phase==='rest'||p.phase==='rest-setup'); closeFilm(true, true);
    if(i===p.cur){ if(wasRest) nextSet(); return; }
    commitLast();
    if(wasRest) frozen=shownRest();
    p.cur=i; p.phase='setup'; primePerson(p); saveSession(); guard();
    if(wasRest) restToSetup(1); else render(1);
  }
  function doneEx(){
    var e=E(); if(!e.sets.length){ notify('Chưa ghi set nào', {err:true}); return; }
    commitLast(); e.done=true; saveSession();
    var next=-1; for(var k=1;k<=s.plan.length;k++){ var j=(p.cur+k)%s.plan.length, ee=p.ex[s.plan[j]]; if(!ee||!ee.done){ next=j; break; } }
    if(next<0){ closeFilm(true); renderFilm(); notify('Đã xong hết bài'); setTimeout(function(){ openFilm(filmOrigin||c1); }, 900); return; }
    switchEx(next);
  }
  function endSession(){ closeFilm(true, true); commitLast(); saveSession(); state.sumIdx=0; go('p-summary','fwd'); }
  /* CTA: thiết lập → bắt đầu set · trong set → Đạt · đặt giờ → bắt đầu nghỉ · đang nghỉ → LUÔN "Nghỉ xong · kế tiếp" mở menu bước tiếp */
  c1.addEventListener('click', function(e){ e.stopPropagation(); if(filmOn() || guarded()) return;
    if(p.phase==='setup') begin(); else if(p.phase==='active') judgeSet(true); else if(p.phase==='rest-setup') startRest(); else if(p.phase==='rest') openFilm(c1); });
  j0.addEventListener('click', function(e){ e.stopPropagation(); if(guarded()) return; judgeSet(false); });
  /* nút trái = chuỗi lùi từng bước: thiết lập → danh sách bài · đang tập → thiết lập · đặt giờ nghỉ → đang tập · đang nghỉ → đặt giờ nghỉ.
     Chặn chạm đúp như nút chính: mỗi bước lùi đổi nghĩa nút ngay dưới ngón tay (chạm đúp = lùi hai bước, có thể xoá set) */
  g1.addEventListener('click', function(e){ e.stopPropagation(); if(filmOn() || guarded()) return;
    if(p.phase==='setup'){ saveSession(); go('p-plan','back'); }
    else if(p.phase==='active') cancelSet();
    else if(p.phase==='rest-setup') reopenSet();
    else if(p.phase==='rest') cancelRest();
  });
  film.addEventListener('click', function(e){ if(e.target===film) closeFilm(); });
  q('.fdone').addEventListener('click', function(e){ e.stopPropagation(); doneEx(); });
  q('.fend').addEventListener('click', function(e){ e.stopPropagation(); endSession(); });
  root.addEventListener('pointerdown', function(e){ if(openWheel && !(e.target.closest && e.target.closest('.wheel,.fld'))) openWheel.close(); }, true);
  /* ---- mỗi khung (motFrame): giờ nghỉ thật → rụng hạt, 10 giây cuối, 0:00 ---- */
  L.update=function(dt){
    if((p.phase==='rest'||p.phase==='rest-setup') && entered && F.CR.N!==p.restTotal) F.setN(p.restTotal);   /* tổng giờ đổi từ nơi khác → vành dãn theo */
    if(p.phase==='rest'){
      var left=restLeft(), R=Math.ceil(left-1e-9);
      if(entered && F.CR.slices.length>R) F.releaseTo(R);
      if(R!==lastSec){ lastSec=R; restW.render(); wrest.setAttribute('aria-valuenow', R); wrest.setAttribute('aria-valuetext', mmss(R)); }
      if(left<=0 && !zeroed){ zeroed=true; F.echo(); line(sub, 'Hết giờ nghỉ', '', 1); if(navigator.vibrate) navigator.vibrate([8,60,8]); }
      var lt=left<=10; if(lt!==lastTen){ lastTen=lt; F.merge(lt); digitsAcid(lt); }
    }
    F.update(dt);
  };
  L.draw=function(dv){ F.draw(dv); };
  L.layout=function(){
    F.size(); var W=root.clientWidth, H=root.clientHeight, headB=head.offsetTop+head.offsetHeight;
    F.cx=W/2;
    if(o.half){
      /* nửa màn: mọi thứ (vành, reps×kg, đồng hồ) căn giữa vùng trống giữa khối đỉnh và đáy → đúng tâm ở mọi cỡ máy.
         Tính từ đáy khối đỉnh (không theo .mid): cụm số reps/kg lúc đang tập nằm ngay dưới khối đỉnh nhưng không được đẩy vành */
      var free=H-28-headB, cy=headB+free/2;
      F.cy=Math.round(cy); F.h=Math.min(162, Math.round(free*.86)); setup.style.top=Math.round(cy)+'px'; root.classList.toggle('tight', free<230);
      var top=Math.round(cy-44.5); clock.style.top=top+'px';
      F.cyp=top+36; F.s=clamp(free*.9/HAT.H, .42, 1);           /* tâm quang học con số 72 · vành hạt co theo vùng trống */
    } else {
      F.cy=Math.round(H/2+16); F.h=324;
      F.cyp=Math.round(H/2-40)+55.5;                               /* đồng hồ top = H/2 − 40 → tâm quang học con số 112 (Figma 561:225: 386 → 441,5) */
      F.s=clamp((H-28-48-headB-20)/HAT.H, .6, 1);                 /* vành hạt vừa khoảng khối đỉnh → nav */
    }
    /* chiều ngang: mép trong vành (RX − ống) phải cách con số "1:30" ≥ 10px — màn thấp thì vành thành elip bẹt hơn chứ không đè số */
    var v=q('.w-rest .line .v'), fs=v?parseFloat(getComputedStyle(v).fontSize)||112:112, ls=v?parseFloat(getComputedStyle(v).letterSpacing)||0:0, hw=2*(0.6*fs+ls);
    F.sx=clamp(Math.max(F.s, (hw+10)/(HAT.RX-HAT.TUBE)), F.s, (W/2-8)/(HAT.RX+HAT.TUBE));
    ctaFit();
  };
  /* vào màn (trang vừa hiện): vành nhịp nở từ tâm · màn nghỉ: hạt đổ ra từ con số */
  L.enter=function(){
    if(entered) return; entered=true;
    var ph=p.phase;
    if(ph==='setup'||ph==='active'){ F.chaseBloom({calm:ph==='setup'?1:0, dot:ph==='active'?1:0, delay:.06}); }
    else {
      F.setN(p.restTotal, true);
      var n=ph==='rest'?Math.ceil(restLeft()-1e-9):p.restTotal;
      F.setCount(n, false, .45);
      if(ph==='rest'){ F.ignite(true); if(lastTen) F.merge(true,true); }
    }
  };
  L.state=function(){ var f=F.state(); f.phase=p.phase; f.left=restLeft(); f.shown=shownRest(); f.lastTen=lastTen; f.zeroed=zeroed; f.cta=CTA.t; f.flying=flying.length; return f; };
  /* dựng ban đầu: trạng thái tĩnh của pha hiện tại (mở lại app giữa buổi nghỉ → đúng giờ còn lại, đúng số hạt) */
  (function(){
    var ph=p.phase;
    if(ph==='rest'){ var left=restLeft(); lastTen=left<=10; zeroed=left<=0; lastSec=Math.ceil(left-1e-9); if(lastTen){ F.merge(true,true); digitsAcid(true,true); } }
    presence(setup, PFX.setup, ph==='setup', {instant:true});
    presence(nums, PFX.nums, ph==='active', {instant:true});
    presence(clock, PFX.clock, ph==='rest-setup'||ph==='rest', {instant:true});
    render(1, true);
  })();
  return L;
}

/* =====================================================================
   10 — TỔNG KẾT (từng khách, lần lượt) · XONG
   ===================================================================== */
HOOK['p-summary']=function(){
  var s=state.session, p=s.people[state.sumIdx], two=s.people.length>1;
  $('sm-title').textContent='Tổng kết buổi '+p.no;
  $('sm-who').firstElementChild.textContent=firstName(p.name);
  var exs=s.plan.filter(function(n){ return p.ex[n] && p.ex[n].sets.length; }), tot=0, ok=0;
  exs.forEach(function(n){ p.ex[n].sets.forEach(function(st){ tot++; if(st[2]) ok++; }); });
  var mins=Math.max(1, Math.round((Date.now()-(s.startedAt||Date.now()))/60000));
  $('sm-l1').innerHTML='Đạt <span class="n">'+ok+'</span> / '+tot+' set'; $('sm-l2').textContent=mins+' phút · '+exs.length+' bài';
  $('p-summary')._after=function(){ countUp($('sm-l1').querySelector('.n'), ok, 600, 320); };
  var rows=$('sm-rows'); rows.innerHTML='';
  exs.forEach(function(n,i){
    var r=document.createElement('div'), sets=p.ex[n].sets, W=164, sz=8, gp=6;      /* nửa phải = (345 − 16) / 2 · hạt 8 cách 6 · nhiều set → co lại cho vừa */
    if(sets.length*sz+(sets.length-1)*gp>W){ gp=4; sz=Math.floor((W-gp*(sets.length-1))/sets.length); if(sz<4){ gp=2; sz=Math.max(2, Math.floor((W-gp*(sets.length-1))/sets.length)); } }
    r.className='exrow';
    r.innerHTML='<span class="lt"><span class="no">'+pad2(i+1)+'</span><span class="nm">'+esc(exShort(n))+'</span></span><span class="dots2" style="gap:'+gp+'px">'+sets.map(function(st,j){ return '<i class="'+(st[2]?'':'no')+'" style="width:'+sz+'px;height:'+sz+'px;animation-delay:'+Math.min(0.9,0.3+i*.08+j*.04).toFixed(2)+'s"></i>'; }).join('')+'</span>';
    rows.appendChild(r);
  });
  if(!exs.length){ var e=document.createElement('div'); e.className='lab empty'; e.textContent='CHƯA GHI SET NÀO'; rows.appendChild(e); }
  var f=$('sm-form'); f.innerHTML='';
  for(var i=1;i<=6;i++)(function(i){ var b=document.createElement('button'); b.textContent=i; b.className=p.form===i?'on':''; b.onclick=function(){ p.form=i; f.querySelectorAll('button').forEach(function(x,j){ x.classList.toggle('on', j+1===i); }); saveSession(); }; f.appendChild(b); })(i);
  $('sm-note').value=p.note||'';
  $('sm-go').textContent= state.sumIdx<s.people.length-1 ? 'Tiếp theo' : 'Xác nhận';
  $('sm-scroll').scrollTop=0;
};
/* Quay lại người trước: rút BÀI/CHECKOUT của người đó khỏi hàng đợi (đang giữ, chưa gửi) để không gửi hai lần */
function summaryBack(){
  if(state.sumIdx>0){ state.sumIdx--; var s=state.session, prev=s.people[state.sumIdx]; (prev.evIds||[]).forEach(unqueue); prev.evIds=[]; s.plan.forEach(function(n){ var e=prev.ex[n]; if(e) delete e.sent; }); saveSession(); go('p-summary','back'); }
  else go('p-loop','back');
}
function summaryNext(){
  var s=state.session, p=s.people[state.sumIdx]; p.note=($('sm-note').value||'').trim();
  /* SET của người này nhả ngay; BÀI/CHECKOUT giữ (hold) tới khi xác nhận người cuối — quay lại được */
  s.plan.forEach(function(n){ var e=p.ex[n]; if(e) e.sets.forEach(function(st){ if(st[3]) release(st[3]); }); });
  p.evIds=[];
  s.plan.forEach(function(n){ var e=p.ex[n]; if(!e||!e.sets.length||e.sent) return; e.sent=1; p.evIds.push(enqueue({type:'BÀI', name:p.name, session:p.no, plan:exPart(n), ex:n, set:e.sets.length, ok:e.sets.filter(function(x){return x[2]}).length, main:0}, true).id); });
  p.evIds.push(enqueue({type:'CHECKOUT', name:p.name, session:p.no, plan:'', ex:'', form:p.form||null, note:p.note}, true).id);
  p.okDone=true; p.signedAt=nowHM(); saveSession();
  if(state.sumIdx<s.people.length-1){ state.sumIdx++; go('p-summary','fwd'); return; }
  release();
  state.lastDone=s; state.session=null; saveSession();
  go('p-done','fwd');
  busyLine(true); flush().then(function(){ busyLine(false); }, function(){ busyLine(false); });
}
HOOK['p-done']=function(){
  var s=state.lastDone; if(!s) return; var body=$('dn-body'), pg=$('p-done'), two=s.people.length>1, html='';
  s.people.forEach(function(p){
    var m=findClient(p.name)||{name:p.name,total:0,left:0}, ci=ciFor(p.name), st=ci?ci.status:'ok';
    html+='<div'+(two?' class="half"':'')+'><div class="head"><span class="t1 mq"><span>'+esc(firstName(m.name))+'</span></span></div>'+cardHtml(m, p.no, two?'sm':'big', true)
      +'<div class="lines'+(two?' sm':'')+'"><div class="a ac">Buổi thứ '+p.no+' đã xong</div><div class="a">'+(st==='ok'?'Còn '+m.left+' buổi':st==='pending'?'Đang check-in…':'<span class="er">Chưa check-in</span>')+'</div><div class="lab">ĐÃ KÝ LÚC <span class="ac">'+(p.signedAt||nowHM())+'</span> · '+vnFull(TODAY_ISO)+'</div></div></div>';
  });
  /* gọi lại lúc màn đang hiển thị (ciOk khi check-in xong): giữ vệt, không đếm lại; không đổi thì giữ nguyên DOM */
  var live=state.screen==='p-done' && !pg._after;
  if(!(live && body._sig===html)){ body.innerHTML=html; body._sig=html; if(live) cardsStill(body); }
  body.className='body'+(two?' halves':' st');
  if(!live) pg._after=function(){ cardsIn(body); doneBurst(body, s); };
  if(pendingCount()) setTimeout(function(){ if(pendingCount() && state.screen==='p-done') notify('Đang đồng bộ', {spin:true}); }, 2500);
};
/* màn hoàn thành: khi vệt Acid của thẻ vừa chạy tới buổi hôm nay, hạt Acid bay lên từ đoạn cuối vệt — mỗi set đã ghi là ba hạt
   (cùng họ hạt với đồng hồ nghỉ: Acid → Paper → tan; 24–60 hạt). Hiếm, một lần mỗi buổi → được phép có cảm xúc. */
function doneBurst(body, s){
  if(rm()) return;
  [].forEach.call(body.querySelectorAll('.card'), function(c, i){
    var p=s.people[i]; if(!p) return; var sets=0; Object.keys(p.ex||{}).forEach(function(n){ sets+=(p.ex[n].sets||[]).length; });
    var r=c.getBoundingClientRect(), m=findClient(p.name)||{total:0}, x=parseFloat(c.style.getPropertyValue('--x'))||100, seg=Math.max(14, r.width*(m.total>0?1/m.total:.1));
    var end=r.left+r.width*x/100;
    FX.burst({left:end-seg, top:r.top+8, width:seg, height:r.height-16}, clamp(sets*3, 24, 60), .5);
  });
}
function finish(){ state.lastDone=null; state.session=null; state.sumIdx=0; saveSession(); go('p-home','back'); refreshData(true); flush(); }

/* =====================================================================
   VUỐT XUỐNG ĐỂ LÀM MỚI — dữ liệu + kiểm tra bản mới của app
   ===================================================================== */
var PTR={y0:0, x0:0, on:false, d:0, T:60, busy:false, hold:44, dir:0};
function ptrProgress(p){ $('ptr').querySelector('.fg').style.strokeDashoffset=(69.1*(1-Math.min(1,p))).toFixed(1); }
function ptrMove(d, anim){
  var sc=state.screen&&$(state.screen); if(!sc) return;
  sc.classList.toggle('ptr-anim', !!anim);
  sc.style.transform= d ? 'translateY('+d.toFixed(1)+'px)' : '';   /* kéo cả trang (con của trang có animation fill forwards nên transform inline trên con bị đè) */
  var ptr=$('ptr'), p=Math.min(1, d/PTR.T);
  ptr.style.opacity=d?String(Math.min(1, d/24)):'0'; ptr.style.transform='scale('+(0.6+0.4*p).toFixed(3)+')';
}
function ptrEligible(t){
  if(state.screen==='p-loop' || state.screen==='p-pin' || LIB_OPEN || DRAG) return false;
  if(!t || t.closest('.wheel, .fld, input, textarea, .ptr, .sheet, .mtabsx')) return false;
  var sc=t.closest('.scroll'); if(sc && sc.scrollTop>0) return false;
  return true;
}
document.addEventListener('touchstart', function(e){ if(PTR.busy || e.touches.length!==1) return; PTR.on=ptrEligible(e.target); PTR.y0=e.touches[0].clientY; PTR.x0=e.touches[0].clientX; PTR.d=0; PTR.dir=0; }, {passive:true});
document.addEventListener('touchmove', function(e){
  if(!PTR.on || PTR.busy) return;
  var dy=e.touches[0].clientY-PTR.y0, dx=e.touches[0].clientX-PTR.x0;
  if(!PTR.dir){ if(Math.abs(dy)<6 && Math.abs(dx)<6) return; PTR.dir=(dy>0 && Math.abs(dy)>Math.abs(dx))?1:-1; if(PTR.dir<0){ PTR.on=false; return; } $('ptr').classList.add('show'); $('ptr').classList.remove('done'); }
  if(dy<=0){ PTR.d=0; ptrMove(0,false); return; }
  e.preventDefault();
  PTR.d=120*(1-Math.exp(-dy/160)); ptrMove(PTR.d,false); ptrProgress(PTR.d/PTR.T);
  var armed=PTR.d>=PTR.T; if(armed!==$('ptr').classList.contains('armed')){ $('ptr').classList.toggle('armed',armed); if(armed&&navigator.vibrate) navigator.vibrate(8); }
}, {passive:false});
function ptrEnd(){ if(!PTR.on) return; PTR.on=false; var ptr=$('ptr'); ptr.classList.remove('show'); if(PTR.d>=PTR.T){ ptrRefresh(); return; } ptr.classList.remove('armed'); ptrMove(0,true); ptrProgress(0); }
document.addEventListener('touchend', ptrEnd, {passive:true}); document.addEventListener('touchcancel', ptrEnd, {passive:true});
function checkUpdate(){
  if(DEMO) return Promise.resolve(false);
  try{ if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function(r){ if(r) r.update(); }).catch(function(){}); }catch(e){}
  return fetch('app.js?u='+Date.now(), {cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){ var m=t.match(/APP_VER='([^']*)'/); return !!(m && m[1]!==APP_VER); }).catch(function(){ return false; });
}
function ptrRefresh(){
  var ptr=$('ptr'), fg=ptr.querySelector('.fg');
  PTR.busy=true; ptr.classList.add('load'); ptr.classList.remove('armed'); fg.style.strokeDashoffset='';
  ptrMove(PTR.hold,true);
  var t0=Date.now(), upd=Promise.race([checkUpdate(), new Promise(function(r){ setTimeout(function(){ r(false); },1500); })]);
  var data=(authed()&&!state.loading) ? refreshData(true).then(function(){ return true; }, function(){ return false; }) : Promise.resolve(null);
  busyLine(true); Promise.all([data, flush().catch(function(){})]).then(function(r){ busyLine(false); if(r[0]===true && authed()) notify('Đã làm mới'); else if(r[0]===false) notify('Máy chủ chậm', {err:true}); });
  upd.then(function(isNew){
    var wait=Math.max(0, 650-(Date.now()-t0));
    setTimeout(function(){
      ptr.classList.remove('load'); ptr.classList.add('done');
      if(isNew){ setTimeout(function(){ location.reload(); }, 220); return; }
      setTimeout(function(){ ptrMove(0,true); ptr.style.opacity='0'; ptr.style.transform='scale(.6)'; PTR.busy=false; PTR.d=0; setTimeout(function(){ ptr.classList.remove('done'); ptrProgress(0); }, 250); }, 260);
    }, wait);
  });
}

/* ---------------- khởi động ---------------- */
(function boot(){
  refreshIp();
  var p=SES('lb_pin'), acc=accFind(p);
  if(acc){ var c=loadCache(acc.coach); if(c){ if(acc.adm) setAdmin(true, p); else state.pin=p; buildClients(c.res); state.stats=loadStats(state.coach); state.dataTs=c.ts; var ss=loadSession(); if(ss){ state.session=ss; go(ss.started&&ss.plan.length?'p-loop':'p-plan','fwd'); } else go('p-home','fwd'); refreshData(true); flush(); return; } }
  go('p-pin','fwd');
})();
if('serviceWorker' in navigator && !DEMO && location.protocol==='https:'){ navigator.serviceWorker.register('sw.js').catch(function(){}); }

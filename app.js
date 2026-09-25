/* =====================================================================
   B0DY · Coach app (logbook) — v2
   UI theo Figma "Exploring UX journey" (714soNBELbh3mro8qZZ4Ar · 117:2).
   Lớp hạ tầng (API, outbox có id, cache stale-while-revalidate, PWA) kế thừa v1.7.
   Data thật qua Cloudflare Worker + Apps Script (action coach / checkin_coach / log / stats).
   Không có API hoặc ?demo → chạy bằng data mẫu (không gọi mạng).
   ===================================================================== */
'use strict';
var $=function(id){ return document.getElementById(id); };
var APP_VER='v2.3.3';

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
  body.ip=state.ip; if(state.pin && !body.pin) body.pin=state.pin;
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
function saveCache(res){ SS('lb_data_'+res.coach, JSON.stringify({ts:Date.now(), res:res})); SS('lb_last', JSON.stringify({coach:res.coach, h:hashPin(state.pin)})); }
function loadCache(coach){ try{ var c=JSON.parse(ST('lb_data_'+coach)||'null'); return c&&c.res?c:null; }catch(e){ return null; } }
function hashPin(p){ var h=2166136261; p=String(p||''); for(var i=0;i<p.length;i++){ h^=p.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h.toString(16); }
function findClient(name){ return (state.clients||[]).filter(function(c){return c.name===name})[0]; }
/* đồng bộ ngầm: lấy lại toàn bộ (stale-while-revalidate) */
function refreshData(quiet){
  if(state._refreshing) return state._refreshing;
  var t0=Date.now();
  state._refreshing=api({action:'coach'}, 2, 600, 0, 30000).then(function(res){
    state._refreshing=null;
    if(!res||!res.ok){ if(res&&res.error==='sai_pin'){ logout('MÃ PIN KHÔNG CÒN HIỆU LỰC'); } return; }
    var before=JSON.stringify(state.clients);
    buildClients(res, t0); saveCache(res); state.dataTs=Date.now();
    if(state.client) state.client=findClient(state.client.name)||state.client;
    if(JSON.stringify(state.clients)!==before && HOOK[state.screen] && REFRESHABLE[state.screen]){ HOOK[state.screen](null,true); afterShow($(state.screen)); }
    refreshStats(true);
  }).catch(function(){ state._refreshing=null; if(!quiet) notify('Máy chủ chậm', {err:true}); });
  return state._refreshing;
}
var REFRESHABLE={'p-home':1,'p-clients':1,'p-profile':1,'p-pick':1,'p-confirm':1,'p-measure':1,'p-perf':1};
/* thống kê cho trang chủ + hiệu suất tập (action stats · Apps Script). Thiếu cũng không sao: ô hiện "—". */
function refreshStats(quiet){
  if(state._stats) return state._stats;
  state._stats=api({action:'stats', month:TODAY_ISO.slice(0,7), _gas:1}, 1, 800, 0, 30000).then(function(res){
    state._stats=null;
    if(!res||!res.ok) return;
    state.stats=res; SS('lb_stats_'+state.coach, JSON.stringify({ts:Date.now(), res:res}));
    if(state.screen==='p-home') renderHome(false);
    else if(state.screen==='p-perf') renderPerf(false);
    else if(state.screen==='p-confirm') HOOK['p-confirm'](null,true);
  }).catch(function(){ state._stats=null; });
  return state._stats;
}
function loadStats(coach){ try{ var c=JSON.parse(ST('lb_stats_'+coach)||'null'); return c&&c.res?c.res:null; }catch(e){ return null; } }
function logout(msg){ state.pin=''; SES('lb_pin',null); state.clients=[]; state.stats=null; go('p-pin','back'); if(msg) setTimeout(function(){ pinError(msg); },300); }

/* ---- hàng đợi ghi (outbox): UI cập nhật ngay, nền gửi theo lô, id chống trùng ----
   ev.hold=1: sự kiện "đang giữ" (set vừa ghi, còn hoàn tác được) → chưa gửi cho tới khi release(). */
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
function flush(){
  if(OUT.busy || !state.pin) return Promise.resolve();
  var batch=OUT.q.filter(function(e){ return !e.hold; }).slice(0,150), ids={}; batch.forEach(function(e){ ids[e.id]=1; });
  if(!batch.length) return Promise.resolve();
  OUT.busy=true;
  return api({action:'log', events:batch}, 1, 800, 0, 30000).then(function(res){
    OUT.busy=false;
    if(res&&res.ok){ OUT.q=OUT.q.filter(function(e){ return !ids[e.id]; }); outSave(); OUT.fail=0; if(OUT.q.some(function(e){return !e.hold})) flush(); }
    else if(res&&res.error==='sai_pin'){ logout('MÃ PIN KHÔNG CÒN HIỆU LỰC'); }
    else { OUT.fail=(OUT.fail||0)+1; }
  }).catch(function(){ OUT.busy=false; OUT.fail=(OUT.fail||0)+1; });
}
function pendingCount(){ return OUT.q.filter(function(e){return !e.hold}).length; }
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
  D[0].snap.last={'Lat Pulldown (Wide Pronated Grip)':{kg:40,rep:12,d:'2026-09-22'},'Seated Cable Row (Close Neutral Grip)':{kg:55,rep:10,d:'2026-09-22'},'Zercher Squat':{kg:60,rep:8,d:'2026-09-18'},'Lying Leg Curl':{kg:35,rep:12,d:'2026-09-18'}};
  var days={}, d0=TODAY_ISO.slice(0,7);
  for(var i=1;i<=31;i++){ var iso=d0+'-'+pad2(i); if(iso>TODAY_ISO) break; if(i%7!==0) days[iso]=2+((i*7)%6); }
  var hist={}; hist[D[0].name]={'Lat Pulldown (Wide Pronated Grip)':[{d:'2026-08-25',kg:40,rep:12,ok:1},{d:'2026-09-08',kg:40,rep:12,ok:1},{d:'2026-09-22',kg:40,rep:12,ok:1}],'Seated Cable Row (Close Neutral Grip)':[{d:'2026-09-08',kg:55,rep:10,ok:1},{d:'2026-09-22',kg:55,rep:10,ok:0}]};
  var per={}; D.forEach(function(c,i){ per[c.name]={m:[12,11,9,7,0,3,0][i], last:['2026-09-16','2026-09-22','2026-09-20','2026-09-19','','2026-09-21',''][i]}; });
  var ci={checked:{}, at:{}}; try{ ci=JSON.parse(SES('demo_ci')||'null')||ci; }catch(e){}   /* demo: check-in hôm nay giữ qua reload (như máy chủ thật) */
  DEMO_DB={clients:D, checked:ci.checked||{}, at:ci.at||{}, log:[], stats:{ok:true, month:d0, days:days, perClient:per, com:{month:d0,total:9769250}, hist:hist}};
  return DEMO_DB;
}
function demoApi(body){
  var db=demoDb();
  return new Promise(function(res){ setTimeout(function(){
    if(body.action==='ping') return res({ok:true,pong:1});
    if(body.action==='admin') return res(body.apin==='0000' ? {ok:true} : {ok:false,error:'sai_pin'});
    if(body.action==='setip') return res(body.apin==='0000' ? {ok:true, ip:body.ip||'demo'} : {ok:false,error:'sai_pin'});
    if(body.action==='iplist'||body.action==='addip'||body.action==='delip'){ if(body.apin!=='0000') return res({ok:false,error:'sai_pin'});
      var ips=[]; try{ ips=JSON.parse(SES('demo_ips')||'null')||['203.0.113.7','']; }catch(e){ ips=['203.0.113.7','']; }
      if(body.action==='addip'){ var ip=body.ip||'198.51.100.'+(1+Math.floor(Math.random()*200)); if(ips.indexOf(ip)<0){ var f=ips.indexOf(''); if(f<0) return res({ok:false,error:'full'}); ips[f]=ip; } }
      if(body.action==='delip'){ var s=+body.slot; if(s===1||s===2) ips[s-1]=''; }
      SES('demo_ips', JSON.stringify(ips)); return res({ok:true, ips:ips}); }
    if(body.pin==='0000') return res({ok:false,error:'sai_pin'});
    if(body.action==='coach'){ var snap={}; db.clients.forEach(function(c){ snap[c.name]=c.snap; });
      return res({ok:true, coach:'Quyết Hán', members:db.clients.map(function(c){return {name:c.name,done:c.done,total:c.total,left:c.left,coach:c.coach,start:c.start,exp:c.exp,kind:c.kind||'',checked:db.checked[c.name]===isoToday(),signed:db.checked[c.name]===isoToday()?(db.at[c.name]||''):''}}), snapshot:JSON.parse(JSON.stringify(snap)), library:null, today:isoToday()}); }
    if(body.action==='stats'){ var st=JSON.parse(JSON.stringify(db.stats)); var t=0; Object.keys(st.days).forEach(function(k){ t+=st.days[k]; }); st.monthTotal=t; return res(st); }
    if(body.action==='checkin_coach'){ var c=db.clients.filter(function(x){return x.name===body.name})[0]; if(!c) return res({ok:false,error:'khong_phai_khach_cua_ban'});
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

var state={screen:null, pin:'', apin:'', coach:'', clients:[], lib:null, stats:null, ip:ST('lb_ip')||'', dataTs:0, loading:false,
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
    cur.classList.remove('enter-fwd','enter-back','leave-fwd','leave-back');
    void cur.offsetWidth;
    cur.classList.add(dir==='fwd'?'leave-fwd':'leave-back');
    cur._t=(function(c){ return setTimeout(function(){ c.classList.remove('on','leave-fwd','leave-back'); navClean(c); c._t=0; }, 230); })(cur);
  }
  if(el._t){ clearTimeout(el._t); el._t=0; }
  el.classList.remove('leave-fwd','leave-back','enter-fwd','enter-back');
  el.classList.add('on'); void el.offsetWidth;
  el.classList.add(dir==='fwd'?'enter-fwd':'enter-back');
  el._t=setTimeout(function(){ navClean(el); el._t=0; }, 700);   /* giữ class enter-*: các animation fill forwards (.st>*) cần nó */
  state.screen=id;
}
var HOOK={};
function go(id, dir){
  mqStopAll(); closeLib(true);
  if(HOOK[id]) HOOK[id](dir);
  show(id, dir);
  var s=$(id);
  if(id!=='p-loop') loopSleep();
  syncTheme();
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
var PILL={t:0, y0:0, drag:false};
function notify(text, o){
  o=o||{}; var el=$('pill'); clearTimeout(PILL.t);
  var was=el.classList.contains('on'), onAcid=(state.screen==='p-loop' && LOOPS[0] && LOOPS[0].root.classList.contains('acid'));
  el.className='pill'+(was?' on':'')+(o.err?' err':'')+(onAcid?' onacid':'');
  el.innerHTML=(o.spin?'<i class="spin"></i>':ico(o.icon||(o.err?'i-x':'i-check')))+'<span class="tx">'+esc(text).replace(/(\d[\d:,\.\/×]*)/g,'<span class="n">$1</span>')+'</span>'+(o.action?'<button class="act">'+esc(o.action.label)+'</button>':'');
  var act=el.querySelector('.act'); if(act) act.onclick=function(e){ e.stopPropagation(); hidePill(); o.action.fn(); };
  el.onclick=function(){ if(!PILL.drag) hidePill(); };
  if(!was){ void el.offsetWidth; el.classList.add('on'); }
  PILL.t=setTimeout(function(){ hidePill(); }, o.ms||(o.err||o.sticky?6000:2400));
}
function hidePill(){ clearTimeout(PILL.t); var el=$('pill'); el.classList.remove('on','drag'); el.style.transform=''; }
var hideIsl=hidePill;
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

/* ---- FOG: mask trong suốt của chính nội dung, co theo vị trí cuộn ---- */
var FOG_TOP=32, FOG_BOT=72;
/* khoảng ghost cuối vùng cuộn = chiều cao đúng bằng phần tử cuối (tạo nhịp với nav bên dưới) */
function tailPad(el){
  if(el.id==='pl-scroll') return;
  var lc=el.lastElementChild; while(lc && lc.lastElementChild && /\b(exrows|rows|next)\b/.test(lc.className)) lc=lc.lastElementChild;
  var pad=lc ? Math.round(lc.getBoundingClientRect().height) : 0;
  if(el._tp!==pad){ el._tp=pad; el.style.paddingBottom=pad+'px'; }
}
function fogUpdate(el){
  tailPad(el);
  var top=el._fogTop!=null?el._fogTop:FOG_TOP, bot=el._fogBot!=null?el._fogBot:FOG_BOT;
  var t=Math.min(top, el.scrollTop), b=Math.min(bot, el.scrollHeight-el.clientHeight-el.scrollTop);
  if(t<1) t=0; if(b<1) b=0;
  var m='linear-gradient(to bottom,'+(t?'transparent 0,#000 '+t+'px':'#000 0')+',#000 calc(100% - '+b+'px),'+(b?'transparent':'#000')+' 100%)';
  if(el._fogM!==m){ el._fogM=m; el.style.webkitMaskImage=m; el.style.maskImage=m; }
}
document.querySelectorAll('.scroll').forEach(function(el){
  el.addEventListener('scroll', function(){ fogUpdate(el); }, {passive:true});
  if(window.ResizeObserver){ new ResizeObserver(function(){ fogUpdate(el); }).observe(el); }
});

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
   opts: {values, index, format, live, row (px/1 bước), z (bán kính trụ), boxH, ghost, onPick, cls, big}
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
  host.addEventListener('pointerdown', function(e){ dragging=true; moved=0; startY=e.clientY; startPos=pos; try{ host.setPointerCapture(e.pointerId); }catch(x){} cancelAnimationFrame(raf); open(); e.stopPropagation(); });
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
  api={render:render, close:close, set:function(v){ var k=opts.values.indexOf(v); if(k<0){ var best=0; for(var i=0;i<opts.values.length;i++) if(Math.abs(opts.values[i]-v)<Math.abs(opts.values[best]-v)) best=i; k=best; } pos=k; lastIdx=k; render(); }, value:function(){ return opts.values[Math.round(pos)]; }, setValues:function(vals){ opts.values=vals; } };
  render(); return api;
}
function range(a,b,step){ var o=[]; for(var v=a; v<=b+1e-9; v+=step) o.push(Math.round(v*100)/100); return o; }
var REPS_VALS=range(1,50,1), KG_VALS=range(0,300,2.5), REST_VALS=range(15,600,15);

/* =====================================================================
   VÀNH NHỊP — canvas 208 chấm, chase + xoáy vào (từ artifact "Loop buổi tập")
   ===================================================================== */
var RING={SPEED:1.33, N:208, BAND:0.21, GAIN:0.81, G_RATE:0.10, G_DEPTH:0.40, G_SPREAD:0.20, G_ASYM:0.38, G_LIFT:0.20, G_SWIRL:0.70, YAW:0.20, PITCH:0.24, RX:88, RY:115, TUBE:18};
var RING_DOTS=(function(){ var seed=987654321, d=[]; function rnd(){ seed=(seed*1664525+1013904223)%4294967296; return seed/4294967296; }
  for(var i=0;i<RING.N;i++) d.push({a:rnd()*Math.PI*2, b:rnd()*Math.PI*2, tr:Math.sqrt(rnd()), r:0.75+1.9*Math.pow(rnd(),2.2), al:0.10+0.26*rnd(), s1:rnd(), s2:rnd()}); return d; })();
function Ring(cv){
  var ctx=cv.getContext('2d'), W=393, Hh=852, buf=new Array(RING.N), cyw=Math.cos(RING.YAW), syw=Math.sin(RING.YAW), cpt=Math.cos(RING.PITCH), spt=Math.sin(RING.PITCH);
  var r={on:false, alpha:1, scale:1, cx:0, cy:0, h:324, slow:1, tint:'ink', dot:true, calm:false};
  function wrapDist(d){ d=d-Math.round(d); return Math.abs(d); }
  function falloff(d,w){ var u=d/w; return u>=1?0:Math.pow(1-u*u,2); }
  function phase(t){ return t-Math.floor(t); }
  function gather(u){ u=u-Math.floor(u); if(u<RING.G_ASYM) return (1-Math.cos(Math.PI*u/RING.G_ASYM))/2; return (1+Math.cos(Math.PI*(u-RING.G_ASYM)/(1-RING.G_ASYM)))/2; }
  r.size=function(){ var b=cv.getBoundingClientRect(); W=Math.max(1,Math.round(b.width)); Hh=Math.max(1,Math.round(b.height)); var dpr=Math.min(window.devicePixelRatio||1,2.5); cv.width=Math.round(W*dpr); cv.height=Math.round(Hh*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); };
  r.draw=function(now){
    ctx.clearRect(0,0,W,Hh);
    if(!r.on || r.alpha<=0.001) return;
    var SC=r.h/(2*(RING.RY+RING.TUBE))*r.scale, t=now/1000*r.slow, chasePh=phase(t*0.30*RING.SPEED)*2, breath=phase(t*RING.G_RATE*RING.SPEED);
    var ACID=r.tint==='acid'?[10,10,10]:[212,255,0], PAPER=r.tint==='acid'?[10,10,10]:[250,250,250];
    for(var i=0;i<RING.N;i++){
      var d=RING_DOTS[i], k=r.calm?0:gather(breath+d.s1*RING.G_SPREAD), pull=1-RING.G_DEPTH*k*(0.45+0.55*d.s2), a=d.a+RING.G_SWIRL*k*(0.55+0.45*d.s1);
      var tt=RING.TUBE*d.tr, cb=Math.cos(d.b), sb=Math.sin(d.b);
      var x0=Math.cos(a)*(RING.RX+tt*cb)*pull, y0=Math.sin(a)*(RING.RY+tt*cb)*pull, z0=tt*sb*pull;
      var x1=x0*cyw+z0*syw, z1=-x0*syw+z0*cyw, y2=y0*cpt-z1*spt, z2=y0*spt+z1*cpt;
      var sp=540/(540+z2), dep=(z2+110)/220; dep=dep<0?0:(dep>1?1:dep); dep=1-dep;
      var e=falloff(wrapDist((d.a/(Math.PI*2)+0.25)*2-chasePh), RING.BAND*1.4)*RING.GAIN;
      var alpha=(d.al+0.78*e+RING.G_LIFT*k)*(0.32+0.68*dep);
      buf[i]={x:r.cx+x1*sp*SC, y:r.cy+y2*sp*SC, rr:(d.r*(1+2.6*e))*Math.pow(sp,1.6)*SC, a:Math.max(0,Math.min(1,alpha))*r.alpha, c:(e>0.72&&!r.calm)?ACID:PAPER, z:z2};
    }
    buf.sort(function(p,q){ return q.z-p.z; });
    for(var j=0;j<RING.N;j++){ var p=buf[j]; if(p.rr<0.22) continue; ctx.globalAlpha=p.a; ctx.fillStyle='rgb('+p.c[0]+','+p.c[1]+','+p.c[2]+')'; ctx.beginPath(); ctx.arc(p.x,p.y,p.rr,0,6.2832); ctx.fill(); }
    if(r.dot){ ctx.globalAlpha=0.9*r.alpha; ctx.fillStyle=r.tint==='acid'?'rgb(10,10,10)':'rgb(250,250,250)'; ctx.beginPath(); ctx.arc(r.cx,r.cy,6.2*SC,0,6.2832); ctx.fill(); } ctx.globalAlpha=1;
  };
  r.fade=function(to, ms){ var from=r.alpha, t0=performance.now(); (function step(now){ var k=Math.min(1,(now-t0)/ms), e=1-Math.pow(1-k,3); r.alpha=from+(to-from)*e; r.scale=to>from?0.55+0.45*e:1; if(k<1) requestAnimationFrame(step); else if(to===0) r.on=false; })(t0); };
  r.size(); return r;
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
      if(pinState.val.length===4){ setTimeout(tryPin,140); }
    };
    pad.appendChild(b);
  });
}
function renderDots(){ var el=$('pin-dots'); el.classList.remove('err'); el.innerHTML=''; for(var i=0;i<4;i++){ var d=document.createElement('div'); d.className='dot'+(i<pinState.val.length?' f':''); el.appendChild(d); } }
function pinError(msg){ $('pin-err').textContent=msg; pinState.val=''; var el=$('pin-dots'); el.innerHTML=''; for(var i=0;i<4;i++){ var d=document.createElement('div'); d.className='dot'; el.appendChild(d); } el.classList.add('err'); setTimeout(function(){ el.classList.remove('err'); }, 500); }
function tryPin(){
  var pin=pinState.val, lastc=null; try{ lastc=JSON.parse(ST('lb_last')||'null'); }catch(e){}
  if(lastc && lastc.h===hashPin(pin)){
    var c=loadCache(lastc.coach);
    if(c){ state.pin=pin; SES('lb_pin',pin); buildClients(c.res); state.stats=loadStats(state.coach); state.dataTs=c.ts; go('p-home','fwd'); refreshData(true); flush(); return; }
  }
  state.pin=pin; state.coach=''; state.clients=[]; state.stats=null; state.loading=true; state.dataTs=Date.now();
  go('p-home','fwd'); busyLine(true); var t0=Date.now();
  api({action:'coach'}, 2, 600, 0, 30000).then(function(res){
    if(state.pin!==pin){ busyLine(false); return; }
    if(res&&res.ok){ busyLine(false); state.loading=false; SES('lb_pin',pin); buildClients(res, t0); saveCache(res); state.dataTs=Date.now(); state.stats=loadStats(state.coach); if(state.screen==='p-home') renderHome(true); refreshStats(true); flush(); return; }
    if(res&&res.error==='sai_pin'){
      return api({action:'admin', apin:pin}, 2, 600, 0, 30000).then(function(ad){ busyLine(false); state.loading=false; if(ad&&ad.ok){ openAdminPanel(pin); return; } backToPin('MÃ PIN KHÔNG ĐÚNG'); });
    }
    busyLine(false); backToPin('MÁY CHỦ LỖI — THỬ LẠI');
  }).catch(function(){ busyLine(false); backToPin('MÁY CHỦ CHẬM — THỬ LẠI'); });
}
function backToPin(msg){ state.pin=''; state.loading=false; state.clients=[]; go('p-pin','back'); setTimeout(function(){ pinError(msg); },300); }
HOOK['p-pin']=function(){ startPin(); warm(); };
/* chẩn đoán bố cục trên máy thật: chạm wordmark 5 lần */
(function(){ var n=0, t=0; $('wordmark').addEventListener('click', function(){
  var now=Date.now(); n=(now-t<1500)?n+1:1; t=now; if(n<5) return; n=0;
  var pr=document.createElement('div'); pr.style.cssText='position:fixed;left:0;top:0;width:0;height:0;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0;visibility:hidden'; document.body.appendChild(pr);
  var cs=getComputedStyle(pr), vv=window.visualViewport;
  $('diag').hidden=false;
  $('diag').textContent='WIN '+innerWidth+'×'+innerHeight+' · SCREEN '+screen.width+'×'+screen.height+' · VV '+(vv?Math.round(vv.height):'-')+' · SAT '+cs.paddingTop+' · SAB '+cs.paddingBottom+' · '+(matchMedia('(display-mode: standalone)').matches?'STANDALONE':'BROWSER')+' · DPR '+devicePixelRatio+' · '+APP_VER;
  pr.remove();
}); })();

/* ---- ADMIN ---- */
function openAdminPanel(pin){ state.apin=pin; state.pin=''; state.clients=[]; go('p-admin','fwd'); }
/* ADMIN — tối đa 2 IP được check-in (cả hai đều hợp lệ): ô 1 = IP phòng (STUDIO_IP), ô 2 = STUDIO_IP2. Thêm = lấy IP thiết bị này vào ô trống; × để xoá. */
var ADM={ips:['','']};
HOOK['p-admin']=function(){ $('am-ip').textContent=state.ip||'—'; renderIps(); refreshIp().then(function(){ if(state.screen==='p-admin') $('am-ip').textContent=state.ip||'—'; renderIps(); }); loadIps(); };
function renderIps(){
  var el=$('am-list'), ips=ADM.ips, n=ips.filter(String).length; el.innerHTML='';
  $('am-note').textContent='IP ĐƯỢC CHECK-IN · '+n+'/2';
  ips.forEach(function(ip,i){
    var b=document.createElement('div'); b.className='row'+(ip?'':' off');
    b.innerHTML='<span class="lt"><span class="nm mono">'+(ip?esc(ip):'—')+'</span><span class="lab">'+(i===0?'IP PHÒNG':'IP THỨ 2')+(ip && ip===state.ip?' · THIẾT BỊ NÀY':'')+'</span></span>'+(ip?'<button class="ghost x" aria-label="Xoá IP">'+ico('i-x')+'</button>':'');
    var x=b.querySelector('.x'); if(x) x.onclick=function(){ delIp(i+1); };
    el.appendChild(b);
  });
  var add=$('am-add'); var full=n>=2, dup=!!state.ip && ips.indexOf(state.ip)>=0;
  add.classList.toggle('off', full || dup || !state.ip || !!ADM.busy); add.textContent= dup ? 'IP này đã có' : full ? 'Đã đủ 2 IP · xoá bớt' : 'Thêm IP';
}
function ipsFrom(res){ ADM.ips=[String((res.ips&&res.ips[0])||res.ip||''), String((res.ips&&res.ips[1])||'')]; renderIps(); }
function loadIps(){ api({action:'iplist', pin:state.apin, apin:state.apin}, 1, 800, 0, 30000).then(function(res){ if(res&&res.ok) ipsFrom(res); else if(res&&res.error==='unknown_action') notify('Backend chưa có iplist', {err:true}); }).catch(function(){}); }
function addIp(){
  if(ADM.busy) return; ADM.busy=true; busyLine(true); renderIps();
  refreshIp().then(function(){ $('am-ip').textContent=state.ip||'—'; return api({action:'addip', pin:state.apin, apin:state.apin}, 1, 800, 0, 30000); })
  .then(function(res){ busyLine(false); ADM.busy=false;
    if(res&&res.ok){ ipsFrom(res); notify('Đã thêm IP'); }
    else { renderIps(); notify(res&&res.error==='full'?'Đã đủ 2 IP':res&&res.error==='unknown_action'?'Backend chưa có addip':'Không thêm được', {err:true}); } })
  .catch(function(){ busyLine(false); ADM.busy=false; renderIps(); notify('Máy chủ chậm', {err:true}); });
}
function delIp(slot){
  if(ADM.busy) return; ADM.busy=true; busyLine(true);
  api({action:'delip', slot:slot, pin:state.apin, apin:state.apin}, 1, 800, 0, 30000).then(function(res){ busyLine(false); ADM.busy=false;
    if(res&&res.ok){ ipsFrom(res); notify('Đã xoá IP'); } else { renderIps(); notify('Không xoá được', {err:true}); } })
  .catch(function(){ busyLine(false); ADM.busy=false; renderIps(); notify('Máy chủ chậm', {err:true}); });
}
function adminDone(){ state.apin=''; go('p-pin','back'); }

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
function heroL2(to){ var ht=$('h-taught'), from=heroNum(); ht.innerHTML='Đã dạy <span class="n">'+from+'</span> buổi'; tweenNum(ht.querySelector('.n'), from, to, 260); }
function heroDay(k, v){ var sw=HB.mode!=='day'; HB.mode='day'; heroL1(k.slice(8,10)+'/'+k.slice(5,7), sw); heroL2(v); }
function heroMonth(){
  clearTimeout(HB.t); HB.t=0; if(HB.cur){ HB.cur.classList.remove('hit'); HB.cur=null; }
  if(HB.mode==='month') return; HB.mode='month';
  heroL1('Tháng '+TODAY_ISO.slice(5,7), true);
  if(HB.total==null) $('h-taught').textContent='Đã dạy — buổi'; else heroL2(HB.total);
}
function renderHome(animate){
  var s=state.stats, m=monthOf(TODAY_ISO), cur=s && s.month===m;
  $('h-name').textContent=state.loading?'Đang tải…':coachName(state.coach);
  clearTimeout(HB.t); HB.t=0; HB.mode='month'; HB.cur=null; HB.scrub=false;
  heroL1('Tháng '+TODAY_ISO.slice(5,7), false);
  var total=cur ? (s.monthTotal!=null ? s.monthTotal : Object.keys(s.days||{}).reduce(function(a,k){ return k.slice(0,7)===m ? a+(+s.days[k]||0) : a; },0)) : null;
  HB.total=total;
  var ht=$('h-taught');
  if(total==null) ht.textContent='Đã dạy — buổi';
  else { ht.innerHTML='Đã dạy <span class="n">'+total+'</span> buổi'; if(animate) countUp(ht.querySelector('.n'), total, 700, 420); }
  renderBars(animate);
  var active=state.clients.filter(function(c){ return c.left>0; }).length;
  var slow=slowClients(), today=state.clients.filter(function(c){ return c.checked || (ciFor(c.name)&&ciFor(c.name).status==='ok'); }).length;
  var com=s && s.com && s.com.total!=null ? s.com : null, comLab='Hoa hồng'+(com && com.month && com.month!==m ? ' T'+(+com.month.slice(5,7)) : '');
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
function openClientSheet(kind){ CS_KIND=kind; CS_OPEN=true; $('cs-q').value=''; renderClientSheet(true); $('cs-dim').classList.add('on'); $('csheet').classList.add('on'); }
function closeClientSheet(silent){ if(!CS_OPEN) return; CS_OPEN=false; $('cs-dim').classList.remove('on'); $('csheet').classList.remove('on'); $('csheet').style.transform=''; }
function renderClientSheet(animate){
  var kind=CS_KIND, q=norm($('cs-q').value), el=$('cs-list'), title=kind==='slow'?'KHÁCH TẬP CHẬM':'KHÁCH HÔM NAY'; el.innerHTML=''; var i=0;
  var all=csClients(kind), list=all.filter(function(m){ return !q || norm(m.name).indexOf(q)>=0; });
  if(list.length){
    var d=document.createElement('div'); d.className='lab sec'; d.textContent=title+' · '+list.length; el.appendChild(d);
    list.forEach(function(m){ el.appendChild(clientRow(m, animate, i++, csMeta(m, kind), function(){ closeClientSheet(true); state.client=m; state.back='p-home'; go('p-profile','fwd'); }, kind==='today'?false:undefined)); });   /* khách hôm nay: không icon mũi tên */
  } else { var e=document.createElement('div'); e.className='lab empty'; e.textContent= q && all.length ? 'KHÔNG TÌM THẤY TÊN NÀY' : 'CHƯA CÓ '+title; el.appendChild(e); }
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
function clientMeta(m){ return 'GÓI '+m.total+' · '+(m.left>0?'CÒN '+m.left+' BUỔI':'ĐÃ HẾT'); }
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
    list.forEach(function(m){ el.appendChild(clientRow(m, animate, i++, clientMeta(m)+(slowN[m.name]?SLOW_ICO:''), function(){ state.client=m; state.back='p-clients'; go('p-profile','fwd'); })); });
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
      sub.innerHTML=rows.slice(0,12).map(function(r){ return '<div class="kv"><span>'+vnLong(r.d)+'</span><span class="v'+(r.ok?'':' er')+'">'+r.rep+' × '+fmtN(r.kg)+'<i>KG</i></span></div>'; }).join('');
      b.onclick=function(){ b.classList.toggle('open'); setTimeout(function(){ fogUpdate(el); },20); };
      el.appendChild(b); el.appendChild(sub);
    });
  });
  Object.keys(hist).forEach(function(ex){ if(libEntries().some(function(e){return e.name===ex})) return; if(q && norm(ex).indexOf(q)<0) return; any=true;
    var b=document.createElement('button'); b.className='row'; b.innerHTML='<span class="lt"><span class="nm mq"><span>'+esc(exShort(ex))+'</span></span><span class="lab">BÀI CŨ</span></span>'+ico('i-chev','dn');
    var sub=document.createElement('div'); sub.className='xp'; sub.innerHTML=hist[ex].slice(0,12).map(function(r){ return '<div class="kv"><span>'+vnLong(r.d)+'</span><span class="v'+(r.ok?'':' er')+'">'+r.rep+' × '+fmtN(r.kg)+'<i>KG</i></span></div>'; }).join('');
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
  else b=clientRow(m, animate, i, clientMeta(m), function(){ state.sel=[m.name]; if(navigator.vibrate) navigator.vibrate(6); go('p-confirm','fwd'); }, 'i-arr');
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
    if(err==='sai_pin'){ delete CI[m.name]; ciSave(); logout('MÃ PIN KHÔNG CÒN HIỆU LỰC'); return false; }
    ciFail(m, ci, err==='wrong_ip' ? 'Chỉ check-in được ở phòng' : err==='khong_phai_khach_cua_ban' ? 'Không phải khách của bạn' : 'Chưa check-in', many);
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
function openLib(){ LIB_OPEN=true; $('lib-q').value=''; renderLib(true); $('lib-dim').classList.add('on'); $('lib').classList.add('on'); }
function closeLib(silent){ if(!LIB_OPEN) return; LIB_OPEN=false; $('lib-dim').classList.remove('on'); $('lib').classList.remove('on'); if(!silent && state.session && state.screen==='p-plan') renderPlan(false); }
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
   ===================================================================== */
var LOOPS=[], LOOP_RAF=0, LOOP_ON=false, CURVE='cubic-bezier(.22,.85,.22,1)', FOCUS=-1;
/* thanh trạng thái iOS (theme-color) đi theo màu nền phần đỉnh: Acid khi nửa trên đang nghỉ */
function syncTheme(){ var acid=(state.screen==='p-loop' && LOOPS[0] && LOOPS[0].root.classList.contains('acid')); var m=document.querySelector('meta[name=theme-color]'); var c=acid?'#D4FF00':'#0A0A0A'; if(m && m.getAttribute('content')!==c) m.setAttribute('content', c); }
/* 1:2 — chỉ một nửa được chọn: nửa đó hiện nút chức năng, nửa kia ẩn. Chạm lại nửa đang chọn (ngoài bánh xe/nút) → ẩn. */
function setFocus(i){ FOCUS=i; LOOPS.forEach(function(l){ l.root.classList.toggle('ovl', l.idx===i); }); }
HOOK['p-loop']=function(){ buildLoops(); };
function buildLoops(){
  var host=$('loop-host'), s=state.session; host.innerHTML=''; LOOPS=[]; host.className='split'+(s&&s.people.length>1?' two':''); FOCUS=-1;
  if(!s){ go('p-home','back'); return; }
  s.people.forEach(function(p,i){ primePerson(p); LOOPS.push(Loop(host, p, {half:s.people.length>1, idx:i})); });
  loopWake();
  $('p-loop')._after=function(){ LOOPS.forEach(function(l){ l.layout(); }); };
}
function loopWake(){ if(LOOP_ON) return; LOOP_ON=true; LOOP_RAF=requestAnimationFrame(loopTick); }
function loopSleep(){ LOOP_ON=false; cancelAnimationFrame(LOOP_RAF); }
function loopTick(now){ if(!LOOP_ON) return; LOOPS.forEach(function(l){ l.tick(now); }); LOOP_RAF=requestAnimationFrame(loopTick); }
window.addEventListener('resize', function(){ LOOPS.forEach(function(l){ l.layout(); }); });
document.addEventListener('visibilitychange', function(){ if(state.screen!=='p-loop') return; if(document.hidden) loopSleep(); else loopWake(); });

function Loop(host, p, o){
  var s=state.session, root=document.createElement('div'); root.className='loop';
  var who='<span class="who"'+(o.half?'':' hidden')+'>'+esc(firstName(p.name))+'</span>';
  root.innerHTML=
   '<canvas class="dimable"></canvas>'+
   /* thiết lập set: reps 112 · × 72 · kg 112 (Figma 449:827) */
   '<div class="setup"><div class="wheel w-reps dimable"><div class="line"></div><div class="hint"><span>SỐ REPS</span>'+UD+'</div></div><div class="x dimable">×</div><div class="wheel w-kg dimable"><div class="line"></div><div class="hint"><span>MỨC TẠ · KG</span>'+UD+'</div></div></div>'+
   /* bộ đếm nghỉ y=386 (Figma 449:1089 / 449:1145) */
   '<div class="clock" hidden><div class="wheel w-rest"><div class="line"></div><div class="hint"><span class="rh">ĐẶT THỜI GIAN NGHỈ</span>'+UD+'</div></div></div>'+
   '<div class="lp">'+
     '<div class="head dimable">'+who+'<span class="t1 mq"><span class="ex"></span></span><span class="sub"></span></div>'+
     '<div class="mid"></div>'+
     '<div class="foot">'+
       '<div class="nums" hidden><div class="fld reps dimable"><div class="line"></div><div class="hint">'+UD13+'<span>REPS</span></div></div><div class="fld kg dimable"><div class="line"></div><div class="hint"><span>KG</span>'+UD13+'</div></div></div>'+
       '<div class="nav dimable"><button class="ghost g1" aria-label="Quay lại">'+ico('i-back','s24')+'</button><span class="sp"></span><div class="judge" hidden><button class="cta line j0">Chưa đạt</button><button class="cta j1">Đạt</button></div><button class="cta c1">Bắt đầu set</button></div>'+
     '</div>'+
   '</div>'+
   /* lớp mực Ink (bản sao theme Ink của màn nghỉ) — dâng dần theo thời gian nghỉ */
   '<div class="ink"><div class="inkc"><div class="lp">'+
     '<div class="head">'+who+'<span class="t1 ik1"></span><span class="sub iks">Đang nghỉ</span></div>'+
     '<div class="mid"></div>'+
     '<div class="foot">'+
       '<div class="nav"><button class="ghost" tabindex="-1">'+ico('i-next','s24')+'</button><span class="sp"></span><button class="cta" tabindex="-1">Nghỉ xong · kế tiếp</button></div></div>'+
     '<div class="clock"><div class="wheel"><div class="line"><div class="v ikt"></div></div><div class="hint">'+UD+'</div></div></div>'+
   '</div></div></div>'+
   /* màng menu bước tiếp 93% + blur: mở từ "Nghỉ xong · kế tiếp" (hoặc nút bước khác khi đang nghỉ). Chạm ngoài danh sách để đóng. */
   '<div class="film"><div class="inner"><div class="exl"></div><hr><button class="act fdone"></button><button class="act fend">Kết thúc buổi tập</button></div></div>';
  host.appendChild(root);
  var q=function(sel){ return root.querySelector(sel); };
  var cv=q('canvas'), ring=Ring(cv), head=q('.lp .head'), exEl=q('.ex'), subEl=q('.lp .head .sub'), setup=q('.setup'), clock=q('.clock'), nums=q('.foot .nums'), nav=q('.foot .nav'), judge=q('.judge'), c1=q('.c1'), g1=q('.g1'), ink=q('.ink'), film=q('.film');
  var L={p:p, root:root, ring:ring, running:false, idx:o.idx};
  /* tiêu điểm: kéo một bánh xe → mờ mọi thứ khác (như artifact) */
  function dim(on, hostEl){ root.querySelectorAll('.dimable').forEach(function(el){ if(el===hostEl || el.contains(hostEl)) return; el.classList.toggle('dimx', on); }); }
  var repsW=Wheel(q('.w-reps'), {values:REPS_VALS, index:0, format:String, row:o.half?44:60, z:o.half?160:260, boxH:o.half?89:126, ghost:.3, dim:dim, onPick:function(v){ p.reps=v; saveSession(); }});
  var kgW=Wheel(q('.w-kg'), {values:KG_VALS, index:0, format:fmtN, row:o.half?44:60, z:o.half?160:260, boxH:o.half?89:126, ghost:.3, dim:dim, onPick:function(v){ p.kg=v; saveSession(); }});
  var restW=Wheel(q('.w-rest'), {values:REST_VALS, index:5, format:mmss, row:o.half?60:80, z:o.half?200:283, boxH:o.half?89:126, ghost:.26, dim:dim, live:function(){ return mmss(restLeft()); }, onPick:function(v){ if(p.phase==='rest-setup'){ p.restTotal=v; saveSession(); } }});
  var fReps=Wheel(q('.fld.reps'), {values:REPS_VALS, index:0, format:String, row:44, z:96, boxH:57, ghost:.52, dim:dim, onPick:function(v){ p.reps=v; saveSession(); }});
  var fKg=Wheel(q('.fld.kg'), {values:KG_VALS, index:0, format:fmtN, row:44, z:96, boxH:57, ghost:.52, dim:dim, onPick:function(v){ p.kg=v; saveSession(); }});
  function ex(){ return s.plan[p.cur]; }
  function E(){ var e=p.ex[ex()]; if(!e) e=p.ex[ex()]={sets:[],done:false}; return e; }
  function restLeft(){ if(p.phase!=='rest') return p.restTotal; return Math.max(0, p.restTotal-(Date.now()-p.restStart)/1000); }
  function filmOn(){ return film.classList.contains('on'); }
  L.cta=function(){ return c1.hidden ? q('.j1') : c1; };
  L.layout=function(){
    ring.size(); var rr=root.getBoundingClientRect();
    ring.cx=rr.width/2;
    if(o.half){
      /* nửa màn: mọi thứ (vành, reps×kg, đồng hồ) căn giữa vùng trống giữa khối đỉnh và đáy → đúng tâm ở mọi cỡ máy */
      var mid=q('.lp .mid'), free=root.clientHeight-28-mid.offsetTop, cy=mid.offsetTop+free/2;
      ring.cy=cy; ring.h=Math.min(162, Math.round(free*.86)); setup.style.top=Math.round(cy)+'px'; root.classList.toggle('tight', free<230);
      var top=Math.round(cy-44.5); root.querySelectorAll('.clock').forEach(function(c){ c.style.top=top+'px'; });
    }
    else { ring.cy=rr.height/2+16; ring.h=324; }
    ring.cy=Math.round(ring.cy);
  };
  function setLabel(){ var st=last(E().sets); return (st&&st[2]?'Đã đạt':'Chưa đạt')+' set '+p.setNo; }
  /* hiện/ẩn mềm: vào = bỏ hidden rồi mờ vào; ra = mờ ra rồi hidden (không nhảy layout) */
  function vis(el, on){
    if(on){ if(!el.hidden && !el.classList.contains('gone')) return; clearTimeout(el._vt); el.hidden=false; el.classList.add('gone'); void el.offsetWidth; el.classList.remove('gone'); }
    else { if(el.hidden) return; clearTimeout(el._vt); el.classList.add('gone'); el._vt=setTimeout(function(){ el.hidden=true; el.classList.remove('gone'); }, 240); }
  }
  /* đổi chữ nút chính mềm (mờ nhẹ khi khác chữ) */
  function ctaText(t){ if(c1.textContent===t) return; if(rm()||c1.hidden){ c1.textContent=t; return; } c1.classList.add('tx0'); setTimeout(function(){ c1.textContent=t; c1.classList.remove('tx0'); }, 110); }
  function restSub(){ return restLeft()<=0 ? 'Hết giờ nghỉ' : 'Đang nghỉ'; }
  function paint(){
    var ph=p.phase, acid=(ph==='rest-setup'||ph==='rest');
    root.classList.toggle('acid', acid); if(!WASH) root.classList.toggle('bga', acid);
    head.querySelector('.t1').classList.toggle('dimt', acid);
    if(ph==='setup'){ exEl.textContent=exShort(ex()); subEl.textContent='Thiết lập set '+p.setNo; }
    else if(ph==='active'){ exEl.textContent=exShort(ex()); subEl.textContent='Đang tập set '+p.setNo; }
    else { exEl.textContent=setLabel(); subEl.textContent= ph==='rest-setup'?'Bắt đầu nghỉ':restSub(); }
    vis(setup, ph==='setup'); vis(clock, acid); vis(nums, ph==='active');
    q('.rh').textContent= ph==='rest-setup' ? 'ĐẶT THỜI GIAN NGHỈ' : '';
    if(ph==='active'){ c1.hidden=true; vis(judge, true); } else { judge.hidden=true; vis(c1, true); }
    ctaText( ph==='setup'?'Bắt đầu set': ph==='rest-setup'?'Bắt đầu nghỉ': filmOn()?'Vào set mới':'Nghỉ xong · kế tiếp');
    c1.classList.toggle('dark', acid);
    g1.innerHTML=ico(ph==='rest-setup'?'i-undo':ph==='rest'?'i-next':'i-back','s24');
    g1.setAttribute('aria-label', ph==='rest-setup'?'Hoàn tác set':ph==='rest'?'Bước khác':'Quay lại');
    repsW.set(p.reps); kgW.set(p.kg); fReps.set(p.reps); fKg.set(p.kg); restW.set(p.restTotal); restW.render();
    if(ph==='rest'){ q('.ik1').textContent=setLabel(); q('.iks').textContent=restSub(); q('.ikt').textContent=mmss(restLeft()); }
    if(ph!=='rest') root.classList.remove('inkd');
    if(o.idx===0) syncTheme();
    /* vành nhịp: thiết lập = chase Paper, lực hút 0, không Acid (Figma 478:398) · đang tập = chase đầy đủ */
    ring.tint='ink'; ring.calm=(ph==='setup'); ring.dot=(ph==='active'); ring.slow=1;
    if(ph==='setup'){ ring.on=true; if(ring.alpha<.5){ ring.alpha=0; ring.fade(.75,460); } else ring.alpha=.75; }
    else if(ph==='active'){ ring.on=true; if(ring.alpha<1) ring.fade(1,400); }
    else { ring.on=false; ring.alpha=0; }
    renderFilm(); L.layout();
    if(o.half) mqStopAll(); setTimeout(function(){ mqInit(head); }, 30);
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
  /* VÒNG LOANG ĐỔI NỀN: tâm tại nút vừa bấm (from) hoặc tâm vành; chỉ animate transform (compositor).
     swap (nội dung: chữ, nút) chạy khi vòng đã phủ ~45% · nền (.bga) + lớp mực chỉ đổi khi vòng phủ kín → không bao giờ thấy nền nhảy màu. */
  var WASH=false;
  function washTo(color, o, swap){
    var acid=(color==='#D4FF00');
    if(rm()){ swap(); root.classList.toggle('bga', acid); if(!acid) inkTo(1); return; }
    var rr=root.getBoundingClientRect(), b=document.createElement('div'), cx=rr.width/2, cy=ring.cy;
    if(o && o.from){ var fr=o.from.getBoundingClientRect(); cx=fr.left+fr.width/2-rr.left; cy=fr.top+fr.height/2-rr.top; }
    var R=Math.ceil(Math.hypot(Math.max(cx, rr.width-cx), Math.max(cy, rr.height-cy)))+2;
    b.style.cssText='position:absolute;left:'+(cx-R)+'px;top:'+(cy-R)+'px;width:'+(2*R)+'px;height:'+(2*R)+'px;border-radius:50%;background:'+color+';z-index:5;transform:scale(.01);transition:transform 520ms cubic-bezier(.3,.7,.2,1);pointer-events:none;will-change:transform';
    root.appendChild(b); WASH=true;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ b.style.transform='scale(1)'; }); });
    setTimeout(function(){ crossfadeTop(); swap(); }, 200);
    setTimeout(function(){ WASH=false; root.classList.toggle('bga', acid); if(!acid) inkTo(1); b.style.transition='opacity 120ms linear'; b.style.opacity='0'; setTimeout(function(){ b.remove(); }, 130); }, 540);
  }
  /* rời màn nghỉ: mực đã phủ kín → màn đã là Ink: chỉ mờ lớp mực đi (crossfade) · chưa kín → vòng loang Ink từ nút */
  function leaveRest(from, after){
    var full=(p.phase==='rest' || p.phase==='setup') && inkY>=0 && inkY<=0.6 && root.classList.contains('acid');
    if(!full){ washTo('#0A0A0A', {from:from}, after); return; }
    if(rm()){ root.classList.remove('bga'); after(); inkTo(1); return; }
    root.classList.remove('bga'); after();
    ink.style.transition='opacity 300ms linear'; ink.style.opacity='0';
    setTimeout(function(){ inkTo(1); ink.style.transition=''; ink.style.opacity=''; }, 320);
  }
  function crossfadeTop(){
    if(rm()) return; var old=head.parentNode.querySelector('.ghosthead'); if(old) old.remove(); var g=head.cloneNode(true); g.style.cssText='position:absolute;left:var(--rail);right:var(--rail);top:'+head.offsetTop+'px;pointer-events:none;transition:opacity 200ms linear;z-index:2'; g.classList.add('ghosthead');
    head.style.opacity='0'; head.parentNode.appendChild(g);
    requestAnimationFrame(function(){ g.style.opacity='0'; head.style.transition='opacity 200ms linear'; head.style.opacity='1'; });
    setTimeout(function(){ g.remove(); head.style.transition=''; head.style.opacity=''; }, 230);
  }
  /* ---- hành động ---- */
  function begin(){ p.phase='active'; p.setNo=E().sets.length+1; saveSession(); crossfadeTop(); paint(); if(o.half) setFocus(-1); }
  function cancelSet(){ p.phase='setup'; saveSession(); crossfadeTop(); paint(); if(o.half) setFocus(-1); }
  function judgeSet(ok){
    var e=E(), ev=enqueue({type:'SET', name:p.name, session:p.no, plan:exPart(ex()), ex:ex(), set:e.sets.length+1, kg:p.kg, rep:p.reps, ok:ok?1:0, main:0}, true);
    e.sets.push([p.kg, p.reps, ok?1:0, ev.id]); p.setNo=e.sets.length;
    var m=findClient(p.name); if(m && ok) m.last[ex()]={kg:p.kg, rep:p.reps, d:TODAY_ISO};
    p.phase='rest-setup'; p.restStart=0; saveSession();
    ring.fade(0,220);
    washTo('#D4FF00', {from: ok?q('.j1'):q('.j0')}, function(){ paint(); notify((ok?'Đã ghi set ':'Chưa đạt set ')+p.setNo, {ms:1800}); });
    if(o.half) setFocus(-1);
    if(navigator.vibrate) navigator.vibrate(ok?12:[10,40,10]);
  }
  function undo(){
    var e=E(), st=e.sets.pop(); if(st && st[3]) unqueue(st[3]);
    p.setNo=e.sets.length+1; p.phase='setup'; saveSession();
    ring.on=true; ring.alpha=0; ring.scale=.55; ring.fade(.75,300);
    washTo('#0A0A0A', {from:g1}, function(){ paint(); notify('Đã hoàn tác'); });
    if(o.half) setFocus(-1);
  }
  function startRest(){ var st=last(E().sets); if(st) release(st[3]); p.phase='rest'; p.restStart=Date.now(); saveSession(); crossfadeTop(); paint(); if(o.half) setFocus(-1); }
  function nextSet(){ var from=filmOrigin||c1; closeFilm(true); p.phase='setup'; p.setNo=E().sets.length+1; saveSession(); ring.on=true; ring.alpha=0; ring.scale=.55; ring.fade(.75,300); leaveRest(from, paint); if(o.half) setFocus(-1); }
  /* menu bước tiếp phủ lên nav (Figma 449:1251): chạm dòng bài đang tập = vào set mới · chạm ngoài = đóng */
  /* các lựa chọn BAY RA từ nút vừa bấm (Nghỉ xong · kế tiếp / bước khác) rồi đứng vào chỗ; đóng thì bay ngược về nút */
  var filmOrigin=null, filmT=0;
  function flyItems(origin, open){
    var items=[].slice.call(film.querySelectorAll('.inner>*')).filter(function(el){ return getComputedStyle(el).display!=='none'; });
    items=items.reduce(function(a,el){ if(el.classList.contains('exl')) return a.concat([].slice.call(el.children)); a.push(el); return a; }, []);
    var fr=root.getBoundingClientRect(), o=origin.getBoundingClientRect(), ox=o.left+o.width/2-fr.left, oy=o.top+o.height/2-fr.top;
    items.forEach(function(el,i){
      var r=el.getBoundingClientRect(), dx=ox-(r.left+r.width/2-fr.left), dy=oy-(r.top+r.height/2-fr.top);
      el.style.transition='none';
      if(open){ el.style.transform='translate('+dx+'px,'+dy+'px) scale(.35)'; el.style.opacity='0'; void el.offsetWidth;
        el.style.transition='transform .56s cubic-bezier(.2,.9,.25,1.03) '+(i*30)+'ms, opacity .28s linear '+(i*30)+'ms'; el.style.transform='none'; el.style.opacity='1'; }
      else { var d=(items.length-1-i)*14; el.style.transition='transform .24s cubic-bezier(.4,0,.7,.3) '+d+'ms, opacity .16s linear '+(d+60)+'ms'; el.style.transform='translate('+dx+'px,'+dy+'px) scale(.35)'; el.style.opacity='0'; }
    });
    return items;
  }
  function openFilm(from){ if(filmOn()) return; clearTimeout(filmT); filmOrigin=from||c1;
    film.classList.add('notr'); film.classList.toggle('dark', p.phase==='rest' && restLeft()<p.restTotal*.3); void film.offsetWidth; film.classList.remove('notr');
    renderFilm(); film.classList.add('on'); root.classList.add('filmon'); ctaText('Vào set mới');
    if(!rm()) flyItems(filmOrigin, true);
  }
  function closeFilm(silent){ if(!filmOn()) return; clearTimeout(filmT);
    var items=rm()?[]:flyItems(filmOrigin||c1, false); root.classList.remove('filmon');
    filmT=setTimeout(function(){ film.classList.remove('on'); items.forEach(function(el){ el.style.transition=''; el.style.transform=''; el.style.opacity=''; }); }, items.length?200:0);
    if(!silent && p.phase==='rest') ctaText('Nghỉ xong · kế tiếp');
  }
  function switchEx(i){
    var from=filmOrigin||c1, wasRest=(p.phase==='rest'||p.phase==='rest-setup'); closeFilm(true);
    if(i===p.cur){ if(wasRest) nextSet(); return; }
    var st=last(E().sets); if(st) release(st[3]);
    p.cur=i; p.phase='setup'; primePerson(p); saveSession();
    if(wasRest){ ring.on=true; ring.alpha=0; ring.scale=.55; ring.fade(.75,300); leaveRest(from, paint); } else { crossfadeTop(); paint(); }
    if(o.half) setFocus(-1);
  }
  function doneEx(){
    var e=E(); if(!e.sets.length){ notify('Chưa ghi set nào', {err:true}); return; }
    var st=last(e.sets); if(st) release(st[3]); e.done=true; saveSession();
    var next=-1; for(var k=1;k<=s.plan.length;k++){ var j=(p.cur+k)%s.plan.length, ee=p.ex[s.plan[j]]; if(!ee||!ee.done){ next=j; break; } }
    if(next<0){ closeFilm(true); renderFilm(); notify('Đã xong hết bài'); setTimeout(function(){ openFilm(filmOrigin||c1); }, 900); return; }
    switchEx(next);
  }
  function endSession(){ closeFilm(true); var st=last(E().sets); if(st) release(st[3]); saveSession(); state.sumIdx=0; go('p-summary','fwd'); }
  /* CTA: thiết lập → bắt đầu set · bắt đầu nghỉ · đang nghỉ → "Nghỉ xong · kế tiếp" mở menu bước tiếp (Figma 449:1251) · nghỉ xong hẳn → vào set */
  /* CTA: thiết lập → bắt đầu set · bắt đầu nghỉ · đang nghỉ → LUÔN "Nghỉ xong · kế tiếp" mở menu bước tiếp (kể cả khi hết giờ) · menu đang mở → "Vào set mới" */
  c1.addEventListener('click', function(e){ e.stopPropagation(); if(filmOn()) return; if(p.phase==='setup') begin(); else if(p.phase==='rest-setup') startRest(); else if(p.phase==='rest') openFilm(c1); });
  q('.j1').addEventListener('click', function(e){ e.stopPropagation(); judgeSet(true); });
  q('.j0').addEventListener('click', function(e){ e.stopPropagation(); judgeSet(false); });
  /* ghost: CHỈ quay lại (thiết lập → danh sách bài · đang tập → thiết lập) · bắt đầu nghỉ → hoàn tác set · đang nghỉ → bước khác */
  g1.addEventListener('click', function(e){ e.stopPropagation();
    if(filmOn()) return;
    if(p.phase==='setup'){ saveSession(); go('p-plan','back'); }
    else if(p.phase==='active') cancelSet();
    else if(p.phase==='rest-setup') undo();
    else openFilm(g1);
  });
  film.addEventListener('click', function(e){ if(e.target===film) closeFilm(); });
  q('.fdone').addEventListener('click', function(e){ e.stopPropagation(); doneEx(); });
  q('.fend').addEventListener('click', function(e){ e.stopPropagation(); endSession(); });
  root.addEventListener('pointerdown', function(e){ if(openWheel) openWheel.close(); }, true);
  if(o.half){
    /* 1:2: bánh xe luôn kéo được trực tiếp. Chạm vào phần còn lại của section → section mờ (blur) và nút chức năng hiện ở giữa;
       chạm lại (ngoài nút) → tắt. Chỉ một section được mở tại một thời điểm. Vùng chạm mở nút KHÔNG trùng vùng bánh xe/số. */
    root.addEventListener('click', function(e){ if(filmOn()) return; if(e.target.closest('.wheel,.fld,.nav,.film')) return; setFocus(FOCUS===o.idx ? -1 : o.idx); });
  }
  /* ---- mỗi khung hình: đồng hồ nghỉ + mực Ink dâng + vành nhịp ---- */
  /* mực Ink dâng: lớp .ink trượt lên (translateY âm) và lớp trong trượt xuống cùng lượng → nội dung đứng yên, chỉ có đường mép chạy. */
  var inkLp=ink.firstElementChild, inkY=-1;
  function inkTo(fracLeft){ var y=fracLeft*100; if(y===inkY) return; inkY=y; ink.style.transform='translate3d(0,-'+y+'%,0)'; inkLp.style.transform='translate3d(0,'+y+'%,0)'; }
  var lastSec=-1;
  L.tick=function(now){
    if(p.phase==='rest'){
      var left=restLeft(), sec=Math.ceil(left);
      if(sec!==lastSec){ lastSec=sec; restW.render(); q('.ikt').textContent=mmss(left); if(left<=0 && subEl.textContent!=='Hết giờ nghỉ'){ subEl.textContent='Hết giờ nghỉ'; q('.iks').textContent='Hết giờ nghỉ'; if(navigator.vibrate) navigator.vibrate([8,60,8]); } }
      var fl=Math.max(0,Math.min(1,left/p.restTotal)); inkTo(fl); root.classList.toggle('inkd', fl<.5);
    }
    ring.draw(now);
  };
  inkTo(1); paint(); L.layout();
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
  if(!live) pg._after=function(){ cardsIn(body); };
  if(pendingCount()) setTimeout(function(){ if(pendingCount() && state.screen==='p-done') notify('Đang đồng bộ', {spin:true}); }, 2500);
};
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
  var data=(state.pin&&!state.loading) ? refreshData(true).then(function(){ return true; }, function(){ return false; }) : Promise.resolve(null);
  busyLine(true); Promise.all([data, flush().catch(function(){})]).then(function(r){ busyLine(false); if(r[0]===true && state.pin) notify('Đã làm mới'); else if(r[0]===false) notify('Máy chủ chậm', {err:true}); });
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
  var p=SES('lb_pin'), lastc=null; try{ lastc=JSON.parse(ST('lb_last')||'null'); }catch(e){}
  if(p && lastc && lastc.h===hashPin(p)){ var c=loadCache(lastc.coach); if(c){ state.pin=p; buildClients(c.res); state.stats=loadStats(state.coach); state.dataTs=c.ts; var ss=loadSession(); if(ss){ state.session=ss; go(ss.started&&ss.plan.length?'p-loop':'p-plan','fwd'); } else go('p-home','fwd'); refreshData(true); flush(); return; } }
  go('p-pin','fwd');
})();
if('serviceWorker' in navigator && !DEMO && location.protocol==='https:'){ navigator.serviceWorker.register('sw.js').catch(function(){}); }

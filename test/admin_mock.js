/* Chế độ ADMIN v2.4 với máy chủ MOCK (không ?demo): Worker + Apps Script + ipify giả.
   Kiểm: định tuyến lệnh (adm_* chỉ đi Apps Script, kèm apin; Worker không bao giờ thấy apin), check-in không khoá IP,
   coach VẪN bị khoá IP, tab Cài đặt (IP phòng: thêm / xoá / đủ / giữ ≥1), outbox tách người, khôi phục khi reload,
   PIN sai, backend chưa nâng cấp, PIN admin bị đổi giữa chừng, bố cục 375/393/430.
   v2.4.1 (tốc độ): không còn lượt 'admin' riêng; adm_data + adm_stats song song; đổi coach ⇄ Admin vào ngay từ cache (lb_acc);
   kết quả làm mới của phiên cũ bị bỏ khi đổi người; sang tháng giữa chừng → thống kê gọi lại. Máy chủ giả có độ trễ theo lệnh (SRV.latW / SRV.latG).
   v2.15.2: adm_data · adm_checkin · adm_log đi Worker trước. AD1–AD15 chạy với Worker CŨ (v7: adm_* → unknown_action → lùi Apps Script,
   mọi hành vi như v2.15.1); AW1–AW10 chạy với Worker v8 (SRV.wkAdm): Admin trên Worker, Apps Script chỉ còn adm_stats + IP phòng;
   ADMIN_PIN của Worker khác (SRV.wkApin) → lùi Apps Script; mất mạng: adm_data / adm_log lùi, adm_checkin KHÔNG lùi; mất phản hồi sau
   khi Worker đã ghi (SRV.wkCut) → "Thử lại" nhận da_checkin, không ghi hai lần; wk_no_sheet_coach → adm_log lùi Apps Script;
   Worker trả lỗi bất kỳ (SRV.wkErr): adm_data / adm_log lùi Apps Script, adm_checkin không lùi (AW11).
   PIN trong file này là PIN GIẢ của mock — PIN thật chỉ nằm trong Script Properties.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/admin_mock.js */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19321, OUT=path.join(__dirname,'out_admin');
var A_PIN='7777', C_PIN='1234', DEV_IP='9.9.9.9', ROOM_IP='203.0.113.7';
/* phiên bản đọc từ chính app.js (v2.16.0: không ghim cứng — mỗi lần nâng bản không phải sửa test) */
var APPV=((/var APP_VER='(v[\d.]+)'/.exec(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'))||[])[1]||'?').toUpperCase().replace(/\./g,'\\.');
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});

var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
var ONLY=(process.env.ONLY||'').split(',').filter(Boolean);   /* ONLY=AD14 → chỉ chạy các ca này (đo so sánh giữa hai bản) */
async function run(id, name, fn){ if(ONLY.length && ONLY.indexOf(id)<0) return; CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }

/* ---------------- máy chủ giả ---------------- */
function today(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
var SRV;
function resetSrv(){
  SRV={wk:[], gas:[], ipList:[ROOM_IP], noAdm:false, down:false, apin:A_PIN, checkins:[], alogs:[], alogVia:[], clogs:[], latW:{}, latG:{},
    wkAdm:false, wkApin:A_PIN, wkDown:{}, wkCut:{}, wkNoSheet:false, wkErr:{},
    mem:[{name:'Bùi Doãn Quang',done:14,total:24,left:10,coach:'Quyết Hán',kind:'PT 1:2'},
         {name:'Nguyễn Quang Vinh',done:11,total:12,left:1,coach:'Quyết Hán',kind:''},
         {name:'Vũ Sao Mai',done:3,total:24,left:21,coach:'Hiền Mai',kind:''},
         {name:'Trần Minh Anh',done:5,total:12,left:7,coach:'Hiền Mai (giai đoạn 1)',kind:''},
         {name:'Phan Việt Hoàng',done:12,total:12,left:0,coach:'Hiền Mai',kind:''}]};
}
resetSrv();
function coachRes(){ return {ok:true, coach:'Quyết Hán', members:SRV.mem.filter(function(m){ return /Quyết/.test(m.coach); }), snapshot:{}, library:null, today:today()}; }
function send(r, out){ return r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)}); }
function lag(ms){ return ms ? new Promise(function(res){ setTimeout(res, ms); }) : Promise.resolve(); }
function monthOf(p){ return /^\d{4}-\d{2}$/.test(String(p.month||'')) ? p.month : today().slice(0,7); }   /* máy chủ thật trả lại đúng tháng được hỏi */
/* lệnh Admin dùng chung cho Apps Script (Admin.gs) và Worker v8 — via = nơi xử lý. Check-in lần hai trong ngày → da_checkin (như máy chủ thật);
   adm_log khử trùng theo id ở MỌI nơi (Worker đã ghi thì Apps Script thấy id và bỏ qua). */
function admDo(p, via){
  var a=p.action;
  if(a==='adm_data') return {ok:true, admin:true, coach:'Admin', members:JSON.parse(JSON.stringify(SRV.mem)), snapshot:{}, library:null, today:today()};
  if(a==='adm_checkin'){ var m=SRV.mem.filter(function(x){ return x.name===p.name; })[0]; if(!m) return {ok:false,error:'khong_thay_khach'};
    if(SRV.checkins.some(function(c){ return c.name===p.name; })) return {ok:false,error:'da_checkin',at:'09:41'};
    SRV.checkins.push({name:p.name, by:'Admin', ip:p.ip, via:via}); m.done++; m.left--; return {ok:true,row:42,member:m,coach:m.coach,by:'Admin',at:'09:41'}; }
  if(a==='adm_log'){ var have={}, n=0, dup=0; SRV.alogs.forEach(function(e){ have[e.id]=1; });
    (p.events||[]).forEach(function(e){ if(have[e.id]){ dup++; return; } have[e.id]=1; SRV.alogs.push(e); SRV.alogVia.push(via); n++; });
    return {ok:true,written:n,dup:dup}; }
  return null;
}
async function wk(r){
  var p=JSON.parse(r.request().postData()||'{}'); SRV.wk.push({action:p.action, pin:p.pin, apin:p.apin, ip:p.ip, name:p.name, t:Date.now()});
  if(SRV.wkDown[p.action]) return r.abort('internetdisconnected');
  await lag(SRV.latW[p.action]);
  if(p.action==='ping') return send(r,{ok:true});
  if(p.action==='coach') return send(r, p.pin===C_PIN ? coachRes() : {ok:false,error:'sai_pin'});
  /* Worker v8: adm_data · adm_checkin · adm_log — không khoá IP; kiểm ADMIN_PIN của Worker (SRV.wkApin) trước mọi lượt ghi */
  if(SRV.wkAdm && /^adm_(data|checkin|log)$/.test(p.action)){
    if(p.apin!==SRV.wkApin) return send(r,{ok:false,error:'sai_pin'});
    if(p.action==='adm_log' && SRV.wkNoSheet) return send(r,{ok:false,error:'wk_no_sheet_coach'});
    if(SRV.wkErr[p.action]) return send(r,{ok:false,error:SRV.wkErr[p.action]});          /* lỗi Sheets / lỗi lạ của Worker (HTTP 200) */
    var out=admDo(p, 'wk');
    if(SRV.wkCut[p.action]) return r.abort('connectionreset');      /* Worker đã ghi, phản hồi mất trên đường về */
    return send(r, out);
  }
  if(p.action==='checkin_coach' || p.action==='log'){ if(SRV.ipList.indexOf(p.ip)<0) return send(r,{ok:false,error:'wrong_ip'}); }
  if(p.action==='log' && p.pin===C_PIN){ SRV.clogs=SRV.clogs.concat(p.events); return send(r,{ok:true,written:p.events.length}); }
  return send(r,{ok:false,error:'unknown_action'});
}
async function gas(r){
  var p=JSON.parse(r.request().postData()||'{}'); SRV.gas.push({action:p.action, pin:p.pin, apin:p.apin, ip:p.ip, del:p.del, events:p.events, name:p.name, month:p.month, t:Date.now()});
  if(SRV.down && p.action!=='ping') return r.abort('internetdisconnected');
  await lag(SRV.latG[p.action]);
  var a=p.action, isA=(p.apin===SRV.apin);
  if(a==='ping') return send(r,{ok:true,pong:1});
  if(a==='admin') return send(r, isA?{ok:true}:{ok:false,error:'sai_pin'});
  if(/^adm_/.test(a) || a==='iplist' || a==='addip' || a==='delip'){
    if(SRV.noAdm) return send(r,{ok:false,error:'unknown_action'});
    if(!isA) return send(r,{ok:false,error:'sai_pin'});
    if(a==='adm_stats') return send(r,{ok:true, admin:true, month:monthOf(p), days:{}, monthTotal:309, perClient:{}, rev:{month:today().slice(0,7), total:96500000}, hist:{}});
    var ad=admDo(p, 'gas'); if(ad) return send(r, ad);
    if(a==='iplist') return send(r,{ok:true, ips:SRV.ipList.slice(), max:2});
    if(a==='addip'){ if(!p.ip) return send(r,{ok:false,error:'thieu_ip'}); if(SRV.ipList.indexOf(p.ip)<0){ if(SRV.ipList.length>=2) return send(r,{ok:false,error:'full',ips:SRV.ipList.slice(),max:2}); SRV.ipList.push(p.ip); } return send(r,{ok:true,ips:SRV.ipList.slice(),max:2}); }
    if(a==='delip'){ var k=SRV.ipList.indexOf(String(p.del||'')); if(k>=0){ if(SRV.ipList.length<=1) return send(r,{ok:false,error:'con_1_ip',ips:SRV.ipList.slice(),max:2}); SRV.ipList.splice(k,1); } return send(r,{ok:true,ips:SRV.ipList.slice(),max:2}); }
  }
  if(a==='coach') return send(r, p.pin===C_PIN ? coachRes() : {ok:false,error:'sai_pin'});
  if(a==='stats') return send(r, p.pin===C_PIN ? {ok:true, month:monthOf(p), days:{}, monthTotal:103, perClient:{}, com:{month:today().slice(0,7), total:14200000}, hist:{}} : {ok:false,error:'sai_pin'});
  if(a==='checkin_coach'){ if(p.pin!==C_PIN) return send(r,{ok:false,error:'sai_pin'}); if(SRV.ipList.indexOf(p.ip)<0) return send(r,{ok:false,error:'wrong_ip'}); return send(r,{ok:true,row:7,at:'09:00'}); }
  if(a==='log'){ if(p.pin!==C_PIN) return send(r,{ok:false,error:'sai_pin'}); SRV.clogs=SRV.clogs.concat(p.events||[]); return send(r,{ok:true,written:(p.events||[]).length}); }
  return send(r,{ok:false,error:'unknown_action'});
}

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  async function mk(vp){
    var ctx=await browser.newContext({viewport:vp||{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ip:DEV_IP})}); });
    await ctx.route(/workers\.dev/, wk); await ctx.route(/script\.google\.com/, gas);
    var page=await ctx.newPage(); page.on('pageerror', function(e){ PAGEERR.push(String(e)); });
    return {ctx:ctx, page:page};
  }
  var C=await mk(), page=C.page;
  var w=function(ms){ return page.waitForTimeout(ms); };
  var ev=function(fn,a){ return page.evaluate(fn,a); };
  var txt=async function(s){ return (await ev(function(s){ var e=document.querySelector(s); return e?e.textContent:null; }, s))||''; };
  var disp=function(s){ return ev(function(s){ var e=document.querySelector(s); return e?getComputedStyle(e).display:'(none)'; }, s); };
  var screen=function(id,t){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:t||8000}); };
  var pill=function(){ return ev(function(){ var p=document.getElementById('pill'); return p.classList.contains('on') ? (p.querySelector('.tx')||{}).textContent : ''; }); };
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  async function shot(n){ await page.screenshot({path:path.join(OUT,n+'.png')}); }
  function since(arr, i){ return arr.slice(i); }
  /* đếm số lần giao diện Admin BẬT (body.adm) — PIN sai không được làm nháy tab Cài đặt */
  function watchAdm(){ return ev(function(){ window.__admOn=0; if(window.__admW) return; window.__admW=1; var T=DOMTokenList.prototype.toggle;
    DOMTokenList.prototype.toggle=function(c,f){ if(this===document.body.classList && c==='adm' && f) window.__admOn++; return T.apply(this, arguments); }; }); }
  var admOn=function(){ return ev(function(){ return window.__admOn||0; }); };

  await page.goto('http://localhost:'+PORT+'/'); await screen('p-pin'); await w(500);

  await run('AD1', 'Coach 1234: không thấy tab Cài đặt, không lệnh nào mang apin, check-in ngoài phòng VẪN bị chặn', async function(){
    await pin(C_PIN); await screen('p-home'); await w(1500);
    check((await txt('#h-name'))!=='Admin', 'tên coach: '+(await txt('#h-name')));
    check((await disp('#p-home .tab-adm'))==='none' && (await disp('#p-clients .tab-adm'))==='none', 'tab Cài đặt ẩn với coach');
    check(!(await ev(function(){ return document.body.classList.contains('adm'); })), 'body không có .adm');
    check(SRV.wk.some(function(x){ return x.action==='coach' && x.pin===C_PIN; }), 'coach đi Worker trước');
    var g0=SRV.gas.length, k0=SRV.wk.length;
    await page.click('#h-go'); await screen('p-pick'); await w(600);
    await page.click('#pk-list .row:has-text("Quang Vinh")'); await screen('p-confirm'); await w(1200);
    await page.click('#cf-go'); await w(2500);
    check(/phòng/.test(await pill()) , 'coach ngoài phòng bị chặn: pill "'+(await pill())+'"');
    check((await ev(function(){ return state.screen; }))==='p-confirm', 'coach ở lại màn xác nhận');
    var all=SRV.wk.concat(SRV.gas);
    check(all.every(function(x){ return !x.apin; }), 'không lệnh coach nào mang apin');
    check(since(SRV.gas,g0).every(function(x){ return !/^adm_/.test(x.action); }) && since(SRV.wk,k0).every(function(x){ return !/^adm_/.test(x.action); }), 'coach không gọi lệnh adm_*');
    await shot('ad1-coach-blocked');
    check(/Thử lại/.test(await txt('#pill .act')), 'pill lỗi có nút Thử lại');
    await ev(function(){ logout(); }); await screen('p-pin'); await w(500);
    check(!(await ev(function(){ return document.getElementById('pill').classList.contains('on'); })), 'đăng xuất → pill của phiên cũ tắt');
    /* nút hành động của pill tạo ở phiên trước không chạy dưới phiên khác */
    await ev(function(){ window.__ran=0; notify('Chưa check-in · Test', {err:true, action:{label:'Thử lại', fn:function(){ window.__ran++; }}}); }); await w(450);
    await ev(function(){ setAdmin(false); }); await page.click('#pill .act'); await w(300);
    check((await ev(function(){ return window.__ran; }))===0 && !(await ev(function(){ return document.getElementById('pill').classList.contains('on'); })), 'đổi phiên → "Thử lại" cũ không chạy, pill tắt');
    await ev(function(){ window.__ran=0; notify('Chưa check-in · Test 2', {err:true, action:{label:'Thử lại', fn:function(){ window.__ran++; }}}); }); await w(450);
    await page.click('#pill .act'); await w(300);
    check((await ev(function(){ return window.__ran; }))===1, 'cùng phiên → "Thử lại" vẫn chạy');
  });

  await run('AD2', 'PIN admin lần đầu: Worker từ chối → adm_data + adm_stats SONG SONG (không còn lượt "admin"); trang chủ "Admin", Tổng/Doanh thu, tab Cài đặt hiện', async function(){
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await pin(A_PIN); await screen('p-home'); await page.waitForFunction(function(){ return !state.loading && state.admin; }, null, {timeout:8000}); await w(1800);
    var gw=since(SRV.gas,g0).map(function(x){ return x.action; }).filter(function(a){ return a!=='ping'; }), kw=since(SRV.wk,k0).map(function(x){ return x.action; });
    check(kw.indexOf('coach')>=0, 'thử PIN coach ở Worker trước: '+kw.join(','));
    check(gw.indexOf('admin')<0, 'không còn lượt hỏi "admin" riêng: '+gw.join(','));
    check(gw.join()==='adm_stats,adm_data', 'đúng 1 adm_stats + 1 adm_data, thống kê KHÔNG chờ danh sách: '+gw.join(','));
    check(since(SRV.wk,k0).filter(function(x){ return x.action==='coach'; }).every(function(x){ return x.pin===A_PIN && !x.apin; }), 'lượt thử coach mang pin, không mang apin');
    check(since(SRV.wk,k0).every(function(x){ return x.action==='ping' || (x.action==='coach' ? !x.apin : (x.action==='adm_data' && x.apin===A_PIN && !x.pin)); }), 'Worker chỉ thấy coach (pin) + adm_data (apin) — không adm_stats / IP phòng: '+kw.join(','));
    check(kw.filter(function(a){ return a!=='ping'; }).join()==='coach,adm_data', 'v2.15.2: adm_data hỏi Worker trước (Worker cũ trả unknown_action → Apps Script): '+kw.join(','));
    check(since(SRV.gas,g0).filter(function(x){ return /^adm_/.test(x.action); }).every(function(x){ return x.apin===A_PIN && !x.pin && x.ip===DEV_IP; }), 'adm_* mang apin, không mang pin, kèm ip');
    check((await txt('#h-name'))==='Admin', 'tên: '+(await txt('#h-name')));
    check((await txt('#h-taught'))==='Tổng 309 buổi', 'hero: '+(await txt('#h-taught')));
    var tiles=await ev(function(){ return [].map.call(document.querySelectorAll('#h-tiles .tile'), function(t){ return t.querySelector('.tl').textContent+'='+t.querySelector('.tv').textContent.trim(); }); });
    check(tiles[0]==='Tổng số khách=4', 'ô 1: '+tiles[0]); check(/^Doanh thu=96,5/.test(tiles[3]), 'ô 4: '+tiles[3]);
    check((await disp('#p-home .tab-adm'))==='flex', 'tab Cài đặt hiện ở trang chủ: '+(await disp('#p-home .tab-adm')));
    check(await ev(function(){ return document.body.classList.contains('adm') && state.coach==='Admin' && !state.pin; }), 'state admin');
    /* 3 tab + CTA cùng một hàng, không chồng nhau */
    var nav=await ev(function(){ return [].filter.call(document.querySelectorAll('#p-home .nav button'), function(b){ return getComputedStyle(b).display!=='none'; }).map(function(b){ var r=b.getBoundingClientRect(); return [Math.round(r.left),Math.round(r.right),Math.round(r.top),b.scrollWidth>b.clientWidth+1]; }); });
    check(nav.length===4 && nav.every(function(n,i){ return i===0 || n[0]>=nav[i-1][1]; }) && nav.every(function(n){ return n[2]===nav[0][2] && !n[3]; }), 'nav 3 tab + CTA thẳng hàng, không chồng/cắt chữ: '+JSON.stringify(nav));
    await shot('ad2-admin-home');
  });

  await run('AD3', 'Khách hàng (Admin): mọi khách của phòng, meta kèm coach phụ trách', async function(){
    await page.click('#p-home .nav button[aria-label="Khách hàng"]'); await screen('p-clients'); await w(900);
    var rows=await ev(function(){ return [].map.call(document.querySelectorAll('#cl-list .row'), function(r){ return r.querySelector('.nm').textContent+'|'+r.querySelector('.lab').textContent; }); });
    check(rows.length===5, 'đủ 5 khách: '+rows.length);
    check(rows.some(function(r){ return /^Vũ Sao Mai\|.*· HIỀN MAI$/.test(r); }), 'khách của Hiền Mai có "· HIỀN MAI": '+rows.join(' / '));
    check(rows.some(function(r){ return /^Trần Minh Anh\|.*· HIỀN MAI$/.test(r); }), 'bỏ hậu tố "(giai đoạn 1)"');
    check(rows.some(function(r){ return /^Bùi Doãn Quang\|.*· QUYẾT HÁN$/.test(r); }), 'khách của Quyết: '+rows[0]);
    check((await disp('#p-clients .tab-adm'))==='flex', 'tab Cài đặt hiện ở Khách hàng');
    await shot('ad3-admin-clients');
    await page.click('#p-clients .nav .ghost:nth-child(1)'); await screen('p-home'); await w(700);
  });

  await run('AD4', 'Admin check-in khách coach khác từ IP lạ: adm_checkin (Apps Script) đúng 1 lần, không khoá IP', async function(){
    var g0=SRV.gas.length, k0=SRV.wk.length;
    await page.click('#h-go'); await screen('p-pick'); await w(700);
    await page.click('#pk-list .row:has-text("Sao Mai")'); await screen('p-confirm'); await w(1300);
    await page.click('#cf-go'); await screen('p-plan', 9000); await w(700);
    check(SRV.checkins.length===1 && SRV.checkins[0].name==='Vũ Sao Mai' && SRV.checkins[0].ip===DEV_IP, 'check-in: '+JSON.stringify(SRV.checkins));
    check(!since(SRV.wk,k0).some(function(x){ return x.action==='checkin_coach'; }), 'không đi Worker');
    check(since(SRV.gas,g0).filter(function(x){ return x.action==='adm_checkin'; }).length===1, 'adm_checkin đúng 1 lần');
    check(/^Đã check-in/.test(await pill()), 'pill: '+(await pill()));
    check(await ev(function(){ return state.session && state.session.coach==='Admin'; }), 'buổi tập thuộc Admin');
    await shot('ad4-admin-checkin');
  });

  await run('AD5', 'Admin ghi dữ liệu: sự kiện coach="Admin" đi adm_log (Apps Script), khử trùng theo id', async function(){
    var g0=SRV.gas.length;
    await ev(function(){ enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'weight', val:54}); return flush(); }); await w(900);
    var calls=since(SRV.gas,g0).filter(function(x){ return x.action==='adm_log'; });
    check(calls.length===1 && calls[0].apin===A_PIN, 'adm_log 1 lần kèm apin: '+calls.length);
    check(SRV.alogs.length===1 && SRV.alogs[0].coach==='Admin' && !!SRV.alogs[0].id, 'sự kiện: '+JSON.stringify(SRV.alogs));
    check(!SRV.wk.some(function(x){ return x.action==='log' && x.apin; }), 'Worker không nhận log admin');
    check((await ev(function(){ return OUT.q.length; }))===0, 'outbox trống sau khi gửi');
    /* về trang chủ, bỏ buổi dở (không ảnh hưởng các bước sau) */
    await ev(function(){ closeLib(true); state.session=null; saveSession(); go('p-home','back'); }); await screen('p-home'); await w(900);
  });

  await run('AD6', 'Tab Cài đặt: IP thiết bị, danh sách IP, Thêm IP, xoá theo giá trị, giữ ≥ 1 IP, đủ 2 IP', async function(){
    await page.click('#p-home .nav button[aria-label="Cài đặt"]'); await screen('p-admin'); await w(1500);
    check((await txt('#p-admin .t1'))==='Cài đặt', 'tiêu đề');
    check((await txt('#am-ip'))===DEV_IP, 'IP thiết bị: '+(await txt('#am-ip')));
    check((await txt('#am-note'))==='IP ĐƯỢC CHECK-IN · 1/2', 'đếm: '+(await txt('#am-note')));
    var rows=await ev(function(){ return [].map.call(document.querySelectorAll('#am-list .row'), function(r){ return r.querySelector('.nm').textContent+'|'+r.querySelector('.lab').textContent+'|'+(r.querySelector('.x')?'x':''); }); });
    check(rows[0]===ROOM_IP+'|IP PHÒNG|' && rows[1]==='—|IP THỨ 2|', 'hàng IP: '+rows.join(' / '));
    check((await txt('#am-add'))==='Thêm IP' && !(await ev(function(){ return document.getElementById('am-add').classList.contains('off'); })), 'nút Thêm IP bật');
    check((await ev(function(){ return getComputedStyle(document.querySelector('#p-admin .nav .ghost.cur')).display; }))!=='none', 'tab Cài đặt đang chọn');
    await shot('ad6-settings-1');
    await page.click('#am-add'); await w(900);
    check(SRV.ipList.join()===ROOM_IP+','+DEV_IP, 'máy chủ: '+SRV.ipList.join());
    rows=await ev(function(){ return [].map.call(document.querySelectorAll('#am-list .row'), function(r){ return r.querySelector('.nm').textContent+'|'+r.querySelector('.lab').textContent+'|'+(r.querySelector('.x')?'x':''); }); });
    check(rows[1]===DEV_IP+'|IP THỨ 2 · THIẾT BỊ NÀY|x' && rows[0]===ROOM_IP+'|IP PHÒNG|x', 'sau khi thêm: '+rows.join(' / '));
    check((await txt('#am-note'))==='IP ĐƯỢC CHECK-IN · 2/2', 'đếm 2/2');
    check((await txt('#am-add'))==='IP này đã có' && (await ev(function(){ return document.getElementById('am-add').classList.contains('off'); })), 'nút: '+(await txt('#am-add')));
    check(/Đã thêm IP 9\.9\.9\.9/.test(await pill()), 'pill: '+(await pill()));
    await shot('ad6-settings-2');
    await page.click('#am-list .row:nth-child(1) .x'); await w(900);
    var dl=SRV.gas.filter(function(x){ return x.action==='delip'; }).pop();
    check(dl && dl.del===ROOM_IP, 'xoá theo GIÁ TRỊ: '+(dl&&dl.del));
    check(SRV.ipList.join()===DEV_IP, 'còn: '+SRV.ipList.join());
    rows=await ev(function(){ return [].map.call(document.querySelectorAll('#am-list .row'), function(r){ return r.querySelector('.nm').textContent+'|'+r.querySelector('.lab').textContent+'|'+(r.querySelector('.x')?'x':''); }); });
    check(rows[0]===DEV_IP+'|IP PHÒNG · THIẾT BỊ NÀY|' , 'IP cuối không có nút xoá: '+rows.join(' / '));
    /* máy chủ từ chối xoá IP cuối (bảo vệ 2 lớp) */
    await ev(function(){ delIp('9.9.9.9'); }); await w(900);
    check(SRV.ipList.join()===DEV_IP && /ít nhất 1 IP/.test(await pill()), 'con_1_ip: '+(await pill()));
    /* đã đủ 2 IP khác → nút "Đã đủ 2 IP · xoá bớt" */
    SRV.ipList=['1.1.1.1','2.2.2.2'];
    await page.click('#p-admin .nav .ghost:nth-child(1)'); await screen('p-home'); await w(600);
    await page.click('#p-home .nav button[aria-label="Cài đặt"]'); await screen('p-admin'); await w(1300);
    check((await txt('#am-add'))==='Đã đủ 2 IP · xoá bớt' && (await ev(function(){ return document.getElementById('am-add').classList.contains('off'); })), 'đủ: '+(await txt('#am-add')));
    check((await txt('#am-note'))==='IP ĐƯỢC CHECK-IN · 2/2', 'đếm đủ');
    SRV.ipList=[ROOM_IP];
  });

  await run('AD7', 'Outbox tách người: sự kiện Admin không đi dưới PIN coach và ngược lại', async function(){
    SRV.down=true;
    await ev(function(){ enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'waist', val:66}); return flush(); }); await w(800);
    check((await ev(function(){ return OUT.q.filter(function(e){ return e.coach==='Admin'; }).length; }))===1, 'sự kiện admin nằm chờ khi mất mạng');
    SRV.down=false;
    await page.click('#am-out'); await screen('p-pin'); await w(500);
    check(!(await ev(function(){ return document.body.classList.contains('adm') || state.admin; })), 'đăng xuất: hết chế độ admin');
    var c0=SRV.clogs.length, a0=SRV.alogs.length, g0=SRV.gas.length, k0=SRV.wk.length;
    await pin(C_PIN); await screen('p-home'); await w(1500);
    await ev(function(){ enqueue({type:'ĐO', name:'Nguyễn Quang Vinh', metric:'weight', val:68}); return flush(); }); await w(1200);
    check(SRV.alogs.length===a0, 'coach không gửi sự kiện của Admin');
    check(SRV.clogs.length===c0+1 && SRV.clogs[SRV.clogs.length-1].coach!=='Admin', 'coach gửi sự kiện của mình: '+(SRV.clogs.length-c0));
    check(since(SRV.gas,g0).concat(since(SRV.wk,k0)).every(function(x){ return !(x.events||[]).some(function(e){ return e.coach==='Admin'; }); }), 'không lô nào của coach chứa sự kiện Admin');
    check((await ev(function(){ return pendingCount(); }))===0 && (await ev(function(){ return OUT.q.length; }))===1, 'pendingCount coach = 0, sự kiện admin vẫn giữ');
    check((await disp('#p-home .tab-adm'))==='none', 'coach: tab Cài đặt ẩn lại');
    await ev(function(){ logout(); }); await screen('p-pin'); await w(500);
    await pin(A_PIN); await screen('p-home'); await page.waitForFunction(function(){ return state.admin; }, null, {timeout:8000}); await w(1800);
    check(SRV.alogs.length===a0+1 && SRV.alogs[SRV.alogs.length-1].metric==='waist', 'đăng nhập lại Admin → sự kiện admin được gửi: '+(SRV.alogs.length-a0));
    check((await ev(function(){ return OUT.q.length; }))===0, 'outbox trống');
  });

  await run('AD8', 'Reload giữa chế độ Admin → vào lại đúng Admin, lệnh vẫn kèm apin', async function(){
    var g0=SRV.gas.length;
    await page.reload(); await screen('p-home'); await w(1800);
    check(await ev(function(){ return state.admin && document.body.classList.contains('adm'); }), 'khôi phục admin');
    check((await txt('#h-name'))==='Admin' && (await disp('#p-home .tab-adm'))==='flex', 'Admin + tab');
    var d=since(SRV.gas,g0).filter(function(x){ return x.action==='adm_data'; });
    check(d.length>=1 && d.every(function(x){ return x.apin===A_PIN; }), 'làm mới nền = adm_data kèm apin: '+d.length);
  });

  await run('AD9', 'PIN admin bị đổi trên máy chủ → lần làm mới kế tiếp đăng xuất "MÃ PIN KHÔNG CÒN HIỆU LỰC"', async function(){
    SRV.apin='8888';
    await ev(function(){ return refreshData(true); }); await w(900);
    check((await ev(function(){ return state.screen; }))==='p-pin' && !(await ev(function(){ return state.admin; })), 'về màn PIN');
    check((await txt('#pin-err'))==='MÃ PIN KHÔNG CÒN HIỆU LỰC', 'thông báo: '+(await txt('#pin-err')));
    check(await ev(function(p){ return accFind(p)===null && !localStorage.getItem('lb_last'); }, A_PIN), 'quên tài khoản đó: lần sau PIN cũ không vào được bằng cache');
    SRV.apin=A_PIN;
  });

  await run('AD10', 'PIN sai (không phải coach, không phải admin) → "MÃ PIN KHÔNG ĐÚNG", giao diện Admin không nháy', async function(){
    await watchAdm(); var g0=SRV.gas.length;
    await pin('5555'); await w(2000);
    check((await txt('#pin-err'))==='MÃ PIN KHÔNG ĐÚNG' && (await ev(function(){ return state.screen; }))==='p-pin', 'lỗi: '+(await txt('#pin-err')));
    check(!(await ev(function(){ return state.admin; })), 'không vào admin');
    check((await admOn())===0, 'tab Cài đặt / body.adm không bật lần nào: '+(await admOn()));
    check(since(SRV.gas,g0).every(function(x){ return x.action!=='admin'; }), 'không còn lượt "admin"');
    check((await ev(function(){ return BUSY_N; }))===0, 'vạch bận tắt hẳn (đếm = 0)');
  });

  await run('AD11', 'Backend chưa có Admin.gs (unknown_action) → "MÁY CHỦ CHƯA CÓ CHẾ ĐỘ ADMIN"', async function(){
    SRV.noAdm=true; await ev(function(){ localStorage.removeItem('lb_last'); localStorage.removeItem('lb_acc'); });
    await pin(A_PIN); await w(2500);
    check((await txt('#pin-err'))==='MÁY CHỦ CHƯA CÓ CHẾ ĐỘ ADMIN' && (await ev(function(){ return state.screen; }))==='p-pin', 'lỗi: '+(await txt('#pin-err')));
    SRV.noAdm=false;
  });

  /* ---------------- v2.4.1 · tốc độ ---------------- */
  var homeReady=function(fn, t){ return page.waitForFunction(fn, null, {timeout:t||3000}); };
  await run('AD12', 'Đổi qua lại coach ⇄ Admin: PIN đã từng vào trên máy → vào NGAY từ cache (mạng chậm 4 s cũng không chờ)', async function(){
    /* máy "mới": cả hai tài khoản đăng nhập một lần bằng đường mạng */
    await ev(function(){ localStorage.clear(); });
    await pin(C_PIN); await homeReady(function(){ return state.screen==='p-home' && !state.loading && !!state.pin; }, 8000); await w(500);
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
    await pin(A_PIN); await homeReady(function(){ return state.screen==='p-home' && !state.loading && state.admin; }, 8000); await w(500);
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
    var acc=await ev(function(){ var a=accLoad(); return Object.keys(a).map(function(k){ return a[k].coach+':'+a[k].adm; }).sort().join(','); });
    check(acc==='Admin:1,Quyết Hán:0', 'lb_acc nhớ cả hai tài khoản: '+acc);
    check(await ev(function(p){ for(var i=0;i<localStorage.length;i++){ var v=localStorage.getItem(localStorage.key(i))||''; if(v===p || v.indexOf('"'+p+'"')>=0) return false; } return true; }, A_PIN), 'localStorage không chứa PIN dạng chữ (chỉ hash)');
    SRV.latW={coach:4000}; SRV.latG={coach:4000, stats:4000, adm_data:4000, adm_stats:4000};
    var t=Date.now(); await pin(C_PIN);
    await homeReady(function(){ return state.screen==='p-home' && !!state.pin && state.clients.length===2; });
    var tc=Date.now()-t;
    check(tc<1500, 'coach vào từ cache sau '+tc+' ms (mạng 4.000 ms)');
    check((await txt('#h-name'))!=='Đang tải…' && !(await ev(function(){ return state.admin; })), 'trang chủ coach có tên ngay: '+(await txt('#h-name')));
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
    var g0=SRV.gas.length; t=Date.now(); await pin(A_PIN);
    await homeReady(function(){ return state.screen==='p-home' && state.admin && state.clients.length===5; });
    var ta=Date.now()-t;
    console.log('   · vào từ cache (mạng chậm 4.000 ms): coach '+tc+' ms · Admin '+ta+' ms');
    check(ta<1500, 'Admin vào từ cache sau '+ta+' ms (mạng 4.000 ms)');
    check((await txt('#h-name'))==='Admin' && (await disp('#p-home .tab-adm'))==='flex', 'Admin + tab Cài đặt ngay');
    await w(600);
    var bg=since(SRV.gas,g0).filter(function(x){ return /^adm_(data|stats)$/.test(x.action); });
    var d=bg.filter(function(x){ return x.action==='adm_data'; })[0], s=bg.filter(function(x){ return x.action==='adm_stats'; })[0];
    check(d && s && Math.abs(d.t-s.t)<400, 'làm mới ngầm: adm_data + adm_stats cùng lúc, Δ='+(d&&s?Math.abs(d.t-s.t):'?')+' ms');
    check(SRV.wk.filter(function(x){ return x.t>=t && x.action==='coach'; }).length===0, 'PIN Admin đã biết → không thử PIN coach ở Worker');
    await w(4200); SRV.latW={}; SRV.latG={};
  });

  await run('AD13', 'Đổi người giữa lúc đang làm mới: kết quả phiên cũ bị bỏ, phiên mới vẫn tự làm mới (không bị lệnh cũ chặn)', async function(){
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
    SRV.latW={coach:2500}; SRV.latG={stats:2500};
    await pin(C_PIN); await homeReady(function(){ return state.screen==='p-home' && !!state.pin; });
    await w(300);                                                   /* làm mới của coach đang bay (2,5 s) */
    await ev(function(){ logout(); }); await screen('p-pin'); await w(300);
    var g0=SRV.gas.length;
    await pin(A_PIN); await homeReady(function(){ return state.screen==='p-home' && state.admin; });
    await w(400);
    check(since(SRV.gas,g0).some(function(x){ return x.action==='adm_data'; }), 'Admin tự làm mới ngay: '+since(SRV.gas,g0).map(function(x){ return x.action; }).join(','));
    await w(3000);                                                  /* kết quả của coach về muộn */
    var st=await ev(function(){ return {coach:state.coach, n:state.clients.length, admin:state.admin, last:JSON.parse(localStorage.getItem('lb_last')||'null'), sa:!!(state.stats&&state.stats.admin), cache:(JSON.parse(localStorage.getItem('lb_stats_Admin')||'{}').res||{}).admin===true}; });
    check(st.admin && st.coach==='Admin' && st.n===5, 'phiên Admin giữ nguyên: '+JSON.stringify(st));
    check(st.last && st.last.adm===1 && st.last.coach==='Admin', 'lb_last không bị dữ liệu coach ghi đè: '+JSON.stringify(st.last));
    check(st.sa && st.cache, 'thống kê (trên màn + cache) là của Admin, không phải của coach về muộn');
    check((await ev(function(){ return BUSY_N; }))===0, 'vạch bận = 0');
    SRV.latW={}; SRV.latG={};
  });

  await run('AD14', 'Admin lần đầu (chưa có cache): adm_data ∥ adm_stats — thống kê có cùng lúc với danh sách, không cộng dồn', async function(){
    await ev(function(){ logout(); }); await screen('p-pin'); await w(300);
    await ev(function(){ ['lb_acc','lb_last','lb_data_Admin','lb_stats_Admin'].forEach(function(k){ localStorage.removeItem(k); }); });
    SRV.latW={coach:300}; SRV.latG={admin:1500, adm_data:2000, adm_stats:2000};
    var g0=SRV.gas.length, t=Date.now();
    await pin(A_PIN);
    await page.waitForFunction(function(){ return state.admin && !state.loading; }, null, {timeout:9000}); var td=Date.now()-t;
    await page.waitForFunction(function(){ return state.stats && state.stats.admin; }, null, {timeout:9000}); var ts=Date.now()-t;
    var calls=since(SRV.gas,g0), d=calls.filter(function(x){ return x.action==='adm_data'; })[0], s=calls.filter(function(x){ return x.action==='adm_stats'; })[0];
    console.log('   · Admin lần đầu (Worker 300 ms, adm_data 2.000 ms, adm_stats 2.000 ms): danh sách '+td+' ms · thống kê '+ts+' ms');
    check(d && s && Math.abs(d.t-s.t)<400, 'gửi cùng lúc: Δ='+(d&&s?Math.abs(d.t-s.t):'?')+' ms');
    check(td<3400, 'danh sách Admin sau '+td+' ms (v2.4.0: +1 lượt admin)');
    check(ts<3600, 'thống kê sau '+ts+' ms (v2.4.0 nối đuôi ≥ 5.800 ms)');
    await w(300);
    check((await txt('#h-taught'))==='Tổng 309 buổi', 'hero: '+(await txt('#h-taught')));
    check((await ev(function(){ return BUSY_N; }))===0, 'vạch bận = 0');
    SRV.latW={}; SRV.latG={};
  });

  await run('AD15', 'Sang tháng giữa chừng: thống kê gọi lại đúng tháng mới (thống kê về trước hay sau danh sách đều đúng)', async function(){
    var cur=today().slice(0,7);
    for(var order of ['thống kê về trước','danh sách về trước']){
      SRV.latG = order==='thống kê về trước' ? {adm_data:800} : {adm_stats:800};
      var g0=SRV.gas.length;
      await ev(function(){ TODAY_ISO='2020-01-31'; TODAY=vn(TODAY_ISO); state.stats=null; return refreshData(true); });
      await w(2400);
      var ms=since(SRV.gas,g0).filter(function(x){ return x.action==='adm_stats'; }).map(function(x){ return x.month; });
      check(ms.length===2 && ms[0]==='2020-01' && ms[1]===cur, order+': tháng gửi đi '+ms.join(' → '));
      check((await ev(function(){ return state.stats && state.stats.month; }))===cur && (await ev(function(){ return TODAY_ISO.slice(0,7); }))===cur, order+': thống kê cuối = tháng hiện tại');
    }
    SRV.latG={};
  });
  await C.ctx.close();

  /* bố cục tab Cài đặt + nav 3 tab ở 375 / 430 */
  for(var vp of [{width:375,height:667},{width:430,height:932}]){
    await run('AD-L'+vp.width, 'Bố cục Admin '+vp.width+'×'+vp.height+': nav 3 tab + CTA, tab Cài đặt không cắt chữ', async function(){
      resetSrv(); var D=await mk(vp), pg=D.page; page=pg;
      await pg.goto('http://localhost:'+PORT+'/'); await screen('p-pin'); await w(500);
      await pin(A_PIN); await screen('p-home'); await pg.waitForFunction(function(){ return state.admin && !state.loading; }, null, {timeout:8000}); await w(1500);
      for(var id of ['p-home','p-clients','p-admin']){
        if(id!=='p-home'){ await pg.evaluate(function(id){ go(id,'fwd'); }, id); await screen(id); await w(1300); }
        var r=await pg.evaluate(function(id){ var pgE=document.getElementById(id), W=innerWidth;
          var btn=[].filter.call(pgE.querySelectorAll('.nav button'), function(b){ return getComputedStyle(b).display!=='none'; }).map(function(b){ var q=b.getBoundingClientRect(); return {l:q.left, r:q.right, t:q.top, clip:b.scrollWidth>b.clientWidth+1}; });
          var clip=[].filter.call(pgE.querySelectorAll('.t1,.nm,.lab,.ipval'), function(e){ var q=e.getBoundingClientRect(); return q.width>0 && e.scrollWidth>e.clientWidth+1 && getComputedStyle(e).textOverflow!=='ellipsis'; }).map(function(e){ return e.className+':'+e.textContent.slice(0,20); });
          return {btn:btn, clip:clip, W:W, over:document.documentElement.scrollWidth>W}; }, id);
        check(r.btn.length===4 && r.btn.every(function(b,i){ return b.l>=0 && b.r<=r.W && !b.clip && (i===0 || b.l>=r.btn[i-1].r); }), id+' nav: '+JSON.stringify(r.btn));
        check(!r.clip.length && !r.over, id+' chữ bị cắt / tràn ngang: '+r.clip.join(', '));
        await pg.screenshot({path:path.join(OUT,'ad-l'+vp.width+'-'+id+'.png')});
      }
      await D.ctx.close();
    });
  }

  /* ---------------- v2.15.2 · Admin trên Worker v8 (SRV.wkAdm) ---------------- */
  var D=null;
  async function fresh(cfg){
    if(D) await D.ctx.close();
    resetSrv(); SRV.wkAdm=true; Object.assign(SRV, cfg||{});
    D=await mk(); page=D.page;
    await page.goto('http://localhost:'+PORT+'/'); await screen('p-pin'); await w(500);
  }
  function acts(arr, i){ return since(arr, i||0).map(function(x){ return x.action; }).filter(function(a){ return a!=='ping'; }); }
  async function adminIn(){ await pin(A_PIN); await page.waitForFunction(function(){ return state.screen==='p-home' && state.admin && !state.loading; }, null, {timeout:9000}); await w(600); }
  async function ciAdmin(row){ await page.click('#h-go'); await screen('p-pick'); await w(700); await page.click('#pk-list .row:has-text("'+row+'")'); await screen('p-confirm'); await w(1300); await page.click('#cf-go'); }
  async function leaveSession(){ await ev(function(){ closeLib(true); state.session=null; saveSession(); go('p-home','back'); }); await screen('p-home'); await w(700); }

  await run('AW1', 'Worker v8 · PIN Admin lần đầu: adm_data ở Worker ∥ adm_stats ở Apps Script — danh sách không chờ thống kê, Apps Script không thấy adm_data', async function(){
    await fresh({latW:{coach:300, adm_data:500}, latG:{adm_stats:2500}});
    var t=Date.now(); await pin(A_PIN);
    await page.waitForFunction(function(){ return state.admin && !state.loading; }, null, {timeout:9000}); var td=Date.now()-t;
    await page.waitForFunction(function(){ return state.stats && state.stats.admin; }, null, {timeout:9000}); var ts=Date.now()-t;
    console.log('   · Worker v8 (coach 300 ms · adm_data 500 ms · adm_stats Apps Script 2.500 ms): danh sách '+td+' ms · thống kê '+ts+' ms');
    check(td<1700, 'danh sách Admin sau '+td+' ms (lùi Apps Script thì ≥ 2.500 ms)');
    check(acts(SRV.wk).join()==='coach,adm_data', 'Worker: '+acts(SRV.wk).join());
    check(acts(SRV.gas).join()==='adm_stats', 'Apps Script chỉ adm_stats: '+acts(SRV.gas).join());
    check(SRV.wk.filter(function(x){ return x.action==='adm_data'; }).every(function(x){ return x.apin===A_PIN && !x.pin && x.ip===DEV_IP; }), 'adm_data ở Worker: apin, không pin, kèm ip');
    await w(300);
    check((await txt('#h-name'))==='Admin' && (await txt('#h-taught'))==='Tổng 309 buổi', 'trang chủ: '+(await txt('#h-name'))+' · '+(await txt('#h-taught')));
    check((await disp('#p-home .tab-adm'))==='flex', 'tab Cài đặt hiện');
    check(await ev(function(){ return VIA.adm_data==='wk' && WK_ON.adm_checkin===1 && !WK_SAFE.adm_checkin && WK_SAFE.adm_data===1 && WK_SAFE.adm_log===1; }), 'VIA.adm_data = wk · adm_checkin không lùi khi lỗi mạng');
    check((await ev(function(){ return BUSY_N; }))===0, 'vạch bận = 0');
    SRV.latW={}; SRV.latG={};
  });

  await run('AW2', 'Worker v8 · Admin check-in khách coach khác từ IP lạ: adm_checkin ở Worker đúng 1 lần, Apps Script 0', async function(){
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await ciAdmin('Sao Mai'); await screen('p-plan', 9000); await w(600);
    check(SRV.checkins.length===1 && SRV.checkins[0].name==='Vũ Sao Mai' && SRV.checkins[0].via==='wk' && SRV.checkins[0].ip===DEV_IP, 'check-in: '+JSON.stringify(SRV.checkins));
    check(acts(SRV.wk,k0).filter(function(a){ return a==='adm_checkin'; }).length===1, 'Worker adm_checkin 1 lần: '+acts(SRV.wk,k0).join());
    check(acts(SRV.gas,g0).indexOf('adm_checkin')<0, 'Apps Script không nhận check-in: '+acts(SRV.gas,g0).join());
    check(/^Đã check-in/.test(await pill()), 'pill: '+(await pill()));
    check(await ev(function(){ return state.session && state.session.coach==='Admin'; }), 'buổi tập thuộc Admin');
  });

  await run('AW3', 'Worker v8 · Admin ghi dữ liệu: adm_log ở Worker (apin), Apps Script 0, outbox trống; gửi lại cùng id → không ghi trùng', async function(){
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await ev(function(){ enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'weight', val:54}); return flush(); }); await w(900);
    var calls=SRV.wk.slice(k0).filter(function(x){ return x.action==='adm_log'; });
    check(calls.length===1 && calls[0].apin===A_PIN && !calls[0].pin, 'Worker adm_log 1 lần kèm apin: '+calls.length);
    check(SRV.alogs.length===1 && SRV.alogVia[0]==='wk' && SRV.alogs[0].coach==='Admin', 'ghi ở Worker: '+SRV.alogVia.join());
    check(acts(SRV.gas,g0).indexOf('adm_log')<0, 'Apps Script không nhận adm_log: '+acts(SRV.gas,g0).join());
    check((await ev(function(){ return OUT.q.length; }))===0, 'outbox trống');
    await ev(function(e){ OUT.q.push(e); outSave(); return flush(); }, SRV.alogs[0]); await w(900);
    check(SRV.alogs.length===1 && (await ev(function(){ return OUT.q.length; }))===0, 'gửi lại cùng id: không ghi trùng, outbox trống ('+SRV.alogs.length+')');
    await leaveSession();
  });

  await run('AW4', 'Worker v8 · tab Cài đặt ghi nguồn "WORKER"; IP phòng (iplist · addip) vẫn chỉ Apps Script, Worker không thấy', async function(){
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await page.click('#p-home .nav button[aria-label="Cài đặt"]'); await screen('p-admin'); await w(1300);
    check(new RegExp('· '+APPV+' · WORKER$').test(await txt('#am-ver')), 'dòng phiên bản: '+(await txt('#am-ver')));
    await page.click('#am-add'); await w(900);
    check(SRV.ipList.join()===ROOM_IP+','+DEV_IP, 'thêm IP: '+SRV.ipList.join());
    var g=acts(SRV.gas,g0), k=acts(SRV.wk,k0);
    check(g.indexOf('iplist')>=0 && g.indexOf('addip')>=0 && g.every(function(a){ return !/^adm_(data|checkin|log)$/.test(a); }), 'Apps Script: '+g.join());
    check(k.every(function(a){ return !/^(iplist|addip|delip|adm_stats)$/.test(a); }), 'Worker: '+k.join());
    SRV.ipList=[ROOM_IP];
    await page.click('#p-admin .nav .ghost:nth-child(1)'); await screen('p-home'); await w(600);
  });

  await run('AW5', 'Worker v8 · mất phản hồi SAU KHI Worker đã ghi check-in: không lùi Apps Script, "Thử lại" nhận da_checkin — đúng 1 dòng', async function(){
    SRV.wkCut={adm_checkin:1}; var k0=SRV.wk.length, g0=SRV.gas.length;
    await ciAdmin('Quang Vinh'); await w(1500);
    check(/^Chưa check-in/.test(await pill()) && /Thử lại/.test(await txt('#pill .act')), 'pill: '+(await pill()));
    check((await ev(function(){ return state.screen; }))==='p-confirm', 'ở lại màn xác nhận');
    check(acts(SRV.gas,g0).indexOf('adm_checkin')<0, 'KHÔNG lùi Apps Script khi Worker có thể đã ghi: '+acts(SRV.gas,g0).join());
    check(SRV.checkins.filter(function(c){ return c.name==='Nguyễn Quang Vinh'; }).length===1, 'Worker đã ghi 1 dòng');
    SRV.wkCut={};
    await page.click('#pill .act'); await screen('p-plan', 9000); await w(600);
    check(SRV.checkins.filter(function(c){ return c.name==='Nguyễn Quang Vinh'; }).length===1, 'Thử lại không ghi thêm: '+SRV.checkins.length);
    check(acts(SRV.wk,k0).filter(function(a){ return a==='adm_checkin'; }).length===2 && acts(SRV.gas,g0).indexOf('adm_checkin')<0, 'Worker 2 lượt (lượt 2 = da_checkin), Apps Script 0');
    check(/^Đã check-in/.test(await pill()), 'pill: '+(await pill()));
    await leaveSession();
  });

  await run('AW6', 'Worker v8 mất mạng: adm_data / adm_log lùi Apps Script; adm_checkin KHÔNG lùi, mạng về "Thử lại" → Worker ghi 1 lần', async function(){
    SRV.wkDown={adm_data:1, adm_log:1, adm_checkin:1}; var g0=SRV.gas.length;
    await ev(function(){ return refreshData(true); }); await w(900);
    check(acts(SRV.gas,g0).indexOf('adm_data')>=0, 'adm_data lùi Apps Script: '+acts(SRV.gas,g0).join());
    check(await ev(function(){ return state.admin && VIA.adm_data==='gas'; }), 'vẫn Admin, nguồn Apps Script');
    await ev(function(){ enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'waist', val:65}); return flush(); }); await w(900);
    check(SRV.alogVia.slice(-1)[0]==='gas' && (await ev(function(){ return OUT.q.length; }))===0, 'adm_log lùi Apps Script: '+SRV.alogVia.join());
    var g1=SRV.gas.length;
    await ciAdmin('Trần Minh Anh'); await w(1500);
    check(/^Chưa check-in/.test(await pill()), 'check-in báo lỗi: '+(await pill()));
    check(acts(SRV.gas,g1).indexOf('adm_checkin')<0 && SRV.checkins.every(function(c){ return c.name!=='Trần Minh Anh'; }), 'adm_checkin KHÔNG lùi Apps Script: '+acts(SRV.gas,g1).join());
    SRV.wkDown={};
    await page.click('#pill .act'); await screen('p-plan', 9000); await w(500);
    check(SRV.checkins.filter(function(c){ return c.name==='Trần Minh Anh'; }).length===1 && SRV.checkins.slice(-1)[0].via==='wk', 'mạng về, Thử lại → Worker ghi 1 lần: '+JSON.stringify(SRV.checkins.slice(-1)));
    await leaveSession();
  });

  await run('AW7', 'ADMIN_PIN của Worker khác Apps Script: Worker trả sai_pin → lệnh Admin lùi Apps Script, Admin vẫn dùng được (không báo PIN sai)', async function(){
    await fresh({wkApin:'9999'});
    await adminIn();
    check((await txt('#h-name'))==='Admin', 'vào Admin: '+(await txt('#h-name')));
    check(acts(SRV.wk).join()==='coach,adm_data' && acts(SRV.gas).slice().sort().join()==='adm_data,adm_stats', 'wk '+acts(SRV.wk).join()+' · gas '+acts(SRV.gas).join());
    check(await ev(function(){ return VIA.adm_data==='gas'; }), 'nguồn Apps Script');
    await ciAdmin('Sao Mai'); await screen('p-plan', 9000); await w(500);
    check(SRV.checkins.length===1 && SRV.checkins[0].via==='gas', 'check-in qua Apps Script: '+JSON.stringify(SRV.checkins));
    check(SRV.wk.filter(function(x){ return x.action==='adm_checkin'; }).length===1, 'Worker được hỏi 1 lần (sai_pin, không ghi)');
    await ev(function(){ enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'weight', val:55}); return flush(); }); await w(900);
    check(SRV.alogs.length===1 && SRV.alogVia[0]==='gas' && (await ev(function(){ return OUT.q.length; }))===0, 'adm_log qua Apps Script: '+SRV.alogVia.join());
    await leaveSession();
    await page.click('#p-home .nav button[aria-label="Cài đặt"]'); await screen('p-admin'); await w(900);
    check(new RegExp('· '+APPV+' · APPS SCRIPT$').test(await txt('#am-ver')), 'dòng phiên bản: '+(await txt('#am-ver')));
    await page.click('#p-admin .nav .ghost:nth-child(1)'); await screen('p-home'); await w(500);
  });

  await run('AW8', 'Worker v8 thiếu sheet coach đích (wk_no_sheet_coach): adm_log lùi Apps Script, đủ sự kiện, không trùng', async function(){
    await fresh({wkNoSheet:true}); await adminIn();
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await ev(function(){ enqueue({type:'ĐO', name:'Phan Việt Hoàng', metric:'weight', val:70}); enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'weight', val:54}); return flush(); }); await w(1200);
    check(acts(SRV.wk,k0).filter(function(a){ return a==='adm_log'; }).length===1 && acts(SRV.gas,g0).filter(function(a){ return a==='adm_log'; }).length===1, 'Worker 1 lượt (từ chối) → Apps Script 1 lượt: wk '+acts(SRV.wk,k0).join()+' · gas '+acts(SRV.gas,g0).join());
    check(SRV.alogs.length===2 && SRV.alogVia.join()==='gas,gas', 'ghi đủ 2 ở Apps Script: '+SRV.alogVia.join());
    check((await ev(function(){ return OUT.q.length; }))===0, 'outbox trống');
  });

  await run('AW9', 'Worker v8 · PIN sai → "MÃ PIN KHÔNG ĐÚNG" (Worker rồi Apps Script cùng từ chối), giao diện Admin không nháy', async function(){
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
    await watchAdm(); var k0=SRV.wk.length, g0=SRV.gas.length;
    await pin('5555'); await w(2200);
    check((await txt('#pin-err'))==='MÃ PIN KHÔNG ĐÚNG' && (await ev(function(){ return state.screen; }))==='p-pin', 'lỗi: '+(await txt('#pin-err')));
    check(!(await ev(function(){ return state.admin; })) && (await admOn())===0, 'không vào / không nháy Admin');
    check(acts(SRV.wk,k0).join()==='coach,adm_data' && acts(SRV.gas,g0).slice().sort().join()==='adm_data,adm_stats', 'wk '+acts(SRV.wk,k0).join()+' · gas '+acts(SRV.gas,g0).join());
    check((await ev(function(){ return BUSY_N; }))===0, 'vạch bận = 0');
  });

  await run('AW11', 'Worker v8 trả lỗi (Sheets 503 / lỗi lạ, HTTP 200): adm_data · adm_log lùi Apps Script; adm_checkin KHÔNG lùi, báo "Chưa check-in"', async function(){
    await fresh({wkErr:{adm_data:'sheets_503_UNAVAILABLE', adm_log:'sheets_500_INTERNAL', adm_checkin:'ghi_de_dong'}});
    await adminIn();
    check((await txt('#h-name'))==='Admin' && acts(SRV.gas).indexOf('adm_data')>=0, 'adm_data lùi Apps Script, vào Admin: gas '+acts(SRV.gas).join());
    check(await ev(function(){ return VIA.adm_data==='gas'; }), 'nguồn Apps Script');
    await ev(function(){ enqueue({type:'ĐO', name:'Vũ Sao Mai', metric:'weight', val:56}); return flush(); }); await w(900);
    check(SRV.alogs.length===1 && SRV.alogVia[0]==='gas' && (await ev(function(){ return OUT.q.length; }))===0, 'adm_log lùi Apps Script: '+SRV.alogVia.join());
    var g0=SRV.gas.length;
    await ciAdmin('Sao Mai'); await w(1500);
    check(/^Chưa check-in/.test(await pill()) && (await ev(function(){ return state.screen; }))==='p-confirm', 'check-in báo lỗi, ở lại xác nhận: '+(await pill()));
    check(acts(SRV.gas,g0).indexOf('adm_checkin')<0 && SRV.checkins.length===0, 'adm_checkin KHÔNG lùi Apps Script: '+acts(SRV.gas,g0).join());
    SRV.wkErr={};
    await page.click('#pill .act'); await screen('p-plan', 9000); await w(500);
    check(SRV.checkins.length===1 && SRV.checkins[0].via==='wk', 'Worker hết lỗi → Thử lại ghi 1 lần ở Worker');
    await leaveSession();
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
  });

  await run('AW10', 'Worker v8 · coach 1234 không đổi: không lệnh adm_*, không apin; check-in ngoài phòng vẫn bị chặn', async function(){
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await pin(C_PIN); await screen('p-home'); await w(1500);
    check(!(await ev(function(){ return state.admin; })) && (await txt('#h-name'))!=='Admin', 'coach: '+(await txt('#h-name')));
    await page.click('#h-go'); await screen('p-pick'); await w(600);
    await page.click('#pk-list .row:has-text("Quang Vinh")'); await screen('p-confirm'); await w(1200);
    await page.click('#cf-go'); await w(2500);
    check(/phòng/.test(await pill()), 'bị chặn: '+(await pill()));
    var all=SRV.wk.slice(k0).concat(SRV.gas.slice(g0));
    check(all.every(function(x){ return !x.apin && !/^adm_/.test(x.action); }), 'không adm_* / apin: '+all.map(function(x){ return x.action; }).join(','));
    await D.ctx.close(); D=null;
  });

  await browser.close(); srv.close();
  var fails=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fails)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length+(PAGEERR.length?'\n - '+PAGEERR.join('\n - '):''));
  process.exit(fails||PAGEERR.length?1:0);
})().catch(function(e){ console.error('EXC', e); process.exit(2); });

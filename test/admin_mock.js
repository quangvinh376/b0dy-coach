/* Chế độ ADMIN v2.4 với máy chủ MOCK (không ?demo): Worker + Apps Script + ipify giả.
   Kiểm: định tuyến lệnh (adm_* chỉ đi Apps Script, kèm apin; Worker không bao giờ thấy apin), check-in không khoá IP,
   coach VẪN bị khoá IP, tab Cài đặt (IP phòng: thêm / xoá / đủ / giữ ≥1), outbox tách người, khôi phục khi reload,
   PIN sai, backend chưa nâng cấp, PIN admin bị đổi giữa chừng, bố cục 375/393/430.
   PIN trong file này là PIN GIẢ của mock — PIN thật chỉ nằm trong Script Properties.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/admin_mock.js */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19321, OUT=path.join(__dirname,'out_admin');
var A_PIN='7777', C_PIN='1234', DEV_IP='9.9.9.9', ROOM_IP='203.0.113.7';
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});

var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
async function run(id, name, fn){ CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }

/* ---------------- máy chủ giả ---------------- */
function today(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
var SRV;
function resetSrv(){
  SRV={wk:[], gas:[], ipList:[ROOM_IP], noAdm:false, down:false, apin:A_PIN, checkins:[], alogs:[], clogs:[],
    mem:[{name:'Bùi Doãn Quang',done:14,total:24,left:10,coach:'Quyết Hán',kind:'PT 1:2'},
         {name:'Nguyễn Quang Vinh',done:11,total:12,left:1,coach:'Quyết Hán',kind:''},
         {name:'Vũ Sao Mai',done:3,total:24,left:21,coach:'Hiền Mai',kind:''},
         {name:'Trần Minh Anh',done:5,total:12,left:7,coach:'Hiền Mai (giai đoạn 1)',kind:''},
         {name:'Phan Việt Hoàng',done:12,total:12,left:0,coach:'Hiền Mai',kind:''}]};
}
resetSrv();
function coachRes(){ return {ok:true, coach:'Quyết Hán', members:SRV.mem.filter(function(m){ return /Quyết/.test(m.coach); }), snapshot:{}, library:null, today:today()}; }
function send(r, out){ return r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)}); }
async function wk(r){
  var p=JSON.parse(r.request().postData()||'{}'); SRV.wk.push({action:p.action, pin:p.pin, apin:p.apin, ip:p.ip});
  if(p.action==='ping') return send(r,{ok:true});
  if(p.action==='coach') return send(r, p.pin===C_PIN ? coachRes() : {ok:false,error:'sai_pin'});
  if(p.action==='checkin_coach' || p.action==='log'){ if(SRV.ipList.indexOf(p.ip)<0) return send(r,{ok:false,error:'wrong_ip'}); }
  if(p.action==='log' && p.pin===C_PIN){ SRV.clogs=SRV.clogs.concat(p.events); return send(r,{ok:true,written:p.events.length}); }
  return send(r,{ok:false,error:'unknown_action'});
}
async function gas(r){
  var p=JSON.parse(r.request().postData()||'{}'); SRV.gas.push({action:p.action, pin:p.pin, apin:p.apin, ip:p.ip, del:p.del, events:p.events, name:p.name});
  if(SRV.down && p.action!=='ping') return r.abort('internetdisconnected');
  var a=p.action, isA=(p.apin===SRV.apin);
  if(a==='ping') return send(r,{ok:true,pong:1});
  if(a==='admin') return send(r, isA?{ok:true}:{ok:false,error:'sai_pin'});
  if(/^adm_/.test(a) || a==='iplist' || a==='addip' || a==='delip'){
    if(SRV.noAdm) return send(r,{ok:false,error:'unknown_action'});
    if(!isA) return send(r,{ok:false,error:'sai_pin'});
    if(a==='adm_data') return send(r,{ok:true, admin:true, coach:'Admin', members:JSON.parse(JSON.stringify(SRV.mem)), snapshot:{}, library:null, today:today()});
    if(a==='adm_stats') return send(r,{ok:true, admin:true, month:today().slice(0,7), days:{}, monthTotal:309, perClient:{}, rev:{month:today().slice(0,7), total:96500000}, hist:{}});
    if(a==='adm_checkin'){ var m=SRV.mem.filter(function(x){ return x.name===p.name; })[0]; if(!m) return send(r,{ok:false,error:'khong_thay_khach'});
      SRV.checkins.push({name:p.name, by:'Admin', ip:p.ip}); m.done++; m.left--; return send(r,{ok:true,row:42,member:m,coach:m.coach,by:'Admin',at:'09:41'}); }
    if(a==='adm_log'){ SRV.alogs=SRV.alogs.concat(p.events||[]); return send(r,{ok:true,written:(p.events||[]).length}); }
    if(a==='iplist') return send(r,{ok:true, ips:SRV.ipList.slice(), max:2});
    if(a==='addip'){ if(!p.ip) return send(r,{ok:false,error:'thieu_ip'}); if(SRV.ipList.indexOf(p.ip)<0){ if(SRV.ipList.length>=2) return send(r,{ok:false,error:'full',ips:SRV.ipList.slice(),max:2}); SRV.ipList.push(p.ip); } return send(r,{ok:true,ips:SRV.ipList.slice(),max:2}); }
    if(a==='delip'){ var k=SRV.ipList.indexOf(String(p.del||'')); if(k>=0){ if(SRV.ipList.length<=1) return send(r,{ok:false,error:'con_1_ip',ips:SRV.ipList.slice(),max:2}); SRV.ipList.splice(k,1); } return send(r,{ok:true,ips:SRV.ipList.slice(),max:2}); }
  }
  if(a==='coach') return send(r, p.pin===C_PIN ? coachRes() : {ok:false,error:'sai_pin'});
  if(a==='stats') return send(r, p.pin===C_PIN ? {ok:true, month:today().slice(0,7), days:{}, monthTotal:103, perClient:{}, com:{month:today().slice(0,7), total:14200000}, hist:{}} : {ok:false,error:'sai_pin'});
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

  await run('AD2', 'PIN admin: Worker từ chối → admin (Apps Script) → adm_data; trang chủ "Admin", Tổng/Doanh thu, tab Cài đặt hiện', async function(){
    var k0=SRV.wk.length, g0=SRV.gas.length;
    await pin(A_PIN); await screen('p-home'); await page.waitForFunction(function(){ return !state.loading && state.admin; }, null, {timeout:8000}); await w(1800);
    var gw=since(SRV.gas,g0).map(function(x){ return x.action; }), kw=since(SRV.wk,k0).map(function(x){ return x.action; });
    check(kw.indexOf('coach')>=0, 'thử PIN coach ở Worker trước: '+kw.join(','));
    check(gw.indexOf('admin')>=0 && gw.indexOf('adm_data')>gw.indexOf('admin') && gw.indexOf('adm_stats')>=0, 'chuỗi Apps Script: '+gw.join(','));
    check(since(SRV.wk,k0).every(function(x){ return !x.apin && !/^adm_|^iplist|^addip|^delip/.test(x.action); }), 'Worker không bao giờ thấy apin/adm_*');
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
    SRV.apin=A_PIN;
  });

  await run('AD10', 'PIN sai (không phải coach, không phải admin) → "MÃ PIN KHÔNG ĐÚNG"', async function(){
    await pin('5555'); await w(2000);
    check((await txt('#pin-err'))==='MÃ PIN KHÔNG ĐÚNG' && (await ev(function(){ return state.screen; }))==='p-pin', 'lỗi: '+(await txt('#pin-err')));
    check(!(await ev(function(){ return state.admin; })), 'không vào admin');
  });

  await run('AD11', 'Backend chưa có Admin.gs (unknown_action) → "MÁY CHỦ CHƯA CÓ CHẾ ĐỘ ADMIN"', async function(){
    SRV.noAdm=true; await ev(function(){ localStorage.removeItem('lb_last'); });
    await pin(A_PIN); await w(2500);
    check((await txt('#pin-err'))==='MÁY CHỦ CHƯA CÓ CHẾ ĐỘ ADMIN' && (await ev(function(){ return state.screen; }))==='p-pin', 'lỗi: '+(await txt('#pin-err')));
    SRV.noAdm=false;
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

  await browser.close(); srv.close();
  var fails=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fails)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length+(PAGEERR.length?'\n - '+PAGEERR.join('\n - '):''));
  process.exit(fails||PAGEERR.length?1:0);
})().catch(function(e){ console.error('EXC', e); process.exit(2); });

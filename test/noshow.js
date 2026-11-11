/* v2.22.0 — NO-SHOW (chủ studio 11/11/2026 · Figma section 1915:280, frame A–G). Máy chủ MOCK, dữ liệu bịa.
   Kiểm: bố cục đúng Figma (393 × 852, ±1 px) · lệnh noshow_coach chỉ đi Apps Script, đúng MỘT lần, không tự gửi lại ·
   màn sau khi ghi (thẻ đỏ, "Buổi thứ N đã vắng", "Còn L buổi", "Về trang chủ") · lớp 1:2 (một người vắng → buổi 1:1 với người kia,
   cả hai vắng → về trang chủ) · lỗi (ngoài phòng, mất mạng, khách đã check-in, máy khác đã ghi vắng) · Admin (adm_noshow) ·
   nhãn "VẮNG HÔM NAY" ở danh sách (máy này + máy khác qua stats.absent) · 0 PAGEERR.
   Chạy: node test/noshow.js   (ảnh: test/out_ns/) */
var {chromium}=require('playwright'), serve=require('./serve'), fs=require('fs');
var pass=0, fail=0;
function ck(ok, msg, extra){ if(ok) pass++; else fail++; console.log((ok?'  ok   ':'  FAIL ')+msg+(ok||extra===undefined?'':'  -> '+JSON.stringify(extra).slice(0,600))); }
function near(a, b, tol){ return Math.abs(a-b)<=(tol==null?1:tol); }
function box(b, x, y, w, h, tol){ return !!b && near(b.x,x,tol) && near(b.y,y,tol) && near(b.w,w,tol) && near(b.h,h,tol); }

(async function(){
  var PORT=+process.env.PORT||8141, srv=await serve(PORT), browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var errors=[], OUT='test/out_ns'; fs.mkdirSync(OUT,{recursive:true});
  var TODAY=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
  function mkMembers(){ return [
    {name:'Bùi Doãn Quang', key:'Bùi Doãn Quang', pid:'B901DY', done:14, total:24, left:10, coach:'Quyết Hán', kind:'1:1', exp:'2027-01-21'},
    {name:'Phạm Thành Long', key:'Phạm Thành Long', pid:'B902DY', done:3, total:12, left:9, coach:'Quyết Hán', kind:'1:2', exp:'2027-01-21'},
    {name:'Trần Minh Anh', key:'Trần Minh Anh', pid:'B903DY', done:14, total:24, left:10, coach:'Quyết Hán', kind:'1:2', exp:'2027-01-21'},
    {name:'Lê Khách Lẻ', key:'Lê Khách Lẻ', pid:'B904DY', done:1, total:12, left:11, coach:'Hiền Mai', kind:'1:1', exp:'2027-01-21'}
  ]; }
  var SRV;
  function reset(o){ SRV=Object.assign({wk:[], gas:[], members:mkMembers(), rows:{}, mode:'ok', statsAbsent:null, wkStatus:false}, o||{}); }
  function send(r, o){ r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(o)}); }
  function memberOut(m){ var o=Object.assign({}, m), rw=SRV.rows[m.pid]; if(rw){ o.checked=true; o.signed=rw.at; if(rw.st==='Vắng' && SRV.sendAbsent!==false) o.absent=true; } return o; }
  function coachOut(p, via){ var adm=/^adm_/.test(p.action), list=SRV.members.filter(function(m){ return adm || m.coach==='Quyết Hán'; }).map(memberOut);
    if(via==='wk') list.forEach(function(m){ delete m.absent; });      /* Worker v12 chưa gửi cờ absent */
    return {ok:true, coach:adm?'Admin':'Quyết Hán', admin:adm||undefined, members:list, snapshot:{}, library:[{name:'Lat Pulldown', group:'Kéo'}], today:TODAY}; }
  function statsOut(){ return {ok:true, month:TODAY.slice(0,7), today:TODAY, days:{}, monthTotal:40, perClient:{}, com:{month:TODAY.slice(0,7), total:1000000}, hist:{}, sess:[], comMon:{}, absent:SRV.statsAbsent||undefined}; }
  function write(p, st){ var adm=/^adm_/.test(p.action), m=SRV.members.filter(function(x){ return x.pid===p.pid; })[0];
    if(!m) return {ok:false, error:adm?'khong_thay_khach':'khong_phai_khach_cua_ban'};
    if(SRV.rows[m.pid]) return {ok:false, error:'da_checkin', status:SRV.rows[m.pid].st, at:SRV.rows[m.pid].at};
    SRV.rows[m.pid]={st:st, at:'16:42'}; m.done++; m.left--;
    var o={ok:true, row:9, member:Object.assign({}, m), at:'16:42', coach:m.coach}; if(st==='Vắng') o.absent=true; return o; }
  async function wk(r){ var p=JSON.parse(r.request().postData()||'{}'); SRV.wk.push(p);
    if(p.action==='ping') return send(r,{ok:true,pong:1,v:12});
    if(p.apin){ if(p.apin!=='7788') return send(r,{ok:false,error:'sai_pin'}); }
    else if(p.pin!=='1234') return send(r,{ok:false,error:'sai_pin'});
    if(p.action==='coach'||p.action==='adm_data') return send(r, coachOut(p,'wk'));
    if(p.action==='log'||p.action==='adm_log') return send(r,{ok:true,written:(p.events||[]).length});
    if(p.action==='checkin_coach'||p.action==='adm_checkin'){ var w=write(p,'Đã tập'); if(!w.ok && !SRV.wkStatus) delete w.status; return send(r,w); }
    return send(r,{ok:false,error:'unknown_action'});
  }
  async function gas(r){ var p=JSON.parse(r.request().postData()||'{}'); SRV.gas.push(p);
    if(p.action==='ping') return send(r,{ok:true,pong:1});
    if(p.action==='admin') return send(r, p.apin==='7788'?{ok:true}:{ok:false,error:'sai_pin'});
    if(/^adm_/.test(p.action)){ if(p.apin!=='7788') return send(r,{ok:false,error:'sai_pin'}); }
    else if(p.pin!=='1234') return send(r,{ok:false,error:'sai_pin'});
    if(p.action==='coach'||p.action==='adm_data') return send(r, coachOut(p,'gas'));
    if(p.action==='stats'||p.action==='adm_stats') return send(r, statsOut());
    if(p.action==='checkin_coach'||p.action==='adm_checkin') return send(r, write(p,'Đã tập'));
    if(p.action==='noshow_coach'||p.action==='adm_noshow'){
      if(SRV.mode==='wrong_ip') return send(r,{ok:false,error:'wrong_ip'});
      if(SRV.mode==='old') return send(r,{ok:false,error:'unknown_action'});
      if(SRV.mode==='lost'){ write(p,'Vắng'); return r.abort('internetdisconnected'); }     /* máy chủ ĐÃ ghi, trả lời rơi */
      if(SRV.mode==='down') return r.abort('internetdisconnected');
      return send(r, write(p,'Vắng'));
    }
    return send(r,{ok:false,error:'unknown_action'});
  }
  async function open(o){
    o=o||{};
    var ctx=await browser.newContext({viewport:{width:o.w||393,height:o.h||852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:'{"ip":"203.0.113.7"}'}); });
    await ctx.route(/workers\.dev/, wk); await ctx.route(/script\.google\.com/, gas);
    var page=await ctx.newPage(); page.on('pageerror', function(e){ errors.push(String(e)); });
    await page.goto('http://localhost:'+PORT+'/');
    for(var k of (o.pin||'1234')) await page.click('#pin-pad button:has-text("'+k+'")');
    await page.waitForSelector('#p-home.on, #p-home.cur, #p-home:not([hidden])', {timeout:8000}).catch(function(){});
    await page.waitForTimeout(1300);
    return {ctx:ctx, page:page};
  }
  var G=function(page, sel){ return page.evaluate(function(sel){ var e=document.querySelector(sel); if(!e) return null; var r=e.getBoundingClientRect(), c=getComputedStyle(e);
    return {x:Math.round(r.left*10)/10, y:Math.round(r.top*10)/10, w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10, hidden:e.hidden||c.display==='none'||c.visibility==='hidden', bg:c.backgroundColor, color:c.color, border:c.borderTopColor, text:e.textContent, fs:c.fontSize, lh:c.lineHeight}; }, sel); };
  var shot=async function(page, name, wait){ await page.waitForTimeout(wait==null?700:wait); await page.screenshot({path:OUT+'/'+name+'.png'}); };
  var toPick=async function(page){ await page.click('#h-go'); await page.waitForTimeout(700); };
  var acts=function(list, re){ return list.filter(function(p){ return re.test(p.action); }); };
  var RED='rgb(233, 37, 105)', INK='rgb(10, 10, 10)', PAPER='rgb(250, 250, 250)', GRAY='rgb(158, 158, 158)', ACID='rgb(212, 255, 0)';

  /* ============ S1 · 1:1 — frame A → B → C ============ */
  console.log('\n== S1 · 1:1: nút No-show → cửa sổ xác nhận → đã vắng ==');
  reset(); var a=await open(), page=a.page, b, t;
  await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await shot(page,'A-confirm',1500);
  b=await G(page,'#cf-back'); ck(box(b,24,776,48,48), 'A1 nút ← 24,776 48×48', b);
  b=await G(page,'#cf-ns'); ck(box(b,115,776,124,48,2) && !b.hidden, 'A2 nút No-show 115,776 124×48 (Figma A)', b);
  ck(b.color===RED && b.border===RED && /233, 37, 105, 0\.07/.test(b.bg) && b.text==='No-show' && b.fs==='16px', 'A3 No-show: chữ đỏ · viền đỏ · nền đỏ 7 % · chữ 16', b);
  b=await G(page,'#cf-go'); ck(box(b,247,776,122,48,2) && near(b.x+b.w,369) && b.bg===ACID && b.text==='Check-in', 'A4 Check-in 247,776 122×48 Acid (cách No-show 8)', b);
  b=await G(page,'#p-confirm .card.big'); ck(box(b,24,126,345,232), 'A5 thẻ số buổi không đổi chỗ 24,126 345×232', b);
  ck((await G(page,'#nsheet')).hidden && (await G(page,'#ns-dim')).hidden, 'A6 cửa sổ + lớp mờ đang display:none (không nằm sẵn ở mép dưới)');
  await page.click('#cf-ns'); await shot(page,'B-sheet',700);
  b=await G(page,'#nsheet'); ck(box(b,0,637,393,215) && !b.hidden && b.bg===INK, 'B1 cửa sổ 0,637 393×215 nền Ink (Figma B)', b);
  b=await G(page,'#ns-handle i'); ck(box(b,159,646,75,6), 'B2 tay nắm 159,646 75×6', b);
  b=await G(page,'#ns-tt'); ck(near(b.x,24) && near(b.y,684) && near(b.h,33) && b.text==='Khách không đến?' && b.fs==='28px' && b.color===PAPER, 'B3 tiêu đề "Khách không đến?" 24,684 chữ 28 Paper', b);
  b=await G(page,'#ns-line'); ck(near(b.x,24) && near(b.y,729) && near(b.h,19) && b.text==='Xác nhận Doãn Quang vắng buổi hôm nay.' && b.fs==='16px' && b.color===GRAY, 'B4 câu "Xác nhận Doãn Quang vắng buổi hôm nay." 24,729 chữ 16 Gray', b);
  b=await G(page,'#ns-go'); ck(box(b,24,776,345,48) && b.bg===RED && b.color===INK && b.text==='Xác nhận', 'B5 nút "Xác nhận" 24,776 345×48 đỏ đặc chữ Ink', b);
  b=await G(page,'#ns-dim'); ck(!b.hidden && /10, 10, 10, 0\.75/.test(b.bg), 'B6 lớp mờ Ink 75 %', b);
  ck(acts(SRV.gas,/noshow/).length===0, 'B7 mở cửa sổ chưa gửi gì');
  await page.mouse.click(196, 300); await page.waitForTimeout(600);
  ck((await G(page,'#nsheet')).hidden && acts(SRV.gas,/noshow/).length===0, 'B8 chạm lớp mờ → đóng (display:none), không ghi');
  await page.click('#cf-ns'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1400); await shot(page,'C-absent',300);
  t=acts(SRV.gas,/noshow/); ck(t.length===1 && t[0].action==='noshow_coach' && t[0].name==='Bùi Doãn Quang' && t[0].pid==='B901DY' && t[0].key==='Bùi Doãn Quang' && t[0].pin==='1234' && t[0].ip==='203.0.113.7' && t[0].date===TODAY, 'C1 gửi đúng MỘT lệnh noshow_coach (tên · pid · key · PIN · IP · ngày) tới Apps Script', t);
  ck(acts(SRV.wk,/noshow|checkin/).length===0, 'C2 Worker không nhận lệnh ghi nào');
  ck((await G(page,'#nsheet')).hidden, 'C3 cửa sổ đóng');
  b=await G(page,'#p-confirm .card.big .fill.b'); ck(b && b.bg===RED && near(b.x,24) && near(b.w,345*15/24,1.5), 'C4 thẻ: vệt đỏ tới buổi 15 / 24 (Figma C)', b);
  ck(await page.evaluate(function(){ var c=document.querySelector('#p-confirm .card'); return c.classList.contains('vg') && c.classList.contains('done') && c.querySelector('.n').textContent==='15' && c.querySelector('.of').textContent==='/ 24'; }), 'C5 số 15 · / 24');
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .lines > div'), function(e){ return [e.textContent, getComputedStyle(e).color, Math.round(e.getBoundingClientRect().top)]; }); });
  ck(t.length===3 && t[0][0]==='Buổi thứ 15 đã vắng' && t[0][1]===RED && near(t[0][2],382) && t[1][0]==='Còn 9 buổi' && t[1][1]===GRAY && near(t[1][2],415) && /^ĐÃ KÝ LÚC 16:42 · \d\d\/\d\d\/\d{4}$/.test(t[2][0]) && near(t[2][2],460), 'C6 "Buổi thứ 15 đã vắng" đỏ 382 · "Còn 9 buổi" Gray 415 · "ĐÃ KÝ LÚC 16:42 · ngày" 460', t);
  b=await G(page,'#cf-go'); ck(box(b,222,776,147,48) && b.bg===PAPER && b.text==='Về trang chủ', 'C7 "Về trang chủ" Paper 222,776 147×48', b);
  ck((await G(page,'#cf-back')).hidden && (await G(page,'#cf-ns')).hidden, 'C8 không còn nút ← và No-show');
  t=await page.evaluate(function(){ var c=JSON.parse(localStorage.getItem('lb_ci'))['Bùi Doãn Quang']; return c && [c.status, c.absent, c.no, c.at]; });
  ck(t && t[0]==='ok' && t[1]===true && t[2]===15 && t[3]==='16:42', 'C9 lb_ci: ok · absent · buổi 15 · 16:42', t);
  await page.waitForTimeout(3500); ck(acts(SRV.gas,/noshow/).length===1, 'C10 4 giây sau vẫn đúng MỘT lệnh (không tự gửi lại)');
  await page.click('#cf-go'); await page.waitForTimeout(900);
  ck(await page.evaluate(function(){ return state.screen==='p-home' && !state.session && !localStorage.getItem('lb_session'); }), 'C11 về trang chủ, không mở buổi tập nào');
  await toPick(page); await shot(page,'C-pick',500);
  t=await page.evaluate(function(){ var r=document.querySelector('#pk-list .row[data-name="Bùi Doãn Quang"]'); return r && [r.classList.contains('off'), r.textContent]; });
  ck(t && t[0] && /VẮNG HÔM NAY · 16:42/.test(t[1]) && !/ĐÃ TẬP HÔM NAY/.test(t[1]), 'C12 chọn khách: dòng khoá, "VẮNG HÔM NAY · 16:42"', t);
  await page.click('#pk-list .row[data-name="Bùi Doãn Quang"]', {force:true}).catch(function(){}); await page.waitForTimeout(500);
  ck(await page.evaluate(function(){ return state.screen==='p-pick'; }), 'C13 chạm dòng khách đã vắng → không vào màn xác nhận');
  /* mở lại app (cùng máy): vẫn VẮNG; máy chủ (Worker) không gửi cờ absent → lấy từ lb_ci */
  await page.reload(); await page.waitForTimeout(1800);
  if(await page.evaluate(function(){ return state.screen==='p-pin'; })){ for(var k of '1234') await page.click('#pin-pad button:has-text("'+k+'")'); await page.waitForTimeout(1500); }
  await toPick(page);
  t=await page.evaluate(function(){ var r=document.querySelector('#pk-list .row[data-name="Bùi Doãn Quang"]'); return r && r.textContent; });
  ck(/VẮNG HÔM NAY/.test(t||''), 'C14 mở lại app: vẫn "VẮNG HÔM NAY"', t);
  await a.ctx.close();

  /* ============ S2 · lỗi: ngoài phòng · mất mạng · trả lời rơi ============ */
  console.log('\n== S2 · lỗi ==');
  reset({mode:'wrong_ip'}); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1200);
  await page.click('#cf-ns'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1500); await shot(page,'E-wrong-ip',200);
  t=await page.textContent('#pill'); ck(/Chỉ ghi vắng được ở phòng/.test(t), 'E1 ngoài phòng → pill "Chỉ ghi vắng được ở phòng"', t);
  ck(!(await G(page,'#nsheet')).hidden && !(await page.evaluate(function(){ return document.getElementById('ns-go').classList.contains('off') || NS_BUSY; })), 'E2 cửa sổ còn mở, nút bấm lại được');
  ck(acts(SRV.gas,/noshow/).length===1 && Object.keys(SRV.rows).length===0, 'E3 đúng một lệnh, không dòng nào được ghi');
  ck(await page.evaluate(function(){ var c=JSON.parse(localStorage.getItem('lb_ci')||'{}')['Bùi Doãn Quang']; return !c; }), 'E4 lb_ci không ghi gì khi lỗi');
  SRV.mode='down'; await page.click('#ns-go'); await page.waitForTimeout(3500);
  t=await page.textContent('#pill'); ck(/Chưa ghi được vắng/.test(t), 'E5 mất mạng → pill "Chưa ghi được vắng"', t);
  ck(acts(SRV.gas,/noshow/).length===2, 'E6 mất mạng: KHÔNG tự gửi lại (2 lệnh = 2 lần bấm)', acts(SRV.gas,/noshow/).length);
  SRV.mode='lost'; await page.click('#ns-go'); await page.waitForTimeout(2500);
  ck(acts(SRV.gas,/noshow/).length===3 && SRV.rows.B901DY && SRV.rows.B901DY.st==='Vắng' && !(await G(page,'#nsheet')).hidden, 'E7 máy chủ đã ghi nhưng trả lời rơi → app báo lỗi, cửa sổ còn mở');
  SRV.mode='ok'; await page.click('#ns-go'); await page.waitForTimeout(1500);
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .lines > div'), function(e){ return e.textContent; }); });
  ck(acts(SRV.gas,/noshow/).length===4 && (await G(page,'#nsheet')).hidden && t[0]==='Buổi thứ 15 đã vắng' && t[1]==='Còn 9 buổi' && SRV.members[0].done===15, 'E8 bấm lại → máy chủ trả da_checkin + Vắng → coi như xong, KHÔNG ghi dòng thứ hai (done vẫn 15)', [t, SRV.members[0].done]);
  await a.ctx.close();
  /* khách đã check-in (máy khác) → không ghi đè */
  reset(); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1200);
  SRV.rows.B901DY={st:'Đã tập', at:'16:30'}; SRV.members[0].done=15; SRV.members[0].left=9;
  await page.click('#cf-ns'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1500);
  t=await page.textContent('#pill'); ck(/Khách đã check-in hôm nay/.test(t) && (await G(page,'#nsheet')).hidden && SRV.rows.B901DY.st==='Đã tập', 'E9 khách đã check-in ở máy khác → "Khách đã check-in hôm nay", đóng cửa sổ, dòng giữ "Đã tập"', t);
  await a.ctx.close();
  /* máy chủ cũ (chưa có lệnh) */
  reset({mode:'old'}); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1200);
  await page.click('#cf-ns'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1500);
  t=await page.textContent('#pill'); ck(/Chưa ghi được vắng/.test(t) && Object.keys(SRV.rows).length===0, 'E10 máy chủ chưa có lệnh (unknown_action) → báo lỗi, không ghi gì', t);
  await a.ctx.close();

  /* ============ S3 · 1:2 — frame D → E → F → buổi 1:1 ============ */
  console.log('\n== S3 · 1:2: một khách vắng → check-in khách còn lại, vào buổi 1:1 ==');
  reset(); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row[data-name="Trần Minh Anh"]'); await page.click('#pk-list .row[data-name="Phạm Thành Long"]'); await page.waitForTimeout(400);
  await page.click('#pk-go'); await shot(page,'D-duo',1500);
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .half'), function(h){ var n=h.querySelector('.t1').getBoundingClientRect(), p=h.querySelector('.nsb'), r=p&&p.getBoundingClientRect(), c=h.querySelector('.card').getBoundingClientRect(), s=p&&getComputedStyle(p);
    return {name:h.querySelector('.t1').textContent, ny:Math.round(n.top), nh:Math.round(n.height), pill:r&&[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)], col:s&&[s.color,s.borderTopColor,s.backgroundColor,s.fontSize], card:[Math.round(c.left),Math.round(c.top),Math.round(c.width),Math.round(c.height)]}; }); });
  ck(t.length===2 && t[0].name==='Minh Anh' && t[1].name==='Thành Long', 'D1 hai nửa: Minh Anh · Thành Long', t.map(function(x){return x.name}));
  ck(t[0].ny===56 && box({x:t[0].pill[0],y:t[0].pill[1],w:t[0].pill[2],h:t[0].pill[3]},277,57,92,36) && t[0].pill[0]+t[0].pill[2]===369, 'D2 nửa trên: tên y 56 · nút No-show 277,57 92×36 (Figma D)', t[0]);
  ck(t[1].ny===428 && box({x:t[1].pill[0],y:t[1].pill[1],w:t[1].pill[2],h:t[1].pill[3]},277,429,92,36) && t[1].pill[0]+t[1].pill[2]===369, 'D3 nửa dưới: tên y 428 · nút No-show 277,429 92×36', t[1]);
  ck(t[0].col[0]===RED && t[0].col[1]===RED && /0\.07/.test(t[0].col[2]) && t[0].col[3]==='14px', 'D4 nút nhỏ: chữ đỏ 14 · viền đỏ · nền 7 %', t[0].col);
  ck(t[0].card.join()==='24,118,345,96' && t[1].card.join()==='24,490,345,96', 'D5 thẻ số buổi hai nửa không đổi chỗ (24,118 · 24,490, 345×96)', [t[0].card, t[1].card]);
  b=await G(page,'#cf-go'); ck(b.text==='Check-in 2 khách' && near(b.x+b.w,369) && near(b.y,776) && near(b.w,181) && b.bg===ACID, 'D6 "Check-in 2 khách" 188,776 181×48', b);
  ck((await G(page,'#cf-ns')).hidden, 'D7 lớp 1:2 không có nút No-show ở nav');
  await page.click('#p-confirm .half:nth-child(1) .nsb'); await shot(page,'E-duo-sheet',700);
  ck((await page.textContent('#ns-line'))==='Xác nhận Minh Anh vắng buổi hôm nay.', 'E11 cửa sổ ghi đúng tên khách vừa bấm (Minh Anh)');
  b=await G(page,'#nsheet'); ck(box(b,0,637,393,215), 'E12 cửa sổ 0,637 393×215', b);
  await page.click('#ns-go'); await page.waitForTimeout(1500); await shot(page,'F-duo-one',300);
  t=acts(SRV.gas,/noshow/); ck(t.length===1 && t[0].pid==='B903DY' && acts(SRV.wk,/checkin/).length===0, 'F1 một lệnh noshow_coach cho Minh Anh, chưa check-in ai', t);
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .half'), function(h){ var f=h.querySelector('.fill.b'); return {vg:h.querySelector('.card').classList.contains('vg'), fill:getComputedStyle(f).backgroundColor, pill:!!h.querySelector('.nsb'), n:h.querySelector('.n').textContent, lines:[].map.call(h.querySelectorAll('.lines > div'), function(e){ return [e.textContent, getComputedStyle(e).color, Math.round(e.getBoundingClientRect().top)]; })}; }); });
  ck(t[0].vg && t[0].fill===RED && !t[0].pill && t[0].n==='15' && t[0].lines.length===2 && t[0].lines[0][0]==='Buổi thứ 15 đã vắng' && t[0].lines[0][1]===RED && t[0].lines[0][2]===230 && t[0].lines[1][0]==='Còn 9 buổi' && t[0].lines[1][1]===GRAY && t[0].lines[1][2]===256, 'F2 nửa trên: thẻ đỏ · không còn nút · "Buổi thứ 15 đã vắng" 230 · "Còn 9 buổi" 256 (Figma F)', t[0]);
  ck(!t[1].vg && t[1].pill && t[1].n==='4' && t[1].lines[0][0]==='Buổi thứ 4' && t[1].lines[1][0]==='Đã tập 3, còn 9 buổi', 'F3 nửa dưới giữ nguyên + còn nút No-show', t[1]);
  b=await G(page,'#cf-go'); ck(b.text==='Check-in Thành Long' && near(b.x+b.w,369) && near(b.w,209,2) && b.bg===ACID && !/off/.test(await page.getAttribute('#cf-go','class')), 'F4 nút chính "Check-in Thành Long" 160,776 209×48, bấm được', b);
  ck(!(await G(page,'#cf-back')).hidden, 'F5 còn nút ←');
  await page.click('#cf-go'); await page.waitForTimeout(1600); await shot(page,'F-session-11',300);
  t=acts(SRV.wk,/checkin/); ck(t.length===1 && t[0].pid==='B902DY' && acts(SRV.gas,/checkin/).length===0, 'F6 check-in đúng MỘT người (Thành Long), không check-in người vắng', t.map(function(x){return x.pid}));
  t=await page.evaluate(function(){ var s=state.session; return s && {kind:s.kind, people:s.people.map(function(p){ return p.name; }), screen:state.screen, no:s.people[0].no}; });
  ck(t && t.kind==='1:1' && t.people.join()==='Phạm Thành Long' && t.screen==='p-plan' && t.no===4, 'F7 buổi tập 1:1 chỉ có Thành Long (buổi 4), sang "Bài tập hôm nay"', t);
  ck(SRV.rows.B903DY.st==='Vắng' && SRV.rows.B902DY.st==='Đã tập', 'F8 máy chủ: Minh Anh "Vắng" · Thành Long "Đã tập"');
  await a.ctx.close();

  /* ============ S4 · 1:2 cả hai vắng — frame G ============ */
  console.log('\n== S4 · 1:2: cả hai vắng ==');
  reset(); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row[data-name="Trần Minh Anh"]'); await page.click('#pk-list .row[data-name="Phạm Thành Long"]'); await page.click('#pk-go'); await page.waitForTimeout(1300);
  await page.click('#p-confirm .half:nth-child(1) .nsb'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1500);
  await page.click('#p-confirm .half:nth-child(2) .nsb'); await page.waitForTimeout(500);
  ck((await page.textContent('#ns-line'))==='Xác nhận Thành Long vắng buổi hôm nay.', 'G1 lần hai: cửa sổ ghi tên Thành Long');
  await page.click('#ns-go'); await page.waitForTimeout(1500); await shot(page,'G-duo-both',300);
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .half'), function(h){ return [h.querySelector('.card').classList.contains('vg'), !!h.querySelector('.nsb'), h.querySelector('.lines .a').textContent, h.querySelector('.lines .b').textContent]; }); });
  ck(t[0][0] && t[1][0] && !t[0][1] && !t[1][1] && t[0][2]==='Buổi thứ 15 đã vắng' && t[1][2]==='Buổi thứ 4 đã vắng' && t[1][3]==='Còn 8 buổi', 'G2 hai nửa đỏ · "Buổi thứ 4 đã vắng" · "Còn 8 buổi" (Figma G)', t);
  b=await G(page,'#cf-go'); ck(box(b,222,776,147,48) && b.bg===PAPER && b.text==='Về trang chủ' && (await G(page,'#cf-back')).hidden, 'G3 chỉ còn "Về trang chủ" 222,776 147×48', b);
  ck(acts(SRV.gas,/noshow/).length===2 && acts(SRV.wk,/checkin/).length===0 && acts(SRV.gas,/checkin/).length===0, 'G4 hai lệnh ghi vắng, không check-in nào');
  await page.click('#cf-go'); await page.waitForTimeout(900);
  ck(await page.evaluate(function(){ return state.screen==='p-home' && !state.session && !state.sel.length; }), 'G5 về trang chủ, không có buổi tập');
  await a.ctx.close();
  /* 1:2 một người vắng → ← về chọn khách: người còn lại vẫn được chọn, đi tiếp như 1:1 có nút No-show ở nav */
  reset(); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row[data-name="Trần Minh Anh"]'); await page.click('#pk-list .row[data-name="Phạm Thành Long"]'); await page.click('#pk-go'); await page.waitForTimeout(1300);
  await page.click('#p-confirm .half:nth-child(2) .nsb'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1500);
  b=await G(page,'#cf-go'); ck(b.text==='Check-in Minh Anh', 'G6 người dưới vắng → "Check-in Minh Anh"', b.text);
  await page.click('#cf-back'); await page.waitForTimeout(900);
  t=await page.evaluate(function(){ return {sel:state.sel.slice(), go:document.getElementById('pk-go').textContent, off:document.querySelector('#pk-list .row[data-name="Phạm Thành Long"]').classList.contains('off')}; });
  ck(t.sel.join()==='Trần Minh Anh' && t.go==='Xác nhận · 1:1' && t.off, 'G7 ← về chọn khách: chỉ còn Minh Anh được chọn ("Xác nhận · 1:1"), Thành Long khoá', t);
  await page.click('#pk-go'); await page.waitForTimeout(1300);
  ck(!(await G(page,'#cf-ns')).hidden && (await G(page,'#cf-go')).text==='Check-in' && (await page.evaluate(function(){ return document.querySelectorAll('#p-confirm .half').length; }))===0, 'G8 màn xác nhận 1 khách: No-show cạnh Check-in');
  await a.ctx.close();

  /* ============ S5 · Admin ============ */
  console.log('\n== S5 · Admin: adm_noshow ==');
  reset(); a=await open({pin:'7788'}); page=a.page;
  ck(await page.evaluate(function(){ return state.admin===true; }), 'AD0 vào chế độ Admin');
  await toPick(page); await page.click('#pk-list .row:has-text("Khách Lẻ")'); await page.waitForTimeout(1300);
  await page.click('#cf-ns'); await page.waitForTimeout(500); await page.click('#ns-go'); await page.waitForTimeout(1500); await shot(page,'AD-absent',200);
  t=acts(SRV.gas,/noshow/); ck(t.length===1 && t[0].action==='adm_noshow' && t[0].apin==='7788' && !t[0].pin && t[0].pid==='B904DY', 'AD1 Admin gửi adm_noshow kèm apin (không PIN coach) cho khách của coach khác', t);
  ck(acts(SRV.wk,/noshow/).length===0, 'AD2 Worker không nhận lệnh ghi vắng');
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .lines > div'), function(e){ return e.textContent; }); });
  ck(t[0]==='Buổi thứ 2 đã vắng' && t[1]==='Còn 10 buổi', 'AD3 màn sau khi ghi: "Buổi thứ 2 đã vắng" · "Còn 10 buổi"', t);
  await a.ctx.close();

  /* ============ S6 · máy khác ============ */
  console.log('\n== S6 · máy khác đã ghi vắng ==');
  /* (a) danh sách: Worker gửi checked nhưng không có cờ absent → nhãn lấy từ stats.absent */
  reset({statsAbsent:['Bùi Doãn Quang']}); SRV.rows.B901DY={st:'Vắng', at:'09:10'}; SRV.members[0].done=15; SRV.members[0].left=9;
  a=await open(); page=a.page; await page.waitForTimeout(800); await toPick(page); await shot(page,'X-other-device',300);
  t=await page.evaluate(function(){ var r=document.querySelector('#pk-list .row[data-name="Bùi Doãn Quang"]'); return r && [r.classList.contains('off'), r.textContent, !!localStorage.getItem('lb_ci') && !!JSON.parse(localStorage.getItem('lb_ci'))['Bùi Doãn Quang']]; });
  ck(t && t[0] && /VẮNG HÔM NAY · 09:10/.test(t[1]) && !t[2], 'X1 máy khác ghi vắng: dòng khoá + "VẮNG HÔM NAY · 09:10" (từ stats.absent, không có lb_ci)', t);
  await a.ctx.close();
  /* (b) máy này còn dữ liệu cũ → bấm Check-in → Worker trả da_checkin (có status Vắng) → không vào buổi */
  reset({wkStatus:true}); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1200);
  SRV.rows.B901DY={st:'Vắng', at:'09:10'}; SRV.members[0].done=15; SRV.members[0].left=9;
  await page.click('#cf-go'); await page.waitForTimeout(1800); await shot(page,'X-stale-checkin',200);
  t=await page.textContent('#pill');
  ck(/Khách đã ghi vắng hôm nay/.test(t) && await page.evaluate(function(){ return state.screen==='p-confirm' && !state.session && !localStorage.getItem('lb_session'); }), 'X2 check-in khách đã bị máy khác ghi vắng → "Khách đã ghi vắng hôm nay", KHÔNG mở buổi tập', t);
  t=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-confirm .lines > div'), function(e){ return e.textContent; }); });
  ck(t[0]==='Buổi thứ 15 đã vắng' && (await G(page,'#cf-go')).text==='Về trang chủ', 'X3 màn xác nhận chuyển sang trạng thái vắng', t);
  await a.ctx.close();
  /* (c) đang ghi dở buổi → không có nút No-show */
  reset(); a=await open(); page=a.page;
  await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1200); await page.click('#cf-go'); await page.waitForTimeout(1500);
  await page.evaluate(function(){ if(typeof closeLib==='function') closeLib(); }); await page.waitForTimeout(500);
  await page.evaluate(function(){ go('p-confirm','back'); }); await page.waitForTimeout(1000);
  ck((await G(page,'#cf-ns')).hidden && (await G(page,'#cf-go')).text==='Tiếp tục buổi tập', 'X4 đang ghi dở buổi: không có No-show, nút chính "Tiếp tục buổi tập"');
  await page.evaluate(function(){ nsOpen(); }); await page.waitForTimeout(300);
  ck((await G(page,'#nsheet')).hidden, 'X5 gọi nsOpen() lúc đang ghi dở → không mở');
  await a.ctx.close();

  /* ============ S7 · màn hẹp / thấp: cửa sổ không tràn ============ */
  console.log('\n== S7 · cỡ màn khác ==');
  for(var sz of [[320,568],[375,667],[430,932]]){
    reset(); a=await open({w:sz[0], h:sz[1]}); page=a.page;
    await toPick(page); await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1200);
    t=await page.evaluate(function(){ var r=function(id){ var e=document.getElementById(id).getBoundingClientRect(); return [e.left,e.right,e.top,e.bottom]; }; return {b:r('cf-back'), n:r('cf-ns'), g:r('cf-go'), w:innerWidth}; });
    ck(t.b[1]<=t.n[0] && near(t.g[0]-t.n[1],8) && t.g[1]<=t.w-23, sz.join('×')+' nav: ← · No-show · Check-in không chồng nhau, cách 8, trong lề', t);
    await page.click('#cf-ns'); await shot(page,'S-'+sz.join('x')+'-sheet',700);
    t=await page.evaluate(function(){ var s=document.getElementById('nsheet').getBoundingClientRect(), g=document.getElementById('ns-go').getBoundingClientRect(), l=document.getElementById('ns-line'); return {top:s.top, bot:s.bottom, h:innerHeight, w:innerWidth, gl:g.left, gr:g.right, gb:g.bottom, ov:l.scrollWidth>l.clientWidth+1}; });
    ck(near(t.bot,t.h) && t.top>0 && near(t.gl,24) && near(t.gr,t.w-24) && near(t.h-t.gb,28) && !t.ov, sz.join('×')+' cửa sổ neo đáy, nút rộng hết lề 24, cách đáy 28, chữ không tràn', t);
    await a.ctx.close();
  }

  console.log('\nPAGEERR:', JSON.stringify(errors)); ck(errors.length===0, '0 PAGEERR');
  console.log('\n'+pass+' PASS, '+fail+' FAIL');
  await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

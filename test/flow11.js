/* Luồng 1:1 đầy đủ với máy chủ MOCK (không ?demo): ipify + worker + apps script + font.
   Kiểm: check-in gửi 1 lần, SET giữ (hold) tới khi sang set kế, hoàn tác không gửi, offline vẫn ghi, mở lại app khôi phục buổi. */
var {chromium}=require('playwright'); var serve=require('./serve'); var fs=require('fs'); var assert=require('assert');
(async function(){
  var srv=await serve(8125), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  var SRV={checkins:[], logs:[], offline:false, coachCalls:0, stats:0};
  var members=[{name:'Bùi Doãn Quang',done:14,total:24,left:10,coach:'Quyết',exp:'2026-11-21'},{name:'Nguyễn Quang Vinh',done:11,total:12,left:1,coach:'Quyết'}];
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:'{"ip":"1.2.3.4"}'}); });
  async function handle(r){
    if(SRV.offline){ return r.abort('internetdisconnected'); }
    var p=JSON.parse(r.request().postData()||'{}'), out={ok:false,error:'unknown_action'};
    if(p.action==='ping') out={ok:true};
    else if(p.pin!=='1234') out={ok:false,error:'sai_pin'};
    else if(p.action==='coach'){ SRV.coachCalls++; out={ok:true, coach:'Quyết Hán', members:members, snapshot:{'Bùi Doãn Quang':{measures:[{d:'2026-09-08',weight:72.4}], target:{weight:65}, main:'weight', last:{'Lat Pulldown (Wide Pronated Grip)':{kg:40,rep:12,d:'2026-09-22'}}, plans:{}}}, library:null, today:new Date().toISOString().slice(0,10)}; }
    else if(p.action==='stats'){ SRV.stats++; out={ok:true, month:new Date().toISOString().slice(0,7), days:{}, monthTotal:103, perClient:{'Bùi Doãn Quang':{m:12,last:'2026-09-22'},'Nguyễn Quang Vinh':{m:4,last:'2026-09-20'}}, com:{month:new Date().toISOString().slice(0,7), total:14200000}, hist:{}}; }
    else if(p.action==='checkin_coach'){ SRV.checkins.push(p.name); var m=members.filter(function(x){return x.name===p.name})[0]; m.done++; m.left--; out={ok:true,row:5,member:m,at:'17:05'}; }
    else if(p.action==='log'){ SRV.logs=SRV.logs.concat(p.events); out={ok:true,written:p.events.length}; }
    r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)});
  }
  await ctx.route(/workers\.dev/, handle); await ctx.route(/script\.google\.com/, handle);
  var page=await ctx.newPage(), errors=[]; page.on('pageerror', function(e){ errors.push(String(e)); });
  fs.mkdirSync('test/out11',{recursive:true}); var n=0;
  async function shot(name, wait){ await page.waitForTimeout(wait||600); await page.screenshot({path:'test/out11/'+(++n<10?'0':'')+n+'-'+name+'.png'}); }
  await page.goto('http://localhost:8125/');
  for(var k of ['9','9','9','9']) await page.click('#pin-pad button:has-text("'+k+'")'); await shot('pin-wrong',900);
  assert.equal(await page.textContent('#pin-err'), 'MÃ PIN KHÔNG ĐÚNG');
  for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")'); await shot('home',1200);
  assert.ok((await page.textContent('#h-taught')).indexOf('103')>=0, 'buổi tháng từ stats');
  assert.ok((await page.textContent('#h-tiles')).indexOf('14,2')>=0, 'hoa hồng');
  await page.click('#h-go'); await page.click('#pk-list .row:has-text("Doãn Quang")'); await shot('confirm',1200); /* khách 1:1: chạm dòng đi thẳng màn xác nhận */
  await page.click('#cf-go'); await page.waitForTimeout(900); await shot('lib-open',300);
  assert.deepEqual(SRV.checkins, ['Bùi Doãn Quang'], 'check-in đúng 1 lần');
  await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-list .row:nth-of-type(4)'); await page.click('#lib-go'); await shot('plan');
  await page.click('#pl-go'); await shot('setup',1200);
  await page.click('#loop-host .c1'); await shot('active',900);
  await page.click('#loop-host .j1'); await shot('rest-setup',900);
  await page.waitForTimeout(4500);
  assert.equal(SRV.logs.length, 0, 'SET đang giữ, chưa gửi'); 
  await page.click('#loop-host .g1'); await shot('undo',900);                       /* hoàn tác */
  assert.equal(await page.evaluate(function(){ return OUT.q.length; }), 0, 'hoàn tác xoá khỏi outbox');
  await page.click('#loop-host .c1'); await page.waitForTimeout(500); await page.click('#loop-host .j0'); await shot('rest-setup-fail',900);
  await page.evaluate(function(){ state.session.people[0].restTotal=8; saveSession(); }); await page.click('#loop-host .c1'); await shot('rest-0',300);
  await page.waitForTimeout(4000); await shot('rest-mid',100); await page.waitForTimeout(4600); await shot('rest-end',100);
  assert.ok((await page.textContent('#loop-host .c1')).indexOf('Nghỉ xong')>=0, 'CTA giữ nguyên "Nghỉ xong · kế tiếp" khi hết giờ');
  assert.ok((await page.textContent('#loop-host .lp .head .sub')).indexOf('Hết giờ nghỉ')>=0, 'dòng 2 đổi thành "Hết giờ nghỉ"');
  await page.waitForTimeout(1500); assert.equal(SRV.logs.filter(function(e){return e.type==='SET'}).length, 1, 'SET nhả khi bắt đầu nghỉ → đã gửi');
  await page.click('#loop-host .c1'); await page.waitForTimeout(400); assert.ok(await page.evaluate(function(){ return document.querySelector('#loop-host .film').classList.contains('on'); }), 'CTA khi hết giờ vẫn mở menu bước tiếp');
  await page.click('#loop-host .film .exl button:nth-child(1)'); await shot('setup-2',900);
  assert.ok((await page.textContent('#loop-host .sub')).indexOf('set 2')>=0);
  /* offline: ghi set khi mất mạng, sang bài khác qua menu */
  SRV.offline=true;
  await page.click('#loop-host .c1'); await page.waitForTimeout(400); await page.click('#loop-host .j1'); await page.waitForTimeout(700);
  await page.click('#loop-host .c1'); await page.waitForTimeout(400);
  await page.click('#loop-host .g1'); await shot('menu',700);
  await page.click('#loop-host .fdone'); await shot('switched',900);
  assert.ok((await page.textContent('#loop-host .ex')).indexOf('Seated')>=0, 'sang bài kế');
  /* mở lại app giữa buổi → khôi phục vào loop */
  await page.reload(); await shot('resumed',1500);
  assert.equal(await page.evaluate(function(){ return state.screen; }), 'p-loop', 'khôi phục buổi');
  assert.equal(await page.evaluate(function(){ return OUT.q.length; }), 1, 'set offline vẫn nằm trong hàng đợi');
  SRV.offline=false;
  await page.click('#loop-host .c1'); await page.waitForTimeout(400); await page.click('#loop-host .j1'); await page.waitForTimeout(700);
  await page.click('#loop-host .c1'); await page.waitForTimeout(500); await page.click('#loop-host .g1'); await page.waitForTimeout(500); await page.click('#loop-host .fend'); await shot('summary',1200);
  await page.click('#sm-form button:nth-child(5)'); await page.fill('#sm-note','Tốt'); await page.click('#sm-go'); await shot('done',1300);
  await page.waitForTimeout(1500);
  var types=SRV.logs.map(function(e){return e.type}); console.log('logs:', types.join(','));
  assert.equal(types.filter(function(t){return t==='SET'}).length, 3, '3 set thật (1 hoàn tác không gửi)');
  assert.equal(types.filter(function(t){return t==='BÀI'}).length, 2); assert.equal(types.filter(function(t){return t==='CHECKOUT'}).length, 1);
  var co=SRV.logs.filter(function(e){return e.type==='CHECKOUT'})[0]; assert.equal(co.form,5); assert.equal(co.note,'Tốt'); assert.equal(co.session,15);
  assert.equal(await page.evaluate(function(){ return localStorage.getItem('lb_session'); }), null, 'buổi đã chốt');
  await page.click('#p-done .cta'); await shot('home-end',1200);
  assert.ok((await page.textContent('#h-tiles')).indexOf('1')>=0);
  console.log('errors:', JSON.stringify(errors)); assert.equal(errors.length, 0, 'không PAGEERR');
  console.log('PASS 1:1 flow');
  await ctx.close(); await browser.close(); srv.close();
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

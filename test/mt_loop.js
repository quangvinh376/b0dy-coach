/* v2.6.1 — đồng hồ chuyển động MT: MỘT vòng rAF duy nhất (rAF thật của Chromium, không đồng hồ giả).
   Lỗi v2.5.0–v2.6.0: tween/after khởi động NGAY TRONG khung (nửa sau của fadeSwap / swapIcon, mốc 10 giây cuối, 0:00) hẹn thêm một
   vòng rAF → mỗi set thêm ~6 vòng, ~100 vòng sau 16 set; mỗi khung vẽ lại cùng một hình hàng chục lần (dt = 0) → nóng máy, rớt khung.
   M1 1:1 · 6 vòng set → nghỉ → set mới: mỗi khung đúng 1 lần motFrame, không khung dt = 0, MT chạy đúng giờ thật
   M2 1:1 · chuỗi lùi (↩ đang tập · Menu ở đặt giờ (v2.8.1) · ↩ đang nghỉ) + 10 giây cuối + 0:00: vẫn 1 vòng
   M3 1:2 · hai nửa, mỗi nửa 4 vòng: vẫn 1 vòng cho cả hai nửa
   M4 rời loop (Menu → ⌂ trang chủ (v2.8.1) · kết thúc buổi → tổng kết): vòng vẽ tự ngủ, 0 lần motFrame khi hết tween
   M5 __mot.hold/step (quay từng khung) vẫn đúng: giữ = 0 khung, step tiến đúng ms, thả = 1 vòng
   M6 màn chẩn đoán (chạm wordmark 5 lần) có dòng MT: … KHUNG/S · … MS JS/KHUNG · 1,0 VÒNG/KHUNG
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/mt_loop.js
         ROOT=<thư mục bản khác> node test/mt_loop.js   → chạy trên bản cũ: v2.6.0 phải trượt M1–M3 + M6 */
var {chromium}=require('playwright'); var path=require('path');
var ROOT=process.env.ROOT||path.join(__dirname,'..'), serve=require(path.join(ROOT,'test','serve'));
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19361;
var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
async function run(id, name, fn){ CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  async function mk(){
    var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    var page=await ctx.newPage(); page.on('pageerror', function(e){ PAGEERR.push(String(e)); }); return {ctx:ctx, page:page};
  }
  /* vào loop bằng demo: PIN → chọn khách → xác nhận → check-in (demo) → bài tập → loop */
  async function toLoop(page, names){
    var w=function(ms){ return page.waitForTimeout(ms); };
    await page.goto('http://localhost:'+PORT+'/?demo'); await page.waitForSelector('#p-pin.on'); await w(400);
    for(var k of '1234') await page.click('#pin-pad button:has-text("'+k+'")');
    await page.waitForFunction(function(){ return state.screen==='p-home'; }); await w(900);
    await page.click('#h-go'); await w(600);
    for(var n of names) await page.click('#pk-list .row:has-text("'+n+'")');
    if(names.length>1) await page.click('#pk-go');
    await w(1100); await page.click('#cf-go');
    await page.waitForFunction(function(){ return state.screen==='p-plan'; }, null, {timeout:9000}); await w(700);
    await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-list .row:nth-of-type(2)'); await page.click('#lib-go'); await w(500);
    await page.click('#pl-go'); await page.waitForFunction(function(){ return state.screen==='p-loop' && LOOPS.length>0; }); await w(1200);
    /* đo: số lần motFrame + số khung hiển thị (một rAF đếm riêng) + khung dt = 0 */
    await page.evaluate(function(){
      if(window.__MTP) return;
      var f=window.motFrame, P=window.__MTP={calls:0, zero:0, frames:0};
      window.motFrame=function(dt){ P.calls++; if(dt===0) P.zero++; return f(dt); };
      (function tick(){ P.frames++; requestAnimationFrame(tick); })();
    });
  }
  function snap(page){ return page.evaluate(function(){ var P=__MTP; return {c:P.calls, z:P.zero, f:P.frames, t:performance.now(), mt:__mot.t()}; }); }
  async function sample(page, ms){
    var a=await snap(page); await page.waitForTimeout(ms||2000); var b=await snap(page), s=(b.t-a.t)/1000, fr=Math.max(1,b.f-a.f);
    return {perFrame:(b.c-a.c)/fr, calls:b.c-a.c, zero:b.z-a.z, fps:fr/s, mtRate:(b.mt-a.mt)/s};
  }
  function one(r, tag){
    check(r.perFrame<=1.05, tag+': '+r.perFrame.toFixed(2)+' lần motFrame mỗi khung (đúng = 1 vòng)');
    check(r.zero===0, tag+': '+r.zero+' khung dt = 0 (vẽ lại y hệt)');
    check(r.mtRate>0.9 && r.mtRate<1.08, tag+': MT chạy '+r.mtRate.toFixed(3)+'× giờ thật');
    return r;
  }
  async function tap(page, sel){ await page.click(sel); await page.waitForTimeout(450); }   /* > 320 ms chặn chạm đúp của nút */

  /* ---------------- 1:1 ---------------- */
  var C=await mk(), page=C.page, L='#loop-host .loop ';
  await toLoop(page, ['Thành Long']);
  var log=[];
  await run('M1', '1:1 · 6 vòng set → nghỉ → set mới: một vòng rAF, MT đúng giờ thật', async function(){
    one(await sample(page, 1500), 'vào loop');
    for(var c=1;c<=6;c++){
      await tap(page, L+'.c1'); await page.waitForTimeout(500);                 /* bắt đầu set */
      await tap(page, L+'.c1'); await page.waitForTimeout(700);                 /* Đạt → đặt giờ nghỉ */
      await tap(page, L+'.c1'); await page.waitForTimeout(1100);                /* bắt đầu nghỉ */
      await tap(page, L+'.c1'); await page.waitForTimeout(350);                 /* Nghỉ xong · kế tiếp → menu */
      await page.click(L+'.film .exl button:nth-child(1)'); await page.waitForTimeout(1200);   /* vào set mới */
      if(c===1 || c===6){ var r=one(await sample(page, 2000), 'sau '+c+' vòng'); log.push('sau '+c+' vòng: '+r.perFrame.toFixed(2)+' motFrame/khung · '+Math.round(r.fps)+' khung/s · MT '+r.mtRate.toFixed(3)+'×'); }
    }
    check(await page.evaluate(function(){ return state.session.people[0].setNo; })>=7, 'setNo không tăng đủ — kịch bản không chạy hết');
  });
  console.log('   · '+log.join('\n   · '));
  await run('M2', '1:1 · chuỗi lùi + 10 giây cuối + 0:00: vẫn một vòng', async function(){
    await tap(page, L+'.c1'); await tap(page, L+'.g1');                          /* đang tập ↩ → thiết lập */
    check(await page.evaluate(function(){ return state.session.people[0].phase; })==='setup', '↩ đang tập không về thiết lập');
    await tap(page, L+'.c1'); await tap(page, L+'.c1'); await tap(page, L+'.g1'); /* Đạt → đặt giờ · v2.8.1: Menu mở window Buổi tập hôm nay */
    check(await page.evaluate(function(){ return WS.open && state.session.people[0].phase==='rest-setup'; }), 'Menu ở đặt giờ không mở window');
    one(await sample(page, 1200), 'window mở trên màn đặt giờ');
    await page.click('#ws-close'); await page.waitForTimeout(600);
    await tap(page, L+'.c1'); await page.waitForTimeout(600); await tap(page, L+'.g1');   /* nghỉ ↩ → đặt giờ */
    check(await page.evaluate(function(){ return state.session.people[0].phase; })==='rest-setup', '↩ đang nghỉ không về đặt giờ');
    await tap(page, L+'.c1'); await page.waitForTimeout(800);                    /* nghỉ lại */
    one(await sample(page, 1500), 'sau chuỗi lùi');
    await page.evaluate(function(){ var p=state.session.people[0]; p.restStart-= (p.restTotal-12.5)*1000; }); await page.waitForTimeout(3200);   /* qua mốc 10 giây cuối */
    check(await page.evaluate(function(){ return LOOPS[0].state().lastTen; }), 'không vào 10 giây cuối');
    one(await sample(page, 1500), '10 giây cuối');
    await page.evaluate(function(){ var p=state.session.people[0]; p.restStart-=12*1000; }); await page.waitForTimeout(1600);                    /* 0:00 */
    check(await page.evaluate(function(){ return LOOPS[0].state().zeroed; }), 'không tới 0:00');
    one(await sample(page, 2000), '0:00');
  });
  await run('M5', '__mot.hold/step vẫn quay từng khung đúng', async function(){
    await page.evaluate(function(){ __mot.hold(true); });
    var r=await sample(page, 600); check(r.calls===0, 'đang giữ mà vẫn chạy '+r.calls+' lần motFrame');
    var d=await page.evaluate(function(){ var a=__mot.t(), c=__MTP.calls; __mot.step(1000/60); __mot.step(1000/60); return {dmt:__mot.t()-a, dc:__MTP.calls-c}; });
    check(Math.abs(d.dmt-2/60)<1e-9 && d.dc===2, 'step: MT +'+d.dmt+' · '+d.dc+' khung (đúng: +2/60 · 2)');
    await page.evaluate(function(){ __mot.hold(false); }); await page.waitForTimeout(300);
    one(await sample(page, 1500), 'thả giữ');
  });
  await run('M4', 'rời loop: vòng vẽ tự ngủ', async function(){
    /* v2.8.1: Menu ở thiết lập → window → ⌂ về trang chủ */
    await tap(page, L+'.c1'); await page.waitForTimeout(300);                    /* (đang nghỉ 0:00) mở menu */
    await page.click(L+'.film .exl button:nth-child(1)'); await page.waitForTimeout(1200);   /* vào set mới → thiết lập */
    check(await page.evaluate(function(){ return state.session.people[0].phase; })==='setup', 'không về thiết lập');
    await tap(page, L+'.g1'); await page.waitForTimeout(600); await page.click('#ws-home'); await page.waitForFunction(function(){ return state.screen==='p-home'; }); await page.waitForTimeout(1500);
    var r=await sample(page, 1500); check(r.calls===0, 'ở trang chủ mà vòng vẽ còn chạy '+r.calls+' lần/1,5 s');
    /* Tiếp tục buổi tập → vào lại loop → một vòng; kết thúc buổi → tổng kết → ngủ */
    await page.click('#h-go'); await page.waitForFunction(function(){ return state.screen==='p-loop'; }); await page.waitForTimeout(1200);
    one(await sample(page, 1500), 'vào lại loop');
    await tap(page, L+'.c1'); await tap(page, L+'.c1'); await tap(page, L+'.c1'); await page.waitForTimeout(600);   /* set → Đạt → nghỉ */
    await tap(page, L+'.c1'); await page.waitForTimeout(350); await page.click(L+'.fend');
    await page.waitForFunction(function(){ return state.screen==='p-summary'; }); await page.waitForTimeout(1800);
    r=await sample(page, 1500); check(r.calls===0, 'ở tổng kết mà vòng vẽ còn chạy '+r.calls+' lần/1,5 s');
  });
  await run('M6', 'màn chẩn đoán có dòng MT, đúng 1 vòng mỗi khung', async function(){
    await page.evaluate(function(){ logout(); }); await page.waitForFunction(function(){ return state.screen==='p-pin'; }); await page.waitForTimeout(600);
    for(var i=0;i<5;i++){ await page.click('#wordmark'); await page.waitForTimeout(80); }
    var t=await page.evaluate(function(){ var d=document.getElementById('diag'); return d.hidden?'':d.textContent; });
    var m=/MT (\d+) KHUNG\/S · (\d+,\d+) MS JS\/KHUNG · (\d+,\d) VÒNG\/KHUNG · (\d+,\d) PHÚT LOOP/.exec(t);
    if(check(!!m, 'không thấy dòng MT trong chẩn đoán: '+t.slice(-120))){
      check(m[3]==='1,0', 'chẩn đoán báo '+m[3]+' vòng/khung');
      check(+m[1]>=45 && +m[1]<=75, 'chẩn đoán báo '+m[1]+' khung/giây');
      console.log('   · '+m[0]);
    }
  });
  await C.ctx.close();

  /* ---------------- 1:2 ---------------- */
  C=await mk(); page=C.page;
  await toLoop(page, ['Doãn Quang','Quang Vinh']);
  await run('M3', '1:2 · hai nửa, mỗi nửa 4 vòng: một vòng rAF cho cả hai', async function(){
    var A='#loop-host .loop:nth-child(1) ', B='#loop-host .loop:nth-child(2) ';
    one(await sample(page, 1500), 'vào loop 1:2');
    for(var c=1;c<=4;c++){
      for(var h of [A,B]){ await tap(page, h+'.c1'); await tap(page, h+'.c1'); await tap(page, h+'.c1'); }   /* mỗi nửa: set → Đạt → nghỉ */
      await page.waitForTimeout(600);
      for(var h2 of [A,B]){ await tap(page, h2+'.c1'); await page.waitForTimeout(300); await page.click(h2+'.film .exl button:nth-child(1)'); await page.waitForTimeout(700); }
    }
    var ph=await page.evaluate(function(){ return state.session.people.map(function(p){ return p.phase+':'+p.setNo; }).join(' '); });
    check(/setup:5 setup:5/.test(ph), 'kịch bản 1:2 không chạy hết: '+ph);
    var r=one(await sample(page, 2000), 'sau 4 vòng mỗi nửa'); console.log('   · 1:2 sau 4 vòng mỗi nửa: '+r.perFrame.toFixed(2)+' motFrame/khung · '+Math.round(r.fps)+' khung/s');
  });
  await C.ctx.close(); await browser.close(); srv.close();

  var fail=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fail)+'/'+RES.length+' PASS · pageerror '+PAGEERR.length+(PAGEERR.length?'\n   '+PAGEERR.join('\n   '):''));
  process.exit(fail||PAGEERR.length?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

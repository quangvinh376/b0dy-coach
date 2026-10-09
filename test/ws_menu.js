/* v2.8.1 — nút Menu ở loop + window "Buổi tập hôm nay" (Figma 606:233 · 644:1290 / 664:251 / 664:352)
   · Thiết lập set + Bắt đầu nghỉ: nút trái = Menu (☰), không còn ← ; đang tập / đang nghỉ vẫn ↩
   · Menu → window: lưới thẻ của buổi (tình trạng theo khách), tên khách + "Buổi tập hôm nay", ⌄ đóng, ⌂ trang chủ
   · chạm thẻ = vào bài + set · giữ kéo = đổi chỗ · vùng xoá có khoá · Thêm bài → trang "Danh sách bài tập" trong cùng window, ← quay lại
   · ⌂ → trang chủ "Tiếp tục buổi tập" → vào lại loop đúng chỗ · 1:2 mỗi nửa mở window của khách mình
   Chạy: node test/ws_menu.js   (BASE=… để chạy trên bản cũ — phải trượt) */
var {chromium}=require('playwright'); var path=require('path');
var ROOT=process.env.BASE||path.resolve(__dirname,'..'), serve=require(path.join(ROOT,'test','serve'));
(async function(){
  var PORT=+process.env.PORT||19292, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[], pass=0, fail=0;
  page.on('pageerror', function(e){ errs.push(String(e)); });
  function check(ok, msg){ if(ok) pass++; else fail++; console.log((ok?'  ok  ':'  FAIL ')+msg); }
  function W(ms){ return page.waitForTimeout(ms); }
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  await page.goto('http://localhost:'+PORT+'/?demo'); await W(500);
  await pin('1234'); await W(1500);

  var PLAN=['Lat Pulldown (Wide Pronated Grip)','Seated Cable Row (Close Neutral Grip)','BB Front Squat','Lying Leg Curl'];
  /* buổi đang dở (số giả): bài 01 đang chọn 1 set, bài 02 xong 3 set, bài 03 dở 1 set, bài 04 chưa tập */
  async function loopAt(opt){
    opt=Object.assign({plan:PLAN, cur:0, fill:true, two:false}, opt||{});
    await page.evaluate(function(a){
      var names=a.two ? state.clients.slice(0,2).map(function(c){ return c.name; }) : ['Bùi Doãn Quang'];
      var people=names.map(function(n){ return {name:n, no:1, cur:a.cur, setNo:1, phase:'setup', reps:10, kg:20, restTotal:90, restStart:0, ex:{}, form:0, note:'', okDone:false}; });
      state.session={day:TODAY_ISO, coach:state.coach, kind:names.length>1?'1:2':'1:1', people:people, plan:a.plan.slice(), started:1, startedAt:Date.now()};
      if(a.fill) people.forEach(function(p){
        p.ex[a.plan[0]]={sets:[[40,12,1,'x0']], done:false};
        if(a.plan[1]) p.ex[a.plan[1]]={sets:[[30,10,1,'x1'],[32.5,8,1,'x2'],[32.5,8,0,'x3']], done:true};
        if(a.plan[2]) p.ex[a.plan[2]]={sets:[[60,6,1,'x4']], done:false};
      });
      saveSession(); go('p-loop','fwd');
    }, opt);
    await W(1300);
  }
  async function g1(idx){ return page.evaluate(function(i){ var b=document.querySelectorAll('#loop-host .lp .g1')[i||0], u=b&&b.querySelector('use'); return {href:u?u.getAttribute('href'):null, label:b?b.getAttribute('aria-label'):null}; }, idx||0); }
  async function st(){ return page.evaluate(function(){ var ps=state.session.people; return {scr:state.screen, ws:WS.open, page:WS.page, cur:ps.map(function(p){return p.cur;}), ph:ps.map(function(p){return p.phase;}), setNo:ps.map(function(p){return p.setNo;}), plan:state.session.plan.slice(),
    t1:[].map.call(document.querySelectorAll('#loop-host .lp .head .t1'), function(e){ return e.textContent; }), sub:[].map.call(document.querySelectorAll('#loop-host .lp .head .sub'), function(e){ return e.textContent; })}; }); }
  async function clickBox(sel, n, dx, dy){ var b=await page.locator(sel).nth(n||0).boundingBox(); await page.mouse.click(b.x+(dx||b.width/2), b.y+(dy||b.height/2)); }

  /* W1 — nút trái theo pha */
  await loopAt();
  var a=await g1();
  check(a.href==='#i-list' && a.label==='Buổi tập hôm nay', 'W1a thiết lập set: nút trái = Menu (danh-sach): '+JSON.stringify(a));
  await page.click('#loop-host .c1'); await W(700);
  a=await g1(); check(a.href==='#i-undo', 'W1b đang tập: ↩ hoàn tác (không đổi): '+a.href);
  await page.click('#loop-host .c1'); await W(900);
  a=await g1(); var s1=await st();
  check(s1.ph[0]==='rest-setup' && a.href==='#i-list', 'W1c bắt đầu nghỉ: nút trái = Menu: '+JSON.stringify([s1.ph[0], a.href]));

  /* W2 — mở window từ "Bắt đầu nghỉ": khung, tên, lưới */
  await page.click('#loop-host .g1'); await W(700);
  var w2=await page.evaluate(function(){ var w=document.getElementById('ws'), r=w.getBoundingClientRect(), nm=document.getElementById('ws-nm'), tt=document.querySelector('#ws .wtt .wp'),
    tiles=[].map.call(document.querySelectorAll('#ws-grid .ptile:not(.add)'), function(t){ var p=t.querySelector('.pst'); return [t.querySelector('.nm').textContent, p?p.textContent:null]; }),
    l=document.getElementById('ws-close').getBoundingClientRect(), h=document.getElementById('ws-home').getBoundingClientRect(), g=document.querySelector('#ws-grid .ptile').getBoundingClientRect();
    return {on:w.classList.contains('on'), dim:document.getElementById('ws-dim').classList.contains('on'), top:Math.round(r.top), h:Math.round(r.height), nm:nm.textContent, nmCol:getComputedStyle(nm).color, tt:tt.textContent,
      tiles:tiles, add:!!document.querySelector('#ws-grid .ptile.add'), left:[Math.round(l.left),Math.round(l.bottom),Math.round(l.width)], home:[Math.round(852-h.bottom), Math.round(393-h.right)], gTop:Math.round(g.top), gLeft:Math.round(g.left),
      down:document.querySelector('#ws-close use').getAttribute('href'), hm:document.querySelector('#ws-home use').getAttribute('href')}; });
  console.log('    ', JSON.stringify(w2));
  check(w2.on && w2.dim && w2.top===126 && w2.h===726, 'W2a window y 126, cao 726, lớp làm mờ bật');
  check(w2.nm==='Doãn Quang' && w2.nmCol==='rgb(158, 158, 158)' && w2.tt==='Buổi tập hôm nay', 'W2b cụm tên: "Doãn Quang" (Ash) / "Buổi tập hôm nay"');
  check(w2.tiles.length===4 && w2.tiles[0][1]==='Set 3' && w2.tiles[1][1]==='Đã xong 3 set' && w2.tiles[3][1]===null && w2.add, 'W2c lưới thẻ + tình trạng (bài đang nghỉ: set kế = 3) + ô Thêm bài: '+JSON.stringify(w2.tiles));
  check(w2.left[0]===12 && w2.left[1]===824 && w2.left[2]===48 && w2.home[0]===28 && w2.home[1]===12 && w2.down==='#i-down' && w2.hm==='#i-home24', 'W2d nav: ⌄ trái (12, đáy 824) · ⌂ phải (cách đáy 28, phải 12)');
  check(w2.gTop===166 && w2.gLeft===12, 'W2e lưới cách tay nắm 14 (Figma: 126 + 8 + 6 + 12 + 14 = y 166), rail 12: '+w2.gTop+' / '+w2.gLeft);
  await page.screenshot({path:__dirname+'/out_ws_1.png'});
  /* W3 — ở "Bắt đầu nghỉ" chạm chính bài đang tập → vào set mới (set 3), set vừa chấm được gửi */
  await clickBox('#ws-grid .ptile', 0); await W(1300);
  var s3=await st(), held=await page.evaluate(function(){ return OUT.q.filter(function(e){ return e.hold; }).length; });
  check(!s3.ws && s3.cur[0]===0 && s3.ph[0]==='setup' && s3.setNo[0]===3 && held===0, 'W3 chạm bài đang tập lúc Bắt đầu nghỉ → Thiết lập set 3, set vừa chấm đã nhả: '+JSON.stringify([s3.ph[0], s3.setNo[0], held]));

  /* W4 — từ Thiết lập: Menu → chạm thẻ 03 → bài 03 set 2 */
  await page.click('#loop-host .g1'); await W(700);
  await clickBox('#ws-grid .ptile', 2); await W(1300);
  var s4=await st();
  check(!s4.ws && s4.cur[0]===2 && s4.ph[0]==='setup' && s4.setNo[0]===2 && /Front Squat/.test(s4.t1[0]) && /set 2/.test(s4.sub[0]), 'W4 chạm thẻ 03 → '+s4.t1[0]+' / '+s4.sub[0]);

  /* W5 — Thêm bài → trang Danh sách bài tập (cùng window), ← quay lại, bài mới hiện trong lưới */
  await page.click('#loop-host .g1'); await W(700);
  await clickBox('#ws-grid .ptile.add', 0); await W(700);
  var w5=await page.evaluate(function(){ var lb=document.getElementById('lib'), r=lb.getBoundingClientRect(), wr=document.getElementById('ws').getBoundingClientRect(), cta=document.getElementById('lib-go'), bk=document.getElementById('lib-back');
    return {wmode:lb.classList.contains('wmode'), on:lb.classList.contains('on'), left:Math.round(r.left), top:Math.round(r.top), wsLeft:Math.round(wr.left), cta:getComputedStyle(cta).display, back:getComputedStyle(bk).display,
      nm:document.getElementById('lib-wnm').textContent, tt:document.querySelector('#lib .wtt .wp').textContent, libDim:document.getElementById('lib-dim').classList.contains('on'), rows:document.querySelectorAll('#lib-list .row').length, page:WS.page}; });
  console.log('    ', JSON.stringify(w5));
  check(w5.wmode && w5.on && w5.left===0 && w5.top===126 && w5.wsLeft<0 && w5.page===2, 'W5a trang 2 trượt ngang vào trên window (window lùi sau): left '+w5.left+', window '+w5.wsLeft);
  check(w5.cta==='none' && w5.back!=='none' && w5.nm==='Doãn Quang' && w5.tt==='Danh sách bài tập' && !w5.libDim && w5.rows>60, 'W5b nav ← · "Doãn Quang / Danh sách bài tập", không CTA Chọn');
  await page.screenshot({path:__dirname+'/out_ws_2.png'});
  await page.fill('#lib-q','dip'); await page.evaluate(function(){ renderLib(false); }); await W(150);
  await clickBox('#lib-list .row', 0); await W(300);
  var add5=await page.evaluate(function(){ return state.session.plan.slice(-1)[0]; });
  check(add5==='Dip', 'W5c chọn "Dip" → thêm vào buổi: '+add5);
  await page.click('#lib-back'); await W(700);
  var w5d=await page.evaluate(function(){ var lb=document.getElementById('lib'); return {page:WS.page, ws:WS.open, libOn:lb.classList.contains('on'), wsLeft:Math.round(document.getElementById('ws').getBoundingClientRect().left),
    last:[].map.call(document.querySelectorAll('#ws-grid .ptile:not(.add) .nm'), function(e){ return e.textContent; }).slice(-1)[0]}; });
  check(w5d.page===1 && w5d.ws && !w5d.libOn && w5d.wsLeft===0 && w5d.last==='Dip', 'W5d ← về Buổi tập hôm nay, thẻ Dip đã có: '+JSON.stringify(w5d));

  /* W6 — bỏ bài trong danh sách: bài có set → khoá; bài đang chọn (thiết lập, chưa set) bỏ được → loop dựng lại theo bài mới */
  await clickBox('#ws-grid .ptile.add', 0); await W(700);
  await page.fill('#lib-q','front squat'); await page.evaluate(function(){ renderLib(false); }); await W(150);
  await clickBox('#lib-list .row', 0); await W(300);
  var p6=await page.evaluate(function(){ return {has:state.session.plan.indexOf('BB Front Squat')>=0, pill:(document.querySelector('#pill')||{}).textContent||''}; });
  check(p6.has && /đã có set/i.test(p6.pill), 'W6a bỏ bài đã có set → khoá: '+p6.pill.trim());
  await page.evaluate(function(){ state.session.people[0].cur=4; state.session.people[0].ex['Dip']={sets:[],done:false}; saveSession(); LOOPS[0].resync(true); });
  await W(400);
  await page.fill('#lib-q','dip'); await page.evaluate(function(){ renderLib(false); }); await W(150);
  await clickBox('#lib-list .row', 0); await W(300);
  await page.click('#lib-back'); await W(600);
  await page.click('#ws-close'); await W(900);
  var s6=await st();
  check(s6.plan.indexOf('Dip')<0 && s6.cur[0]===3 && s6.ph[0]==='setup' && /Lying Leg Curl/.test(s6.t1[0]), 'W6b bỏ bài đang chọn (chưa set) → đóng window: loop sang '+s6.t1[0]+' (cur '+s6.cur[0]+')');

  /* W7 — giữ kéo trong window: đổi chỗ 01 ↔ 02, bài đang chọn đi theo tên; kéo bài có set vào vùng xoá → khoá */
  await page.click('#loop-host .g1'); await W(700);
  var b0=await page.locator('#ws-grid .ptile').nth(0).boundingBox(), b1=await page.locator('#ws-grid .ptile').nth(1).boundingBox();
  await page.mouse.move(b0.x+80, b0.y+70); await page.mouse.down(); await W(400);
  for(var k=1;k<=12;k++){ await page.mouse.move(b0.x+80+(b1.x-b0.x)*k/12, b0.y+70); await W(30); }
  await W(200); await page.mouse.up(); await W(700);
  var s7=await st();
  check(s7.ws && s7.plan[0]==='Seated Cable Row (Close Neutral Grip)' && s7.plan[1]==='Lat Pulldown (Wide Pronated Grip)' && s7.cur[0]===3, 'W7a giữ + kéo trong window: đổi chỗ, vẫn mở window, bài đang chọn giữ (cur 3)');
  var b2=await page.locator('#ws-grid .ptile').nth(0).boundingBox(), dz=await page.evaluate(function(){ var r=document.getElementById('ws-drop').getBoundingClientRect(); return {y:r.top+r.height/2}; });
  await page.mouse.move(b2.x+80, b2.y+70); await page.mouse.down(); await W(400);
  for(k=1;k<=14;k++){ await page.mouse.move(b2.x+80, b2.y+70+(dz.y-(b2.y+70))*k/14); await W(30); }
  var dzt=await page.evaluate(function(){ var d=document.getElementById('ws-drop'); return {t:d.textContent, lock:d.classList.contains('lock'), show:d.classList.contains('show')}; });
  await page.mouse.up(); await W(700);
  var s7b=await st();
  check(dzt.show && dzt.lock && dzt.t==='Bài đã có set' && s7b.plan.length===4, 'W7b kéo bài có set vào vùng xoá → khoá, không xoá: '+JSON.stringify(dzt));

  /* W8 — ⌄ đóng không đổi gì · chạm lớp làm mờ cũng đóng */
  await page.click('#ws-close'); await W(800);
  var s8=await st(); check(!s8.ws && s8.scr==='p-loop' && s8.cur[0]===3, 'W8a ⌄ đóng window, loop giữ nguyên');
  await page.click('#loop-host .g1'); await W(700); await page.mouse.click(196, 60); await W(800);
  check(!(await st()).ws, 'W8b chạm vùng làm mờ phía trên → đóng');

  /* W9 — ⌂ về trang chủ → "Tiếp tục buổi tập" → vào lại loop đúng bài / pha; set đang giữ đã gửi */
  await page.click('#loop-host .c1'); await W(700); await page.click('#loop-host .c1'); await W(900);   /* chấm Đạt → Bắt đầu nghỉ, set giữ */
  var h9=await page.evaluate(function(){ return OUT.q.filter(function(e){ return e.hold; }).length; });
  await page.click('#loop-host .g1'); await W(700); await page.click('#ws-home'); await W(1300);
  var s9=await page.evaluate(function(){ return {scr:state.screen, go:document.getElementById('h-go').textContent, held:OUT.q.filter(function(e){ return e.hold; }).length, ws:WS.open}; });
  check(h9===1 && s9.scr==='p-home' && s9.go==='Tiếp tục buổi tập' && s9.held===0 && !s9.ws, 'W9a ⌂ → trang chủ "Tiếp tục buổi tập", set giữ đã nhả: '+JSON.stringify([h9, s9]));
  await page.click('#h-go'); await W(1500);
  var s9b=await st();
  check(s9b.scr==='p-loop' && s9b.cur[0]===3 && s9b.ph[0]==='rest-setup', 'W9b Tiếp tục buổi tập → loop đúng bài 04, Bắt đầu nghỉ: '+JSON.stringify([s9b.cur[0], s9b.ph[0]]));

  /* W10 — đóng cả window từ trang 2 (tay nắm) · trang Bài tập hôm nay (trước khi bắt đầu) vẫn mở thư viện kiểu cũ (trượt lên, CTA Chọn) */
  await page.click('#loop-host .g1'); await W(700); await clickBox('#ws-grid .ptile.add', 0); await W(700);
  await page.click('#lib-handle'); await W(900);
  var s10=await page.evaluate(function(){ var lb=document.getElementById('lib'); return {ws:WS.open, libOn:lb.classList.contains('on'), wmode:lb.classList.contains('wmode'), wsOn:document.getElementById('ws').classList.contains('on'), LIB_OPEN:LIB_OPEN}; });
  check(!s10.ws && !s10.libOn && !s10.wmode && !s10.wsOn && !s10.LIB_OPEN, 'W10a tay nắm ở trang 2 → đóng cả window: '+JSON.stringify(s10));
  await page.evaluate(function(){ var s=state.session; s.started=0; s.people.forEach(function(p){ p.phase='setup'; }); saveSession(); go('p-plan','fwd'); });
  await W(900); await clickBox('#pl-grid .ptile.add', 0); await W(700);
  var s10b=await page.evaluate(function(){ var lb=document.getElementById('lib'); return {on:lb.classList.contains('on'), wmode:lb.classList.contains('wmode'), cta:getComputedStyle(document.getElementById('lib-go')).display, back:getComputedStyle(document.getElementById('lib-back')).display, dim:document.getElementById('lib-dim').classList.contains('on')}; });
  check(s10b.on && !s10b.wmode && s10b.cta!=='none' && s10b.back==='none' && s10b.dim, 'W10b thư viện ở trang Bài tập hôm nay như cũ (CTA Chọn, không ←): '+JSON.stringify(s10b));
  await page.evaluate(function(){ closeLib(true); }); await W(500);

  /* W11 — 1:2: nửa dưới mở window của khách thứ 2; chạm thẻ chỉ dời khách đó */
  await loopAt({two:true});
  var nm2=await page.evaluate(function(){ return firstName(state.session.people[1].name); });
  var gs=await page.locator('#loop-host .lp .g1').count();
  var ic2=await g1(1);
  check(gs===2 && ic2.href==='#i-list', 'W11a 1:2: nút rút gọn trái mỗi nửa = Menu');
  await page.locator('#loop-host .lp .g1').nth(1).click(); await W(800);
  var w11=await page.evaluate(function(){ return {nm:document.getElementById('ws-nm').textContent, idx:WS.idx}; });
  check(w11.nm===nm2 && w11.idx===1, 'W11b window của nửa dưới mang tên khách 2: '+w11.nm);
  await clickBox('#ws-grid .ptile', 3); await W(1300);
  var s11=await st();
  check(s11.cur[0]===0 && s11.cur[1]===3 && s11.ph[1]==='setup', 'W11c chạm thẻ 04 → chỉ khách 2 sang bài 04: '+JSON.stringify(s11.cur));
  await page.locator('#loop-host .lp .g1').nth(0).click(); await W(800);
  var w11d=await page.evaluate(function(){ return {nm:document.getElementById('ws-nm').textContent, st:[].map.call(document.querySelectorAll('#ws-grid .ptile:not(.add)'), function(t){ var p=t.querySelector('.pst'); return p?p.textContent:null; })}; });
  check(w11d.nm!==nm2 && w11d.st[0]==='Set 2' && w11d.st[3]===null, 'W11d window nửa trên: tình trạng theo khách 1 (thẻ 04 chưa tập): '+JSON.stringify(w11d));
  await page.click('#ws-close'); await W(700);

  /* W12 — buổi chỉ còn 1 bài: không bỏ được bài cuối */
  await loopAt({plan:['Dip'], fill:false});
  await page.click('#loop-host .g1'); await W(700); await clickBox('#ws-grid .ptile.add', 0); await W(700);
  await page.fill('#lib-q','dip'); await page.evaluate(function(){ renderLib(false); }); await W(150);
  await clickBox('#lib-list .row', 0); await W(300);
  var p12=await page.evaluate(function(){ return {plan:state.session.plan.slice(), pill:(document.querySelector('#pill')||{}).textContent||''}; });
  check(p12.plan.length===1 && /ít nhất 1 bài/.test(p12.pill), 'W12 bài cuối của buổi không bỏ được: '+p12.pill.trim());
  await page.click('#lib-back'); await W(500); await page.click('#ws-close'); await W(600);

  check(!errs.length, 'W13 0 pageerror '+JSON.stringify(errs));
  console.log(fail ? 'FAIL '+pass+'/'+(pass+fail) : 'PASS '+pass+'/'+pass);
  await ctx.close(); await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

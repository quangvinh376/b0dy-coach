/* v2.7.3 — "Bài tập hôm nay" (Figma 641:1217):
   · tình trạng tập ngay dưới tên bài: "Set n" Acid (đang tập dở / bài đang chọn), "Đã xong n set" xám #9E9E9E, chưa tập → không có dòng;
     nhãn nhóm ở đáy thẻ không còn " · n SET"
   · chạm thẻ → vào thẳng bài + set tương ứng; giữ để nhấc → kéo đổi chỗ như cũ (không chuyển màn); cuộn không chuyển màn
   Chạy: node test/plan_tap.js   (BASE=… để chạy trên bản cũ — phải trượt T1–T4) */
var {chromium}=require('playwright'); var path=require('path');
var ROOT=process.env.BASE||path.resolve(__dirname,'..'), serve=require(path.join(ROOT,'test','serve'));
(async function(){
  var PORT=+process.env.PORT||19282, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[], pass=0, fail=0;
  page.on('pageerror', function(e){ errs.push(String(e)); });
  function check(ok, msg){ if(ok) pass++; else fail++; console.log((ok?'  ok  ':'  FAIL ')+msg); }
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  await page.goto('http://localhost:'+PORT+'/?demo'); await page.waitForTimeout(500);
  await pin('1234'); await page.waitForTimeout(1500);

  var PLAN=['Lat Pulldown (Wide Pronated Grip)','Seated Cable Row (Close Neutral Grip)','BB Front Squat','Lying Leg Curl'];
  /* buổi 1:1 đang dở: bài 01 đang tập (1 set), bài 02 đã xong 3 set, bài 03 tập dở 1 set, bài 04 chưa tập (số giả) */
  async function setup(opt){
    await page.evaluate(function(a){
      var names=a.two ? state.clients.slice(0,2).map(function(c){ return c.name; }) : ['Bùi Doãn Quang'];
      var people=names.map(function(n){ return {name:n, no:1, cur:a.cur, setNo:1, phase:'setup', reps:10, kg:20, restTotal:90, restStart:0, ex:{}, form:0, note:'', okDone:false}; });
      state.session={day:TODAY_ISO, coach:state.coach, kind:names.length>1?'1:2':'1:1', people:people, plan:a.plan.slice(), started:a.started, startedAt:a.started?Date.now():0};
      if(a.fill){ people.forEach(function(p){
        p.ex[a.plan[0]]={sets:[[40,12,1]], done:false};
        p.ex[a.plan[1]]={sets:[[30,10,1],[32.5,8,1],[32.5,8,0]], done:true};
        p.ex[a.plan[2]]={sets:[[60,6,1]], done:false};
      }); }
      if(a.restB){ var b=people[1]; b.cur=1; b.phase='rest'; b.restStart=Date.now(); }
      saveSession(); go('p-plan','fwd');
    }, Object.assign({plan:PLAN, cur:0, started:1, fill:true}, opt||{}));
    await page.waitForTimeout(900);
  }
  async function tiles(){ return page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pl-grid .ptile:not(.add)'), function(t){
    var st=t.querySelector('.pst'), nm=t.querySelector('.nm'), no=t.querySelector('.no'), lab=t.querySelector('.ft .lab'), r=t.getBoundingClientRect();
    return {nm:nm.textContent, st:st?st.textContent:null, col:st?getComputedStyle(st).color:null, lab:lab.textContent,
      dNo:Math.round(no.getBoundingClientRect().top-r.top), dNm:Math.round(nm.getBoundingClientRect().top-r.top), dSt:st?Math.round(st.getBoundingClientRect().top-r.top):null,
      fs:st?getComputedStyle(st).fontSize:null, lh:st?getComputedStyle(st).lineHeight:null}; }); }); }

  /* T1 — dòng tình trạng dưới tên, đúng màu, nhãn đáy không còn số set */
  await setup();
  var tl=await tiles();
  console.log('    ', JSON.stringify(tl.map(function(t){ return [t.nm, t.st, t.col, t.lab]; })));
  check(tl[0].st==='Set 2' && tl[0].col==='rgb(212, 255, 0)', 'T1a bài đang tập: "Set 2" Acid');
  check(tl[1].st==='Đã xong 3 set' && tl[1].col==='rgb(158, 158, 158)', 'T1b bài đã xong: "Đã xong 3 set" #9E9E9E');
  check(tl[2].st==='Set 2' && tl[2].col==='rgb(212, 255, 0)', 'T1c bài tập dở (không phải bài đang chọn): "Set 2" Acid');
  check(tl[3].st===null, 'T1d chưa tập: không có dòng tình trạng');
  check(tl.every(function(t){ return !/SET/.test(t.lab); }) && tl[0].lab==='LAT PULLDOWN', 'T1e nhãn đáy chỉ còn tên nhóm: '+tl.map(function(t){return t.lab}).join(' · '));
  /* T2 — số đo theo Figma: "01" cách mép trên 12, tên 33 (13 + 8), tình trạng ngay dưới tên (+19), cỡ 16/19 */
  check(tl[0].dNo===12 && tl[0].dNm===33 && tl[0].dSt===52 && tl[0].fs==='16px' && tl[0].lh==='19px', 'T2 vị trí: số '+tl[0].dNo+' · tên '+tl[0].dNm+' · tình trạng '+tl[0].dSt+' · '+tl[0].fs+'/'+tl[0].lh);
  await page.screenshot({path:__dirname+'/out_plan_tap.png'});
  /* T2b — bài đang chọn chưa có set (vừa vào bài) → "Set 1"; buổi chưa bắt đầu → không có dòng nào */
  await setup({fill:false, cur:2});
  var t2=await tiles();
  check(t2[2].st==='Set 1' && t2.filter(function(t){return t.st}).length===1, 'T2b bài đang chọn chưa có set: "Set 1" (chỉ thẻ đó)');
  await setup({fill:false, started:0});
  var t3=await tiles();
  check(t3.every(function(t){ return t.st===null; }), 'T2c buổi chưa bắt đầu: không thẻ nào có dòng tình trạng');

  /* T3 — chạm thẻ 03 → loop đúng bài 03, set 2, reps/kg theo set gần nhất trong buổi */
  await setup();
  var box=await page.locator('#pl-grid .ptile').nth(2).boundingBox();
  await page.mouse.move(box.x+60, box.y+60); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForTimeout(1200);
  var r3=await page.evaluate(function(){ var p=state.session.people[0]; return {scr:state.screen, cur:p.cur, setNo:p.setNo, kg:p.kg, reps:p.reps, phase:p.phase,
    t1:(document.querySelector('#loop-host .head .t1')||{}).textContent||'', sub:(document.querySelector('#loop-host .sub')||{}).textContent||''}; });
  console.log('    ', JSON.stringify(r3));
  check(r3.scr==='p-loop' && r3.cur===2 && r3.phase==='setup', 'T3a chạm thẻ 03 → màn loop, bài 03 (cur 2), thiết lập');
  check(r3.setNo===2 && r3.kg===60 && r3.reps===6, 'T3b đúng set kế tiếp (set 2) + reps/kg của set gần nhất: '+r3.setNo+' · '+r3.reps+' × '+r3.kg);
  check(/Front Squat/.test(r3.t1) && /set 2/i.test(r3.sub), 'T3c màn loop hiện đúng tên bài + set: '+r3.t1+' / '+r3.sub);
  /* T3d — v2.8.1: từ loop, nút Menu mở window "Buổi tập hôm nay" (không về trang này nữa); bài 03 là bài đang chọn ("Set 2") */
  await page.click('#loop-host .g1'); await page.waitForTimeout(900);
  var r3d=await page.evaluate(function(){ var t=document.querySelectorAll('#ws-grid .ptile:not(.add)')[2], p=t&&t.querySelector('.pst'); return {scr:state.screen, ws:WS.open, cur:state.session.people[0].cur, st:p?p.textContent:null}; });
  check(r3d.scr==='p-loop' && r3d.ws && r3d.cur===2 && r3d.st==='Set 2', 'T3d Menu ở thiết lập → window Buổi tập hôm nay, bài 03 "Set 2": '+JSON.stringify(r3d));
  await page.click('#ws-close'); await page.waitForTimeout(600);

  /* T4 — chạm thẻ 02 (đã xong) → vào bài 02, set 4 */
  await setup();
  box=await page.locator('#pl-grid .ptile').nth(1).boundingBox();
  await page.mouse.click(box.x+50, box.y+50); await page.waitForTimeout(1200);
  var r4=await page.evaluate(function(){ var p=state.session.people[0]; return {scr:state.screen, cur:p.cur, setNo:p.setNo}; });
  check(r4.scr==='p-loop' && r4.cur===1 && r4.setNo===4, 'T4 chạm thẻ đã xong → bài 02, set 4: '+JSON.stringify(r4));

  /* T5 — buổi chưa bắt đầu: chạm thẻ 04 → bắt đầu ngay ở bài 04 (không về 01) */
  await setup({fill:false, started:0});
  box=await page.locator('#pl-grid .ptile').nth(3).boundingBox();
  await page.mouse.click(box.x+50, box.y+50); await page.waitForTimeout(1200);
  var r5=await page.evaluate(function(){ var s=state.session; return {scr:state.screen, cur:s.people[0].cur, started:s.started, setNo:s.people[0].setNo}; });
  check(r5.scr==='p-loop' && r5.cur===3 && r5.started===1 && r5.setNo===1, 'T5 chưa bắt đầu: chạm thẻ 04 → vào bài 04 set 1: '+JSON.stringify(r5));

  /* T6 — giữ ngón ~400 ms rồi kéo thẻ 01 sang ô 02 → đổi chỗ, KHÔNG chuyển màn */
  await setup();
  var b0=await page.locator('#pl-grid .ptile').nth(0).boundingBox(), b1=await page.locator('#pl-grid .ptile').nth(1).boundingBox();
  await page.mouse.move(b0.x+80, b0.y+70); await page.mouse.down(); await page.waitForTimeout(400);
  for(var k=1;k<=12;k++){ await page.mouse.move(b0.x+80+(b1.x-b0.x)*k/12, b0.y+70); await page.waitForTimeout(30); }
  await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(700);
  var r6=await page.evaluate(function(){ return {scr:state.screen, plan:state.session.plan.slice(0,2), cur:state.session.people[0].cur,
    no:[].map.call(document.querySelectorAll('#pl-grid .ptile:not(.add) .no'), function(e){ return e.textContent; }).join(',')}; });
  check(r6.scr==='p-plan' && r6.plan[0]==='Seated Cable Row (Close Neutral Grip)' && r6.plan[1]==='Lat Pulldown (Wide Pronated Grip)', 'T6a giữ + kéo: đổi chỗ 01 ↔ 02, vẫn ở danh sách: '+JSON.stringify(r6.plan));
  check(r6.cur===1 && r6.no==='01,02,03,04', 'T6b bài đang chọn đi theo thẻ (cur 1), số thứ tự đánh lại');
  var tl6=await tiles();
  check(tl6[1].st==='Set 2' && tl6[0].st==='Đã xong 3 set', 'T6c dòng tình trạng đi theo thẻ');
  /* T7 — giữ ngón không kéo rồi nhả → không chuyển màn, không đổi thứ tự */
  var b2=await page.locator('#pl-grid .ptile').nth(2).boundingBox();
  await page.mouse.move(b2.x+60, b2.y+60); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(700);
  var r7=await page.evaluate(function(){ return {scr:state.screen, p2:state.session.plan[2]}; });
  check(r7.scr==='p-plan' && r7.p2==='BB Front Squat', 'T7 giữ rồi nhả tại chỗ: không vào bài, thứ tự giữ nguyên');
  /* T8 — vuốt (di > 6 px trước khi nhấc) rồi nhả → không vào bài */
  await page.mouse.move(b2.x+60, b2.y+60); await page.mouse.down(); await page.mouse.move(b2.x+60, b2.y+90, {steps:4}); await page.mouse.up(); await page.waitForTimeout(700);
  check(await page.evaluate(function(){ return state.screen; })==='p-plan', 'T8 ngón đã di (cuộn) rồi nhả: không vào bài');
  /* T9 — chạm đúp nhanh: chỉ chuyển màn một lần */
  var gos=await page.evaluate(function(){ window.__goN=0; var g0=go; window.go=function(){ window.__goN++; return g0.apply(this, arguments); }; return 1; });
  var b3=await page.locator('#pl-grid .ptile').nth(3).boundingBox();
  await page.mouse.click(b3.x+50, b3.y+50); await page.mouse.click(b3.x+50, b3.y+50); await page.waitForTimeout(1200);
  var r9=await page.evaluate(function(){ return {n:window.__goN, scr:state.screen, cur:state.session.people[0].cur}; });
  check(r9.n===1 && r9.scr==='p-loop' && r9.cur===3, 'T9 chạm đúp: go() đúng một lần: '+JSON.stringify(r9));
  await page.evaluate(function(){ if(window.__goN!=null){ delete window.go; } });

  /* T10 — 1:2: khách B đang nghỉ ở bài 02 → chạm thẻ 04: khách A sang bài 04, khách B giữ nguyên lượt nghỉ */
  await page.reload(); await page.waitForTimeout(1200);
  await setup({two:true, restB:true});
  box=await page.locator('#pl-grid .ptile').nth(3).boundingBox();
  await page.mouse.click(box.x+50, box.y+50); await page.waitForTimeout(1300);
  var r10=await page.evaluate(function(){ var ps=state.session.people; return {scr:state.screen, a:[ps[0].cur, ps[0].phase], b:[ps[1].cur, ps[1].phase]}; });
  check(r10.scr==='p-loop' && r10.a[0]===3 && r10.a[1]==='setup' && r10.b[0]===1 && r10.b[1]==='rest', 'T10 1:2: A sang bài 04, B vẫn nghỉ ở bài 02: '+JSON.stringify(r10));

  /* T11 — bàn phím: Enter trên thẻ → vào bài */
  await setup();
  await page.focus('#pl-grid .ptile:nth-child(2)'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  check(await page.evaluate(function(){ return state.screen==='p-loop' && state.session.people[0].cur===1; }), 'T11 Enter trên thẻ 02 → vào bài 02');

  check(!errs.length, 'T12 0 pageerror '+JSON.stringify(errs));
  console.log(fail ? 'FAIL '+pass+'/'+(pass+fail) : 'PASS '+pass+'/'+pass);
  await ctx.close(); await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

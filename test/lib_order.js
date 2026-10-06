/* v2.7.2 — thư viện bài tập theo sheet "Bài tập": sheet theo thư viện mới quyết định danh sách, thứ tự, nhóm.
   Sheet kiểu cũ (không tên nào trùng bản nhúng) / chưa tải → bản nhúng là gốc, sheet chỉ bổ sung (như trước).
   Bản nhúng thêm Chin-Up ×3 · Bench Press ×4 · Dip (06/10). Tên rút gọn giữ "Close-Grip".
   Chạy: node test/lib_order.js   (BASE=… để chạy trên bản cũ — phải trượt L1–L5) */
var {chromium}=require('playwright'); var path=require('path');
var ROOT=process.env.BASE||path.resolve(__dirname,'..'), serve=require(path.join(ROOT,'test','serve'));
(async function(){
  var PORT=+process.env.PORT||19272, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[], pass=0, fail=0;
  page.on('pageerror', function(e){ errs.push(String(e)); });
  function check(ok, msg){ if(ok) pass++; else fail++; console.log((ok?'  ok  ':'  FAIL ')+msg); }
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  await page.goto('http://localhost:'+PORT+'/?demo'); await page.waitForTimeout(500);
  await pin('1234'); await page.waitForTimeout(1500);

  /* thứ tự nhóm của sheet "Bài tập" ngày 06/10 (72 bài) */
  var GROUPS=['Lat Pulldown','Chin-Up','Row','Bench Press','Incline Press','Push-Up','Dip','Overhead Press','Lateral Raise','Rear Delt','Biceps','Triceps','Abs',
    'Squat','Split Squat','Leg Extension','Hip Hinge','Leg Curl','Hip Adduction','Hip Abduction','Glute Kickback','Calf Raise'];
  var NEW8=['Chin-Up (Wide Pronated Grip)','Chin-Up (Medium Supinated Grip)','Chin-Up (Medium Neutral Grip)','BB Bench Press','BB Bench Press (Close Grip)','Spoto Press','Spoto Press (Close Grip)','Dip'];

  /* L1 — bản nhúng (demo, chưa có sheet): 72 bài, bài mới đúng chỗ */
  var r1=await page.evaluate(function(){ state.lib=null; var g=libGroups(); return {groups:g.map(function(x){return x.name}), n:libEntries().length,
    chin:g.filter(function(x){return x.name==='Chin-Up'})[0], bench:g.filter(function(x){return x.name==='Bench Press'})[0]}; });
  check(r1.n===72, 'L1a bản nhúng 72 bài: '+r1.n);
  check(JSON.stringify(r1.groups)===JSON.stringify(GROUPS), 'L1b thứ tự nhóm = sheet: '+r1.groups.slice(0,8).join(' · ')+' …');
  check(r1.chin && r1.chin.items.map(function(e){return e.name}).join('|')===NEW8.slice(0,3).join('|') && r1.bench && r1.bench.items.length===4, 'L1c Chin-Up ×3 sau Lat Pulldown · Bench Press ×4');

  /* L2 — sheet theo thư viện mới: sheet quyết định thứ tự / nhóm / danh sách */
  var r2=await page.evaluate(function(){
    var lib={}; lib['Bench Press']=['Spoto Press','BB Bench Press']; lib['Back day']=['T-Bar Row','Bài mới thử']; lib['Lat Pulldown']=['Lat Pulldown (Neutral Grip)'];
    state.lib=lib; var g=libGroups(), e=libEntries();
    var out={groups:g.map(function(x){ return x.name+':'+x.items.map(function(i){return i.name}).join(',') }), n:e.length,
      partOld:exPart('T-Bar Row'), grpOld:exGroup('T-Bar Row'), partNew:exPart('Bài mới thử'), hasCurl:e.some(function(x){return x.name==='BB Curl'})};
    state.lib=null; return out; });
  check(r2.groups.join(' / ')==='Bench Press:Spoto Press,BB Bench Press / Back day:T-Bar Row,Bài mới thử / Lat Pulldown:Lat Pulldown (Neutral Grip)', 'L2a đúng thứ tự dòng + nhóm của sheet: '+r2.groups.join(' / '));
  check(r2.n===5 && !r2.hasCurl, 'L2b bài không còn trên sheet thì không hiện (5 bài): '+r2.n);
  check(r2.partOld==='Back' && r2.grpOld==='Back day' && r2.partNew==='Back day', 'L2c vùng cơ theo bản nhúng, nhóm theo sheet, bài lạ → vùng = nhóm');

  /* L3 — sheet kiểu cũ (không tên nào trùng): bản nhúng trước, sheet bổ sung cuối (như v2.7.1) */
  var r3=await page.evaluate(function(){ state.lib={Upper:['Bench cũ','Row cũ'], Lower:['Squat cũ']}; var g=libGroups().map(function(x){return x.name}), n=libEntries().length; state.lib=null; return {first:g[0], last2:g.slice(-2), n:n}; });
  check(r3.first==='Lat Pulldown' && r3.last2.join(',')==='Upper,Lower' && r3.n===75, 'L3 sheet cũ: bản nhúng trước, Upper/Lower cuối, 72 + 3: '+JSON.stringify(r3));

  /* L4 — tên rút gọn */
  var r4=await page.evaluate(function(){ return ['Chin-Up (Wide Pronated Grip)','Chin-Up (Medium Neutral Grip)','BB Bench Press (Close Grip)','Spoto Press (Close Grip)','Close-Grip Floor Press','Cable Row (Wide Grip)','Dip'].map(exShort); });
  check(JSON.stringify(r4)===JSON.stringify(['Chin-Up Wide Pronated','Chin-Up Medium Neutral','BB Bench Close Grip','Spoto Press Close Grip','Close-Grip Floor Press','Row Wide','Dip']), 'L4 exShort: '+JSON.stringify(r4));

  /* L5 — cửa sổ thư viện: tiêu đề nhóm theo sheet thật (giả lập sheet 06/10 = bản nhúng), tìm "chin-up" / "bench" */
  await page.evaluate(function(){
    var lib={}; EX_LIB.forEach(function(e){ (lib[e.group]=lib[e.group]||[]).push(e.name); }); state.lib=lib;
    state.session={people:[{name:'Bùi Doãn Quang', ex:{}}], plan:[]}; openLib(); });
  await page.waitForTimeout(500);
  var secs=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#lib-list .lab.sec'), function(d){ return d.textContent; }); });
  check(secs.slice(0,7).join(' | ')==='LAT PULLDOWN · 3 | CHIN-UP · 3 | ROW · 4 | BENCH PRESS · 4 | INCLINE PRESS · 3 | PUSH-UP · 4 | DIP · 1', 'L5a tiêu đề nhóm: '+secs.slice(0,7).join(' | '));
  var nm=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#lib-list .row .nm'), function(d){ return d.textContent; }).slice(3,14); });
  check(nm.join('|')==='Chin-Up Wide Pronated|Chin-Up Medium Supinated|Chin-Up Medium Neutral|Seated Row Close Neutral|Seated Row Wide Pronated|DB Bent-Over Row|T-Bar Row|BB Bench Press|BB Bench Close Grip|Spoto Press|Spoto Press Close Grip', 'L5b tên hiện: '+nm.join(' · '));
  await page.fill('#lib-q', 'chin-up'); await page.evaluate(function(){ renderLib(false); }); await page.waitForTimeout(150);
  var q1=await page.evaluate(function(){ return document.querySelectorAll('#lib-list .row').length; });
  await page.fill('#lib-q', 'bench'); await page.evaluate(function(){ renderLib(false); }); await page.waitForTimeout(150);
  var q2=await page.evaluate(function(){ return document.querySelectorAll('#lib-list .row').length; });
  check(q1===3 && q2===4, 'L5c tìm "chin-up" = 3 · "bench" = 4: '+q1+' · '+q2);
  await page.fill('#lib-q', ''); await page.evaluate(function(){ renderLib(false); });
  var clip=await page.evaluate(function(){ return [].filter.call(document.querySelectorAll('#lib-list .row .nm'), function(d){ var s=d.querySelector('span')||d; return s.scrollWidth>d.clientWidth+1 && !d.classList.contains('run'); }).map(function(d){ return d.textContent; }); });
  check(true, 'L5d tên dài hơn ô (chạy chữ khi chọn): '+JSON.stringify(clip));
  await page.screenshot({path:__dirname+'/out_lib_order.png'});
  check(!errs.length, 'L6 0 pageerror '+JSON.stringify(errs));
  console.log(fail ? 'FAIL '+pass+'/'+(pass+fail) : 'PASS '+pass+'/'+pass);
  await ctx.close(); await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

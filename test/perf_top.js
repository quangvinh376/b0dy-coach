/* v2.6.2 — Hiệu suất tập: mỗi ngày MỘT dòng = set cao nhất của bài trong ngày (Figma 493:2335).
   Set cao nhất = set Đạt nặng nhất (bằng tạ → nhiều rep hơn); ngày không có set Đạt → set nặng nhất, tô đỏ.
   Chạy: node test/perf_top.js   (BASE=… để chạy trên bản cũ — phải trượt P2–P4) */
var {chromium}=require('playwright'); var serve=require('./serve');
(async function(){
  var PORT=+process.env.PORT||19262, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[], pass=0, fail=0;
  page.on('pageerror', function(e){ errs.push(String(e)); });
  function check(ok, msg){ if(ok) pass++; else fail++; console.log((ok?'  ok  ':'  FAIL ')+msg); }
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  await page.goto('http://localhost:'+PORT+'/?demo'); await page.waitForTimeout(500);
  await pin('1234'); await page.waitForTimeout(1500);

  /* số giả, khách giả của demo — repo public */
  var EX='Seated Cable Row (Close Neutral Grip)', EX2='Lat Pulldown (Wide Pronated Grip)';
  await page.evaluate(function(a){
    var h={}; h[a.ex]=[
      {d:'2026-10-06',kg:25,rep:8,ok:1},{d:'2026-10-06',kg:30,rep:5,ok:1},{d:'2026-10-06',kg:30,rep:4,ok:1},{d:'2026-10-06',kg:32.5,rep:3,ok:0},
      {d:'2026-10-03',kg:27.5,rep:6,ok:1},{d:'2026-10-03',kg:27.5,rep:8,ok:1},
      {d:'2026-09-30',kg:30,rep:3,ok:0},{d:'2026-09-30',kg:25,rep:2,ok:0}];
    h[a.ex2]=[{d:'2026-10-01',kg:40,rep:12,ok:1}];
    state.stats.hist={}; state.stats.hist['Bùi Doãn Quang']=h;
    var c=state.clients.filter(function(x){ return x.name==='Bùi Doãn Quang'; })[0]; c.last={};   /* snapshot rỗng để chỉ test dữ liệu trên */
    state.client=c; go('p-perf','fwd');
  }, {ex:EX, ex2:EX2});
  await page.waitForTimeout(900);

  /* P1 — hàm thuần */
  var unit=await page.evaluate(function(){
    if(typeof perfDays!=='function') return null;
    var r=perfDays([{d:'2026-10-06',kg:20,rep:10,ok:1},{d:'2026-10-06',kg:20,rep:12,ok:1},{d:'2026-10-06T09:00',kg:22.5,rep:6,ok:0},{d:'2026-10-02',kg:10,rep:5,ok:0},{d:'',kg:99,rep:1,ok:1},null]);
    return JSON.stringify(r);
  });
  check(unit==='[{"d":"2026-10-06","kg":20,"rep":12,"ok":1},{"d":"2026-10-02","kg":10,"rep":5,"ok":0}]', 'P1 perfDays: Đạt thắng Chưa đạt nặng hơn · bằng tạ lấy nhiều rep · bỏ dòng không ngày · mới → cũ: '+unit);

  /* P2 — mở bài: một dòng mỗi ngày */
  var idx=await page.evaluate(function(ex){ var rows=[].slice.call(document.querySelectorAll('#pe-list .row')); for(var i=0;i<rows.length;i++){ if(rows[i].querySelector('.nm').textContent===exShort(ex)) return i; } return -1; }, EX);
  check(idx>=0, 'P2a có dòng bài Seated Row');
  await page.locator('#pe-list .row').nth(idx).click(); await page.waitForTimeout(250);
  var kv=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pe-list .row.open + .xp .kv'), function(k){ return [k.children[0].textContent, k.children[1].textContent, k.children[1].classList.contains('er')]; }); });
  console.log('    ', JSON.stringify(kv));
  check(kv.length===3, 'P2b 3 ngày = 3 dòng (trước: 8 dòng set): '+kv.length);
  /* P3 — đúng set cao nhất + đúng định dạng */
  check(kv[0] && kv[0][0]==='6 tháng 10, 2026' && kv[0][1]==='5 × 30KG' && !kv[0][2], 'P3a 06/10: 5 × 30 KG (Đạt nặng nhất, bỏ 32,5 Chưa đạt)');
  check(kv[1] && kv[1][0]==='3 tháng 10, 2026' && kv[1][1]==='8 × 27,5KG' && !kv[1][2], 'P3b 03/10: bằng tạ 27,5 → 8 rep');
  check(kv[2] && kv[2][0]==='30 tháng 09, 2026' && kv[2][1]==='3 × 30KG' && kv[2][2], 'P3c 30/09: không set Đạt → set nặng nhất, đỏ');
  /* P4 — set đang ghi trong buổi (live) gộp đúng ngày hôm nay */
  var live=await page.evaluate(function(ex){
    state.session={people:[{name:'Bùi Doãn Quang', ex:{}}]}; state.session.people[0].ex[ex]={sets:[[35,4,1],[35,5,1]]};
    var h=perfHist(state.client); var d=perfDays(h[ex]); state.session=null;
    return JSON.stringify(d.filter(function(x){ return x.d===TODAY_ISO; }));
  }, EX);
  check(/"kg":35,"rep":5,"ok":1/.test(live||''), 'P4 set đang ghi hôm nay → 5 × 35 (một dòng): '+live);
  /* P5 — bài một ngày */
  await page.locator('#pe-list .row.open').click(); await page.waitForTimeout(150);
  var idx2=await page.evaluate(function(ex){ var rows=[].slice.call(document.querySelectorAll('#pe-list .row')); for(var i=0;i<rows.length;i++){ if(rows[i].querySelector('.nm').textContent===exShort(ex)) return i; } return -1; }, EX2);
  await page.locator('#pe-list .row').nth(idx2).click(); await page.waitForTimeout(250);
  var kv2=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pe-list .row.open + .xp .kv'), function(k){ return k.textContent; }); });
  check(kv2.length===1 && kv2[0]==='1 tháng 10, 202612 × 40KG', 'P5 bài một ngày: '+JSON.stringify(kv2));
  await page.screenshot({path:__dirname+'/out_perf_top.png'});
  check(!errs.length, 'P6 0 pageerror '+JSON.stringify(errs));
  console.log(fail ? 'FAIL '+pass+'/'+(pass+fail) : 'PASS '+pass+'/'+pass);
  await ctx.close(); await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

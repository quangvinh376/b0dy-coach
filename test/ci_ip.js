/* v2.8.3 — check-in và khoá IP (sự cố 11/10): máy chủ MOCK (không ?demo), IP dải tài liệu, PIN giả.
   · Worker v7 trả wrong_ip kèm seen/asn/relay → Apps Script cũng chặn → pill báo đúng lý do
     (relay: "Tắt Giới hạn theo dõi IP ở Wi-Fi phòng", không nút Thử lại · mạng khác: "Mạng chưa được phép check-in" + Thử lại
      · Worker cũ không kèm seen: "Chỉ check-in được ở phòng")
   · Worker chặn, Apps Script cho → check-in xong như thường
   · lấy lại IP (ipify) ngay lúc bấm Check-in; lùi về Apps Script chờ lượt lấy IP (≤ 2,5 s) → gửi IP mới, ipify treo thì vẫn gửi
   · chữ pill không bị cắt ở 375 px
   Chạy: node test/ci_ip.js   (BASE=… để chạy trên bản cũ — phải trượt) */
var {chromium}=require('playwright'); var path=require('path');
var ROOT=process.env.BASE||path.resolve(__dirname,'..'), serve=require(path.join(ROOT,'test','serve'));
(async function(){
  var PORT=+process.env.PORT||19417, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var pass=0, fail=0, errs=[];
  function check(ok, msg){ if(ok) pass++; else fail++; console.log((ok?'  ok  ':'  FAIL ')+msg); }
  var members=[{name:'Bùi Doãn Quang',done:14,total:24,left:10,coach:'Quyết',exp:'2026-11-21'},{name:'Nguyễn Quang Vinh',done:11,total:12,left:1,coach:'Quyết'}];
  var S;
  function reset(o){ S=Object.assign({wk:'ok', gas:'ok', ipify:'203.0.113.50', ipifyMs:0, ipifyCalls:0, gasIps:[], wkCalls:0, gasCalls:0}, o||{}); }
  async function run(vp, o, body){
    reset(o);
    var ctx=await browser.newContext({viewport:vp, deviceScaleFactor:1, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    await ctx.route(/api\.ipify\.org/, async function(r){ S.ipifyCalls++; var ip=S.ipify; if(S.ipifyMs) await new Promise(function(res){ setTimeout(res, S.ipifyMs); }); try{ await r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ip:ip})}); }catch(e){} });
    function common(p){
      if(p.action==='ping') return {ok:true};
      if(p.pin!=='1234') return {ok:false,error:'sai_pin'};
      if(p.action==='coach') return {ok:true, coach:'Quyết Hán', members:JSON.parse(JSON.stringify(members)), snapshot:{}, library:null, today:new Date().toISOString().slice(0,10)};
      if(p.action==='stats') return {ok:true, month:new Date().toISOString().slice(0,7), days:{}, monthTotal:3, perClient:{}, com:{month:new Date().toISOString().slice(0,7), total:0}, hist:{}};
      if(p.action==='log') return {ok:true, written:(p.events||[]).length};
      return null;
    }
    await ctx.route(/workers\.dev/, async function(r){
      var p=JSON.parse(r.request().postData()||'{}'), out=common(p);
      if(!out && p.action==='checkin_coach'){ S.wkCalls++;
        if(S.wk==='ok') out={ok:true,row:5,member:members[0],at:'10:05'};
        else if(S.wk==='relay') out={ok:false,error:'wrong_ip',seen:'2001:db8::7',asn:36183,relay:true};
        else if(S.wk==='other') out={ok:false,error:'wrong_ip',seen:'198.51.100.77',asn:7552,relay:false};
        else out={ok:false,error:'wrong_ip'};                                  /* Worker v6: không kèm seen */
      }
      r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out||{ok:false,error:'unknown_action'})});
    });
    await ctx.route(/script\.google\.com/, async function(r){
      var p=JSON.parse(r.request().postData()||'{}'), out=common(p);
      if(!out && p.action==='checkin_coach'){ S.gasCalls++; S.gasIps.push(p.ip); S.gasAt=Date.now();
        out = S.gas==='ok' ? {ok:true,row:6,member:members[0],at:'10:06'} : {ok:false,error:'wrong_ip'}; }
      r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out||{ok:false,error:'unknown_action'})});
    });
    var page=await ctx.newPage(); page.on('pageerror', function(e){ errs.push(String(e)); });
    await page.addInitScript(function(){ try{ localStorage.setItem('lb_ip','203.0.113.1'); }catch(e){} });   /* IP cũ trong máy (mạng trước đó) */
    await page.goto('http://localhost:'+PORT+'/'); await page.waitForTimeout(400);
    for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")');
    await page.waitForTimeout(1300);
    await page.click('#h-go'); await page.waitForTimeout(700);
    await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.waitForTimeout(1300);
    S.ipify=o && o.ipifyNew || S.ipify; S.ipifyCalls=0;
    S.t0=Date.now(); await page.click('#cf-go');
    await body(page);
    await ctx.close();
  }
  function pill(page){ return page.evaluate(function(){ var p=document.getElementById('pill'), tx=p.querySelector('.tx'), a=p.querySelector('.act');
    return {on:p.classList.contains('on'), err:p.classList.contains('err'), text:tx?tx.textContent:'', act:a?a.textContent:null, clip:tx?tx.scrollWidth>tx.clientWidth+1:false, scr:state.screen, ci:(CI['Bùi Doãn Quang']||{}).status}; }); }

  /* C1 — iCloud Private Relay: Worker relay, Apps Script cũng chặn */
  await run({width:375,height:667}, {wk:'relay', gas:'deny'}, async function(page){
    await page.waitForTimeout(2200); var p=await pill(page);
    check(p.on && p.err && p.text==='Tắt Giới hạn theo dõi IP ở Wi-Fi phòng' && p.act===null && !p.clip && p.scr==='p-confirm' && p.ci==='fail', 'C1 Private Relay → "'+p.text+'", không nút Thử lại, không cắt chữ ở 375, ở lại màn xác nhận: '+JSON.stringify(p));
    check(S.wkCalls===1 && S.gasCalls===1, 'C1 Worker 1 lần → lùi Apps Script 1 lần: '+[S.wkCalls,S.gasCalls]);
    await page.waitForTimeout(5200); check((await pill(page)).on, 'C1 pill lỗi ở lại ≥ 7 s (không có nút, cần đọc kịp)');
  });
  /* C2 — mạng khác (4G / IP phòng đổi): có nút Thử lại; Thử lại khi đã bắt Wi-Fi phòng → xong */
  await run({width:375,height:667}, {wk:'other', gas:'deny'}, async function(page){
    await page.waitForTimeout(2200); var p=await pill(page);
    check(p.on && p.err && p.text==='Mạng chưa được phép check-in' && p.act==='Thử lại' && !p.clip, 'C2 mạng khác → "'+p.text+'" + Thử lại, không cắt chữ: '+JSON.stringify(p));
    S.wk='ok'; await page.click('#pill .act'); await page.waitForTimeout(1800);
    var q=await pill(page); check(q.scr==='p-plan' && q.ci==='ok', 'C2 Thử lại sau khi bắt Wi-Fi phòng → check-in xong, sang Bài tập hôm nay: '+JSON.stringify(q));
  });
  /* C3 — Worker cũ (không kèm seen) → câu cũ */
  await run({width:393,height:852}, {wk:'old', gas:'deny'}, async function(page){
    await page.waitForTimeout(2200); var p=await pill(page);
    check(p.text==='Chỉ check-in được ở phòng' && p.act==='Thử lại', 'C3 Worker không kèm IP → "Chỉ check-in được ở phòng" + Thử lại: '+p.text);
  });
  /* C4 — Worker chặn (danh sách lệch), Apps Script cho → check-in xong; Apps Script nhận IP MỚI lấy lúc bấm (ipify chậm 600 ms) */
  await run({width:393,height:852}, {wk:'old', gas:'ok', ipifyNew:'203.0.113.60', ipifyMs:600}, async function(page){
    await page.waitForTimeout(2200); var p=await pill(page);
    check(p.scr==='p-plan' && p.ci==='ok', 'C4 Worker chặn → Apps Script ghi được → sang Bài tập hôm nay: '+JSON.stringify(p));
    check(S.ipifyCalls>=1, 'C4 bấm Check-in → lấy lại IP: '+S.ipifyCalls+' lần');
    check(S.gasIps[0]==='203.0.113.60', 'C4 Apps Script nhận IP mới (không phải IP cũ trong máy): '+S.gasIps[0]);
  });
  /* C5 — ipify treo (8 s) → không kẹt: Apps Script vẫn được gọi sau ≤ 2,5 s chờ, gửi IP đang có */
  await run({width:393,height:852}, {wk:'old', gas:'ok', ipifyNew:'203.0.113.70', ipifyMs:8000}, async function(page){
    await page.waitForTimeout(4200); var p=await pill(page);
    check(S.gasCalls===1 && S.gasAt-S.t0 < 3600 && p.ci==='ok', 'C5 ipify treo → vẫn lùi Apps Script sau ~2,5 s ('+(S.gasAt-S.t0)+' ms), check-in xong: '+JSON.stringify([S.gasCalls,p.ci]));
    check(S.gasIps[0]!=='203.0.113.70', 'C5 không chờ ipify treo: gửi IP đang có '+S.gasIps[0]);
  });
  /* C6 — đường thường: Worker cho → không gọi Apps Script, không chờ ipify */
  await run({width:393,height:852}, {wk:'ok', gas:'deny', ipifyMs:3000}, async function(page){
    await page.waitForTimeout(1500); var p=await pill(page);
    check(p.scr==='p-plan' && p.ci==='ok' && S.gasCalls===0, 'C6 Worker cho → xong ngay (< 1,5 s), không gọi Apps Script, không chờ ipify: '+JSON.stringify([p.scr,p.ci,S.gasCalls]));
  });
  check(!errs.length, 'C7 0 pageerror '+JSON.stringify(errs));
  console.log(fail ? 'FAIL '+pass+'/'+(pass+fail) : 'PASS '+pass+'/'+pass);
  await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

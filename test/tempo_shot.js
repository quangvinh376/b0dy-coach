/* Ảnh + số đo TRƯỚC / SAU của màn Tempo cho ca thật: khách còn 8 buổi, hạn 20/11, hôm nay 19/11.
   Chạy trên ?demo rồi tiêm đúng ca đó vào state (không cần mạng).
   TAG=cu  ROOT=/home/claude/coach_base  node test/tempo_shot.js   → ảnh bản cũ
   TAG=moi                               node test/tempo_shot.js   → ảnh bản mới */
var path=require('path'), serve=require('./serve'), chromium=require('playwright').chromium;
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19555, TAG=process.env.TAG||'moi';
(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(); var errs=[];
  page.on('pageerror', function(e){ errs.push(e.message); });
  await page.goto('http://localhost:'+PORT+'/?demo');
  await page.waitForSelector('#p-pin.on'); await page.waitForTimeout(600);
  for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")');
  await page.waitForSelector('#p-home.on'); await page.waitForTimeout(1400);
  var nm=await page.evaluate(function(){
    TODAY_ISO='2026-11-19';
    var c=state.clients[0]; c.left=8; c.exp='2026-11-20'; c.end=''; c.start='2026-06-20'; c.total=48;
    state.stats.w0='2026-09-28';
    state.stats.perClient=state.stats.perClient||{};
    state.stats.perClient[KEY(c)]={m:5, n28:9, n28c:9, w8:[2,3,2,2,3,2,2,1], lastAll:'2026-11-18', last:'2026-11-18'};
    return c.name;
  });
  await page.click('#h-tiles .tile:nth-child(2)');
  await page.waitForSelector('#p-slow.on'); await page.waitForTimeout(900);
  await page.click('#sl-list .row:has-text("'+nm+'")'); await page.waitForTimeout(1000);
  var o=await page.evaluate(function(){
    var r=[].filter.call(document.querySelectorAll('#sl-list .row'), function(e){ return e.classList.contains('open'); })[0], x=r.nextElementSibling;
    return { meta:r.querySelector('.lab').textContent,
             head:(x.querySelector('.wkh .acid')||{textContent:'(không có)'}).textContent,
             bars:[].map.call(x.querySelectorAll('.wkb i'), function(e){ return Math.round(parseFloat(getComputedStyle(e).height)); }),
             need:(function(){ var b=x.querySelector('.wkb .need'); return b?getComputedStyle(b).bottom:'(không có vạch)'; })(),
             kv:[].map.call(x.querySelectorAll('.kv'), function(e){ return e.children[0].textContent+': '+e.children[1].textContent; }) };
  });
  console.log('\n['+TAG+'] khách tiêm: '+nm);
  console.log('['+TAG+'] dòng danh sách: '+o.meta);
  console.log('['+TAG+'] nhãn biểu đồ: '+o.head);
  console.log('['+TAG+'] cao 8 cột (px): '+o.bars.join(' · ')+'   | vạch cần đạt bottom: '+o.need);
  o.kv.forEach(function(s){ console.log('['+TAG+']   '+s); });
  console.log('['+TAG+'] pageerror: '+errs.length+(errs.length?' → '+errs.join(' | '):''));
  await page.screenshot({path: path.join(__dirname, 'tempo_'+TAG+'.png'), clip:{x:0, y:150, width:393, height:620}});
  await ctx.close(); await browser.close(); srv.close();
  process.exit(errs.length?1:0);
})();

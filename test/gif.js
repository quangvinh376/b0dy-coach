/* Quay video vòng lặp set 1:1 (demo) → test/out/loop.webm, rồi ffmpeg → GIF */
var {chromium}=require('playwright'); var serve=require('./serve');
(async function(){
  var srv=await serve(8127), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, hasTouch:true, isMobile:true, recordVideo:{dir:'test/video', size:{width:393,height:852}}});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage();
  await page.goto('http://localhost:8127/?demo');
  for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")'); await page.waitForTimeout(1500);
  await page.click('#h-go'); await page.waitForTimeout(700); await page.click('#pk-list .row:not(.off)'); await page.waitForTimeout(400); await page.click('#pk-go'); await page.waitForTimeout(1600);
  await page.click('#cf-go'); await page.waitForTimeout(900); await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-list .row:nth-of-type(4)'); await page.waitForTimeout(300); await page.click('#lib-go'); await page.waitForTimeout(800);
  await page.click('#pl-go'); await page.waitForTimeout(1400);
  await page.click('#loop-host .c1'); await page.waitForTimeout(1600);
  await page.click('#loop-host .j1'); await page.waitForTimeout(1400);
  await page.evaluate(function(){ state.session.people[0].restTotal=6; saveSession(); LOOPS[0].tick(performance.now()); });
  await page.click('#loop-host .c1'); await page.waitForTimeout(7200);
  await page.click('#loop-host .c1'); await page.waitForTimeout(1200);
  await page.click('#loop-host .g1'); await page.waitForTimeout(900); await page.click('#loop-host .fend'); await page.waitForTimeout(1800);
  await ctx.close(); await browser.close(); srv.close();
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

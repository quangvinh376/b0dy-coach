/* Quay từng khung lúc chuyển vào / ra công cụ (nhánh design-audit §6.7) — ghép contact sheet để soi nháy.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/tools_frames.js */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=19355, OUT=path.join(__dirname,'out_frames');
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
(async function(){
  var srv=await serve(PORT), b=await chromium.launch({executablePath:CHROME});
  var ctx=await b.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200,contentType:'text/css',body:''}); });
  await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200,contentType:'application/json',body:'{"ip":"203.0.113.7"}'}); });
  var p=await ctx.newPage(), err=[]; p.on('pageerror', function(e){ err.push(String(e)); });
  await p.goto('http://localhost:'+PORT+'/?demo');
  await p.waitForFunction(function(){ return state.screen==='p-pin'; }); await p.waitForTimeout(500);
  for(var k of '0000') await p.click('#pin-pad button:has-text("'+k+'")');
  await p.waitForFunction(function(){ return state.screen==='p-home'; }, null, {timeout:9000}); await p.waitForTimeout(1500);
  await p.click('#h-sell'); await p.waitForFunction(function(){ return window.SVX&&SVX._step()==='q1'; }); await p.waitForTimeout(900);

  async function burst(tag, act, n, gap){
    await act(); var shots=[];
    for(var i=0;i<n;i++){ var f=path.join(OUT,tag+'-'+String(i).padStart(2,'0')+'.png');
      await p.screenshot({path:f}); shots.push(f); await p.waitForTimeout(gap); }
    return shots;
  }
  var A=await burst('a-q1-tx', function(){ return p.click('.page.sv.on .sv-nav .svt'); }, 9, 55);
  await p.waitForTimeout(900);
  var B=await burst('b-tx-txw', function(){ return p.click('.page.sv.on .sv-r:has-text("Hết hạn")'); }, 9, 55);
  await p.waitForTimeout(1200);
  var C=await burst('c-txw-tx', function(){ return p.click('.page.sv.on .sv-nav .svc'); }, 9, 55);
  await p.waitForTimeout(900);
  console.log('khung đã quay · pageerror:', err.length);
  await ctx.close(); await b.close(); srv.close();
})();

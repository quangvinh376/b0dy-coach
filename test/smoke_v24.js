/* smoke v2.4: demo, coach + admin, chụp các màn mép cuộn và chế độ Admin */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs');
(async function(){
  var PORT=+process.env.PORT||19241, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[]; page.on('pageerror', function(e){ errs.push(String(e)); }); page.on('console', function(m){ if(m.type()==='error' && !/404/.test(m.text())) errs.push('console: '+m.text()); });
  var OUT=path.join(__dirname,'out_v24'); fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true}); var n=0;
  async function shot(name, w){ await page.waitForTimeout(w||700); await page.screenshot({path:path.join(OUT,(++n<10?'0':'')+n+'-'+name+'.png')}); }
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  await page.goto('http://localhost:'+PORT+'/?demo'); await page.waitForTimeout(600);
  await pin('1234'); await shot('home-coach',1600);
  await page.click('#p-home .nav button[aria-label="Khách hàng"]'); await shot('clients-0',900);
  for(var y of [16,60,220]){ await page.evaluate(function(y){ document.getElementById('cl-list').scrollTop=y; }, y); await shot('clients-'+y,250); }
  await page.evaluate(function(){ var el=document.getElementById('cl-list'); el.scrollTop=el.scrollHeight; }); await shot('clients-end',300);
  console.log('eg r', await page.evaluate(function(){ var l=document.getElementById('cl-list'); return [l._egT.style.getPropertyValue('--r'), l._egB.style.getPropertyValue('--r'), l.scrollTop, l.scrollHeight-l.clientHeight]; }));
  /* admin */
  await page.evaluate(function(){ logout(); }); await page.waitForTimeout(500);
  await pin('0000'); await shot('home-admin',2000);
  console.log('admin home', await page.evaluate(function(){ return [document.getElementById('h-name').textContent, document.getElementById('h-taught').textContent, document.getElementById('h-tiles').innerText.replace(/\n/g,' | '), document.body.className, getComputedStyle(document.querySelector('#p-home .tab-adm')).display]; }));
  await page.click('#p-home .nav button[aria-label="Khách hàng"]'); await shot('admin-clients',900);
  await page.click('#p-clients .nav button[aria-label="Cài đặt"]'); await shot('admin-settings',1500);
  console.log('settings', await page.evaluate(function(){ return document.getElementById('p-admin').innerText.replace(/\n/g,' | '); }));
  console.log('errors', JSON.stringify(errs));
  await ctx.close(); await browser.close(); srv.close();
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

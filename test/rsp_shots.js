/* v2.23.0 — chụp các màn chính ở nhiều cỡ màn (bản ?demo, dữ liệu bịa) để soát bố cục responsive.
   Chạy: node test/rsp_shots.js 820x1180 1180x820 …   (ROOT=<thư mục app> để chụp bản khác; ảnh: test/out_rsp/<nhãn>/<cỡ>/)
   VP=1 → thêm ?vp=1 (chế độ phóng theo màn). Mỗi cỡ in: tràn ngang / phần tử ra ngoài khung / PAGEERR. */
var {chromium}=require('playwright'), fs=require('fs'), path=require('path'), http=require('http');
var ROOT=process.env.ROOT||path.join(__dirname,'..'), LABEL=process.env.LABEL||'new', QS=process.env.VP?'&vp='+process.env.VP:'';
var MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
function serve(port){ return new Promise(function(res){ var s=http.createServer(function(q,r){ var u=decodeURIComponent(q.url.split('?')[0]); if(u==='/') u='/index.html'; var f=path.join(ROOT,u);
  fs.readFile(f,function(e,b){ if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); r.end(b); }); }); s.listen(port,function(){ res(s); }); }); }
(async function(){
  var sizes=process.argv.slice(2); if(!sizes.length) sizes=['820x1180'];
  var PORT=+process.env.PORT||8155, srv=await serve(PORT), browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var bad=0;
  for(var sz of sizes){
    var w=+sz.split('x')[0], h=+sz.split('x')[1], dir=path.join(__dirname,'out_rsp',LABEL,sz); fs.mkdirSync(dir,{recursive:true});
    var ctx=await browser.newContext({viewport:{width:w,height:h}, deviceScaleFactor:1, hasTouch:process.env.MOBILE!=='0', isMobile:process.env.MOBILE!=='0'});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    var page=await ctx.newPage(), errs=[], n=0, notes=[]; page.on('pageerror', function(e){ errs.push(String(e).slice(0,160)); });
    async function shot(name, wait){ await page.waitForTimeout(wait==null?900:wait); n++; await page.screenshot({path:path.join(dir,(n<10?'0':'')+n+'-'+name+'.png')});
      var o=await page.evaluate(function(){ var b=document.body.getBoundingClientRect(), out=[], vw=innerWidth, vh=innerHeight;
        if(document.documentElement.scrollWidth>vw+1) out.push('html tràn ngang '+document.documentElement.scrollWidth+'>'+vw);
        var pg=document.querySelector('.page.on:not(.leave-fwd):not(.leave-back)'); if(!pg) return out;
        [].forEach.call(pg.querySelectorAll('.nav, .nav > *, .head, .card, .tile, .row, .cta, .ghost, .lines, .search'), function(e){ var c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0) return; var r=e.getBoundingClientRect(); if(!r.width||!r.height) return;
          if(r.left<b.left-1||r.right>b.right+1) out.push((e.id||e.className).toString().slice(0,24)+' ra ngoài khung ngang '+Math.round(r.left)+'..'+Math.round(r.right)+' (khung '+Math.round(b.left)+'..'+Math.round(b.right)+')');
          if(/nav|cta|ghost/.test(e.className) && e.closest('.nav') && (r.bottom>b.bottom+1||r.top<b.top-1)) out.push((e.id||e.className).toString().slice(0,24)+' ra ngoài khung dọc '+Math.round(r.top)+'..'+Math.round(r.bottom)); });
        return out.slice(0,4); });
      if(o.length){ notes.push(name+': '+o.join(' · ')); } }
    var tap=function(sel){ return page.click(sel, {timeout:4000}).catch(function(e){ notes.push('KHÔNG BẤM ĐƯỢC '+sel); }); };
    await page.goto('http://localhost:'+PORT+'/?demo'+QS); await shot('pin',900);
    for(var k of '1111') await tap('#pin-pad button:has-text("'+k+'")');
    await shot('home',1800);
    await tap('#h-tiles .tile:nth-child(1)'); await shot('clients',1000);
    await tap('#cl-list .row:nth-of-type(1)'); await shot('profile',1300);
    await page.evaluate(function(){ go('p-measure','fwd'); }); await shot('measure',1000);
    await page.evaluate(function(){ go('p-measure-new','fwd'); }); await shot('measure-new',1000);
    await page.evaluate(function(){ go('p-target','fwd'); }); await shot('target',1000);
    await page.evaluate(function(){ go('p-perf','fwd'); }); await shot('perf',1000);
    await page.evaluate(function(){ go('p-home','back'); }); await page.waitForTimeout(700);
    await tap('#h-tiles .tile:nth-child(2)'); await shot('tempo',1000);
    await page.evaluate(function(){ go('p-home','back'); }); await page.waitForTimeout(700);
    await tap('#h-tiles .tile:nth-child(4)'); await shot('hoa-hong',1000);
    await page.evaluate(function(){ go('p-home','back'); }); await page.waitForTimeout(700);
    await tap('#h-tiles .tile:nth-child(3)'); await shot('khach-hom-nay',1000);
    await page.evaluate(function(){ if(typeof closeClientSheet==='function') closeClientSheet(); go('p-home','back'); }); await page.waitForTimeout(700);
    await tap('#h-go'); await shot('pick',900);
    await page.evaluate(function(){ var r=document.querySelectorAll('#pk-list .row.duo:not(.off)'); if(r[0]) r[0].click(); if(r[1]) r[1].click(); }); await page.waitForTimeout(400);
    await tap('#pk-go'); await shot('confirm-2',1500);
    await tap('#p-confirm .nsb'); await shot('noshow-sheet-2',800);
    await page.evaluate(function(){ nsClose(); }); await page.waitForTimeout(500);
    await tap('#cf-go'); await page.waitForTimeout(1600); await shot('plan-lib',600);
    await page.evaluate(function(){ var r=document.querySelectorAll('#lib-list .row'); if(r[0]) r[0].click(); if(r[1]) r[1].click(); }); await page.waitForTimeout(300);
    await page.evaluate(function(){ closeLib(); }); await shot('plan',900);
    await tap('#pl-go'); await shot('loop2-setup',1500);
    await page.evaluate(function(){ var c=document.querySelectorAll('#loop-host .lp .c1'); if(c[0]) c[0].click(); }); await shot('loop2-active',1000);
    await page.evaluate(function(){ var c=document.querySelectorAll('#loop-host .lp .j1'); if(c[0]) c[0].click(); }); await page.waitForTimeout(600);
    await page.evaluate(function(){ var c=document.querySelectorAll('#loop-host .lp .c1'); if(c[0]) c[0].click(); }); await shot('loop2-rest',1500);
    /* buổi 1:1: xoá buổi dở, vào lại */
    await page.evaluate(function(){ localStorage.removeItem('lb_session'); state.session=null; sessionStorage.removeItem('demo_ci'); localStorage.removeItem('lb_ci'); }); await page.reload(); await page.waitForTimeout(1500);
    if(await page.evaluate(function(){ return state.screen==='p-pin'; })){ for(var k of '1111') await tap('#pin-pad button:has-text("'+k+'")'); await page.waitForTimeout(1500); }
    await tap('#h-go'); await page.waitForTimeout(700);
    await tap('#pk-list .row:not(.duo):not(.off)'); await shot('confirm-1',1500);
    await tap('#cf-ns'); await shot('noshow-sheet-1',800);
    await page.evaluate(function(){ nsClose(); }); await page.waitForTimeout(500);
    await tap('#cf-go'); await page.waitForTimeout(1600);
    await page.evaluate(function(){ var r=document.querySelectorAll('#lib-list .row'); if(r[0]) r[0].click(); if(r[1]) r[1].click(); }); await page.waitForTimeout(300);
    await page.evaluate(function(){ closeLib(); }); await page.waitForTimeout(700);
    await tap('#pl-go'); await shot('loop1-setup',1500);
    await tap('#loop-host .c1'); await shot('loop1-active',1000);
    await tap('#loop-host .j1'); await shot('loop1-rest-setup',1000);
    await tap('#loop-host .c1'); await shot('loop1-rest',1500);
    await tap('#loop-host .c1'); await shot('loop1-menu',900);
    await page.evaluate(function(){ var b=document.querySelector('#loop-host .film .fend, #loop-host .film button:last-child'); if(b) b.click(); }); await shot('summary',1500);
    var vp=await page.evaluate(function(){ var b=document.body.getBoundingClientRect(); return (window.__vp?JSON.stringify(window.__vp.get()):'-')+' body '+Math.round(b.left)+','+Math.round(b.top)+' '+Math.round(b.width)+'×'+Math.round(b.height)+' vv '+(window.visualViewport?Math.round(visualViewport.width)+'×'+Math.round(visualViewport.height)+'@'+visualViewport.scale.toFixed(3):'-'); });
    console.log('   vp '+vp);
    console.log(sz+' ['+LABEL+(QS?' vp':'')+'] ảnh '+n+' · PAGEERR '+errs.length+(errs.length?' '+JSON.stringify(errs.slice(0,2)):'')+(notes.length?'\n   - '+notes.join('\n   - '):''));
    bad+=errs.length;
    await ctx.close();
  }
  await browser.close(); srv.close(); process.exit(bad?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

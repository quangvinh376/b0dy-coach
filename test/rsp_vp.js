/* v2.23.0 — bộ phóng theo màn (thẻ viewport) + cột giữa ở màn rộng. Chromium giả lập máy di động (tôn trọng thẻ viewport), bản ?demo.
   Kiểm với từng cỡ máy: hệ số phóng, cỡ trang app thấy, body (cột) nằm đâu, nav đáy nằm trọn trong màn, không tràn ngang;
   xoay máy lúc đang chạy; ?vp=0 tắt; máy tính để bàn (bỏ qua thẻ viewport) → tự trả về + cột giữa; điện thoại không đổi gì.
   Chạy: node test/rsp_vp.js */
var {chromium}=require('playwright'), fs=require('fs'), path=require('path'), http=require('http');
var ROOT=process.env.ROOT||path.join(__dirname,'..');
var MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
function serve(port){ return new Promise(function(res){ var s=http.createServer(function(q,r){ var u=decodeURIComponent(q.url.split('?')[0]); if(u==='/') u='/index.html'; var f=path.join(ROOT,u);
  fs.readFile(f,function(e,b){ if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); r.end(b); }); }); s.listen(port,function(){ res(s); }); }); }
var pass=0, fail=0; function ck(ok,msg,x){ if(ok) pass++; else fail++; console.log((ok?'  ok   ':'  FAIL ')+msg+(ok||x===undefined?'':'  -> '+JSON.stringify(x).slice(0,400))); }
function near(a,b,t){ return Math.abs(a-b)<=(t==null?1.5:t); }
(async function(){
  var PORT=+process.env.PORT||8157, srv=await serve(PORT), browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}), errs=[];
  async function open(w,h,o){ o=o||{}; var ctx=await browser.newContext({viewport:{width:w,height:h}, deviceScaleFactor:o.dpr||2, hasTouch:o.mobile!==false, isMobile:o.mobile!==false});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    var page=await ctx.newPage(); page.on('pageerror', function(e){ errs.push(String(e).slice(0,160)); });
    await page.goto('http://localhost:'+PORT+'/?demo'+(o.qs||'')); await page.waitForTimeout(700);
    for(var k of '1111') await page.click('#pin-pad button:has-text("'+k+'")'); await page.waitForTimeout(1500);
    return {ctx:ctx, page:page}; }
  var M=function(page){ return page.evaluate(function(){ var pgE=document.querySelector('.page.on:not(.leave-fwd):not(.leave-back)'), b=pgE.getBoundingClientRect(), bd=document.body.getBoundingClientRect(), n=pgE.querySelector('.nav'), nr=n&&n.getBoundingClientRect(), vv=window.visualViewport, g=window.__vp.get();
    return {s:g.s, dead:g.dead, off:g.off, iw:innerWidth, ih:innerHeight, bx:Math.round(b.left), by:Math.round(b.top), bw:Math.round(b.width), bh:Math.round(b.height), navB:nr?Math.round(nr.bottom):0, navL:nr?Math.round(nr.left):0, navR:nr?Math.round(nr.right):0,
      bodyW:Math.round(bd.width), bodyX:Math.round(bd.left), vvw:vv?Math.round(vv.width):0, vvh:vv?Math.round(vv.height):0, sw:document.documentElement.scrollWidth, vps:window.__vps, cls:document.documentElement.classList.contains('vp'), meta:document.querySelector('meta[name=viewport]').getAttribute('content').split(',')[0]}; }); };
  var a, m;
  console.log('\n== điện thoại: không phóng, không cột ==');
  for(var sz of [[320,568],[375,667],[393,852],[430,932],[852,393]]){ a=await open(sz[0],sz[1]); m=await M(a.page);
    ck(m.s===1 && !m.cls && m.meta==='width=device-width' && m.iw===sz[0] && m.ih===sz[1] && (sz[0]>600 || (m.bx===0 && m.bw===sz[0] && m.bh===sz[1])), sz.join('×')+' điện thoại: s 1, thẻ viewport gốc, body phủ kín'+(sz[0]>600?' (máy nằm ngang: cột giữa)':''), m); await a.ctx.close(); }
  console.log('\n== iPad / tablet màn dọc: phóng kín bề ngang ==');
  for(var sz of [[744,1133],[768,1024],[810,1080],[820,1180],[834,1194],[1024,1366],[800,1280]]){ a=await open(sz[0],sz[1]); m=await M(a.page);
    ck(m.s>1.3 && m.cls && near(m.iw*m.s,sz[0],3) && near(m.ih*m.s,sz[1],3) && m.iw>=500 && m.iw<=600 && m.ih>=690 && m.bx===0 && m.bw===m.iw && m.bh===m.ih && near(m.navB,m.ih-28) && m.navL===12 && m.navR===m.iw-12 && m.sw<=m.iw && near(m.vvw,m.iw,1) && near(m.vvh,m.ih,2) && !m.dead,
      sz.join('×')+' → ×'+m.s+' · app thấy '+m.iw+'×'+m.ih+' · kín màn, nav cách đáy 28', m); await a.ctx.close(); }
  console.log('\n== iPad / tablet màn ngang: phóng theo chiều cao, cột 600 đứng giữa ==');
  for(var sz of [[1133,744],[1024,768],[1180,820],[1194,834],[1366,1024],[1280,800]]){ a=await open(sz[0],sz[1]); m=await M(a.page);
    ck((sz[1]/720>1.04 ? (m.s>1.04 && near(m.ih,720,3)) : (m.s===1 && m.ih===sz[1])) && m.bodyX===0 && m.bodyW===m.iw && m.bw===600 && near(m.bx,(m.iw-600)/2,1) && m.by===0 && m.bh===m.ih && near(m.navB,m.ih-28) && m.navL===m.bx+12 && m.navR===m.bx+588 && m.sw<=m.iw && near(m.vvw,m.iw,1) && !m.dead,
      sz.join('×')+' → ×'+m.s+' · app thấy '+m.iw+'×'+m.ih+' · cột 600 ở x '+m.bx, m); await a.ctx.close(); }
  console.log('\n== cửa sổ chia đôi / lửng (iPad Split View, Slide Over) ==');
  for(var sz of [[320,1180],[375,1000],[507,1180],[590,820],[678,1024],[781,820],[608,800]]){ a=await open(sz[0],sz[1]); m=await M(a.page);
    var ok= Math.min(sz[0],sz[1])<600 ? (m.s===1 && m.bw===sz[0]) : (m.bw===Math.min(m.iw,600) && near(m.bx,(m.iw-m.bw)/2,1) && (m.bx===0 || m.bx>=20));
    ck(ok && m.sw<=m.iw && near(m.navB,m.by+m.bh-28) && m.ih>=560, sz.join('×')+' → ×'+m.s+' · app thấy '+m.iw+'×'+m.ih+' · body '+m.bw+' ở x '+m.bx, m); await a.ctx.close(); }
  console.log('\n== xoay máy lúc đang chạy ==');
  a=await open(820,1180); await a.page.click('#h-go'); await a.page.waitForTimeout(600);
  await a.page.setViewportSize({width:1180,height:820}); await a.page.waitForTimeout(1200); m=await M(a.page);
  ck(near(m.ih,720,3) && m.bw===600 && near(m.bx,(m.iw-600)/2,1) && near(m.navB,m.ih-28) && near(m.iw*m.s,1180,3), 'dọc → ngang: tính lại (×'+m.s+', '+m.iw+'×'+m.ih+'), cột giữa, nav trong màn', m);
  ck(await a.page.evaluate(function(){ return state.screen==='p-pick' && document.querySelectorAll('#pk-list .row').length>0; }), 'vẫn ở màn Chọn khách, danh sách còn nguyên');
  await a.page.setViewportSize({width:820,height:1180}); await a.page.waitForTimeout(1200); m=await M(a.page);
  ck(m.s>1.5 && m.bx===0 && m.bw===m.iw && near(m.navB,m.ih-28) && near(m.iw*m.s,820,3), 'ngang → dọc: về ×'+m.s+' kín màn', m);
  for(var i=0;i<4;i++){ await a.page.setViewportSize(i%2?{width:820,height:1180}:{width:1180,height:820}); await a.page.waitForTimeout(160); }
  await a.page.waitForTimeout(1200); m=await M(a.page);
  ck(m.s>1.5 && !m.dead && m.bw===m.iw && near(m.iw*m.s,820,3), 'xoay nhanh 4 lần → dừng ở dọc, hệ số đúng (không kẹt, không lặp, không tự tắt)', m);
  for(var i=0;i<7;i++){ await a.page.setViewportSize(i%2?{width:820,height:1180}:{width:1180,height:820}); await a.page.waitForTimeout(i%3?330:90); }
  await a.page.waitForTimeout(1300); m=await M(a.page);
  ck(!m.dead && near(m.ih,720,3) && m.bw===600 && near(m.iw*m.s,1180,3) && near(m.navB,m.ih-28), 'xoay 7 lần nhịp lệch (rơi đúng lúc tự kiểm) → dừng ở ngang, hệ số đúng, không tự tắt', m);
  await a.ctx.close();
  console.log('\n== tắt / bật trên một máy (?vp=0 · ?vp=1) ==');
  a=await open(820,1180,{qs:'&vp=0'}); m=await M(a.page);
  ck(m.s===1 && m.off && m.iw===820 && m.bw===600 && m.bx===110 && m.bh===1180 && m.by===0, '?vp=0: không phóng; cột 600 đứng giữa màn 820 × 1180', m);
  await a.page.goto('http://localhost:'+PORT+'/?demo'); await a.page.waitForTimeout(900); m=await M(a.page);
  ck(m.s===1 && m.off, 'mở lại không tham số: vẫn tắt (nhớ trên máy)', m);
  await a.page.goto('http://localhost:'+PORT+'/?demo&vp=1'); await a.page.waitForTimeout(900); m=await M(a.page);
  ck(m.s>1.5 && !m.off, '?vp=1: bật lại', m); await a.ctx.close();
  console.log('\n== máy tính để bàn (trình duyệt bỏ qua thẻ viewport) ==');
  for(var sz of [[1440,900],[1920,1080],[1024,700],[700,1100]]){ a=await open(sz[0],sz[1],{mobile:false,dpr:1}); await a.page.waitForTimeout(900); m=await M(a.page);
    ck(m.s===1 && (m.dead || sz[1]<707) && !m.cls && m.meta==='width=device-width' && m.iw===sz[0] && m.bw===600 && near(m.bx,(sz[0]-600)/2,1) && m.bh===sz[1] && m.bodyW===sz[0] && near(m.navB,sz[1]-28) && m.vps===1,
      sz.join('×')+' máy tính: thử phóng → trình duyệt bỏ qua → tự trả về, cột 600 đứng giữa', m); await a.ctx.close(); }
  console.log('\n== màn rộng: cửa sổ / lớp mờ / vạch bận / luồng Bán theo cột ==');
  a=await open(1440,900,{mobile:false,dpr:1}); await a.page.waitForTimeout(500);
  await a.page.click('#h-tiles .tile:nth-child(3)'); await a.page.waitForTimeout(700);
  m=await a.page.evaluate(function(){ var r=function(id){ var b=document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left),Math.round(b.width)]; }; return {sheet:r('csheet'), dim:r('cs-dim'), busy:r('busy'), pill:(function(){ var p=document.getElementById('pill'); return getComputedStyle(p).left; })()}; });
  ck(m.sheet.join()==='420,600' && m.dim.join()==='0,1440' && m.busy.join()==='420,600', 'cửa sổ khách + vạch bận trong cột (420, rộng 600); lớp mờ phủ cả màn', m);
  await a.page.mouse.click(100, 450); await a.page.waitForTimeout(600);
  ck(await a.page.evaluate(function(){ return !document.getElementById('csheet').classList.contains('on'); }), 'chạm lớp mờ NGOÀI cột → đóng cửa sổ');
  await a.page.click('#h-sell'); await a.page.waitForTimeout(1900);
  m=await a.page.evaluate(function(){ var cv=document.getElementById('sv-dial'), k=cv.width/cv.getBoundingClientRect().width, d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data, sx=0, n=0, lo=1e9, hi=-1;
    for(var y=0;y<cv.height;y+=2) for(var x=0;x<cv.width;x++){ var i=(y*cv.width+x)*4; if(d[i+3]>40){ sx+=x; n++; if(x<lo) lo=x; if(x>hi) hi=x; } }
    var pg=document.querySelector('.page.sv.on').getBoundingClientRect(); return {n:n, mid:n?Math.round((lo+hi)/2/k):0, lo:Math.round(lo/k), hi:Math.round(hi/k), col:Math.round(pg.left+pg.width/2), cvW:Math.round(cv.getBoundingClientRect().width)}; });
  ck(m.n>50 && near(m.mid,m.col,6) && m.lo>=420 && m.hi<=1020 && m.cvW===1440, 'luồng Bán: vành hạt vẽ trên canvas toàn màn nằm đúng giữa cột (tâm '+m.mid+' ≈ '+m.col+'), không ra ngoài cột', m);
  await a.ctx.close();
  console.log('\n== tên bay (heroFly) khi trang là cột giữa ==');
  a=await open(1440,900,{mobile:false,dpr:1}); await a.page.waitForTimeout(500);
  await a.page.click('#h-tiles .tile:nth-child(1)'); await a.page.waitForTimeout(900);
  var src=await a.page.evaluate(function(){ var e=document.querySelector('#cl-list .row .nm'); var r=document.createRange(); var n=e.firstChild; while(n && n.nodeType!==3) n=n.firstChild; var full=n.nodeValue, keep=full.trim().split(/\s+/).slice(-2).join(' '), i=full.lastIndexOf(keep); r.setStart(n,i); r.setEnd(n,i+keep.length); var b=r.getBoundingClientRect(); return {x:b.left, y:b.top+b.height/2}; });
  await a.page.evaluate(function(){ window.__mot && window.__mot.hold && window.__mot.hold(true); document.querySelector('#cl-list .row').click(); });
  var fl=await a.page.evaluate(function(){ var f=document.querySelector('.herofly'); if(!f) return null; var b=f.getBoundingClientRect(); return {x:b.left, y:b.top+b.height/2}; });
  ck(fl && near(fl.x,src.x,2.5) && near(fl.y,src.y,4), 'khung đầu: chữ bay đè đúng chữ nguồn (lệch ≤ 2,5 px) dù body cách mép trái 420', [src, fl]);
  await a.page.evaluate(function(){ window.__mot && window.__mot.hold && window.__mot.hold(false); }); await a.page.waitForTimeout(900);
  await a.ctx.close();
  console.log('\nPAGEERR', JSON.stringify(errs)); ck(errs.length===0, '0 PAGEERR');
  console.log('\n'+pass+' PASS, '+fail+' FAIL'); await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

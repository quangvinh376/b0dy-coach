/* Hồi quy bố cục v2.4 (mép cuộn iOS) so với bản đang chạy (v2.3.4):
   lúc NGHỈ mọi thứ phải nằm y chỗ cũ — phần tử đầu danh sách (scrollTop 0), phần tử cuối khi cuộn hết, quãng cuộn tối đa,
   khối đỉnh / ô tìm / nav / foot. Khác biệt duy nhất được phép: danh sách giờ phủ kín khung (trôi dưới đỉnh + nav).
   Chạy: BASE=/home/claude/coach_base NODE_PATH=/opt/node22/lib/node_modules node test/edge_regress.js */
var {chromium}=require('playwright'); var path=require('path'); var fs=require('fs');
var BASE=process.env.BASE||'/home/claude/coach_base', NEW=path.resolve(__dirname,'..');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var serveNew=require('./serve'), serveBase=require(path.join(BASE,'test','serve'));
var TOL=1;

async function measure(root, port, vp){
  var browser=await chromium.launch({executablePath:CHROME});
  var ctx=await browser.newContext({viewport:vp, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[]; page.on('pageerror', function(e){ errs.push(String(e)); });
  var out={};
  async function w(ms){ await page.waitForTimeout(ms); }
  async function screen(id){ await page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:8000}); }
  async function snap(key, listSel, frameSel){
    await w(1300);
    out[key]=await page.evaluate(function(a){
      function R(e){ if(!e) return null; var r=e.getBoundingClientRect(); return {y:Math.round(r.top*10)/10, b:Math.round(r.bottom*10)/10, x:Math.round(r.left*10)/10, r:Math.round(r.right*10)/10}; }
      var L=document.querySelector(a.l), F=document.querySelector(a.f); if(!L) return {missing:a.l};
      var kids=function(){ return [].filter.call(L.children, function(c){ return c.getBoundingClientRect().height>0; }); };
      L.scrollTop=0; var k=kids(), first=R(k[0]), firstX=R(k[0]);
      var max=L.scrollHeight-L.clientHeight; L.scrollTop=max+1000; var k2=kids(), last=R(k2[k2.length-1]); var maxReal=L.scrollTop; L.scrollTop=0;
      var bar=F.querySelector(':scope>.nav, :scope>.foot'), head=F.querySelector(':scope>.head'), srch=F.querySelector('.search');
      return {first:first, last:last, max:Math.round(maxReal), head:R(head), bar:R(bar), search:R(srch), list:R(L), frame:R(F), n:k.length};
    }, {l:listSel, f:frameSel});
  }
  await page.goto('http://localhost:'+port+'/?demo'); await w(700);
  for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")');
  await screen('p-home'); await w(1500);
  out.home=await page.evaluate(function(){ function R(s){ var e=document.querySelector(s); if(!e) return null; var r=e.getBoundingClientRect(); return [Math.round(r.top),Math.round(r.bottom),Math.round(r.left),Math.round(r.right)]; }
    return {head:R('#p-home>.head'), tiles:R('#h-tiles'), nav:R('#p-home>.nav'), bars:R('#h-bars')}; });
  /* khách hàng → hồ sơ → đo lường → hiệu suất */
  await page.click('#p-home .nav .ghost:nth-child(2)'); await screen('p-clients'); await snap('clients', '#cl-list', '#p-clients');
  await page.click('#cl-list .row:has-text("Doãn Quang")'); await screen('p-profile'); await snap('profile', '#pf-scroll', '#p-profile');
  await page.click('button.row:has-text("Đo lường")'); await screen('p-measure'); await snap('measure', '#ms-list', '#p-measure');
  await page.click('#p-measure .nav .ghost'); await screen('p-profile'); await w(500);
  await page.click('button.row:has-text("Hiệu suất tập")'); await screen('p-perf'); await snap('perf', '#pe-list', '#p-perf');
  await page.click('#p-perf .nav .ghost'); await screen('p-profile'); await w(400);
  await page.click('#p-profile .nav .ghost'); await screen('p-clients'); await w(400);
  await page.click('#p-clients .nav .ghost:nth-child(1)'); await screen('p-home'); await w(900);
  /* window khách tập chậm */
  await page.click('#h-tiles .tile:nth-child(2)'); await page.waitForSelector('#csheet.on'); await snap('csheet', '#cs-list', '#csheet');
  await page.click('#cs-go'); await w(600);
  /* chọn khách → xác nhận → check-in → bài tập hôm nay (window thư viện) → lưới bài */
  await page.click('#h-go'); await screen('p-pick'); await snap('pick', '#pk-list', '#p-pick');
  await page.click('#pk-list .row:has-text("Thành Công")'); await screen('p-confirm'); await w(1500);
  await page.click('#cf-go'); await screen('p-plan'); await page.waitForSelector('#lib.on'); await snap('lib', '#lib-list', '#lib');
  for(var i of [1,2,4,6,8,10]) await page.click('#lib-list .row:nth-of-type('+i+')');
  await page.click('#lib-go'); await w(600); await snap('plan', '#pl-scroll', '#p-plan');
  await ctx.close(); await browser.close();
  out._errs=errs; return out;
}

(async function(){
  var fails=[], rows=[];
  for(var vp of [{width:393,height:852},{width:375,height:667},{width:430,height:932}]){
    var sb=await serveBase(19301), sn=await serveNew(19302);
    var a=await measure(BASE, 19301, vp), b=await measure(NEW, 19302, vp);
    sb.close(); sn.close();
    var tag=vp.width+'×'+vp.height;
    if(a._errs.length) fails.push(tag+' base pageerror: '+a._errs.join(' | '));
    if(b._errs.length) fails.push(tag+' v2.4 pageerror: '+b._errs.join(' | '));
    function cmp(k, f, g, lab){ var x=f(a[k]), y=f(b[k]); var ok=(x==null&&y==null) || (x!=null&&y!=null&&Math.abs(x-y)<=TOL);
      rows.push((ok?'  ok ':'  XX ')+tag+' '+k+' '+lab+': '+x+' → '+y); if(!ok) fails.push(tag+' '+k+' '+lab+': '+x+' → '+y); }
    ['home'].forEach(function(k){ ['head','tiles','nav','bars'].forEach(function(p){ [0,1,2,3].forEach(function(i){ cmp(k, function(o){ return o[p]&&o[p][i]; }, null, p+'['+i+']'); }); }); });
    ['clients','profile','measure','perf','csheet','pick','lib','plan'].forEach(function(k){
      if(a[k]&&a[k].missing || b[k]&&b[k].missing){ fails.push(tag+' '+k+' thiếu '+(a[k].missing||b[k].missing)); return; }
      cmp(k, function(o){ return o.first&&o.first.y; }, null, 'đầu danh sách y');
      cmp(k, function(o){ return o.first&&o.first.x; }, null, 'đầu danh sách x');
      cmp(k, function(o){ return o.first&&o.first.r; }, null, 'đầu danh sách phải');
      cmp(k, function(o){ return o.last&&o.last.b; }, null, 'cuối danh sách (cuộn hết) đáy');
      cmp(k, function(o){ return o.max; }, null, 'quãng cuộn tối đa');
      cmp(k, function(o){ return o.head&&o.head.y; }, null, 'khối đỉnh y');
      cmp(k, function(o){ return o.search&&o.search.b; }, null, 'ô tìm đáy');
      cmp(k, function(o){ return o.bar&&o.bar.y; }, null, 'nav/foot y');
      cmp(k, function(o){ return o.bar&&o.bar.b; }, null, 'nav/foot đáy');
      cmp(k, function(o){ return o.n; }, null, 'số phần tử');
      /* v2.4: danh sách phủ kín khung */
      var L=b[k].list, F=b[k].frame, cover=Math.abs(L.y-F.y)<=TOL && Math.abs(L.b-F.b)<=TOL && Math.abs(L.x-F.x)<=TOL && Math.abs(L.r-F.r)<=TOL;
      rows.push((cover?'  ok ':'  XX ')+tag+' '+k+' v2.4 danh sách phủ kín khung: '+JSON.stringify(L)+' / '+JSON.stringify(F)); if(!cover) fails.push(tag+' '+k+' danh sách chưa phủ kín khung');
    });
  }
  console.log(rows.join('\n'));
  console.log(fails.length ? '\nFAIL '+fails.length+'\n - '+fails.join('\n - ') : '\nPASS hồi quy bố cục: '+rows.length+' phép so');
  process.exit(fails.length?1:0);
})().catch(function(e){ console.error('EXC', e); process.exit(2); });

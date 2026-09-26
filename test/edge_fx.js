/* v2.4 — hiệu ứng mép cuộn iOS + tràn kín màn hình (demo, Chromium).
   E1 dải chuyển --r theo vị trí cuộn (đỉnh 0→32, đáy 48→0) · E2 lớp mép phủ đúng vùng, blur 3 tầng, không opacity < 1 ở tổ tiên
   E3 thứ tự lớp + chạm: nav/đỉnh/ô tìm nằm trên danh sách; lớp mép không ăn chạm · E4 sheet thư viện
   E5 --top: trình duyệt 56 · bản cài cũ (standalone, inset 0) → sb-legacy 2px · inset 47/59/62 → 56/56/59
   E6 màn nghỉ Acid: --bg = Acid (html/body cùng màu), mực phủ kín → về Ink · E7 fog cũ vẫn chạy ở vùng cuộn không .ex
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/edge_fx.js */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19331, OUT=path.join(__dirname,'out_edge');
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
function near(a,b,t){ return Math.abs(a-b)<=(t==null?1:t); }
async function run(id, name, fn){ CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  async function mk(vp, init){
    var ctx=await browser.newContext({viewport:vp||{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    if(init) await ctx.addInitScript(init);
    var page=await ctx.newPage(); page.on('pageerror', function(e){ PAGEERR.push(String(e)); }); return {ctx:ctx, page:page};
  }
  var C=await mk(), page=C.page;
  var w=function(ms){ return page.waitForTimeout(ms); }, ev=function(fn,a){ return page.evaluate(fn,a); };
  var screen=function(id){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:8000}); };
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  async function scrollTo(sel, y){ await ev(function(a){ var l=document.querySelector(a.s); l.scrollTop=(a.y==='max'?l.scrollHeight:a.y); }, {s:sel, y:y}); await w(120); }
  function egState(sel){ return ev(function(s){ var l=document.querySelector(s), C=l.parentNode, t=C.querySelector(':scope>.eg.t'), b=C.querySelector(':scope>.eg.b');
    var cs=getComputedStyle(C); return {st:Math.round(l.scrollTop), max:l.scrollHeight-l.clientHeight, rt:t.style.getPropertyValue('--r'), rb:b.style.getPropertyValue('--r'),
      th:Math.round(t.getBoundingClientRect().height), bh:Math.round(b.getBoundingClientRect().height), tz:parseFloat(cs.getPropertyValue('--tz')), bz:parseFloat(cs.getPropertyValue('--bz')),
      tt:Math.round(t.getBoundingClientRect().top), bb:Math.round(b.getBoundingClientRect().bottom)}; }, sel); }

  await page.goto('http://localhost:'+PORT+'/?demo'); await screen('p-pin'); await w(500);
  await pin('1234'); await screen('p-home'); await w(1500);
  await page.click('#p-home .nav button[aria-label="Khách hàng"]'); await screen('p-clients'); await w(1100);

  await run('E1', 'Khách hàng: dải chuyển --r co theo vị trí cuộn (đầu 0 → 32 · cuối 48 → 0)', async function(){
    var s=await egState('#cl-list'); check(s.max>30, 'có quãng cuộn: '+s.max);
    check(s.rt==='0px' && s.rb===Math.min(48,s.max)+'px', 'đầu danh sách: '+JSON.stringify(s));
    await scrollTo('#cl-list', 16); s=await egState('#cl-list'); check(s.rt==='16px' && s.rb===Math.min(48,s.max-16)+'px', 'cuộn 16: '+s.rt+' / '+s.rb);
    await scrollTo('#cl-list', 40); s=await egState('#cl-list'); check(s.rt==='32px' && s.rb===Math.min(48,s.max-40)+'px', 'cuộn 40: '+s.rt+' / '+s.rb);
    await page.screenshot({path:path.join(OUT,'e1-clients-40.png')});
    await scrollTo('#cl-list', 'max'); s=await egState('#cl-list'); check(s.rt==='32px' && s.rb==='0px', 'cuối danh sách: '+s.rt+' / '+s.rb);
    await page.screenshot({path:path.join(OUT,'e1-clients-end.png')});
    check(s.th===s.tz+32 && s.bh===s.bz+0, 'cao lớp mép = vùng + dải: '+JSON.stringify(s));
    check(s.tt===0 && s.bb===852, 'lớp mép chạm mép màn hình trên/dưới: '+s.tt+' / '+s.bb);
    await scrollTo('#cl-list', 0);
  });

  await run('E2', 'Lớp mép: blur 3 tầng 1,5/4/10px, lớp tối, không opacity < 1 ở lớp/tổ tiên, không ăn chạm', async function(){
    var r=await ev(function(){ var C=document.getElementById('cl-list').parentNode, g=C.querySelector(':scope>.eg.b');
      var bf=[].map.call(g.children, function(i){ var cs=getComputedStyle(i); return (cs.backdropFilter||cs.webkitBackdropFilter||'')+'|'+cs.maskImage.slice(0,15); });
      var op=[], e=g; while(e && e!==document.documentElement){ var o=+getComputedStyle(e).opacity; if(o<1) op.push((e.id||e.className)+':'+o); e=e.parentElement; }
      [].forEach.call(g.children, function(i){ var o=+getComputedStyle(i).opacity; if(o<1) op.push('child:'+o); });
      return {bf:bf, op:op, pe:getComputedStyle(g).pointerEvents, z:getComputedStyle(g).zIndex, bg:getComputedStyle(g.querySelector('.d')).backgroundImage.slice(0,40)}; });
    check(/blur\(1\.5px\)/.test(r.bf[1]) && /blur\(4px\)/.test(r.bf[2]) && /blur\(10px\)/.test(r.bf[3]), 'blur: '+r.bf.join(' ; '));
    check(/gradient/.test(r.bg), 'lớp tối gradient: '+r.bg);
    check(!r.op.length, 'opacity < 1 (Safari tắt blur): '+r.op.join(','));
    check(r.pe==='none' && r.z==='1', 'pointer-events none, z 1: '+r.pe+' '+r.z);
  });

  await run('E3', 'Thứ tự lớp + chạm: nav/khối đỉnh/ô tìm trên danh sách; dòng dưới dải mờ vẫn chạm được', async function(){
    await scrollTo('#cl-list', 0);
    var r=await ev(function(){ function at(x,y){ var e=document.elementFromPoint(x,y); return e; }
      var nav=document.querySelector('#p-clients>.nav').getBoundingClientRect(), head=document.querySelector('#p-clients>.head').getBoundingClientRect(), sr=document.querySelector('#p-clients .search').getBoundingClientRect();
      var cta=document.querySelector('#p-clients .nav .cta').getBoundingClientRect();
      /* dòng giao với dải mờ đáy (48px trên nav): chạm vào phần giao phải trúng dòng, không trúng lớp mép */
      var band=[].filter.call(document.querySelectorAll('#cl-list .row'), function(r){ var q=r.getBoundingClientRect(); return q.bottom>nav.top-48 && q.top<nav.top; })[0], dy=null;
      if(band){ var q=band.getBoundingClientRect(); dy=(Math.max(q.top, nav.top-48)+Math.min(q.bottom, nav.top))/2; }
      var a=at(cta.left+cta.width/2, cta.top+cta.height/2), b=at(60, head.top+head.height/2), c=at(sr.left+60, sr.top+sr.height/2), d=dy==null?null:at(60, dy), e=at(60, 400);
      return {cta:!!(a&&a.closest('.nav')), head:!!(b&&b.closest('.head')), search:!!(c&&c.closest('.search')), band:!!(d&&d.closest('#cl-list .row')), mid:!!(e&&e.closest('#cl-list')), under:(function(){ var x=at(40, nav.top+nav.height/2); return x?(x.closest('.nav')?'nav':x.className):'null'; })()}; });
    check(r.cta && r.head && r.search, 'nav/đỉnh/ô tìm bắt chạm: '+JSON.stringify(r));
    check(r.band, 'dòng nằm dưới dải mờ (trên nav 14px) vẫn chạm được: '+JSON.stringify(r));
    check(r.mid, 'giữa màn là danh sách');
    /* chạm thật: dòng dưới dải mờ mở hồ sơ, nav vẫn hoạt động */
    await scrollTo('#cl-list', 0);
    var nav=await ev(function(){ var r=document.querySelector('#p-clients>.nav').getBoundingClientRect(); return {t:r.top}; });
    var row=await ev(function(t){ var rows=[].filter.call(document.querySelectorAll('#cl-list .row'), function(r){ var q=r.getBoundingClientRect(); return q.top<t-4 && q.bottom>t-40; }); var q=rows.length?rows[rows.length-1].getBoundingClientRect():null; return q?{y:Math.min(q.bottom-4, t-6), nm:rows[rows.length-1].querySelector('.nm').textContent}:null; }, nav.t);
    if(row){ await page.mouse.click(80, row.y); await screen('p-profile'); await w(700); check((await ev(function(){ return state.client && state.client.name; }))===row.nm, 'chạm dòng sát nav mở đúng hồ sơ: '+row.nm);
      await page.click('#p-profile .nav .ghost'); await screen('p-clients'); await w(700); }
    else check(false, 'không tìm thấy dòng sát nav để chạm');
  });

  await run('E4', 'Sheet thư viện bài: danh sách phủ kín sheet, mép trên = ô tìm, dải chuyển theo cuộn', async function(){
    await page.click('#p-clients .nav .ghost:nth-child(1)'); await screen('p-home'); await w(700);
    await page.click('#h-go'); await screen('p-pick'); await w(600);
    var s=await egState('#pk-list'); check(s.rt==='0px', 'chọn khách: đầu danh sách r=0: '+s.rt);
    await page.click('#pk-list .row:has-text("Thành Công")'); await screen('p-confirm'); await w(1300);
    await page.click('#cf-go'); await screen('p-plan'); await page.waitForSelector('#lib.on'); await w(900);
    s=await egState('#lib-list');
    var sr=await ev(function(){ var r=document.querySelector('#lib .search').getBoundingClientRect(); return Math.round(r.bottom); });
    check(near(s.tt+s.tz, sr), 'mép vùng trên = đáy ô tìm: '+(s.tt+s.tz)+' vs '+sr);
    await scrollTo('#lib-list', 200); s=await egState('#lib-list'); check(s.rt==='32px' && s.rb==='48px', 'cuộn 200: '+s.rt+' / '+s.rb);
    await page.screenshot({path:path.join(OUT,'e4-lib-200.png')});
    var bg=await ev(function(){ return getComputedStyle(document.getElementById('lib')).getPropertyValue('--eg-rgb').trim(); }); check(bg==='34,34,34', 'sheet dùng màu nền sheet cho lớp tối: '+bg);
    await scrollTo('#lib-list', 0);
    await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-go'); await w(600);
  });

  await run('E6', 'Màn nghỉ Acid: --bg = Acid (html + body), mực phủ kín → về Ink; rời loop → Ink', async function(){
    await page.click('#pl-go'); await screen('p-loop'); await w(1300);
    var L='#loop-host .loop:nth-child(1) ';
    var bg0=await ev(function(){ return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); }); check(/#0A0A0A/i.test(bg0), 'setup: Ink '+bg0);
    await page.click(L+'.c1'); await w(600); await page.click(L+'.j1'); await w(1100);
    var r=await ev(function(){ var l=document.querySelector('#loop-host .loop'), q=l.getBoundingClientRect(); return {bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), html:getComputedStyle(document.documentElement).backgroundColor, body:getComputedStyle(document.body).backgroundColor, bga:l.classList.contains('bga'), t:q.top, b:q.bottom, H:innerHeight}; });
    check(r.bga && /#D4FF00/i.test(r.bg) && r.html==='rgb(212, 255, 0)' && r.body==='rgb(212, 255, 0)', 'Acid phủ nền gốc: '+JSON.stringify(r));
    check(r.t===0 && r.b===r.H, 'loop phủ kín khung: '+r.t+'..'+r.b);
    await page.screenshot({path:path.join(OUT,'e6-acid.png')});
    await ev(function(){ state.session.people[0].restTotal=3; saveSession(); });
    await page.click(L+'.c1'); await w(400);
    var mid=await ev(function(){ return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); });
    check(/#D4FF00/i.test(mid), 'đầu lúc nghỉ (mực chưa phủ kín) nền gốc vẫn Acid: '+mid);
    await page.waitForFunction(function(){ var l=document.querySelector('#loop-host .loop'); return l && l.classList.contains('inkfull'); }, null, {timeout:9000}).catch(function(){});
    await w(200);
    var r2=await ev(function(){ var l=document.querySelector('#loop-host .loop'); return {inkfull:l.classList.contains('inkfull'), bg:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), html:getComputedStyle(document.documentElement).backgroundColor}; });
    check(r2.inkfull && /#0A0A0A/i.test(r2.bg) && r2.html==='rgb(10, 10, 10)', 'mực phủ kín → nền gốc Ink: '+JSON.stringify(r2));
    await page.screenshot({path:path.join(OUT,'e6-inkfull.png')});
    await page.click(L+'.g1'); await w(500); await page.click(L+'.fend'); await screen('p-summary'); await w(700);
    var bg2=await ev(function(){ return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); }); check(/#0A0A0A/i.test(bg2), 'rời loop → Ink: '+bg2);
  });

  await run('E7', 'Vùng cuộn không .ex (tổng kết) vẫn dùng fog mask cũ', async function(){
    var r=await ev(function(){ var el=[].filter.call(document.querySelectorAll('#p-summary .scroll'), function(x){ return !x.classList.contains('ex'); })[0]; if(!el) return null; return {mask:el.style.webkitMaskImage||el.style.maskImage||'', ex:el.classList.contains('ex')}; });
    check(!r || /linear-gradient/.test(r.mask), 'fog mask ở tổng kết: '+JSON.stringify(r));
  });
  await C.ctx.close();

  await run('E5', '--top: trình duyệt 56 · bản cài cũ → sb-legacy 2px · inset 47/59/62 → 56/56/59 · busy bám --top', async function(){
    var headY=async function(pg){ return pg.evaluate(function(){ var h=document.querySelector('#p-pin .head, #p-pin .t1, #p-pin>*'); var pp=document.getElementById('p-pin'); return {pad:parseFloat(getComputedStyle(pp).paddingTop), legacy:document.documentElement.classList.contains('sb-legacy'), busy:parseFloat(getComputedStyle(document.getElementById('busy')).top)}; }); };
    var A=await mk(); await A.page.goto('http://localhost:'+PORT+'/?demo'); await A.page.waitForTimeout(500);
    var a=await headY(A.page); check(a.pad===56 && !a.legacy && a.busy===54, 'trình duyệt: '+JSON.stringify(a));
    for(var t of [[47,56],[59,56],[62,59],[20,56]]){
      var v=await A.page.evaluate(function(s){ document.documentElement.style.setProperty('--sat', s+'px'); return parseFloat(getComputedStyle(document.getElementById('p-pin')).paddingTop); }, t[0]);
      check(v===t[1], 'inset '+t[0]+' → --top '+v+' (mong '+t[1]+')');
    }
    await A.ctx.close();
    var B=await mk(null, function(){ try{ Object.defineProperty(navigator, 'standalone', {get:function(){ return true; }}); }catch(e){} });
    await B.page.goto('http://localhost:'+PORT+'/?demo'); await B.page.waitForTimeout(500);
    var b=await headY(B.page); check(b.legacy && b.pad===2 && b.busy===0, 'bản cài cũ (standalone, inset 0): '+JSON.stringify(b));
    await B.page.screenshot({path:path.join(OUT,'e5-legacy.png')});
    await B.ctx.close();
  });

  await browser.close(); srv.close();
  var fails=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fails)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length+(PAGEERR.length?'\n - '+PAGEERR.join('\n - '):''));
  process.exit(fails||PAGEERR.length?1:0);
})().catch(function(e){ console.error('EXC', e); process.exit(2); });

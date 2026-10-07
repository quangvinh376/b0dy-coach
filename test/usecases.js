/* Bộ test USE CASE toàn app (Playwright, Chromium, iPhone 393×852 dpr2 touch).
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/usecases.js
   - Ngữ cảnh DEMO (?demo): A (PIN đúng, trang chủ) · B chart · C chuyển màn · D khách · E hồ sơ · F chọn khách · G xác nhận
     · H pill · I bài tập hôm nay · J loop 1:1 · K loop 1:2 · M tổng kết/khôi phục · O lỗi JS + clip chữ
   - Ngữ cảnh 375×667 và 430×932: L căn giữa responsive
   - Ngữ cảnh MOCK API (không ?demo, máy chủ giả như test/flow11.js): A (PIN sai) · N offline/outbox/check-in lỗi
   Ảnh: test/uc/<id>-fail.png khi FAIL, <id>-note.png cho mục "cần chủ dự án quyết". Mã thoát 1 nếu có FAIL hoặc pageerror. */
var {chromium}=require('playwright'); var serve=require('./serve'); var fs=require('fs'); var path=require('path');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19117, OUT=path.join(__dirname,'uc');
var RES=[], PAGEERR=[], CONS=[], CUR=null, P=null;
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});

/* ---------- khung ghi kết quả ---------- */
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
function note(msg){ CUR.notes.push(msg); }
function near(a, b, tol){ return Math.abs(a-b)<=tol; }
async function shot(page, name){ try{ await page.screenshot({path:path.join(OUT, name+'.png')}); }catch(e){} }
async function run(id, name, fn){
  if(process.env.ONLY && process.env.ONLY.split(',').indexOf(id)<0) return;
  CUR={id:id, name:name, fails:[], notes:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,9).join(' | ')); }
  if(CUR.fails.length && P) await shot(P, id+'-fail');
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')+(CUR.notes.length?'\n   · '+CUR.notes.join('\n   · '):''));
}
function watch(page, tag){
  page.on('pageerror', function(e){ PAGEERR.push(tag+': '+String(e)); });
  page.on('console', function(m){ if(m.type()==='error' && !/404/.test(m.text())) CONS.push(tag+': '+m.text()); });
}
async function mkctx(browser, vp){
  var ctx=await browser.newContext({viewport:vp||{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  return ctx;
}
/* ---------- trợ giúp theo trang ---------- */
function H(page){
  var h={page:page};
  h.wait=function(ms){ return page.waitForTimeout(ms); };
  h.ev=function(fn, arg){ return page.evaluate(fn, arg); };
  h.txt=async function(sel){ return (await page.evaluate(function(s){ var e=document.querySelector(s); return e?e.textContent:null; }, sel))||''; };
  h.cls=function(sel){ return page.evaluate(function(s){ var e=document.querySelector(s); return e?e.className:null; }, sel); };
  h.has=async function(sel, c){ var k=await h.cls(sel); return !!k && (' '+k+' ').indexOf(' '+c+' ')>=0; };
  h.count=function(sel){ return page.evaluate(function(s){ return document.querySelectorAll(s).length; }, sel); };
  h.rect=function(sel){ return page.evaluate(function(s){ var e=document.querySelector(s); if(!e) return null; var r=e.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2,b:r.bottom,r:r.right}; }, sel); };
  h.css=function(sel, prop, pseudo){ return page.evaluate(function(a){ var e=document.querySelector(a.s); return e?getComputedStyle(e, a.p||null)[a.prop]:null; }, {s:sel,prop:prop,p:pseudo||null}); };
  h.hidden=function(sel){ return page.evaluate(function(s){ var e=document.querySelector(s); if(!e) return true; if(e.hidden) return true; var cs=getComputedStyle(e); return cs.display==='none' || cs.visibility==='hidden'; }, sel); };
  h.screen=function(){ return page.evaluate(function(){ return state.screen; }); };
  h.waitScreen=function(id, t){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:t||6000}); };
  h.pillOn=function(){ return page.evaluate(function(){ return document.getElementById('pill').classList.contains('on'); }); };
  h.pillText=function(){ return page.evaluate(function(){ var t=document.querySelector('#pill .tx'); return t?t.textContent:''; }); };
  h.click=function(sel){ return page.click(sel); };
  h.tapAt=async function(x, y){ await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.up(); };
  /* kéo bằng chuột (pointer events thật, có setPointerCapture) từ tâm phần tử */
  h.drag=async function(sel, dx, dy, o){ o=o||{}; var r=await h.rect(sel); var x=r.cx+(o.ox||0), y=r.cy+(o.oy||0);
    await page.mouse.move(x,y); await page.mouse.down(); if(o.hold) await h.wait(o.hold); await page.mouse.move(x+dx, y+dy, {steps:o.steps||10}); if(o.before) await o.before(); await page.mouse.up(); };
  h.login=async function(){ for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")'); await h.waitScreen('p-home'); await h.wait(1500); };
  /* home → chọn khách → xác nhận → check-in → chọn bài → bắt đầu loop */
  h.startSession=async function(names, exIdx){
    await page.click('#h-go'); await h.waitScreen('p-pick'); await h.wait(500);
    for(var n of names) await page.click('#pk-list .row:has-text("'+n+'")');
    if((await h.screen())!=='p-confirm') await page.click('#pk-go');
    await h.waitScreen('p-confirm'); await h.wait(1500);
    await page.click('#cf-go'); await h.waitScreen('p-plan'); await page.waitForSelector('#lib.on'); await h.wait(500);
    for(var i of exIdx) await page.click('#lib-list .row:nth-of-type('+i+')');
    await page.click('#lib-go'); await h.wait(500);
    await page.click('#pl-go'); await h.waitScreen('p-loop'); await h.wait(1300);
  };
  /* trong loop (một nửa bất kỳ): set → đạt → nghỉ → menu (nút chính lúc nghỉ) → kết thúc → tổng kết từng người → xong → trang chủ */
  h.finishSession=async function(){
    var L='#loop-host .loop:nth-child(1) ';
    await page.click(L+'.c1'); await h.wait(500); await page.click(L+'.j1'); await h.wait(900); await page.click(L+'.c1'); await h.wait(600);
    await page.click(L+'.c1'); await h.wait(500); await page.click(L+'.fend'); await h.waitScreen('p-summary'); await h.wait(900);
    while(true){ var t=await h.txt('#sm-go'); await page.click('#sm-go'); await h.wait(900); if(t.indexOf('Xác nhận')>=0) break; }
    await h.waitScreen('p-done'); await h.wait(1300); await page.click('#p-done .cta'); await h.waitScreen('p-home'); await h.wait(1500);
  };
  /* O — chữ bị cắt: scrollWidth > clientWidth trên phần tử đang hiển thị */
  h.clip=async function(label){
    var out=await page.evaluate(function(){
      var sel='.page.on .t1,.page.on .sub,.page.on .nm,.page.on .tile .tl,.page.on .tile .tv,.page.on .hero .l1,.page.on .hero .l2,.page.on .lines .a,.page.on .lines .b,.sheet.on .nm,.pill.on .tx';
      var out=[]; document.querySelectorAll(sel).forEach(function(el){ var r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return; if(el.scrollWidth>el.clientWidth+1) out.push({t:el.textContent.trim().slice(0,40), sw:el.scrollWidth, cw:el.clientWidth, ell:el.classList.contains('ell')||getComputedStyle(el).textOverflow==='ellipsis', cls:el.className}); });
      return out;
    });
    out.forEach(function(o){ var m=label+' "'+o.t+'" ('+o.cls+') sw='+o.sw+' cw='+o.cw; if(o.ell) CLIP.ell.push(m); else CLIP.hard.push(m); });
  };
  return h;
}
var CLIP={hard:[], ell:[]};

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  var URL='http://localhost:'+PORT+'/';

  /* =================================================================
     NGỮ CẢNH 1 — DEMO
     ================================================================= */
  var ctx=await mkctx(browser), page=await ctx.newPage(); watch(page,'demo'); P=page; var h=H(page);
  await page.goto(URL+'?demo'); await page.waitForSelector('#p-pin.on'); await h.wait(600);

  await run('A', 'PIN đúng → trang chủ, dữ liệu trang chủ', async function(){
    await h.login();
    check((await h.txt('#h-name'))==='Quyết Hán', 'tiêu đề tên coach: '+(await h.txt('#h-name')));
    var mm=await h.ev(function(){ return TODAY_ISO.slice(5,7); });
    check((await h.txt('#h-month'))==='Tháng '+mm, '#h-month: '+(await h.txt('#h-month')));
    var exp=await h.ev(function(){ var d=demoDb().stats.days, t=0; Object.keys(d).forEach(function(k){ t+=d[k]; }); return t; });
    check((await h.txt('#h-taught'))==='Đã dạy '+exp+' buổi', '#h-taught: '+(await h.txt('#h-taught'))+' (mong '+exp+')');
    var tiles=await h.ev(function(){ return [].map.call(document.querySelectorAll('#h-tiles .tile'), function(t){ return t.querySelector('.tl').textContent+'='+t.querySelector('.tv').textContent.trim(); }); });
    check(tiles.length===4, '4 ô: '+tiles.join(' | '));
    var active=await h.ev(function(){ return state.clients.filter(function(c){return c.left>0}).length; }), slow=await h.ev(function(){ return slowClients().length; });
    check(tiles[0]==='Tổng số khách='+active, 'ô 1: '+tiles[0]); check(tiles[1]==='Khách tập chậm='+slow, 'ô 2: '+tiles[1]);
    check(tiles[2]==='Khách hôm nay=0', 'ô 3: '+tiles[2]); var comT=await h.ev(function(){ return 'Hoa hồng='+fmtTr(state.stats.comMon[monthOf(TODAY_ISO)]); }); check(tiles[3].replace(/\s+/g,' ')===comT+' TR', 'ô 4: '+tiles[3]+' (mong '+comT+')');
    check((await h.txt('#h-go'))==='Vào buổi tập', 'CTA: '+(await h.txt('#h-go')));
    check(await h.has('#h-1m','on'), '1M đang chọn');
    await h.clip('home');
  });

  await run('B', 'Chart: kéo ngón tay đổi hero, nhả về tháng, 7D/1M', async function(){
    var mm=await h.ev(function(){ return TODAY_ISO.slice(5,7); }), total=await h.ev(function(){ return HB.total; });
    var r=await h.rect('#h-bars'); check((await h.count('#h-bars i'))>=28, 'số cột 1M: '+(await h.count('#h-bars i')));
    await page.mouse.move(r.x+r.w*0.3, r.cy); await page.mouse.down(); await h.wait(350);
    var hit=await h.ev(function(){ var b=document.querySelector('#h-bars i.hit'); return b?{k:b.dataset.k, v:+b.dataset.v}:null; });
    check(!!hit, 'cột .hit sau pointerdown');
    if(hit){ check((await h.txt('#h-month'))===hit.k.slice(8,10)+'/'+hit.k.slice(5,7), '#h-month dd/mm: '+(await h.txt('#h-month'))+' mong '+hit.k);
      check((await h.txt('#h-taught'))==='Đã dạy '+hit.v+' buổi', '#h-taught theo ngày: '+(await h.txt('#h-taught'))+' mong '+hit.v); }
    await page.mouse.move(r.x+r.w*0.6, r.cy, {steps:6}); await h.wait(350);
    var hit2=await h.ev(function(){ var b=document.querySelector('#h-bars i.hit'); return b?{k:b.dataset.k, v:+b.dataset.v}:null; });
    check(hit2 && hit && hit2.k!==hit.k, 'kéo sang cột khác: '+JSON.stringify(hit2));
    if(hit2){ check((await h.txt('#h-month'))===hit2.k.slice(8,10)+'/'+hit2.k.slice(5,7), '#h-month sau kéo: '+(await h.txt('#h-month')));
      check((await h.txt('#h-taught'))==='Đã dạy '+hit2.v+' buổi', '#h-taught sau kéo: '+(await h.txt('#h-taught'))); }
    /* luật đã chốt (app.js up(): "nhả tay: về trạng thái mặc định NGAY") — không còn giữ ngày ~1s sau khi nhả */
    await page.mouse.up(); await h.wait(150);
    check((await h.txt('#h-month'))==='Tháng '+mm, 'nhả tay → về tháng ngay: '+(await h.txt('#h-month')));
    await h.wait(1100);
    check((await h.txt('#h-month'))==='Tháng '+mm, 'sau ~1s vẫn là tháng: '+(await h.txt('#h-month')));
    check((await h.txt('#h-taught'))==='Đã dạy '+total+' buổi', 'số tháng phục hồi: '+(await h.txt('#h-taught')));
    check(!(await h.count('#h-bars i.hit')), 'không còn cột .hit');
    await page.click('#h-7d'); await h.wait(700);
    check((await h.count('#h-bars i'))===7, '7D có 7 cột: '+(await h.count('#h-bars i'))); check(await h.has('#h-7d','on') && !(await h.has('#h-1m','on')), 'nút 7D on');
    r=await h.rect('#h-bars'); await page.mouse.move(r.x+r.w*0.5, r.cy); await page.mouse.down(); await h.wait(350);
    check(/^\d\d\/\d\d$/.test(await h.txt('#h-month')), '7D scrub: '+(await h.txt('#h-month'))); await page.mouse.up(); await h.wait(1200);
    check((await h.txt('#h-month'))==='Tháng '+mm, '7D về tháng');
    await page.click('#h-1m'); await h.wait(700); check((await h.count('#h-bars i'))>=28, '1M lại đủ cột');
  });

  await run('H1', 'Pill trên nền Ink: viền, chạm tắt, vuốt lên tắt, pill lỗi có nút và tự tắt ≤6,5s', async function(){
    await h.ev(function(){ notify('Kiểm tra pill 1'); }); await h.wait(450);
    check(await h.pillOn(), 'pill hiện'); var bc=await h.css('#pill','borderTopColor');
    check(bc && bc!=='rgba(0, 0, 0, 0)' && bc!=='transparent', 'viền pill trên Ink: '+bc);
    check((await h.css('#pill','borderTopWidth'))==='1px', 'viền 1px');
    await page.click('#pill'); await h.wait(300); check(!(await h.pillOn()), 'chạm → tắt');
    await h.ev(function(){ notify('Kiểm tra vuốt 2'); }); await h.wait(450);
    var r=await h.rect('#pill'); await page.mouse.move(r.cx, r.cy); await page.mouse.down(); await page.mouse.move(r.cx, r.cy-12, {steps:4}); await page.mouse.move(r.cx, Math.max(1, r.cy-40), {steps:6}); await page.mouse.up(); await h.wait(300);
    check(!(await h.pillOn()), 'vuốt lên → tắt'); check((await h.ev(function(){ return document.getElementById('pill').style.transform; }))==='', 'transform kéo được dọn');
    await h.ev(function(){ window.__act=0; notify('Chưa check-in · Test', {err:true, action:{label:'Thử lại', fn:function(){ window.__act++; }}}); }); await h.wait(450);
    check(await h.pillOn() && await h.has('#pill','err'), 'pill lỗi hiện'); check((await h.txt('#pill .act'))==='Thử lại', 'nút hành động: '+(await h.txt('#pill .act')));
    var ic=await h.css('#pill .ic','color'); check(ic==='rgb(233, 37, 105)', 'icon lỗi đỏ: '+ic);
    await h.wait(6200); check(!(await h.pillOn()), 'pill lỗi tự tắt ≤ 6,5s');
    await h.ev(function(){ notify('Lỗi 2', {err:true, action:{label:'Thử lại', fn:function(){ window.__act++; }}}); }); await h.wait(450);
    await page.click('#pill .act'); await h.wait(300); check((await h.ev(function(){ return window.__act; }))===1 && !(await h.pillOn()), 'nút hành động chạy fn và tắt pill');
  });

  await run('C', 'Chuyển màn: nav đứng yên (.still), head/body có animation; hồ sơ và quay lại', async function(){
    await page.click('#p-home .nav .ghost:nth-child(2)');
    var st=await h.ev(function(){ var pg=document.getElementById('p-clients'); return {scr:state.screen, btns:[].map.call(pg.querySelectorAll('.nav button'), function(b){ return b.className; }),
      vis:[].filter.call(pg.querySelectorAll('.nav button'), function(b){ return getComputedStyle(b).display!=='none'; }).map(function(b){ return b.className; }),
      adm:getComputedStyle(pg.querySelector('.nav .tab-adm')).display,
      nav:getComputedStyle(pg.querySelector(':scope>.nav')).animationName, head:getComputedStyle(pg.querySelector(':scope>.head')).animationName, body:getComputedStyle(pg.querySelector(':scope>.body')).animationName,
      leave:getComputedStyle(document.querySelector('#p-home>.body')).animationName}; });
    check(st.scr==='p-clients', 'sang p-clients');
    /* v2.4: nav có thêm nút tab Cài đặt (.tab-adm) — chỉ hiện với PIN admin; coach vẫn thấy đúng 3 nút */
    check(st.vis.length===3 && st.btns.every(function(c){ return /\bstill\b/.test(c); }), 'ghost/CTA nav có .still (3 nút hiện): '+st.vis.join(' | ')+' / tất cả: '+st.btns.join(' | '));
    check(st.adm==='none', 'coach không thấy tab Cài đặt: display='+st.adm);
    check(st.nav==='none', '.nav không animation: '+st.nav); check(st.head==='inF', '.head trượt vào: '+st.head); check(st.body==='inF', '.body trượt vào: '+st.body); check(st.leave==='outF', 'trang cũ .body trượt ra: '+st.leave);
    check(/curswap/.test(st.btns[1]), 'tab Khách hàng đổi .cur mềm (curswap): '+st.btns[1]);
    await h.wait(800); await h.clip('clients');
    await page.click('#cl-list .row');
    /* v2.5: tên bay từ dòng lên tiêu đề hồ sơ (phần họ mờ tại chỗ); tiêu đề thật ẩn tới lúc hạ cánh rồi phải hiện lại */
    var hf=await h.ev(function(){ var f=document.querySelectorAll('.herofly'); return {n:f.length, t:f[0]?f[0].textContent:'', pre:f[1]?f[1].textContent:'', dst:document.getElementById('pf-name').style.opacity,
      old:getComputedStyle(document.querySelector('#p-clients .head .t1')).opacity, lead:document.getElementById('p-profile').classList.contains('hlead')}; });
    check(hf.t==='Doãn Quang' && hf.pre==='Bùi' && hf.dst==='0', 'tên bay: bản sao "'+hf.t+'" + họ "'+hf.pre+'", tiêu đề đích ẩn ('+hf.dst+')');
    check(hf.lead, 'màn đích có .hlead (nội dung hiện sau tên bay)');
    /* v2.5: trang đang rời giữ enter-* → tiêu đề (.st>*) mờ cùng khối, không tắt phụt ở khung đầu (v2.4.11: 0) */
    check(hf.old==='1', 'tiêu đề trang cũ không tắt phụt khi rời: opacity '+hf.old);
    await h.waitScreen('p-profile'); await h.wait(900);
    var hl=await h.ev(function(){ var d=document.getElementById('pf-name'); return {n:document.querySelectorAll('.herofly').length, op:getComputedStyle(d).opacity, inl:d.style.opacity}; });
    check(hl.n===0 && hl.op==='1' && hl.inl==='', 'tên hạ cánh: bản sao đã gỡ, tiêu đề hiện '+JSON.stringify(hl));
    check((await h.txt('#pf-name'))==='Doãn Quang', 'hồ sơ: '+(await h.txt('#pf-name'))); await h.clip('profile');
    await page.click('#p-profile .nav .ghost'); await h.waitScreen('p-clients'); await h.wait(600);
    check((await h.count('#cl-list .row'))>=6, 'quay lại danh sách còn dữ liệu');
    await page.click('#p-clients .nav .ghost:nth-child(1)');
    var b2=await h.ev(function(){ return [].map.call(document.querySelectorAll('#p-home .nav button'), function(b){ return b.className; }); });
    check(b2.every(function(c){ return /\bstill\b/.test(c); }), 'về home: nav .still: '+b2.join(' | '));
    await h.waitScreen('p-home'); await h.wait(800);
  });

  await run('D', 'Khách hàng: 2 nhóm, khách hết gói mở được, tìm kiếm, ô lọc trang chủ', async function(){
    await page.click('#p-home .nav .ghost:nth-child(2)'); await h.waitScreen('p-clients'); await h.wait(700);
    var secs=await h.ev(function(){ return [].map.call(document.querySelectorAll('#cl-list .sec'), function(d){ return d.textContent; }); });
    var act=await h.ev(function(){ return state.clients.filter(function(c){return c.left>0}).length; }), dn=await h.ev(function(){ return state.clients.filter(function(c){return c.left<=0}).length; });
    check(secs[0]==='KHÁCH ĐANG HOẠT ĐỘNG · '+act && secs[1]==='KHÁCH ĐÃ HẾT GÓI · '+dn, 'nhóm: '+secs.join(' | '));
    var last=await h.ev(function(){ var rows=document.querySelectorAll('#cl-list .row'); var r=rows[rows.length-1]; return {nm:r.querySelector('.nm').textContent, meta:r.querySelector('.lab').textContent, off:r.classList.contains('off')}; });
    check(/ĐÃ HẾT/.test(last.meta) && !last.off, 'dòng hết gói: '+JSON.stringify(last));
    await page.click('#cl-list .row >> nth=-1'); await h.waitScreen('p-profile'); await h.wait(800);
    check((await h.txt('#pf-name'))==='Việt Hoàng', 'hồ sơ khách hết gói: '+(await h.txt('#pf-name')));
    check((await h.txt('#pf-left'))==='Còn 0 buổi', 'còn 0 buổi: '+(await h.txt('#pf-left')));
    await page.click('#p-profile .nav .ghost'); await h.waitScreen('p-clients'); await h.wait(500);
    await page.fill('#cl-q','hoang'); await h.wait(200);
    var names=await h.ev(function(){ return [].map.call(document.querySelectorAll('#cl-list .row .nm'), function(e){ return e.textContent; }); });
    check(names.length===1 && names[0]==='Phan Việt Hoàng', 'tìm "hoang": '+names.join(','));
    await page.fill('#cl-q','zzz'); await h.wait(200); check((await h.txt('#cl-list .empty'))==='KHÔNG TÌM THẤY TÊN NÀY', 'không tìm thấy');
    await page.fill('#cl-q',''); await h.wait(200); check((await h.count('#cl-list .row'))===act+dn, 'xoá tìm → đủ');
    await page.click('#p-clients .nav .ghost:nth-child(1)'); await h.waitScreen('p-home'); await h.wait(900);
    /* v2.7: ô "Khách tập chậm" → TRANG riêng p-slow (2 nhóm theo hạn gói, dòng mở rộng biểu đồ 8 tuần) */
    await page.click('#h-tiles .tile:nth-child(2)'); await h.waitScreen('p-slow'); await h.wait(800);
    var sl=await h.ev(function(){ return slowList().map(function(i){ return i.m.name+'|'+(i.days<=SLOW_SOON?1:2); }); });
    secs=await h.ev(function(){ return [].map.call(document.querySelectorAll('#sl-list .sec'), function(d){ return d.textContent; }); });
    names=await h.ev(function(){ return [].map.call(document.querySelectorAll('#sl-list .row .nm'), function(e){ return e.textContent; }); });
    var g1=sl.filter(function(x){ return /\|1$/.test(x); }).length, g2=sl.length-g1;
    check(sl.length>=2 && secs.join('|')===['HẾT HẠN TRONG 60 NGÀY · '+g1, 'HẾT HẠN SAU 60 NGÀY · '+g2].filter(function(x,k){ return k?g2:g1; }).join('|'), 'nhóm: '+secs.join('|')+' / '+sl.join(','));
    check(names.length===sl.length, 'số dòng = số khách chậm: '+names.join(','));
    await page.fill('#sl-q', 'zzz'); await h.wait(200); check((await h.count('#sl-list .row'))===0 && (await h.txt('#sl-list .empty'))==='KHÔNG TÌM THẤY TÊN NÀY', 'tìm: không thấy');
    await page.fill('#sl-q', ''); await h.wait(200); check((await h.count('#sl-list .row'))===sl.length, 'xoá tìm → đủ');
    await page.click('#sl-list .row'); await h.wait(600);
    check(await h.has('#sl-list .row','open') && (await h.count('#sl-list .xp .wkb i'))===8, 'chạm dòng → mở 8 cột tuần');
    await page.click('#p-slow .nav .ghost'); await h.waitScreen('p-home'); await h.wait(900);
    /* ô "Khách hôm nay" = 0 → window rỗng */
    await page.click('#h-tiles .tile:nth-child(3)'); await page.waitForSelector('#csheet.on'); await h.wait(700);
    check((await h.count('#cs-list .row'))===0 && (await h.txt('#cs-list .empty'))==='CHƯA CÓ KHÁCH HÔM NAY', 'khách hôm nay (chưa ai): '+(await h.txt('#cs-list')));
    await page.click('#cs-go'); await h.wait(500); check(!(await h.has('#csheet','on')) && (await h.screen())==='p-home', 'Đóng → window tắt, vẫn trang chủ');
  });

  await run('E', 'Hồ sơ → Đo lường (mở/đóng, nhập số đo dấu phẩy, lưu), Đặt mục tiêu (bánh xe), Hiệu suất tập', async function(){
    await page.click('#p-home .nav .ghost:nth-child(2)'); await h.waitScreen('p-clients'); await h.wait(700);
    await page.click('#cl-list .row:has-text("Doãn Quang")'); await h.waitScreen('p-profile'); await h.wait(900);
    check((await h.txt('#pf-mval'))==='Nặng 75 kg', 'chỉ số chính: '+(await h.txt('#pf-mval'))); check(/Mục tiêu 65 kg/.test(await h.txt('#pf-target')), 'mục tiêu: '+(await h.txt('#pf-target')));
    await page.click('#pf-tabs button:nth-child(3)'); await h.wait(200); check((await h.txt('#pf-mval'))==='Eo 82 cm', 'tab eo: '+(await h.txt('#pf-mval')));
    /* --- đo lường --- */
    await page.click('button.row:has-text("Đo lường")'); await h.waitScreen('p-measure'); await h.wait(800);
    var n0=await h.count('#ms-list .row'); check((await h.txt('#ms-count'))==='LẦN ĐO · '+n0 && n0===5, 'đếm lần đo: '+(await h.txt('#ms-count')));
    await page.click('#ms-list .row:nth-of-type(1)'); await h.wait(300);
    check(await h.has('#ms-list .row:nth-of-type(1)','open') , 'mở lần đo');
    check((await h.css('#ms-list .row.open + .xp','display'))==='block', 'bảng chỉ số hiện');
    check((await h.txt('#ms-list .row.open + .xp .kv:nth-child(1) .v'))==='75KG', 'giá trị cân nặng: '+(await h.txt('#ms-list .row.open + .xp .kv:nth-child(1) .v')));
    await page.click('#ms-list .row:nth-of-type(2)'); await h.wait(300);
    check(!(await h.has('#ms-list .row:nth-of-type(1)','open')) && (await h.has('#ms-list .row:nth-of-type(2)','open')), 'mở lần khác đóng lần trước');
    await page.click('#ms-list .row:nth-of-type(2)'); await h.wait(300); check(!(await h.count('#ms-list .row.open')), 'chạm lại → đóng');
    await h.clip('measure');
    await page.click('#p-measure .cta'); await h.waitScreen('p-measure-new'); await h.wait(800);
    check(await h.has('#mn-grid .mt:nth-child(1)','on'), 'ô cân nặng đang chọn');
    for(var k of ['7','2',',','4']) await page.click('#mn-pad button:has-text("'+k+'")');
    check((await h.txt('#mn-grid .mt.on .v span'))==='72,4', 'nhập 72,4: '+(await h.txt('#mn-grid .mt.on .v span')));
    await page.click('#mn-pad button:has-text("9")'); check((await h.txt('#mn-grid .mt.on .v span'))==='72,4', 'chỉ 1 chữ số thập phân');
    await page.click('#mn-grid .mt:nth-child(3)'); await page.click('#mn-pad button:has-text("8")'); await page.click('#mn-pad button:has-text("1")');
    check((await h.txt('#mn-grid .mt.on .v span'))==='81', 'ô eo nhập 81');
    await page.click('#p-measure-new .cta'); await h.waitScreen('p-measure'); await h.wait(700);
    check(/^Đã lưu số đo$/.test(await h.pillText()), 'pill lưu: '+(await h.pillText()));
    check((await h.count('#ms-list .row'))===n0+1 && (await h.txt('#ms-count'))==='LẦN ĐO · '+(n0+1), 'lần đo mới xuất hiện: '+(await h.txt('#ms-count')));
    var d=await h.ev(function(){ return vnLong(TODAY_ISO); }); check((await h.txt('#ms-list .row:nth-of-type(1) .nm'))===d, 'dòng đầu là hôm nay: '+(await h.txt('#ms-list .row:nth-of-type(1) .nm')));
    await page.click('#ms-list .row:nth-of-type(1)'); await h.wait(300);
    check((await h.txt('#ms-list .row.open + .xp .kv:nth-child(1) .v'))==='72,4KG' && (await h.txt('#ms-list .row.open + .xp .kv:nth-child(3) .v'))==='81CM', 'số đo mới đúng giá trị');
    check((await h.count('#ms-list .row.open + .xp .kv.none'))===4, '4 chỉ số chưa nhập hiện —');
    await page.click('#p-measure .nav .ghost'); await h.waitScreen('p-profile'); await h.wait(600);
    check((await h.txt('#pf-mval'))==='Eo 81 cm', 'hồ sơ cập nhật eo: '+(await h.txt('#pf-mval')));
    /* --- mục tiêu (bánh xe) --- */
    await page.click('#pf-target'); await h.waitScreen('p-target'); await h.wait(800);
    check(await h.has('#tg-tabs button:nth-child(3)','on'), 'tab mục tiêu = chỉ số đang xem (Eo)');
    await page.click('#tg-tabs button:nth-child(1)'); await h.wait(300);
    check((await h.txt('#tg-hint'))==='CÂN NẶNG · KG' && (await h.ev(function(){ return state.tgVal; }))===65, 'bánh xe cân nặng từ mục tiêu 65');
    await h.drag('#tg-wheel', 0, -160, {steps:12}); await h.wait(400);
    var tv=await h.ev(function(){ return state.tgVal; }); check(tv===66, 'kéo lên 160px = 2 bước × 0,5 → 66: '+tv);
    check(!(await h.count('#p-target .dimx')), 'blur tiêu điểm được gỡ sau khi nhả');
    await page.click('#p-target .cta'); await h.waitScreen('p-profile'); await h.wait(600);
    check(/Mục tiêu 66 kg/.test(await h.txt('#pf-target')) && (await h.txt('#pf-mval'))==='Nặng 72,4 kg', 'hồ sơ về cân nặng (72,4 vừa nhập) + mục tiêu 66: '+(await h.txt('#pf-target'))+' / '+(await h.txt('#pf-mval')));
    check(/^Đã đặt mục tiêu$/.test(await h.pillText()), 'pill mục tiêu: '+(await h.pillText()));
    /* --- hiệu suất --- */
    await page.click('button.row:has-text("Hiệu suất tập")'); await h.waitScreen('p-perf'); await h.wait(900);
    var nh=await h.count('#pe-list .row:not(.nohist)'); check(nh>=2, 'bài có lịch sử: '+nh);
    await page.click('#pe-list .row:not(.nohist)'); await h.wait(300);
    check(await h.has('#pe-list .row:not(.nohist)','open') && (await h.count('#pe-list .row.open + .xp .kv'))>=1, 'mở lịch sử bài');
    check(/\d+ × \d+KG/.test(await h.txt('#pe-list .row.open + .xp .kv:nth-child(1) .v')), 'dòng lịch sử "rep × kg": '+(await h.txt('#pe-list .row.open + .xp .kv:nth-child(1) .v')));
    await page.click('#pe-list .row:not(.nohist)'); await h.wait(200); check(!(await h.count('#pe-list .row.open')), 'đóng bài');
    await page.fill('#pe-q','lat pull'); await h.wait(200);
    var pn=await h.ev(function(){ return [].map.call(document.querySelectorAll('#pe-list .row .nm'), function(e){ return e.textContent; }); });
    check(pn.length===1 && /^PD /.test(pn[0]), 'tìm "lat pull" (chỉ bài có dữ liệu): '+pn.join(','));
    await page.fill('#pe-q','zzzz'); await h.wait(200); check((await h.txt('#pe-list .empty'))==='KHÔNG TÌM THẤY BÀI NÀY', 'không tìm thấy bài');
    await page.fill('#pe-q',''); await h.wait(200); await h.clip('perf');
    await page.click('#p-perf .nav .ghost'); await h.waitScreen('p-profile'); await h.wait(500);
    await page.click('#p-profile .nav .ghost'); await h.waitScreen('p-clients'); await h.wait(500);
    await page.click('#p-clients .nav .ghost:nth-child(1)'); await h.waitScreen('p-home'); await h.wait(900);
  });

  await run('F', 'Chọn khách: 3 nhóm, 1:1 đi thẳng, 1:2 toggle/chip/tối đa 2, tìm kiếm giữ nhóm, back', async function(){
    await page.click('#h-go'); await h.waitScreen('p-pick'); await h.wait(700);
    var secs=await h.ev(function(){ return [].map.call(document.querySelectorAll('#pk-list .sec'), function(d){ return d.textContent; }); });
    check(secs.length===2 && secs[0]==='KHÁCH 1:1 SẴN SÀNG TẬP · 3' && secs[1]==='KHÁCH 1:2 SẴN SÀNG TẬP · 3', 'nhóm: '+secs.join(' | '));
    check(await h.has('#pk-go','away'), 'CTA ẩn khi chưa chọn');
    await h.clip('pick');
    await page.click('#pk-list .row:has-text("Thành Long")'); await h.waitScreen('p-confirm'); await h.wait(900);
    check((await h.count('#cf-body .card'))===1 && (await h.txt('#cf-body .head .t1'))==='Thành Long', 'khách 1:1 → xác nhận ngay');
    await page.click('#cf-back'); await h.waitScreen('p-pick'); await h.wait(600);
    check((await h.ev(function(){ return state.sel.length; }))===0 && (await h.count('#pk-chips .chip'))===0, 'quay lại từ 1:1: bỏ chọn');
    await page.click('#pk-list .row:has-text("Doãn Quang")'); await h.wait(400);
    check((await h.screen())==='p-pick', '1:2 chạm không chuyển màn');
    check(await h.has('#pk-list .row[data-name="Bùi Doãn Quang"]','sel'), 'dòng .sel');
    check((await h.count('#pk-chips .chip'))===1 && (await h.txt('#pk-chips .chip span'))==='Doãn Quang', 'chip hiện');
    check(await h.has('#pk-chipw','on') && parseFloat(await h.css('#pk-chips','height'))>20, 'vùng chip mở');
    check((await h.txt('#pk-go'))==='Xác nhận · 1:1' && !(await h.has('#pk-go','away')), 'CTA 1:1: '+(await h.txt('#pk-go')));
    await page.click('#pk-list .row:has-text("Quang Vinh")'); await h.wait(400);
    check((await h.count('#pk-chips .chip'))===2 && (await h.txt('#pk-go'))==='Xác nhận · 1:2', 'CTA 1:2, 2 chip');
    await page.click('#pk-list .row:has-text("Trường Giang")'); await h.wait(400);
    check(/Tối đa 2 khách/.test(await h.pillText()) && (await h.has('#pill','err')), 'pill "Tối đa 2 khách": '+(await h.pillText()));
    check((await h.count('#pk-chips .chip:not(.out)'))===2 && !(await h.has('#pk-list .row[data-name="Lê Trường Giang"]','sel')), 'không chọn khách thứ 3');
    await page.fill('#pk-q','quang'); await h.wait(300);
    secs=await h.ev(function(){ return [].map.call(document.querySelectorAll('#pk-list .sec'), function(d){ return d.textContent; }); });
    check(secs.length===1 && secs[0]==='KHÁCH 1:2 SẴN SÀNG TẬP · 2', 'tìm giữ nhóm: '+secs.join(' | '));
    check((await h.count('#pk-chips .chip:not(.out)'))===2 && (await h.count('#pk-list .row.sel'))===2, 'tìm giữ lựa chọn');
    await page.fill('#pk-q',''); await h.wait(300);
    await page.click('#pk-chips .chip:has-text("Doãn Quang")'); await h.wait(400);
    check((await h.count('#pk-chips .chip:not(.out)'))===1 && !(await h.has('#pk-list .row[data-name="Bùi Doãn Quang"]','sel')) && (await h.txt('#pk-go'))==='Xác nhận · 1:1', 'bấm × chip → bỏ chọn');
    await page.click('#pk-list .row:has-text("Quang Vinh")'); await h.wait(400);
    check((await h.count('#pk-chips .chip:not(.out)'))===0 && (await h.has('#pk-go','away')), 'bỏ hết → CTA ẩn');
    await page.click('#p-pick .nav .ghost'); await h.waitScreen('p-home'); await h.wait(900);
  });

  await run('G', 'Xác nhận 1 và 2 khách: thẻ vệt, số, hook quiet giữ vệt; check-in → pill tự tắt', async function(){
    await page.click('#h-go'); await h.waitScreen('p-pick'); await h.wait(600);
    await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.click('#pk-list .row:has-text("Quang Vinh")'); await page.click('#pk-go'); await h.waitScreen('p-confirm'); await h.wait(1500);
    check(await h.has('#cf-body','halves') && (await h.count('#cf-body .half'))===2 && (await h.count('#cf-body .card.sm'))===2, '2 khách: hai nửa, thẻ nhỏ');
    var ns=await h.ev(function(){ return [].map.call(document.querySelectorAll('#cf-body .card>.n'), function(n){ return n.textContent; }); });
    check(ns.join(',')==='15,12', 'số buổi 2 khách: '+ns.join(','));
    check((await h.txt('#cf-go'))==='Check-in 2 khách', 'CTA: '+(await h.txt('#cf-go')));
    await h.clip('confirm-2');
    await page.click('#cf-back'); await h.waitScreen('p-pick'); await h.wait(500);
    await page.click('#pk-list .row:has-text("Thành Công")'); await h.waitScreen('p-confirm'); await h.wait(1500);
    var c=await h.ev(function(){ var c=document.querySelector('#cf-body .card'); var b=c.querySelector('.fill.b'), a=c.querySelector('.fill.a'); return {cls:c.className, n:c.querySelector('.n').textContent, of:c.querySelector('.of').textContent, x:c.style.getPropertyValue('--x'), y:c.style.getPropertyValue('--y'), tb:getComputedStyle(b).transform, ta:getComputedStyle(a).transform, bg:getComputedStyle(b).backgroundColor, ag:getComputedStyle(a).backgroundColor}; });
    check(/\bbig\b/.test(c.cls) && /\bin\b/.test(c.cls), 'thẻ lớn đã "in": '+c.cls);
    check(c.n==='8' && c.of==='/ 8', 'số 8 / 8: '+c.n+' '+c.of);
    check(c.bg==='rgb(250, 250, 250)' && c.ag==='rgb(212, 255, 0)', 'vệt Paper + Acid: '+c.bg+' '+c.ag);
    check(c.tb==='matrix(1, 0, 0, 1, 0, 0)' && c.ta==='matrix(1, 0, 0, 1, 0, 0)', 'vệt đã chạy hết: '+c.tb+' / '+c.ta);
    check(/BUỔI TẬP GẦN NHẤT/.test(await h.txt('#cf-body .lines .lab')), 'dòng buổi gần nhất: '+(await h.txt('#cf-body .lines .lab')));
    await h.wait(700);
    await h.ev(function(){ HOOK['p-confirm'](null,true); });
    var c2=await h.ev(function(){ var c=document.querySelector('#cf-body .card'); return {cls:c.className, n:c.querySelector('.n').textContent, tb:getComputedStyle(c.querySelector('.fill.b')).transform}; });
    check(/\bin\b/.test(c2.cls) && c2.n==='8' && c2.tb==='matrix(1, 0, 0, 1, 0, 0)', 'hook quiet giữ vệt + số: '+JSON.stringify(c2));
    await h.wait(300);
    c2=await h.ev(function(){ var c=document.querySelector('#cf-body .card'); return {tb:getComputedStyle(c.querySelector('.fill.b')).transform, ta:getComputedStyle(c.querySelector('.fill.a')).transform}; });
    check(c2.tb==='matrix(1, 0, 0, 1, 0, 0)' && c2.ta==='matrix(1, 0, 0, 1, 0, 0)', 'vệt vẫn nguyên sau 300ms');
    await h.clip('confirm-1');
    await page.click('#cf-go'); await h.waitScreen('p-plan'); await h.wait(700);
    check(await h.pillOn() && /^Đã check-in$/.test(await h.pillText()), 'pill check-in: '+(await h.pillText()));
    check((await h.ev(function(){ return CI['Đỗ Thành Công'].status; }))==='ok', 'CI ok');
    await h.wait(3500); check(!(await h.pillOn()), 'pill tự tắt sau 3,5s');
  });

  await run('I', 'Bài tập hôm nay: window thư viện, vùng cuộn sát ô tìm, tìm/chọn/bỏ, dimmer, lưới, kéo thả xoá, CTA', async function(){
    check(await h.has('#lib','on') && await h.has('#lib-dim','on'), 'window tự mở khi chưa có bài');
    check(await h.has('#pl-go','off') && (await h.txt('#pl-go'))==='Bắt đầu', 'CTA tắt khi chưa có bài');
    /* v2.4 mép cuộn iOS: danh sách phủ kín sheet (trôi dưới ô tìm), nhưng lúc chưa cuộn nội dung vẫn bắt đầu đúng chỗ cũ:
       mép lớp .eg.t == đáy ô tìm, dòng đầu == đáy ô tìm + 32px (padding cũ của .sheet .list) */
    var s=await h.rect('#lib .search'), l=await h.rect('#lib-list'), sh=await h.rect('#lib'), eg=await h.rect('#lib>.eg.t'), r1=await h.rect('#lib-list > :first-child');
    check(near(l.y, sh.y, 1) && near(l.b, sh.b, 1), '#lib-list phủ kín sheet: '+l.y+'..'+l.b+' vs '+sh.y+'..'+sh.b);
    check(eg && near(eg.b, s.b, 1), 'mép lớp .eg.t == bottom ô tìm: '+(eg&&eg.b)+' vs '+s.b);
    check(r1 && near(r1.y, s.b+32, 1), 'phần tử đầu cách ô tìm 32px như cũ: '+(r1&&r1.y)+' vs '+(s.b+32));
    check((await h.txt('#lib-go'))==='Đóng', 'nút Đóng khi chưa chọn');
    await page.fill('#lib-q','squat'); await h.wait(250);
    var nm=await h.ev(function(){ return [].map.call(document.querySelectorAll('#lib-list .row .nm'), function(e){ return e.textContent; }); });
    check(nm.length>=8 && nm.every(function(t){ return /squat/i.test(t); }), 'tìm "squat": '+nm.length);
    await page.fill('#lib-q','xyz'); await h.wait(250); check((await h.txt('#lib-list .empty'))==='KHÔNG TÌM THẤY BÀI NÀY', 'không tìm thấy bài');
    await page.fill('#lib-q',''); await h.wait(250);
    await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-list .row:nth-of-type(2)'); await page.click('#lib-list .row:nth-of-type(4)');
    check((await h.txt('#lib-go'))==='Chọn · 3 bài' && (await h.count('#lib-list .row.sel'))===3, 'chọn 3: '+(await h.txt('#lib-go')));
    await page.click('#lib-list .row:nth-of-type(2)'); check((await h.txt('#lib-go'))==='Chọn · 2 bài' && (await h.count('#lib-list .row.sel'))===2, 'bỏ 1: '+(await h.txt('#lib-go')));
    await h.clip('lib');
    await page.click('#lib-dim', {position:{x:10,y:40}}); await h.wait(500);
    check(!(await h.has('#lib','on')) && !(await h.has('#lib-dim','on')), 'đóng bằng dimmer');
    check((await h.count('#pl-grid .ptile:not(.add)'))===2 && (await h.count('#pl-grid .ptile.add'))===1, 'lưới 2 thẻ + ô thêm');
    check((await h.txt('#pl-grid .ptile:nth-child(1) .no'))==='01' && (await h.txt('#pl-grid .ptile.add .no'))==='03', 'số thứ tự');
    check(!(await h.has('#pl-go','off')) && (await h.txt('#pl-go'))==='Bắt đầu · 2 bài', 'CTA bật: '+(await h.txt('#pl-go')));
    var plan=await h.ev(function(){ return state.session.plan.slice(); });
    /* kéo thả xoá thẻ 2: giữ 250ms → nhấc → kéo tới vùng đỏ → thả */
    var t=await h.rect('#pl-grid .ptile:nth-child(2)'), dz=await h.rect('#pl-drop');
    await page.mouse.move(t.cx, t.cy); await page.mouse.down(); await h.wait(400);
    check(await h.has('#pl-drop','show') && await h.has('.ptile.lift', 'lift'), 'giữ → nhấc thẻ, vùng xoá hiện');
    await page.mouse.move(t.cx, t.cy+40, {steps:5}); await page.mouse.move(dz.cx, dz.cy, {steps:12}); await h.wait(150);
    check(await h.has('#pl-drop','hot') && /Thả để xoá/.test(await h.txt('#pl-drop')), 'trên vùng xoá: '+(await h.txt('#pl-drop')));
    await page.mouse.up(); await h.wait(400);
    check((await h.count('#pl-grid .ptile:not(.add)'))===1 && (await h.ev(function(){ return state.session.plan.join(); }))===plan[0], 'đã xoá thẻ 2');
    check((await h.txt('#pl-go'))==='Bắt đầu · 1 bài' && !(await h.has('#pl-drop','show')), 'CTA 1 bài, vùng xoá ẩn');
    /* kéo thả đổi chỗ: thêm bài rồi kéo thẻ 2 lên trước thẻ 1 */
    await page.click('#pl-grid .ptile.add'); await page.waitForSelector('#lib.on'); await h.wait(400); await page.click('#lib-list .row:nth-of-type(6)'); await page.click('#lib-go'); await h.wait(400);
    check((await h.count('#pl-grid .ptile:not(.add)'))===2, 'thêm bài qua ô Thêm bài');
    plan=await h.ev(function(){ return state.session.plan.slice(); }); t=await h.rect('#pl-grid .ptile:nth-child(2)'); var t1=await h.rect('#pl-grid .ptile:nth-child(1)');
    await page.mouse.move(t.cx, t.cy); await page.mouse.down(); await h.wait(400); await page.mouse.move(t1.x+20, t1.y+20, {steps:12}); await h.wait(100); await page.mouse.up(); await h.wait(400);
    var p2=await h.ev(function(){ return state.session.plan.slice(); }); check(p2[0]===plan[1] && p2[1]===plan[0], 'đổi chỗ: '+p2.join(' | '));
    check((await h.txt('#pl-grid .ptile:nth-child(1) .no'))==='01', 'đánh số lại');
    await h.clip('plan');
    await page.click('#pl-go'); await h.waitScreen('p-loop'); await h.wait(1300);
  });

  await run('J', 'Loop 1:1: bánh xe, số bay xuống đáy, Đạt, chuỗi lùi từng bước (↩ đang tập → thiết lập · ← đặt giờ → đang tập · ↩ đang nghỉ → đặt giờ), nghỉ "Hạt" (vành thở ra, mỗi giây một hạt, kéo lúc đếm), hết giờ, menu, đổi bài, kết thúc', async function(){
    var L='#loop-host .loop:nth-child(1) ';
    check(!(await h.has('#loop-host','two')) && (await h.count('#loop-host .loop'))===1, 'một nửa');
    var plan=await h.ev(function(){ return state.session.plan.map(exShort); });
    check((await h.txt(L+'.ex'))===plan[0] && (await h.txt(L+'.lp .head .sub'))==='Thiết lập set 1', 'bắt đầu ở bài 01 (sau khi đã đổi chỗ thẻ): '+(await h.txt(L+'.ex'))+' / '+(await h.txt(L+'.lp .head .sub'))+' · plan '+plan.join(' | '));
    check((await h.ev(function(){ return state.session.people[0].cur; }))===0, 'p.cur = 0 khi bắt đầu lần đầu');
    check(!(await h.hidden(L+'.setup')) && (await h.hidden(L+'.foot .nums')) && (await h.hidden(L+'.j0')), 'setup hiện, nums/Chưa đạt ẩn');
    var st0=await h.ev(function(){ return LOOPS[0].state(); }); check(st0.chase && st0.calm===1 && st0.dot===0 && st0.slices===0, 'thiết lập: vành nhịp lặng (calm 1, không chấm tâm), chưa có vành hạt: '+JSON.stringify(st0));
    var st=await h.ev(function(){ var p=state.session.people[0]; return [p.reps,p.kg]; }); check(st[0]===10 && st[1]===20, 'mặc định 10 × 20: '+st);
    await h.drag(L+'.setup .w-reps', 0, -60, {steps:8}); await h.wait(400);
    await h.drag(L+'.setup .w-kg', 0, -120, {steps:10}); await h.wait(400);
    st=await h.ev(function(){ var p=state.session.people[0]; return [p.reps,p.kg]; }); check(st[0]===11 && st[1]===25, 'kéo bánh xe → 11 × 25: '+st);
    check((await h.ev(function(){ return document.querySelector('#loop-host .setup .w-reps .v:nth-child(5)').textContent; }))==='11', 'mặt số reps hiện 11');
    check(!(await h.count('#loop-host .dimx')), 'blur tiêu điểm gỡ sau khi nhả');
    await h.clip('loop-setup');
    /* v2.5: bấm đúp vô tình (pill đổi nghĩa ngay dưới ngón tay) không được ghi set */
    var cb=await h.rect(L+'.c1'); await page.mouse.click(cb.cx, cb.cy); await h.wait(60); await page.mouse.click(cb.cx, cb.cy); await h.wait(60);
    var fl=await h.count('#loop-host .fly'); check(fl===2, 'số reps/kg bay xuống cụm đáy (2 bản sao .fly): '+fl);
    await h.wait(520);
    check((await h.ev(function(){ return state.session.people[0].phase; }))==='active' && (await h.txt(L+'.lp .head .sub'))==='Đang tập set 1', 'đang tập (chạm đúp không ghi set): '+(await h.ev(function(){ return state.session.people[0].phase; })));
    check(!(await h.count('#loop-host .fly')) && (await h.ev(function(){ return document.querySelector('#loop-host .fld.reps .line').style.opacity+'|'+document.querySelector('#loop-host .setup .w-reps .line').style.opacity; }))==='|', 'hạ cánh: bản sao gỡ, mặt số thật hiện lại');
    check(!(await h.hidden(L+'.foot .nums')) && !(await h.hidden(L+'.j0')) && !(await h.hidden(L+'.c1')) && (await h.has(L+'.c1','j1')), 'nums đáy + Chưa đạt hiện, pill chính thành Đạt (.j1)');
    var st1=await h.ev(function(){ return LOOPS[0].state(); }); check(st1.chase && st1.calm===0 && st1.dot===1, 'vành nhịp thức dậy (calm 0, chấm tâm): '+JSON.stringify(st1));
    check((await h.txt(L+'.j0'))==='Chưa đạt' && (await h.txt(L+'.j1'))==='Đạt', 'nút chấm');
    check((await h.ev(function(){ return document.querySelector('#loop-host .fld.reps .v:nth-child(5)').textContent+'|'+document.querySelector('#loop-host .fld.kg .v:nth-child(5)').textContent; }))==='11|25', 'số đáy 11 | 25');
    var gA=await h.ev(function(){ var g=document.querySelector('#loop-host .g1'); return g.querySelector('use').getAttribute('href')+'|'+g.getAttribute('aria-label'); });
    check(gA==='#i-undo|Hoàn tác', 'v2.6 · đang tập: nút trái ↩ "Hoàn tác" (trước: ← quay lại): '+gA);
    await page.click(L+'.g1'); await h.wait(600);
    check((await h.ev(function(){ return state.session.people[0].phase; }))==='setup' && (await h.txt(L+'.lp .head .sub'))==='Thiết lập set 1', 'hoàn tác → thiết lập');
    check((await h.ev(function(){ var g=document.querySelector('#loop-host .g1'); return g.querySelector('use').getAttribute('href')+'|'+g.getAttribute('aria-label'); }))==='#i-back|Quay lại', 'thiết lập: nút trái ← "Quay lại"');
    await page.click(L+'.c1'); await h.wait(500); await page.click(L+'.j1'); await h.wait(900);
    check(!(await h.has(L.trim(),'acid')) && (await h.css(L.trim(),'backgroundColor'))==='rgb(10, 10, 10)' && (await h.txt(L+'.lp .head .sub'))==='Bắt đầu nghỉ' && (await h.txt(L+'.ex'))==='Đã đạt set 1', 'màn đặt giờ nghỉ nền Ink (không còn Acid tràn màn): '+(await h.txt(L+'.ex')));
    var hs=await h.ev(function(){ return LOOPS[0].state(); }); check(hs.slices===90 && hs.N===90 && !hs.chase && !hs.acid, 'vành nhịp thở ra thành 90 hạt Paper (1:30): '+JSON.stringify(hs));
    check((await h.txt(L+'.c1'))==='Bắt đầu nghỉ' && (await h.css(L+'.c1','backgroundColor'))==='rgb(250, 250, 250)', 'CTA Paper "Bắt đầu nghỉ" (Figma 561:225)');
    check((await h.ev(function(){ var g=document.querySelector('#loop-host .g1'); return g.querySelector('use').getAttribute('href')+'|'+g.getAttribute('aria-label'); }))==='#i-back|Quay lại', 'v2.6 · đặt giờ nghỉ: nút trái ← "Quay lại" (trước: ↩ hoàn tác set)');
    check((await h.css(L+'.lp .head .t1 .ex','color'))==='rgba(250, 250, 250, 0.55)' && (await h.css(L+'.lp .head .sub > span.on','color'))==='rgb(250, 250, 250)', 'dòng đầu Paper 55 % / Paper');
    check(/^Đã ghi set 1$/.test(await h.pillText()), 'pill ghi set: '+(await h.pillText()));
    /* H2 — pill trên màn nghỉ Ink vẫn có viền, không còn biến thể trên Acid */
    var bc=await h.css('#pill','borderTopColor'); check(!(await h.has('#pill','onacid')) && bc!=='rgba(0, 0, 0, 0)' && bc!=='transparent', 'pill trên màn nghỉ có viền: '+bc);
    check((await h.ev(function(){ return document.querySelector('meta[name=theme-color]').getAttribute('content'); }))==='#0A0A0A', 'theme-color Ink khi nghỉ');
    check((await h.ev(function(){ return OUT.q.filter(function(e){return e.type==='SET'&&e.hold}).length; }))===1, 'set đang giữ (hold) trong outbox');
    check(!(await h.hidden(L+'.clock')) && (await h.txt(L+'.rh'))==='ĐẶT THỜI GIAN NGHỈ', 'đồng hồ đặt giờ');
    /* kéo ▲▼ lúc đặt giờ: +1 nấc = +15 hạt đổ ra từ con số */
    var dimD=null; await h.drag(L+'.clock .w-rest', 0, -80, {steps:8, before:async function(){ dimD=await h.ev(function(){ return {cv:document.querySelector('#loop-host canvas').classList.contains('dimx'), head:document.querySelector('#loop-host .lp .head').classList.contains('dimx')}; }); }}); await h.wait(700);
    check(dimD && !dimD.cv && dimD.head, 'đang kéo giờ nghỉ: khối đỉnh mờ, vành hạt KHÔNG mờ (hạt đổ vào là phản hồi): '+JSON.stringify(dimD));
    var hp=await h.ev(function(){ return {t:state.session.people[0].restTotal, s:LOOPS[0].state()}; }); check(hp.t===105 && hp.s.slices===105 && hp.s.N===105, 'kéo lên 1 nấc → 1:45 = 105 hạt: '+JSON.stringify(hp));
    await h.drag(L+'.clock .w-rest', 0, 80, {steps:8}); await h.wait(700);
    hp=await h.ev(function(){ return {t:state.session.people[0].restTotal, s:LOOPS[0].state().slices}; }); check(hp.t===90 && hp.s===90, 'kéo xuống lại → 90 hạt: '+JSON.stringify(hp));
    await h.clip('loop-rest-setup');
    /* v2.6 · ← lúc đặt giờ nghỉ = lùi về ĐANG TẬP đúng set đó (bỏ kết quả vừa chấm, set chưa từng rời máy) để chấm lại */
    await page.click(L+'.g1'); await h.wait(160);
    var rw=await h.ev(function(){ var s=LOOPS[0].state(); return {inh:s.inhale, slices:s.slices}; });
    check(rw.inh>0 && rw.slices===0, 'lùi: hạt đang tua ngược về vành nhịp (không hút về tâm, không tắt phụt): '+JSON.stringify(rw));
    await h.wait(740);
    var u=await h.ev(function(){ var p=state.session.people[0]; return {ph:p.phase, sets:p.ex[state.session.plan[p.cur]].sets.length, q:OUT.q.filter(function(e){return e.type==='SET'}).length, set:p.setNo}; });
    check(u.ph==='active' && u.sets===0 && u.q===0 && u.set===1, 'lùi về đang tập: set vừa chấm bị bỏ, không còn trong hàng đợi: '+JSON.stringify(u));
    check((await h.txt(L+'.lp .head .sub'))==='Đang tập set 1' && (await h.txt(L+'.ex'))===plan[0], 'dòng đầu về "'+plan[0]+'" / "Đang tập set 1": '+(await h.txt(L+'.ex'))+' / '+(await h.txt(L+'.lp .head .sub')));
    var su=await h.ev(function(){ return LOOPS[0].state(); }); check(su.slices===0 && su.chase && su.calm===0 && su.dot===1 && su.alpha===1, 'vành nhịp đang thức hiện lại (calm 0, chấm tâm): '+JSON.stringify(su));
    check((await h.hidden(L+'> .clock')) && !(await h.hidden(L+'.foot .nums')) && !(await h.hidden(L+'.j0')) && (await h.has(L+'.c1','j1')) && (await h.txt(L+'.c1'))==='Đạt', 'đồng hồ ẩn, cụm số + Chưa đạt / Đạt hiện lại');
    check((await h.ev(function(){ return document.querySelector('#loop-host .fld.reps .v:nth-child(5)').textContent+'|'+document.querySelector('#loop-host .fld.kg .v:nth-child(5)').textContent; }))==='11|25', 'giữ reps/kg của set: 11 | 25');
    check(/^Đã hoàn tác$/.test(await h.pillText()), 'pill hoàn tác: '+(await h.pillText()));
    await page.click(L+'.j1'); await h.wait(900);
    check((await h.ev(function(){ var p=state.session.people[0]; return p.phase+'|'+p.ex[state.session.plan[p.cur]].sets.length+'|'+OUT.q.filter(function(e){return e.type==='SET'&&e.hold}).length; }))==='rest-setup|1|1', 'chấm lại → đặt giờ nghỉ, đúng 1 set (đang giữ)');
    await page.click(L+'.c1'); await h.wait(700);
    check((await h.ev(function(){ return state.session.people[0].phase; }))==='rest' && (await h.txt(L+'.lp .head .sub'))==='Đang nghỉ', 'đang nghỉ');
    check((await h.txt(L+'.c1'))==='Nghỉ xong · kế tiếp', 'CTA nghỉ: '+(await h.txt(L+'.c1')));
    check((await h.ev(function(){ return OUT.q.filter(function(e){return e.type==='SET'&&e.hold}).length; }))===1, 'v2.6 · đang nghỉ: set vẫn GIỮ trong hàng đợi (còn lùi được) — trước: nhả lúc bắt đầu nghỉ');
    /* Hạt: mỗi giây một hạt — số hạt = số giây đang hiện (ceil) ở mọi mẫu; số hiện trên bánh xe = cùng giá trị */
    var ok=true, sm=[]; for(var i=0;i<6;i++){ var z=await h.ev(function(){ var s=LOOPS[0].state(); return {n:s.slices, sh:s.shown, acid:s.acid, g:s.ghost, t:document.querySelector('#loop-host .clock .w-rest .v:nth-child(5)').textContent}; }); sm.push(z.n+'/'+z.sh+'/'+z.t); if(!(z.acid && z.g && Math.abs(z.n-z.sh)<=1 && z.t===((Math.floor(z.sh/60))+':'+('0'+z.sh%60).slice(-2)))) ok=false; await h.wait(350); }
    check(ok, 'số hạt = số giây hiện (±1 trong khung vừa nhảy), vành Acid + bóng số 0: '+sm.join(' · '));
    check((await h.css(L+'.c1','backgroundColor'))==='rgb(212, 255, 0)' && (await h.ev(function(){ var g=document.querySelector('#loop-host .g1'); return g.querySelector('use').getAttribute('href')+'|'+g.getAttribute('aria-label'); }))==='#i-undo|Hoàn tác', 'v2.6 · đang nghỉ: CTA Acid (chủ studio 28/09), nút trái ↩ "Hoàn tác" (trước: Paper · ⌃ mở menu)');
    var cx=await h.rect(L+'> .clock'), rr=await h.rect(L.trim()); check(near(cx.y-rr.y, rr.h/2-40, 1), 'đồng hồ top = h/2−40: '+(cx.y-rr.y));
    await h.clip('loop-rest');
    /* kéo ▲▼ LÚC ĐANG ĐẾM = đổi thời gian CÒN LẠI (lean-journey §4): tổng = số hạt đã rụng + giá trị mới */
    await h.wait(1300);
    await h.drag(L+'.clock .w-rest', 0, 160, {steps:10}); await h.wait(700);
    var dr=await h.ev(function(){ var p=state.session.people[0], s=LOOPS[0].state(); return {tot:p.restTotal, left:s.left, sh:s.shown, n:s.slices, N:s.N}; });
    check(dr.sh<=60 && dr.sh>=57 && dr.n===dr.sh && dr.N===dr.tot && dr.tot-dr.sh>=1, 'kéo xuống 2 nấc lúc đang đếm → còn 1:00 (±3s), hạt = giây, tổng = đã rụng + mới: '+JSON.stringify(dr));
    /* v2.6 · ↩ lúc đang nghỉ = về ĐẶT GIỜ NGHỈ với đúng giờ đã đặt (1:30, dù vừa kéo đổi giờ lúc đếm): sóng Acid rút ngược, hạt đã rụng về lại vành */
    var ph0=await h.ev(function(){ return LOOPS[0].state().phi; });
    await page.click(L+'.g1');
    var c0=await h.ev(function(){ return document.querySelector('#loop-host .clock .w-rest .v:nth-child(5)').textContent; });
    check(c0!=='1:30', 'khung đầu sau khi bấm: con số vẫn là giờ đang hiện (mờ ra rồi mới đổi): '+c0);
    await h.wait(110);
    var cr=await h.ev(function(){ var p=state.session.people[0], s=LOOPS[0].state(); return {ph:p.phase, tot:p.restTotal, start:p.restStart, acid:s.acid, phi:s.phi}; });
    check(cr.ph==='rest-setup' && cr.tot===90 && cr.start===0, 'hoàn tác nghỉ → đặt giờ, tổng về giờ đã đặt 90: '+JSON.stringify(cr));
    check(cr.acid && cr.phi>0 && cr.phi<ph0, 'giữa lúc lùi: sóng Acid đang rút ngược (phi '+ph0.toFixed(2)+' → '+(cr.phi||0).toFixed(2)+')');
    await h.wait(1100);
    var cz=await h.ev(function(){ var s=LOOPS[0].state(); return {acid:s.acid, ghost:s.ghost, n:s.slices, N:s.N, t:document.querySelector('#loop-host .clock .w-rest .v:nth-child(5)').textContent, op:getComputedStyle(document.querySelector('#loop-host .clock .line')).opacity}; });
    check(!cz.acid && !cz.ghost && cz.n===90 && cz.N===90 && cz.t==='1:30' && cz.op==='1', 'đặt giờ lại: 90 hạt Paper, không bóng số 0, đồng hồ 1:30: '+JSON.stringify(cz));
    check((await h.txt(L+'.lp .head .sub'))==='Bắt đầu nghỉ' && (await h.txt(L+'.rh'))==='ĐẶT THỜI GIAN NGHỈ' && (await h.txt(L+'.c1'))==='Bắt đầu nghỉ' && (await h.css(L+'.c1','backgroundColor'))==='rgb(250, 250, 250)', 'chữ + nút về màn đặt giờ (Paper)');
    check((await h.ev(function(){ return OUT.q.filter(function(e){return e.type==='SET'&&e.hold}).length; }))===1, 'set vẫn giữ sau khi lùi');
    /* chuỗi lùi tiếp: ← về đang tập — set chưa từng gửi nên bỏ được */
    await page.click(L+'.g1'); await h.wait(900);
    check((await h.ev(function(){ var p=state.session.people[0]; return p.phase+'|'+p.ex[state.session.plan[p.cur]].sets.length+'|'+OUT.q.filter(function(e){return e.type==='SET'}).length; }))==='active|0|0', 'đang nghỉ ↩ → đặt giờ ← → đang tập: set bỏ hẳn, hàng đợi trống');
    await page.click(L+'.j1'); await h.wait(900); await page.click(L+'.c1'); await h.wait(700);
    check((await h.ev(function(){ return state.session.people[0].phase; }))==='rest', 'chấm lại → nghỉ lại');
    await h.ev(function(){ var p=state.session.people[0]; p.restTotal=6; p.restStart=Date.now(); saveSession(); }); await h.wait(3000);
    var l10=await h.ev(function(){ var s=LOOPS[0].state(); return {lt:s.lastTen, mg:s.merge, c:getComputedStyle(document.querySelector('#loop-host .clock .line')).color, N:s.N}; });
    check(l10.lt && l10.mg===1 && l10.c==='rgb(212, 255, 0)' && l10.N===6, '10 giây cuối: hạt gom tròn, con số Acid, vành theo tổng mới: '+JSON.stringify(l10));
    await h.wait(4200);
    check((await h.txt(L+'.lp .head .sub'))==='Hết giờ nghỉ', 'dòng 2 "Hết giờ nghỉ": '+(await h.txt(L+'.lp .head .sub')));
    check((await h.txt(L+'.c1'))==='Nghỉ xong · kế tiếp', 'CTA vẫn "Nghỉ xong · kế tiếp": '+(await h.txt(L+'.c1')));
    check((await h.ev(function(){ return document.querySelector('#loop-host .clock .w-rest .v:nth-child(5)').textContent; }))==='0:00', 'đồng hồ 0:00');
    var z0=await h.ev(function(){ return LOOPS[0].state(); }); check(z0.slices===0 && z0.zeroed && z0.ghost && z0.phase==='rest', 'hết hạt, còn bóng số 0, KHÔNG tự vào set: '+JSON.stringify(z0));
    /* v2.6 · ↩ ở 0:00: về đặt giờ với giờ đã đặt (mọi hạt về lại vành, "Hết giờ nghỉ" → "Bắt đầu nghỉ", số Acid → Paper) rồi nghỉ lại */
    await page.click(L+'.g1'); await h.wait(1200);
    var zr=await h.ev(function(){ var p=state.session.people[0], s=LOOPS[0].state(); return {ph:p.phase, tot:p.restTotal, n:s.slices, acid:s.acid, ghost:s.ghost, zeroed:s.zeroed, lt:s.lastTen, mg:s.merge, c:getComputedStyle(document.querySelector('#loop-host .clock .line')).color, t:document.querySelector('#loop-host .clock .w-rest .v:nth-child(5)').textContent}; });
    check(zr.ph==='rest-setup' && zr.tot===90 && zr.n===90 && !zr.acid && !zr.ghost && !zr.zeroed && !zr.lt && zr.mg===0 && zr.c==='rgb(250, 250, 250)' && zr.t==='1:30', 'hoàn tác ở 0:00 → đặt giờ 1:30, đủ 90 hạt Paper: '+JSON.stringify(zr));
    check((await h.txt(L+'.lp .head .sub'))==='Bắt đầu nghỉ', '"Hết giờ nghỉ" → "Bắt đầu nghỉ"');
    await h.ev(function(){ var p=state.session.people[0]; p.restTotal=6; saveSession(); LOOPS[0].field.setN(6,true); LOOPS[0].field.setCount(6,true); });
    await page.click(L+'.c1'); await h.wait(6900);
    check((await h.txt(L+'.lp .head .sub'))==='Hết giờ nghỉ', 'nghỉ lại tới 0:00');
    await page.click(L+'.c1'); await h.wait(450);
    check(await h.has(L+'.film','on') && (await h.txt(L+'.c1'))==='Vào set mới' && (await h.css(L+'.c1','backgroundColor'))==='rgb(250, 250, 250)', 'menu mở, CTA "Vào set mới" Paper dưới kính (kính Ink không pha Acid thành ô liu): '+(await h.txt(L+'.c1')));
    /* v2.5.2: màng = kính iOS như mép cuộn đáy — Ink 80 → 90 % trên lớp ::before + blur 11px trên chính .film; .film KHÔNG fade opacity (Safari tắt blur khi opacity < 1) */
    var gl=await h.ev(function(sel){ var f=document.querySelector(sel), cs=getComputedStyle(f), b=getComputedStyle(f,'::before'); return {bf:cs.backdropFilter||cs.webkitBackdropFilter, op:cs.opacity, vis:cs.visibility, bg:cs.backgroundColor, dim:b.backgroundImage, dop:b.opacity}; }, L+'.film');
    check(gl.bf==='blur(11px)' && gl.op==='1' && gl.vis==='visible' && gl.bg==='rgba(0, 0, 0, 0)' && gl.dim==='linear-gradient(rgba(10, 10, 10, 0.8), rgba(10, 10, 10, 0.9))' && gl.dop==='1', 'màng menu = kính (Ink 80–90 % + blur 11px, không opacity): '+JSON.stringify(gl));
    check((await h.count(L+'.film .exl button'))===2 && (await h.txt(L+'.fdone'))==='Đã xong '+plan[0] && (await h.txt(L+'.fend'))==='Kết thúc buổi tập', 'menu: '+(await h.txt(L+'.fdone')));
    check((await h.txt(L+'.film .exl button:nth-child(1) .sn'))==='Set 2' && (await h.txt(L+'.film .exl button:nth-child(2) .sn'))==='Set 1', 'số set trong menu');
    await h.clip('loop-film');
    await page.click(L+'.film', {position:{x:30,y:200}}); await h.wait(290);
    /* v2.5.2: các lựa chọn đang bay về nút không được trả về chỗ cũ trước khi chữ tắt (bản cũ trả lúc 200 ms → cả danh sách hiện lại rồi mới mờ) */
    var cl=await h.ev(function(sel){ var f=document.querySelector(sel); var it=[].slice.call(f.querySelectorAll('.exl>button, .inner>.act')).filter(function(e){ return getComputedStyle(e).display!=='none'; });
      return {on:f.classList.contains('on'), n:it.length, back:it.filter(function(e){ return !e.style.transform; }).length}; }, L+'.film');
    check(!cl.on && cl.n>0 && cl.back===0, 'đóng menu: lựa chọn chưa về chỗ khi chữ còn hiện (không nháy lại): '+JSON.stringify(cl));
    await h.wait(420); check(!(await h.has(L+'.film','on')) && (await h.txt(L+'.c1'))==='Nghỉ xong · kế tiếp' && (await h.css(L+'.c1','backgroundColor'))==='rgb(212, 255, 0)', 'chạm ngoài → đóng menu, CTA phục hồi (Acid)');
    var gz=await h.ev(function(sel){ var f=document.querySelector(sel), cs=getComputedStyle(f); return {vis:cs.visibility, bf:cs.backdropFilter||cs.webkitBackdropFilter, reset:[].every.call(f.querySelectorAll('.exl>button, .inner>.act'), function(e){ return !e.style.transform && !e.style.opacity; })}; }, L+'.film');
    check(gz.vis==='hidden' && gz.bf==='blur(0px)' && gz.reset, 'đóng xong: kính ẩn (visibility hidden, blur 0), lựa chọn đã về chỗ cho lần mở sau: '+JSON.stringify(gz));
    check((await h.ev(function(){ return OUT.q.filter(function(e){return e.type==='SET'&&e.hold}).length; }))===1, 'đóng menu: set vẫn giữ');
    await page.click(L+'.c1'); await h.wait(450); await page.click(L+'.film .exl button:nth-child(1)'); await h.wait(800);
    check((await h.txt(L+'.lp .head .sub'))==='Thiết lập set 2', 'chạm bài đang tập → set mới: '+(await h.txt(L+'.lp .head .sub')));
    check((await h.ev(function(){ return OUT.q.filter(function(e){return e.type==='SET'&&e.hold}).length; }))===0, 'vào set mới → nhả set vừa chấm cho hàng đợi gửi');
    var sn=await h.ev(function(){ return LOOPS[0].state(); }); check(sn.slices===0 && !sn.acid && sn.chase && sn.calm===1 && sn.alpha===1, 'vào set: hạt hút về tâm, vành nhịp nở lại: '+JSON.stringify(sn));
    check((await h.ev(function(){ return getComputedStyle(document.querySelector('#loop-host .clock .line')).color; }))==='rgb(250, 250, 250)', 'con số về Paper sau khi co');
    await page.click(L+'.c1'); await h.wait(500); await page.click(L+'.j0'); await h.wait(900);
    check((await h.txt(L+'.ex'))==='Chưa đạt set 2' && /^Chưa đạt set 2$/.test(await h.pillText()), 'set chưa đạt: '+(await h.txt(L+'.ex'))+' / '+(await h.pillText()));
    await page.click(L+'.c1'); await h.wait(700); await page.click(L+'.c1'); await h.wait(450);
    check(await h.has(L+'.film','on'), 'nút chính khi nghỉ → menu');
    await page.click(L+'.film .exl button:nth-child(2)'); await h.wait(900);
    check((await h.txt(L+'.ex'))===plan[1] && (await h.txt(L+'.lp .head .sub'))==='Thiết lập set 1', 'đổi bài: '+(await h.txt(L+'.ex'))+' / '+(await h.txt(L+'.lp .head .sub')));
    /* "Đã xong bài" khi chưa có set → pill lỗi (gọi thẳng, vì menu chỉ mở khi nghỉ) */
    await h.ev(function(){ document.querySelector('#loop-host .fdone').click(); }); await h.wait(400);
    check(await h.has('#pill','err') && /^Chưa ghi set nào/.test(await h.pillText()), 'Đã xong bài khi chưa có set → pill lỗi: '+(await h.pillText()));
    check((await h.ev(function(){ return state.session.people[0].cur; }))===1, 'vẫn ở bài 2');
    await page.click(L+'.c1'); await h.wait(500); await page.click(L+'.j1'); await h.wait(900); await page.click(L+'.c1'); await h.wait(700);
    await page.click(L+'.c1'); await h.wait(450); await page.click(L+'.fdone'); await h.wait(900);
    check((await h.txt(L+'.ex'))===plan[0] && (await h.txt(L+'.lp .head .sub'))==='Thiết lập set 3', 'Đã xong bài 2 → về bài 1 set 3: '+(await h.txt(L+'.ex'))+' / '+(await h.txt(L+'.lp .head .sub')));
    check((await h.ev(function(){ return state.session.people[0].ex[state.session.plan[1]].done; }))===true, 'bài 2 done');
    await page.click(L+'.c1'); await h.wait(500); await page.click(L+'.j1'); await h.wait(900); await page.click(L+'.c1'); await h.wait(700);
    await page.click(L+'.c1'); await h.wait(450);
    check(await h.has(L+'.film .exl button:nth-child(2)','done'), 'bài đã xong gạch ngang trong menu');
    await page.click(L+'.fend'); await h.waitScreen('p-summary'); await h.wait(900);
  });

  await run('M1', 'Tổng kết 1:1: form 1–6, ghi chú, xác nhận → xong → trang chủ; khách hôm nay', async function(){
    check((await h.txt('#sm-who'))==='Thành Công' && (await h.txt('#sm-title'))==='Tổng kết buổi 8', 'tiêu đề: '+(await h.txt('#sm-who'))+' / '+(await h.txt('#sm-title')));
    check((await h.txt('#sm-l1'))==='Đạt 3 / 4 set' && /2 bài/.test(await h.txt('#sm-l2')), 'thống kê: '+(await h.txt('#sm-l1'))+' / '+(await h.txt('#sm-l2')));
    check((await h.count('#sm-rows .exrow'))===2 && (await h.count('#sm-rows .exrow:nth-child(1) .dots2 i'))===3 && (await h.count('#sm-rows .exrow:nth-child(1) .dots2 i.no'))===1, 'hạt set: 3 hạt, 1 đỏ');
    check((await h.count('#sm-form button'))===6 && (await h.txt('#sm-go'))==='Xác nhận', 'form 6 nút, CTA Xác nhận');
    await page.click('#sm-form button:nth-child(4)'); check(await h.has('#sm-form button:nth-child(4)','on') && (await h.ev(function(){ return state.session.people[0].form; }))===4, 'chấm 4');
    await page.click('#sm-form button:nth-child(6)'); check(!(await h.has('#sm-form button:nth-child(4)','on')) && await h.has('#sm-form button:nth-child(6)','on'), 'đổi sang 6');
    await page.fill('#sm-note','Vai trái hơi mỏi'); await h.clip('summary');
    await page.click('#sm-go'); await h.waitScreen('p-done'); await h.wait(1300);
    var co=await h.ev(function(){ return demoDb().log.filter(function(e){return e.type==='CHECKOUT'}).map(function(e){ return [e.form,e.note,e.session]; }); }); await h.wait(1500);
    co=await h.ev(function(){ return demoDb().log.filter(function(e){return e.type==='CHECKOUT'}).map(function(e){ return [e.form,e.note,e.session]; }); });
    check(co.length===1 && co[0][0]===6 && co[0][1]==='Vai trái hơi mỏi' && co[0][2]===8, 'CHECKOUT gửi đúng: '+JSON.stringify(co));
    check((await h.count('#dn-body .card.done'))===1 && /Buổi thứ 8 đã xong/.test(await h.txt('#dn-body .lines')) && /Còn 0 buổi/.test(await h.txt('#dn-body .lines')), 'màn xong: '+(await h.txt('#dn-body .lines')));
    check((await h.ev(function(){ return localStorage.getItem('lb_session'); }))===null, 'buổi đã chốt');
    await h.clip('done');
    await page.click('#p-done .cta'); await h.waitScreen('p-home'); await h.wait(1500);
    check((await h.txt('#h-tiles .tile:nth-child(3) .tv'))==='1', 'ô Khách hôm nay = 1: '+(await h.txt('#h-tiles .tile:nth-child(3) .tv')));
    await page.click('#h-tiles .tile:nth-child(3)'); await page.waitForSelector('#csheet.on'); await h.wait(700);
    check((await h.txt('#cs-list .sec'))==='KHÁCH HÔM NAY · 1' && (await h.count('#cs-list .sec'))===1 && (await h.txt('#cs-list .row .nm'))==='Đỗ Thành Công', 'window hôm nay (khách vừa hết gói vẫn ở nhóm hôm nay): '+(await h.txt('#cs-list .sec')));
    check(/^ĐÃ TẬP HÔM NAY · \d\d:\d\d$/.test(await h.txt('#cs-list .row .lab')), 'meta dòng: giờ đã tập: '+(await h.txt('#cs-list .row .lab')));
    await page.click('#cs-go'); await h.wait(500); check(!(await h.has('#csheet','on')) && (await h.screen())==='p-home', 'Đóng window');
    /* khách hết gói không còn trong danh sách chọn khách */
    await page.click('#h-go'); await h.waitScreen('p-pick'); await h.wait(600);
    check(!(await h.count('#pk-list .row[data-name="Đỗ Thành Công"]')) && (await h.count('#pk-list .sec'))===2, 'khách dùng hết gói không còn trong chọn khách');
    /* biến thể xác nhận khi khách đã tập hôm nay (không tới được từ UI khi hết gói → gọi thẳng) */
    await h.ev(function(){ state.sel=['Đỗ Thành Công']; go('p-confirm','fwd'); }); await h.wait(1300);
    check((await h.txt('#cf-go'))==='Về trang chủ' && (await h.has('#cf-go','paper')) && (await h.ev(function(){ return document.getElementById('cf-back').hidden; })), 'biến thể Về trang chủ');
    check((await h.count('#cf-body .card.done'))===1 && /Buổi thứ 8 đã xong/.test(await h.txt('#cf-body .lines')), 'thẻ done: '+(await h.txt('#cf-body .lines')));
    await page.click('#cf-go'); await h.waitScreen('p-home'); await h.wait(900);
    check((await h.ev(function(){ return state.sel.length; }))===0, 'state.sel dọn');
  });

  await run('K', 'Loop 1:2: bố cục dọc, × đúng tâm vành, vạch ngăn, nav rút gọn luôn hiện ở mỗi nửa (48 · icon 24 · cách đáy 28), cụm số dưới khối đỉnh, luồng độc lập, đồng hồ giữa vùng trống, tổng kết 2 người, xong chia đôi', async function(){
    await h.startSession(['Doãn Quang','Quang Vinh'], [1,4]);
    check(await h.has('#loop-host','two') && (await h.count('#loop-host .loop'))===2, 'hai nửa');
    for(var i=1;i<=2;i++){ var L='#loop-host .loop:nth-child('+i+') ';
      check((await h.css(L+'.setup','flexDirection'))==='column', 'nửa '+i+' thiết lập dọc');
      var a=await h.rect(L+'.setup .w-reps'), x=await h.rect(L+'.setup .x'), k=await h.rect(L+'.setup .w-kg');
      check(a.b<=x.y+1 && x.b<=k.y+1, 'nửa '+i+' reps trên, × giữa, kg dưới: '+[a.b,x.y,x.b,k.y].join(','));
      var rr=await h.rect(L.trim()), cy=await h.ev(function(i){ return LOOPS[i].ring.cy; }, i-1);
      check(near(x.cy-rr.y, cy, 3), 'nửa '+i+' tâm × ≈ ring.cy: '+(x.cy-rr.y).toFixed(1)+' vs '+cy);
      var hd0=await h.rect(L+'.lp .head'); var exp0=(hd0.b-rr.y)+((rr.h-28)-(hd0.b-rr.y))/2; check(near(cy, exp0, 2), 'nửa '+i+' ring.cy = giữa vùng trống (head.b→đáy−28): '+cy+' vs '+exp0.toFixed(1));
      check((await h.txt(L+'.who'))===(i===1?'Doãn Quang':'Quang Vinh'), 'tên nửa '+i+': '+(await h.txt(L+'.who')));
    }
    var sep=await h.ev(function(){ var cs=getComputedStyle(document.querySelector('#loop-host .loop:nth-child(2)'),'::before'); return {c:cs.content, bg:cs.backgroundColor, h:cs.height, top:cs.top}; });
    check(sep.c!=='none' && sep.bg==='rgba(250, 250, 250, 0.14)' && sep.h==='1px' && sep.top==='0px', 'vạch ngăn: '+JSON.stringify(sep));
    /* v2.6 · nav rút gọn LUÔN HIỆN ở đáy mỗi nửa (thay chạm-để-mở .ovl + làm mờ cả nửa): nút tròn 48, icon 24, đáy nút cách đáy nửa 28 */
    async function nav2(i){ return page.evaluate(function(i){
      var L=document.querySelector('#loop-host .loop:nth-child('+i+')'), R=L.getBoundingClientRect();
      function b(sel){ var e=L.querySelector(sel); if(!e || e.hidden) return null; var r=e.getBoundingClientRect(), g=e.querySelector('svg'), gr=g?g.getBoundingClientRect():null, cs=getComputedStyle(e);
        return {x:r.left-R.left, r:R.right-r.right, bot:R.bottom-r.bottom, left:r.left, right:r.right, w:r.width, h:r.height, iw:gr?gr.width:0, ih:gr?gr.height:0,
                icon:g?g.querySelector('use').getAttribute('href'):'', label:e.getAttribute('aria-label'), bg:cs.backgroundColor, bc:cs.borderTopColor, cx:r.left+r.width/2, cy:r.top+r.height/2}; }
      return {g1:b('.lp .g1'), c1:b('.lp .c1'), j0:b('.lp .j0'), op:getComputedStyle(L.querySelector('.lp .nav')).opacity, ovl:L.classList.contains('ovl'), txt:(L.querySelector('.lp .c1').textContent||'').trim()};
    }, i); }
    async function hitOk(n){ return page.evaluate(function(p){ var e=document.elementFromPoint(p.x,p.y); return !!(e && e.closest(p.s)); }, n); }
    var r1=await h.rect('#loop-host .loop:nth-child(1)'), r2=await h.rect('#loop-host .loop:nth-child(2)');
    for(i=1;i<=2;i++){
      var nv=await nav2(i);
      check(nv.op==='1' && !nv.ovl && nv.g1 && nv.c1 && !nv.j0, 'nửa '+i+' · nav luôn hiện, không còn .ovl: '+JSON.stringify({op:nv.op, ovl:nv.ovl}));
      check(nv.g1.w===48 && nv.g1.h===48 && nv.c1.w===48 && nv.c1.h===48 && nv.g1.iw===24 && nv.c1.iw===24, 'nửa '+i+' · nút tròn 48×48, icon 24: g1 '+nv.g1.w+'×'+nv.g1.h+'/'+nv.g1.iw+' · c1 '+nv.c1.w+'×'+nv.c1.h+'/'+nv.c1.iw);
      check(near(nv.g1.bot,28,.5) && near(nv.c1.bot,28,.5) && near(nv.g1.x,24,.5) && near(nv.c1.r,24,.5), 'nửa '+i+' · đáy nút cách đáy nửa 28, rail 24: g1 bot '+nv.g1.bot+' x '+nv.g1.x+' · c1 bot '+nv.c1.bot+' r '+nv.c1.r);
      check(nv.g1.icon==='#i-back' && nv.g1.label==='Quay lại' && nv.c1.icon==='#i-play' && nv.c1.label==='Bắt đầu set' && nv.c1.bg==='rgb(212, 255, 0)' && nv.txt==='', 'nửa '+i+' · thiết lập: ← | ▷ Acid, chỉ icon (nhãn ở aria-label)');
      check((await hitOk({x:nv.c1.cx, y:nv.c1.cy, s:'.c1'})) && (await hitOk({x:nv.g1.cx, y:nv.g1.cy, s:'.g1'})), 'nửa '+i+' · chạm tâm nút tới đúng nút');
      check((await h.css('#loop-host .loop:nth-child('+i+') .setup .w-reps','filter'))==='none', 'nửa '+i+' · không làm mờ nội dung');
    }
    /* chạm vùng trống của nửa: không còn mở/đóng gì */
    await h.tapAt(12, r1.cy); await h.wait(400);
    check(!(await h.count('#loop-host .loop.ovl')) && (await h.css('#loop-host .loop:nth-child(1) .setup .w-reps','filter'))==='none' && (await nav2(1)).op==='1', 'chạm vùng trống: không blur, nav vẫn hiện');
    /* bánh xe kéo được trực tiếp */
    var reps0=await h.ev(function(){ return state.session.people[0].reps; });
    await h.drag('#loop-host .loop:nth-child(1) .setup .w-reps', 0, -44, {steps:6}); await h.wait(300);
    check((await h.ev(function(){ return state.session.people[0].reps; }))===reps0+1, 'kéo bánh xe đổi số ngay');
    await h.clip('loop-two-setup'); await shot(page, 'K-two-setup-note');
    var hb=await h.rect('#loop-host .loop:nth-child(1) .lp .head'), ra=await h.rect('#loop-host .loop:nth-child(1) .setup .w-reps'), kb=await h.rect('#loop-host .loop:nth-child(1) .setup .w-kg'), nb=await h.rect('#loop-host .loop:nth-child(1) .lp .g1');
    note('1:2 @393×852 nửa 1: head.bottom='+hb.b.toFixed(0)+' · hộp reps top='+ra.y.toFixed(0)+' · hộp kg bottom='+kb.b.toFixed(0)+' · nút nav top='+nb.y.toFixed(0)+' (hộp reps chớm đè head '+Math.max(0,hb.b-ra.y).toFixed(0)+'px — ảnh K-two-setup-note.png)');
    /* luồng độc lập: nút ở nửa nào tác động nửa đó */
    var cy1=await h.ev(function(){ return LOOPS[0].ring.cy; });
    await page.click('#loop-host .loop:nth-child(1) .c1'); await h.wait(600);
    check((await h.ev(function(){ return state.session.people.map(function(p){return p.phase}).join(); }))==='active,setup', 'nửa 1 tập, nửa 2 thiết lập');
    var na=await nav2(1), hd1=await h.rect('#loop-host .loop:nth-child(1) .lp .head'), nm1=await h.rect('#loop-host .loop:nth-child(1) .lp .nums');
    check(near(nm1.y-hd1.b, 28, 1), 'đang tập: cụm reps/kg ngay dưới khối đỉnh, cách 28: '+(nm1.y-hd1.b).toFixed(1));
    check((await h.ev(function(){ return LOOPS[0].ring.cy; }))===cy1, 'đang tập: vành nhịp không dịch khi cụm số lên trên: '+cy1);
    check(na.j0 && na.j0.w===48 && na.j0.h===48 && na.j0.icon==='#i-x' && na.j0.label==='Chưa đạt' && na.j0.bc==='rgb(233, 37, 105)' && near(na.c1.left-na.j0.right, 8, .5), 'đang tập: × Chưa đạt tròn 48 viền đỏ, cách ✓ 8: '+JSON.stringify(na.j0&&{w:na.j0.w, icon:na.j0.icon, bc:na.j0.bc, gap:(na.c1.left-na.j0.right)}));
    check(na.c1.icon==='#i-check' && na.c1.label==='Đạt' && na.c1.bg==='rgb(212, 255, 0)' && na.g1.icon==='#i-undo' && na.g1.label==='Hoàn tác', 'đang tập: ↩ | × ✓ Acid');
    var nm1b=await h.rect('#loop-host .loop:nth-child(1) .lp .fld.reps'), g1r=await h.rect('#loop-host .loop:nth-child(1) .lp .g1');
    check(nm1b.b<=g1r.y, 'cụm số không đè nav: '+nm1b.b.toFixed(0)+' ≤ '+g1r.y.toFixed(0));
    await h.clip('loop-two-active');
    await page.click('#loop-host .loop:nth-child(1) .g1'); await h.wait(600);
    check((await h.ev(function(){ return state.session.people.map(function(p){return p.phase}).join(); }))==='setup,setup' && (await nav2(1)).c1.icon==='#i-play', 'nửa 1 ↩ → thiết lập (nửa 2 không đổi)');
    await page.click('#loop-host .loop:nth-child(1) .c1'); await h.wait(600);
    await page.click('#loop-host .loop:nth-child(2) .c1'); await h.wait(500); await page.click('#loop-host .loop:nth-child(2) .j1'); await h.wait(900);
    check((await h.ev(function(){ return state.session.people.map(function(p){return p.phase}).join(); }))==='active,rest-setup', 'nửa 2 đặt giờ nghỉ, nửa 1 vẫn tập');
    var nr=await nav2(2); check(nr.c1.icon==='#i-play' && nr.c1.label==='Bắt đầu nghỉ' && nr.c1.bg==='rgb(250, 250, 250)' && nr.g1.icon==='#i-back' && !nr.j0, 'nửa 2 đặt giờ nghỉ: ← | ▷ Paper');
    var s2=await h.ev(function(){ return LOOPS[1].state(); }); check(s2.slices===90 && !s2.chase && s2.s<1 && s2.sx>=s2.s, 'nửa 2: vành hạt thu nhỏ theo nửa màn (s '+s2.s.toFixed(3)+', sx '+s2.sx.toFixed(3)+'): '+JSON.stringify(s2));
    sep=await h.ev(function(){ return getComputedStyle(document.querySelector('#loop-host .loop:nth-child(2)'),'::before').backgroundColor; }); check(sep==='rgba(250, 250, 250, 0.14)', 'vạch ngăn luôn hairline (không còn nửa Acid): '+sep);
    check((await h.ev(function(){ return document.querySelector('meta[name=theme-color]').getAttribute('content'); }))==='#0A0A0A', 'theme-color Ink');
    await page.click('#loop-host .loop:nth-child(2) .c1'); await h.wait(700);
    check((await h.ev(function(){ return state.session.people[1].phase; }))==='rest', 'nửa 2 nghỉ');
    nr=await nav2(2); check(nr.c1.icon==='#i-check' && nr.c1.label==='Nghỉ xong · kế tiếp' && nr.c1.bg==='rgb(212, 255, 0)' && nr.g1.icon==='#i-undo' && nr.g1.label==='Hoàn tác', 'nửa 2 đang nghỉ: ↩ | ✓ Acid');
    var ck=await h.rect('#loop-host .loop:nth-child(2) > .clock'), hd=await h.rect('#loop-host .loop:nth-child(2) .lp .head');
    check(ck.y>=hd.b && ck.b<=r2.b-27, 'đồng hồ nửa 2 giữa vùng trống: clock '+ck.y.toFixed(0)+'–'+ck.b.toFixed(0)+' head.b '+hd.b.toFixed(0)+' đáy '+(r2.b-28).toFixed(0));
    var mid=(hd.b+(r2.b-28))/2; check(near(ck.cy, mid, 3), 'đồng hồ giữa đáy head và mép đệm đáy: '+ck.cy.toFixed(1)+' vs '+mid.toFixed(1));
    check(ck.b<=r2.b-28-48, 'đồng hồ không đè hàng nút: '+ck.b.toFixed(0)+' ≤ '+(r2.b-76).toFixed(0));
    var cyp=await h.ev(function(){ return LOOPS[1].state().cyp; }); check(near(cyp, (ck.y-r2.y)+36, 1), 'tâm vành hạt = tâm quang học con số 72 (clock top + 36): '+cyp+' vs '+((ck.y-r2.y)+36).toFixed(1));
    var d2=await h.ev(function(){ var v=document.querySelector('#loop-host .loop:nth-child(2) .clock .w-rest .v:nth-child(5)'); var r=document.createRange(); r.selectNodeContents(v); var q=r.getBoundingClientRect(); return {l:q.left, r:q.right}; }), s2b=await h.ev(function(){ return LOOPS[1].state(); });
    var inner=(156-13)*s2b.sx; check(d2.l>=s2b.cx-inner-1 && d2.r<=s2b.cx+inner+1, 'mép trong vành hạt không đè con số: số '+d2.l.toFixed(0)+'–'+d2.r.toFixed(0)+' · vành trong ±'+inner.toFixed(0)+' quanh '+s2b.cx);
    check((await h.ev(function(){ return LOOPS[0].p.phase+'|'+document.querySelector('#loop-host .loop:nth-child(1) .lp .head .sub').textContent; }))==='active|Đang tập set 1', 'nửa 1 không bị ảnh hưởng');
    await h.clip('loop-two-rest');
    /* ↩ ở nửa 2 lúc đang nghỉ → đặt giờ nghỉ của nửa 2; nửa 1 vẫn tập */
    await page.click('#loop-host .loop:nth-child(2) .g1'); await h.wait(900);
    check((await h.ev(function(){ return state.session.people.map(function(p){return p.phase}).join(); }))==='active,rest-setup' && (await nav2(2)).c1.bg==='rgb(250, 250, 250)', 'nửa 2 ↩ → đặt giờ nghỉ (nửa 1 không đổi)');
    await page.click('#loop-host .loop:nth-child(2) .c1'); await h.wait(700);
    await page.click('#loop-host .loop:nth-child(1) .j1'); await h.wait(900); await page.click('#loop-host .loop:nth-child(1) .c1'); await h.wait(700);
    check((await h.ev(function(){ return state.session.people.map(function(p){return p.phase}).join(); }))==='rest,rest', 'cả hai nghỉ');
    check((await h.ev(function(){ return document.querySelector('meta[name=theme-color]').getAttribute('content'); }))==='#0A0A0A', 'theme-color vẫn Ink khi cả hai nửa nghỉ');
    var sz=await h.ev(function(){ return [LOOPS[0].state().s, LOOPS[1].state().s, LOOPS[0].state().sx, LOOPS[1].state().sx]; }); check(sz[0]===sz[1] && sz[2]===sz[3], 'hai nửa: vành hạt cùng cỡ: '+sz.join(','));
    await page.click('#loop-host .loop:nth-child(1) .c1'); await h.wait(450); check(await h.has('#loop-host .loop:nth-child(1) .film','on') && !(await h.has('#loop-host .loop:nth-child(2) .film','on')), 'menu nửa 1 (nửa 2 không mở)');
    await page.click('#loop-host .loop:nth-child(1) .fend'); await h.waitScreen('p-summary'); await h.wait(900);
    check((await h.txt('#sm-who'))==='Doãn Quang' && (await h.txt('#sm-go'))==='Tiếp theo' && (await h.txt('#sm-title'))==='Tổng kết buổi 15', 'tổng kết người 1: '+(await h.txt('#sm-who'))+' / '+(await h.txt('#sm-go')));
    await page.click('#sm-form button:nth-child(5)'); await page.fill('#sm-note','Người 1'); await page.click('#sm-go'); await h.waitScreen('p-summary'); await h.wait(900);
    check((await h.txt('#sm-who'))==='Quang Vinh' && (await h.txt('#sm-go'))==='Xác nhận' && (await h.txt('#sm-title'))==='Tổng kết buổi 12', 'tổng kết người 2: '+(await h.txt('#sm-who'))+' / '+(await h.txt('#sm-go')));
    check((await h.ev(function(){ return $('sm-note').value; }))==='' && !(await h.count('#sm-form button.on')), 'form/ghi chú người 2 trống');
    await page.click('#p-summary .nav .ghost'); await h.waitScreen('p-summary'); await h.wait(700);
    check((await h.txt('#sm-who'))==='Doãn Quang' && (await h.ev(function(){ return $('sm-note').value; }))==='Người 1' && (await h.has('#sm-form button:nth-child(5)','on')), 'quay lại người 1 giữ form/ghi chú');
    await page.click('#sm-go'); await h.waitScreen('p-summary'); await h.wait(700);
    await page.click('#sm-form button:nth-child(3)'); await page.click('#sm-go'); await h.waitScreen('p-done'); await h.wait(1300);
    check(await h.has('#dn-body','halves') && (await h.count('#dn-body .half'))===2 && (await h.count('#dn-body .card.sm.done'))===2, 'màn xong chia đôi');
    var dn=await h.ev(function(){ return [].map.call(document.querySelectorAll('#dn-body .half .head .t1'), function(e){ return e.textContent; }); }); check(dn.join(',')==='Doãn Quang,Quang Vinh', 'tên 2 nửa: '+dn);
    await h.clip('done-two');
    await page.click('#p-done .cta'); await h.waitScreen('p-home'); await h.wait(2500);
    check((await h.txt('#h-tiles .tile:nth-child(3) .tv'))==='3', 'khách hôm nay = 3: '+(await h.txt('#h-tiles .tile:nth-child(3) .tv')));
    var co=await h.ev(function(){ var o={}; demoDb().log.forEach(function(e){ if(e.type==='CHECKOUT') o[e.name]=(o[e.name]||0)+1; }); return o; });
    check(co['Nguyễn Quang Vinh']===1, 'CHECKOUT người 2 đúng 1: '+JSON.stringify(co));
    if(co['Bùi Doãn Quang']!==1) note('CẦN QUYẾT: 1:2 bấm Tiếp theo → Quay lại → Tiếp theo gửi CHECKOUT người 1 '+co['Bùi Doãn Quang']+' lần (summaryNext không nhớ đã gửi; BÀI có cờ sent, CHECKOUT thì không)');
    /* chọn khách: khách còn buổi + đã tập hôm nay → nhóm ĐÃ TẬP HÔM NAY, mờ, có giờ ký */
    await page.click('#h-go'); await h.waitScreen('p-pick'); await h.wait(600);
    check((await h.ev(function(){ var s=document.querySelectorAll('#pk-list .sec'); return s[s.length-1].textContent; }))==='KHÁCH ĐÃ TẬP HÔM NAY · 1' && (await h.has('#pk-list .row[data-name="Bùi Doãn Quang"]','off')), 'chọn khách: nhóm đã tập hôm nay (Quang còn buổi)');
    check(/ĐÃ TẬP HÔM NAY · \d\d:\d\d/.test(await h.txt('#pk-list .row[data-name="Bùi Doãn Quang"] .lab')), 'meta giờ ký: '+(await h.txt('#pk-list .row[data-name="Bùi Doãn Quang"] .lab')));
    check(!(await h.count('#pk-list .row[data-name="Nguyễn Quang Vinh"]')), 'Vinh hết gói → không còn trong danh sách');
    await h.clip('pick-done'); await page.click('#p-pick .nav .ghost'); await h.waitScreen('p-home'); await h.wait(900);
  });

  await run('M2', 'Buổi dở: reload giữa loop → vào lại đúng màn; "Tiếp tục buổi tập" ở xác nhận và trang chủ', async function(){
    await h.startSession(['Thành Long'], [3]);
    var ex=await h.txt('#loop-host .ex');
    await page.click('#loop-host .c1'); await h.wait(500); await page.click('#loop-host .j1'); await h.wait(900); await page.click('#loop-host .c1'); await h.wait(700);
    await page.reload(); await h.wait(1800);
    check((await h.screen())==='p-loop' && (await h.count('#loop-host .loop'))===1, 'reload → về p-loop: '+(await h.screen()));
    check((await h.ev(function(){ return state.session.people[0].phase; }))==='rest' && (await h.txt('#loop-host .lp .head .sub'))==='Đang nghỉ', 'khôi phục đúng pha nghỉ');
    check((await h.ev(function(){ return OUT.q.some(function(e){return e.hold}); }))===false, 'mở lại app: không còn hold');
    await page.click('#loop-host .c1'); await h.wait(450); await page.click('#loop-host .film .exl button:nth-child(1)'); await h.wait(900);
    check((await h.txt('#loop-host .ex'))===ex && (await h.txt('#loop-host .lp .head .sub'))==='Thiết lập set 2', 'set 2 sau khôi phục');
    await page.click('#loop-host .g1'); await h.waitScreen('p-plan'); await h.wait(600);
    check((await h.txt('#pl-grid .ptile:nth-child(1) .pst'))==='Set 2' && !/SET/.test(await h.txt('#pl-grid .ptile:nth-child(1) .lab')) && (await h.txt('#pl-go'))==='Bắt đầu · 1 bài', 'lưới bài ghi tình trạng dưới tên (v2.7.3: "Set 2", nhãn đáy không còn số set): '+(await h.txt('#pl-grid .ptile:nth-child(1) .pst')));
    await page.click('#p-plan .nav .ghost'); await h.waitScreen('p-confirm'); await h.wait(1200);
    check((await h.txt('#cf-go'))==='Tiếp tục buổi tập' && /Đang ghi buổi 4/.test(await h.txt('#cf-body .lines')), 'xác nhận: Tiếp tục buổi tập / '+(await h.txt('#cf-body .lines .a')));
    await page.click('#cf-back'); await h.waitScreen('p-pick'); await h.wait(500);
    check(!(await h.has('#pk-list .row[data-name="Nguyễn Thành Long"]','off')), 'khách đang ghi buổi vẫn chọn được');
    await page.click('#p-pick .nav .ghost'); await h.waitScreen('p-home'); await h.wait(900);
    check((await h.txt('#h-go'))==='Tiếp tục buổi tập', 'trang chủ: '+(await h.txt('#h-go')));
    await page.click('#h-go'); await h.waitScreen('p-loop'); await h.wait(1200);
    check((await h.txt('#loop-host .lp .head .sub'))==='Thiết lập set 2', 'tiếp tục → loop set 2');
    await h.finishSession();
    check((await h.txt('#h-go'))==='Vào buổi tập' && (await h.txt('#h-tiles .tile:nth-child(3) .tv'))==='4', 'kết thúc: CTA Vào buổi tập, khách hôm nay 4: '+(await h.txt('#h-go'))+' / '+(await h.txt('#h-tiles .tile:nth-child(3) .tv'))+' / checked='+(await h.ev(function(){ return state.clients.filter(function(c){return c.checked}).map(function(c){return c.name}).join('|')+' ci='+Object.keys(CI).filter(function(k){return CI[k].status==='ok'&&CI[k].day===TODAY_ISO}).join('|'); })));
  });

  await ctx.close();

  /* =================================================================
     NGỮ CẢNH 2/3 — L · căn giữa responsive
     ================================================================= */
  for(var vp of [{width:375,height:667},{width:430,height:932}]){
    var ctxL=await mkctx(browser, vp), pageL=await ctxL.newPage(); watch(pageL,'L'+vp.width); P=pageL; var hl=H(pageL);
    await pageL.goto(URL+'?demo'); await pageL.waitForSelector('#p-pin.on'); await hl.wait(500);
    await run('L'+vp.width, 'Căn giữa '+vp.width+'×'+vp.height+': 1:1 ring/setup/clock, 1:2 × mỗi nửa', async function(){
      await hl.login(); await hl.startSession(['Thành Công'], [1]);
      var rr=await hl.rect('#loop-host .loop'), cy=await hl.ev(function(){ return LOOPS[0].ring.cy; });
      check(near(rr.h, vp.height, 1), 'loop cao bằng màn: '+rr.h);
      check(near(cy, vp.height/2+16, 1), 'ring.cy = h/2+16: '+cy+' vs '+(vp.height/2+16));
      var su=await hl.rect('#loop-host .setup'); check(near(su.cy-rr.y, cy, 3), 'tâm .setup ≈ ring.cy: '+(su.cy-rr.y).toFixed(1)+' vs '+cy);
      var x=await hl.rect('#loop-host .setup .x'); check(near(x.cy-rr.y, cy, 3), 'tâm × ≈ ring.cy: '+(x.cy-rr.y).toFixed(1));
      var wk=await hl.rect('#loop-host .setup .w-kg'); check(wk.r<=vp.width-24+1 && wk.x>=24-1, 'bánh xe trong rail');
      await pageL.click('#loop-host .c1'); await hl.wait(500); await pageL.click('#loop-host .j1'); await hl.wait(900);
      var ck=await hl.rect('#loop-host .loop > .clock'); check(near(ck.y-rr.y, vp.height/2-40, 1), '.clock top = h/2−40: '+(ck.y-rr.y).toFixed(1)+' vs '+(vp.height/2-40));
      var nv=await hl.rect('#loop-host .lp .nav'); check(ck.b<=nv.y && ck.y>=(await hl.rect('#loop-host .lp .head')).b, 'đồng hồ không đè head/nav');
      await hl.clip('L'+vp.width+'-rest');
      await pageL.click('#loop-host .c1'); await hl.wait(600); await pageL.click('#loop-host .c1'); await hl.wait(450); await pageL.click('#loop-host .fend'); await hl.waitScreen('p-summary'); await hl.wait(800);
      await pageL.click('#sm-go'); await hl.waitScreen('p-done'); await hl.wait(1200); await pageL.click('#p-done .cta'); await hl.waitScreen('p-home'); await hl.wait(1400);
      await hl.startSession(['Doãn Quang','Quang Vinh'], [1,2]);
      for(var i=1;i<=2;i++){ var L='#loop-host .loop:nth-child('+i+') '; var r=await hl.rect(L.trim()), c=await hl.ev(function(i){ return LOOPS[i].ring.cy; }, i-1), xx=await hl.rect(L+'.setup .x');
        check(near(xx.cy-r.y, c, 3), 'nửa '+i+' tâm × ≈ ring.cy: '+(xx.cy-r.y).toFixed(1)+' vs '+c);
        var hd=await hl.rect(L+'.lp .head'); var expc=(hd.b-r.y)+((r.h-28)-(hd.b-r.y))/2; check(near(c, expc, 2), 'nửa '+i+' ring.cy = giữa vùng trống: '+c+' vs '+expc.toFixed(1));
        var a=await hl.rect(L+'.setup .w-reps'), k=await hl.rect(L+'.setup .w-kg'), g=await hl.rect(L+'.lp .g1'), c=await hl.rect(L+'.lp .c1');
        check(a.y>=hd.b-1 && k.b<=r.y+r.h-27, 'nửa '+i+' thiết lập không đè head/đáy: reps.y '+a.y.toFixed(0)+' head.b '+hd.b.toFixed(0)+' kg.b '+k.b.toFixed(0)+' đáy '+(r.y+r.h-28).toFixed(0));
        check(near(r.b-g.b, 28, .5) && near(r.b-c.b, 28, .5) && g.w===48 && c.w===48, 'nửa '+i+' nav rút gọn 48, cách đáy nửa 28: '+(r.b-g.b).toFixed(1));
        /* hàng số của khối thiết lập (xếp ngang khi nửa thấp) không đè hai nút góc */
        var hitS=await hl.ev(function(p){ var e=document.elementFromPoint(p.x,p.y); return !!(e && e.closest('.c1')); }, {x:c.cx, y:c.cy}); check(hitS, 'nửa '+i+' chạm tâm ▷ tới đúng nút'); }
      /* đang tập ở nửa thấp: cụm reps/kg dưới khối đỉnh 28, không đè hàng nút */
      await pageL.click('#loop-host .loop:nth-child(2) .c1'); await hl.wait(700);
      var L2='#loop-host .loop:nth-child(2) ', hd2=await hl.rect(L2+'.lp .head'), nm2=await hl.rect(L2+'.lp .nums'), g2=await hl.rect(L2+'.lp .g1');
      check(near(nm2.y-hd2.b, 28, 1) && nm2.b<=g2.y, 'nửa 2 đang tập: cụm số cách khối đỉnh 28, trên hàng nút: '+(nm2.y-hd2.b).toFixed(1)+' · '+nm2.b.toFixed(0)+' ≤ '+g2.y.toFixed(0));
      await pageL.click('#loop-host .loop:nth-child(2) .g1'); await hl.wait(600);
      await hl.clip('L'+vp.width+'-two');
    });
    await ctxL.close();
  }

  /* =================================================================
     NGỮ CẢNH 4 — MOCK API (không ?demo): PIN sai · offline/outbox · check-in lỗi
     ================================================================= */
  var ctxM=await mkctx(browser); var SRV={checkins:[], logs:[], offline:false, ciFail:false, calls:{}};
  var members=[{name:'Bùi Doãn Quang',done:14,total:24,left:10,coach:'Quyết',exp:'2026-11-21'},{name:'Nguyễn Quang Vinh',done:11,total:12,left:1,coach:'Quyết'}];
  await ctxM.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:'{"ip":"1.2.3.4"}'}); });
  async function handle(r){
    if(SRV.offline){ return r.abort('internetdisconnected'); }
    var p=JSON.parse(r.request().postData()||'{}'), out={ok:false,error:'unknown_action'}; SRV.calls[p.action]=(SRV.calls[p.action]||0)+1;
    if(p.action==='ping') out={ok:true};
    else if(p.pin!=='1234') out={ok:false,error:'sai_pin'};
    else if(p.action==='coach') out={ok:true, coach:'Quyết Hán', members:members, snapshot:{}, library:null, today:new Date().toISOString().slice(0,10)};
    else if(p.action==='stats') out={ok:true, month:new Date().toISOString().slice(0,7), days:{}, monthTotal:5, perClient:{}, com:{month:new Date().toISOString().slice(0,7), total:1000000}, hist:{}};
    else if(p.action==='checkin_coach'){ SRV.ciCalls=(SRV.ciCalls||0)+1; if(SRV.ciFail) out={ok:false,error:'loi_thu'}; else { SRV.checkins.push(p.name); var m=members.filter(function(x){return x.name===p.name})[0]; m.done++; m.left--; out={ok:true,row:5,member:m,at:'17:05'}; } }
    else if(p.action==='log'){ SRV.logs=SRV.logs.concat(p.events); out={ok:true,written:p.events.length}; }
    r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)});
  }
  await ctxM.route(/workers\.dev/, handle); await ctxM.route(/script\.google\.com/, handle);
  var pm=await ctxM.newPage(); watch(pm,'mock'); P=pm; var hm=H(pm);
  await pm.goto(URL); await pm.waitForSelector('#p-pin.on'); await hm.wait(500);

  await run('A2', 'PIN sai → chấm đỏ + rung, chữ lỗi; PIN đúng → trang chủ', async function(){
    for(var k of ['9','9','9','9']) await pm.click('#pin-pad button:has-text("'+k+'")');
    var r=await pm.evaluate(function(){ return new Promise(function(res){ var t0=Date.now(); (function poll(){ var d=document.getElementById('pin-dots'); if(d.classList.contains('err')){ var cs=getComputedStyle(d), dot=getComputedStyle(d.querySelector('.dot')); return res({err:true, anim:cs.animationName, border:dot.borderTopColor, filled:d.querySelectorAll('.dot.f').length, ms:Date.now()-t0}); } if(Date.now()-t0>3000) return res({err:false}); setTimeout(poll,15); })(); }); });
    check(r.err, 'chấm có class err (rung) trong 3s');
    if(r.err){ check(r.anim==='shake', 'animation rung: '+r.anim); check(r.border==='rgb(233, 37, 105)', 'viền chấm đỏ: '+r.border); check(r.filled===0, 'chấm xoá về rỗng'); }
    await hm.wait(200); check((await hm.txt('#pin-err'))==='MÃ PIN KHÔNG ĐÚNG', 'chữ lỗi: '+(await hm.txt('#pin-err')));
    check((await hm.screen())==='p-pin', 'vẫn ở màn PIN');
    await hm.wait(500); check(!(await hm.has('#pin-dots','err')), 'hết rung sau 0,5s');
    await pm.click('#pin-pad button:has-text("5")'); check((await hm.txt('#pin-err'))==='' && (await hm.count('#pin-dots .dot.f'))===1, 'gõ tiếp xoá chữ lỗi, 1 chấm');
    await pm.click('#pin-pad button.bks'); check((await hm.count('#pin-dots .dot.f'))===0, 'xoá lùi');
    await hm.login();
    check((await hm.txt('#h-name'))==='Quyết Hán' && (await hm.txt('#h-taught'))==='Đã dạy 5 buổi', 'trang chủ mock: '+(await hm.txt('#h-taught')));
    check(SRV.calls.coach>=1 && SRV.calls.stats>=1, 'gọi coach + stats');
  });

  await run('N', 'Check-in thất bại → pill lỗi "Thử lại" tự tắt, thử lại thành công; set offline vẫn lưu, gửi lại khi có mạng', async function(){
    await pm.click('#h-go'); await hm.waitScreen('p-pick'); await hm.wait(500); await pm.click('#pk-list .row:has-text("Doãn Quang")'); await hm.waitScreen('p-confirm'); await hm.wait(1200);
    SRV.ciFail=true; await pm.click('#cf-go'); await hm.wait(900);
    check((await hm.ev(function(){ return state.screen; }))==='p-confirm' && !(await hm.ev(function(){ return !!state.session; })), 'check-in lỗi → Ở LẠI màn xác nhận, không tạo buổi');
    check(await hm.pillOn() && await hm.has('#pill','err') && /^Chưa check-in$/.test(await hm.pillText()) && (await hm.txt('#pill .act'))==='Thử lại', 'pill lỗi check-in: '+(await hm.pillText())+' ['+(await hm.txt('#pill .act'))+']');
    check((await hm.ev(function(){ return CI['Bùi Doãn Quang'].status; }))==='fail' && SRV.checkins.length===0, 'CI fail, máy chủ không ghi');
    await shot(pm, 'N-ci-fail-note');
    var nReq=SRV.ciCalls||0; await hm.wait(6300); check(!(await hm.pillOn()), 'pill lỗi tự tắt ≤ 6,5s');
    await hm.wait(2000); check((SRV.ciCalls||0)===nReq, 'KHÔNG tự thử lại check-in (không spam)');
    await pm.click('#cf-go'); await hm.wait(700);
    check(await hm.pillOn() && (await hm.txt('#pill .act'))==='Thử lại', 'bấm Check-in lần 2 → pill lỗi lần 2 (một lần gọi)');
    SRV.ciFail=false; await pm.click('#pill .act'); await hm.waitScreen('p-plan'); await hm.wait(500);
    check(/^Đã check-in$/.test(await hm.pillText()) && !(await hm.has('#pill','err')), 'thử lại thành công → vào Bài tập hôm nay: '+(await hm.pillText()));
    check(SRV.checkins.join()==='Bùi Doãn Quang' && (await hm.ev(function(){ return CI['Bùi Doãn Quang'].status+CI['Bùi Doãn Quang'].no; }))==='ok15', 'máy chủ ghi 1 lần, CI ok');
    /* offline */
    await pm.click('#lib-list .row:nth-of-type(1)'); await pm.click('#lib-go'); await hm.wait(400); await pm.click('#pl-go'); await hm.waitScreen('p-loop'); await hm.wait(1200);
    SRV.offline=true;
    await pm.click('#loop-host .c1'); await hm.wait(500); await pm.click('#loop-host .j1'); await hm.wait(900); await pm.click('#loop-host .c1'); await hm.wait(4000);
    var q=await hm.ev(function(){ return OUT.q.map(function(e){ return e.type+(e.hold?'(hold)':''); }); });
    check(q.join()==='SET(hold)' && SRV.logs.length===0, 'mất mạng: set nằm trong outbox, còn GIỮ suốt lúc nghỉ (v2.6), máy chủ chưa nhận: '+q.join());
    check((await hm.ev(function(){ return JSON.parse(localStorage.getItem('lb_outbox')).length; }))===1, 'outbox cất localStorage');
    check(!(await hm.pillOn()) || !/Máy chủ/.test(await hm.pillText()), 'không hiện lỗi mạng làm phiền khi ghi set');
    SRV.offline=false; await hm.ev(function(){ window.dispatchEvent(new Event('online')); }); await hm.wait(1500);
    check(!SRV.logs.filter(function(e){return e.type==='SET'}).length && (await hm.ev(function(){ return OUT.q.length; }))===1, 'có mạng nhưng đang nghỉ: set còn giữ (còn lùi được) → chưa gửi');
    await pm.click('#loop-host .c1'); await hm.wait(450); await pm.click('#loop-host .film .exl button:nth-child(1)'); await hm.wait(1900);
    check(SRV.logs.filter(function(e){return e.type==='SET'}).length===1 && (await hm.ev(function(){ return OUT.q.length; }))===0, 'vào set mới → nhả → gửi 1 SET, outbox trống');
    var ev1=SRV.logs[0]; check(ev1.name==='Bùi Doãn Quang' && ev1.session===15 && ev1.ok===1 && ev1.kg===20 && ev1.rep===10 && !!ev1.id, 'nội dung SET: '+JSON.stringify(ev1));
    /* offline lần 2 + mở lại app giữ set */
    SRV.offline=true;
    await pm.click('#loop-host .c1'); await hm.wait(500); await pm.click('#loop-host .j0'); await hm.wait(900); await pm.click('#loop-host .c1'); await hm.wait(2500);
    await pm.reload(); await hm.wait(1800);
    check((await hm.screen())==='p-loop' && (await hm.ev(function(){ return OUT.q.length; }))===1, 'reload khi mất mạng: vào lại loop, set vẫn chờ');
    SRV.offline=false;
    await pm.click('#loop-host .c1'); await hm.wait(450); await pm.click('#loop-host .fend'); await hm.waitScreen('p-summary'); await hm.wait(800);
    await pm.click('#sm-form button:nth-child(2)'); await pm.click('#sm-go'); await hm.waitScreen('p-done'); await hm.wait(2500);
    var types=SRV.logs.map(function(e){return e.type}); check(types.join()==='SET,SET,BÀI,CHECKOUT' && (await hm.ev(function(){ return OUT.q.length; }))===0, 'sau check-out gửi đủ: '+types.join());
    check(SRV.logs.filter(function(e){return e.type==='SET'})[1].ok===0, 'set 2 chưa đạt ok=0');
    await pm.click('#p-done .cta'); await hm.waitScreen('p-home'); await hm.wait(800);
  });
  await ctxM.close();

  /* =================================================================
     O — lỗi JS + chữ bị cắt
     ================================================================= */
  await run('O', 'Không pageerror; không chữ bị clip (.t1/.sub/.nm/…)', async function(){
    P=null;
    check(PAGEERR.length===0, 'pageerror: '+PAGEERR.join(' || '));
    check(CLIP.hard.length===0, 'chữ bị cắt: '+CLIP.hard.join(' || '));
    if(CLIP.ell.length) note('Phần tử dài quá hiện "…" (ellipsis, đúng luật): '+CLIP.ell.join(' || '));
    if(CONS.length) note('console.error (không phải 404 font): '+CONS.join(' || '));
  });

  await browser.close(); srv.close();
  /* ---------- bảng kết quả ---------- */
  console.log('\n| UC | Tên | Kết quả |\n|---|---|---|');
  RES.forEach(function(r){ console.log('| '+r.id+' | '+r.name+' | '+(r.fails.length?'FAIL':'PASS')+' |'); });
  var nf=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-nf)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length);
  process.exit(nf||PAGEERR.length ? 1 : 0);
})().catch(function(e){ console.error('FAIL (khung test)', e); process.exit(2); });

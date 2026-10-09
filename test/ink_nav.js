/* v2.5 · NAV ĐÁY MÀN NGHỈ "HẠT" (nền Ink xuyên suốt — thay cơ chế mực Ink dâng qua nav của v2.4.2).
   Luật (Figma 561:225 + chủ studio 28/09, v2.6): màn nghỉ luôn Ink; đặt giờ: pill Paper chữ Ink "Bắt đầu nghỉ" + nút tròn ← (lùi về đang tập);
   đang nghỉ: pill ACID chữ Ink "Nghỉ xong · kế tiếp" + nút tròn ↩ (hoàn tác về đặt giờ). Nút tròn viền hairline, icon Paper.
   Nav KHÔNG đổi tông theo thời gian: đầu buổi nghỉ, giữa, 10 giây cuối (con số Acid), 0:00 — kiểm bằng ĐIỂM ẢNH trên ảnh chụp, không chỉ class.
   1:2 (v2.6): nav rút gọn luôn hiện ở đáy mỗi nửa — nút tròn 48 chỉ có icon (▷ Paper khi đặt giờ · ✓ Acid khi đang nghỉ), không chạm-để-mở.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/ink_nav.js   (BASE=<thư mục bản khác> để chạy trên bản cũ)
   GIF=1 → quay test/out_ink/rest-nav-<nhãn>.gif (10 giây cuối → 0:00, 1:1). */
var {chromium}=require('playwright'); var path=require('path'); var fs=require('fs'); var cp=require('child_process');
var BASE=process.env.BASE||path.resolve(__dirname,'..'), serve=require(path.join(BASE,'test','serve'));
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19361, OUT=path.join(__dirname,'out_ink'), TAG=process.env.TAG||'moi';
fs.mkdirSync(OUT,{recursive:true});
var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
async function run(id, name, fn){ CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }
/* đọc điểm ảnh (toạ độ CSS px, ảnh dpr 2) bằng PIL */
function px(file, pts){
  var py='import json,sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB")\npts=json.loads(sys.argv[2])\nprint(json.dumps([im.getpixel((int(round(x*2)),int(round(y*2)))) for x,y in pts]))';
  return JSON.parse(cp.execFileSync('python3',['-c',py,file,JSON.stringify(pts)]).toString());
}
/* độ sáng lớn nhất trong một hình chữ nhật (CSS px) — tìm nét icon sáng */
function maxLum(file, r){
  var py='import json,sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("L")\nx,y,w,h=json.loads(sys.argv[2])\nbox=im.crop((int(x*2),int(y*2),int((x+w)*2),int((y+h)*2)))\nprint(box.getextrema()[1])';
  return +cp.execFileSync('python3',['-c',py,file,JSON.stringify([r.x,r.y,r.w,r.h])]).toString();
}
function isInk(c){ return c[0]<40 && c[1]<40 && c[2]<40; }
function isPaper(c){ return c[0]>235 && c[1]>235 && c[2]>235; }
function isAcid(c){ return c[0]>195 && c[1]>240 && c[2]<40; }
function hex(c){ return '#'+c.map(function(v){ return ('0'+v.toString(16)).slice(-2); }).join(''); }

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  async function mk(video){
    var o={viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true};
    if(video) o.recordVideo={dir:OUT, size:{width:393,height:852}};
    var ctx=await browser.newContext(o);
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    var page=await ctx.newPage(); page.on('pageerror', function(e){ PAGEERR.push(String(e)); });
    return {ctx:ctx, page:page};
  }
  async function toRestSetup(page, names, ex, half){
    var w=function(ms){ return page.waitForTimeout(ms); }, scr=function(id){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:8000}); };
    await page.goto('http://localhost:'+PORT+'/?demo'); await scr('p-pin'); await w(400);
    for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")');
    await scr('p-home'); await w(1200);
    await page.click('#h-go'); await scr('p-pick'); await w(400);
    for(var n of names) await page.click('#pk-list .row:has-text("'+n+'")');
    if(await page.evaluate(function(){ return state.screen; })!=='p-confirm') await page.click('#pk-go');
    await scr('p-confirm'); await w(1300); await page.click('#cf-go'); await scr('p-plan'); await page.waitForSelector('#lib.on'); await w(400);
    for(var i of ex) await page.click('#lib-list .row:nth-of-type('+i+')');
    await page.click('#lib-go'); await w(400); await page.click('#pl-go'); await scr('p-loop'); await w(1200);
    var L='#loop-host .loop:nth-child(1) ';
    await page.click(L+'.c1'); await w(500);
    await page.click(L+'.j1'); await w(1100);
    await page.waitForFunction(function(){ return document.getElementById('pill').hidden; }, null, {timeout:6000}).catch(function(){});
    return L;
  }
  function geo(page, L){ return page.evaluate(function(L){
    function r(s){ var e=document.querySelector(s); if(!e) return null; var q=e.getBoundingClientRect(); return {x:q.left,y:q.top,w:q.width,h:q.height,b:q.bottom,r:q.right}; }
    var root=document.querySelector(L.trim()), c1=document.querySelector(L+'> .lp .c1');
    return {root:r(L.trim()), c1:r(L+'> .lp .c1'), g1:r(L+'> .lp .g1'), c1bg:getComputedStyle(c1).backgroundColor, c1c:getComputedStyle(c1).color, g1c:getComputedStyle(document.querySelector(L+'> .lp .g1')).color,
      icon:document.querySelector(L+'> .lp .g1 use').getAttribute('href'), txt:c1.textContent||c1.getAttribute('aria-label'), c1icon:(c1.querySelector('use')||{getAttribute:function(){ return ''; }}).getAttribute('href'),
      loopBg:getComputedStyle(root).backgroundColor, ink:!!root.querySelector('.ink'), acid:root.classList.contains('acid')||root.classList.contains('bga'),
      navOp:getComputedStyle(document.querySelector(L+'> .lp .nav')).opacity}; }, L); }
  /* kiểm một khoảnh khắc: nút chính đúng màu (Paper / Acid) chữ Ink, nền quanh nav Ink, icon nút tròn sáng */
  async function navOk(page, L, label, expIcon, expTxt, expBg){
    var g=await geo(page, L), f=path.join(OUT, label.replace(/[^a-z0-9]+/gi,'-')+'-'+TAG+'.png'); await page.screenshot({path:f});
    var acidBg=expBg==='acid';
    check(!g.ink && !g.acid && g.loopBg==='rgb(10, 10, 10)', label+' · nền loop Ink, không lớp mực/Acid: '+g.loopBg+' ink='+g.ink+' acid='+g.acid);
    check(g.c1bg===(acidBg?'rgb(212, 255, 0)':'rgb(250, 250, 250)') && g.c1c==='rgb(10, 10, 10)', label+' · nút chính '+(acidBg?'Acid':'Paper')+' chữ Ink: '+g.c1bg+' / '+g.c1c);
    check(g.txt===expTxt, label+' · chữ / nhãn nút chính: '+g.txt);
    var s=px(f, [[g.c1.x+10, g.c1.y+g.c1.h/2], [g.c1.x-12, g.c1.y+g.c1.h/2], [g.g1.x+2, g.g1.y+g.g1.h/2]]);
    check(acidBg?isAcid(s[0]):isPaper(s[0]), label+' · điểm ảnh trong nút chính = '+(acidBg?'Acid':'Paper')+': '+hex(s[0]));
    check(isInk(s[1]), label+' · nền quanh nav = Ink: '+hex(s[1]));
    check(g.icon===expIcon && g.g1c==='rgb(250, 250, 250)', label+' · icon '+g.icon+' màu '+g.g1c);
    var ml=maxLum(f, {x:g.g1.x+g.g1.w*.25, y:g.g1.y+g.g1.h*.25, w:g.g1.w*.5, h:g.g1.h*.5});
    check(ml>200, label+' · nút tròn có nét icon sáng trên Ink · độ sáng lớn nhất '+ml);
    return g;
  }

  /* ================= 1:1 ================= */
  var A=await mk(false), page=A.page, L=await toRestSetup(page, ['Thành Công'], [1], false);
  await run('N1', '1:1 · đặt giờ nghỉ: pill Paper "Bắt đầu nghỉ", nút Menu ☰ (v2.8.1), nền Ink', async function(){
    check((await page.evaluate(function(){ return state.session.people[0].phase; }))==='rest-setup', 'đang đặt giờ');
    await navOk(page, L, 'n1 dat gio', '#i-list', 'Bắt đầu nghỉ', 'paper');   /* v2.8.1: ← → nút Menu */
  });
  await run('N2', '1:1 · đang nghỉ: pill Acid "Nghỉ xong · kế tiếp", nút ↩ (v2.6) — đầu / giữa / 10 giây cuối / 0:00 nav KHÔNG đổi tông', async function(){
    await page.evaluate(function(){ state.session.people[0].restTotal=14; }); await page.click(L+'.c1'); await page.waitForTimeout(900);
    await navOk(page, L, 'n2 dau nghi', '#i-undo', 'Nghỉ xong · kế tiếp', 'acid');
    await page.waitForTimeout(4500); await navOk(page, L, 'n2 giua', '#i-undo', 'Nghỉ xong · kế tiếp', 'acid');
    await page.waitForTimeout(3500);
    var dig=await page.evaluate(function(){ return getComputedStyle(document.querySelector('#loop-host .clock .line')).color; });
    check(dig==='rgb(212, 255, 0)', '10 giây cuối: con số Acid (luật 19/09): '+dig);
    await navOk(page, L, 'n2 10 giay cuoi', '#i-undo', 'Nghỉ xong · kế tiếp', 'acid');
    await page.waitForTimeout(5600);
    check((await page.textContent(L+'.lp .head .sub'))==='Hết giờ nghỉ', 'Hết giờ nghỉ');
    await navOk(page, L, 'n2 het gio', '#i-undo', 'Nghỉ xong · kế tiếp', 'acid');
  });
  await A.ctx.close();

  /* ================= 1:2 ================= */
  var B=await mk(false); page=B.page; L=await toRestSetup(page, ['Doãn Quang','Quang Vinh'], [1,2], true);
  await run('N4', '1:2 · đặt giờ nghỉ: nav rút gọn luôn hiện — ▷ Paper tròn 48 + Menu ☰, không cần chạm mở, bấm tới đúng nút', async function(){
    var g=await geo(page, L), f=path.join(OUT,'n4-'+TAG+'.png'); await page.screenshot({path:f});
    check(g.navOp==='1' && g.c1.w===48 && g.c1.h===48 && g.c1icon==='#i-play' && g.icon==='#i-list' && g.txt==='Bắt đầu nghỉ', 'nav hiện sẵn: '+JSON.stringify({op:g.navOp, w:g.c1.w, c1:g.c1icon, g1:g.icon, label:g.txt}));
    await navOk(page, L, 'n4 dat gio 1-2', '#i-list', 'Bắt đầu nghỉ', 'paper');   /* v2.8.1 */
    var s=px(f, [[g.c1.x+g.c1.w/2-12, g.c1.y+g.c1.h/2]]); check(isPaper(s[0]), 'điểm ảnh trong nút tròn Paper: '+hex(s[0]));
    var hit=await page.evaluate(function(p){ var e=document.elementFromPoint(p.x,p.y); return e && e.closest('.c1') ? 'c1' : (e && e.className) || ''; }, {x:g.c1.x+g.c1.w/2, y:g.c1.y+g.c1.h/2});
    check(hit==='c1', 'chạm giữa nút tới nút: '+hit);
  });
  await run('N5', '1:2 · đang nghỉ: ✓ Acid tròn 48 + ↩, nửa kia vẫn hiện nav của nó', async function(){
    await page.click(L+'.c1'); await page.waitForTimeout(900);
    var g=await geo(page, L); check(g.c1icon==='#i-check' && g.txt==='Nghỉ xong · kế tiếp', 'nút chính ✓: '+g.c1icon+' / '+g.txt);
    await navOk(page, L, 'n5 dang nghi 1-2', '#i-undo', 'Nghỉ xong · kế tiếp', 'acid');
    check((await page.evaluate(function(){ return getComputedStyle(document.querySelector('#loop-host .loop:nth-child(2) > .lp .nav')).opacity; }))==='1', 'nav nửa 2 vẫn hiện');
  });
  await B.ctx.close();

  /* ================= GIF: 10 giây cuối → 0:00 (1:1) ================= */
  if(process.env.GIF){
    var V=await mk(true); page=V.page; L=await toRestSetup(page, ['Thành Công'], [1], false);
    await page.evaluate(function(){ state.session.people[0].restTotal=12; }); await page.click(L+'.c1');
    await page.waitForTimeout(13500);
    var vp=await page.video().path(); await V.ctx.close();
    var gif=path.join(OUT,'rest-nav-'+TAG+'.gif'), webm=path.join(OUT,'rest-nav-'+TAG+'.webm');
    try{ fs.renameSync(vp, webm); }catch(e){ webm=vp; }
    try{ cp.execFileSync('ffmpeg',['-y','-loglevel','error','-sseof','-12','-i',webm,'-vf','fps=14,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',gif]); console.log('GIF '+gif); }catch(e){ console.log('GIF lỗi '+e.message); }
  }

  await browser.close(); srv.close();
  var fails=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fails)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length+(PAGEERR.length?'\n - '+PAGEERR.join('\n - '):''));
  process.exit(fails||PAGEERR.length?1:0);
})().catch(function(e){ console.error('EXC', e); process.exit(2); });

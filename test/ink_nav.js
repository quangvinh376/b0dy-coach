/* v2.4.2 · MỰC INK DÂNG QUA NAV ĐÁY: nav KHÔNG được đổi tông theo mốc thời gian, chỉ đổi đúng phần mực đã phủ.
   Lỗi cũ (v2.4.0 và trước): class .inkd bật khi còn < 50% giờ nghỉ → cả cụm nút đáy đổi sang tông Ink (CTA Acid trên nền Acid = mất nút)
   trong khi mép mực mới ở giữa màn. Kiểm bằng ĐIỂM ẢNH trên ảnh chụp (không chỉ class): trên mép mực = tông Ink, dưới mép = tông Acid.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/ink_nav.js   (BASE=<thư mục bản khác> để chạy trên bản cũ)
   GIF=1 → quay test/out_ink/ink-nav-<nhãn>.gif (mực chảy qua nav, 1:1). */
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
/* độ sáng nhỏ nhất trong một hình chữ nhật (CSS px) — tìm nét icon/viền tối */
function minLum(file, r){
  var py='import json,sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("L")\nx,y,w,h=json.loads(sys.argv[2])\nbox=im.crop((int(x*2),int(y*2),int((x+w)*2),int((y+h)*2)))\nprint(box.getextrema()[0])';
  return +cp.execFileSync('python3',['-c',py,file,JSON.stringify([r.x,r.y,r.w,r.h])]).toString();
}
function isInk(c){ return c[0]<40 && c[1]<40 && c[2]<40; }
function isAcid(c){ return c[0]>180 && c[1]>225 && c[2]<80; }
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
  async function toRest(page, names, ex, half){
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
    if(half) await page.evaluate(function(){ setFocus(0); });
    await page.click(L+'.c1'); await w(500);
    if(half) await page.evaluate(function(){ setFocus(0); });
    await page.click(L+'.j1'); await w(1000);
    if(half) await page.evaluate(function(){ setFocus(0); });
    await page.click(L+'.c1'); await w(600);                     /* Bắt đầu nghỉ */
    return L;
  }
  /* đặt mực ở mức còn lại fl (0..1) và giữ gần như đứng yên (tổng 2.000 s → 0,05%/s) */
  async function setFrac(page, fl){ await page.evaluate(function(fl){ var p=state.session.people[0]; p.restTotal=2000; p.restStart=Date.now()-(1-fl)*2000*1000; }, fl); await page.waitForTimeout(160); }
  function geo(page, L){ return page.evaluate(function(L){
    function r(s){ var e=document.querySelector(s); if(!e) return null; var q=e.getBoundingClientRect(); return {x:q.left,y:q.top,w:q.width,h:q.height,b:q.bottom,r:q.right}; }
    var root=document.querySelector(L.trim()), rr=root.getBoundingClientRect();
    var t=(document.querySelector(L+'.ink').style.transform.match(/-?([\d.]+)%/)||[0,'100'])[1];
    return {root:{y:rr.top,h:rr.height}, fl:+t/100, c1:r(L+'> .lp .c1'), g1:r(L+'> .lp .g1'), ic:r(L+'.ink .nav .cta'), ig:r(L+'.ink .nav .ghost'),
      c1bg:getComputedStyle(document.querySelector(L+'> .lp .c1')).backgroundColor, g1c:getComputedStyle(document.querySelector(L+'> .lp .g1')).color,
      inkd:!!document.querySelector('.loop.inkd'), zNav:getComputedStyle(document.querySelector(L+'> .lp .nav')).zIndex, zInk:getComputedStyle(document.querySelector(L+'.ink')).zIndex,
      inkNavOp:getComputedStyle(document.querySelector(L+'.ink .nav')).opacity, inkNavDisp:getComputedStyle(document.querySelector(L+'.ink .nav')).display}; }, L); }

  /* ================= 1:1 ================= */
  var A=await mk(false), page=A.page, L=await toRest(page, ['Thành Công'], [1], false);
  await run('N1', '1:1 · mực mới tới 73% màn (ảnh chủ studio 0:05/0:15): nav đáy GIỮ tông Acid, đọc rõ', async function(){
    check((await page.evaluate(function(){ return state.session.people[0].phase; }))==='rest', 'đang nghỉ');
    await setFrac(page, 0.27);
    var g=await geo(page, L), edge=g.root.y+(1-g.fl)*g.root.h, f=path.join(OUT,'n1-'+TAG+'.png'); await page.screenshot({path:f});
    check(edge < g.c1.y-20, 'mép mực ('+edge.toFixed(0)+') còn trên nav ('+g.c1.y.toFixed(0)+')');
    check(!g.inkd, 'không còn class .inkd');
    check(g.c1bg==='rgb(10, 10, 10)', 'CTA nền gốc vẫn pill Ink: '+g.c1bg);
    var s=px(f, [[g.c1.x+10, g.c1.y+g.c1.h/2], [g.c1.x-12, g.c1.y+g.c1.h/2]]);
    check(isInk(s[0]), 'điểm ảnh trong CTA = pill Ink: '+hex(s[0]));
    check(isAcid(s[1]), 'nền quanh nav = Acid: '+hex(s[1]));
    check(g.g1c==='rgb(10, 10, 10)', 'icon nút tròn màu Ink: '+g.g1c);
    var ml=minLum(f, {x:g.g1.x+g.g1.w*.2, y:g.g1.y+g.g1.h*.2, w:g.g1.w*.6, h:g.g1.h*.6});
    check(ml<90, 'nút tròn có nét icon tối trên Acid (không phải icon Paper mờ) · độ sáng nhỏ nhất '+ml);
  });
  await run('N2', '1:1 · mép mực cắt ngang CTA: trên mép = tông Ink (pill Acid trên nền Ink), dưới mép = tông Acid (pill Ink trên nền Acid)', async function(){
    var g=await geo(page, L), mid=g.c1.y+g.c1.h/2, fl=1-(mid-g.root.y)/g.root.h;
    await setFrac(page, fl);
    g=await geo(page, L); var edge=g.root.y+(1-g.fl)*g.root.h, f=path.join(OUT,'n2-'+TAG+'.png'); await page.screenshot({path:f});
    check(Math.abs(edge-mid)<3, 'mép mực ở giữa CTA: '+edge.toFixed(1)+' vs '+mid.toFixed(1));
    var x=g.c1.x+14, s=px(f, [[x, edge-6], [x, edge+6], [g.c1.x-12, edge-6], [g.c1.x-12, edge+6]]);
    check(isAcid(s[0]), 'CTA phía trên mép = pill Acid (bản sao trong lớp mực): '+hex(s[0]));
    check(isInk(s[1]), 'CTA phía dưới mép = pill Ink (nav gốc): '+hex(s[1]));
    check(isInk(s[2]) && isAcid(s[3]), 'nền: trên mép Ink '+hex(s[2])+' · dưới mép Acid '+hex(s[3]));
    check(g.ic && Math.abs(g.ic.x-g.c1.x)<0.6 && Math.abs(g.ic.y-g.c1.y)<0.6 && Math.abs(g.ic.w-g.c1.w)<0.6, 'CTA 2 lớp trùng khít: '+JSON.stringify([g.c1,g.ic]));
    check(g.ig && Math.abs(g.ig.x-g.g1.x)<0.6 && Math.abs(g.ig.y-g.g1.y)<0.6, 'nút tròn 2 lớp trùng khít');
  });
  await run('N3', '1:1 · mực phủ kín: nav tông Ink hoàn toàn (pill Acid, nền Ink)', async function(){
    await setFrac(page, 0.0005);
    var g=await geo(page, L), f=path.join(OUT,'n3-'+TAG+'.png'); await page.screenshot({path:f});
    var s=px(f, [[g.c1.x+10, g.c1.y+g.c1.h/2], [g.c1.x-12, g.c1.y+g.c1.h/2]]);
    check(isAcid(s[0]) && isInk(s[1]), 'CTA Acid trên nền Ink: '+hex(s[0])+' / '+hex(s[1]));
  });
  await A.ctx.close();

  /* ================= 1:2 ================= */
  var B=await mk(false); page=B.page; L=await toRest(page, ['Doãn Quang','Quang Vinh'], [1,2], true);
  await run('N4', '1:2 · nút nổi giữa section: mép mực cắt ngang CTA → trên Ink / dưới Acid; nav gốc dưới lớp mực (z 3 < 4)', async function(){
    await page.evaluate(function(){ setFocus(0); }); await page.waitForTimeout(400);
    var g=await geo(page, L), mid=g.c1.y+g.c1.h/2, fl=1-(mid-g.root.y)/g.root.h;
    await setFrac(page, fl);
    g=await geo(page, L); var edge=g.root.y+(1-g.fl)*g.root.h, f=path.join(OUT,'n4-'+TAG+'.png'); await page.screenshot({path:f});
    check(+g.zNav<+g.zInk, 'z nav gốc '+g.zNav+' < z lớp mực '+g.zInk);
    check(g.inkNavDisp!=='none' && g.inkNavOp==='1', 'bản sao nav trong lớp mực hiện cùng .ovl: '+g.inkNavDisp+' / '+g.inkNavOp);
    var x=g.c1.x+14, s=px(f, [[x, edge-5], [x, edge+5]]);
    check(isAcid(s[0]) && isInk(s[1]), 'CTA: trên mép Acid '+hex(s[0])+' · dưới mép Ink '+hex(s[1]));
    check(g.ic && Math.abs(g.ic.x-g.c1.x)<0.6 && Math.abs(g.ic.y-g.c1.y)<0.6, 'CTA 2 lớp trùng khít: '+JSON.stringify([g.c1,g.ic]));
    /* bấm vẫn tới nav gốc (lớp mực không ăn chạm) */
    var hit=await page.evaluate(function(p){ var e=document.elementFromPoint(p.x,p.y); return e && e.closest('.c1') ? 'c1' : (e && e.className) || ''; }, {x:g.c1.x+g.c1.w/2, y:g.c1.y+4});
    check(hit==='c1', 'chạm phần CTA đã bị mực phủ vẫn tới nút gốc: '+hit);
  });
  await run('N5', '1:2 · đóng .ovl: cả hai bản nav cùng ẩn (không sót nút tông Ink trên lớp mực)', async function(){
    await page.evaluate(function(){ setFocus(-1); }); await page.waitForTimeout(450);
    var g=await geo(page, L);
    check(g.inkNavOp==='0', 'bản sao trong lớp mực ẩn: '+g.inkNavOp);
    check((await page.evaluate(function(L){ return getComputedStyle(document.querySelector(L+'> .lp .nav')).opacity; }, L))==='0', 'nav gốc ẩn');
  });
  await B.ctx.close();

  /* ================= GIF: mực chảy qua nav (1:1) ================= */
  if(process.env.GIF){
    var V=await mk(true); page=V.page; L=await toRest(page, ['Thành Công'], [1], false);
    await page.evaluate(function(){ var p=state.session.people[0]; p.restTotal=24; p.restStart=Date.now()-19*1000; });   /* mép mực từ ~79% → hết */
    await page.waitForTimeout(5600);
    var vp=await page.video().path(); await V.ctx.close();
    var gif=path.join(OUT,'ink-nav-'+TAG+'.gif'), webm=path.join(OUT,'ink-nav-'+TAG+'.webm');
    try{ fs.renameSync(vp, webm); }catch(e){ webm=vp; }
    /* chỉ lấy 6 giây cuối: mép mực đi từ ~80% màn qua nav tới hết giờ */
    try{ cp.execFileSync('ffmpeg',['-y','-loglevel','error','-sseof','-6','-i',webm,'-vf','fps=14,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',gif]); console.log('GIF '+gif); }catch(e){ console.log('GIF lỗi '+e.message); }
  }

  await browser.close(); srv.close();
  var fails=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fails)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length+(PAGEERR.length?'\n - '+PAGEERR.join('\n - '):''));
  process.exit(fails||PAGEERR.length?1:0);
})().catch(function(e){ console.error('EXC', e); process.exit(2); });

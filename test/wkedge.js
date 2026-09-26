/* v2.4.2 — màu vùng dưới thanh trạng thái / thanh công cụ Safari 26+ (Liquid Glass).
   Safari 26 bỏ theme-color: WebKit (LocalFrameView::fixedContainerEdges) hit-test tại tâm mỗi mép, 4px vào trong, đi lên tổ tiên tới
   element position:fixed/sticky đầu tiên, lấy background-color phẳng đầu tiên gặp; container phủ kín viewport (body{position:fixed})
   bị coi là "viewport-sized" và WebKit giữ màu đã lấy lần đầu. App dùng hai dải .wkedge (fixed 12px) làm nguồn màu (app.js syncTheme).
   Chromium không có cơ chế này → test GIẢ LẬP đúng thuật toán WebKit (điểm lấy mẫu, phân loại container, ngưỡng 0,9 / 10px / opacity 0,1)
   và đối chiếu màu dải với PIXEL THẬT ở mép khi tạm ẩn dải (oracle: dải phải đúng màu app đang hiện ở mép đó).
   W0 tắt dải → WebKit tìm thấy body "viewport-sized" (bẫy v2.4.0–2.4.1); app cài (standalone/sb-legacy) dải display:none, không che khối đỉnh · W1 PIN / trang chủ / khách hàng (kể cả cuộn): dải là container, Ink
   W2 cửa sổ khách + thư viện: mép dưới Tile khi mở, về Ink sau khi đóng · W3 loop 1:1: setup Ink → rest-setup Acid/Acid → nghỉ: trên Ink, dưới Acid
   → mực phủ kín Ink/Ink · W4 pill: đang hiện không che điểm lấy mẫu, ẩn hẳn (display:none) sau khi tắt · W5 màng .film: tối trên Ink = Ink,
   Acid 93 % trên Ink = #C6EE01, trên Acid = Acid · W6 rời loop → Ink · W7 loop 1:2: nửa trên Acid, nửa dưới Ink rồi cả hai Acid
   W8 theme-color theo mép trên, --bg theo mép dưới, kicker #wk-k đổi trạng thái mỗi lần syncTheme.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/wkedge.js */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs'); var zlib=require('zlib');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19351, OUT=path.join(__dirname,'out_wkedge');
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
var INK=[10,10,10], ACID=[212,255,0], TILE=[34,34,34], FILM_INK=[198,238,1];
var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
function near(a,b,t){ t=t==null?2:t; return !!a && !!b && Math.abs(a[0]-b[0])<=t && Math.abs(a[1]-b[1])<=t && Math.abs(a[2]-b[2])<=t; }
function hex(c){ return '#'+c.map(function(v){ return (v<16?'0':'')+v.toString(16).toUpperCase(); }).join(''); }
async function run(id, name, fn){ CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.stack||e).split('\n').slice(0,5).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }

/* PNG nhỏ (ảnh chụp 1×1 css px = 2×2 px) → điểm ảnh RGB; giải mã tay vì không có pngjs */
function decodePNG(buf){ var pos=8, w=0, h=0, ct=0, idat=[];
  while(pos<buf.length){ var len=buf.readUInt32BE(pos), type=buf.toString('ascii',pos+4,pos+8), data=buf.subarray(pos+8,pos+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); ct=data[9]; } else if(type==='IDAT') idat.push(data); else if(type==='IEND') break; pos+=12+len; }
  var raw=zlib.inflateSync(Buffer.concat(idat)), bpp=ct===6?4:(ct===2?3:(ct===4?2:1)), stride=w*bpp, out=Buffer.alloc(h*stride), prev=Buffer.alloc(stride);
  for(var y=0;y<h;y++){ var f=raw[y*(stride+1)], line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)), cur=out.subarray(y*stride,(y+1)*stride);
    for(var i=0;i<stride;i++){ var a=i>=bpp?cur[i-bpp]:0, b=prev[i], c=i>=bpp?prev[i-bpp]:0, x=line[i], v;
      if(f===0) v=x; else if(f===1) v=x+a; else if(f===2) v=x+b; else if(f===3) v=x+((a+b)>>1); else { var p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); v=x+((pa<=pb&&pa<=pc)?a:(pb<=pc?b:c)); }
      cur[i]=v&255; }
    prev=cur; }
  return [out[0],out[1],out[2]]; }

/* Giả lập LocalFrameView::fixedContainerEdges (WebKit main + safari-7622…7625, hằng số y hệt): chạy TRONG trang */
function wkEdgesInPage(){
  var W=innerWidth, H=innerHeight, M=4, fx={x:M, y:M, w:W-2*M, h:H-2*M};                 /* fixedRect co 4px (sampleRectMargin) */
  var vpW=Math.min(fx.w, W), vpH=Math.min(fx.h, H);                                      /* min(fixedRect, sizeForCSSDefaultViewportUnits) */
  function cmp(len, vp){ return len < vp*0.9 ? 'Smaller' : (len < vp*1.05 ? 'Similar' : 'Larger'); }
  function rgba(s){ var m=/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s||''); return m?[+m[1],+m[2],+m[3],m[4]==null?1:+m[4]]:[0,0,0,0]; }
  function bf(cs){ return (cs.backdropFilter||cs.webkitBackdropFilter||'none')!=='none'; }
  function hasBg(cs){ return rgba(cs.backgroundColor)[3]>0 || cs.backgroundImage!=='none'; }
  function hiddenOrNearlyTransparent(e, cs){                                              /* isHiddenOrNearlyTransparent */
    if(cs.visibility==='hidden' || +cs.opacity===0) return true;
    if(+cs.opacity < 0.1) return true;
    if(!hasBg(cs) && !bf(cs) && !e.firstChild && !/^(IMG|VIDEO|CANVAS|svg|SVG)$/.test(e.tagName)) return true;
    return false; }
  function primaryColor(e, cs, r){                                                       /* primaryBackgroundColorForRenderer (mép trên/dưới: cạnh = chiều rộng) */
    if(r.width<=10 || r.height<=10) return null;                                         /* thinBorderWidth */
    if(hiddenOrNearlyTransparent(e, cs)) return null;
    var c=rgba(cs.backgroundColor); if(c[3]<=0) return null;
    if(cmp(r.width, vpW)==='Smaller') return null;
    return c; }
  function candidate(e, cs, r){                                                          /* containerEdgeCandidateResult */
    if(cs.position!=='fixed' && cs.position!=='sticky') return 'NotFixedOrSticky';
    var onSide=cmp(r.width, vpW), adj=cmp(r.height, vpH);
    if(hiddenOrNearlyTransparent(e, cs)) return 'IsHiddenOrTransparent';
    var dimming=(function(){ if(onSide==='Smaller' || adj==='Smaller' || !hasBg(cs) || e.firstChild) return false; if(+cs.opacity<1) return true; var c=primaryColor(e,cs,r); return !!c && c[3]<1; })();
    if(onSide==='Smaller') return adj!=='Smaller' ? 'IsSidebar' : 'TooSmall';
    if(!dimming && adj==='Larger') return 'TooLarge';
    if(dimming) return 'IsDimmingLayer';
    if(onSide==='Similar' && adj==='Similar'){ var z=cs.zIndex; if(z!=='auto' && +z<0) return 'NegativeZIndex'; return 'IsViewportSizedCandidate'; }
    return 'IsCandidate'; }
  function find(side){
    var pt= side==='t' ? [Math.floor((fx.x+fx.x+fx.w)/2), fx.y] : [Math.floor((fx.x+fx.x+fx.w)/2), fx.y+fx.h];     /* midpointOnSide */
    var st=document.createElement('style'); st.textContent='*{pointer-events:auto!important}'; document.head.appendChild(st);   /* lượt 1: IgnoreCSSPointerEventsProperty */
    var el=document.elementFromPoint(pt[0], pt[1]); st.remove();
    var out={pt:pt, hit:el?(el.id||el.className||el.tagName):null, container:null, kind:null, color:null, multi:false, backdrop:false, chain:[]};
    var primary=null;
    for(var e=el; e && e.nodeType===1; e=e.parentElement){
      var cs=getComputedStyle(e), r=e.getBoundingClientRect(), kind=candidate(e, cs, r);
      out.chain.push((e.id||e.tagName.toLowerCase())+':'+kind);
      if(kind!=='IsHiddenOrTransparent'){
        if(bf(cs)) out.backdrop=true;
        else { var c=primaryColor(e, cs, r); if(c){ if(!primary) primary=c; else if(primary.join()!==c.join()) out.multi=true; } } }
      if(/^(IsViewportSizedCandidate|IsDimmingLayer|IsSidebar|IsCandidate)$/.test(kind)){ out.container=e.id||e.tagName.toLowerCase(); out.kind=kind; out.color=(out.multi||out.backdrop)?null:(primary&&primary.slice(0,3)); return out; } }
    return out; }
  return {t:find('t'), b:find('b')};
}

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  async function mk(){
    var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    var page=await ctx.newPage(); page.on('pageerror', function(e){ PAGEERR.push(String(e)); });
    await page.goto('http://localhost:'+PORT+'/?demo');
    await page.addStyleTag({content:'html.nowk .wkedge{visibility:hidden!important}'});
    await page.evaluate('window.__wk='+wkEdgesInPage.toString());
    return {ctx:ctx, page:page};
  }
  var C=await mk(), page=C.page, N=0;
  var w=function(ms){ return page.waitForTimeout(ms); }, ev=function(fn,a){ return page.evaluate(fn,a); };
  var screen=function(id){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:8000}); };
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  var edges=function(){ return ev(function(){ return window.__wk(); }); };
  var pillGone=function(){ return page.waitForFunction(function(){ return document.getElementById('pill').hidden; }, null, {timeout:8000}); };
  async function pix(hideStrips){
    if(hideStrips) await ev(function(){ document.documentElement.classList.add('nowk'); }); await w(60);
    var cx=Math.floor(393/2), t=decodePNG(await page.screenshot({clip:{x:cx,y:4,width:1,height:1}})), b=decodePNG(await page.screenshot({clip:{x:cx,y:852-5,width:1,height:1}}));
    if(hideStrips){ await ev(function(){ document.documentElement.classList.remove('nowk'); }); await w(60); }
    return {t:t, b:b};
  }
  async function shot(name){ await page.screenshot({path:path.join(OUT,(++N<10?'0':'')+N+'-'+name+'.png')}); }
  /* kiểm đủ 4 tầng: giả lập WebKit tìm đúng dải + đúng màu · biến CSS · pixel khi dải hiện · pixel khi dải ẩn (màu app thật ở mép) */
  async function expectEdges(label, expT, expB, o){ o=o||{};
    var e=await edges();
    check(e.t.container==='wk-t' && e.t.kind==='IsCandidate', label+' · mép trên: WebKit phải tìm thấy #wk-t (IsCandidate), thấy '+e.t.container+'/'+e.t.kind+' hit='+e.t.hit+' chuỗi='+e.t.chain.join('>'));
    check(e.b.container==='wk-b' && e.b.kind==='IsCandidate', label+' · mép dưới: WebKit phải tìm thấy #wk-b (IsCandidate), thấy '+e.b.container+'/'+e.b.kind+' hit='+e.b.hit+' chuỗi='+e.b.chain.join('>'));
    check(near(e.t.color, expT, 1) && near(e.b.color, expB, 1), label+' · màu WebKit lấy: trên '+JSON.stringify(e.t.color)+' dưới '+JSON.stringify(e.b.color)+' (mong '+hex(expT)+' / '+hex(expB)+')');
    var v=await ev(function(){ var cs=getComputedStyle(document.documentElement); var m=document.querySelector('meta[name=theme-color]'); var acidTop=(state.screen==='p-loop' && LOOPS[0] && LOOPS[0].root.classList.contains('acid'));
      return {t:cs.getPropertyValue('--edge-t').trim(), b:cs.getPropertyValue('--edge-b').trim(), bg:cs.getPropertyValue('--bg').trim(), theme:m&&m.getAttribute('content'), acidTop:!!acidTop, k:document.getElementById('wk-k').hidden}; });
    check(v.t.toUpperCase()===hex(expT) && v.b.toUpperCase()===hex(expB), label+' · --edge-t/--edge-b: '+v.t+' / '+v.b);
    check((v.theme||'').toUpperCase()===(v.acidTop?'#D4FF00':'#0A0A0A'), label+' · theme-color (iOS ≤ 18, luật cũ: Acid khi nửa trên nghỉ): '+v.theme+' acidTop='+v.acidTop);
    check(v.bg.toUpperCase()===hex(expB), label+' · --bg = màu mép dưới (dải đáy WebKit 301108 trên bản cài): '+v.bg);
    var on=await pix(false), off=await pix(true);
    /* trang có lớp mép blur (.edge): backdrop-filter ở sát mép màn hình lấy mẫu ra ngoài khung → tối hơn Ink 2–3 mức; dải Ink đặc phủ 12px → chênh ≤ 4/255 (mắt không thấy).
       sheet mở (dim): --bg = Tile (dải đáy WebKit 301108) nên trang nền trong lộ Tile dưới dimmer 75 % Ink → mép trên 8–16 tuỳ trang; dải Ink chênh ≤ 8/255 */
    var invis=o.dim?8:(o.edge?4:1); if(o.dim) o.tol=8; check(near(on.t, off.t, invis) && near(on.b, off.b, invis), label+' · dải phải vô hình (pixel dải hiện == dải ẩn, ±'+invis+'): '+JSON.stringify(on)+' vs '+JSON.stringify(off));
    if(o.darkOnly) check(off.t.every(function(x){return x<=40;}) && off.b.every(function(x){return x<=40;}), label+' · pixel app thật ở mép (dải ẩn) phải tối: '+JSON.stringify(off));
    else check(near(off.t, expT, o.tol||3) && near(off.b, expB, o.tol||3), label+' · pixel app thật ở mép (dải ẩn) phải đúng màu dải: '+JSON.stringify(off)+' mong '+hex(expT)+' / '+hex(expB));
    return {e:e, v:v, on:on, off:off};
  }

  await screen('p-pin'); await w(600);
  await run('W0', 'Tắt dải → WebKit gặp body position:fixed phủ kín viewport = "viewport-sized" (giữ màu cũ) — bẫy của v2.4.0–2.4.1', async function(){
    var e=await ev(function(){ document.documentElement.classList.add('nowk'); var r=window.__wk(); document.documentElement.classList.remove('nowk'); return r; });
    check(e.t.container==='body' && e.t.kind==='IsViewportSizedCandidate', 'mép trên không dải: '+e.t.container+'/'+e.t.kind+' chuỗi='+e.t.chain.join('>'));
    check(e.b.container==='body' && e.b.kind==='IsViewportSizedCandidate', 'mép dưới không dải: '+e.b.container+'/'+e.b.kind+' chuỗi='+e.b.chain.join('>'));
    var k0=await ev(function(){ return document.getElementById('wk-k').hidden; }); await ev(function(){ syncTheme(); }); var k1=await ev(function(){ return document.getElementById('wk-k').hidden; });
    check(k0!==k1, 'kicker #wk-k đổi trạng thái mỗi lần syncTheme (thêm/bớt element fixed → WebKit tính lại)');
    var pillHidden=await ev(function(){ return document.getElementById('pill').hidden; }); check(pillHidden, 'pill ẩn hẳn (hidden) lúc khởi động');
    /* bản cài cũ (standalone + sb-legacy, vùng web dưới thanh, --top 2px): dải tắt, khối đỉnh và vạch .busy không bị che (sự cố v2.4.2);
       bản cài black-translucent (standalone, inset 59): dải bật, --top 56, vạch .busy nằm ngay dưới thanh (59) */
    var bt=await ev(function(){ var d=document.documentElement; d.classList.add('standalone'); d.style.setProperty('--sat','59px'); var r={dt:getComputedStyle(document.getElementById('wk-t')).display, top:getComputedStyle(document.getElementById('p-pin')).paddingTop, busy:getComputedStyle(document.getElementById('busy')).top}; d.classList.remove('standalone'); d.style.removeProperty('--sat'); return r; });
    check(bt.dt==='block' && bt.top==='56px' && bt.busy==='59px', 'bản cài black-translucent (inset 59): dải bật, --top 56, .busy ở 59 — '+JSON.stringify(bt));
    var sa=await ev(function(){ var d=document.documentElement; d.classList.add('standalone','sb-legacy'); var t=document.getElementById('wk-t'), b=document.getElementById('wk-b');
      var r={dt:getComputedStyle(t).display, db:getComputedStyle(b).display, top:getComputedStyle(d).getPropertyValue('--top').trim(), busyTop:Math.round(document.getElementById('busy').getBoundingClientRect().top)};
      var st=document.createElement('style'); st.textContent='*{pointer-events:auto!important}'; document.head.appendChild(st); var e=document.elementFromPoint(196,4); st.remove(); r.hit=e&&(e.id||e.className||e.tagName);
      d.classList.remove('standalone','sb-legacy'); return r; });
    check(sa.dt==='none' && sa.db==='none', 'app cài (inset 0): hai dải display:none — '+JSON.stringify(sa));
    check(sa.top==='2px' && sa.busyTop===0 && !/wk-/.test(sa.hit||''), 'bản cài cũ: --top 2px, .busy ở y=0, điểm (196,4) không còn là dải: '+JSON.stringify(sa));
  });
  await run('W1', 'PIN · trang chủ · khách hàng (cuộn 40): dải là container ở cả hai mép, màu Ink, pixel mép tối', async function(){
    await expectEdges('PIN', INK, INK, {darkOnly:true});
    await pin('1234'); await screen('p-home'); await w(1600); await expectEdges('trang chủ', INK, INK, {darkOnly:true});
    await page.click('#p-home .nav button[aria-label="Khách hàng"]'); await screen('p-clients'); await w(1100); await expectEdges('khách hàng', INK, INK, {darkOnly:true, edge:true});
    await ev(function(){ document.getElementById('cl-list').scrollTop=40; }); await w(200); await expectEdges('khách hàng cuộn 40', INK, INK, {darkOnly:true, edge:true});
    await ev(function(){ document.getElementById('cl-list').scrollTop=0; }); await w(100);
    await page.click('#p-clients .nav .ghost:nth-child(1)'); await screen('p-home'); await w(800);
  });
  await run('W2', 'Cửa sổ khách (trang chủ) + thư viện (bài tập hôm nay): mép dưới Tile khi mở, về Ink 380ms sau khi đóng', async function(){
    await ev(function(){ openClientSheet('today'); }); await w(600); await expectEdges('cửa sổ khách mở', INK, TILE, {dim:true}); await shot('csheet');
    await ev(function(){ closeClientSheet(); }); await w(150); var mid=await ev(function(){ return getComputedStyle(document.documentElement).getPropertyValue('--edge-b').trim(); });
    check(/#222222/i.test(mid), 'đang trượt xuống (150ms) mép dưới vẫn Tile: '+mid);
    await w(500); await expectEdges('cửa sổ khách đóng', INK, INK, {darkOnly:true});
    await page.click('#h-go'); await screen('p-pick'); await w(600);
    await page.click('#pk-list .row:has-text("Thành Công")'); await screen('p-confirm'); await w(1300);
    await page.click('#cf-go'); await screen('p-plan'); await page.waitForSelector('#lib.on'); await w(900);
    await expectEdges('thư viện mở', INK, TILE, {dim:true});
    await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-go'); await w(700); await expectEdges('thư viện đóng', INK, INK, {darkOnly:true, edge:true});
  });
  var L='#loop-host .loop:nth-child(1) ';
  await run('W3', 'Loop 1:1: thiết lập Ink/Ink → Đạt → rest-setup Acid/Acid → nghỉ: trên Ink (mực dâng), dưới Acid → mực phủ kín Ink/Ink', async function(){
    await page.click('#pl-go'); await screen('p-loop'); await w(1300); await expectEdges('thiết lập set', INK, INK, {darkOnly:true});
    await page.click(L+'.c1'); await w(600); await expectEdges('đang tập', INK, INK, {darkOnly:true});
    await page.click(L+'.j1'); await w(300);
    /* vòng loang từ nút Đạt (sát đáy): mép dưới phủ kín sau ~100ms → dải dưới Acid; mép trên chỉ khi vòng tới (~520ms) → dải trên còn Ink;
       syncTheme() gọi chen ngang (ví dụ pill) không được kéo dải dưới về Ink */
    var mid=await ev(function(){ syncTheme(); var cs=getComputedStyle(document.documentElement); return cs.getPropertyValue('--edge-t').trim()+'/'+cs.getPropertyValue('--edge-b').trim(); });
    check(/#0A0A0A\/#D4FF00/i.test(mid), 'vòng loang 300ms: dải trên Ink, dải dưới Acid (theo mép vòng đã chạm), syncTheme không ghi đè: '+mid);
    await w(900); await pillGone(); await expectEdges('rest-setup (màn Acid)', ACID, ACID); await shot('rest-setup-acid');
    await ev(function(){ state.session.people[0].restTotal=3; saveSession(); });
    await page.click(L+'.c1'); await w(400); await expectEdges('đang nghỉ 400ms (mực dâng từ trên)', INK, ACID); await shot('rest-ink-rising');
    await page.waitForFunction(function(){ var l=document.querySelector('#loop-host .loop'); return l && l.classList.contains('inkfull'); }, null, {timeout:9000});
    await w(250); await expectEdges('mực phủ kín', INK, INK, {darkOnly:true});
  });
  await run('W4', 'Pill: đang hiện (y ≥ 10) không che điểm lấy mẫu; sau khi tắt → hidden (display:none) và tính lại màu', async function(){
    /* quay lại màn Acid: Bước khác → màng (tối) → chạm bài đang tập = vào set mới → Ink → Bắt đầu set → Đạt → Acid */
    await page.click(L+'.g1'); await w(500); await page.click(L+'.film .exl button:first-child'); await w(900);
    await page.click(L+'.c1'); await w(500); await page.click(L+'.j1'); await w(1200); await pillGone(); await expectEdges('rest-setup lần 2', ACID, ACID);
    await ev(function(){ notify('Kiểm tra pill trên Acid'); }); await w(500);
    var st=await ev(function(){ var p=document.getElementById('pill'), r=p.getBoundingClientRect(); return {on:p.classList.contains('on'), hidden:p.hidden, top:Math.round(r.top), pe:getComputedStyle(p).pointerEvents}; });
    check(st.on && !st.hidden && st.top>=10, 'pill hiện ở y='+st.top+' (điểm lấy mẫu y=4 nằm ngoài pill)');
    await expectEdges('pill đang hiện (bóng pill phủ nhẹ mép trên → tol 8)', ACID, ACID, {tol:8}); await shot('pill-on-acid');
    await ev(function(){ hidePill(); }); await w(120);
    var e1=await edges(); check(e1.t.container!=='wk-t' || e1.t.kind==='IsCandidate', 'đang mờ đi: '+e1.t.chain.join('>'));
    await w(400);
    var st2=await ev(function(){ var p=document.getElementById('pill'); return {on:p.classList.contains('on'), hidden:p.hidden, disp:getComputedStyle(p).display}; });
    check(!st2.on && st2.hidden && st2.disp==='none', 'pill ẩn hẳn sau 240ms: '+JSON.stringify(st2));
    await expectEdges('pill đã ẩn', ACID, ACID);
    /* hai vòng loang chồng nhau (QA v2.4.3): Hoàn tác 380ms sau Đạt → vòng Ink chạm mép dưới trước khi vòng Acid kết thúc;
       khi vòng Acid kết thúc (540ms) không được kéo mép dưới về Acid, và nền chỉ về Ink khi vòng Ink phủ kín */
    await page.click(L+'.g1'); await w(900);                                   /* Hoàn tác → thiết lập (Ink) */
    await page.click(L+'.c1'); await w(500); await page.click(L+'.j1'); await w(380); await page.click(L+'.g1'); await w(240);
    var ov=await ev(function(){ var cs=getComputedStyle(document.documentElement), l=document.querySelector('#loop-host .loop'); return {b:cs.getPropertyValue('--edge-b').trim(), bga:l.classList.contains('bga')}; });
    check(/#0A0A0A/i.test(ov.b), 'vòng Ink đã chạm mép dưới, vòng Acid kết thúc không ghi đè: '+JSON.stringify(ov));
    await w(700); await pillGone();
    var ov2=await ev(function(){ var l=document.querySelector('#loop-host .loop'); return {ph:state.session.people[0].phase, bga:l.classList.contains('bga')}; });
    check(ov2.ph==='setup' && !ov2.bga, 'sau hai vòng: thiết lập, nền Ink: '+JSON.stringify(ov2)); await expectEdges('sau hai vòng chồng nhau', INK, INK, {darkOnly:true});
    await page.click(L+'.c1'); await w(500); await page.click(L+'.j1'); await w(1200); await pillGone(); await expectEdges('rest-setup lần 3', ACID, ACID);
  });
  await run('W5', 'Màng .film: Acid 93 % trên nửa Ink = #C6EE01, trên Acid = Acid; đóng màng → về màu nền', async function(){
    await ev(function(){ state.session.people[0].restTotal=60; saveSession(); });
    await page.click(L+'.c1'); await w(400); await expectEdges('nghỉ dài, mực mới dâng', INK, ACID);
    await page.click(L+'.g1'); await w(600);
    var f=await ev(function(){ var f=document.querySelector('#loop-host .loop .film'); return {on:f.classList.contains('on'), dark:f.classList.contains('dark'), op:getComputedStyle(f).opacity}; });
    check(f.on && !f.dark && f.op==='1', 'màng Acid mở: '+JSON.stringify(f));
    await expectEdges('màng Acid', FILM_INK, ACID, {tol:3}); await shot('film-acid');
    await page.click(L+'.film .exl button:first-child'); await w(1000); await expectEdges('vào set mới (Ink)', INK, INK, {darkOnly:true});
  });
  await run('W6', 'Rời loop (Bước khác → Kết thúc buổi tập) → tổng kết Ink/Ink', async function(){
    await page.click(L+'.c1'); await w(500); await page.click(L+'.j1'); await w(1200); await pillGone(); await expectEdges('Acid trước khi rời', ACID, ACID);
    await page.click(L+'.c1'); await w(400); await page.click(L+'.g1'); await w(500); await page.click(L+'.film .fend'); await screen('p-summary'); await w(800);
    await expectEdges('tổng kết', INK, INK, {darkOnly:true});
  });
  await run('W7', 'Loop 1:2: nửa trên Acid → dải trên Acid, dải dưới Ink; nửa dưới Acid → cả hai Acid', async function(){
    await C.ctx.close(); C=await mk(); page=C.page; await screen('p-pin'); await w(500); await pin('1234'); await screen('p-home'); await w(1500);
    await page.click('#h-go'); await screen('p-pick'); await w(600);
    await page.click('#pk-list .row:has-text("Doãn Quang")'); await page.click('#pk-list .row:has-text("Quang Vinh")'); await page.click('#pk-go'); await screen('p-confirm'); await w(1500);
    await page.click('#cf-go'); await screen('p-plan'); await page.waitForSelector('#lib.on'); await w(900);
    await page.click('#lib-list .row:nth-of-type(1)'); await page.click('#lib-go'); await w(700);
    await page.click('#pl-go'); await screen('p-loop'); await w(1300);
    check(await ev(function(){ return document.getElementById('loop-host').classList.contains('two'); }), 'loop chia đôi');
    await expectEdges('1:2 thiết lập', INK, INK, {darkOnly:true});
    await ev(function(){ setFocus(0); }); await w(400); await page.click('#loop-host .loop:nth-child(1) .c1'); await w(500);
    await ev(function(){ setFocus(0); }); await w(400); await page.click('#loop-host .loop:nth-child(1) .j1'); await w(1200);
    await pillGone(); await expectEdges('1:2 nửa trên Acid', ACID, INK); await shot('two-top-acid');
    await ev(function(){ setFocus(1); }); await w(400); await page.click('#loop-host .loop:nth-child(2) .c1'); await w(500);
    await ev(function(){ setFocus(1); }); await w(400); await page.click('#loop-host .loop:nth-child(2) .j1'); await w(1200);
    await pillGone(); await expectEdges('1:2 cả hai Acid', ACID, ACID); await shot('two-both-acid');
  });
  await run('W8', 'Không lỗi JS', async function(){ check(!PAGEERR.length, 'PAGEERR: '+PAGEERR.join(' | ')); });

  await C.ctx.close(); await browser.close(); srv.close();
  var fails=RES.filter(function(r){ return r.fails.length; });
  console.log('\n'+(fails.length?'FAIL':'PASS')+' '+(RES.length-fails.length)+'/'+RES.length+(PAGEERR.length?'  PAGEERR '+PAGEERR.length:'  0 PAGEERR'));
  process.exit(fails.length?1:0);
})().catch(function(e){ console.error(e); process.exit(2); });

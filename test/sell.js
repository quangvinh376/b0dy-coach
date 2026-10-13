/* Bán cho khách mới (v2.9.0 · sell.js; chuyển động liền mạch v2.13.0; giảm theo % + phần tử chung v2.14.0; biểu đồ buổi + máy in v2.15.0) — Playwright, Chromium, iPhone 393×852 dpr2 touch + 375×667 / 430×932 + giảm chuyển động.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/sell.js
   - Bộ tính (Node, không trình duyệt): trần ưu đãi, đơn giá, thời hạn, chia kỳ, phí quẹt, nội dung chuyển khoản, VietQR, mã QR.
   - DEMO (?demo): luồng đầy đủ 1:1 (chuyển khoản · thẻ · tiền mặt), lùi từng bước giữ lựa chọn, gói 12 bỏ ưu đãi, gói 48 chia 3 kỳ lệch,
     1:2 = 1:1 với bảng giá 1:2 (một khách, một số 0, một mã), gói 72 vòng tặng thứ hai, tâm số gọn khi số 0 nhỏ.
   - CHUYỂN ĐỘNG (v2.12.0 cân bằng theo main flow buổi tập · v2.13.0 thứ đang có trên màn biến thành thứ của bước sau): UI đổi như dòng chữ
     của loop (240 ms, trượt 7 pt), mục B (nảy từ .9, chờ 200 ms), số đếm theo tuần sáng (không "00", chấm Acid thu trước), số đang đếm thì đếm
     xong rồi mới co giãn thành số của bước sau, "36 buổi" bay lên tiêu đề, tặng buổi = sao chổi vào số 0, chữ số lăn đúng số nấc, số 0 đổ vào
     khe in rồi phiếu trồi + lịch thu dựng lên từ khe, số 0 nghiêng thành gạch dưới họ tên, nút chính giữ chỗ đổi chữ (Tiếp → Xong), hàng điều
     hướng trượt theo bàn phím, ô giữa mã Ink + chữ 0 Paper, Xong → chữ 0 bay về đúng chữ 0 nút Sell, thẻ → giá trị phải trả không nảy,
     rảnh 10 s thì số 0 thôi "thở".
   - v2.14.0 (chủ studio 23:08): nhãn tâm ĐƠN GIÁ GỐC ⇄ ĐƠN GIÁ SAU ƯU ĐÃI theo ưu đãi · giảm theo % (bước 0,25 %) · bỏ vành ⇄ đường kẻ: ĐƠN GIÁ
     ở tâm bay xuống ô của nó trên tờ phiếu trắng đang trồi, chữ trên phiếu hiện lan ra từ dòng đó; tờ phiếu chìm lại vào khe khi rời; chấm
     Acid của "Chuyển khoản" thành gạch dưới họ tên (lùi: gạch co thành chấm rơi về chỗ cũ); lùi về Ưu đãi: con số rời phiếu bay về tâm.
   - v2.15.0 (chủ studio 13/10 01:05): chữ phiếu theo Figma (ĐƠN GIÁ GỐC · SAU ƯU ĐÃI CÒN gạch dưới · THỜI HẠN GÓI · TỔNG GIÁ TRỊ GÓI, bỏ /BUỔI)
     · khe in 3D (mặt máy + khe, giấy chui ra trước mặt máy) · thanh giảm tô Acid tới núm · số đổi giá trị lăn bánh xe (lò xo tới hạn)
     · trả góp chia đều (giảm làm tròn theo số kỳ, không còn KỲ 1 THÊM) · logo B0DY giữa mã (chữ 0 trước, B · D · Y trượt ra; Xong: thu vào
     chữ 0 rồi chữ 0 về nút Sell) · từ Phương thức trả: biểu đồ buổi dàn ngang (đúng S + tặng chấm, cột 3 buổi), tiền mặt cũng có.
   - v2.16.0 (chủ studio 14/10 00:05, Figma 08F · biến thể 06): biểu đồ buổi thành ĐƯỜNG BĂNG — hàng 3 buổi lùi xa về phía con số, phối
     cảnh đúng (D ÷ (y − điểm tụ) tuyến tính theo hàng), hạt nhỏ dần, hai mép đường, nhãn KỲ ngoài mép phải ngang hàng buổi mốc; hiện từ
     hàng gần ra xa cùng hai mép, hít về điểm tụ khi sang phiếu / họ tên; cả cụm số + đường dời cùng một đường khi đổi bước.
   - MOCK API (không ?demo): lệnh 'bank' → mã VietQR đúng tài khoản giả, cache, chưa cài tài khoản → báo lỗi.
   Số tài khoản trong test là SỐ GIẢ (repo công khai). Mã thoát 1 nếu có FAIL hoặc PAGEERR. */
var {chromium}=require('playwright'); var serve=require('./serve'); var fs=require('fs'); var path=require('path'); var assert=require('assert');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19131, OUT=path.join(__dirname,'out_sell');
var SV=require('../sell.js'), SVE=SV.SVE, QRX=SV.QRX;
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
var RES=[], PAGEERR=[], CUR=null, P=null;
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
/* v2.16 đường băng: mỗi hạt khớp đúng một chỗ (hàng k, cột c) của phép chiếu y = yV + D·z0 ÷ (z0 + k), x = cx + (c − 1)·Wn·s, không trùng,
   nằm giữa hai mép, cỡ = max(1,6; hạt gần × s) (mốc × 1,15); hai mép đã dựng xong đúng hình học. o: {G: geo.run, cx, P: _pts, R: _rail} */
function runway(o, n, nm){
  var G=o.G, P=o.P||[], R=o.R, out={n:P.length}, bad=[], used={}, mk=0; if(!G || !R){ out.err='không có đường băng'; out.ok=false; return out; }
  var z0=R.z0, K=Math.ceil(n/3); out.K=G.K;
  P.forEach(function(p){ var s=(p[1]-G.yV)/G.D, k=Math.round(z0/s-z0), sk=z0/(z0+k), c=Math.round((p[0]-o.cx)/(G.Wn*sk))+1, d0=Math.max(1.6, G.dN*sk), key=k*3+c;
    if(!(k>=0 && k<K && c>=0 && c<=2 && key<n) || Math.abs(p[1]-(G.yV+G.D*sk))>0.05 || Math.abs(p[0]-(o.cx+(c-1)*G.Wn*sk))>0.05){ bad.push(['chỗ', +p[0].toFixed(1), +p[1].toFixed(1), k, c]); return; }
    if(used[key]) bad.push(['trùng', key]); used[key]=1;
    if(Math.abs(p[0]-o.cx)+p[2]/2>R.ln*G.Wn*sk) bad.push(['ngoài mép', key]);
    if(Math.abs(p[2]-d0)<0.03) return; if(Math.abs(p[2]-d0*1.15)<0.03){ mk++; return; } bad.push(['cỡ', key, +p[2].toFixed(2), +d0.toFixed(2)]); });
  var r=R.r; if(!r || Math.abs(r.a-1)>0.01 || Math.abs(r.yV-G.yV)>0.05 || Math.abs(r.D-G.D)>0.05 || Math.abs(r.Wn-G.Wn)>0.05 || Math.abs(r.kz-G.kz)>0.01 || Math.abs(r.cx-o.cx)>0.05) bad.push(['mép', r]);
  out.mk=mk; out.bad=bad.slice(0,4); out.ok=P.length===n && G.K===K && !bad.length && Object.keys(used).length===n && mk===(nm||0);
  out.row=function(pt){ return Math.round(z0/((pt[1]-G.yV)/G.D)-z0); }; return out;
}
function rwQ(){ var G=SVX._geo(); return {L:SVX._labs(), G:G.run, cx:G.cx, P:SVX._pts(), R:SVX._rail(), W:innerWidth}; }
async function shot(page, name){ try{ await page.screenshot({path:path.join(OUT, name+'.png')}); }catch(e){} }
async function run(id, name, fn){
  if(process.env.ONLY && process.env.ONLY.split(',').indexOf(id)<0) return;
  CUR={id:id, name:name, fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  if(CUR.fails.length && P) await shot(P, id+'-fail');
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):''));
}
async function mkctx(browser, vp, extra){
  var o={viewport:vp||{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true}; for(var k in (extra||{})) o[k]=extra[k];
  var ctx=await browser.newContext(o);
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  return ctx;
}
function nowPg0(){ return '.page.sv.on:not(.leave-fwd):not(.leave-back)'; }
function H(page){
  var h={};
  h.wait=function(ms){ return page.waitForTimeout(ms); };
  h.ev=function(fn, a){ return page.evaluate(fn, a); };
  h.cur='.page.sv.on:not(.leave-fwd):not(.leave-back) ';
  h.step=function(){ return page.evaluate(function(){ return SVX._step(); }); };
  h.st=function(){ return page.evaluate(function(){ return JSON.parse(JSON.stringify(SVX._st())); }); };
  h.txt=function(sel){ return page.evaluate(function(s){ var e=document.querySelector(s); return e ? e.textContent.replace(/\s+/g,' ').trim() : null; }, sel); };
  /* số ở tâm: chữ "thật" (v2.10.0 chữ số lăn có lớp ô lăn đè lên → đọc qua SVX._ctr: data-t, bỏ ô lăn / số 0 giữ chỗ) */
  h.ctr=function(){ return page.evaluate(function(){ return SVX._ctr().replace(/\s+/g,' ').trim(); }); };
  /* hàng trả lời / dòng phiếu: "nhãn giá-trị" (.l + ' ' + .v) */
  h.rows=function(sel){ return page.evaluate(function(s){ return [].map.call(document.querySelectorAll(s), function(r){ var l=r.querySelector('.l'), v=r.querySelector('.v'); return ((l?l.textContent:'')+' '+(v?v.textContent:'')).replace(/\s+/g,' ').trim(); }); }, sel); };
  h.tap=async function(sel){ await page.click(h.cur+sel); };
  h.waitStep=async function(id, ms){ var t0=Date.now(); while(Date.now()-t0<(ms||3000)){ if((await h.step())===id){ await h.wait(80); return true; } await h.wait(40); } return false; };
  h.drag=async function(s0, s1){ var a=await page.locator(h.cur+s0).boundingBox(), b=await page.locator(h.cur+s1).boundingBox();
    await page.mouse.move(a.x+a.width/2, a.y+a.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2, b.y+b.height/2, {steps:6}); await page.mouse.up(); };
  h.slide=async function(frac){ var r=await page.locator(h.cur+'.sv-sl').boundingBox(), x=r.x+12+(r.width-24)*frac;
    await page.mouse.move(r.x+12, r.y+r.height/2); await page.mouse.down(); await page.mouse.move(x, r.y+r.height/2, {steps:5}); await page.mouse.up(); };
  h.login=async function(){ for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")'); var t0=Date.now(); while(Date.now()-t0<4000){ if(await page.evaluate(function(){ return state.screen; })==='p-home') break; await h.wait(50); } await h.wait(1200); };
  /* đi nhanh tới một bước: q1 mode → q2 [f0,f1] → q3 [m0,m1] → gói S */
  h.toPkg=async function(mode, fi, mi, S){
    await page.click('#h-sell'); await h.waitStep('q1');
    await h.tap('.sv-n[data-i="'+(mode==='1:2'?1:0)+'"]'); await h.waitStep('q2');
    if(fi[0]===fi[1]) await h.tap('.sv-n[data-i="'+fi[0]+'"]'); else await h.drag('.sv-n[data-i="'+fi[0]+'"]', '.sv-n[data-i="'+fi[1]+'"]'); await h.waitStep('q3');
    if(mi[0]===mi[1]) await h.tap('.sv-n[data-i="'+mi[0]+'"]'); else await h.drag('.sv-n[data-i="'+mi[0]+'"]', '.sv-n[data-i="'+mi[1]+'"]'); await h.waitStep('pk');
    if(S){ var L=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('.page.sv.on:not(.leave-fwd):not(.leave-back) .sv-r .t'), function(e){ return parseInt(e.textContent,10); }); });
      await h.tap('.sv-r[data-i="'+L.indexOf(S)+'"]'); }
  };
  return h;
}

(async function(){
  /* ================= 0 · BỘ TÍNH (Node) ================= */
  CUR={id:'E', name:'bộ tính', fails:[]}; RES.push(CUR);
  try{
    assert.deepEqual(SVE.match(3,4,3,3),[36,48]); assert.deepEqual(SVE.match(3,3,1,6),[12,24,36,48,72]); assert.deepEqual(SVE.match(2,3,2,2),[24]); assert.deepEqual(SVE.match(5,5,6,6),[72]);
    /* v2.14: giảm theo % — phần vạn (625 = 6,25 %), bước 0,25 %; số tiền giảm xuống bước 1.000 ₫ */
    [[24,500],[36,625],[48,750],[72,1000],[12,0]].forEach(function(x){ assert.equal(SVE.pMax(x[0]),x[1]); }); assert.equal(SVE.PSTEP,25);
    assert.equal(SVE.pCap(36,0),625); assert.equal(SVE.pCap(36,1),400); assert.equal(SVE.pCap(36,2),200); assert.equal(SVE.pCap(36,3),0); assert.equal(SVE.pCap(48,1),550); assert.equal(SVE.pCap(24,1),250); assert.equal(SVE.pCap(72,3),550);
    /* v2.15: tiền giảm làm tròn tới bội của (số kỳ × 1.000 ₫) → tổng sau giảm chia hết cho số kỳ (không còn KỲ 1 THÊM), lệch ≤ 1.500 ₫ */
    assert.equal(SVE.dOf('1:1',36,150),216000); assert.equal(SVE.dOf('1:1',48,25),45000); assert.equal(SVE.dOf('1:1',24,25),27000);
    SVE.PKG.forEach(function(S){ ['1:1','1:2'].forEach(function(md){ var k=(SVE.INST[S]||[]).length+1; for(var pc=0; pc<=SVE.pMax(S); pc+=SVE.PSTEP){ var q=SVE.quote(md,S,0,pc), sp=SVE.split(q.total,k);
      assert.ok(sp.every(function(v){ return v===sp[0]; }), 'kỳ đều nhau '+md+' '+S+' '+pc+': '+sp); assert.ok(Math.abs(q.d-S*SVE.price(md,S)*pc/10000)<=1500, 'lệch ≤ 1.500 ₫'); } }); });
    assert.equal(SVE.pcTxt(625),'6,25'); assert.equal(SVE.pcTxt(250),'2,50'); assert.equal(SVE.pcTxt(25),'0,25'); assert.equal(SVE.pcTxt(0),'0,00'); assert.equal(SVE.pcTxt(1000),'10,00');
    assert.ok(SVE.locked(36,3,25) && !SVE.locked(36,2,200) && SVE.locked(36,2,225) && !SVE.locked(36,1,400) && SVE.locked(36,1,425), 'vòng tặng khoá khi % giảm đã chiếm chỗ');
    var q=SVE.quote('1:1',36,2,0); assert.equal(q.unit,378947); assert.equal(q.sessions,38); assert.equal(q.weeks,13); assert.equal(q.pc,0); assert.equal(q.pcap,200);
    q=SVE.quote('1:1',36,2,200); assert.equal(q.unit,371368); assert.equal(q.d,288000); assert.equal(q.total,14112000);
    q=SVE.quote('1:1',24,1,250); assert.equal(q.unit,421200); assert.equal(q.total,10530000); assert.equal(q.weeks,null);
    q=SVE.quote('1:1',36,2,150); assert.equal(q.unit,373263); assert.equal(q.total,14184000);
    q=SVE.quote('1:1',72,3,0); assert.equal(q.unit,336000); assert.equal(q.weeks,25); assert.equal(SVE.quote('1:1',48,4,0).weeks,18); assert.equal(SVE.quote('1:1',72,7,0).weeks,27);
    q=SVE.quote('1:1',36,2,500); assert.equal(q.pc,200, 'giảm vượt trần bị kẹp'); assert.equal(q.d,288000);
    assert.deepEqual(SVE.split(14400000,2),[7200000,7200000]); assert.deepEqual(SVE.split(17750000,3),[5918000,5916000,5916000]);
    assert.equal(SVE.gross(7200000,1815),7333096); assert.equal(SVE.gross(1000000,0),1000000);
    assert.equal(SVE.memo('Nguyễn Quang Vinh',36,true),'N Q VINH 36B TRA GOP'); assert.equal(SVE.memo('Nguyễn Quang Vinh',36,false),'NGUYEN QUANG VINH 36B');
    assert.equal(SVE.memo('Đặng Thị Ánh',48,true),'DANG THI ANH 48B TRA GOP'); assert.ok(SVE.memo('Tôn Nữ Hoàng Bảo Ngọc Khuê Phương',48,true).length<=25);
    assert.equal(SVE.crc16('123456789'),'29B1');
    var pl=SVE.vietqr('970407','0123456789',7200000,'N Q VINH 36B TRA GOP');   /* tài khoản GIẢ */
    assert.equal(pl.slice(-4), SVE.crc16(pl.slice(0,-4))); assert.ok(/^000201010212/.test(pl)); assert.ok(pl.indexOf('54077200000')>0); assert.ok(pl.indexOf('6224'+'0820N Q VINH 36B TRA GOP')>0);
    var m=QRX.encode(pl,9); assert.equal(m.n, 53); assert.equal(m.v, 9);
  }catch(e){ CUR.fails.push(String(e.message||e)); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+'E bộ tính'+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):''));

  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME}), URL='http://localhost:'+PORT+'/';
  /* ================= 1 · DEMO 393×852 ================= */
  var ctx=await mkctx(browser), page=await ctx.newPage(); P=page; var h=H(page);
  page.on('pageerror', function(e){ PAGEERR.push('demo: '+String(e)); });
  await page.goto(URL+'?demo'); await page.waitForSelector('#p-pin.on'); await h.wait(500); await h.login();

  await run('A', 'nút Sell → câu 01 (hạt chờ + chấm Acid)', async function(){
    var r=await h.ev(function(){ var b=document.getElementById('h-sell').getBoundingClientRect(), n=document.getElementById('h-name').getBoundingClientRect(); return {x:b.x, y:b.y, w:b.width, hgt:b.height, right:innerWidth-b.right, ny:n.y+n.height/2, by:b.y+b.height/2, txt:document.getElementById('h-sell').textContent.trim()}; });
    check(r.txt==='Sell', 'chữ nút: '+r.txt); check(Math.abs(r.hgt-32)<1, 'cao 32: '+r.hgt); check(Math.abs(r.right-24)<1.5, 'cách mép phải 24: '+r.right); check(Math.abs(r.ny-r.by)<3, 'cùng hàng tên coach');
    await page.click('#h-sell'); check(await h.waitStep('q1'), 'vào q1'); await h.wait(900);
    check(await h.ev(function(){ return state.screen; })==='p-sv' || await h.ev(function(){ return state.screen; })==='p-sv2', 'trang bán hàng');
    check(!(await h.ev(function(){ return document.getElementById('sv-dial').hidden; })), 'canvas số 0 hiện');
    var d=await h.ev(function(){ return SVX._dots(); }); check((d.p||0)+(d.g||0)>=60, 'đủ hạt chờ: '+JSON.stringify(d));
    check((await h.txt(h.cur+'.t1'))==='Hình thức tập?', 'tiêu đề');
    check(!(await h.ev(function(){ return !!document.querySelector('.page.sv.on .sv-cap.on'); })), 'chưa chọn → chưa có viên Acid dưới số');
    var px=await h.ev(function(){ var c=document.getElementById('sv-dial'), g=SVX._geo(), k=c.width/c.clientWidth, d=c.getContext('2d').getImageData(Math.round(g.cx*k)-2, Math.round(g.cy*k)-2, 4, 4).data; return [d[0],d[1],d[2],d[3]]; });
    check(px[1]>200 && px[0]>150 && px[2]<80, 'chấm Acid ở tâm: '+px);
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-nav button').length; })===1, 'câu 01 chỉ có ⌂');
    await shot(page,'A-q1');
  });
  await run('B', 'câu 02 kéo 3 → 4 · câu 03 · gói khớp', async function(){
    await h.tap('.sv-n[data-i="0"]'); check(await h.waitStep('q2'), 'sang q2');
    await h.drag('.sv-n[data-i="1"]', '.sv-n[data-i="2"]');
    check(JSON.stringify((await h.st()).f)==='[3,4]', 'tần suất 3–4: '+JSON.stringify((await h.st()).f));
    var dim=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on:not(.leave-fwd):not(.leave-back) .sv-n'), function(b){ return b.classList.contains('dim')?1:0; }).join(''); }); check(dim==='1001', 'mờ ngoài khoảng: '+dim);
    var cap=await h.ev(function(){ var d=document.querySelector('.page.sv.on:not(.leave-fwd):not(.leave-back) .sv-cap'), x=function(e){ return parseFloat((/translateX\((-?[\d.]+)px\)/.exec(e.style.transform)||[])[1]); }; return {w:x(d.querySelector('.cr'))+8-x(d.querySelector('.cl')), on:d.classList.contains('on')}; }); check(cap.on && cap.w>60, 'viên con nhộng giãn qua 2 số (đích transform): '+JSON.stringify(cap));
    check(await h.waitStep('q3'), 'nhả tay → q3');
    await h.wait(700); check((await h.ctr())==='MỖI THÁNG 12–16 BUỔI', 'tâm: '+(await h.ctr()));
    var d=await h.ev(function(){ return SVX._dots(); }); check(d.p===12 && d.o===4, 'q2: 4 tuần × 3 hạt + 4 hạt rỗng làn ngoài: '+JSON.stringify(d));
    await h.tap('.sv-n[data-i="2"]'); check(await h.waitStep('pk'), 'sang gói');
    check((await h.ctr())==='36–48 BUỔI', 'tâm 36–48: '+(await h.ctr()));
    var rows=await h.rows('.page.sv.on:not(.leave-fwd) .sv-r');
    check(JSON.stringify(rows)===JSON.stringify(['36 buổi 400.000₫/BUỔI','48 buổi 370.000₫/BUỔI']), 'chỉ 2 gói khớp: '+JSON.stringify(rows));
    check(await h.ev(function(){ return document.querySelector('.page.sv.on:not(.leave-fwd) .sv-rows').classList.contains('L'); }), 'hai gói → hàng Lớn');
    await h.wait(500); d=await h.ev(function(){ return SVX._dots(); }); check(d.p===36 && d.o===12, 'q3: 12 tuần × 3 + 12 rỗng: '+JSON.stringify(d));
    await shot(page,'B-pk');
  });
  await run('C', 'Ưu đãi: vòng tặng · thanh giảm theo % · khoá · tâm ĐƠN GIÁ GỐC ⇄ ĐƠN GIÁ SAU ƯU ĐÃI', async function(){
    await h.tap('.sv-r[data-i="0"]'); check(await h.waitStep('deal'), 'sang ưu đãi');
    check((await h.txt(h.cur+'.t1 .ac'))==='36 buổi', 'tiêu đề Acid "36 buổi"');
    check((await h.ctr())==='ĐƠN GIÁ GỐC 400.000₫ Σ 14.400.000 ₫ / 36 BUỔI', 'tâm chưa ưu đãi = ĐƠN GIÁ GỐC: '+(await h.ctr()));
    check((await h.txt(h.cur+'.sv-lv:nth-child(2) .h .v'))==='0,00%', 'thanh giảm ghi % (2 số lẻ, bề ngang cố định): '+(await h.txt(h.cur+'.sv-lv:nth-child(2) .h .v')));
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-g').length; })===3, 'gói 36: 3 vòng');
    await h.tap('.sv-g[data-k="2"]'); await h.wait(300);
    var s=await h.st(); check(s.b===2, 'tặng 2'); check((await h.ctr())==='ĐƠN GIÁ SAU ƯU ĐÃI 378.947₫ Σ 14.400.000 ₫ / 38 BUỔI', 'có ưu đãi → nhãn đổi SAU ƯU ĐÃI: '+(await h.ctr()));
    var cls=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on .sv-g'), function(g){ return (g.classList.contains('on')?'A':'')+(g.classList.contains('nx')?'+':'')+(g.classList.contains('lk')?'K':'')||'-'; }).join(' '); });
    check(cls==='A A +', 'vòng: '+cls);
    var tk=await h.ev(function(){ var s=document.querySelector('.page.sv.on .sv-sl'); return +((/scaleX\(([\d.]+)\)/.exec(s.querySelector('.tk').style.transform)||[])[1]); }); check(Math.abs(tk-1/3)<0.01, 'rãnh còn 1/3 (scaleX): '+tk);
    var d=await h.ev(function(){ return SVX._dots(); }); await h.wait(400); d=await h.ev(function(){ return SVX._dots(); }); check(d.a===2 && d.o===1, 'số 0: 2 hạt tặng Acid + 1 rỗng: '+JSON.stringify(d));
    await h.tap('.sv-g[data-k="2"]'); check((await h.st()).b===1, 'chạm lại vòng cuối đang sáng = bớt một');
    await h.tap('.sv-g[data-k="3"]'); check((await h.st()).b===3, 'chạm vòng 3 = tặng 3'); await h.wait(300);
    await h.slide(1); check((await h.st()).pc===0, 'tặng hết thì không giảm');
    await h.tap('.sv-g[data-k="2"]'); await h.slide(1); s=await h.st(); check(s.b===2 && s.pc===200, 'tặng 2 → giảm tối đa 2 %: '+s.pc);
    check((await h.ctr()).indexOf('371.368')>=0, 'đơn giá 371.368: '+(await h.ctr()));
    var pv=await h.ev(function(s){ var b=document.querySelector(s+' [data-k=d]'), sl=document.querySelector(s+' .sv-sl'); return {t:b.dataset.t!=null ? b.dataset.t : b.textContent, now:sl.getAttribute('aria-valuenow'), max:sl.getAttribute('aria-valuemax'), vt:sl.getAttribute('aria-valuetext')}; }, nowPg0());
    check(pv.t==='2,00' && pv.now==='2' && pv.max==='2' && pv.vt==='2,00 %', 'thanh: 2 % (aria theo %): '+JSON.stringify(pv));
    /* v2.15: phần đã giảm tô Acid tới đúng tâm núm (clip-path, cùng đích với núm) */
    var fl=await h.ev(function(s){ var sl=document.querySelector(s+' .sv-sl'), W=sl.clientWidth, f=sl.querySelector('.fl'), kn=sl.querySelector('.kn'), kx=12+parseFloat((/translateX\((-?[\d.]+)px\)/.exec(kn.style.transform)||[])[1]),
        r=parseFloat((/inset\(0px (-?[\d.]+)px/.exec(f.style.clipPath)||[])[1]); return {kx:kx, cut:W-r, bg:getComputedStyle(f).backgroundColor}; }, nowPg0());
    check(Math.abs(fl.kx-fl.cut)<0.6 && /212, 255, 0/.test(fl.bg), 'phần đã giảm tô Acid tới đúng tâm núm: '+JSON.stringify(fl));
    cls=await h.ev(function(){ return document.querySelector('.page.sv.on .sv-g[data-k="3"]').className; }); check(/\blk\b/.test(cls), 'vòng 3 khoá khi giảm đã chiếm chỗ');
    await h.tap('.sv-g[data-k="3"]'); check((await h.st()).b===2, 'vòng khoá không nhận chạm');
    await h.tap('.sv-g[data-k="1"]'); await h.slide(0.5); s=await h.st(); check(s.b===1 && s.pc===325, 'tặng 1, kéo nửa thanh = 3,25 % (bước 0,25 %): '+s.pc);
    await h.wait(400); check((await h.ctr())==='ĐƠN GIÁ SAU ƯU ĐÃI 376.541₫ Σ 13.932.000 ₫ / 37 BUỔI', 'tặng 1 + 3,25 %: '+(await h.ctr()));
    await h.slide(0); await h.tap('.sv-g[data-k="1"]'); await h.wait(400); s=await h.st();
    check(s.b===0 && s.pc===0 && (await h.ctr())==='ĐƠN GIÁ GỐC 400.000₫ Σ 14.400.000 ₫ / 36 BUỔI', 'bỏ hết ưu đãi → nhãn về ĐƠN GIÁ GỐC: '+(await h.ctr()));
    await h.tap('.sv-g[data-k="2"]'); s=await h.st(); check(s.b===2 && s.pc===0, 'về tặng 2 · giảm 0: '+JSON.stringify([s.b,s.pc]));
    await shot(page,'C-deal');
  });
  await run('D', 'Phiếu đề xuất (bill)', async function(){
    await h.tap('.svc'); check(await h.waitStep('bill'), 'sang phiếu'); await h.wait(1000);   /* số 0 đổ vào khe rồi phiếu trồi 460 ms (trễ 340) */
    var rows=await h.rows('.page.sv.on .sv-bill .r');
    check(JSON.stringify(rows)===JSON.stringify(['ĐƠN GIÁ GỐC 400.000₫','TẶNG THÊM 2BUỔI','SAU ƯU ĐÃI CÒN 378.947₫','THỜI HẠN GÓI 13TUẦN','KỲ TRẢ GÓP 2 × 7.200.000₫']), 'dòng phiếu (chữ theo Figma 13/10, bỏ /BUỔI): '+JSON.stringify(rows));
    check((await h.txt(h.cur+'.sv-bill .tl'))==='TỔNG GIÁ TRỊ GÓI', 'nhãn tổng: TỔNG GIÁ TRỊ GÓI'); check((await h.txt(h.cur+'.sv-bill .tt'))==='14.400.000₫', 'tổng 14.400.000');
    var ul=await h.ev(function(s){ var b=[].filter.call(document.querySelectorAll(s+' .sv-bill .r .v b'), function(x){ return x.textContent==='378.947'; })[0], a=getComputedStyle(b,'::after'), u=document.querySelectorAll(s+' .sv-bill b.u').length;
      return {u:u, cls:b.className, h:a.height, w:parseFloat(a.width), bw:b.getBoundingClientRect().width, bg:a.backgroundColor}; }, nowPg0());
    check(ul.u===1 && /\bu\b/.test(ul.cls) && ul.h==='1px' && Math.abs(ul.w-ul.bw)<0.6 && /10, 10, 10/.test(ul.bg), 'gạch dưới đúng con số SAU ƯU ĐÃI CÒN (một dòng): '+JSON.stringify(ul));
    check((await h.txt(h.cur+'.sv-bill .pk'))==='GÓI 36 BUỔI', 'tên gói');
    /* v2.15 khe in 3D (ảnh minh hoạ chủ studio): mặt máy bo 12, khe tối khoét ngang; giấy nằm TRƯỚC mặt máy, chân giấy đúng mép dưới khe (khung cắt) */
    var g=await h.ev(function(){ var pg=document.querySelector('.page.sv.on'), b=pg.querySelector('.sv-bill').getBoundingClientRect(), sl=pg.querySelector('.sv-slot'), sr=sl.getBoundingClientRect(), gp=getComputedStyle(sl,'::before'), bc=pg.querySelector('.sv-bc'),
        hd=pg.querySelector('.head').getBoundingClientRect(), nav=pg.querySelector('.sv-nav').getBoundingClientRect();
      return {sheetBottom:b.bottom, gapBottom:sr.bottom-parseFloat(gp.bottom), gapH:parseFloat(gp.height), plateH:sr.height, rad:getComputedStyle(sl).borderTopLeftRadius, front:+getComputedStyle(bc).zIndex>0, clip:getComputedStyle(bc).overflow,
        lip:pg.querySelectorAll('.sv-lip').length, sheetTop:b.top, headBottom:hd.bottom, gap:nav.top-sr.bottom, w:b.width}; });
    check(Math.abs(g.sheetBottom-g.gapBottom)<1 && g.gapH===8 && g.plateH===44 && g.rad==='12px' && g.front && g.clip==='hidden' && !g.lip, 'giấy chui ra từ khe, trước mặt máy (chân giấy ở mép dưới khe): '+JSON.stringify(g));
    check(g.sheetTop>g.headBottom+40, 'giấy dưới tiêu đề'); check(Math.abs(g.gap-28)<1, 'máy in cách nav 28'); check(Math.abs(g.w-313)<1, 'giấy rộng 313');
    var ac=await h.ev(function(){ var bad=0; document.querySelectorAll('.page.sv.on .sv-bill *').forEach(function(e){ var c=getComputedStyle(e).color; if(/212, 255, 0/.test(c)) bad++; }); return bad; }); check(ac===0, 'không Acid trên Paper');
    var low=await h.ev(function(){ var bad=[]; document.querySelectorAll('.page.sv.on .sv-bill *').forEach(function(e){ var cs=getComputedStyle(e); if(/JetBrains/.test(cs.fontFamily) && e.children.length===0 && e.textContent!==e.textContent.toUpperCase()) bad.push(e.textContent); }); return bad; }); check(!low.length, 'Mono viết HOA: '+low.join('|'));
    await shot(page,'D-bill');
  });
  await run('F', 'Phương thức trả → Hình thức trả → Chuyển khoản → Họ tên → mã QR', async function(){
    await h.tap('.svc'); check(await h.waitStep('pm'), 'sang phương thức trả');
    var rows=await h.rows('.page.sv.on:not(.leave-fwd) .sv-r');
    check(JSON.stringify(rows)===JSON.stringify(['Một lần 14.400.000₫','Chia 2 kỳ 2 × 7.200.000₫']), 'hàng: '+JSON.stringify(rows));
    await h.tap('.sv-r[data-i="1"]'); await h.wait(120);
    check((await h.ctr())==='TRẢ MỖI KỲ 7,2TR', 'tâm: '+(await h.ctr()));
    await h.wait(450); var d=await h.ev(function(){ return SVX._dots(); }); check(d.m===1 && d.p===14 && d.d===23 && !d.g, 'biểu đồ buổi: 14 buổi kỳ 1 · mốc KỲ 2 · 23 buổi sau — đúng 38 chấm, không tuần trống: '+JSON.stringify(d));
    /* v2.16 đường băng: 13 hàng (12 × 3 + 2) lùi xa về phía con số; nhãn KỲ 2 ngoài mép phải, ngang hàng buổi 15 (hàng 5, cột phải) */
    var lb=await h.ev(rwQ), rw=runway(lb, 38, 1); check(rw.ok, 'đường băng 38 chấm · 13 hàng · đúng phối cảnh · trong hai mép · mốc lớn hơn: '+JSON.stringify(rw));
    var L0=lb.L[0], s4=L0 ? (L0.dot[1]-lb.G.yV)/lb.G.D : 0;
    check(lb.L.length===1 && L0.t==='KỲ 2' && L0.bl && rw.row(L0.dot)===4 && L0.dot[0]>lb.cx+1 && Math.abs(L0.y-L0.dot[1])<0.6 && L0.x>lb.cx+lb.R.ln*lb.G.Wn*s4+3 && L0.x+30<lb.W-24,
      'nhãn KỲ 2 ngoài mép phải, ngang hàng buổi 15: '+JSON.stringify([lb.L, s4]));
    check(await h.waitStep('pf'), 'sang hình thức trả');
    check((await h.ctr())==='TRẢ MỖI KỲ 7,2TR', 'tâm giữ lịch thu');
    await h.tap('.sv-r[data-i="0"]'); check((await h.step())==='name', 'chuyển khoản → họ tên ngay (bàn phím iOS cần focus trong lượt chạm)');
    check(await h.ev(function(){ return document.activeElement && document.activeElement.id==='sv-in'; }), 'ô họ tên đang focus');
    await page.keyboard.type('Nguyễn Quang Vinh'); await h.wait(100);
    check((await h.txt('#sv-memo'))==='N Q VINH 36B TRA GOP', 'nội dung > 25 ký tự → rút họ + tên đệm: '+(await h.txt('#sv-memo')));
    await page.keyboard.press('Enter'); check(await h.waitStep('qr'), 'Tiếp → mã QR'); await h.wait(1900);   /* thẻ mở + số lăn + ⌂ nở thành Xong (1,4 → 1,8 s) */
    check((await h.txt(h.cur+'.sv-amt'))==='7.200.000₫', 'số tiền kỳ 1'); check((await h.txt(h.cur+'.sv-mm'))==='N Q VINH 36B TRA GOP', 'nội dung trên thẻ');
    check((await h.ev(function(){ return SVX._qr(); }))==='B0DY DEMO KHONG CHUYEN KHOAN', 'demo: mã không phải lệnh chuyển tiền');
    check(+(await h.ev(function(){ return document.getElementById('sv-qrc').dataset.v; }))>=9, 'mã đã vẽ');
    check((await h.txt(h.cur+'.svc'))==='Xong', 'nút Xong'); check(await h.ev(function(){ return [].filter.call(document.querySelectorAll('.page.sv.on .sv-nav button'), function(b){ return getComputedStyle(b).visibility!=='hidden' && getComputedStyle(b).opacity!=='0'; }).length; })===2, 'màn QR: ← · Xong');
    /* v2.15: logo B0DY của Branding (file chủ studio gửi 13/10, 06-b0dy-on-ink-square): chữ rộng 62,8 % ô, cao 20,1 %, chữ 0 khoét lỗ (evenodd) */
    var bd=await h.ev(function(s){ var b=document.querySelector(s+' .sv-badge'), sv=b.querySelector('svg.wmq'), br=b.getBoundingClientRect(), ps=[].map.call(sv.querySelectorAll('path'), function(p){ return p.getAttribute('class'); }).join(''),
        L=1e9, R=-1e9, T=1e9, B=-1e9; sv.querySelectorAll('path').forEach(function(p){ var r=p.getBoundingClientRect(); L=Math.min(L,r.left); R=Math.max(R,r.right); T=Math.min(T,r.top); B=Math.max(B,r.bottom); });
      return {bg:getComputedStyle(b).backgroundColor, fill:getComputedStyle(sv).fill, rule:getComputedStyle(sv.querySelector('.z')).fillRule, ps:ps, w:(R-L)/br.width, h:(B-T)/br.height, cy:((T+B)/2-br.top)/br.height, lbl:b.getAttribute('aria-label')}; }, h.cur);
    check(/10, 10, 10/.test(bd.bg) && /250, 250, 250/.test(bd.fill) && bd.ps==='bzdy' && bd.rule==='evenodd' && bd.lbl==='B0DY', 'ô giữa mã: nền Ink, logo B0DY Paper (B · 0 · D · Y tách lớp, chữ 0 có lỗ): '+JSON.stringify(bd));
    check(Math.abs(bd.w-.628)<.01 && Math.abs(bd.h-.201)<.01 && Math.abs(bd.cy-.5)<.01, 'đúng tỉ lệ file Branding (rộng 62,8 % · cao 20,1 % · giữa theo chiều dọc): '+JSON.stringify(bd));
    var c=await h.ev(function(){ var n=document.querySelector('.page.sv.on .sv-nav'), b=n.querySelector('.svc').getBoundingClientRect(), r=n.getBoundingClientRect(); return (b.left+b.right)/2-(r.left+r.right)/2; }); check(Math.abs(c)<1, 'nút chính ở giữa: '+c);
    await shot(page,'F-qr');
  });
  await run('G', 'Lùi từng bước giữ lựa chọn · ⌂ về trang chủ', async function(){
    await h.tap('.svb'); check(await h.waitStep('name'), 'QR ← họ tên'); check((await h.ev(function(){ return document.getElementById('sv-in').value; }))==='Nguyễn Quang Vinh', 'giữ họ tên');
    await h.wait(300); await h.tap('.svb'); check(await h.waitStep('pf'), '← hình thức trả');
    check(await h.ev(function(){ return document.querySelector('.page.sv.on:not(.leave-back):not(.leave-fwd) .sv-r.on').dataset.i; })==='0', 'giữ chọn chuyển khoản');
    var ld=await h.ev(function(s){ var sd=document.querySelector(s+' .sv-r.on .sd'), ln=document.querySelectorAll('.svln'); return {ln:ln.length, sd:getComputedStyle(sd).visibility, an:ln[0] ? ln[0].getAnimations().map(function(a){ return a.effect.getTiming().duration+':'+a.effect.getTiming().delay; }).join(' ') : ''}; }, nowPg0());
    check(ld.ln===1 && ld.sd==='hidden' && ld.an==='260:0 340:200', 'lùi: gạch dưới co thành chấm rồi rơi về chỗ chấm của "Chuyển khoản": '+JSON.stringify(ld));
    check((await h.ctr())==='', 'số ở tâm chưa hiện khi gạch dưới (cùng độ cao) còn đang co — không đứng sát số như dấu trừ: '+(await h.ctr()));
    await h.wait(600); check(await h.ev(function(s){ return document.querySelectorAll('.svln').length===0 && getComputedStyle(document.querySelector(s+' .sv-r.on .sd')).visibility==='visible'; }, nowPg0()), 'chấm thật hiện, dọn chấm bay');
    check((await h.ctr())==='TRẢ MỖI KỲ 7,2TR', 'số đã hiện: '+(await h.ctr()));
    var d=await h.ev(function(){ return SVX._dots(); }); check(d.p===14 && d.m===1 && d.d===23, 'biểu đồ buổi hiện lại (đường băng): '+JSON.stringify(d));
    await h.wait(300); await h.tap('.svb'); check(await h.waitStep('pm'), '← phương thức trả'); await h.wait(300); await h.tap('.svb'); check(await h.waitStep('bill'), '← phiếu');
    var rb=await h.ev(function(s){ var pg=document.querySelector(s), a=pg.querySelector('.sv-bill').getAnimations()[0]; return {rise:pg.classList.contains('svrise'), body:pg.querySelector(':scope>.body').getAnimations().length, d:a ? a.effect.getTiming().duration : 0, dl:a ? a.effect.getTiming().delay : -1, fly:document.querySelectorAll('.svfly').length}; }, nowPg0());
    check(rb.rise && rb.body===0 && rb.d===420 && rb.dl===100 && rb.fly===0, 'lùi về phiếu: phiếu đã in trồi lại khỏi khe khi chữ màn cũ đã tắt (0,1 s → 0,42 s, không giấy xám, không bay số): '+JSON.stringify(rb));
    await h.wait(300); await h.tap('.svb'); check(await h.waitStep('deal'), '← ưu đãi');
    var bd=await h.ev(function(){ var fl=document.querySelectorAll('.svfly'), ly=document.querySelector('#sv-ctr .ly:not(.out)'), u=ly && ly.querySelector('[data-k=unit]'), o=document.querySelector('.page.sv.leave-back');
      return {fly:fl.length, t:fl[0] ? fl[0].textContent : '', u:u ? getComputedStyle(u).visibility : '', dl:ly ? ly.style.animationDelay : '', sink:!!o && o.classList.contains('svsink'), z:o ? getComputedStyle(o).zIndex : ''}; });
    check(bd.fly===1 && bd.t==='378.947' && bd.u==='hidden' && bd.dl==='310ms' && bd.sink && bd.z==='3', 'lùi: tờ phiếu chìm, ĐƠN GIÁ rời phiếu bay về tâm (nhãn + dòng Σ hiện khi số gần chạm): '+JSON.stringify(bd));
    await h.wait(200);
    var cls=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on:not(.leave-back) .sv-g'), function(g){ return g.classList.contains('on')?'A':'-'; }).join(''); }); check(cls==='AA-', 'giữ 2 vòng tặng: '+cls);
    await h.wait(350); var bl=await h.ev(function(){ var u=document.querySelector('#sv-ctr .ly:not(.out) [data-k=unit]'); return {fly:document.querySelectorAll('.svfly').length, u:getComputedStyle(u).visibility, c:SVX._ctr()}; });
    check(bl.fly===0 && bl.u==='visible' && bl.c==='ĐƠN GIÁ SAU ƯU ĐÃI 378.947₫ Σ 14.400.000 ₫ / 38 BUỔI', 'con số đã về tâm: '+JSON.stringify(bl));
    await h.wait(300); await h.tap('.svh'); await h.wait(500);
    check((await h.ev(function(){ return state.screen; }))==='p-home', '⌂ về trang chủ');
    check(await h.ev(function(){ return document.getElementById('sv-dial').hidden; }), 'số 0 tắt');
  });
  await run('H', 'Nhánh thẻ: Quốc tế TCB → số quẹt 7.333.096 ₫', async function(){
    await h.toPkg('1:1',[1,2],[2,2],36); await h.waitStep('deal'); await h.tap('.sv-g[data-k="2"]'); await h.tap('.svc'); await h.waitStep('bill'); await h.wait(300);
    await h.tap('.svc'); await h.waitStep('pm'); await h.tap('.sv-r[data-i="1"]'); await h.waitStep('pf'); await h.tap('.sv-r[data-i="2"]'); check(await h.waitStep('card'), 'sang loại thẻ');
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on:not(.leave-fwd) .sv-r').length; })===5, '5 loại thẻ');
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on:not(.leave-fwd) .svlogo').length; })===2, 'logo Visa/Mastercard ở 2 dòng quốc tế');
    await h.tap('.sv-r[data-i="1"]'); await h.wait(100); check((await h.ctr())==='', 'chạm loại thẻ: tâm không chớp phí 0,2 s (bước sau hiện số quẹt + phí): '+(await h.ctr()));
    check(await h.waitStep('val'), 'sang giá trị phải trả'); await h.wait(300);
    check((await h.ctr())==='THANH TOÁN KỲ 1 7.333.096₫ + 133.096₫PHÍ QUẸT THẺ', 'tâm: '+(await h.ctr()));
    await h.wait(400); var d=await h.ev(function(){ return SVX._dots(); }); check(d.m===1 && d.p===14 && d.v===23, 'biểu đồ buổi: kỳ này 14 buổi sáng, mốc KỲ 2, phần sau mờ hơn: '+JSON.stringify(d));
    await shot(page,'H-val'); await h.tap('.svc'); await h.wait(500); check((await h.ev(function(){ return state.screen; }))==='p-home', 'Xong → trang chủ');
  });
  await run('I', 'Gói 12: không ưu đãi, không trả góp · tiền mặt', async function(){
    await h.toPkg('1:1',[0,0],[0,0]); await h.wait(200);
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on:not(.leave-fwd) .sv-r').length; })===1, '2 buổi × 1 tháng → chỉ gói 12');
    check((await h.st()).S===12, 'một gói → chọn sẵn'); check((await h.ctr())==='12 BUỔI', 'tâm 12: '+(await h.ctr()));
    await h.tap('.sv-r[data-i="0"]'); check(await h.waitStep('bill'), 'gói 12 bỏ màn ưu đãi'); await h.wait(500);
    var rows=await h.rows('.page.sv.on .sv-bill .r');
    check(JSON.stringify(rows)===JSON.stringify(['ĐƠN GIÁ GỐC 500.000₫']), 'phiếu chỉ đơn giá gốc (thời hạn gói 12 chưa có trong tài liệu): '+JSON.stringify(rows));
    await h.tap('.svc'); check(await h.waitStep('pf'), 'không trả góp → thẳng hình thức trả'); await h.wait(250);   /* số hiện cùng các dòng màn sau (trễ 0,16 s, khi giấy đã chìm qua) */
    check((await h.ctr())==='THANH TOÁN 6TR', 'tâm: '+(await h.ctr()));
    await h.tap('.sv-r[data-i="1"]'); check(await h.waitStep('val'), 'tiền mặt → giá trị phải trả'); await h.wait(500);
    check((await h.ctr())==='THANH TOÁN 6.000.000₫', 'tâm: '+(await h.ctr()));
    var d=await h.ev(function(){ return SVX._dots(); }); check(d.p===12 && Object.keys(d).length===1, 'tiền mặt cũng có biểu đồ buổi (chủ studio 13/10): 12 chấm: '+JSON.stringify(d));
    await h.tap('.svc'); await h.wait(500);
  });
  await run('J', 'Gói 48 · giảm 0,25 % → 3 kỳ đều nhau (giảm làm tròn theo số kỳ — không còn KỲ 1 THÊM)', async function(){
    await h.toPkg('1:1',[1,2],[2,3],48); await h.waitStep('deal'); await h.wait(600);   /* chờ trang vào xong (đang trượt 24 px thì toạ độ thanh lệch) */
    await h.slide(1/30); var s=await h.st(); check(s.pc===25, 'giảm 0,25 %: '+s.pc);
    await h.tap('.svc'); await h.waitStep('bill'); await h.wait(400);
    var rows=await h.rows('.page.sv.on .sv-bill .r');
    check(rows.indexOf('KỲ TRẢ GÓP 3 × 5.905.000₫')>=0 && !rows.some(function(r){ return /KỲ 1 THÊM/.test(r); }) && rows.indexOf('GIẢM GIÁ 0,25%')>=0 && rows.indexOf('SAU ƯU ĐÃI CÒN 369.063₫')>=0, 'phiếu: '+JSON.stringify(rows));
    check((await h.txt(h.cur+'.sv-bill .tt'))==='17.715.000₫', 'tổng 17.715.000 = 3 × 5.905.000');
    await h.tap('.svc'); await h.waitStep('pm');
    var r3=(await h.rows(h.cur+'.sv-r[data-i="1"]'))[0]; check(r3==='Chia 3 kỳ 3 × 5.905.000₫', 'hàng chia 3 kỳ (không dòng phụ): '+r3);
    await h.tap('.sv-r[data-i="1"]'); await h.wait(500); var d=await h.ev(function(){ return SVX._dots(); }); check(d.m===2 && d.p===13 && d.d===33, 'hai mốc KỲ 2 · KỲ 3 trên biểu đồ 48 chấm: '+JSON.stringify(d));
    var L=await h.ev(function(){ return SVX._labs().map(function(l){ return l.t; }).sort().join(); }); check(L==='KỲ 2,KỲ 3', 'nhãn hai mốc: '+L);
    await h.waitStep('pf'); await h.tap('.sv-r[data-i="0"]'); await page.keyboard.type('Trần Thị Bích Ngọc'); await page.keyboard.press('Enter'); await h.waitStep('qr'); await h.wait(1300);
    check((await h.txt(h.cur+'.sv-amt'))==='5.905.000₫', 'kỳ 1 = 5.905.000 (bằng các kỳ sau): '+(await h.txt(h.cur+'.sv-amt'))); check((await h.txt(h.cur+'.sv-mm'))==='T T B NGOC 48B TRA GOP', 'nội dung: '+(await h.txt(h.cur+'.sv-mm')));
    await h.tap('.svc'); await h.wait(900);   /* Xong: thẻ thu 0,42 s rồi về trang chủ */
  });
  await run('K', '1:2 = 1:1 với bảng giá 1:2 · gói 72 vòng tặng thứ hai · một khách, một số 0, một mã', async function(){
    await h.toPkg('1:2',[1,1],[0,4]); await h.wait(300);
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on:not(.leave-fwd) .sv-r').length; })===5, '3 buổi × 1–6 tháng → 5 gói');
    check(await h.ev(function(){ return document.querySelector('.page.sv.on:not(.leave-fwd) .sv-rows').classList.contains('S'); }), '≥ 3 gói → hàng Nhỏ');
    check(await h.ev(function(){ return !!document.querySelector('#sv-ctr .ly:not(.out) .n44'); }), 'số 0 nhỏ → tâm dùng cỡ gọn (không đè hạt)');
    await h.tap('.sv-r[data-i="4"]'); await h.waitStep('deal');
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-g').length; })===7, 'gói 72: 7 vòng');
    await h.tap('.sv-g[data-k="3"]'); await h.wait(450);
    check((await h.ctr())==='ĐƠN GIÁ SAU ƯU ĐÃI 240.000₫ Σ 18.000.000 ₫ / 75 BUỔI', 'giá 1:2: '+(await h.ctr()));
    var d=await h.ev(function(){ return SVX._dots(); }); check(d.a===3 && d.o===4, 'một số 0: 3 hạt tặng ở vòng hai + 4 rỗng: '+JSON.stringify(d));
    await h.tap('.svc'); await h.waitStep('bill'); await h.wait(700);
    check((await h.txt(h.cur+'.sv-bill .pk'))==='GÓI 72 BUỔI · 1:2', 'phiếu ghi gói 1:2'); check((await h.txt(h.cur+'.sv-bill .tl'))==='TỔNG GIÁ TRỊ GÓI', 'không "MỖI NGƯỜI" — một khách');
    await h.tap('.svc'); check(await h.waitStep('pf'), 'gói 72 không trả góp'); await h.wait(700);
    var bw=await h.ev(rwQ), rk=runway(bw, 75), x0=1e9, x1=-1e9; bw.P.forEach(function(q){ x0=Math.min(x0,q[0]-q[2]/2); x1=Math.max(x1,q[0]+q[2]/2); });
    var hw=bw.R.ln*bw.G.Wn*bw.R.z0/(bw.R.z0-.3);
    check(rk.ok && bw.G.K===25 && x0>=24 && x1<=bw.W-24 && bw.cx-hw>=24 && bw.cx+hw<=bw.W-24, 'gói 72 + 3 tặng: 75 chấm, 25 hàng, đường băng trong lề 24: '+JSON.stringify([rk, x0, x1, hw]));
    await h.tap('.sv-r[data-i="0"]');
    check((await h.txt(h.cur+'.t1'))==='Họ tên khách?', 'một khách');
    await page.keyboard.type('Lê Văn An'); await page.keyboard.press('Enter'); await h.waitStep('qr'); await h.wait(1300);
    check((await h.txt(h.cur+'.svc'))==='Xong', 'một mã → Xong'); check((await h.txt(h.cur+'.sv-mm'))==='LE VAN AN 72B', 'nội dung');
    check((await h.txt(h.cur+'.sv-amt'))==='18.000.000₫', 'số tiền 18.000.000');
    await h.tap('.svb'); await h.waitStep('name'); await h.wait(250);
    check((await h.ev(function(){ return document.getElementById('sv-in').value; }))==='Lê Văn An', 'lùi về họ tên giữ tên');
    await h.tap('.svh'); await h.wait(400);
  });
  await run('L', 'Tên rỗng không sang mã · ← ở câu 02 giữ khoảng', async function(){
    await h.toPkg('1:1',[1,1],[2,2],36); await h.waitStep('deal'); await h.tap('.svc'); await h.waitStep('bill'); await h.wait(250); await h.tap('.svc'); await h.waitStep('pm'); await h.tap('.sv-r[data-i="0"]'); await h.waitStep('pf');
    check((await h.ctr())==='THANH TOÁN 14,4TR', 'trả một lần: '+(await h.ctr()));
    await h.tap('.sv-r[data-i="0"]'); await h.wait(300); check((await h.txt('#sv-memo'))==='36B', 'một lần → không TRA GOP');
    /* bàn phím hệ thống 336 pt: hàng điều hướng đi lên, cách mép bàn phím 12 pt (Figma 811:499) — giả lập visualViewport */
    var kb=await h.ev(function(){ var real=Object.getOwnPropertyDescriptor(Window.prototype,'visualViewport')||null;
      Object.defineProperty(window,'visualViewport',{configurable:true, value:{height:innerHeight-336, offsetTop:0, addEventListener:function(){}}});
      SVX._kb(); var nav=document.querySelector('.page.sv.on:not(.leave-fwd):not(.leave-back) .sv-nav'), r=nav.getBoundingClientRect(), t=nav.style.transform;
      Object.defineProperty(window,'visualViewport',{configurable:true, value:{height:innerHeight, offsetTop:0, addEventListener:function(){}}}); SVX._kb();
      var t2=nav.style.transform; delete window.visualViewport; return {bottom:r.bottom, kbTop:innerHeight-336, t:t, t2:t2}; });
    var ty=+((/translateY\((-?[\d.]+)px\)/.exec(kb.t)||[])[1]||0); check(Math.abs(kb.kbTop-(kb.bottom+ty)-12)<1.5, 'nav trên bàn phím 12 pt: '+JSON.stringify(kb));   /* đo lúc transition mới bắt đầu → cộng đích translateY */ check(kb.t2==='', 'bàn phím đóng → nav về đáy');
    await page.keyboard.press('Enter'); await h.wait(300); check((await h.step())==='name', 'tên rỗng → ở lại');
    check(await h.ev(function(){ return document.querySelector('.page.sv.on .sv-ul').classList.contains('err'); }), 'gạch dưới báo lỗi');
    await h.ev(function(){ document.getElementById('sv-in').blur(); }); await h.wait(150);
    check(await h.ev(function(){ return document.querySelector('.page.sv.on .sv-tiep').classList.contains('off'); }), 'Tiếp xám khi chưa có tên');
    await h.tap('.svh'); await h.wait(400);
    await page.click('#h-sell'); await h.waitStep('q1'); await h.tap('.sv-n[data-i="0"]'); await h.waitStep('q2'); await h.drag('.sv-n[data-i="0"]', '.sv-n[data-i="3"]'); await h.waitStep('q3');
    await h.tap('.svb'); await h.waitStep('q2'); await h.wait(200);
    var dim=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on:not(.leave-back) .sv-n'), function(b){ return b.classList.contains('dim')?1:0; }).join(''); }); check(dim==='0000', 'giữ khoảng 2–5: '+dim);
    check((await h.ctr())==='MỖI THÁNG 8–20 BUỔI', 'tâm 8–20: '+(await h.ctr()));
    await h.tap('.svh'); await h.wait(400);
  });
  /* ================= 1b · CHUYỂN ĐỘNG v2.12.0 (cân bằng theo main flow buổi tập) ================= */
  function nowPg(){ return '.page.sv.on:not(.leave-fwd):not(.leave-back)'; }
  await run('T1', 'UI đổi như dòng chữ của loop: tiêu đề + khối trả lời 240 ms, trượt 7 pt (cũ tắt ở 45 %, mới hiện từ 30 %) · không biên đạo từng phần tử · lùi ngược chiều', async function(){
    await page.click('#h-sell'); await h.waitStep('q1'); await h.wait(700);
    var p1=await h.ev(function(){ return document.querySelector('.page.sv.on').id; });
    await h.tap('.sv-n[data-i="0"]'); await h.waitStep('q2');
    var r=await h.ev(function(p1){ var o=document.getElementById(p1), n=document.querySelector('.page.sv.on:not(#'+p1+')');
      var nm=function(e){ return e.getAnimations().map(function(a){ var t=a.effect.getTiming(); return a.animationName+':'+t.duration+':'+t.delay; }); };
      var kf=function(e,i){ var a=e.getAnimations()[i]; return a ? a.effect.getKeyframes() : []; };
      var sub=n.getAnimations({subtree:true}).map(function(a){ return a.animationName||'waapi'; }).filter(function(x){ return ['svLiO','svLiT','rise','svPop'].indexOf(x)<0; });
      var hd=n.querySelector(':scope>.head');
      return {nh:nm(hd), nb:nm(n.querySelector(':scope>.body')), oh:nm(o.querySelector(':scope>.head')), sub:sub, t0:(kf(hd,1)[0]||{}).transform, o3:kf(hd,0).map(function(k){ return k.offset+':'+k.opacity; }).join(' '),
              oo:kf(o.querySelector(':scope>.head'),0).map(function(k){ return k.offset+':'+k.opacity; }).join(' '), clip:getComputedStyle(hd).overflow}; }, p1);
    check(r.nh.join()==='svLiO:240:0,svLiT:240:0' && r.nb.join()==='svLiO:240:0,svLiT:240:0', 'bước mới: tiêu đề + khối trả lời 240 ms: '+JSON.stringify(r));
    check(r.t0==='translateY(7px)' && /^0:0 0\.3:0 1:1$/.test(r.o3), 'trượt 7 pt, hiện từ 30 %: '+r.t0+' · '+r.o3);
    check(r.oh.join()==='svLoO:240:0,svLoT:240:0' && /0\.45:0/.test(r.oo), 'bước cũ tắt ở 45 %: '+r.oh+' · '+r.oo);
    check(!r.sub.length, 'không biên đạo riêng từng phần tử: '+r.sub); check(r.clip!=='hidden', 'không khung che tiêu đề');
    await h.wait(500); await h.tap('.svb'); await h.waitStep('q1');
    var b=await h.ev(function(s){ return document.querySelector(s+'>.head').getAnimations().map(function(a){ return a.animationName; }); }, nowPg());
    check(b.join()==='svLiO,svLiTB', 'lùi: từ trên xuống (svLiTB): '+b);
  });
  await run('T2', 'mục B: viên Acid nảy từ .9 (vượt 14 % rồi về, .32 s) · chờ sang câu sau 200 ms', async function(){
    await h.wait(600); var c=await page.locator(h.cur+'.sv-n[data-i="0"]').boundingBox();
    await page.mouse.move(c.x+c.width/2, c.y+c.height/2); await page.mouse.down();
    var k=await h.ev(function(s){ var cap=document.querySelector(s+' .sv-cap'), a=cap.getAnimations().filter(function(x){ return x.animationName==='svPop'; })[0], kf=a ? a.effect.getKeyframes() : [];
      return {pop:cap.classList.contains('pop'), t0:kf.length ? kf[0].transform : null, o0:kf.length ? kf[0].opacity : null, peak:kf.length>1 ? kf[1].transform : null, dur:a ? a.effect.getTiming().duration : 0}; }, nowPg());
    check(k.pop && /scale\(0\.9\)/.test(k.t0||'') && k.o0==='0' && k.dur===320, 'viên nảy từ .9 + mờ (không từ 0), .32 s: '+JSON.stringify(k)); check(/scale\(1\.14\)/.test(k.peak||''), 'vượt rồi về: '+k.peak);
    var t0=Date.now(); await page.mouse.up(); while(Date.now()-t0<1500){ if((await h.step())==='q2') break; await h.wait(8); } var dt=Date.now()-t0;
    check(dt>=160 && dt<=340, 'chờ ~200 ms rồi sang câu 02: '+dt+' ms');
  });
  await run('T3', 'Gói tập → Ưu đãi: "36 buổi" của hàng vừa chọn bay lên tiêu đề (Paper → Acid) · tặng buổi = sao chổi Acid vào số 0 · chữ số lăn đúng số nấc, đúng chiều, không quay thêm vòng', async function(){
    await h.wait(400); await h.drag('.sv-n[data-i="1"]', '.sv-n[data-i="2"]'); await h.waitStep('q3'); await h.wait(400);
    await h.tap('.sv-n[data-i="2"]'); await h.waitStep('pk'); await h.wait(500);
    await h.tap('.sv-r[data-i="0"]');
    var sd=await h.ev(function(){ var d=document.querySelector('.page.sv.on .sv-r.on .sd'), a=d && d.getAnimations().filter(function(x){ return x.animationName==='svPop'; })[0]; return a ? a.effect.getKeyframes()[0].transform : null; });
    check(/scale\(0\.9\)/.test(sd||''), 'chấm hàng nảy từ .9: '+sd);
    await h.waitStep('deal'); await h.wait(20);
    var f=await h.ev(function(s){ var ac=document.querySelector(s+' .head .ac'), fl=document.querySelectorAll('.svfly'), a=fl[0] && fl[0].getAnimations()[0], kf=a ? a.effect.getKeyframes() : [];
      return {vis:getComputedStyle(ac).visibility, fly:fl.length, t:fl[0] ? fl[0].textContent : '', dur:a ? a.effect.getTiming().duration : 0, ctr:SVX._ctr(), src:getComputedStyle(document.querySelector('.page.sv.leave-fwd .sv-r.on .t')).visibility}; }, nowPg());
    check(f.fly===1 && f.t==='36 buổi' && f.vis==='hidden' && f.src==='hidden' && f.dur===440, '"36 buổi" đang bay từ hàng lên tiêu đề (chữ thật ẩn tới lúc hạ cánh): '+JSON.stringify(f));
    check(f.ctr.indexOf('400.000')>=0, 'tâm sang thẳng đơn giá (không chớp "36")');
    await h.wait(560);
    var f2=await h.ev(function(s){ var ac=document.querySelector(s+' .head .ac'), r=ac.getBoundingClientRect(); return {ac:getComputedStyle(ac).color, vis:getComputedStyle(ac).visibility, fly:document.querySelectorAll('.svfly').length}; }, nowPg());
    check(/212, 255, 0/.test(f2.ac) && f2.vis==='visible' && f2.fly===0, 'đã hạ cánh: chữ thật Acid hiện, dọn bản bay: '+JSON.stringify(f2));
    await h.tap('.sv-g[data-k="2"]'); await h.wait(40);
    /* v2.15 bánh xe chữ số (tickTo): mỗi chữ số một vị trí liên tục chạy về đích bằng lò xo tới hạn — giảm thì trượt xuống, tăng thì trồi lên */
    var r=await h.ev(function(s){ var u=document.querySelector('#sv-ctr .ly:not(.out) [data-k=unit]'), T=SVX._tk(), tu=T.filter(function(x){ return x.k==='unit'; })[0], tb=T.filter(function(x){ return x.k==='b'; })[0];
      return {fx:SVX._idle().fx, tk:u.classList.contains('ntk'), cells:u.querySelectorAll('.nc').length, u:tu, b:tb, busy:SVX.busy()}; }, nowPg());
    check(r.fx>=4, 'tặng 2: hai sao chổi + hai gợn trên số 0 (fx '+r.fx+')');
    check(r.tk && r.cells===7 && r.u && r.u.text==='378.947' && r.u.w.length===6 && r.busy, 'đơn giá lăn tại chỗ, chỉ chữ số đổi (6/7 ô): '+JSON.stringify(r.u)+' · '+r.cells);
    check(r.u && r.u.w.every(function(w){ return w.t<=w.p0 && w.p0-w.t<=9 && w.p<=w.p0+1e-6 && w.p>=w.t-1e-6; }), 'đơn giá giảm → mọi chữ số trượt xuống, ≤ 9 nấc, không vượt đích: '+JSON.stringify(r.u && r.u.w));
    check(r.b && r.b.w.length===1 && r.b.w[0].p0===0 && r.b.w[0].t===2, 'số buổi tặng 0 → 2 trồi lên đúng 2 nấc: '+JSON.stringify(r.b));
    await h.wait(700);
    var r2=await h.ev(function(s){ var u=document.querySelector('#sv-ctr .ly:not(.out) [data-k=unit]'); return {tk:u.classList.contains('ntk'), t:u.textContent, n:document.querySelectorAll('#sv-ctr .ly').length, g:getComputedStyle(document.querySelector(s+' .sv-g[data-k="2"]')).backgroundColor, b:document.querySelector(s+' [data-k=b]').textContent, left:SVX._tk().length}; }, nowPg());
    check(!r2.tk && r2.t==='378.947' && r2.n===1 && /212, 255, 0/.test(r2.g) && r2.b==='2' && r2.left===0, 'lăn xong đúng số (trả về chữ thường), vòng tặng Acid: '+JSON.stringify(r2));
    /* kéo thanh giảm: số % lăn theo từng nấc ngay trong lúc kéo (chủ studio 13/10: số % đổi phải có chuyển động); đích mới đến giữa chừng → chạy tiếp, không bắt đầu lại */
    var sb=await page.locator(h.cur+'.sv-sl').boundingBox(); await page.mouse.move(sb.x+12, sb.y+sb.height/2); await page.mouse.down();
    await page.mouse.move(sb.x+12+(sb.width-24)*.5, sb.y+sb.height/2, {steps:3});
    var dr=await h.ev(function(s){ var d=document.querySelector(s+' [data-k=d]'); return {tk:d.classList.contains('ntk'), t:d.dataset.t, n:SVX._tk().filter(function(x){ return x.k==='d'; }).length}; }, nowPg());
    await page.mouse.up(); await h.wait(600);
    var dr2=await h.ev(function(s){ var d=document.querySelector(s+' [data-k=d]'); return {tk:d.classList.contains('ntk'), t:d.textContent, st:SVX._st().pc}; }, nowPg());
    check(dr.tk && dr.n===1, 'đang kéo: số % đang lăn (một bánh xe, không chồng): '+JSON.stringify(dr));
    check(!dr2.tk && dr2.t===(dr2.st/100).toFixed(2).replace('.',','), 'nhả tay: số % dừng đúng nấc: '+JSON.stringify(dr2));
    await page.mouse.move(sb.x+12+(sb.width-24)*.5, sb.y+sb.height/2); await page.mouse.down(); await page.mouse.move(sb.x+2, sb.y+sb.height/2, {steps:3}); await page.mouse.up(); await h.wait(500);
  });
  await run('T4', 'Ưu đãi → phiếu (v2.14 — không còn vành ⇄ đường kẻ): số 0 hít vào rồi tan · tờ phiếu trắng trồi khỏi khe (vật đặc, không mờ) · ĐƠN GIÁ ở tâm bay xuống đúng ô của nó (Paper → Ink khi mép giấy đi qua) · chữ trên phiếu hiện lan ra từ dòng đó · Chốt ưu đãi → Khách đồng ý tại chỗ · Khách đồng ý: tờ phiếu chìm lại vào khe, các dòng màn sau hiện khi giấy đã qua', async function(){
    await h.tap('.svc'); await h.wait(50);
    var f=await h.ev(function(s){ var pg=document.querySelector(s), ps=[].slice.call(document.querySelectorAll('.page.sv.on')), fl=document.querySelectorAll('.svfly'), an=fl[0] ? fl[0].getAnimations() : [];
      var dst=[].filter.call(pg.querySelectorAll('.sv-bill .r .v b'), function(b){ return b.textContent==='378.947'; })[0];
      var col=an.map(function(a){ var k=a.effect.getKeyframes(); return k[0].color ? k[0].color+'>'+k[k.length-1].color : ''; }).filter(Boolean)[0]||'';
      var tr=an.map(function(a){ return a.effect.getKeyframes(); }).filter(function(k){ return k[0].transform; })[0]||[], last=tr.length ? tr[tr.length-1].transform : '', m=/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(last||''), el=fl[0];
      return {flip:ps.some(function(p){ return p.classList.contains('flipin')||p.classList.contains('flipout'); }), head:pg.querySelector(':scope>.head').getAnimations().map(function(a){ return a.animationName; }),
              body:pg.querySelector(':scope>.body').getAnimations().length, rise:pg.classList.contains('svrise'), fly:fl.length, t:fl[0] ? fl[0].textContent : '', col:col,
              dst:dst ? getComputedStyle(dst).visibility : 'none', fold:SVX._fold(), line:document.querySelectorAll('.svln').length,
              end:m && el ? {x:parseFloat(el.style.left)+ +m[1], yc:parseFloat(el.style.top)+ +m[2]+parseFloat(el.style.height)*m[3]/2} : null}; }, nowPg());
    check(!f.flip && f.head.join()==='svLiO,svLiT', 'không lật, tiêu đề cùng nhịp mọi bước: '+JSON.stringify(f.head));
    check(f.rise && f.body===0, 'tờ phiếu là vật đặc: thân trang không mờ theo nhịp dòng chữ (không giấy xám): '+JSON.stringify([f.rise, f.body]));
    check(f.fly===1 && f.t==='378.947' && f.dst==='hidden', 'ĐƠN GIÁ ở tâm đang bay xuống ô của nó (số thật trên phiếu ẩn tới lúc hạ): '+JSON.stringify([f.fly, f.t, f.dst]));
    check(/250, 250, 250.*>.*10, 10, 10/.test(f.col), 'chữ Paper → Ink khi xuống giấy: '+f.col);
    check(f.fold>20 && f.line===0, 'số 0 hít vào rồi tan, không thành đường kẻ: '+f.fold+' hạt');
    var p=await h.ev(function(s){ var pg=document.querySelector(s), a=pg.querySelector('.sv-bill').getAnimations()[0], sl=pg.querySelector('.sv-slot').getAnimations().length;
      var dl=function(e){ var a=e && e.getAnimations()[0]; return a ? Math.round(a.effect.getTiming().delay) : -1; }, rows=pg.querySelectorAll('.sv-bill .rs .r');
      var ai=[].findIndex.call(rows, function(r){ return r.querySelector('.v b').textContent==='378.947'; });
      return a ? {k:a.effect.getKeyframes().length, d:a.effect.getTiming().duration, dl:a.effect.getTiming().delay, sl:sl, anchor:dl(rows[ai]), above:dl(rows[ai-1]), wm:dl(pg.querySelector('.sv-bill .wm')), tt:dl(pg.querySelector('.sv-bill .tt'))} : null; }, nowPg());
    check(p && p.k===2 && p.d===520 && p.dl===110 && p.sl===1, 'tờ phiếu trồi một lần 0,52 s đường B0DY khi chữ màn cũ đã tắt (trễ 0,11 s), mặt máy hiện ngay trước: '+JSON.stringify(p));
    check(p && p.anchor>=480 && p.anchor<=520 && p.above===p.anchor+20 && p.tt>p.anchor && p.wm>p.tt, 'chữ trên phiếu hiện lan ra từ dòng con số (dòng đó trước, đầu phiếu sau cùng): '+JSON.stringify(p));
    check(await h.waitStep('bill'), 'sang phiếu');
    var c=await h.ev(function(s){ var c=document.querySelector(s+' .svc'), o=document.querySelector('.page.sv.leave-fwd .svc'); return {cls:c.className, vis:getComputedStyle(c).visibility, t:c.textContent, old:o ? o.className : null, ov:o ? getComputedStyle(o).visibility : null}; }, nowPg());
    check(/\bstill\b/.test(c.cls) && !/\bswap\b/.test(c.cls) && c.vis==='visible' && c.t==='Khách đồng ý' && /\bgone\b/.test(c.old||'') && c.ov==='hidden', 'nút chính giữ chỗ (không mờ ra rồi trồi lên), chữ đã đổi: '+JSON.stringify(c));
    await h.wait(850);   /* hạ 0,6 s · chữ trên phiếu hiện đủ ≈ 0,85 s */
    var l=await h.ev(function(s){ var pg=document.querySelector(s), dst=[].filter.call(pg.querySelectorAll('.sv-bill .r .v b'), function(b){ return b.textContent==='378.947'; })[0], r=dst.getBoundingClientRect(),
        op=[].map.call(pg.querySelectorAll('.sv-bill .wm,.sv-bill .dt,.sv-bill .pk,.sv-bill .r,.sv-bill .tl,.sv-bill .tt'), function(e){ return +getComputedStyle(e).opacity; });
      return {fly:document.querySelectorAll('.svfly').length, dst:getComputedStyle(dst).visibility, op:Math.min.apply(null, op), pts:SVX._pts().length, x:r.left, yc:r.top+r.height/2}; }, nowPg());
    check(l.fly===0 && l.dst==='visible' && l.op===1 && l.pts===0, 'đã hạ: số thật trên phiếu hiện, dọn bản bay, chữ trên phiếu hiện đủ, số 0 đã tan: '+JSON.stringify(l));
    check(f.end && Math.abs(f.end.x-l.x)<1.5 && Math.abs(f.end.yc-l.yc)<1.5, 'hạ đúng ô đơn giá trên phiếu: '+JSON.stringify([f.end, l.x, l.yc]));
    var t0=Date.now(); await h.tap('.svc');
    var k=await h.ev(function(){ var o=document.querySelector('.page.sv.leave-fwd'), n=document.querySelector('.page.sv.on:not(.leave-fwd):not(.leave-back)'), a=o && o.querySelector('.sv-bill').getAnimations().slice(-1)[0], kf=a ? a.effect.getKeyframes() : [], nb=n && n.querySelector(':scope>.body').getAnimations()[0];
      return {sink:!!o && o.classList.contains('svsink'), z:o ? getComputedStyle(o).zIndex : '', to:kf.length ? kf[kf.length-1].transform : '', d:a ? a.effect.getTiming().duration : 0, ob:o ? o.querySelector(':scope>.body').getAnimations().length : -1, after:!!n && n.classList.contains('svafter'), nd:nb ? Math.round(nb.effect.getTiming().delay) : -1}; });
    check(k.sink && k.z==='3' && /100%/.test(k.to) && k.d===220 && k.ob===0, 'Khách đồng ý: tờ phiếu chìm lại vào khe 0,22 s, nằm trên màn sau (không mờ thành giấy xám): '+JSON.stringify(k));
    check(k.after && k.nd===160, 'các dòng màn sau hiện khi giấy đã qua (trễ 160 ms): '+JSON.stringify(k));
    check(await h.waitStep('pm', 600), 'Khách đồng ý → sang ngay ('+(Date.now()-t0)+' ms)');
    check(await h.ev(function(){ return document.querySelectorAll('.svfly,.svln,.svdotf,.svzf,.svedge').length===0; }), 'không lớp bay');
    /* v2.16: đường băng hiện từ hàng gần ra xa cùng hai mép (sau khi giấy đã chìm, trễ 0,16 s) — đang hiện thì nửa gần nhiều chấm hơn nửa xa */
    var sw=null, t1=Date.now(); while(Date.now()-t1<600){ var q=await h.ev(function(){ var G=SVX._geo(), P=SVX._pts(), R=SVX._rail(); if(!G.run || P.length<4) return null;
        var yM=G.run.yV+G.run.D*R.z0/(R.z0+(G.run.K-1)/2), N=0, F=0; P.forEach(function(p){ if(p[1]>yM) N++; else F++; }); return {N:N, F:F, n:P.length, ra:R.r ? R.r.a : 0}; });
      if(q && q.n<38){ sw=q; break; } await h.wait(15); }
    check(sw && sw.N>sw.F && sw.ra<1, 'đang hiện: nửa gần nhiều chấm hơn nửa xa, hai mép đang hiện (gần → xa): '+JSON.stringify(sw));
    await h.wait(900);
    var b1=await h.ev(rwQ), rb=runway(b1, 38), id=await h.ev(function(){ return SVX._idle().amp; });
    check(rb.ok && id===0, 'đã dựng xong: 38 chấm đúng chỗ trên đường băng, đứng yên: '+JSON.stringify([rb, id]));
  });
  await run('T5', 'Hình thức trả → Họ tên (v2.14): chấm Acid của "Chuyển khoản" bay lên đầu trái ô họ tên rồi kéo dài thành gạch dưới · số 0 hít vào rồi tan · Tiếp dựng sẵn xám · Tiếp luôn hiện, kể cả khi bàn phím mở · Tiếp → Xong tại chỗ, hàng điều hướng trượt theo bàn phím · thẻ VietQR mở như reel v10', async function(){
    await h.tap('.sv-r[data-i="1"]'); await h.waitStep('pf'); await h.wait(250); await h.tap('.sv-r[data-i="0"]'); await h.wait(30);
    var u=await h.ev(function(s){ var pg=document.querySelector(s), ul=pg.querySelector('.sv-ul'), ln=document.querySelectorAll('.svln'), sd=document.querySelector('.page.sv.leave-fwd .sv-r.on .sd'), c=pg.querySelector('.sv-tiep');
      var an=ln[0] ? ln[0].getAnimations().map(function(a){ var t=a.effect.getTiming(), k=a.effect.getKeyframes(); return (k[0].clipPath ? 'clip' : k[0].transform ? 'move' : 'fade')+':'+t.duration+':'+t.delay; }) : [];
      var r=ul.getBoundingClientRect(), lr=ln[0] ? ln[0].getBoundingClientRect() : null;
      return {ln:ln.length, an:an.join(' '), ul:getComputedStyle(ul).visibility, sd:sd ? getComputedStyle(sd).visibility : 'none', fold:SVX._fold(), off:c.classList.contains('off'), bg:getComputedStyle(c).backgroundColor,
              box:lr ? [Math.round(parseFloat(ln[0].style.left)-r.left), Math.round(parseFloat(ln[0].style.width)-r.width)] : null}; }, nowPg());
    check(u.ln===1 && u.an==='fade:60:0 move:340:0 clip:300:290' && u.ul==='hidden' && u.sd==='hidden', 'chấm Acid của lựa chọn bay lên rồi kéo thành gạch dưới (gạch thật ẩn tới lúc kéo xong): '+JSON.stringify(u));
    check(u.box && u.box[0]===0 && u.box[1]===0, 'gạch kéo đúng bề ngang ô họ tên: '+JSON.stringify(u.box));
    check(u.fold>20, 'biểu đồ buổi hít vào về tâm của nó rồi tan (không thành đường kẻ): '+u.fold);
    check(u.off && !/212, 255, 0/.test(u.bg), 'Tiếp dựng sẵn xám — không loé Acid rồi mới xám: '+JSON.stringify([u.off, u.bg]));
    await h.wait(650); var u2=await h.ev(function(s){ return {ln:document.querySelectorAll('.svln').length, ul:getComputedStyle(document.querySelector(s+' .sv-ul')).visibility}; }, nowPg());
    check(u2.ln===0 && u2.ul==='visible', 'gạch dưới thật hiện, dọn chấm bay: '+JSON.stringify(u2));
    await h.waitStep('name'); await h.wait(300);
    var a=await h.ev(function(s){ var c=document.querySelector(s+' .sv-tiep'), cs=getComputedStyle(c); return {foc:!!document.activeElement && document.activeElement.id==='sv-in', vis:cs.visibility, op:cs.opacity, away:c.classList.contains('away'), off:c.classList.contains('off'), w:Math.round(c.getBoundingClientRect().width), line:SVX._pts().length}; }, nowPg());
    check(a.foc && a.vis==='visible' && +a.op>.95 && !a.away && a.off && a.w===225, 'ô nhập đang focus mà Tiếp vẫn hiện, xám khi chưa có tên: '+JSON.stringify(a));
    check(a.line===0, 'biểu đồ đã tan');
    /* bàn phím 336 pt (giả lập visualViewport): hàng điều hướng lên trên bàn phím — giữ nguyên lúc chạm Tiếp */
    var kb=await h.ev(function(s){ Object.defineProperty(window,'visualViewport',{configurable:true, value:{height:innerHeight-336, offsetTop:0, addEventListener:function(){}}}); SVX._kb();
      var nav=document.querySelector(s+' .sv-nav'), t=nav.style.transform, c=nav.querySelector('.sv-tiep'), cs=getComputedStyle(c), n=[].filter.call(nav.querySelectorAll('button'), function(b){ return getComputedStyle(b).visibility!=='hidden' && getComputedStyle(b).opacity!=='0'; }).length;
      return {t:t, op:cs.opacity, n:n}; }, nowPg());
    check(/translateY\(-/.test(kb.t) && +kb.op>.95 && kb.n===3, 'bàn phím mở: ← · Tiếp · ⌂ cùng lên trên bàn phím: '+JSON.stringify(kb));
    await page.keyboard.type('Nguyễn Quang Vinh');
    check(!(await h.ev(function(s){ return document.querySelector(s+' .sv-tiep').classList.contains('off'); }, nowPg())), 'có tên → Tiếp sáng');
    await h.wait(300);   /* hàng đã lên hẳn trên bàn phím */
    await h.tap('.sv-tiep');
    var b=await h.ev(function(s){ var pg=document.querySelector(s), nav=pg.querySelector('.sv-nav'), c=nav.querySelector('.svc'), old=document.querySelector('.page.sv.leave-fwd .sv-nav');
      return {step:SVX._step(), ph:document.querySelectorAll('.svh.phantom,.page.sv.rv').length, home:!!nav.querySelector('.svh'), cls:c.className, vis:getComputedStyle(c).visibility, t:c.textContent, nt:getComputedStyle(nav).transform, ot:old ? getComputedStyle(old).transform : null,
              fly:document.querySelectorAll('.svfly').length, card:pg.querySelector('.sv-card').getAnimations().length, qra:SVX._idle().qra}; }, nowPg());
    check(b.step==='qr' && !b.ph && !b.home && /\bstill\b/.test(b.cls) && b.vis==='visible' && b.t==='Tiếp', 'nút chính giữ chỗ, chữ cũ đang tắt (không ⌂ nở thành Xong): '+JSON.stringify(b));
    check(b.nt!=='none' && /matrix/.test(b.nt) && b.ot!=='none', 'hàng điều hướng bắt đầu từ trên bàn phím, cả hai hàng cùng trượt về đáy: '+JSON.stringify([b.nt, b.ot]));
    check(b.fly===1 && b.card>=2 && b.qra, 'nội dung đang rơi, thẻ mở từ viên Acid, mã lan: '+JSON.stringify(b));
    await h.ev(function(){ delete window.visualViewport; }); check((await h.step())==='qr', 'chạm Tiếp → mã QR'); await h.wait(200);
    var b2=await h.ev(function(s){ var c=document.querySelector(s+' .svc'); return {t:c.textContent, paper:c.classList.contains('paper')}; }, nowPg());
    check(b2.t==='Xong' && b2.paper, 'Tiếp → Xong đúng lúc chữ cũ vừa tắt, nền đổi sang Paper: '+JSON.stringify(b2));
    await h.wait(350); check(await h.ev(function(s){ return getComputedStyle(document.querySelector(s+' .sv-nav')).transform; }, nowPg())==='none', 'hàng điều hướng đã về đáy');
    await h.wait(1400);
    var c=await h.ev(function(s){ var pg=document.querySelector(s), x=pg.querySelector('.svc'); return {cta:getComputedStyle(x).visibility, bg:getComputedStyle(x).backgroundColor, bank:document.getElementById('sv-bank').textContent, v:+pg.querySelector('#sv-qrc').dataset.v, fly:document.querySelectorAll('.svfly').length}; }, nowPg());
    check(c.cta==='visible' && /250, 250, 250/.test(c.bg) && c.fly===0, 'Xong nền Paper, dọn lớp bay: '+JSON.stringify(c));
    check(c.bank==='TECHCOMBANK · BẢN DEMO · KHÔNG CHUYỂN KHOẢN' && c.v>=9, 'mã đã vẽ, dòng ngân hàng gõ xong: '+c.bank);
  });
  await run('T6', 'Xong: mã thu lại, thẻ co vào ô Ink 0,42 s (chỉ còn chữ 0) → trang chủ dùng được ngay, chữ 0 bay về đúng chữ 0 của nút Sell', async function(){
    var wz=await h.ev(function(s){ var z=document.querySelector(s+' .sv-badge .wmq .z').getBoundingClientRect(); return [z.left, z.top, z.width, z.height]; }, nowPg());
    await h.tap('.svc'); await h.wait(100);
    var a=await h.ev(function(){ return SVX._idle(); }); check(a.qra && a.lock===2, 'chấm mã đang thu, chặn chạm đúp: '+JSON.stringify(a));
    var la=await h.ev(function(s){ var w=document.querySelector(s+' .sv-badge .wmq'); return ['b','z','d','y'].map(function(c){ var an=w.querySelector('.'+c).getAnimations().slice(-1)[0], k=an ? an.effect.getKeyframes() : [];
      return c+':'+(an ? an.effect.getTiming().duration+'/'+an.effect.getTiming().delay+'/'+k[k.length-1].opacity : '-'); }).join(' '); }, nowPg());
    check(la==='b:200/220/0 z:- d:200/220/0 y:200/220/0', 'thẻ khép vào ô logo: B · D · Y thu vào chữ 0 rồi tắt, chữ 0 đứng yên: '+la);
    await h.wait(400);
    var e=await h.ev(function(){ var z=document.querySelector('.svzf'), sv=document.querySelector('#h-sell svg'); if(!z) return {s:state.screen, z:0};
      var an=z.getAnimations()[0], kf=an ? an.effect.getKeyframes() : [], last=kf.length ? kf[kf.length-1].transform : '', m=/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(last||'');
      var L=parseFloat(z.style.left), T=parseFloat(z.style.top), W=parseFloat(z.style.width), H=parseFloat(z.style.height);
      return {s:state.screen, z:document.querySelectorAll('.svzf').length, use:z.querySelector('use').getAttribute('href'), chip:getComputedStyle(sv).visibility, end:m ? [L+ +m[1], T+ +m[2], W*m[3], H*m[3]] : null}; });
    check(e.s==='p-home' && e.z===1 && e.use==='#i-zero' && e.chip==='hidden', 'đã về trang chủ, chữ 0 đang bay (chữ 0 của nút ẩn tới lúc hạ cánh): '+JSON.stringify(e));
    var z0=await h.ev(function(){ var z=document.querySelector('.svzf'); return z ? [parseFloat(z.style.left), parseFloat(z.style.top), parseFloat(z.style.width), parseFloat(z.style.height)] : null; });
    check(z0 && z0.every(function(v,i){ return Math.abs(v-wz[i])<1; }), 'chữ 0 bay đi từ đúng chữ 0 của logo giữa mã: '+JSON.stringify([z0, wz]));
    await h.wait(700);
    var f=await h.ev(function(){ var sv=document.querySelector('#h-sell svg'), r=sv.getBoundingClientRect(); return {z:document.querySelectorAll('.svzf,.svdotf').length, fly:document.querySelectorAll('.svfly').length, dial:document.getElementById('sv-dial').hidden, chip:getComputedStyle(sv).visibility, r:[r.left, r.top, r.width, r.height]}; });
    check(f.z===0 && f.fly===0 && f.dial && f.chip==='visible', 'chữ 0 đã về, dọn sạch: '+JSON.stringify(f));
    check(e.end && e.end.every(function(v,i){ return Math.abs(v-f.r[i])<1.5; }), 'hạ cánh đúng chỗ + đúng cỡ chữ 0 của nút Sell: '+JSON.stringify([e.end, f.r]));
  });
  await run('T7', 'rảnh 10 s: số 0 thôi "thở", vòng vẽ dừng hẳn (pin, nóng máy) · chạm lại thì thở tiếp', async function(){
    await page.click('#h-sell'); await h.waitStep('q1'); await h.wait(1500);
    var a=await h.ev(function(){ return SVX._idle(); }); check(a.amp>0.9 && a.need, 'đang thở: '+JSON.stringify(a));
    await h.wait(10600);
    var b=await h.ev(function(){ return {i:SVX._idle(), raf:MOT.raf, busy:SVX.busy()}; }); check(b.i.amp===0 && !b.i.need && !b.busy && !b.raf, 'đã dừng, không còn khung: '+JSON.stringify(b));
    await page.mouse.click(196, 420); await h.wait(320); var c=await h.ev(function(){ return SVX._idle(); }); check(c.amp>0.2, 'chạm → thở lại: '+JSON.stringify(c));
  });
  await run('T8', '1:2 như 1:1: một đám mây 72 hạt, một vòng 24 tuần', async function(){
    await h.tap('.sv-n[data-i="1"]'); await h.waitStep('q2'); await h.wait(400);
    var d=await h.ev(function(){ return SVX._dots(); }); check(d.p===72 && Object.keys(d).length===1, 'một đám mây 72 hạt (như 1:1): '+JSON.stringify(d));
    check((await h.st()).mode==='1:2', 'đã chọn 1:2');
    await h.tap('.sv-n[data-i="1"]'); await h.waitStep('q3'); await h.wait(300);
    var d2=await h.ev(function(){ return SVX._dots(); }); check(d2.p===12 && d2.g===60, 'một vòng 24 tuần (không có số 0 thứ hai): '+JSON.stringify(d2));
    await h.tap('.svh'); await h.wait(500);
  });
  await run('T9', 'câu 02: không "00" — chấm Acid thu trước, số hiện cùng tuần đầu sáng rồi nhảy theo từng tuần (3 → 6 → 9 → 12) · câu 03 → Gói tập một gói: đếm xong rồi số co giãn tại chỗ', async function(){
    await page.click('#h-sell'); await h.waitStep('q1'); await h.wait(700); await h.tap('.sv-n[data-i="0"]'); await h.waitStep('q2'); await h.wait(700);
    await h.tap('.sv-n[data-i="1"]');
    var seen=[], t0=Date.now(), first=null, html0=null;
    check(await h.ev(function(){ return !document.querySelector('#sv-ctr .ly:not(.out)') && SVX._cd()>5; }), 'vừa chạm: chưa có lớp số, chấm Acid đang thu');
    while(Date.now()-t0<900){ var r=await h.ev(function(){ var ly=document.querySelector('#sv-ctr .ly:not(.out)'), n=ly && ly.querySelector('.n72'), v=n && n.querySelector('.cv');
        return {op:ly ? +getComputedStyle(ly).opacity : 0, v:v ? v.textContent : (n ? n.textContent : ''), z:document.querySelectorAll('#sv-ctr .z').length, cd:SVX._cd(), dl:ly ? ly.style.animationDelay : '', html:n ? n.innerHTML : ''}; });
      if(html0==null && r.html) html0=r;
      if(r.op>0.02){ if(first==null) first=r; if(!seen.length || seen[seen.length-1]!==r.v) seen.push(r.v); }
      if(r.z) seen.push('Z'); await h.wait(8); }
    check(html0 && /class="cb"/.test(html0.html) && html0.cd<0.5, 'lớp số chỉ gắn khi chấm Acid đã thu (cùng tuần đầu sáng), số trong ô cố định: '+JSON.stringify(html0));
    check(first && first.cd<1, 'chấm Acid ở tâm đã thu trước khi số hiện: '+JSON.stringify(first));
    check(seen.indexOf('Z')<0 && seen.indexOf('0')<0 && seen.indexOf('00')<0, 'không chữ số giữ chỗ, không "0" / "00": '+seen.join(' '));
    var nums=seen.map(Number); check(nums.length>=3 && nums[0]===3 && nums[nums.length-1]===12 && nums.every(function(v,i){ return !i || v>nums[i-1]; }) && nums.every(function(v){ return v%3===0; }), 'nhảy theo từng tuần: '+seen.join(' → '));
    check(await h.ev(function(){ var n=document.querySelector('#sv-ctr .ly:not(.out) .n72'); return n.children.length===0 && n.textContent==='12'; }), 'đếm xong: chữ thường "12"');
    await h.waitStep('q3'); await h.wait(300); await h.tap('.sv-n[data-i="2"]'); await h.wait(260);
    var w=await h.ev(function(){ return {step:SVX._step(), k:SVX._cnt(), t:(document.querySelector('#sv-ctr .ly:not(.out) .n72 .cv')||{}).textContent||''}; });
    check(w.step==='pk' && w.k==='range' && +w.t<36, 'đã sang Gói tập mà số vẫn đang đếm (không cắt giữa chừng): '+JSON.stringify(w));
    await h.wait(300);
    var x=await h.ev(function(){ var ly=document.querySelector('#sv-ctr .ly.flp:not(.out)'), n=ly && ly.querySelector('.n112'), a=n && n.parentNode.getAnimations()[0], kf=a ? a.effect.getKeyframes() : [];
      return {k:SVX._cnt(), flp:!!ly, n:n ? n.textContent : '', t0:kf.length ? kf[0].transform : '', ins:ly ? ly.querySelectorAll('.k.in').length : -1}; });
    check(x.k==='pkg' && x.flp && x.n==='36' && /scale\(0\.6/.test(x.t0) && x.ins===0, 'đếm xong → "36 BUỔI" co giãn tại chỗ thành số gói (72 → 112), không tắt rồi hiện: '+JSON.stringify(x));
    await h.wait(500); check((await h.ctr())==='36 BUỔI', 'tâm: '+(await h.ctr()));
    await h.tap('.svh'); await h.wait(500);
  });
  await run('T10', 'biểu đồ buổi giữa các bước: cả cụm số + biểu đồ dời cùng một đường (đường B0DY 0,3 s, không vượt) · tiền mặt: có biểu đồ, THANH TOÁN giữ chỗ', async function(){
    async function over(ms){ var m=0, t0=Date.now(); while(Date.now()-t0<ms){ m=Math.max(m, await h.ev(function(){ return SVX._over(); })); await h.wait(10); } return m; }
    await h.toPkg('1:1',[1,2],[2,2],36); await h.waitStep('deal'); await h.tap('.svc'); await h.waitStep('bill'); await h.wait(300);
    await h.tap('.svc'); await h.waitStep('pm'); await h.tap('.sv-r[data-i="0"]'); await h.waitStep('pf'); await h.wait(300);
    await h.tap('.sv-r[data-i="2"]'); check(await h.waitStep('card'), 'sang loại thẻ'); var m1=await over(500);
    check(m1<0.001, 'Hình thức trả → Loại thẻ: không vượt ('+(m1*100).toFixed(3)+' %)');
    var y0=await h.ev(function(){ var G=SVX._geo(); return {c:SVX._cy().to, b:G.run.yV, D:G.run.D}; });
    await h.tap('.sv-r[data-i="1"]');
    /* giữa chừng (đã sang bước sau): khung số và biểu đồ (cùng đồng hồ MT, đường B0DY 0,3 s) đi được cùng một phần quãng */
    var mid=null, t2=Date.now(); while(Date.now()-t2<700){ var q=await h.ev(function(){ var G=SVX._geo(), c=SVX._cy(), m=/matrix\(([^)]+)\)/.exec(getComputedStyle(document.getElementById('sv-ctr')).transform), P=SVX._pts();
        return {step:SVX._step(), cy:m ? +m[1].split(',')[5] : null, c1:c.to, b1:G.run ? G.run.yV : null, D1:G.run ? G.run.D : null, y:P.length ? P[0][1] : null}; });
      if(q.step==='val' && q.cy!=null){ var f0=(q.cy-y0.c)/(q.c1-y0.c); if(f0>0.15 && f0<0.85){ mid=q; break; } } await h.wait(5); }
    var fc=mid ? (mid.cy-y0.c)/(mid.c1-y0.c) : -1, fb=mid ? (mid.y-(y0.b+y0.D))/(mid.b1-y0.b) : -1;   /* buổi 1 = hàng gần nhất (y = yV + D); D như nhau ở hai bước */
    check(mid && mid.D1===y0.D && Math.abs(fc-fb)<0.03, 'cả cụm dời cùng nhịp: khung số '+fc.toFixed(2)+' · đường băng '+fb.toFixed(2)+' '+JSON.stringify([y0, mid]));
    var m2=await over(800); check(await h.waitStep('val'), 'sang giá trị phải trả');
    check(m2<0.001, 'Loại thẻ → Giá trị phải trả: không nảy (vượt '+(m2*100).toFixed(3)+' %)');
    var y1=await h.ev(function(){ return {d:SVX._dots()}; });
    check(y1.d.p===36 && Object.keys(y1.d).length===1, 'trả một lần: 36 chấm sáng: '+JSON.stringify(y1.d));
    await h.tap('.svb'); await h.waitStep('card'); await h.wait(300); await h.tap('.svb'); await h.waitStep('pf'); await h.wait(300);
    var lb=await h.ev(function(){ var k=document.querySelector('#sv-ctr .ly:not(.out) .k .lb'); return k ? k.textContent : ''; });
    await h.tap('.sv-r[data-i="1"]'); await h.waitStep('val');
    var c=await h.ev(function(){ var ly=document.querySelector('#sv-ctr .ly:not(.out)'); return {flp:!!(ly && ly.classList.contains('flp')), lb:ly ? (ly.querySelector('.lb')||{}).textContent : '', n:SVX._pts().length}; });
    check(lb==='THANH TOÁN' && c.flp && c.lb==='THANH TOÁN' && c.n===36, 'tiền mặt: nhãn THANH TOÁN giữ chỗ, biểu đồ buổi đi theo (không tan): '+JSON.stringify(c));
    await h.wait(450); var g=await h.ev(function(){ var G=SVX._geo(), R=SVX._rail(), k=document.querySelector('#sv-ctr .ly:not(.out) .n44').getBoundingClientRect(); return {n:SVX._pts().length, numBottom:k.bottom, top:G.run.yV+G.run.D*R.z0/(R.z0+G.run.kz), small:SVX._small()}; });
    check(g.n===36 && !g.small && g.top>g.numBottom+20, 'tiền mặt: đường băng (đầu xa) dưới số phải thu: '+JSON.stringify(g));
    await h.tap('.svc'); await h.wait(500);
  });
  await ctx.close();

  /* ================= 2 · MOCK API: tài khoản nhận từ lệnh 'bank' ================= */
  var SRV={bank:{ok:true, bin:'970407', acc:'0123456789', name:'HO KINH DOANH B0DY STUDIO', bank:'TECHCOMBANK'}, calls:0, last:null};
  var cm=await mkctx(browser), pm=await cm.newPage(); P=pm; var hm=H(pm); pm.on('pageerror', function(e){ PAGEERR.push('mock: '+String(e)); });
  await cm.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:'{"ip":"203.0.113.9"}'}); });
  async function handle(r){
    var p=JSON.parse(r.request().postData()||'{}'), out={ok:false,error:'unknown_action'};
    if(p.action==='ping') out={ok:true};
    else if(p.pin!=='1234') out={ok:false,error:'sai_pin'};
    else if(p.action==='coach') out={ok:true, coach:'Quyết Hán', members:[{name:'Bùi Doãn Quang',done:14,total:24,left:10,coach:'Quyết Hán'}], snapshot:{}, library:null, today:new Date().toISOString().slice(0,10)};
    else if(p.action==='stats') out={ok:true, month:new Date().toISOString().slice(0,7), days:{}, monthTotal:3, perClient:{}, com:{month:new Date().toISOString().slice(0,7), total:1000000}, hist:{}};
    else if(p.action==='bank'){ SRV.calls++; SRV.last=p; out=SRV.bank; }
    r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)});
  }
  await cm.route(/workers\.dev/, handle); await cm.route(/script\.google\.com/, handle);
  await pm.goto(URL); await pm.waitForSelector('#p-pin.on'); await hm.wait(400); await hm.login();
  await run('M', 'lệnh bank → VietQR đúng tài khoản (giả) · cache', async function(){
    await hm.toPkg('1:1',[1,1],[2,2],36); await hm.waitStep('deal'); await hm.tap('.sv-g[data-k="2"]'); await hm.tap('.svc'); await hm.waitStep('bill'); await hm.wait(250);
    await hm.tap('.svc'); await hm.waitStep('pm'); await hm.tap('.sv-r[data-i="1"]'); await hm.waitStep('pf'); await hm.tap('.sv-r[data-i="0"]');
    await pm.keyboard.type('Nguyễn Quang Vinh'); await pm.keyboard.press('Enter'); await hm.waitStep('qr'); await hm.wait(1900);   /* dòng ngân hàng gõ dần từ 1,2 s */
    check(SRV.calls>=1 && SRV.last && SRV.last.pin==='1234', 'gọi bank kèm PIN coach'); check(SRV.last && !SRV.last.apin, 'không gửi PIN admin');
    var got=await hm.ev(function(){ return SVX._qr(); }), exp=SVE.vietqr('970407','0123456789',7200000,'N Q VINH 36B TRA GOP');
    check(got===exp, 'payload VietQR: '+got);
    check((await hm.txt(hm.cur+'#sv-bank'))==='TECHCOMBANK · HO KINH DOANH B0DY STUDIO', 'dòng ngân hàng: '+(await hm.txt(hm.cur+'#sv-bank')));
    check(JSON.parse(await hm.ev(function(){ return localStorage.getItem('lb_bank'); })).acc==='0123456789', 'nhớ tài khoản vào máy');
    await shot(pm,'M-qr'); await hm.tap('.svc'); await hm.wait(900);
  });
  await run('N', 'chưa cài tài khoản → không vẽ mã, báo lỗi; mất mạng → dùng bản đã nhớ', async function(){
    SRV.bank={ok:false, error:'no_bank'}; await hm.ev(function(){ SVX._bank(null); });
    await hm.toPkg('1:1',[1,1],[2,2],36); await hm.waitStep('deal'); await hm.tap('.svc'); await hm.waitStep('bill'); await hm.wait(250);
    await hm.tap('.svc'); await hm.waitStep('pm'); await hm.tap('.sv-r[data-i="0"]'); await hm.waitStep('pf'); await hm.tap('.sv-r[data-i="0"]');
    await pm.keyboard.type('Vũ An'); await pm.keyboard.press('Enter'); await hm.waitStep('qr'); await hm.wait(700);
    check((await hm.txt(hm.cur+'#sv-qe'))==='CHƯA CÓ TÀI KHOẢN NHẬN', 'thông báo trong thẻ'); check(await hm.ev(function(){ return document.getElementById('sv-qrc').hidden; }), 'không vẽ mã');
    check((await hm.ev(function(){ return document.getElementById('pill').textContent; })).indexOf('Chưa cài tài khoản nhận')>=0, 'pill lỗi');
    check(await hm.ev(function(){ return localStorage.getItem('lb_bank'); })===null, 'xoá bản nhớ khi máy chủ báo chưa cài');
    await hm.tap('.svc'); await hm.wait(900);
    /* mất mạng, còn bản nhớ */
    SRV.bank={ok:true, bin:'970407', acc:'0123456789', name:'HO KINH DOANH B0DY STUDIO', bank:'TECHCOMBANK'};
    await hm.ev(function(){ localStorage.setItem('lb_bank', JSON.stringify({bin:'970407', acc:'0123456789', bank:'TECHCOMBANK', name:'HO KINH DOANH B0DY STUDIO'})); SVX._bank(null); });
    await cm.unroute(/script\.google\.com/); await cm.route(/script\.google\.com/, function(r){ r.abort('internetdisconnected'); });
    await hm.toPkg('1:1',[1,1],[2,2],36); await hm.waitStep('deal'); await hm.tap('.svc'); await hm.waitStep('bill'); await hm.wait(250);
    await hm.tap('.svc'); await hm.waitStep('pm'); await hm.tap('.sv-r[data-i="0"]'); await hm.waitStep('pf'); await hm.tap('.sv-r[data-i="0"]');
    await pm.keyboard.type('Vũ An'); await pm.keyboard.press('Enter'); await hm.waitStep('qr'); await hm.wait(700);
    check((await hm.ev(function(){ return SVX._qr(); }))===SVE.vietqr('970407','0123456789',14400000,'VU AN 36B'), 'mã từ bản nhớ: '+(await hm.ev(function(){ return SVX._qr(); })));
    await hm.tap('.svc'); await hm.wait(300);
  });
  await cm.close();

  /* ================= 3 · CỠ MÀN KHÁC + GIẢM CHUYỂN ĐỘNG ================= */
  for(var vp of [{width:375,height:667},{width:430,height:932}]){
    var cx=await mkctx(browser, vp), px=await cx.newPage(); P=px; var hx=H(px); px.on('pageerror', function(e){ PAGEERR.push(vp.width+': '+String(e)); });
    await px.goto(URL+'?demo'); await px.waitForSelector('#p-pin.on'); await hx.wait(400); await hx.login();
    await run('R'+vp.width, 'bố cục '+vp.width+'×'+vp.height, async function(){
      async function fit(tag){ var r=await hx.ev(function(){ var pg=document.querySelector('.page.sv.on:not(.leave-fwd):not(.leave-back)'); if(!pg) return {err:'no page'}; var g=SVX._geo(), hd=pg.querySelector('.head').getBoundingClientRect(), nav=pg.querySelector('.sv-nav').getBoundingClientRect(), a=pg.querySelector('.sv-ans'), ar=a ? a.getBoundingClientRect() : null;
        var over=[]; pg.querySelectorAll('*').forEach(function(e){ var b=e.getBoundingClientRect(); if(b.width && (b.right>innerWidth+0.5 || b.left<-0.5)) over.push(e.className||e.tagName); });
        var RR=SVX._rail(), bar=!!g.run, sm=SVX._small(), top=bar ? g.cy+g.run.E[0] : g.cy-g.rx*1.3068, bot=bar ? (sm ? g.cy+g.run.E[1] : g.run.yV+g.run.D*RR.z0/(RR.z0-.3)+1) : g.cy+g.rx*1.3068;
        return {top:top, bot:bot, hb:hd.bottom, at:ar?ar.top:(bar?nav.top:null), nb:nav.bottom, vh:innerHeight, over:over.slice(0,3), bar:bar, small:sm}; });
        check(r.nb<=r.vh+0.5, tag+': nav trong màn '+JSON.stringify(r)); check(!r.over.length, tag+': tràn ngang '+r.over.join(','));
        if(r.at!=null && tag!=='bill') check(r.top>r.hb+10 && r.bot<r.at-10, tag+': '+(r.bar?'số + biểu đồ buổi':'số 0')+' nằm trong khoảng trống '+JSON.stringify(r)); }
      await hx.toPkg('1:1',[1,2],[2,2]); await fit('pk'); await hx.tap('.sv-r[data-i="0"]'); await hx.waitStep('deal'); await hx.wait(300); await fit('deal');
      var sm=await hx.ev(function(){ return SVX._small(); }); check(vp.height<=667 ? sm : !sm, 'số 0 '+(sm?'tắt':'giữ')+' ở màn ưu đãi '+vp.width+'×'+vp.height);
      var ov=await hx.ev(function(){ var l=document.querySelector('#sv-ctr .ly:not(.out)'), mx=0; [].forEach.call(l.querySelectorAll('.k>*'), function(c){ var b=c.getBoundingClientRect(); mx=Math.max(mx, b.right); }); return mx<=innerWidth; }); check(ov, 'số ở tâm không tràn màn');
      await hx.tap('.svc'); await hx.waitStep('bill'); await hx.wait(800); await fit('bill');
      var b=await hx.ev(function(){ var s=document.querySelector('.page.sv.on .sv-bill').getBoundingClientRect(), hd=document.querySelector('.page.sv.on .head').getBoundingClientRect(); return {t:s.top, hb:hd.bottom}; });
      check(b.t>b.hb+8, 'đầu phiếu không khuất dưới tiêu đề (màn thấp: phiếu gọn .tight): '+JSON.stringify(b));
      await hx.tap('.svc'); await hx.waitStep('pm'); await fit('pm'); await hx.tap('.sv-r[data-i="1"]'); await hx.waitStep('pf'); await hx.wait(200); await fit('pf');
      await hx.tap('.sv-r[data-i="2"]'); await hx.waitStep('card'); await hx.wait(300); await fit('card');
      await shot(px,'R'+vp.width+'-card');
      await hx.tap('.sv-r[data-i="1"]'); await hx.waitStep('val'); await hx.wait(500); await fit('val'); await shot(px,'R'+vp.width+'-val');
      var bs=await hx.ev(function(){ return {small:SVX._small(), n:SVX._pts().length}; }); check(!bs.small && bs.n===36, 'giá trị phải trả '+vp.width+'×'+vp.height+': có biểu đồ buổi: '+JSON.stringify(bs));
      await hx.tap('.svb'); await hx.waitStep('card'); await hx.wait(300); check((await hx.ctr())==='PHÍ QUẸT THẺ 1,815%', 'lùi về loại thẻ: tâm phí: '+(await hx.ctr()));
      await hx.tap('.svb'); await hx.waitStep('pf'); await hx.wait(300); await hx.tap('.sv-r[data-i="0"]');
      await px.keyboard.type('Nguyễn Quang Vinh'); await px.keyboard.press('Enter'); await hx.waitStep('qr'); await hx.wait(400);
      var q=await hx.ev(function(){ var c=document.querySelector('.page.sv.on .sv-card').getBoundingClientRect(), b=document.querySelector('.page.sv.on #sv-bank').getBoundingClientRect(), n=document.querySelector('.page.sv.on .sv-nav').getBoundingClientRect(), hd=document.querySelector('.page.sv.on .head').getBoundingClientRect(); return {cardTop:c.top, headBottom:hd.bottom, bankBottom:b.bottom, navTop:n.top, w:c.width}; });
      check(q.cardTop>q.headBottom+8 && q.bankBottom<=q.navTop-12, 'thẻ mã nằm giữa tiêu đề và nav: '+JSON.stringify(q));
      await shot(px,'R'+vp.width+'-qr'); await hx.tap('.svc'); await hx.wait(300);
    });
    await cx.close();
  }
  var cr=await mkctx(browser, null, {reducedMotion:'reduce'}), pr=await cr.newPage(); P=pr; var hr=H(pr); pr.on('pageerror', function(e){ PAGEERR.push('rm: '+String(e)); });
  await pr.goto(URL+'?demo'); await pr.waitForSelector('#p-pin.on'); await hr.wait(400); await hr.login();
  await run('S', 'giảm chuyển động: hạt không bay — mờ tại chỗ cũ, hiện ở chỗ mới (0,2 s)', async function(){
    /* đám mây → vòng (đổi chỗ lớn nhất): giữa lúc chuyển, mọi hạt đang đổi chỉ nằm ở chỗ cũ hoặc chỗ mới */
    await pr.click('#h-sell'); await hr.waitStep('q1'); await hr.tap('.sv-n[data-i="0"]'); await hr.waitStep('q2'); await hr.wait(300);
    await hr.tap('.sv-n[data-i="1"]'); await hr.wait(30);
    var f=await hr.ev(function(){ return SVX._fade(); }); check(f.n>20 && f.bad===0, 'đang chuyển: hạt chỉ ở chỗ cũ / chỗ mới: '+JSON.stringify(f));
    check(await hr.ev(function(){ return SVX.busy(); }), 'vẫn có mờ dần (không tắt hẳn chuyển động)');
    await hr.waitStep('q3'); await hr.wait(320); check(await hr.ev(function(){ return !SVX.busy(); }), 'xong ~0,2 s sau khi sang câu 03');
    await hr.tap('.svh'); await hr.wait(400);
    await hr.toPkg('1:1',[1,2],[2,2],36); await hr.waitStep('deal'); await hr.tap('.sv-g[data-k="2"]'); await hr.wait(260);
    var d=await hr.ev(function(){ return SVX._dots(); }); check(d.a===2, 'tặng 2: '+JSON.stringify(d));
    check(await hr.ev(function(){ return !SVX.busy(); }), 'không còn tween sau 0,26 s');
    await hr.tap('.svc'); await hr.waitStep('bill'); await hr.wait(80);
    var t=await hr.ev(function(){ return getComputedStyle(document.querySelector('.page.sv.on .sv-bill')).transform; }); check(t==='none', 'phiếu hiện đủ ngay: '+t);
    check(await hr.ev(function(){ return !document.querySelector('.svfly,.svln') && !document.querySelector('.page.svrise,.page.svsink'); }), 'giảm chuyển động: không bay số, không trồi / chìm');
    await hr.tap('.svc'); await hr.waitStep('pm'); await hr.wait(40);
    var f2=await hr.ev(function(){ return SVX._fade(); }); check(f2.bad===0, 'biểu đồ buổi: chỉ mờ tại chỗ, không quét / bay: '+JSON.stringify(f2));
    await hr.wait(300); var d2=await hr.ev(function(){ return {d:SVX._dots(), busy:SVX.busy(), tk:SVX._tk().length}; }); check(d2.d.p===38 && !d2.busy && !d2.tk, 'xong ~0,2 s: '+JSON.stringify(d2));
  });
  await cr.close();

  await browser.close(); srv.close();
  var fail=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fail)+'/'+RES.length+' PASS · PAGEERR '+PAGEERR.length+(PAGEERR.length?'\n'+PAGEERR.join('\n'):''));
  process.exit(fail||PAGEERR.length ? 1 : 0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

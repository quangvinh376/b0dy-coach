/* Bán cho khách mới (v2.9.0 · sell.js; chuyển động liền mạch v2.13.0) — Playwright, Chromium, iPhone 393×852 dpr2 touch + 375×667 / 430×932 + giảm chuyển động.
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
   - MOCK API (không ?demo): lệnh 'bank' → mã VietQR đúng tài khoản giả, cache, chưa cài tài khoản → báo lỗi.
   Số tài khoản trong test là SỐ GIẢ (repo công khai). Mã thoát 1 nếu có FAIL hoặc PAGEERR. */
var {chromium}=require('playwright'); var serve=require('./serve'); var fs=require('fs'); var path=require('path'); var assert=require('assert');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19131, OUT=path.join(__dirname,'out_sell');
var SV=require('../sell.js'), SVE=SV.SVE, QRX=SV.QRX;
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
var RES=[], PAGEERR=[], CUR=null, P=null;
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
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
    [[24,540000],[36,900000],[48,1330000],[72,2520000],[12,0]].forEach(function(x){ assert.equal(SVE.dMax('1:1',x[0]),x[1]); });
    [[24,400000],[36,670000],[48,970000],[72,1800000]].forEach(function(x){ assert.equal(SVE.dMax('1:2',x[0]),x[1]); });   /* xuống bước 10.000 ₫ */
    assert.equal(SVE.dCap('1:1',36,1),600000); assert.equal(SVE.dCap('1:1',36,2),300000); assert.equal(SVE.dCap('1:1',48,1),990000); assert.equal(SVE.dCap('1:1',24,1),270000); assert.equal(SVE.dCap('1:1',72,3),1440000);
    var q=SVE.quote('1:1',36,2,0); assert.equal(q.unit,378947); assert.equal(q.sessions,38); assert.equal(q.weeks,13);
    assert.equal(SVE.quote('1:1',36,2,300000).unit,371053); q=SVE.quote('1:1',24,1,270000); assert.equal(q.unit,421200); assert.equal(q.total,10530000); assert.equal(q.weeks,null);
    q=SVE.quote('1:1',72,3,0); assert.equal(q.unit,336000); assert.equal(q.weeks,25); assert.equal(SVE.quote('1:1',48,4,0).weeks,18); assert.equal(SVE.quote('1:1',72,7,0).weeks,27);
    assert.equal(SVE.quote('1:1',36,2,500000).d,300000, 'giảm vượt trần bị kẹp');
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
  await run('C', 'Ưu đãi: vòng tặng · thanh giảm · khoá · tâm đơn giá', async function(){
    await h.tap('.sv-r[data-i="0"]'); check(await h.waitStep('deal'), 'sang ưu đãi');
    check((await h.txt(h.cur+'.t1 .ac'))==='36 buổi', 'tiêu đề Acid "36 buổi"');
    check((await h.ctr())==='ĐƠN GIÁ SAU ƯU ĐÃI 400.000₫ Σ 14.400.000 ₫ / 36 BUỔI', 'tâm chưa ưu đãi: '+(await h.ctr()));
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-g').length; })===3, 'gói 36: 3 vòng');
    await h.tap('.sv-g[data-k="2"]'); await h.wait(300);
    var s=await h.st(); check(s.b===2, 'tặng 2'); check((await h.ctr())==='ĐƠN GIÁ SAU ƯU ĐÃI 378.947₫ Σ 14.400.000 ₫ / 38 BUỔI', 'tâm tặng 2: '+(await h.ctr()));
    var cls=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on .sv-g'), function(g){ return (g.classList.contains('on')?'A':'')+(g.classList.contains('nx')?'+':'')+(g.classList.contains('lk')?'K':'')||'-'; }).join(' '); });
    check(cls==='A A +', 'vòng: '+cls);
    var tk=await h.ev(function(){ var s=document.querySelector('.page.sv.on .sv-sl'); return +((/scaleX\(([\d.]+)\)/.exec(s.querySelector('.tk').style.transform)||[])[1]); }); check(Math.abs(tk-1/3)<0.01, 'rãnh còn 1/3 (scaleX): '+tk);
    var d=await h.ev(function(){ return SVX._dots(); }); await h.wait(400); d=await h.ev(function(){ return SVX._dots(); }); check(d.a===2 && d.o===1, 'số 0: 2 hạt tặng Acid + 1 rỗng: '+JSON.stringify(d));
    await h.tap('.sv-g[data-k="2"]'); check((await h.st()).b===1, 'chạm lại vòng cuối đang sáng = bớt một');
    await h.tap('.sv-g[data-k="3"]'); check((await h.st()).b===3, 'chạm vòng 3 = tặng 3'); await h.wait(300);
    await h.slide(1); check((await h.st()).d===0, 'tặng hết thì không giảm');
    await h.tap('.sv-g[data-k="2"]'); await h.slide(1); s=await h.st(); check(s.b===2 && s.d===300000, 'tặng 2 → giảm tối đa 300.000: '+s.d);
    check((await h.ctr()).indexOf('371.053')>=0, 'đơn giá 371.053');
    cls=await h.ev(function(){ return document.querySelector('.page.sv.on .sv-g[data-k="3"]').className; }); check(/\blk\b/.test(cls), 'vòng 3 khoá khi giảm đã chiếm chỗ');
    await h.tap('.sv-g[data-k="3"]'); check((await h.st()).b===2, 'vòng khoá không nhận chạm');
    await h.tap('.sv-g[data-k="1"]'); await h.slide(0.5); s=await h.st(); check(s.b===1 && s.d===450000, 'tặng 1, kéo nửa thanh = 450.000: '+s.d);
    await h.slide(0); await h.tap('.sv-g[data-k="2"]'); s=await h.st(); check(s.b===2 && s.d===0, 'về tặng 2 · giảm 0: '+JSON.stringify([s.b,s.d]));
    await shot(page,'C-deal');
  });
  await run('D', 'Phiếu đề xuất (bill)', async function(){
    await h.tap('.svc'); check(await h.waitStep('bill'), 'sang phiếu'); await h.wait(1000);   /* số 0 đổ vào khe rồi phiếu trồi 460 ms (trễ 340) */
    var rows=await h.rows('.page.sv.on .sv-bill .r');
    check(JSON.stringify(rows)===JSON.stringify(['ĐƠN GIÁ 400.000₫/BUỔI','TẶNG THÊM 2BUỔI','ĐƠN GIÁ SAU ƯU ĐÃI 378.947₫/BUỔI','THỜI HẠN 13TUẦN','KỲ TRẢ GÓP 2 × 7.200.000₫']), 'dòng phiếu: '+JSON.stringify(rows));
    check((await h.txt(h.cur+'.sv-bill .tt'))==='14.400.000₫', 'THANH TOÁN 14.400.000');
    check((await h.txt(h.cur+'.sv-bill .pk'))==='GÓI 36 BUỔI', 'tên gói');
    var g=await h.ev(function(){ var w=document.querySelector('.page.sv.on .sv-billw').getBoundingClientRect(), b=document.querySelector('.page.sv.on .sv-bill').getBoundingClientRect(), sl=document.querySelector('.page.sv.on .sv-slot').getBoundingClientRect(), hd=document.querySelector('.page.sv.on .head').getBoundingClientRect(), nav=document.querySelector('.page.sv.on .sv-nav').getBoundingClientRect();
      return {sheetBottom:b.bottom, slotTop:sl.top, sheetTop:b.top, headBottom:hd.bottom, gap:nav.top-sl.bottom, w:b.width}; });
    check(Math.abs(g.sheetBottom-g.slotTop)<1, 'giấy chạm khe: '+JSON.stringify(g)); check(g.sheetTop>g.headBottom+40, 'giấy dưới tiêu đề'); check(Math.abs(g.gap-28)<1, 'khe cách nav 28'); check(Math.abs(g.w-313)<1, 'giấy rộng 313');
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
    await h.wait(450); var d=await h.ev(function(){ return SVX._dots(); }); check(d.m===1, 'một mốc KỲ 2: '+JSON.stringify(d));
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
    var bd=await h.ev(function(s){ var b=document.querySelector(s+' .sv-badge'), sv=b.querySelector('svg'), u=sv.querySelector('use'), br=b.getBoundingClientRect(), sr=sv.getBoundingClientRect(), ur=u.getBoundingClientRect();
      return {bg:getComputedStyle(b).backgroundColor, fill:getComputedStyle(sv).fill, href:u.getAttribute('href'), h:sr.height/br.height, dx:Math.abs((ur.left+ur.right)/2-(br.left+br.right)/2), dy:Math.abs((ur.top+ur.bottom)/2-(br.top+br.bottom)/2), uw:ur.width}; }, h.cur);
    check(/10, 10, 10/.test(bd.bg) && /250, 250, 250/.test(bd.fill) && bd.href==='#i-zero', 'ô giữa mã: nền Ink, chữ 0 có chấm Paper: '+JSON.stringify(bd));
    check(bd.uw>20 && bd.dx<1 && bd.dy<1 && Math.abs(bd.h-.48)<.02, 'chữ 0 nằm đúng giữa ô, cao 48 %: '+JSON.stringify(bd));
    var c=await h.ev(function(){ var n=document.querySelector('.page.sv.on .sv-nav'), b=n.querySelector('.svc').getBoundingClientRect(), r=n.getBoundingClientRect(); return (b.left+b.right)/2-(r.left+r.right)/2; }); check(Math.abs(c)<1, 'nút chính ở giữa: '+c);
    await shot(page,'F-qr');
  });
  await run('G', 'Lùi từng bước giữ lựa chọn · ⌂ về trang chủ', async function(){
    await h.tap('.svb'); check(await h.waitStep('name'), 'QR ← họ tên'); check((await h.ev(function(){ return document.getElementById('sv-in').value; }))==='Nguyễn Quang Vinh', 'giữ họ tên');
    await h.wait(300); await h.tap('.svb'); check(await h.waitStep('pf'), '← hình thức trả');
    check(await h.ev(function(){ return document.querySelector('.page.sv.on:not(.leave-back):not(.leave-fwd) .sv-r.on').dataset.i; })==='0', 'giữ chọn chuyển khoản');
    await h.wait(300); await h.tap('.svb'); check(await h.waitStep('pm'), '← phương thức trả'); await h.wait(300); await h.tap('.svb'); check(await h.waitStep('bill'), '← phiếu');
    await h.wait(300); await h.tap('.svb'); check(await h.waitStep('deal'), '← ưu đãi'); await h.wait(200);
    var cls=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on:not(.leave-back) .sv-g'), function(g){ return g.classList.contains('on')?'A':'-'; }).join(''); }); check(cls==='AA-', 'giữ 2 vòng tặng: '+cls);
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
    await h.wait(400); var d=await h.ev(function(){ return SVX._dots(); }); check(d.m===1 && (d.p||0)>=14, 'số 0 lớn: lịch thu còn mốc KỲ 2: '+JSON.stringify(d));
    await shot(page,'H-val'); await h.tap('.svc'); await h.wait(500); check((await h.ev(function(){ return state.screen; }))==='p-home', 'Xong → trang chủ');
  });
  await run('I', 'Gói 12: không ưu đãi, không trả góp · tiền mặt', async function(){
    await h.toPkg('1:1',[0,0],[0,0]); await h.wait(200);
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on:not(.leave-fwd) .sv-r').length; })===1, '2 buổi × 1 tháng → chỉ gói 12');
    check((await h.st()).S===12, 'một gói → chọn sẵn'); check((await h.ctr())==='12 BUỔI', 'tâm 12: '+(await h.ctr()));
    await h.tap('.sv-r[data-i="0"]'); check(await h.waitStep('bill'), 'gói 12 bỏ màn ưu đãi'); await h.wait(500);
    var rows=await h.rows('.page.sv.on .sv-bill .r');
    check(JSON.stringify(rows)===JSON.stringify(['ĐƠN GIÁ 500.000₫/BUỔI']), 'phiếu chỉ đơn giá (thời hạn gói 12 chưa có trong tài liệu): '+JSON.stringify(rows));
    await h.tap('.svc'); check(await h.waitStep('pf'), 'không trả góp → thẳng hình thức trả');
    check((await h.ctr())==='THANH TOÁN 6TR', 'tâm: '+(await h.ctr()));
    await h.tap('.sv-r[data-i="1"]'); check(await h.waitStep('val'), 'tiền mặt → giá trị phải trả'); await h.wait(500);
    check((await h.ctr())==='THANH TOÁN 6.000.000₫', 'tâm: '+(await h.ctr()));
    var d=await h.ev(function(){ return SVX._dots(); }); check(!Object.keys(d).length, 'tiền mặt: không số 0 (Figma E): '+JSON.stringify(d));
    await h.tap('.svc'); await h.wait(500);
  });
  await run('J', 'Gói 48 · giảm 10.000 ₫ → 3 kỳ lệch: dư dồn kỳ 1', async function(){
    await h.toPkg('1:1',[1,2],[2,3],48); await h.waitStep('deal'); await h.wait(600);   /* chờ trang vào xong (đang trượt 24 px thì toạ độ thanh lệch) */
    await h.slide(10000/1330000); var s=await h.st(); check(s.d===10000, 'giảm 10.000: '+s.d);
    await h.tap('.svc'); await h.waitStep('bill'); await h.wait(400);
    var rows=await h.rows('.page.sv.on .sv-bill .r');
    check(rows.indexOf('KỲ TRẢ GÓP 3 × 5.916.000₫')>=0 && rows.indexOf('KỲ 1 THÊM 2.000₫')>=0 && rows.indexOf('GIẢM GIÁ 10.000₫')>=0, 'phiếu: '+JSON.stringify(rows));
    await h.tap('.svc'); await h.waitStep('pm');
    var r3=(await h.rows(h.cur+'.sv-r[data-i="1"]'))[0]; check(r3==='Chia 3 kỳKỲ 1 THÊM 2.000 ₫ 3 × 5.916.000₫', 'hàng chia 3 kỳ: '+r3);
    await h.tap('.sv-r[data-i="1"]'); await h.wait(500); var d=await h.ev(function(){ return SVX._dots(); }); check(d.m===2, 'hai mốc KỲ 2 · KỲ 3: '+JSON.stringify(d));
    await h.waitStep('pf'); await h.tap('.sv-r[data-i="0"]'); await page.keyboard.type('Trần Thị Bích Ngọc'); await page.keyboard.press('Enter'); await h.waitStep('qr'); await h.wait(1300);
    check((await h.txt(h.cur+'.sv-amt'))==='5.918.000₫', 'kỳ 1 = 5.918.000'); check((await h.txt(h.cur+'.sv-mm'))==='T T B NGOC 48B TRA GOP', 'nội dung: '+(await h.txt(h.cur+'.sv-mm')));
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
    check((await h.txt(h.cur+'.sv-bill .pk'))==='GÓI 72 BUỔI · 1:2', 'phiếu ghi gói 1:2'); check((await h.txt(h.cur+'.sv-bill .tl'))==='THANH TOÁN', 'không "MỖI NGƯỜI" — một khách');
    await h.tap('.svc'); check(await h.waitStep('pf'), 'gói 72 không trả góp'); await h.tap('.sv-r[data-i="0"]');
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
    var r=await h.ev(function(s){ var u=document.querySelector('#sv-ctr .ly:not(.out) [data-k=unit]'), b=document.querySelector(s+' [data-k=b]');
      var strips=function(e){ return [].map.call(e.querySelectorAll('.sp'), function(x){ var kf=x.getAnimations()[0].effect.getKeyframes(); return {n:x.textContent.split('\n').length, a:kf[0].transform, z:kf[kf.length-1].transform, k:kf.length}; }); };
      return {fx:SVX._idle().fx, rl:u.classList.contains('rl'), cells:u.querySelectorAll('.rc').length, u:strips(u), b:strips(b)}; }, nowPg());
    var y=function(t){ return parseFloat((/translateY\((-?[\d.]+)px\)/.exec(t)||[])[1]); };
    check(r.fx>=4, 'tặng 2: hai sao chổi + hai gợn trên số 0 (fx '+r.fx+')');
    check(r.rl && r.cells===7 && r.u.length===6, 'đơn giá lăn tại chỗ, chỉ chữ số đổi (6/7 ô): '+JSON.stringify(r.u.length)+' · '+r.cells);
    check(r.u.every(function(x){ return x.n<=10 && x.k===2 && y(x.a)<0 && y(x.z)===0; }), 'đơn giá giảm → trượt xuống, ≤ 9 nấc, không nảy: '+JSON.stringify(r.u));
    check(r.b.length===1 && r.b[0].n===3 && y(r.b[0].a)===0 && y(r.b[0].z)<0, 'số buổi tặng 0 → 2 trồi lên đúng 2 nấc: '+JSON.stringify(r.b));
    await h.wait(700);
    var r2=await h.ev(function(s){ var u=document.querySelector('#sv-ctr .ly:not(.out) [data-k=unit]'); return {rl:u.classList.contains('rl'), t:u.textContent, n:document.querySelectorAll('#sv-ctr .ly').length, g:getComputedStyle(document.querySelector(s+' .sv-g[data-k="2"]')).backgroundColor, b:document.querySelector(s+' [data-k=b]').textContent}; }, nowPg());
    check(!r2.rl && r2.t==='378.947' && r2.n===1 && /212, 255, 0/.test(r2.g) && r2.b==='2', 'lăn xong đúng số, vòng tặng Acid: '+JSON.stringify(r2));
  });
  await run('T4', 'Ưu đãi → phiếu: số 0 đổ vào khe in rồi phiếu trồi (không lật) · Chốt ưu đãi → Khách đồng ý đổi chữ tại chỗ · lịch thu dựng lên từ khe', async function(){
    function slotY(sel){ return h.ev(function(q){ var e=document.querySelector(q); if(!e) return null; var r=e.getBoundingClientRect(); return r.top+r.height/2; }, sel); }
    function near(y){ return h.ev(function(y){ var P=SVX._pts(), m=0; P.forEach(function(q){ m+=Math.abs(q[1]-y); }); return {n:P.length, d:P.length ? m/P.length : 0}; }, y); }
    await h.tap('.svc'); await h.wait(50);
    var f=await h.ev(function(s){ var ps=[].slice.call(document.querySelectorAll('.page.sv.on'));
      return {flip:ps.some(function(p){ return p.classList.contains('flipin')||p.classList.contains('flipout'); }), persp:ps.some(function(p){ return p.getAnimations().some(function(a){ var k=a.effect.getKeyframes(); return k.length && /perspective/.test(k[0].transform||''); }); }),
              head:document.querySelector(s+'>.head').getAnimations().map(function(a){ return a.animationName; }), line:SVX._line()}; }, nowPg());
    check(!f.flip && !f.persp && f.head.join()==='svLiO,svLiT', 'không lật, cùng nhịp mọi bước: '+JSON.stringify(f));
    check(f.line>=24, 'số 0 đang nghiêng thành đường kẻ của khe in: '+f.line+' hạt');
    check(await h.waitStep('bill'), 'sang phiếu');
    var c=await h.ev(function(s){ var c=document.querySelector(s+' .svc'), o=document.querySelector('.page.sv.leave-fwd .svc'); return {cls:c.className, vis:getComputedStyle(c).visibility, t:c.textContent, old:o ? o.className : null, ov:o ? getComputedStyle(o).visibility : null}; }, nowPg());
    check(/\bstill\b/.test(c.cls) && !/\bswap\b/.test(c.cls) && c.vis==='visible' && c.t==='Khách đồng ý' && /\bgone\b/.test(c.old||'') && c.ov==='hidden', 'nút chính giữ chỗ (không mờ ra rồi trồi lên), chữ đã đổi: '+JSON.stringify(c));
    var p=await h.ev(function(s){ var a=document.querySelector(s+' .sv-bill').getAnimations()[0], sl=document.querySelector(s+' .sv-slot').getAnimations().length; return a ? {k:a.effect.getKeyframes().length, d:a.effect.getTiming().duration, dl:a.effect.getTiming().delay, sl:sl} : null; }, nowPg());
    check(p && p.k===2 && p.d===460 && p.dl===340 && p.sl===1, 'phiếu trồi một lần 460 ms ngay khi số 0 vừa đổ vào khe (trễ 340), khe sáng một nhịp: '+JSON.stringify(p));
    var sy=await slotY(nowPg()+' .sv-slot'), d0=await near(sy); await h.wait(260); var d1=await near(sy);
    check(d0.n>0 && d1.d<d0.d*.5 && d1.d<16, 'hạt dồn về khe: '+d0.d.toFixed(1)+' → '+d1.d.toFixed(1)+' pt');
    await h.wait(450); check(await h.ev(function(){ return SVX._pts().length===0; }), 'số 0 đã tan vào khe');
    var t0=Date.now(); await h.tap('.svc'); var b0=await near(sy); check(await h.waitStep('pm', 600), 'Khách đồng ý → sang ngay ('+(Date.now()-t0)+' ms)');
    check(await h.ev(function(){ return document.querySelectorAll('.svfly,.svdotf,.svzf,.svedge,.sv-bill.torn').length===0; }), 'không lớp bay, không xé');
    await h.wait(900);
    var b1=await h.ev(function(){ var G=SVX._geo(), P=SVX._pts(), m=0; P.forEach(function(q){ m+=Math.hypot(q[0]-G.cx, (q[1]-G.cy)/1.3068); }); return P.length ? m/P.length/G.rx : 0; });
    check(b0.n>0 && b0.d<60 && b1>0.85, 'lịch thu dựng lên từ khe: cách khe '+b0.d.toFixed(1)+' pt → vòng '+b1.toFixed(2)+' rx');
  });
  await run('T5', 'Họ tên: số 0 nghiêng thành gạch dưới Acid · Tiếp luôn hiện, kể cả khi bàn phím mở · Tiếp → Xong tại chỗ, hàng điều hướng trượt theo bàn phím · thẻ VietQR mở như reel v10', async function(){
    await h.tap('.sv-r[data-i="1"]'); await h.waitStep('pf'); await h.wait(250); await h.tap('.sv-r[data-i="0"]'); await h.wait(30);
    var u=await h.ev(function(s){ var ul=document.querySelector(s+' .sv-ul'), a=ul.getAnimations()[0], r=ul.getBoundingClientRect(), y=r.top+r.height/2, P=SVX._pts(), m=0; P.forEach(function(q){ m+=Math.abs(q[1]-y); });
      return {line:SVX._line(), k:a ? a.effect.getKeyframes().map(function(f){ return f.computedOffset+':'+f.opacity; }).join(' ') : '', y:y, d:P.length ? m/P.length : 0}; }, nowPg());
    check(u.line>=24 && /^0:0 0\.68:0 1:1$/.test(u.k), 'số 0 nghiêng thành gạch dưới, gạch thật hiện khi hạt tan vào: '+JSON.stringify(u));
    await h.wait(220); var u2=await h.ev(function(y){ var P=SVX._pts(), m=0; P.forEach(function(q){ m+=Math.abs(q[1]-y); }); return P.length ? m/P.length : 0; }, u.y);
    check(u2<u.d*.4, 'hạt dồn về gạch dưới: '+u.d.toFixed(1)+' → '+u2.toFixed(1)+' pt');
    await h.waitStep('name'); await h.wait(300);
    var a=await h.ev(function(s){ var c=document.querySelector(s+' .sv-tiep'), cs=getComputedStyle(c); return {foc:!!document.activeElement && document.activeElement.id==='sv-in', vis:cs.visibility, op:cs.opacity, away:c.classList.contains('away'), off:c.classList.contains('off'), w:Math.round(c.getBoundingClientRect().width), line:SVX._pts().length}; }, nowPg());
    check(a.foc && a.vis==='visible' && +a.op>.95 && !a.away && a.off && a.w===225, 'ô nhập đang focus mà Tiếp vẫn hiện, xám khi chưa có tên: '+JSON.stringify(a));
    check(a.line===0, 'số 0 đã tan vào gạch dưới');
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
    await h.tap('.svc'); await h.wait(100);
    var a=await h.ev(function(){ return SVX._idle(); }); check(a.qra && a.lock===2, 'chấm mã đang thu, chặn chạm đúp: '+JSON.stringify(a));
    await h.wait(400);
    var e=await h.ev(function(){ var z=document.querySelector('.svzf'), sv=document.querySelector('#h-sell svg'); if(!z) return {s:state.screen, z:0};
      var an=z.getAnimations()[0], kf=an ? an.effect.getKeyframes() : [], last=kf.length ? kf[kf.length-1].transform : '', m=/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(last||'');
      var L=parseFloat(z.style.left), T=parseFloat(z.style.top), W=parseFloat(z.style.width), H=parseFloat(z.style.height);
      return {s:state.screen, z:document.querySelectorAll('.svzf').length, use:z.querySelector('use').getAttribute('href'), chip:getComputedStyle(sv).visibility, end:m ? [L+ +m[1], T+ +m[2], W*m[3], H*m[3]] : null}; });
    check(e.s==='p-home' && e.z===1 && e.use==='#i-zero' && e.chip==='hidden', 'đã về trang chủ, chữ 0 đang bay (chữ 0 của nút ẩn tới lúc hạ cánh): '+JSON.stringify(e));
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
  await run('T10', 'thẻ → giá trị phải trả: số 0 lớn lên một lượt, không nảy · lò xo của số 0 gần tới hạn (vượt < 2 %) · tiền mặt: số 0 hít vào rồi tan, THANH TOÁN giữ chỗ', async function(){
    async function over(ms){ var m=0, t0=Date.now(); while(Date.now()-t0<ms){ m=Math.max(m, await h.ev(function(){ return SVX._over(); })); await h.wait(10); } return m; }
    await h.toPkg('1:1',[1,2],[2,2],36); await h.waitStep('deal'); await h.tap('.svc'); await h.waitStep('bill'); await h.wait(300);
    await h.tap('.svc'); await h.waitStep('pm'); await h.tap('.sv-r[data-i="0"]'); await h.waitStep('pf'); await h.wait(300);
    await h.tap('.sv-r[data-i="2"]'); check(await h.waitStep('card'), 'sang loại thẻ'); var m1=await over(500);
    check(m1<0.02, 'Hình thức trả → Loại thẻ: vượt '+(m1*100).toFixed(2)+' %');
    await h.tap('.sv-r[data-i="1"]'); var m2=await over(800); check(await h.waitStep('val'), 'sang giá trị phải trả');
    check(m2<0.001, 'Loại thẻ → Giá trị phải trả: không nảy (vượt '+(m2*100).toFixed(3)+' %)');
    await h.tap('.svb'); await h.waitStep('card'); await h.wait(300); await h.tap('.svb'); await h.waitStep('pf'); await h.wait(300);
    var lb=await h.ev(function(){ var k=document.querySelector('#sv-ctr .ly:not(.out) .k .lb'); return k ? k.textContent : ''; });
    await h.tap('.sv-r[data-i="1"]'); await h.waitStep('val');
    var c=await h.ev(function(){ var ly=document.querySelector('#sv-ctr .ly:not(.out)'); return {flp:!!(ly && ly.classList.contains('flp')), lb:ly ? (ly.querySelector('.lb')||{}).textContent : '', n:SVX._pts().length}; });
    check(lb==='THANH TOÁN' && c.flp && c.lb==='THANH TOÁN' && c.n>0, 'tiền mặt: nhãn THANH TOÁN giữ chỗ, số 0 đang tan: '+JSON.stringify(c));
    await h.wait(450); check(await h.ev(function(){ return SVX._pts().length===0; }), 'số 0 đã tan (0,32 s)');
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
        return {top:g.cy-g.rx*1.3068, bot:g.cy+g.rx*1.3068, hb:hd.bottom, at:ar?ar.top:null, nb:nav.bottom, vh:innerHeight, over:over.slice(0,3)}; });
        check(r.nb<=r.vh+0.5, tag+': nav trong màn '+JSON.stringify(r)); check(!r.over.length, tag+': tràn ngang '+r.over.join(','));
        if(r.at!=null && tag!=='bill') check(r.top>r.hb+10 && r.bot<r.at-10, tag+': số 0 nằm trong khoảng trống '+JSON.stringify(r)); }
      await hx.toPkg('1:1',[1,2],[2,2]); await fit('pk'); await hx.tap('.sv-r[data-i="0"]'); await hx.waitStep('deal'); await hx.wait(300); await fit('deal');
      var sm=await hx.ev(function(){ return SVX._small(); }); check(vp.height<=667 ? sm : !sm, 'số 0 '+(sm?'tắt':'giữ')+' ở màn ưu đãi '+vp.width+'×'+vp.height);
      var ov=await hx.ev(function(){ var l=document.querySelector('#sv-ctr .ly:not(.out)'), mx=0; [].forEach.call(l.querySelectorAll('.k>*'), function(c){ var b=c.getBoundingClientRect(); mx=Math.max(mx, b.right); }); return mx<=innerWidth; }); check(ov, 'số ở tâm không tràn màn');
      await hx.tap('.svc'); await hx.waitStep('bill'); await hx.wait(800); await fit('bill');
      var b=await hx.ev(function(){ var s=document.querySelector('.page.sv.on .sv-bill').getBoundingClientRect(), hd=document.querySelector('.page.sv.on .head').getBoundingClientRect(); return {t:s.top, hb:hd.bottom}; });
      check(b.t>b.hb+8, 'đầu phiếu không khuất dưới tiêu đề (màn thấp: phiếu gọn .tight): '+JSON.stringify(b));
      await hx.tap('.svc'); await hx.waitStep('pm'); await fit('pm'); await hx.tap('.sv-r[data-i="1"]'); await hx.waitStep('pf'); await hx.wait(200); await fit('pf');
      await hx.tap('.sv-r[data-i="2"]'); await hx.waitStep('card'); await hx.wait(300); await fit('card');
      await shot(px,'R'+vp.width+'-card');
      await hx.tap('.sv-r[data-i="1"]'); await hx.waitStep('val'); await hx.wait(500); await shot(px,'R'+vp.width+'-val');
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
  });
  await cr.close();

  await browser.close(); srv.close();
  var fail=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-fail)+'/'+RES.length+' PASS · PAGEERR '+PAGEERR.length+(PAGEERR.length?'\n'+PAGEERR.join('\n'):''));
  process.exit(fail||PAGEERR.length ? 1 : 0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

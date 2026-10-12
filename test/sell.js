/* Bán cho khách mới (v2.9.0 · sell.js) — Playwright, Chromium, iPhone 393×852 dpr2 touch + 375×667 / 430×932 + giảm chuyển động.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/sell.js
   - Bộ tính (Node, không trình duyệt): trần ưu đãi, đơn giá, thời hạn, chia kỳ, phí quẹt, nội dung chuyển khoản, VietQR, mã QR.
   - DEMO (?demo): luồng đầy đủ 1:1 (chuyển khoản · thẻ · tiền mặt), lùi từng bước giữ lựa chọn, gói 12 bỏ ưu đãi, gói 48 chia 3 kỳ lệch,
     1:2 hai khách hai mã, gói 72 vòng tặng thứ hai, tâm số gọn khi số 0 nhỏ.
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
  h.ctr=function(){ return page.evaluate(function(){ var l=document.querySelector('#sv-ctr .ly:not(.out)'); return l ? [].map.call(l.children, function(k){ return k.textContent.replace(/\s+/g,' ').trim(); }).join(' ') : ''; }); };
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
    check(!(await h.ev(function(){ return !!document.querySelector('.page.sv.on .sv-dot.on'); })), 'chưa chọn → chưa có chấm Acid dưới số');
    var px=await h.ev(function(){ var c=document.getElementById('sv-dial'), g=SVX._geo(), k=c.width/c.clientWidth, d=c.getContext('2d').getImageData(Math.round(g.cx*k)-2, Math.round(g.cy*k)-2, 4, 4).data; return [d[0],d[1],d[2],d[3]]; });
    check(px[1]>200 && px[0]>150 && px[2]<80, 'chấm Acid ở tâm: '+px);
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-nav button').length; })===1, 'câu 01 chỉ có ⌂');
    await shot(page,'A-q1');
  });
  await run('B', 'câu 02 kéo 3 → 4 · câu 03 · gói khớp', async function(){
    await h.tap('.sv-n[data-i="0"]'); check(await h.waitStep('q2'), 'sang q2');
    await h.drag('.sv-n[data-i="1"]', '.sv-n[data-i="2"]');
    check(JSON.stringify((await h.st()).f)==='[3,4]', 'tần suất 3–4: '+JSON.stringify((await h.st()).f));
    check((await h.ctr())==='MỖI THÁNG 12–16 BUỔI', 'tâm: '+(await h.ctr()));
    var dim=await h.ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on .sv-n'), function(b){ return b.classList.contains('dim')?1:0; }).join(''); }); check(dim==='1001', 'mờ ngoài khoảng: '+dim);
    var cap=await h.ev(function(){ var d=document.querySelector('.page.sv.on .sv-dot'), r=d.getBoundingClientRect(); return {w:r.width, on:d.classList.contains('on')}; }); check(cap.on && cap.w>60, 'viên con nhộng giãn qua 2 số: '+JSON.stringify(cap));
    check(await h.waitStep('q3'), 'nhả tay → q3');
    await h.wait(700); var d=await h.ev(function(){ return SVX._dots(); }); check(d.p===12 && d.o===4, 'q2: 4 tuần × 3 hạt + 4 hạt rỗng làn ngoài: '+JSON.stringify(d));
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
    var tk=await h.ev(function(){ var s=document.querySelector('.page.sv.on .sv-sl'); return s.querySelector('.tk').getBoundingClientRect().width/s.getBoundingClientRect().width; }); check(Math.abs(tk-1/3)<0.01, 'rãnh còn 1/3: '+tk);
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
    await h.tap('.svc'); check(await h.waitStep('bill'), 'sang phiếu'); await h.wait(700);
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
    await page.keyboard.press('Enter'); check(await h.waitStep('qr'), 'Tiếp → mã QR'); await h.wait(500);
    check((await h.txt(h.cur+'.sv-amt'))==='7.200.000₫', 'số tiền kỳ 1'); check((await h.txt(h.cur+'.sv-mm'))==='N Q VINH 36B TRA GOP', 'nội dung trên thẻ');
    check((await h.ev(function(){ return SVX._qr(); }))==='B0DY DEMO KHONG CHUYEN KHOAN', 'demo: mã không phải lệnh chuyển tiền');
    check(+(await h.ev(function(){ return document.getElementById('sv-qrc').dataset.v; }))>=9, 'mã đã vẽ');
    check((await h.txt(h.cur+'.svc'))==='Xong', 'nút Xong'); check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-nav button').length; })===2, 'màn QR: ← · Xong (ghost giữ chỗ)');
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
    await h.tap('.sv-r[data-i="1"]'); await h.wait(100); check((await h.ctr())==='PHÍ QUẸT THẺ 1,815%', 'tâm phí: '+(await h.ctr()));
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
    await h.waitStep('pf'); await h.tap('.sv-r[data-i="0"]'); await page.keyboard.type('Trần Thị Bích Ngọc'); await page.keyboard.press('Enter'); await h.waitStep('qr'); await h.wait(300);
    check((await h.txt(h.cur+'.sv-amt'))==='5.918.000₫', 'kỳ 1 = 5.918.000'); check((await h.txt(h.cur+'.sv-mm'))==='T T B NGOC 48B TRA GOP', 'nội dung: '+(await h.txt(h.cur+'.sv-mm')));
    await h.tap('.svc'); await h.wait(500);
  });
  await run('K', '1:2 · gói 72 vòng tặng thứ hai · hai khách hai mã', async function(){
    await h.toPkg('1:2',[1,1],[0,4]); await h.wait(300);
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on:not(.leave-fwd) .sv-r').length; })===5, '3 buổi × 1–6 tháng → 5 gói');
    check(await h.ev(function(){ return document.querySelector('.page.sv.on:not(.leave-fwd) .sv-rows').classList.contains('S'); }), '≥ 3 gói → hàng Nhỏ');
    check(await h.ev(function(){ return !!document.querySelector('#sv-ctr .ly:not(.out) .n44'); }), 'số 0 nhỏ → tâm dùng cỡ gọn (không đè hạt)');
    await h.tap('.sv-r[data-i="4"]'); await h.waitStep('deal');
    check(await h.ev(function(){ return document.querySelectorAll('.page.sv.on .sv-g').length; })===7, 'gói 72: 7 vòng');
    await h.tap('.sv-g[data-k="3"]'); await h.wait(450);
    check((await h.ctr())==='ĐƠN GIÁ SAU ƯU ĐÃI 240.000₫ Σ 18.000.000 ₫ / 75 BUỔI', 'giá mỗi người: '+(await h.ctr()));
    var d=await h.ev(function(){ return SVX._dots(); }); check(d.a===6 && d.o===8, '1:2 · hai số 0: 2 × 3 hạt tặng ở vòng hai + 2 × 4 rỗng: '+JSON.stringify(d));
    await h.tap('.svc'); await h.waitStep('bill'); await h.wait(300);
    check((await h.txt(h.cur+'.sv-bill .pk'))==='GÓI 72 BUỔI · 1:2', 'phiếu ghi 1:2'); check((await h.txt(h.cur+'.sv-bill .tl'))==='THANH TOÁN · MỖI NGƯỜI', 'thanh toán mỗi người');
    await h.tap('.svc'); check(await h.waitStep('pf'), 'gói 72 không trả góp'); await h.tap('.sv-r[data-i="0"]');
    check((await h.txt(h.cur+'.t1'))==='Họ tên khách 1?', 'khách 1');
    await page.keyboard.type('Lê Văn An'); await page.keyboard.press('Enter'); await h.waitStep('qr'); await h.wait(200);
    check((await h.txt(h.cur+'.svc'))==='Tiếp', 'mã khách 1 → Tiếp'); check((await h.txt(h.cur+'.sv-mm'))==='LE VAN AN 72B', 'nội dung khách 1');
    await h.tap('.svc'); check(await h.waitStep('name'), 'sang khách 2'); check((await h.txt(h.cur+'.t1'))==='Họ tên khách 2?', 'tiêu đề khách 2');
    check(await h.ev(function(){ return document.activeElement && document.activeElement.id==='sv-in'; }), 'focus ô họ tên khách 2');
    await page.keyboard.type('Phạm Thu Hà'); await page.keyboard.press('Enter'); await h.waitStep('qr'); await h.wait(200);
    check((await h.txt(h.cur+'.sv-mm'))==='PHAM THU HA 72B', 'nội dung khách 2'); check((await h.txt(h.cur+'.svc'))==='Xong', 'khách 2 → Xong');
    check((await h.txt(h.cur+'.sv-amt'))==='18.000.000₫', 'mỗi người 18.000.000');
    await h.tap('.svb'); await h.waitStep('name'); await h.wait(250); await h.tap('.svb'); await h.waitStep('qr'); await h.wait(150);
    check((await h.txt(h.cur+'.sv-mm'))==='LE VAN AN 72B', 'lùi về mã khách 1');
    await h.tap('.svb'); await h.waitStep('name'); await h.wait(250); await h.tap('.svh'); await h.wait(400);
  });
  await run('L', 'Tên rỗng không sang mã · ← ở câu 02 giữ khoảng', async function(){
    await h.toPkg('1:1',[1,1],[2,2],36); await h.waitStep('deal'); await h.tap('.svc'); await h.waitStep('bill'); await h.wait(250); await h.tap('.svc'); await h.waitStep('pm'); await h.tap('.sv-r[data-i="0"]'); await h.waitStep('pf');
    check((await h.ctr())==='THANH TOÁN 14,4TR', 'trả một lần: '+(await h.ctr()));
    await h.tap('.sv-r[data-i="0"]'); await h.wait(150); check((await h.txt('#sv-memo'))==='36B', 'một lần → không TRA GOP');
    /* bàn phím hệ thống 336 pt: hàng điều hướng đi lên, cách mép bàn phím 12 pt (Figma 811:499) — giả lập visualViewport */
    var kb=await h.ev(function(){ var real=Object.getOwnPropertyDescriptor(Window.prototype,'visualViewport')||null;
      Object.defineProperty(window,'visualViewport',{configurable:true, value:{height:innerHeight-336, offsetTop:0, addEventListener:function(){}}});
      SVX._kb(); var nav=document.querySelector('.page.sv.on .sv-nav'), r=nav.getBoundingClientRect(), t=nav.style.transform;
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
    await pm.keyboard.type('Nguyễn Quang Vinh'); await pm.keyboard.press('Enter'); await hm.waitStep('qr'); await hm.wait(400);
    check(SRV.calls>=1 && SRV.last && SRV.last.pin==='1234', 'gọi bank kèm PIN coach'); check(SRV.last && !SRV.last.apin, 'không gửi PIN admin');
    var got=await hm.ev(function(){ return SVX._qr(); }), exp=SVE.vietqr('970407','0123456789',7200000,'N Q VINH 36B TRA GOP');
    check(got===exp, 'payload VietQR: '+got);
    check((await hm.txt(hm.cur+'#sv-bank'))==='TECHCOMBANK · HO KINH DOANH B0DY STUDIO', 'dòng ngân hàng: '+(await hm.txt(hm.cur+'#sv-bank')));
    check(JSON.parse(await hm.ev(function(){ return localStorage.getItem('lb_bank'); })).acc==='0123456789', 'nhớ tài khoản vào máy');
    await shot(pm,'M-qr'); await hm.tap('.svc'); await hm.wait(400);
  });
  await run('N', 'chưa cài tài khoản → không vẽ mã, báo lỗi; mất mạng → dùng bản đã nhớ', async function(){
    SRV.bank={ok:false, error:'no_bank'}; await hm.ev(function(){ SVX._bank(null); });
    await hm.toPkg('1:1',[1,1],[2,2],36); await hm.waitStep('deal'); await hm.tap('.svc'); await hm.waitStep('bill'); await hm.wait(250);
    await hm.tap('.svc'); await hm.waitStep('pm'); await hm.tap('.sv-r[data-i="0"]'); await hm.waitStep('pf'); await hm.tap('.sv-r[data-i="0"]');
    await pm.keyboard.type('Vũ An'); await pm.keyboard.press('Enter'); await hm.waitStep('qr'); await hm.wait(700);
    check((await hm.txt(hm.cur+'#sv-qe'))==='CHƯA CÓ TÀI KHOẢN NHẬN', 'thông báo trong thẻ'); check(await hm.ev(function(){ return document.getElementById('sv-qrc').hidden; }), 'không vẽ mã');
    check((await hm.ev(function(){ return document.getElementById('pill').textContent; })).indexOf('Chưa cài tài khoản nhận')>=0, 'pill lỗi');
    check(await hm.ev(function(){ return localStorage.getItem('lb_bank'); })===null, 'xoá bản nhớ khi máy chủ báo chưa cài');
    await hm.tap('.svc'); await hm.wait(400);
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
      await hx.tap('.svc'); await hx.waitStep('bill'); await hx.wait(600); await fit('bill');
      var b=await hx.ev(function(){ var s=document.querySelector('.page.sv.on .sv-bill').getBoundingClientRect(), hd=document.querySelector('.page.sv.on .head').getBoundingClientRect(); return {t:s.top, hb:hd.bottom}; });
      check(b.t>b.hb+8, 'đầu phiếu không khuất dưới tiêu đề (màn thấp: phiếu gọn .tight): '+JSON.stringify(b));
      await hx.tap('.svc'); await hx.waitStep('pm'); await fit('pm'); await hx.tap('.sv-r[data-i="1"]'); await hx.waitStep('pf'); await hx.wait(200); await fit('pf');
      await hx.tap('.sv-r[data-i="2"]'); await hx.waitStep('card'); await hx.wait(300); await fit('card');
      await shot(px,'R'+vp.width+'-card');
      await hx.tap('.sv-r[data-i="1"]'); await hx.waitStep('val'); await hx.wait(500); await shot(px,'R'+vp.width+'-val');
      await hx.tap('.svb'); await hx.waitStep('card'); await hx.wait(300); await hx.tap('.svb'); await hx.waitStep('pf'); await hx.wait(300); await hx.tap('.sv-r[data-i="0"]');
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

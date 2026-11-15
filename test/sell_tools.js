/* CÔNG CỤ TÍNH trong luồng Bán cho khách mới (v2.25.0) — chế độ ?demo, máy chủ giả của app.
   Kiểm: nút Công cụ chỉ hiện với Admin ở chỗ trống đối diện nút ⌂ · danh sách 3 công cụ · hết hạn hợp đồng (mặc định hôm nay,
   gõ lại ngày, ngày không có thật, HÔM NAY) · phí quẹt thẻ hai chiều · mã QR nhận tiền (số tiền + nội dung tuỳ chọn, chuỗi VietQR
   đúng chuẩn EMVCo) · Xong về danh sách và ← về màn đầu · bố cục 375 / 393 / 430 không đè nav, không chồng kết quả, không cắt chữ.
   Số tài khoản trong file này là SỐ GIẢ (repo công khai) — tài khoản thật chỉ nằm trong Script Properties.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/sell_tools.js */
var {chromium}=require('playwright'); var serve=require('./serve'); var path=require('path'); var fs=require('fs');
var CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', PORT=+process.env.PORT||19344, OUT=path.join(__dirname,'out_tools');
var A_PIN='0000';                                        /* PIN admin của máy chủ giả trong app.js (?demo) */
var BANK={bin:'970407', acc:'19001234567890', bank:'TECHCOMBANK', name:'B0DY STUDIO'};   /* tài khoản GIẢ, chỉ để test chuỗi VietQR */
var SVE=require(path.join(__dirname,'..','sell.js')).SVE;
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});

var RES=[], CUR=null, PAGEERR=[];
function check(c, msg){ if(!c) CUR.fails.push(msg); return !!c; }
var ONLY=(process.env.ONLY||'').split(',').filter(Boolean);
async function run(id, name, fn){ if(ONLY.length && ONLY.indexOf(id)<0) return; CUR={id:id,name:name,fails:[]}; RES.push(CUR);
  try{ await fn(); }catch(e){ CUR.fails.push('EXC '+String(e&&e.message||e).split('\n').slice(0,6).join(' | ')); }
  console.log((CUR.fails.length?'FAIL ':'PASS ')+id+' '+name+(CUR.fails.length?'\n   - '+CUR.fails.join('\n   - '):'')); }

/* hôm nay theo máy chạy test — mặc định của ô "Ngày bắt đầu" */
function today(){ var d=new Date(); return ('0'+d.getDate()).slice(-2)+('0'+(d.getMonth()+1)).slice(-2)+d.getFullYear(); }

(async function(){
  var srv=await serve(PORT), browser=await chromium.launch({executablePath:CHROME});
  async function mk(vp){
    var ctx=await browser.newContext({viewport:vp||{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ip:'203.0.113.7'})}); });
    var page=await ctx.newPage(); page.on('pageerror', function(e){ PAGEERR.push(String(e)); });
    return {ctx:ctx, page:page};
  }
  var C=await mk(), page=C.page;
  var w=function(ms){ return page.waitForTimeout(ms); };
  var ev=function(fn,a){ return page.evaluate(fn,a); };
  var txt=async function(s){ return (await ev(function(s){ var e=document.querySelector(s); return e?e.textContent.trim():null; }, s))||''; };
  var screen=function(id,t){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:t||8000}); };
  var step=function(s,t){ return page.waitForFunction(function(s){ return window.SVX && SVX._step()===s; }, s, {timeout:t||8000}); };
  var cur=function(){ return ev(function(){ var p=document.querySelector('.page.sv.on'); return p?p.id:''; }); };
  async function pin(p){ for(var k of p) await page.click('#pin-pad button:has-text("'+k+'")'); }
  async function shot(n){ await page.screenshot({path:path.join(OUT,n+'.png')}); }
  /* bấm một phím của bàn số trên trang .sv đang hiện */
  async function key(k){ await page.click('.page.sv.on .sv-pad .key[data-k="'+k+'"]'); }
  async function keys(s){ for(var c of s) await key(c); }
  async function cell(f){ await page.click('.page.sv.on .sv-tg .mt[data-f="'+f+'"]'); }
  var cellTxt=function(f){ return ev(function(f){ var e=document.querySelector('.page.sv.on .sv-tg .mt[data-f="'+f+'"] .v span'); return e?e.textContent:''; }, f); };
  var amtTxt=function(){ return ev(function(){ var e=document.querySelector('.page.sv.on .sv-tg .mt .v span'); return e?e.textContent:''; }); };
  var cellBad=function(f){ return ev(function(f){ var e=document.querySelector('.page.sv.on .sv-tg .mt[data-f="'+f+'"]'); return !!e && e.classList.contains('bad'); }, f); };
  /* chữ thật của một hàng số ở tâm (data-k) */
  var ctrK=function(k){ return ev(function(k){ var e=document.querySelector('#sv-ctr .ly:not(.out) [data-k="'+k+'"]'); return e?e.textContent.trim():null; }, k); };
  /* số trong một cụm "số + đơn vị + nhãn" ở tâm */
  var ctrNum=function(k){ return ev(function(k){ var e=document.querySelector('#sv-ctr .ly:not(.out) [data-k="'+k+'"] .m14'); return e?e.textContent.trim():null; }, k); };
  var ctrUnit=function(k){ return ev(function(k){ var e=document.querySelector('#sv-ctr .ly:not(.out) [data-k="'+k+'"]'); if(!e) return null;
    return [].map.call(e.children, function(c){ return c.className+':'+c.textContent.trim(); }).join('|'); }, k); };
  var ctrAll=function(){ return ev(function(){ return window.SVX ? SVX._ctr() : ''; }); };
  /* mở luồng bán rồi vào danh sách công cụ */
  async function openTools(){
    await page.click('#h-sell'); await step('q1'); await w(700);
    await page.click('.page.sv.on .sv-nav .svt'); await step('tx'); await w(700);
  }
  /* bố cục: bàn số / khối trả lời không đè hàng điều hướng, kết quả ở tâm không chồng khối trả lời, chữ trong ô không bị cắt */
  var layout=function(){ return ev(function(){
    var pg=document.querySelector('.page.sv.on'), ans=pg.querySelector('.sv-ans'), nav=pg.querySelector('.sv-nav'),
        ly=document.querySelector('#sv-ctr .ly:not(.out)'), o={};
    o.gap=ans && nav ? Math.round(nav.getBoundingClientRect().top-ans.getBoundingClientRect().bottom) : null;
    if(ly){ var b=1e9, t=-1e9; [].forEach.call(ly.children, function(k){ var r=k.getBoundingClientRect(); if(r.height){ b=Math.min(b,r.top); t=Math.max(t,r.bottom); } });
      o.ctrTop=Math.round(b); o.ctrBot=Math.round(t); }
    o.ansTop=ans?Math.round(ans.getBoundingClientRect().top):null;
    o.headBot=Math.round(pg.querySelector('.head').getBoundingClientRect().bottom);
    o.clip=[].slice.call(pg.querySelectorAll('.sv-tg .mt .v span, .sv-tg .mt .h span, .sv-r .t, .sv-r .sub')).filter(function(e){ return e.scrollWidth>e.clientWidth+1; }).length;
    o.padBot=(function(){ var p=pg.querySelector('.sv-pad'); return p?Math.round(p.getBoundingClientRect().bottom):null; })();
    o.navTop=nav?Math.round(nav.getBoundingClientRect().top):null;
    return o; }); };

  await page.goto('http://localhost:'+PORT+'/?demo'); await screen('p-pin'); await w(500);

  await run('T1', 'Nút Công cụ: chỉ Admin thấy, ở chỗ trống đối diện nút ⌂ của màn đầu luồng bán', async function(){
    /* coach trước: chỗ đó phải là ghost giữ chỗ, không có nút */
    await pin('1234'); await screen('p-home'); await w(1200);
    await page.click('#h-sell'); await step('q1'); await w(700);
    check(!(await ev(function(){ return !!document.querySelector('.page.sv.on .sv-nav .svt'); })), 'coach KHÔNG được thấy nút Công cụ');
    check((await ev(function(){ return !!document.querySelector('.page.sv.on .sv-nav .gh0'); })), 'coach: chỗ đó là ghost giữ chỗ');
    await page.click('.page.sv.on .sv-nav .svh'); await screen('p-home'); await w(600);
    await ev(function(){ logout(); }); await screen('p-pin'); await w(400);
    /* Admin */
    await pin(A_PIN); await screen('p-home'); await w(1500);
    check((await txt('#h-name'))==='Admin', 'đăng nhập Admin: '+(await txt('#h-name')));
    await page.click('#h-sell'); await step('q1'); await w(700);
    var g=await ev(function(){ var n=document.querySelector('.page.sv.on .sv-nav'), b=n.querySelector('.svt'), h=n.querySelector('.svh');
      if(!b||!h) return null; var rb=b.getBoundingClientRect(), rh=h.getBoundingClientRect(), rn=n.getBoundingClientRect();
      return {left:Math.round(rb.left-rn.left), right:Math.round(rn.right-rh.right), sameRow:Math.abs(rb.top-rh.top)<1, lbl:b.getAttribute('aria-label'), icon:(b.querySelector('use')||{}).getAttribute?b.querySelector('use').getAttribute('href'):''};
    });
    check(g, 'Admin thấy nút Công cụ ở màn đầu');
    if(g){ check(g.left===0 && g.right===0 && g.sameRow, 'nút Công cụ sát mép trái, đối diện nút ⌂ cùng hàng: '+JSON.stringify(g));
      check(g.lbl==='Công cụ tính' && g.icon==='#i-calc24', 'nhãn + icon: '+g.lbl+' '+g.icon); }
    await shot('t1-q1-admin');
  });

  await run('T2', 'Danh sách công cụ: 3 hàng, giữ nguyên đám mây hạt của màn đầu, ← về lại màn đầu', async function(){
    var dots0=await ev(function(){ return SVX._dots(); });
    await page.click('.page.sv.on .sv-nav .svt'); await step('tx'); await w(800);
    var rows=await ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on .sv-r'), function(r){ return [r.querySelector('.t').textContent.trim(), (r.querySelector('.sub')||{}).textContent||'']; }); });
    check(rows.length===3, 'đúng 3 công cụ: '+rows.length);
    check(rows[0][0]==='Hết hạn hợp đồng' && rows[1][0]==='Mã QR nhận tiền' && rows[2][0]==='Phí quẹt thẻ', 'tên 3 công cụ: '+JSON.stringify(rows.map(function(r){return r[0];})));
    check(rows.every(function(r){ return /[A-ZÀ-Ỹ0-9]/.test(r[1]); }), 'mỗi hàng có nhãn mono phụ: '+JSON.stringify(rows.map(function(r){return r[1];})));
    var dots1=await ev(function(){ return SVX._dots(); });
    check(JSON.stringify(dots0)===JSON.stringify(dots1), 'đám mây hạt giữ nguyên (liền mạch từ màn đầu): '+JSON.stringify(dots0)+' → '+JSON.stringify(dots1));
    check((await txt('.page.sv.on .head .t1'))==='Công cụ', 'tiêu đề: '+(await txt('.page.sv.on .head .t1')));
    var L=await layout(); check(L.clip===0, 'không cắt chữ hàng nào (cắt: '+L.clip+')');
    await shot('t2-menu');
    await page.click('.page.sv.on .sv-nav .svb'); await step('q1'); await w(600);
    check((await txt('.page.sv.on .head .t1'))==='Hình thức tập?', '← từ danh sách về màn đầu luồng bán: '+(await txt('.page.sv.on .head .t1')));
  });

  await run('T3', 'Hết hạn hợp đồng: mặc định hôm nay + 12 tuần · gõ lại ngày · ngày không có thật · HÔM NAY', async function(){
    await page.click('.page.sv.on .sv-nav .svt'); await step('tx'); await w(600);
    await page.click('.page.sv.on .sv-r:has-text("Hết hạn hợp đồng")'); await step('txw'); await w(900);
    var t=today(), E=SVE.expiry(+t.slice(0,2), +t.slice(2,4), +t.slice(4), 12);
    check((await cellTxt('ds'))===t.slice(0,2)+'.'+t.slice(2,4)+'.'+t.slice(4), 'ô ngày mặc định = hôm nay: '+(await cellTxt('ds')));
    check((await cellTxt('ws'))==='12', 'ô số tuần mặc định 12: '+(await cellTxt('ws')));
    check((await ctrK('exp'))===SVE.dmy(E), 'kết quả mặc định: '+(await ctrK('exp'))+' (chờ '+SVE.dmy(E)+')');
    check((await ctrK('sub'))===E.wd+' · 84 NGÀY', 'dòng phụ: '+(await ctrK('sub')));
    await shot('t3a-default');
    /* gõ lại ngày: phím số đầu tiên xoá giá trị cũ (ô đang được nạp sẵn), đủ 8 số tự sang ô số tuần */
    await cell('ds'); await keys('15112026'); await w(300);
    check((await cellTxt('ds'))==='15.11.2026', 'gõ lại ngày: '+(await cellTxt('ds')));
    check((await ev(function(){ return SVX._tx().fld; }))==='ws', 'đủ 8 số → tự sang ô số tuần');
    await keys('12'); await w(400);
    check((await ctrK('exp'))==='07.02.2027' && (await ctrK('sub'))==='CHỦ NHẬT · 84 NGÀY', '15.11.2026 + 12 tuần = 07.02.2027 CHỦ NHẬT · 84 NGÀY → '+(await ctrK('exp'))+' / '+(await ctrK('sub')));
    await shot('t3b-15112026');
    /* 24 tuần (gói 72 buổi): chạm ô số tuần để gõ thay giá trị cũ; gõ tiếp mà không chạm thì NỐI THÊM như máy tính */
    await keys('4'); await w(300);
    check((await cellTxt('ws'))==='124', 'gõ tiếp không chạm ô → nối thêm: '+(await cellTxt('ws')));
    await cell('ws'); await keys('24'); await w(400);
    check((await cellTxt('ws'))==='24' && (await ctrK('exp'))==='02.05.2027' && /168 NGÀY$/.test(await ctrK('sub')), '15.11.2026 + 24 tuần = 02.05.2027 · 168 ngày → '+(await ctrK('exp'))+' / '+(await ctrK('sub')));
    /* ngày không có thật → kết quả "—" và ô đỏ, không bịa ngày 03.03 */
    await cell('ds'); await keys('31022026'); await w(400);
    check((await ctrK('exp'))==='—' && (await ctrK('sub'))==='NGÀY KHÔNG CÓ THẬT', 'ngày 31.02 → "—" + nói đúng chỗ sai: '+(await ctrK('exp'))+' / '+(await ctrK('sub')));
    check(await cellBad('ds'), 'ô ngày hiện sai (đỏ)');
    await shot('t3c-badday');
    /* HÔM NAY: trả ngày về hôm nay, con trỏ sang ô số tuần */
    await key('HÔM NAY'); await w(400);
    check((await cellTxt('ds'))===t.slice(0,2)+'.'+t.slice(2,4)+'.'+t.slice(4) && !(await cellBad('ds')), 'HÔM NAY trả ô ngày về hôm nay: '+(await cellTxt('ds')));
    check((await ev(function(){ return SVX._tx().fld; }))==='ws', 'HÔM NAY → con trỏ ở ô số tuần');
    /* xoá hết số tuần → chưa tính được, không hiện số rác */
    await cell('ws'); await key('⌫'); await key('⌫'); await key('⌫'); await w(300);
    check((await ctrK('exp'))==='—' && (await ctrK('sub'))==='NHẬP SỐ TUẦN', 'thiếu số tuần → "—" + nhắc đúng ô còn thiếu: '+(await ctrK('sub')));
    var L=await layout();
    check(L.padBot<=L.navTop, 'bàn số không đè hàng điều hướng (pad '+L.padBot+' ≤ nav '+L.navTop+')');
    check(L.ctrBot<=L.ansTop && L.ctrTop>=L.headBot, 'kết quả ở tâm nằm gọn giữa khối đỉnh và ô nhập ('+L.headBot+' ≤ '+L.ctrTop+'…'+L.ctrBot+' ≤ '+L.ansTop+')');
    check(L.clip===0, 'không cắt chữ (cắt: '+L.clip+')');
  });

  await run('T4', 'Xong ở công cụ → về danh sách công cụ; ← ở danh sách vẫn về màn đầu (lịch sử không lặp)', async function(){
    await page.click('.page.sv.on .sv-nav .svc'); await step('tx'); await w(700);
    check((await txt('.page.sv.on .head .t1'))==='Công cụ', 'Xong → danh sách công cụ: '+(await txt('.page.sv.on .head .t1')));
    await page.click('.page.sv.on .sv-nav .svb'); await step('q1'); await w(600);
    check((await txt('.page.sv.on .head .t1'))==='Hình thức tập?', '← một lần là về màn đầu, không quay lại công cụ');
  });

  await run('T5', 'Phí quẹt thẻ: 5 loại thẻ · hai chiều trên một màn (phòng nhận · phải quẹt để nhận đủ)', async function(){
    await page.click('.page.sv.on .sv-nav .svt'); await step('tx'); await w(600);
    await page.click('.page.sv.on .sv-r:has-text("Phí quẹt thẻ")'); await step('txc'); await w(800);
    var cards=await ev(function(){ return [].map.call(document.querySelectorAll('.page.sv.on .sv-r'), function(r){ return r.querySelector('.t').textContent.trim()+' '+(r.querySelector('.v b')||{}).textContent; }); });
    check(cards.length===SVE.CARDS.length, 'đủ '+SVE.CARDS.length+' loại thẻ: '+cards.length);
    check(/1,815/.test(cards[1]), 'thẻ thứ 2 là Quốc tế TCB 1,815 %: '+cards[1]);
    await shot('t5a-cards');
    await page.click('.page.sv.on .sv-r:nth-child(2)'); await step('txf'); await w(900);
    var f=SVE.CARDS[1].f;
    check((await ev(function(){ return SVX._tx().cf; }))===1, 'đã chọn thẻ thứ 2');
    await keys('5'); await key('000'); await key('000'); await w(400);
    check((await cellTxt('as'))==='5.000.000', 'ô số tiền: '+(await cellTxt('as')));
    check((await ctrK('net'))===SVE.vnd(SVE.netOf(5000000,f)), 'phòng nhận: '+(await ctrK('net'))+' (chờ '+SVE.vnd(SVE.netOf(5000000,f))+')');
    check((await ctrNum('fee'))==='− '+SVE.vnd(SVE.feeOf(5000000,f)), 'phí: '+(await ctrNum('fee')));
    check((await ctrNum('grs'))==='QUẸT '+SVE.vnd(SVE.gross(5000000,f)), 'chiều ngược (nhận đủ 5.000.000 thì quẹt): '+(await ctrNum('grs')));
    check((await ctrUnit('fee'))==='m14:− 90.750|m12:₫|lb:PHÍ 1,815 %', 'đơn vị vẫn là mono nhỏ màu xám đúng quy ước luồng: '+(await ctrUnit('fee')));
    check(/PHÍ 1,815 %/.test(await ctrAll()), 'có nhãn phần trăm phí: '+(await ctrAll()));
    await shot('t5b-fee');
    /* trần an toàn 10 chữ số (SVE.AMAX): trên đó phép nhân vượt 2^53 → gross lệch. Bàn số phải chặn, và lớp số phải thu
       lại cho vừa bề ngang trang */
    await cell('as'); await keys('9999999999'); await keys('77'); await key('000'); await w(400);   /* gõ quá trần: phím sau bị chặn */
    var over=await ev(function(){ var ly=document.querySelector('#sv-ctr .ly:not(.out)'), pg=document.querySelector('.page.sv.on');
      var W=pg.getBoundingClientRect(), bad=0; [].forEach.call(ly.querySelectorAll('span'), function(e){ var r=e.getBoundingClientRect(); if(r.width && (r.left<W.left-1 || r.right>W.right+1)) bad++; }); return bad; });
    check(over===0, 'số lớn nhất: không hàng nào tràn mép trang (tràn: '+over+')');
    check((await amtTxt())===SVE.vnd(SVE.AMAX), 'bàn số chặn đúng trần an toàn '+SVE.vnd(SVE.AMAX)+': '+(await amtTxt()));
    check((await ctrK('net'))===SVE.vnd(SVE.netOf(SVE.AMAX,f)), 'phòng nhận ở trần: '+(await ctrK('net')));
    check((await ctrNum('grs'))==='QUẸT '+SVE.vnd(SVE.gross(SVE.AMAX,f)), 'số phải quẹt ở trần: '+(await ctrNum('grs')));
    /* chưa nhập gì: không hiện số 0 vô nghĩa, số lớn không sáng Acid */
    await cell('as'); for(var b=0;b<10;b++) await key('⌫'); await w(300);
    check((await ctrK('net'))==='0' && (await ctrK('fee'))==='' && (await ctrK('grs'))==='', 'xoá hết: hai dòng phụ trống, không hiện "QUẸT 0"');
    check(!(await ev(function(){ return document.querySelector('#sv-ctr .ly:not(.out) [data-k=\"net\"]').classList.contains('ac'); })), 'chưa nhập thì số không sáng Acid');
    await keys('5'); await key('000'); await key('000'); await w(300);
    await shot('t5c-fee-ty');
    await page.click('.page.sv.on .sv-nav .svc'); await step('tx'); await w(700);
  });

  await run('T6', 'Mã QR nhận tiền: số tiền + nội dung tuỳ chọn → chuỗi VietQR đúng chuẩn EMVCo', async function(){
    await ev(function(b){ SVX._bank(b); }, BANK);                      /* tài khoản giả thay cho bản demo để dựng chuỗi thật */
    await page.click('.page.sv.on .sv-r:has-text("Mã QR nhận tiền")'); await step('txa'); await w(900);
    check((await ev(function(){ return document.querySelector('.page.sv.on .sv-nav .svc').classList.contains('off'); })), 'chưa nhập tiền → nút Tiếp xám');
    await keys('2'); await key('000'); await key('000'); await w(400);
    check(!(await ev(function(){ return !!document.querySelector('.page.sv.on .sv-tg'); })), 'màn số tiền không có ô nhập riêng — số đang gõ chính là số ở tâm (không lặp chữ của tiêu đề)');
    check((await ctrK('amt'))==='2.000.000' && (await ctrK('read'))==='2 TRIỆU', 'số ở tâm + dòng đọc: '+(await ctrK('amt'))+' / '+(await ctrK('read')));
    check((await ev(function(){ return SVX._tx().as; }))!=='2000000', 'công cụ QR dùng ô số tiền riêng, không dính số của công cụ phí thẻ');
    check(!(await ev(function(){ return document.querySelector('.page.sv.on .sv-nav .svc').classList.contains('off'); })), 'có tiền → nút Tiếp sáng');
    await shot('t6a-amount');
    await page.click('.page.sv.on .sv-nav .svc'); await step('txn'); await w(800);
    await page.fill('.page.sv.on #sv-in', 'Nguyễn Quang Vinh goi 36B'); await w(400);
    var mm=await txt('.page.sv.on #sv-memo');
    check(mm==='NGUYEN QUANG VINH GOI 36B' && mm.length<=25, 'nội dung không dấu, viết hoa, ≤ 25 ký tự: "'+mm+'" ('+mm.length+')');
    await shot('t6b-memo');
    await page.click('.page.sv.on .sv-nav .svc'); await step('txq'); await w(2200);
    var q=await ev(function(){ return SVX._qr(); });
    check(/^000201/.test(q), 'chuỗi EMVCo bắt đầu 000201: '+String(q).slice(0,16));
    check(q.indexOf(SVE.tlv('54','2000000'))>0, 'trường 54 = số tiền 2000000');
    check(q.indexOf(SVE.tlv('08', mm))>0, 'trường 08 = nội dung đã nhập');
    check(q.indexOf(BANK.acc)>0, 'có số tài khoản nhận');
    check(SVE.crc16(q.slice(0,-4))===q.slice(-4), 'CRC-16 đúng (máy quét đọc được): '+q.slice(-4));
    var qr=await ev(function(){ var c=document.querySelector('#sv-qrc'); return c ? {hidden:c.hidden, v:c.dataset.v, w:c.width} : null; });
    check(qr && !qr.hidden && +qr.v>=9 && qr.w>0, 'mã đã vẽ lên canvas: '+JSON.stringify(qr));
    check(/TECHCOMBANK/.test(await txt('.page.sv.on #sv-bank')), 'dòng tài khoản: '+(await txt('.page.sv.on #sv-bank')));
    await shot('t6c-qr');
    await page.click('.page.sv.on .sv-nav .svc'); await step('tx'); await w(800);
    check((await txt('.page.sv.on .head .t1'))==='Công cụ', 'Xong ở mã QR → về danh sách công cụ');
    await page.click('.page.sv.on .sv-nav .svb'); await step('q1'); await w(600);
    check((await txt('.page.sv.on .head .t1'))==='Hình thức tập?', '← về màn đầu');
  });

  await run('T8', 'Mọi tiêu đề công cụ gọn trong MỘT dòng (như mọi bước của luồng bán)', async function(){
    var H=[];
    for(var pair of [['svt','tx'],['.sv-r:has-text("Hết hạn hợp đồng")','txw']]){ }
    await page.click('.page.sv.on .sv-nav .svt'); await step('tx'); await w(600);
    async function seeT(){ return ev(function(){ var t=document.querySelector('.page.sv.on .head .t1');
      return {h:Math.round(t.getBoundingClientRect().height), s:SVX._step(), x:t.textContent.trim()}; }); }
    H.push(await seeT());
    for(var t of [['Hết hạn hợp đồng','txw'],['Mã QR nhận tiền','txa'],['Phí quẹt thẻ','txc']]){
      await page.click('.page.sv.on .sv-r:has-text("'+t[0]+'")'); await step(t[1]); await w(800); H.push(await seeT());
      if(t[1]==='txa'){ await keys('1'); await key('000'); await w(300); await page.click('.page.sv.on .sv-nav .svc'); await step('txn'); await w(700); H.push(await seeT());
        await page.click('.page.sv.on .sv-nav .svb'); await step('txa'); await w(600); }
      if(t[1]==='txc'){ await page.click('.page.sv.on .sv-r:nth-child(1)'); await step('txf'); await w(800); H.push(await seeT()); }
      await page.click('.page.sv.on .sv-nav .'+(t[1]==='txw'||t[1]==='txc'?'svc':'svb'));
      await step('tx', 9000); await w(700);
    }
    var tall=H.filter(function(h){ return h.h>40; });
    check(tall.length===0, 'tiêu đề 1 dòng (cao ≤ 40): '+JSON.stringify(H.map(function(h){ return h.s+' '+h.h; })));
    check(H.length>=6, 'đã soi đủ các màn: '+H.length);
    await page.click('.page.sv.on .sv-nav .svb'); await step('q1'); await w(600);
  });

  await run('T7', 'Luồng bán hàng không đổi: vẫn đi được tới phiếu đề xuất sau khi đã dùng công cụ', async function(){
    await page.click('.page.sv.on .sv-row button:nth-child(1)'); await step('q2'); await w(700);
    await page.click('.page.sv.on .sv-row button:nth-child(2)'); await step('q3'); await w(700);
    await page.click('.page.sv.on .sv-row button:nth-child(3)'); await step('pk', 9000); await w(900);
    check((await txt('.page.sv.on .head .t1'))==='Gói tập?', 'tới bước Gói tập: '+(await txt('.page.sv.on .head .t1')));
    check(!(await ev(function(){ return !!document.querySelector('.page.sv.on .sv-nav .svt'); })), 'nút Công cụ chỉ có ở màn đầu, không lẫn vào các bước sau');
    await shot('t7-pk');
  });

  for(var vp of [{width:375,height:667},{width:430,height:932}]){
    await run('T-L'+vp.width, 'Bố cục công cụ '+vp.width+'×'+vp.height+': bàn số không đè nav, kết quả không chồng ô nhập, không cắt chữ', async function(){
      var D=await mk(vp), p2=D.page;
      await p2.goto('http://localhost:'+PORT+'/?demo'); await p2.waitForFunction(function(){ return state.screen==='p-pin'; }, null, {timeout:8000}); await p2.waitForTimeout(500);
      for(var k of A_PIN) await p2.click('#pin-pad button:has-text("'+k+'")');
      await p2.waitForFunction(function(){ return state.screen==='p-home'; }, null, {timeout:9000}); await p2.waitForTimeout(1500);
      await p2.click('#h-sell'); await p2.waitForFunction(function(){ return window.SVX && SVX._step()==='q1'; }, null, {timeout:8000}); await p2.waitForTimeout(700);
      await p2.click('.page.sv.on .sv-nav .svt'); await p2.waitForFunction(function(){ return SVX._step()==='tx'; }); await p2.waitForTimeout(700);
      for(var t of [['Hết hạn hợp đồng','txw'],['Phí quẹt thẻ','txc']]){
        await p2.click('.page.sv.on .sv-r:has-text("'+t[0]+'")');
        await p2.waitForFunction(function(s){ return SVX._step()===s; }, t[1], {timeout:8000}); await p2.waitForTimeout(900);
        if(t[1]==='txc'){ await p2.click('.page.sv.on .sv-r:nth-child(2)'); await p2.waitForFunction(function(){ return SVX._step()==='txf'; }, null, {timeout:8000}); await p2.waitForTimeout(900);
          for(var c of ['5','0','0','0','0','0','0']) await p2.click('.page.sv.on .sv-pad .key[data-k="'+c+'"]'); await p2.waitForTimeout(400); }
        var L=await p2.evaluate(function(){
          var pg=document.querySelector('.page.sv.on'), ans=pg.querySelector('.sv-ans'), nav=pg.querySelector('.sv-nav'), pad=pg.querySelector('.sv-pad'),
              ly=document.querySelector('#sv-ctr .ly:not(.out)'), o={step:SVX._step()};
          o.padBot=Math.round(pad.getBoundingClientRect().bottom); o.navTop=Math.round(nav.getBoundingClientRect().top);
          o.ansTop=Math.round(ans.getBoundingClientRect().top); o.headBot=Math.round(pg.querySelector('.head').getBoundingClientRect().bottom);
          if(ly){ var b=1e9, t=-1e9; [].forEach.call(ly.children, function(k){ var r=k.getBoundingClientRect(); if(r.height){ b=Math.min(b,r.top); t=Math.max(t,r.bottom); } }); o.ctrTop=Math.round(b); o.ctrBot=Math.round(t); }
          o.clip=[].slice.call(pg.querySelectorAll('.sv-tg .mt .v span, .sv-tg .mt .h span')).filter(function(e){ return e.scrollWidth>e.clientWidth+1; }).length;
          o.key=Math.round(pg.querySelector('.sv-pad .key').getBoundingClientRect().height);
          return o; });
        check(L.padBot<=L.navTop, L.step+': bàn số không đè nav (pad '+L.padBot+' ≤ nav '+L.navTop+')');
        check(L.ctrBot==null || (L.ctrBot<=L.ansTop && L.ctrTop>=L.headBot), L.step+': kết quả ở tâm gọn trong khoảng trống ('+L.headBot+' ≤ '+L.ctrTop+'…'+L.ctrBot+' ≤ '+L.ansTop+')');
        check(L.clip===0, L.step+': không cắt chữ trong ô (cắt: '+L.clip+')');
        check(L.key>=40, L.step+': phím cao ≥ 40 pt (đang '+L.key+')');
        await p2.screenshot({path:path.join(OUT,'tl'+vp.width+'-'+L.step+'.png')});
        await p2.click('.page.sv.on .sv-nav .svc'); await p2.waitForFunction(function(){ return SVX._step()==='tx'; }, null, {timeout:8000}); await p2.waitForTimeout(700);
      }
      await D.ctx.close();
    });
  }

  var bad=RES.filter(function(r){ return r.fails.length; }).length;
  console.log('\n'+(RES.length-bad)+'/'+RES.length+' PASS · pageerror: '+PAGEERR.length);
  PAGEERR.slice(0,8).forEach(function(e){ console.log('   PAGEERR '+e.split('\n')[0]); });
  console.log('ảnh: '+OUT);
  await C.ctx.close(); await browser.close(); srv.close();
  process.exit(bad || PAGEERR.length ? 1 : 0);
})();

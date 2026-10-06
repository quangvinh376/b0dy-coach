/* v2.7 — hai trang mới: Khách tập chậm (p-slow · Figma 621:336/621:400) và Hoa hồng (p-com · Figma 628:496).
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/com_slow.js   (SHOT=1 → ảnh test/out_v27/*.png)
   Dữ liệu: demo (?demo) — khách giả, số tiền giả (repo public). */
var {chromium}=require('playwright'); var serve=require('./serve'); var fs=require('fs'); var path=require('path');
(async function(){
  var PORT=+process.env.PORT||19271, srv=await serve(PORT), browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var OUT=path.join(__dirname,'out_v27'); if(process.env.SHOT) fs.mkdirSync(OUT,{recursive:true});
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var page=await ctx.newPage(), errs=[], pass=0, fail=0;
  page.on('pageerror', function(e){ errs.push(String(e)); });
  function check(ok, msg){ if(ok) pass++; else fail++; console.log((ok?'  ok  ':'  FAIL ')+msg); }
  var ev=function(fn, a){ return page.evaluate(fn, a); }, wait=function(ms){ return page.waitForTimeout(ms); };
  var screen=function(){ return ev(function(){ return state.screen; }); };
  var waitScreen=function(id){ return page.waitForFunction(function(id){ return state.screen===id && document.getElementById(id).classList.contains('on'); }, id, {timeout:6000}); };
  async function shot(n){ if(process.env.SHOT) await page.screenshot({path:path.join(OUT, n+'.png')}); }
  async function drag(sel, dx){ var r=await ev(function(s){ var b=document.querySelector(s).getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; }, sel);
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x+dx, r.y+2, {steps:12}); await page.mouse.up(); }

  await page.goto('http://localhost:'+PORT+'/?demo'); await page.waitForSelector('#p-pin.on'); await wait(400);
  for(var k of '1234') await page.click('#pin-pad button:has-text("'+k+'")');
  await waitScreen('p-home'); await wait(1500);

  console.log('— KHÁCH TẬP CHẬM —');
  /* S1 — định nghĩa (hàm thuần, khách giả) */
  var u=await ev(function(){
    var t=isoN(TODAY_ISO), r=function(n){ return nIso(t+n); }, s=state.stats, keep=JSON.stringify([s.perClient, s.plan||{}]);
    s.perClient.__a={n28:4,w8:[1,1,1,1,1,1,1,1]}; s.perClient.__b={n28:2}; s.perClient.__c={n28:0}; s.plan.__b=3;
    var A=slowInfo({name:'__a',left:10,start:r(-200),exp:r(70)}), Bi=slowInfo({name:'__b',left:10,start:r(-200),exp:r(70)}),
        C=slowInfo({name:'__c',left:5,start:r(-10),exp:r(30)}), Z=slowInfo({name:'__a',left:0,start:r(-200),exp:r(70)}),
        Y=slowInfo({name:'__b',left:10,start:r(-14),exp:r(70)}), X=slowInfo({name:'__b',left:10,start:r(-200),exp:''});
    var o=JSON.parse(keep); s.perClient=o[0]; s.plan=o[1];
    return {a:[A.rate, Math.round(A.need*100)/100, Math.round(A.extra*100)/100], b:[Bi.rate, Math.round(Bi.extra*100)/100, Math.round(Bi.extraPlan*100)/100], c:C, z:Z, y:Y&&[Math.round(Y.rate*100)/100], x:X};
  });
  check(JSON.stringify(u.a)==='[1,1,0]', 'S1a 4 buổi/28 ngày = 1/tuần, còn 10 buổi/10 tuần → cần 1, dư 0 (không chậm): '+JSON.stringify(u.a));
  check(JSON.stringify(u.b)==='[0.5,5,-20]', 'S1b 2 buổi/28 ngày → dư 5; lịch 3 buổi/tuần đủ → extraPlan âm: '+JSON.stringify(u.b));
  check(u.c===null && u.z===null && u.x===null, 'S1c gói < 14 ngày · hết buổi · không có hạn → bỏ qua');
  check(u.y && u.y[0]===0.93, 'S1d gói 15 ngày: tempo chia theo số ngày thật (2 buổi / 15 ngày = 0,93/tuần, không chia 4 tuần): '+JSON.stringify(u.y));

  /* S2 — ô trang chủ → trang riêng, 2 nhóm theo hạn gói, thứ tự dư nhiều → ít */
  var tileV=await ev(function(){ return document.querySelector('#h-tiles .tile:nth-child(2) .tv').textContent.trim(); });
  await page.click('#h-tiles .tile:nth-child(2)'); await waitScreen('p-slow'); await wait(900);
  var S=await ev(function(){ return {
    list:slowList().map(function(i){ return {n:i.m.name, d:i.days, x:Math.round(i.extra), e:ddmm(i.exp)}; }),
    secs:[].map.call(document.querySelectorAll('#sl-list .sec'), function(e){ return e.textContent; }),
    rows:[].map.call(document.querySelectorAll('#sl-list .row'), function(r){ return r.querySelector('.nm').textContent+'|'+r.querySelector('.lab').textContent; }) }; });
  console.log('    ', JSON.stringify(S));
  check(tileV===String(S.list.length) && S.list.length===3, 'S2a ô trang chủ = số khách chậm (demo 3): '+tileV);
  check(S.secs.join('|')==='HẾT HẠN TRONG 60 NGÀY · 2|HẾT HẠN SAU 60 NGÀY · 1', 'S2b 2 nhóm: '+S.secs.join('|'));
  var g1=S.list.filter(function(i){ return i.d<=60; }), g2=S.list.filter(function(i){ return i.d>60; });
  check(S.rows.join(',')===g1.concat(g2).map(function(i){ return i.n+'|DƯ ~'+i.x+' BUỔI · HẾT '+i.e; }).join(','), 'S2c dòng: tên + "DƯ ~n BUỔI · HẾT dd/mm", trong nhóm dư nhiều → ít');
  check(g1.length===2 && g1[0].x>=g1[1].x, 'S2d sắp xếp dư giảm dần');
  await shot('slow');

  /* S3 — mở khách 0 buổi có lịch 3 buổi/tuần: dòng "Tập đúng lịch" + chưa có buổi gần nhất */
  await page.click('#sl-list .row:has-text("Châu Khang")'); await wait(700);
  var kv=await ev(function(){ var x=document.querySelector('#sl-list .row.open + .xp'); return x ? {kv:[].map.call(x.querySelectorAll('.kv'), function(k){ return k.children[0].textContent+'='+k.children[1].textContent+(k.children[1].classList.contains('er')?'!':''); }), bars:x.querySelectorAll('.wkb i').length, cur:x.querySelectorAll('.wkb i.cur').length, need:!!x.querySelector('.wkb .need'), nums:[].map.call(x.querySelectorAll('.wkn span'), function(s){ return s.textContent; }).join(''), inC:x.querySelector('.wkc').classList.contains('in')} : null; });
  console.log('    ', JSON.stringify(kv));
  check(kv && kv.bars===8 && kv.cur===1 && kv.need && kv.nums==='00000000', 'S3a biểu đồ 8 tuần (tuần này .cur) + vạch cần đạt');
  check(kv && kv.kv[0]==='Tempo hiện tại=0 BUỔI/TUẦN' && /^Tempo cần đạt=3,\d BUỔI\/TUẦN$/.test(kv.kv[1]), 'S3b tempo hiện tại / cần đạt: '+(kv&&kv.kv.slice(0,2)));
  check(kv && /^Tập đúng lịch 3 buổi\/tuần=VẪN DƯ ~4 BUỔI$/.test(kv.kv[2]), 'S3c lịch 3 buổi/tuần vẫn dư: '+(kv&&kv.kv[2]));
  check(kv && kv.kv[4]==='Buổi gần nhất=CHƯA CÓ' && /^Dự báo=DƯ ~24 BUỔI!$/.test(kv.kv[5]), 'S3d buổi gần nhất CHƯA CÓ · dự báo đỏ: '+(kv&&kv.kv.slice(4)));
  check(kv && kv.inC, 'S3e cột tăng dần (.in)');
  await shot('slow-open');
  /* S4 — khách có buổi, lịch 2 buổi/tuần đủ → KHÔNG có dòng "Tập đúng lịch"; cột cao theo tỉ lệ */
  await page.click('#sl-list .row:has-text("Doãn Quang")'); await wait(700);
  var q=await ev(function(){ var r=[].filter.call(document.querySelectorAll('#sl-list .row'), function(r){ return /Doãn Quang/.test(r.textContent); })[0], x=r.nextElementSibling;
    return {open:r.classList.contains('open'), kv:[].map.call(x.querySelectorAll('.kv span:first-child'), function(s){ return s.textContent; }), h:[].map.call(x.querySelectorAll('.wkb i'), function(i){ return parseFloat(i.style.height); }), nums:[].map.call(x.querySelectorAll('.wkn span'), function(s){ return +s.textContent; }), both:document.querySelectorAll('#sl-list .row.open').length}; });
  check(q.open && q.both===2, 'S4a mở nhiều dòng cùng lúc');
  check(q.kv.indexOf('Tập đúng lịch 2 buổi/tuần')<0 && q.kv.length===5, 'S4b lịch đủ → không dòng "Tập đúng lịch": '+q.kv.join(','));
  var prop=q.nums.every(function(v,i){ return !v || Math.abs(q.h[i]/v - q.h[q.nums.indexOf(Math.max.apply(null,q.nums))]/Math.max.apply(null,q.nums))<1.2; });
  check(prop, 'S4c cột tỉ lệ số buổi: '+q.h.join(',')+' / '+q.nums.join(','));
  /* S5 — số liệu làm mới (kéo xuống) → giữ dòng đang mở */
  await ev(function(){ statsApply(JSON.parse(JSON.stringify(demoDb().stats))); }); await wait(300);
  check((await ev(function(){ return document.querySelectorAll('#sl-list .row.open').length; }))===2, 'S5 làm mới số liệu → giữ 2 dòng đang mở');
  /* S6 — tìm */
  await page.fill('#sl-q','long'); await wait(200);
  check((await ev(function(){ return [].map.call(document.querySelectorAll('#sl-list .row .nm'), function(e){ return e.textContent; }).join(); }))==='Nguyễn Thành Long', 'S6 tìm "long"');
  await page.fill('#sl-q',''); await wait(200);
  /* S8 — v2.7.1: khoảng thở cuối danh sách như Khách hàng — cuộn hết thì phần cuối dừng cách nav đúng một nhịp dòng
     (danh sách dòng + phần mở rộng: khoảng ghost = cao DÒNG cuối, kể cả khi phần mở rộng cuối đang đóng hoặc mở) */
  await page.setViewportSize({width:375,height:667}); await wait(400);
  var s8=await ev(function(){ var el=document.getElementById('sl-list'), out={};
    function meas(){ el.scrollTop=1e5; var rows=el.querySelectorAll('.row'), lastRow=rows[rows.length-1], tail=el.lastElementChild, b=(tail.getBoundingClientRect().height? tail : lastRow).getBoundingClientRect().bottom;
      return {gap:Math.round(document.querySelector('#p-slow>.nav').getBoundingClientRect().top-b), rowH:Math.round(lastRow.getBoundingClientRect().height), sc:el.scrollHeight>el.clientHeight}; }
    SL_OPEN={}; renderSlow(false); out.closed=meas();
    var rows=el.querySelectorAll('.row'); rows[rows.length-1].click(); out.open=meas();
    SL_OPEN={}; renderSlow(false); return out; });
  await page.setViewportSize({width:393,height:852}); await wait(400);
  check(s8.open.sc && s8.open.gap>=s8.open.rowH && s8.open.gap<=s8.open.rowH+24, 'S8a mở dòng cuối, cuộn hết: cách nav '+s8.open.gap+'px ≈ 1 dòng ('+s8.open.rowH+'px)');
  check(!s8.closed.sc || (s8.closed.gap>=s8.closed.rowH && s8.closed.gap<=s8.closed.rowH+24), 'S8b dòng cuối đóng: '+JSON.stringify(s8.closed));
  /* S7 — máy chủ cũ (không w8/w0) → định nghĩa cũ, dòng mở hồ sơ, quay lại về p-slow */
  var old=await ev(function(){ var s=state.stats, keep=JSON.stringify(s); delete s.w0; Object.keys(s.perClient).forEach(function(k){ delete s.perClient[k].w8; }); renderSlow(false);
    var r={secs:[].map.call(document.querySelectorAll('#sl-list .sec'), function(e){ return e.textContent; }).join('|'), n:document.querySelectorAll('#sl-list .row').length}; window.__keep=keep; return r; });
  check(/^KHÁCH TẬP CHẬM · \d+$/.test(old.secs) && old.n>0, 'S7a máy chủ cũ → 1 nhóm định nghĩa cũ: '+old.secs);
  await page.click('#sl-list .row'); await waitScreen('p-profile'); await wait(700);
  await page.click('#p-profile .nav .ghost'); await waitScreen('p-slow'); await wait(600);
  check((await screen())==='p-slow', 'S7b hồ sơ ← quay lại đúng trang Khách tập chậm');
  await ev(function(){ state.stats=JSON.parse(window.__keep); renderSlow(false); });
  await page.click('#p-slow .nav .ghost'); await waitScreen('p-home'); await wait(800);

  console.log('— HOA HỒNG —');
  var tile4=await ev(function(){ return document.querySelector('#h-tiles .tile:nth-child(4) .tv').textContent.replace(/\s+/g,' ').trim(); });
  await page.click('#h-tiles .tile:nth-child(4)'); await waitScreen('p-com'); await wait(1000);
  var C=await ev(function(){
    var s=state.stats, m=TODAY_ISO.slice(0,7), by={}; s.sess.forEach(function(x){ by[x.d]=(by[x.d]||0)+x.c; });
    var pane=document.querySelectorAll('#cm-track .wkp')[1];
    return {mon:document.getElementById('cm-mon').textContent, total:document.getElementById('cm-total').textContent, want:fmtVnd(s.comMon[m]), tile:fmtTr(s.comMon[m])+' TR', m:+m.slice(5,7)+'/'+m.slice(0,4),
      pills:[].map.call(pane.querySelectorAll('.pd'), function(b){ var d=b.getAttribute('data-d'); return {d:d, pn:b.querySelector('.pn').textContent, pv:b.querySelector('.pv').textContent, cls:b.className, want:by[d]?fmtK(by[d]):'-'}; }),
      today:TODAY_ISO, ws:wkStart(TODAY_ISO), panes:document.querySelectorAll('#cm-track .wkp').length,
      day:document.querySelector('#cm-list .cmday').textContent, rows:[].map.call(document.querySelectorAll('#cm-list .cmr'), function(r){ return [].map.call(r.children, function(c){ return c.textContent; }).join('|'); }),
      wantRows:s.sess.filter(function(x){ return x.d===TODAY_ISO; }).map(function(x){ return (x.b?'—':x.t)+'|'+(x.b?'Bán hộ · '+x.n:x.n)+'|'+fmtVnd(x.c); }),
      dayT:fmtVnd(by[TODAY_ISO]||0), wd:VN_WD[wdOf(TODAY_ISO)]+', '+ddmm(TODAY_ISO),
      bg:getComputedStyle(pane.querySelector('.pd.on')).backgroundColor, dot:getComputedStyle(pane.querySelector('.pd.today .pdot')).backgroundColor, dotOff:getComputedStyle(pane.querySelector('.pd:not(.today) .pdot')).backgroundColor }; });
  console.log('    ', JSON.stringify({mon:C.mon,total:C.total,day:C.day,rows:C.rows.length,bg:C.bg,dot:C.dot,dotOff:C.dotOff}));
  check(tile4===C.tile, 'C1a ô Hoa hồng = tổng tháng của trang chi tiết: '+tile4+' / '+C.tile);
  check(C.mon==='THÁNG '+C.m && C.total===C.want, 'C1b hero: '+C.mon+' · '+C.total);
  check(C.panes===3 && C.pills.length===7 && C.pills[0].d===C.ws, 'C2a dải 7 viên, thứ hai → chủ nhật tuần này (3 khung cho vuốt)');
  check(C.pills.every(function(p){ return p.pn===p.d.slice(8,10) && p.pv===p.want; }), 'C2b số nhỏ = ngày, số lớn = hoa hồng ngày (K/TR, "-" ngày không có)');
  var tp=C.pills.filter(function(p){ return p.d===C.today; })[0];
  check(tp && / on( |$)/.test(tp.cls) && / today( |$)/.test(tp.cls), 'C2c hôm nay: viên được chọn (.on) + chấm (.today)');
  check(C.pills.every(function(p){ return (p.d>C.today) === / off( |$)/.test(p.cls); }), 'C2d ngày tương lai khoá (.off)');
  check(/^rgb\(2(0[0-9]|[1-5][0-9]), 2[0-5][0-9], /.test(C.bg) || /rgb\(\d+, \d+, \d+\)/.test(C.bg) && C.bg!=='rgba(0, 0, 0, 0)', 'C2e viên chọn có nền (Acid): '+C.bg);
  check(C.dotOff==='rgba(0, 0, 0, 0)', 'C2f ngày khác không có chấm: '+C.dotOff);
  check(C.day===C.wd+C.dayT, 'C3a dòng ngày: '+C.day);
  check(C.rows.join(',')===C.wantRows.join(','), 'C3b danh sách buổi hôm nay = SESSION LOG: '+C.rows.length);
  await shot('com');

  /* C4 — chạm một ngày khác có buổi trong tuần (không phải hôm nay) */
  var other=C.pills.filter(function(p){ return p.d<C.today && p.pv!=='-'; })[0];
  if(other){
    await page.click('#cm-track .wkp:nth-child(2) .pd[data-d="'+other.d+'"]'); await wait(450);
    var c4=await ev(function(d){ var s=state.stats; return {on:[].map.call(document.querySelectorAll('#cm-track .pd.on'), function(b){ return b.getAttribute('data-d'); }), day:document.querySelector('#cm-list .cmday .d').textContent, n:document.querySelectorAll('#cm-list .cmr').length, want:s.sess.filter(function(x){ return x.d===d; }).length, wd:VN_WD[wdOf(d)]+', '+ddmm(d), stillToday:document.querySelector('#cm-track .wkp:nth-child(2) .pd.today')!=null}; }, other.d);
    check(c4.on.join()===other.d && c4.day===c4.wd && c4.n===c4.want && c4.stillToday, 'C4 chạm ngày '+other.d+' → viên Acid chuyển, chi tiết đổi ('+c4.n+' buổi), chấm vẫn ở hôm nay');
  } else console.log('  (bỏ C4: hôm nay là ngày đầu tuần có số liệu)');
  /* C5 — chạm ngày tương lai: không đổi */
  var fut=C.pills.filter(function(p){ return p.d>C.today; })[0];
  if(fut){ var b4=await ev(function(){ return CM.sel; }); await page.click('#cm-track .wkp:nth-child(2) .pd[data-d="'+fut.d+'"]', {force:true}); await wait(300);
    check((await ev(function(){ return CM.sel; }))===b4, 'C5 ngày tương lai không chọn được'); }
  /* C6 — vuốt phải → tuần trước, giữ thứ trong tuần; hero theo tháng của ngày chọn */
  var sel0=await ev(function(){ return CM.sel; });
  await drag('#cm-wk', 180); await wait(600);
  var c6=await ev(function(s0){ return {wk:CM.wk, sel:CM.sel, want:nIso(isoN(s0)-7), wantWk:nIso(isoN(wkStart(TODAY_ISO))-7), mon:document.getElementById('cm-mon').textContent, total:document.getElementById('cm-total').textContent,
    wm:'THÁNG '+(+CM.sel.slice(5,7))+'/'+CM.sel.slice(0,4), wt:fmtVnd(state.stats.comMon[CM.sel.slice(0,7)]), tr:document.getElementById('cm-track').style.transform, on:document.querySelectorAll('#cm-track .wkp:nth-child(2) .pd.on').length}; }, sel0);
  check(c6.wk===c6.wantWk && c6.sel===c6.want && c6.on===1, 'C6a vuốt phải → tuần trước, cùng thứ: '+c6.sel);
  check(c6.mon===c6.wm && c6.total===c6.wt, 'C6b hero theo tháng ngày chọn: '+c6.mon+' '+c6.total);
  check(c6.tr==='', 'C6c dải về giữa sau khi đổi tuần');
  await shot('com-prev');
  /* C7 — vuốt ngắn (< 18 %) → bật về, không đổi tuần */
  await drag('#cm-wk', 40); await wait(500);
  check((await ev(function(){ return CM.wk; }))===c6.wk, 'C7 vuốt ngắn → giữ tuần');
  /* C8 — vuốt về đầu khoảng (tuần chứa đầu tháng trước), quá nữa thì không đi */
  for(var i=0;i<8;i++){ await drag('#cm-wk', 180); await wait(450); }
  var c8=await ev(function(){ var B=comBounds(comData()); return {wk:CM.wk, min:B.min, from:B.from, sel:CM.sel,
    offs:[].map.call(document.querySelectorAll('#cm-track .wkp:nth-child(2) .pd'), function(b){ return b.getAttribute('data-d')+(b.classList.contains('off')?'x':''); }), prevEmpty:!document.querySelector('#cm-track .wkp:nth-child(1) .pd')}; });
  check(c8.wk===c8.min && c8.sel>=c8.from, 'C8a dừng ở tuần đầu khoảng ('+c8.min+'), ngày chọn ≥ '+c8.from+': '+c8.sel);
  check(c8.offs.every(function(x){ return /x$/.test(x) === (x.slice(0,10)<c8.from); }) && c8.prevEmpty, 'C8b ngày trước '+c8.from+' khoá, không có khung tuần trước');
  /* C9 — vuốt trái về tuần này; quá tuần này không đi */
  for(i=0;i<9;i++){ await drag('#cm-wk', -180); await wait(450); }
  check((await ev(function(){ return CM.wk===wkStart(TODAY_ISO) && CM.sel<=TODAY_ISO && !document.querySelector('#cm-track .wkp:nth-child(3) .pd'); })), 'C9 vuốt trái dừng ở tuần này, ngày chọn ≤ hôm nay');
  /* C10 — ngày có bán hộ: giờ "—", tên "Bán hộ · …", xếp cuối ngày; ngày không buổi: "KHÔNG CÓ BUỔI NÀO" */
  var c10=await ev(function(){ var d=TODAY_ISO.slice(0,7)+'-03'; if(d>TODAY_ISO) d=state.stats.comFrom.slice(0,7)+'-03';
    CM.sel=d; CM.wk=wkStart(d); renderCom(false); var rows=[].map.call(document.querySelectorAll('#cm-list .cmr'), function(r){ return r.textContent; });
    var e=state.stats.comFrom.slice(0,7)+'-07'; CM.sel=e; CM.wk=wkStart(e); renderCom(false);
    var r2={rows:rows, empty:document.querySelector('#cm-list .empty') && document.querySelector('#cm-list .empty').textContent, eday:document.querySelector('#cm-list .cmday .v').textContent,
      pv:document.querySelector('#cm-track .wkp:nth-child(2) .pd[data-d="'+e+'"] .pv').textContent};
    CM.sel=TODAY_ISO; CM.wk=wkStart(TODAY_ISO); renderCom(false); return r2; });
  check(/^—Bán hộ · /.test(c10.rows[c10.rows.length-1]||''), 'C10a bán hộ: "—" + "Bán hộ · tên", cuối ngày: '+c10.rows[c10.rows.length-1]);
  check(c10.empty==='KHÔNG CÓ BUỔI NÀO' && c10.eday==='0' && c10.pv==='-', 'C10b ngày không buổi: '+c10.empty+' · '+c10.eday+' · viên "'+c10.pv+'"');
  /* C11 — chưa có số liệu (máy chủ cũ, không sess) */
  var c11=await ev(function(){ var s=state.stats, keep=s.sess; delete s.sess; CM.src=null; renderCom(false);
    var r={t:document.getElementById('cm-total').textContent, e:document.querySelector('#cm-list .empty').textContent, pv:[].map.call(document.querySelectorAll('#cm-track .wkp:nth-child(2) .pv'), function(p){ return p.textContent; }).join('')};
    s.sess=keep; CM.src=null; renderCom(false); return r; });
  check(c11.t==='—' && c11.e==='ĐANG TẢI SỐ LIỆU' && /^-+$/.test(c11.pv), 'C11 máy chủ cũ: hero "—", "ĐANG TẢI SỐ LIỆU"');
  /* C12 — chi tiết dài: cuộn trong #cm-list, hero + dải tuần đứng yên */
  var c12=await ev(function(){ var l=document.getElementById('cm-list'); return {ov:getComputedStyle(l).overflowY, top:document.getElementById('cm-wk').getBoundingClientRect().top}; });
  check(/auto|scroll/.test(c12.ov), 'C12 danh sách buổi cuộn riêng ('+c12.ov+')');
  /* C12b — khoảng ghost cuối = cao một dòng buổi (không phải cả khối ngày): cuộn hết thì dòng cuối dừng trên nav một nhịp */
  await page.setViewportSize({width:375,height:667}); await wait(400);   /* màn thấp → 7 buổi phải cuộn */
  var c12b=await ev(function(){ var by={}; state.stats.sess.forEach(function(x){ by[x.d]=(by[x.d]||0)+1; }); var d=Object.keys(by).sort(function(a,b){ return by[b]-by[a]; })[0];
    CM.sel=d; CM.wk=wkStart(d); renderCom(false); var l=document.getElementById('cm-list'); l.scrollTop=1e5;
    var rs=l.querySelectorAll('.cmr'), last=rs[rs.length-1].getBoundingClientRect(), nav=document.querySelector('#p-com>.nav').getBoundingClientRect();
    var r={gap:Math.round(nav.top-last.bottom), rowH:Math.round(last.height), n:rs.length, sc:l.scrollTop>0}; CM.sel=TODAY_ISO; CM.wk=wkStart(TODAY_ISO); renderCom(false); return r; });
  await page.setViewportSize({width:393,height:852}); await wait(400);
  check(c12b.sc && c12b.gap>=c12b.rowH && c12b.gap<=c12b.rowH+24, 'C12b cuộn hết: dòng cuối cách nav '+c12b.gap+'px (≈ 1 dòng '+c12b.rowH+'px + đệm nav), '+c12b.n+' buổi');
  /* C13 — v2.7.1: giờ cạnh tên = giờ ký thật (rỗng → "—"), thứ tự trong ngày = thứ tự sess (dòng SESSION LOG) */
  var c13=await ev(function(){ var s=state.stats, keep=s.sess, d=TODAY_ISO;
    s.sess=keep.filter(function(x){ return x.d!==d; }).concat([{d:d,t:'09:40',n:'Khách Sau',c:100000},{d:d,t:'',n:'Khách Tay',c:90000},{d:d,t:'07:05',n:'Khách Sớm',c:80000},{d:d,t:'',n:'Khách Bán',c:50000,b:1}]);
    CM.src=null; CM.sel=d; CM.wk=wkStart(d); renderCom(false);
    var r=[].map.call(document.querySelectorAll('#cm-list .cmr'), function(e){ return e.querySelector('.t').textContent+' '+e.querySelector('.n').textContent; });
    s.sess=keep; CM.src=null; renderCom(false); return r; });
  check(c13.join('|')==='09:40 Khách Sau|— Khách Tay|07:05 Khách Sớm|— Bán hộ · Khách Bán', 'C13 giờ ký thật · "—" khi nhập tay · giữ thứ tự dòng (không xếp theo giờ): '+c13.join('|'));
  await page.click('#p-com .nav .ghost'); await waitScreen('p-home'); await wait(800);

  console.log('— ADMIN · DOANH THU (v2.7.1) —');
  var actx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:2, hasTouch:true, isMobile:true});
  await actx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
  var ap=await actx.newPage(); ap.on('pageerror', function(e){ errs.push('admin: '+String(e)); });
  await ap.goto('http://localhost:'+PORT+'/?demo'); await ap.waitForSelector('#p-pin.on'); await ap.waitForTimeout(400);
  for(var k2 of '0000') await ap.click('#pin-pad button:has-text("'+k2+'")');
  await ap.waitForFunction(function(){ return state.screen==='p-home' && state.admin && state.stats && state.stats.sess; }, null, {timeout:8000}); await ap.waitForTimeout(1200);
  var a1=await ap.evaluate(function(){ var t=document.querySelector('#h-tiles .tile:nth-child(4)'), m=TODAY_ISO.slice(0,7);
    return {l:t.querySelector('.tl').textContent, v:t.querySelector('.tv').textContent.replace(/\s+/g,' ').trim(), want:fmtTr(state.stats.comMon[m])+' TR', rev:fmtTr(state.stats.rev.total)+' TR'}; });
  check(a1.l==='Doanh thu' && a1.v===a1.want && a1.want!==a1.rev, 'A1 ô Doanh thu = doanh thu tháng này từ SESSION LOG (không còn dòng Tổng tab COM): '+a1.v);
  await ap.click('#h-tiles .tile:nth-child(4)'); await ap.waitForFunction(function(){ return state.screen==='p-com' && document.getElementById('p-com').classList.contains('on'); }, null, {timeout:6000}); await ap.waitForTimeout(1000);
  var a2=await ap.evaluate(function(){ var s=state.stats, m=TODAY_ISO.slice(0,7), by={}; s.sess.forEach(function(x){ by[x.d]=(by[x.d]||0)+x.c; });
    var pane=document.querySelectorAll('#cm-track .wkp')[1];
    return {title:document.getElementById('cm-title').textContent, mon:document.getElementById('cm-mon').textContent, total:document.getElementById('cm-total').textContent, want:fmtVnd(s.comMon[m]),
      pillsOk:[].every.call(pane.querySelectorAll('.pd'), function(b){ var d=b.getAttribute('data-d'); return b.querySelector('.pv').textContent===(by[d]?fmtK(by[d]):'-'); }),
      rows:[].map.call(document.querySelectorAll('#cm-list .cmr'), function(r){ return [].map.call(r.children, function(c){ return c.textContent; }).join('|'); }).join(','),
      wantRows:s.sess.filter(function(x){ return x.d===TODAY_ISO; }).map(function(x){ return (x.t||'—')+'|'+x.n+'|'+fmtVnd(x.c); }).join(','),
      dash:s.sess.some(function(x){ return x.d===TODAY_ISO && !x.t; }), day:document.querySelector('#cm-list .cmday .v').textContent, dayT:fmtVnd(by[TODAY_ISO]||0)}; });
  check(a2.title==='Doanh thu' && a2.total===a2.want && /^THÁNG /.test(a2.mon), 'A2 trang Doanh thu: tiêu đề + tổng tháng '+a2.total);
  check(a2.pillsOk && a2.day===a2.dayT, 'A3 dải tuần = doanh thu theo ngày, dòng ngày '+a2.day);
  check(a2.rows===a2.wantRows && a2.dash, 'A4 các buổi hôm nay (mọi coach, giờ ký, "—" nhập tay): '+a2.rows.split(',').length+' buổi');
  if(process.env.SHOT) await ap.screenshot({path:path.join(OUT, 'admin-dt.png')});
  await ap.click('#p-com .nav .ghost'); await ap.waitForFunction(function(){ return state.screen==='p-home'; }, null, {timeout:6000});
  await actx.close();

  check(errs.length===0, 'Không pageerror'+(errs.length?': '+errs.join(' | '):''));
  console.log('\n'+pass+'/'+(pass+fail)+' PASS'+(fail?' · '+fail+' FAIL':''));
  await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(function(e){ console.error(e); process.exit(2); });

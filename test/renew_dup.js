/* v2.18.3 — khách gia hạn = 2 dòng MEMBERS cùng tên (gói cũ hết buổi + gói mới) → app coach phải coi là MỘT khách.
   Máy chủ giả trả members đúng như lệnh `coach` (Worker v8 apiCoach / Apps Script lbCoach_): không gộp tên, sort ổn định theo
   tên → dòng gói cũ đứng TRƯỚC; checked/signed gắn theo TÊN (cả hai dòng). Tên, số liệu là giả (dải tài liệu cho IP).
   Chạy: node test/renew_dup.js   (trên v2.18.2: R1 – R4 trượt, dừng ở R4 vì chưa có rowOf) */
var {chromium}=require('playwright'); var serve=require('./serve');
var pass=0, fail=0;
function check(label, cond, extra){ if(cond){ pass++; console.log('  PASS  '+label); } else { fail++; console.log('  FAIL  '+label+(extra!==undefined?'  -> '+JSON.stringify(extra).slice(0,400):'')); } }
(async function(){
  var PORT=+process.env.PORT||19631, srv=await serve(PORT);
  var browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var TODAY='2026-10-29';
  function M(name,done,total,kind,start,exp,left,at){ var o={name:name,done:done,total:total,left:left,coach:'Quyết Hán',kind:kind,start:start,end:'',exp:exp}; if(at){ o.checked=true; o.signed=at; } return o; }
  function fresh(){ return [
    M('Khách Đôi Gia Hạn',12,12,'1:1','2026-08-01','2026-10-01',0),            /* gói cũ 1:1 → gia hạn sang 1:2 */
    M('Khách Đôi Gia Hạn',1,12,'1:2','2026-10-25','2026-12-25',11),
    M('Khách Một Gia Hạn',12,12,'1:1','2026-08-01','2026-10-01',0),            /* 1:1 gia hạn, chưa check-in hôm nay */
    M('Khách Một Gia Hạn',2,24,'1:1','2026-10-20','2027-01-20',22),
    M('Khách Một Lần',31,72,'1:1','2026-07-16','2027-01-23',41,'08:15'),
    M('Khách Đôi A',10,12,'1:2','2026-08-26','2026-10-02',0,'08:18'),          /* gói cũ hết hạn (dư 2 → Còn lại 0) */
    M('Khách Đôi A',4,12,'1:2','2026-10-19','2026-11-29',8,'08:18'),
    M('Khách Đôi B',10,12,'1:2','2026-08-26','2026-10-02',0,'08:18'),
    M('Khách Đôi B',4,12,'1:2','2026-10-19','2026-11-29',8,'08:18')
  ]; }
  var rows=fresh(), SRV={checkins:[], coach:0};
  async function setup(ctx){
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:'{"ip":"203.0.113.7"}'}); });
    async function handle(r){
      var p=JSON.parse(r.request().postData()||'{}'), out={ok:false,error:'unknown_action'};
      if(p.action==='ping') out={ok:true};
      else if(p.pin!=='1234') out={ok:false,error:'sai_pin'};
      else if(p.action==='coach'){ SRV.coach++; out={ok:true, coach:'Quyết Hán', members:JSON.parse(JSON.stringify(rows)), snapshot:{}, library:null, today:TODAY}; }
      else if(p.action==='stats') out={ok:true, month:'2026-10', days:{}, monthTotal:0, perClient:{}, com:{month:'2026-10',total:0}, hist:{}};
      else if(p.action==='checkin_coach'){
        SRV.checkins.push(p.name);
        var live=rows.filter(function(x){ return x.name===p.name && x.left>0; }).pop(); live.done++; live.left--;   /* như Worker: member = dòng còn buổi */
        rows.filter(function(x){ return x.name===p.name; }).forEach(function(x){ x.checked=true; x.signed='09:00'; });
        out={ok:true,row:1400,member:{name:live.name,done:live.done,total:live.total,left:live.left,coach:live.coach},coach:'Quyết Hán',at:'09:00'};
      }
      r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)});
    }
    await ctx.route(/workers\.dev/, handle); await ctx.route(/script\.google\.com/, handle);
  }
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1, hasTouch:true, isMobile:true}); await setup(ctx);
  var page=await ctx.newPage(), errors=[]; page.on('pageerror', function(e){ errors.push(String(e)); });
  await page.goto('http://localhost:'+PORT+'/');
  for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")');
  await page.waitForTimeout(1800);

  console.log('\n== R1. Trang chủ + cửa sổ "Khách hôm nay": mỗi khách một lần ==');
  var tiles=await page.evaluate(function(){ var o={}; [].forEach.call(document.querySelectorAll('#h-tiles .tile'), function(t){ o[t.querySelector('.tl').textContent]=t.querySelector('.n').textContent; }); return o; });
  check('ô Khách hôm nay = 3 (3 người đã tập)', tiles['Khách hôm nay']==='3', tiles);
  check('ô Tổng số khách = 5', tiles['Tổng số khách']==='5', tiles);
  await page.evaluate(function(){ openClientSheet('today'); }); await page.waitForTimeout(700);
  var sheet=await page.evaluate(function(){ return { sec:document.querySelector('#cs-list .lab.sec').textContent, names:[].map.call(document.querySelectorAll('#cs-list .row .nm'), function(e){ return e.textContent; }) }; });
  check('cửa sổ: KHÁCH HÔM NAY · 3, không tên nào lặp', sheet.sec==='KHÁCH HÔM NAY · 3' && sheet.names.length===3 && new Set(sheet.names).size===3, sheet);
  await page.evaluate(function(){ closeClientSheet(); }); await page.waitForTimeout(500);

  console.log('\n== R2. Khách hàng: khách gia hạn chỉ ở "Đang hoạt động", đúng gói mới ==');
  await page.evaluate(function(){ state.clFilter=''; go('p-clients','fwd'); }); await page.waitForTimeout(900);
  var cl=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#cl-list .lab.sec, #cl-list .row'), function(e){ return e.classList.contains('row') ? e.querySelector('.nm').textContent+' — '+e.querySelector('.lab').textContent : '## '+e.textContent; }); });
  check('5 khách, không có nhóm Đã hết gói', cl.length===6 && cl[0]==='## KHÁCH ĐANG HOẠT ĐỘNG · 5', cl);
  check('Khách Đôi A — GÓI 12 · CÒN 8 BUỔI (gói mới)', cl.indexOf('Khách Đôi A — GÓI 12 · CÒN 8 BUỔI')>=0, cl);
  check('Khách Một Gia Hạn — GÓI 24 · CÒN 22 BUỔI', cl.indexOf('Khách Một Gia Hạn — GÓI 24 · CÒN 22 BUỔI')>=0, cl);

  console.log('\n== R3. findClient = dòng gói mới ==');
  var fc=await page.evaluate(function(){ return ['Khách Đôi A','Khách Một Gia Hạn','Khách Đôi Gia Hạn'].map(function(n){ var m=findClient(n); return m.total+'/'+m.done+'/'+m.left+'/'+m.kind+'/'+m.start; }); });
  check('Khách Đôi A 12/4/8/1:2 từ 19/10', fc[0]==='12/4/8/1:2/2026-10-19', fc);
  check('Khách Một Gia Hạn 24/2/22', fc[1]==='24/2/22/1:1/2026-10-20', fc);
  check('Khách Đôi Gia Hạn 12/1/11/1:2 (gói mới 1:2)', fc[2]==='12/1/11/1:2/2026-10-25', fc);

  console.log('\n== R4. Chọn khách 1:1 gia hạn → xác nhận → check-in: số buổi theo gói mới ==');
  await page.evaluate(function(){ go('p-home','back'); }); await page.waitForTimeout(600);
  await page.click('#h-go'); await page.waitForTimeout(900);
  var pick=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pk-list .row'), function(b){ return b.getAttribute('data-name'); }); });
  check('Chọn khách: không tên nào lặp', pick.length===new Set(pick).size && pick.length===5, pick);
  await page.click('#pk-list .row:has-text("Khách Một Gia Hạn")'); await page.waitForTimeout(1600);
  var cf=await page.evaluate(function(){ var c=document.querySelector('#cf-body .card'); return { card:c.querySelector('.n').textContent+' '+c.querySelector('.of').textContent, lines:document.querySelector('#cf-body .lines').innerText.replace(/\n/g,' | ') }; });
  check('thẻ 3 / 24', cf.card==='3 / 24', cf);
  check('Buổi thứ 3 · Đã tập 2, còn 22 buổi', /^Buổi thứ 3 \| Đã tập 2, còn 22 buổi/.test(cf.lines), cf);
  await page.click('#cf-go'); await page.waitForTimeout(1800);
  var ac=await page.evaluate(function(){ var m=findClient('Khách Một Gia Hạn'), ci=CI['Khách Một Gia Hạn']; return { no:state.session&&state.session.people[0].no, ci:ci&&ci.no, m:m.done+'/'+m.left+'/'+m.total, cache:(function(){ var c=loadCache(state.coach), r=rowOf(c.res.members,'Khách Một Gia Hạn'); return r.done+'/'+r.left+'/'+r.total+'/'+!!r.checked; })() }; });
  check('check-in gửi đúng 1 lần', SRV.checkins.length===1 && SRV.checkins[0]==='Khách Một Gia Hạn', SRV.checkins);
  check('số buổi của phiên = 3 (CI + buổi đang ghi)', ac.no===3 && ac.ci===3, ac);
  check('máy: đã tập 3, còn 21 / 24', ac.m==='3/21/24', ac);
  check('cache: dòng gói mới được cập nhật (3/21/24, đã tập)', ac.cache==='3/21/24/true', ac);

  console.log('\n== R5. Chọn khách sau check-in: khách gia hạn không "sống lại" thành 2 dòng ==');
  await page.evaluate(function(){ localStorage.removeItem('lb_session'); state.session=null; go('p-home','back'); }); await page.waitForTimeout(600);
  await page.click('#h-go'); await page.waitForTimeout(900);
  pick=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pk-list .row'), function(b){ return b.getAttribute('data-name')+(b.classList.contains('duo')?' [1:2]':''); }); });
  check('vẫn 5 dòng, Khách Một Gia Hạn một lần', pick.length===5 && pick.filter(function(n){ return n.indexOf('Khách Một Gia Hạn')===0; }).length===1, pick);
  check('Khách Đôi Gia Hạn nằm ở nhóm 1:2', pick.indexOf('Khách Đôi Gia Hạn [1:2]')>=0, pick);

  console.log('\n== R6. 1:2: chọn được khách gia hạn 1:1 → 1:2; chip còn sau khi danh sách vẽ lại ==');
  await page.click('#pk-list .row.duo[data-name="Khách Đôi Gia Hạn"]'); await page.waitForTimeout(300);
  var s1=await page.evaluate(function(){ return state.sel.slice(); });
  check('chạm → đã chọn', s1.length===1 && s1[0]==='Khách Đôi Gia Hạn', s1);
  var chip=await page.evaluate(function(){
    state.sel=[];
    state.clients.forEach(function(c){ if(c.name==='Khách Đôi A'||c.name==='Khách Đôi B'){ c.checked=false; c.signed=''; delete CI[c.name]; } });
    renderPick(false); togglePick('Khách Đôi A'); togglePick('Khách Đôi B'); var a=state.sel.slice(); renderPick(false);
    return { a:a, b:state.sel.slice(), chips:document.querySelectorAll('#pk-chips .chip:not(.out)').length };
  });
  check('chọn Khách Đôi A + B → vẽ lại vẫn còn cả hai chip', chip.a.length===2 && chip.b.length===2 && chip.chips===2, chip);

  console.log('\n== R7. Hồ sơ gói mới không nhảy về gói cũ sau làm mới nền ==');
  var pf=await page.evaluate(async function(){
    state.client=findClient('Khách Đôi A'); var a=state.client.start+'/'+state.client.left;
    state.dataTs=0; state._refreshing=null; await refreshData(true);
    return { a:a, b:state.client.start+'/'+state.client.left };
  });
  check('trước và sau làm mới: 2026-10-19 / còn 8', pf.a==='2026-10-19/8' && pf.b==='2026-10-19/8', pf);

  console.log('\n== R8. Mở lại app (vào thẳng từ cache): vẫn một khách mỗi tên ==');
  await page.evaluate(function(){ localStorage.removeItem('lb_session'); }); await page.reload(); await page.waitForTimeout(1500);
  var rc=await page.evaluate(function(){ var n={}; state.clients.forEach(function(c){ n[c.name]=(n[c.name]||0)+1; }); return { len:state.clients.length, max:Math.max.apply(null, Object.keys(n).map(function(k){ return n[k]; })) }; });
  check('5 khách, không tên nào hai lần', rc.len===5 && rc.max===1, rc);

  console.log('\n== R9. Luật chọn dòng (như admPick) ==');
  var rule=await page.evaluate(function(){
    var L=function(n,l,t,ch,at){ var o={name:n,left:l,total:t,done:t-l}; if(ch){ o.checked=true; o.signed=at; } return o; };
    var a=oneRowPerName([L('X',3,12), L('X',0,12)]);                  /* dòng còn buổi ĐỨNG TRÊN dòng hết buổi */
    var b=oneRowPerName([L('X',0,12), L('X',0,24)]);                  /* cả hai hết → dòng cuối */
    var c=oneRowPerName([L('X',2,12), L('X',5,24)]);                  /* cả hai còn → dòng còn buổi cuối */
    var d=oneRowPerName([L('X',0,12,true,'08:18'), L('X',8,12)]);     /* đã tập chỉ gắn ở dòng thua → vẫn giữ */
    var e=oneRowPerName([L('A',1,4), L('B',0,4), L('B',2,4), L('C',1,4)]);
    var f=rowOf([L('X',0,12), L('X',8,12)], 'X');
    return [a.length+':'+a[0].left, b.length+':'+b[0].total, c.length+':'+c[0].total, d[0].left+':'+!!d[0].checked+':'+d[0].signed, e.map(function(m){ return m.name+m.left; }).join(','), f.left];
  });
  check('còn buổi đứng trên → giữ dòng còn buổi', rule[0]==='1:3', rule);
  check('cả hai hết → dòng cuối', rule[1]==='1:24', rule);
  check('cả hai còn → dòng còn buổi cuối', rule[2]==='1:24', rule);
  check('cờ đã tập hôm nay không mất khi gộp', rule[3]==='8:true:08:18', rule);
  check('giữ thứ tự tên, khách một dòng không đổi', rule[4]==='A1,B2,C1', rule);
  check('rowOf cùng luật', rule[5]===8, rule);

  check('0 pageerror', errors.length===0, errors);
  await ctx.close(); await browser.close(); srv.close();
  console.log('\n'+pass+' PASS, '+fail+' FAIL'); process.exit(fail?1:0);
})().catch(function(e){ console.error('FAIL', e); process.exit(1); });

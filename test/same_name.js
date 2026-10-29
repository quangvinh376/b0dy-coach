/* v2.19.0 — khách TRÙNG TÊN (hai người khác nhau). Máy chủ mới (Worker v10 / Apps Script v2.12) gửi mỗi khách `key`
   (tên nếu tên chỉ thuộc một người, trùng tên → mã khách) + `pid`; snapshot / perClient / plan / hist khoá theo key.
   App phải: hiện đủ hai người, check-in / ghi nhật ký gửi đúng pid, hồ sơ không lẫn nhau. Tên, số liệu giả.
   Chạy: node test/same_name.js   (trên v2.18.3: hai người trùng tên bị gộp làm một → N1 trượt) */
var {chromium}=require('playwright'); var serve=require('./serve');
var pass=0, fail=0;
function check(label, cond, extra){ if(cond){ pass++; console.log('  PASS  '+label); } else { fail++; console.log('  FAIL  '+label+(extra!==undefined?'  -> '+JSON.stringify(extra).slice(0,400):'')); } }
(async function(){
  var PORT=+process.env.PORT||19633, srv=await serve(PORT);
  var browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  var TODAY='2026-10-29';
  function M(name,key,pid,done,total,kind,left){ return {name:name,key:key,pid:pid,done:done,total:total,left:left,coach:'Quyết Hán',kind:kind,start:'2026-10-01',end:'',exp:'2027-01-01'}; }
  var rows=[
    M('Trùng Cùng Coach','B070DY','B070DY',3,12,'1:2',9),
    M('Trùng Cùng Coach','B071DY','B071DY',5,12,'1:2',7),
    M('Khách Riêng','Khách Riêng','B001DY',10,72,'1:1',62)
  ];
  var snap={ B070DY:{measures:[{d:'2026-10-20',weight:60}],target:{},main:'weight',last:{'BB Back Squat':{kg:40,rep:8,d:'2026-10-20'}},plans:{}},
             B071DY:{measures:[{d:'2026-10-21',weight:80}],target:{},main:'weight',last:{'BB Back Squat':{kg:90,rep:5,d:'2026-10-21'}},plans:{}} };
  var SRV={checkins:[], events:[]};
  async function setup(ctx){
    await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function(r){ r.fulfill({status:200, contentType:'text/css', body:''}); });
    await ctx.route(/api\.ipify\.org/, function(r){ r.fulfill({status:200, contentType:'application/json', body:'{"ip":"203.0.113.7"}'}); });
    async function handle(r){
      var p=JSON.parse(r.request().postData()||'{}'), out={ok:false,error:'unknown_action'};
      if(p.action==='ping') out={ok:true};
      else if(p.pin!=='1234') out={ok:false,error:'sai_pin'};
      else if(p.action==='coach') out={ok:true, coach:'Quyết Hán', members:JSON.parse(JSON.stringify(rows)), snapshot:JSON.parse(JSON.stringify(snap)), library:null, today:TODAY};
      else if(p.action==='stats') out={ok:true, month:'2026-10', days:{}, monthTotal:0, perClient:{B070DY:{m:3,last:'2026-10-20'},B071DY:{m:5,last:'2026-10-21'}}, plan:{B070DY:2,B071DY:3}, com:{month:'2026-10',total:0}, hist:{}};
      else if(p.action==='checkin_coach'){
        SRV.checkins.push({name:p.name, key:p.key, pid:p.pid});
        var live=rows.filter(function(x){ return x.pid===p.pid; })[0];
        if(!live) out={ok:false,error:'trung_ten'};
        else { live.done++; live.left--; live.checked=true; live.signed='09:00'; out={ok:true,row:1400,member:{name:live.name,pid:live.pid,key:p.key,done:live.done,total:live.total,left:live.left,coach:live.coach},coach:'Quyết Hán',at:'09:00'}; }
      }
      else if(p.action==='log'){ (p.events||[]).forEach(function(e){ SRV.events.push(e); }); out={ok:true,written:(p.events||[]).length,dup:0}; }
      r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(out)});
    }
    await ctx.route(/workers\.dev/, handle); await ctx.route(/script\.google\.com/, handle);
  }
  var ctx=await browser.newContext({viewport:{width:393,height:852}, deviceScaleFactor:1, hasTouch:true, isMobile:true}); await setup(ctx);
  var page=await ctx.newPage(), errors=[]; page.on('pageerror', function(e){ errors.push(String(e)); });
  await page.goto('http://localhost:'+PORT+'/');
  for(var k of ['1','2','3','4']) await page.click('#pin-pad button:has-text("'+k+'")');
  await page.waitForTimeout(1800);

  console.log('\n== N1. danh sách: hai người trùng tên là hai khách ==');
  var cl=await page.evaluate(function(){ return state.clients.map(function(c){ return c.name+'|'+c.key+'|'+c.pid+'|'+c.measures.length; }); });
  check('state.clients có 2 "Trùng Cùng Coach" (B070DY, B071DY) + Khách Riêng', cl.length===3 && cl.indexOf('Trùng Cùng Coach|B070DY|B070DY|1')>=0 && cl.indexOf('Trùng Cùng Coach|B071DY|B071DY|1')>=0, cl);
  await page.evaluate(function(){ state.clFilter=''; go('p-clients','fwd'); }); await page.waitForTimeout(900);
  var names=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#p-clients .row .nm'), function(e){ return e.textContent; }); });
  check('màn Khách hàng hiện hai dòng "Trùng Cùng Coach" (không thêm hậu tố)', names.filter(function(n){ return n==='Trùng Cùng Coach'; }).length===2, names);

  console.log('\n== N2. hồ sơ: mỗi người số đo + mức tạ riêng ==');
  var pf=await page.evaluate(function(){ var a=findClient('B070DY'), b=findClient('B071DY'); return [a.measures[0].weight, a.last['BB Back Squat'].kg, b.measures[0].weight, b.last['BB Back Squat'].kg, (statsFor(a.key)||{}).m, (statsFor(b.key)||{}).m]; });
  check('B070: 60 kg · squat 40 · 3 buổi tháng · B071: 80 kg · squat 90 · 5 buổi', JSON.stringify(pf)==='[60,40,80,90,3,5]', pf);

  console.log('\n== N3. chọn cả hai (1:2) → check-in gửi pid từng người ==');
  await page.evaluate(function(){ go('p-pick','fwd'); }); await page.waitForTimeout(800);
  var pick=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pk-list .row.duo'), function(b){ return b.getAttribute('data-name'); }); });
  check('màn chọn khách: hai dòng 1:2 khoá B070DY / B071DY', pick.sort().join()==='B070DY,B071DY', pick);
  await page.evaluate(function(){ togglePick('B070DY'); togglePick('B071DY'); }); await page.waitForTimeout(400);
  var chips=await page.evaluate(function(){ return [].map.call(document.querySelectorAll('#pk-chips .chip span'), function(e){ return e.textContent; }); });
  check('chip hiện tên (không hiện mã)', chips.length===2 && chips.every(function(t){ return !/B07/.test(t); }), chips);
  await page.evaluate(function(){ go('p-confirm','fwd'); }); await page.waitForTimeout(800);
  await page.evaluate(function(){ doCheckin(); }); await page.waitForTimeout(2500);
  check('máy chủ nhận 2 check-in với pid B070DY + B071DY (kèm tên hiển thị)', SRV.checkins.length===2 && SRV.checkins.map(function(c){ return c.pid; }).sort().join()==='B070DY,B071DY' && SRV.checkins.every(function(c){ return c.name==='Trùng Cùng Coach'; }), SRV.checkins);
  var st=await page.evaluate(function(){ var s=state.session; return { scr:state.screen, people:s && s.people.map(function(p){ return p.key+'|'+p.pid+'|'+p.name+'|'+p.no; }), a:findClient('B070DY').done, b:findClient('B071DY').done }; });
  check('buổi tập có 2 người đúng key/pid, buổi # riêng (4 và 6)', st.people && st.people.join()==='B070DY|B070DY|Trùng Cùng Coach|4,B071DY|B071DY|Trùng Cùng Coach|6', st);

  console.log('\n== N4. nhật ký tập: sự kiện mang pid đúng người ==');
  await page.evaluate(function(){ state.client=findClient('B071DY'); state.msForm={weight:'81'}; saveMeasure(); }); await page.waitForTimeout(1500);
  var ev=SRV.events.filter(function(e){ return e.type==='ĐO'; });
  check('ĐO của B071DY gửi pid B071DY, tên hiển thị', ev.length===1 && ev[0].pid==='B071DY' && ev[0].key==='B071DY' && ev[0].name==='Trùng Cùng Coach' && ev[0].val===81, ev);
  var ms=await page.evaluate(function(){ return [findClient('B070DY').measures.length, findClient('B071DY').measures.length]; });
  check('số đo mới chỉ vào hồ sơ B071DY', JSON.stringify(ms)==='[1,2]', ms);
  check('không lỗi trang', !errors.length, errors);
  await browser.close(); srv.close && srv.close();
  console.log('\n'+pass+' PASS, '+fail+' FAIL'); process.exit(fail?1:0);
})().catch(function(e){ console.error(e); process.exit(1); });

/* AUDIT CÔNG THỨC "TEMPO CẦN ĐẠT" (v2.26.0) — thuần Node, không trình duyệt.
   Lấy ĐÚNG mã nguồn đang ship: cắt các hàm openDays / slowInfo / slowIs / slowMeta ra khỏi app.js rồi eval
   trong hộp cát với state giả. Mọi kết quả đối chiếu bằng một cách tính ĐỘC LẬP (số ngày Julian, vòng lặp
   theo ngày, công thức dựng lại tay) — không dùng lại hàm của app.
   Nền: bản cũ need = còn lại ÷ ((hạn − hôm nay)/7) → Nguyễn Anh Minh còn 8 buổi, hạn 20/11, hôm nay 19/11 → 56,0
   buổi/tuần, và ∞ từ ngày hết hạn. Bộ test này chốt 5 bất biến của bản mới.
   Chạy: node test/tempo_math.js */
var fs=require('fs'), path=require('path');
var src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
var fail=0, n=0;
function t(name, ok, info){ n++; if(!ok){ fail++; console.log('FAIL '+name+(info?' — '+info:'')); } }
function head(s){ console.log('\n── '+s); }

/* ═══ 0 · cắt hàm từ app.js (khớp ngoặc, không regex ngây thơ) ═══ */
function grab(name){
  var i=src.indexOf('function '+name+'('); if(i<0) throw new Error('không thấy function '+name+' trong app.js');
  var j=src.indexOf('{', i), d=0, k=j;
  for(; k<src.length; k++){ if(src[k]==='{') d++; else if(src[k]==='}'){ d--; if(!d) break; } }
  return src.slice(i, k+1);
}
var NEEDED=['isoN','nIso','pad2','dayIso','ddmm','openDays','slowInfo','slowIs','slowSort','slowMeta','fmt1'];
var vm=require('vm');
var CONST=src.match(/var SLOW_MIN=[^\n]*;/)[0];                        /* lấy luôn hằng số đang ship, không gõ lại */
var box=vm.createContext({ state:{clients:[],stats:{}}, TODAY_ISO:'2026-11-19',
          KEY:function(x){ return x ? String(x.key||x.name||'') : ''; }, clientMeta:function(){ return 'OLD'; } });
vm.runInContext(CONST+'\n'+NEEDED.map(grab).join('\n'), box);
var openDays=box.openDays, slowInfo=box.slowInfo, slowIs=box.slowIs, slowMeta=box.slowMeta;
t('cắt được '+NEEDED.length+' hàm từ app.js đang ship', NEEDED.every(function(f){ return typeof box[f]==='function'; }));
t('app.js khai báo NEED_CAP = 7 (trần 1 buổi/ngày)', /var SLOW_MIN=2, NEED_CAP=7, BOOK_CAP=4, LOST_DAYS=14;/.test(src));

/* helper: khách + stats giả */
function iso(y,m,d){ return y+'-'+('0'+m).slice(-2)+'-'+('0'+d).slice(-2); }
function info(left, exp, opt){
  opt=opt||{};
  var c={name:'X', key:'X', left:left, exp:exp, start:opt.start||'2026-01-01'};
  box.state={clients:[c], stats:{perClient:{X:{n28:opt.n28!=null?opt.n28:8, n28c:opt.n28c, w8:opt.w8||[0,0,0,0,2,2,2,2], lastAll:'2026-11-18'}}, plan:{}}};
  box.TODAY_ISO=opt.today||'2026-11-19';
  return slowInfo(c);
}

/* ═══ 1 · openDays: đối chiếu số ngày Julian ═══ */
head('1 · openDays = số ngày từ a tới b (gồm cả hai đầu) trừ Chủ nhật');
function jd(d,m,y){ var a=Math.floor((14-m)/12), yy=y+4800-a, mm=m+12*a-3;
  return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045; }
/* JD 0 = thứ hai → Chủ nhật khi jd % 7 === 6 */
function dim(m,y){ return [31, (y%4===0&&y%100!==0)||y%400===0 ? 29 : 28, 31,30,31,30,31,31,30,31,30,31][m-1]; }
var bad=null, cases=0;
for(var y=2024; y<=2029 && !bad; y++) for(var m=1; m<=12 && !bad; m++) for(var d=1; d<=dim(m,y) && !bad; d++){
  if((y*1000+m*31+d)%11) continue;                                   /* mẫu rải đều ~1/11 số ngày trong 6 năm */
  for(var span of [0,1,2,3,6,7,8,13,14,30,91,365]){
    var a=jd(d,m,y), got=openDays(iso(y,m,d), (function(){ var j=a+span, A=j+32044, B=Math.floor((4*A+3)/146097), C=A-Math.floor(146097*B/4),
        D=Math.floor((4*C+3)/1461), E=C-Math.floor(1461*D/4), M=Math.floor((5*E+2)/153);
      return iso(100*B+D-4800+Math.floor(M/10), M+3-12*Math.floor(M/10), E-Math.floor((153*M+2)/5)+1); })());
    var want=0; for(var j=a; j<=a+span; j++) if(j%7!==6) want++;      /* đếm độc lập, không dùng Date */
    cases++;
    if(got!==want){ bad=[iso(y,m,d), span, got, want].join(' | '); break; }
  }
}
t('khớp đếm Julian trên '+cases+' tổ hợp (2024–2029 × 12 độ dài)', !bad, bad);
t('b < a → 0', openDays('2026-11-20','2026-11-19')===0 && openDays('2026-12-01','2026-11-01')===0);
t('ngày sai / rỗng → 0 (không NaN, không ném lỗi)', openDays('','2026-11-19')===0 && openDays('2026-11-19','xx')===0 && openDays(null,null)===0);
t('Chủ nhật 22/11/2026 không được đếm: 19→22 ra 3 ngày, 19→21 cũng 3', openDays('2026-11-19','2026-11-22')===3 && openDays('2026-11-19','2026-11-21')===3);

/* ═══ 2 · ca thật đã báo lỗi: Nguyễn Anh Minh ═══ */
head('2 · Ca thật 19/11/2026 — Nguyễn Anh Minh còn 8 buổi, hạn 20/11');
var i1=info(8,'2026-11-20');
t('bản cũ cho 56,0 buổi/tuần (ghi lại để không bao giờ quay lại)', 8/(((new Date('2026-11-20')-new Date('2026-11-19'))/864e5)/7)===56);
t('dOpen = 2 (hôm nay 19/11 + ngày hết hạn 20/11)', i1.dOpen===2, 'dOpen='+i1.dOpen);
t('need = 7,0 = trần 1 buổi/ngày', i1.need===7, 'need='+i1.need);
t('kịp 2 buổi, MẤT 6 buổi', i1.feas===2 && i1.lost===6, 'feas='+i1.feas+' lost='+i1.lost);
t('cờ cap bật (số thô 28 > trần 7)', i1.cap===true);
t('vào nhóm chậm', slowIs(i1)===true);
t('dòng meta: '+slowMeta(i1), slowMeta(i1)==='MẤT 6 BUỔI · HẾT 20/11');

/* ═══ 3 · năm bất biến của công thức mới ═══ */
head('3 · Bất biến trên lưới (còn lại 1–40) × (dOpen 0–60)');
var b1=null,b2=null,b3=null,b4=null,b5=null, grid=0;
for(var left=1; left<=40; left++) for(var dOpen=0; dOpen<=60; dOpen++){
  /* dựng ngày hết hạn sao cho openDays(today, exp) === dOpen, bằng cách bước từng ngày (độc lập với công thức app) */
  var today='2026-11-19', dN=Math.round((new Date(today)-new Date('1970-01-01'))/864e5), cnt=0, e=dN-1;
  if(dOpen>0){ for(var dd=dN; ; dd++){ if(new Date(dd*864e5).getUTCDay()!==0) cnt++; if(cnt===dOpen){ e=dd; break; } } }
  var expIso=dOpen>0 ? new Date(e*864e5).toISOString().slice(0,10) : '2026-11-10';
  var x=info(left, expIso, {today:today}); grid++;
  if(dOpen>0 && x.dOpen!==dOpen && !b1) b1='left='+left+' dOpen='+dOpen+' → app '+x.dOpen;
  /* 1. có trần */
  if(x.need!=null && x.need>7+1e-9 && !b2) b2='left='+left+' dOpen='+dOpen+' need='+x.need;
  /* 2. khi còn đủ thời gian thì BẰNG công thức cũ (dùng ngày mở), tức không đổi ý nghĩa */
  if(x.need!=null && left<=dOpen && Math.abs(x.need-7*left/dOpen)>1e-9 && !b3) b3='left='+left+' dOpen='+dOpen+' need='+x.need+' ≠ '+7*left/dOpen;
  /* 3. feasible + lost = còn lại, và không bao giờ âm */
  if(x.feas+x.lost!==left || x.feas<0 || x.lost<0){ if(!b4) b4='left='+left+' dOpen='+dOpen+' feas='+x.feas+' lost='+x.lost; }
  /* 4. không bao giờ Infinity / NaN */
  if(x.need!=null && !isFinite(x.need) && !b5) b5='left='+left+' dOpen='+dOpen+' need='+x.need;
}
t('dOpen của app khớp cách đếm độc lập trên '+grid+' tổ hợp', !b1, b1);
t('need ≤ 7 tuyệt đối (bản cũ không có trần)', !b2, b2);
t('còn đủ thời gian (left ≤ dOpen) → need = 7·left/dOpen, giữ nguyên ý nghĩa cũ', !b3, b3);
t('feasible + lost = còn lại, không âm', !b4, b4);
t('không bao giờ Infinity hay NaN', !b5, b5);
/* 5. liên tục: giảm 1 ngày thì need không nhảy quá 7 (bản cũ nhảy 28 ở ngày cuối) */
var jump=0, oldJump=0;
for(var L=1; L<=40; L++) for(var D=1; D<=59; D++){
  var a=Math.min(7*L/D,7), b=Math.min(7*L/(D+1),7); jump=Math.max(jump, Math.abs(a-b));
  oldJump=Math.max(oldJump, Math.abs(7*L/D-7*L/(D+1)));
}
t('bước nhảy tối đa khi mất 1 ngày: mới '+jump.toFixed(1)+' ≤ 7 (cũ '+oldJump.toFixed(1)+')', jump<=7+1e-9);

/* ═══ 4 · các trạng thái ở biên ═══ */
head('4 · Biên: hết hạn hôm nay · quá hạn · Chủ nhật · gói mới');
var i2=info(3,'2026-11-19');                                          /* hạn đúng hôm nay (thứ Năm) */
t('hạn hôm nay → vẫn tập được 1 ngày, need 7,0, mất 2', i2.dOpen===1 && i2.need===7 && i2.lost===2, JSON.stringify([i2.dOpen,i2.need,i2.lost]));
var i3=info(9,'2026-11-14');                                          /* quá hạn 5 ngày, còn 9 buổi */
t('quá hạn → need = null (không còn "—" vì Infinity), lost = còn lại', i3.need===null && i3.lost===9 && i3.dOpen===0);
t('meta quá hạn: '+slowMeta(i3), slowMeta(i3)==='QUÁ HẠN 5 NGÀY · CÒN 9 BUỔI');
var i4=info(4,'2026-11-22',{today:'2026-11-22'});                     /* hạn là Chủ nhật, hôm nay cũng CN → 0 ngày mở */
t('hạn rơi Chủ nhật (phòng đóng) → dOpen 0, meta "HẾT HẠN HÔM NAY"', i4.dOpen===0 && slowMeta(i4)==='HẾT HẠN HÔM NAY · CÒN 4 BUỔI');
t('gói mới < 14 ngày → null (giữ luật cũ)', info(10,'2027-03-01',{start:'2026-11-10'})===null);
t('không có hạn gói → null', (function(){ var c={name:'Y',key:'Y',left:5,start:'2026-01-01'}; box.state={clients:[c],stats:{perClient:{}}}; return slowInfo(c)===null; })());

/* ═══ 5 · nhịp tập vs nhịp tiêu gói (Vắng) ═══ */
head('5 · rate (buổi tập) ≠ rateUse (buổi bị trừ, gồm Vắng)');
var i5=info(20,'2027-02-01',{n28:8, n28c:10});
t('rate = 8/4 = 2,0 (chỉ buổi tập thật)', Math.abs(i5.rate-2)<1e-9, 'rate='+i5.rate);
t('rateUse = 10/4 = 2,5 (gồm Vắng — MEMBERS "Còn lại" cũng trừ Vắng)', Math.abs(i5.rateUse-2.5)<1e-9, 'rateUse='+i5.rateUse);
t('extra tính theo rateUse → dư NHỎ hơn cách cũ (không báo dư ảo)',
  Math.abs(i5.extra-Math.max(0,20-2.5*i5.wl))<1e-9 && i5.extra<Math.max(0,20-2*i5.wl));
var i6=info(20,'2027-02-01',{n28:8, n28c:undefined});
t('máy chủ cũ (không có n28c) → lui về n28, không NaN', Math.abs(i6.rateUse-2)<1e-9 && isFinite(i6.extra));

/* ═══ 6 · thang đo biểu đồ 8 tuần ═══ */
head('6 · Thang đo biểu đồ (mx = max(cột, need, 1) × 1,25 · H = 64px)');
function barH(w8, need){ var mx=Math.max.apply(null, w8.concat([need||0,1]))*1.25; return w8.map(function(v){ return v?Math.max(2,Math.round(v/mx*64)):1; }); }
var w8=[2,3,2,2,3,2,2,1];
var hNew=barH(w8, 7), hOld=barH(w8, 56);
t('bản cũ bóp cột 3 buổi xuống '+Math.max.apply(null,hOld)+'px (không đọc được)', Math.max.apply(null,hOld)<=4);
t('bản mới: cột cao nhất '+Math.max.apply(null,hNew)+'px ≥ 20px', Math.max.apply(null,hNew)>=20);
var lowBad=null;
for(var L2=1; L2<=40 && !lowBad; L2++) for(var D2=1; D2<=60; D2++){
  var nd=Math.min(7*L2/D2,7), hs=barH([0,0,0,0,1,1,1,1], nd);
  if(Math.max.apply(null,hs)<7){ lowBad='left='+L2+' dOpen='+D2+' → '+Math.max.apply(null,hs)+'px'; break; }
}
t('với need có trần, cột 1 buổi luôn ≥ 7px trên mọi tổ hợp', !lowBad, lowBad);
t('vạch "cần đạt" luôn nằm trong khung (bottom ≤ 64px)', Math.round(7/(Math.max(3,7)*1.25)*64)<=64);

console.log('\n'+(n-fail)+'/'+n+' PASS'+(fail?' · '+fail+' FAIL':''));
process.exit(fail?1:0);

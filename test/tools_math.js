/* AUDIT CÔNG THỨC của ba công cụ tính (v2.25.0) — thuần Node, không trình duyệt.
   Mọi kết quả được đối chiếu với một cách tính ĐỘC LẬP, không dùng lại hàm của app:
     · hết hạn hợp đồng  → số ngày Julian (thuật toán Fliegel–Van Flandern), không dùng Date của JS
     · phí quẹt thẻ      → BigInt (số nguyên lớn, không sai số dấu phẩy động)
     · chuỗi VietQR      → bóc ngược TLV theo EMVCo + CRC-16/CCITT-FALSE dựng lại bằng bảng tra
   Chạy: node test/tools_math.js */
var S=require('../sell.js').SVE;
var fail=0, n=0;
function t(name, ok, info){ n++; if(!ok){ fail++; console.log('FAIL '+name+(info?' — '+info:'')); } }
function head(s){ console.log('\n── '+s); }

/* ═══ 1 · HẾT HẠN HỢP ĐỒNG ═══ số ngày Julian: không dùng Date, không dùng hàm của app ═══ */
head('1 · Hết hạn hợp đồng = ngày bắt đầu + số tuần × 7');
function jd(d,m,y){ var a=Math.floor((14-m)/12), yy=y+4800-a, mm=m+12*a-3;
  return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045; }
function fromJd(j){ var a=j+32044, b=Math.floor((4*a+3)/146097), c=a-Math.floor(146097*b/4),
  dd=Math.floor((4*c+3)/1461), e=c-Math.floor(1461*dd/4), mm=Math.floor((5*e+2)/153);
  return {d:e-Math.floor((153*mm+2)/5)+1, m:mm+3-12*Math.floor(mm/10), y:100*b+dd-4800+Math.floor(mm/10)}; }
var WD=['THỨ HAI','THỨ BA','THỨ TƯ','THỨ NĂM','THỨ SÁU','THỨ BẢY','CHỦ NHẬT'];   /* JD 0 = thứ hai */
function dim(m,y){ return [31, (y%4===0&&y%100!==0)||y%400===0 ? 29 : 28, 31,30,31,30,31,31,30,31,30,31][m-1]; }

var cases=0, bad=null;
for(var y=1990; y<=2100; y++) for(var m=1; m<=12; m++) for(var d=1; d<=dim(m,y); d++){
  if((y*1000+m*31+d)%7) continue;                                  /* mẫu rải đều ~1/7 số ngày trong 111 năm */
  for(var w of [1,2,4,8,12,16,24,26,52,99,260,999]){
    var got=S.expiry(d,m,y,w); cases++;
    var want=fromJd(jd(d,m,y)+w*7);
    var okd=got && got.d===want.d && got.m===want.m && got.y===want.y;
    var okw=got && got.wd===WD[(jd(d,m,y)+w*7)%7];
    var okn=got && got.days===w*7;
    if(!(okd&&okw&&okn) && !bad) bad=[d,m,y,w,JSON.stringify(got),JSON.stringify(want),WD[(jd(d,m,y)+w*7)%7]];
    if(!(okd&&okw&&okn)) break;
  }
  if(bad) break;
}
t('ngày + thứ + số ngày đúng trên '+cases+' tổ hợp (1990–2100 × 12 mốc tuần)', !bad, bad&&bad.join(' | '));

/* ngày không có thật phải trả null — tuyệt đối không tự tràn sang tháng sau */
var nulls=[[31,2,2026],[30,2,2024],[29,2,2026],[31,4,2026],[31,6,2026],[31,9,2026],[31,11,2026],[0,1,2026],[32,1,2026],[1,0,2026],[1,13,2026],[1,1,1899],[1,1,2201],[1,1,99]];
t('14 ngày không có thật / ngoài dải đều trả null', nulls.every(function(c){ return S.expiry(c[0],c[1],c[2],12)===null; }),
  JSON.stringify(nulls.filter(function(c){ return S.expiry(c[0],c[1],c[2],12)!==null; })));
t('29.02 năm nhuận thì hợp lệ (2024 · 2028)', S.expiry(29,2,2024,1)!==null && S.expiry(29,2,2028,1)!==null);
t('năm nhuận 2100 KHÔNG có 29.02 (luật 100/400)', S.expiry(29,2,2100,1)===null);
t('số tuần 0 hoặc âm → null (không tính được)', S.expiry(15,11,2026,0)===null && S.expiry(15,11,2026,-4)===null);
t('mốc chủ studio chốt: 15.11.2026 + 12 tuần = 07.02.2027, CHỦ NHẬT, 84 ngày',
  S.dmy(S.expiry(15,11,2026,12))==='07.02.2027' && S.expiry(15,11,2026,12).wd==='CHỦ NHẬT' && S.expiry(15,11,2026,12).days===84);
t('thời hạn gói trong Tài liệu vận hành: 36 buổi 12 tuần · 48 buổi 16 tuần · 72 buổi 24 tuần cho đúng ngày',
  S.dmy(S.expiry(1,3,2027,12))==='24.05.2027' && S.dmy(S.expiry(1,3,2027,16))==='21.06.2027' && S.dmy(S.expiry(1,3,2027,24))==='16.08.2027');
t('hết hạn luôn TRÙNG THỨ với ngày bắt đầu (bội của 7)',
  [[1,1,2026],[29,2,2024],[31,12,2026],[15,11,2026]].every(function(c){
    var a=jd(c[0],c[1],c[2])%7, E=S.expiry(c[0],c[1],c[2],37); return (jd(E.d,E.m,E.y)%7)===a; }));
t('qua năm, qua tháng 2 nhuận: 20.12.2027 + 12 tuần = 13.03.2028', S.dmy(S.expiry(20,12,2027,12))==='13.03.2028');
t('dmy đệm 0 hai chữ số', S.dmy({d:7,m:2,y:2027})==='07.02.2027' && S.dmy({d:31,m:12,y:2026})==='31.12.2026');

/* ═══ 2 · PHÍ QUẸT THẺ ═══ đối chiếu BigInt ═══ */
head('2 · Phí quẹt thẻ — hai chiều, số nguyên tuyệt đối');
var F=S.CARDS.map(function(c){ return c.f; });
t('bảng phí Techcombank 08.2026 đúng 5 loại, đơn vị 1/100000', F.length===5 && F.join(',')==='660,1815,990,2530,3773');
t('hiển thị phần trăm: 660 → 0,66 · 1815 → 1,815 · 3773 → 3,773',
  S.pctTxt(660)==='0,66' && S.pctTxt(1815)==='1,815' && S.pctTxt(3773)==='3,773');

function feeB(t_,f){ var n=BigInt(t_)*BigInt(f), d=100000n; return Number((n+d-1n)/d); }          /* ⌈T × f⌉ */
function grossB(v,f){ var n=BigInt(v)*100000n, d=BigInt(100000-f); return Number((n+d-1n)/d); }   /* ⌈V ÷ (1−f)⌉ */

var A=[], i;
for(i=0;i<=S.AMAX && A.length<300;i+=1) A.push(i);                                   /* 0…299: các số rất nhỏ */
[1,7,999,1000,12345,99999,100000,370000,500000,1234567,5000000,9000000,12000000,25200000,36000000,
 99999999,100000000,999999999,1000000000,9999999999, S.AMAX, S.AMAX-1].forEach(function(v){ A.push(v); });
for(i=0;i<60000;i++) A.push(Math.floor(Math.random()*(S.AMAX+1)));                    /* ngẫu nhiên toàn dải */
for(i=0;i<20000;i++) A.push(Math.floor(Math.random()*40000000));                      /* dày hơn ở dải thật của phòng */

var eFee=0, eNet=0, eGro=0, eInv=0, eNeg=0, firstInv=null, firstFee=null;
F.forEach(function(f){ A.forEach(function(v){
  var fe=S.feeOf(v,f), nt=S.netOf(v,f), gr=S.gross(v,f);
  if(fe!==feeB(v,f)){ eFee++; if(!firstFee) firstFee='v='+v+' f='+f+' app '+fe+' đúng '+feeB(v,f); }
  if(nt!==v-feeB(v,f)) eNet++;
  if(gr!==grossB(v,f)) eGro++;
  if(nt<0 || fe<0) eNeg++;
  if(v>0 && S.netOf(gr,f)<v){ eInv++; if(!firstInv) firstInv='V='+v+' f='+f+' quẹt '+gr+' chỉ nhận '+S.netOf(gr,f); }
}); });
t('phí = ⌈T × f⌉ khớp BigInt trên '+(A.length*F.length).toLocaleString('vi')+' phép thử', eFee===0, firstFee);
t('phòng nhận = T − phí khớp BigInt', eNet===0);
t('số phải quẹt = ⌈V ÷ (1−f)⌉ khớp BigInt trong trần AMAX', eGro===0);
t('không bao giờ ra số âm', eNeg===0);
t('BẤT BIẾN hai chiều: quẹt đúng số đề xuất thì phòng LUÔN nhận đủ (netOf(gross(V)) ≥ V)', eInv===0, firstInv);

/* Vì sao phải có trần: trên 90 tỉ, V × 100000 vượt 2^53 nên gross() lệch 1 ₫ — đây là các phản ví dụ đã dựng được.
   Giữ lại trong test để ai đó định nới trần thì thấy ngay hậu quả (muốn nới phải đổi gross sang BigInt). */
var OVER=[[852859157205,1815],[839423443257,1815],[767306128743,1815],[922702232201,1815]];
t('phản ví dụ ngoài trần vẫn còn (lý do giữ AMAX): gross lệch 1 ₫ ở dải > 90 tỉ',
  OVER.every(function(c){ return S.gross(c[0],c[1])===grossB(c[0],c[1])-1; }),
  JSON.stringify(OVER.map(function(c){ return [c[0], S.gross(c[0],c[1]), grossB(c[0],c[1])]; })));
t('ngay tại trần AMAX và sát trần thì vẫn đúng tuyệt đối',
  F.every(function(f){ return S.gross(S.AMAX,f)===grossB(S.AMAX,f) && S.gross(S.AMAX-1,f)===grossB(S.AMAX-1,f) && S.feeOf(S.AMAX,f)===feeB(S.AMAX,f); }));
t('phí không bao giờ ≥ số quẹt (f < 100 %)', F.every(function(f){ return S.feeOf(S.AMAX,f)<S.AMAX && S.netOf(1,f)>=0; }));
t('số 0: phí 0 · nhận 0 · quẹt 0', F.every(function(f){ return S.feeOf(0,f)===0 && S.netOf(0,f)===0 && S.gross(0,f)===0; }));
t('mốc tay: quẹt 5.000.000 thẻ Quốc tế TCB 1,815 % → phí 90.750 · phòng nhận 4.909.250',
  S.feeOf(5000000,1815)===90750 && S.netOf(5000000,1815)===4909250, 'phí '+S.feeOf(5000000,1815));
t('mốc tay: muốn nhận đủ 5.000.000 → quẹt 5.092.428 (⌈5.000.000 ÷ 0,98185⌉)', S.gross(5000000,1815)===5092428, String(S.gross(5000000,1815)));
t('mốc tay: quẹt 1.000.000 nội địa TCB 0,66 % → phí 6.600 · nhận 993.400', S.feeOf(1000000,660)===6600 && S.netOf(1000000,660)===993400);
t('phí làm tròn LÊN: quẹt 1 ₫ thẻ 0,66 % → phí 1 ₫ (không phải 0)', S.feeOf(1,660)===1);
t('vnd ngăn nghìn bằng dấu chấm', S.vnd(5092428)==='5.092.428' && S.vnd(0)==='0' && S.vnd(999)==='999');
t('tr đọc triệu đủ tới nghìn', S.tr(7200000)==='7,2' && S.tr(5905000)==='5,905' && S.tr(2000000)==='2');

/* ═══ 3 · CHUỖI VIETQR ═══ bóc ngược TLV + CRC dựng bằng bảng tra ═══ */
head('3 · Mã QR nhận tiền — chuỗi VietQR (NAPAS 247 · EMVCo MPM)');
function parse(s){ var o={}, i=0; while(i<s.length){ var id=s.slice(i,i+2), L=+s.slice(i+2,i+4); if(isNaN(L)) return null; o[id]=s.slice(i+4,i+4+L); i+=4+L; } return o; }
var CRCT=(function(){ var T=[]; for(var i=0;i<256;i++){ var c=i<<8; for(var j=0;j<8;j++) c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF; T[i]=c; } return T; })();
function crcTab(s){ var c=0xFFFF; for(var i=0;i<s.length;i++) c=((c<<8)&0xFFFF)^CRCT[((c>>8)^s.charCodeAt(i))&0xFF]; return ('000'+c.toString(16).toUpperCase()).slice(-4); }

var BIN='970407', ACC='19001234567890';
var samples=[[2000000,'NGUYEN QUANG VINH GOI 36B'],[1,'A'],[9999999999,'B0DY 123456789012345678'],[500000,'TRA GOP KY 2'],[36000000,'N Q VINH 36B TRA GOP']];
var eq=0, firstQ=null;
samples.forEach(function(c){
  var q=S.vietqr(BIN, ACC, c[0], c[1]), P=parse(q.slice(0,-4)+'6304'+q.slice(-4)), ok=true, why='';
  var p=parse(q);
  if(p['00']!=='01'){ ok=false; why='payload format ≠ 01'; }
  if(p['01']!=='12'){ ok=false; why='không phải mã động (01 ≠ 12)'; }
  if(p['53']!=='704'){ ok=false; why='tiền tệ ≠ 704 (VND)'; }
  if(p['58']!=='VN'){ ok=false; why='quốc gia ≠ VN'; }
  if(p['54']!==String(c[0])){ ok=false; why='số tiền sai: '+p['54']; }
  var m=parse(p['38']||'');
  if(!m || m['00']!=='A000000727'){ ok=false; why='GUID NAPAS sai'; }
  var b=parse(m&&m['01']||'');
  if(!b || b['00']!==BIN || b['01']!==ACC){ ok=false; why='BIN / số tài khoản sai'; }
  if(m && m['02']!=='QRIBFTTA'){ ok=false; why='dịch vụ ≠ QRIBFTTA (chuyển khoản tới tài khoản)'; }
  var ad=parse(p['62']||'');
  if(!ad || ad['08']!==c[1]){ ok=false; why='nội dung sai: '+(ad&&ad['08']); }
  if(crcTab(q.slice(0,-4))!==q.slice(-4)){ ok=false; why='CRC sai'; }
  if(!/^[\x20-\x7E]+$/.test(q)){ ok=false; why='có ký tự ngoài ASCII in được'; }
  if(!ok){ eq++; if(!firstQ) firstQ=JSON.stringify(c)+' → '+why; }
});
t('5 mẫu: cấu trúc EMVCo, BIN + tài khoản, số tiền, nội dung, CRC đều đúng', eq===0, firstQ);
t('CRC của app khớp bảng tra CRC-16/CCITT-FALSE độc lập', (function(){ var q=S.vietqr(BIN,ACC,2000000,'TEST'); return S.crc16(q.slice(0,-4))===crcTab(q.slice(0,-4)); })());
t('đổi 1 ₫ thì CRC đổi theo (mã không bị "dính" số cũ)', S.vietqr(BIN,ACC,2000000,'X')!==S.vietqr(BIN,ACC,2000001,'X'));
t('độ dài TLV luôn 2 chữ số (nội dung ≤ 25, số tiền ≤ 10 chữ số → không có trường ≥ 100)',
  S.tlv('08','A').length===5 && S.tlv('08','1234567890123456789012345').length===29);
t('ascii: bỏ dấu, viết hoa, đ → D, gom khoảng trắng',
  S.ascii('Nguyễn Quang Vinh')==='NGUYEN QUANG VINH' && S.ascii('đồng  Đ')==='DONG D' && S.ascii('a-b/c')==='A B C');
t('ascii bỏ ký tự lạ (emoji, dấu câu) — chỉ còn A–Z 0–9 và khoảng trắng',
  /^[A-Z0-9 ]*$/.test(S.ascii('Gói 36B — trả góp (kỳ 1) 😀 #1')));

console.log('\n'+(n-fail)+'/'+n+' PASS'+(fail?' · '+fail+' FAIL':''));
process.exit(fail?1:0);

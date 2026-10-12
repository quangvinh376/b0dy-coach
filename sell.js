/* =====================================================================
   B0DY · Coach app — BÁN CHO KHÁCH MỚI (v2.9.0 · 12/10/2026)
   Thiết kế: Figma 714soNBELbh3mro8qZZ4Ar · page "Hỗ trợ bán hàng" (644:1276), vòng 10.
   Luồng: Hình thức tập → Tần suất → Thời gian → Gói tập → Ưu đãi → Đề xuất (bill) → Phương thức trả (36 · 48)
          → Hình thức trả → Loại thẻ → Giá trị phải trả | Họ tên khách → Quét mã QR (VietQR động) | Tiền mặt.
   Chỉ tính, không ghi gì lên máy chủ. Tài khoản nhận chuyển khoản lấy từ Script Properties (lệnh 'bank'),
   không ghi cứng trong repo (repo công khai).
   File gồm hai phần: SVE (bộ tính, thuần) + QRX (mã QR) chạy được trong Node để test (module.exports ở cuối),
   và phần giao diện chỉ chạy trong trình duyệt (dùng hạ tầng của app.js: go, api, notify, tw/after/MT, EO…).
   ===================================================================== */
'use strict';

/* ---------------- SVE · bộ tính bán hàng (nguồn: Figma Tài liệu vận hành hF86s7S66lfJ9YkbEHffTk) ---------------- */
var SVE=(function(){
  var PKG=[12,24,36,48,72];
  /* đơn giá mỗi buổi (1:2 = giá MỖI NGƯỜI, mỗi người một hợp đồng) */
  var PRICE={'1:1':{12:500000,24:450000,36:400000,48:370000,72:350000}, '1:2':{12:370000,24:340000,36:300000,48:270000,72:250000}};
  /* trần ưu đãi theo số buổi (chốt 12/10 11:05): [buổi tặng tối đa, giảm tối đa ‱] — gói 12 không ưu đãi */
  var CAP={12:[0,0], 24:[2,500], 36:[3,625], 48:[4,750], 72:[7,1000]};
  /* thời hạn gói (tuần) theo Tài liệu vận hành; gói 12 · 24 chưa có trong tài liệu → không in */
  var WEEKS={36:12, 48:16, 72:24};
  /* trả góp: chỉ gói 36 (2 kỳ) và 48 (3 kỳ) — kỳ 1 khi ký, kỳ sau thu trước buổi thứ n */
  var INST={36:[15], 48:[14,28]};
  /* phí quẹt thẻ Techcombank 08.2026, đơn vị 1/100000 (1815 = 1,815 %) — mỗi lần quẹt T = ⌈V ÷ (1 − f)⌉ */
  var CARDS=[{n:'Nội địa TCB',f:660},{n:'Quốc tế TCB',f:1815,logo:1},{n:'Nội địa khác',f:990},{n:'Quốc tế khác',f:2530,logo:1},{n:'Phát hành ở nước ngoài',f:3773}];
  var FREQ=[2,3,4,5], MONTHS=[1,2,3,4,6];

  function vnd(v){ return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
  function tr(v){ return String(Math.round(v/10000)/100).replace('.',','); }            /* 7.200.000 → 7,2 · 5.920.000 → 5,92 */
  function pctTxt(f){ return String(f/1000).replace('.',','); }                          /* 1815 → 1,815 */
  /* gói khớp nguyện vọng: mọi tổ hợp buổi/tuần × số tháng (1 tháng = 4 tuần) trong khoảng, làm tròn lên gói có sẵn, trần 72 */
  function match(f0,f1,m0,m1){
    var hit={};
    FREQ.forEach(function(f){ if(f<f0||f>f1) return; MONTHS.forEach(function(m){ if(m<m0||m>m1) return;
      var n=f*m*4, p=PKG.filter(function(k){ return k>=n; })[0]||72; hit[p]=1; }); });
    return PKG.filter(function(k){ return hit[k]; });
  }
  function price(mode,S){ return PRICE[mode==='1:2'?'1:2':'1:1'][S]; }
  function giftMax(S){ return (CAP[S]||[0,0])[0]; }
  /* giảm tối đa khi chưa tặng: S × giá × trần %, làm tròn xuống bước 10.000 ₫ */
  function dMax(mode,S){ var c=CAP[S]||[0,0]; return Math.floor(S*price(mode,S)*c[1]/10000/10000)*10000; }
  /* tặng và giảm trừ nhau trong một trần: tặng b trên B buổi → giảm ≤ D × (1 − b ÷ B), xuống bước 10.000 ₫ */
  function dCap(mode,S,b){ var B=giftMax(S); if(!B) return 0; b=Math.max(0,Math.min(B,b)); return Math.floor(dMax(mode,S)*(B-b)/B/10000)*10000; }
  /* vòng tặng thứ k (1…B) bị khoá khi phần giảm đang dùng đã chiếm chỗ của nó */
  function locked(mode,S,k,d){ return d>dCap(mode,S,k); }
  function quote(mode,S,b,d){
    var P=price(mode,S), B=giftMax(S); b=Math.max(0,Math.min(B,b|0)); d=Math.max(0,Math.min(dCap(mode,S,b), d|0));
    var total=S*P-d, n=S+b, W=WEEKS[S];
    return {mode:mode, S:S, P:P, b:b, d:d, B:B, D:dMax(mode,S), dcap:dCap(mode,S,b), sessions:n, total:total,
            unit:Math.round(total/n), weeks: W ? Math.ceil(n*W/S) : null, kys:INST[S]?INST[S].length+1:1, due:INST[S]||[]};
  }
  /* chia kỳ đều theo giá sau giảm: các kỳ làm tròn xuống 1.000 ₫, phần dư dồn vào kỳ 1 (chốt 12/10) */
  function split(total,n){ if(!(n>1)) return [total]; var b=Math.floor(total/n/1000)*1000, a=[total-b*(n-1)]; for(var i=1;i<n;i++) a.push(b); return a; }
  /* số quẹt để phòng nhận đủ V: T = ⌈V × 100000 ÷ (100000 − f)⌉ (số nguyên, không sai số dấu phẩy động) */
  function gross(v,f){ var num=v*100000, den=100000-f, q=Math.floor(num/den); while(q*den<num) q++; while((q-1)*den>=num) q--; return q; }
  /* chữ không dấu, viết hoa, chỉ A–Z 0–9 và khoảng trắng (đ → D) — đúng bộ ký tự nội dung chuyển khoản */
  var COMB=new RegExp('['+String.fromCharCode(0x300)+'-'+String.fromCharCode(0x36f)+']','g');
  function ascii(s){ return String(s==null?'':s).normalize('NFD').replace(COMB,'').replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
  /* nội dung chuyển khoản: HỌ TÊN + GÓI + TRẢ GÓP (nếu có). EMVCo cho tối đa 25 ký tự: dài hơn thì họ và tên đệm
     rút còn chữ cái đầu (NGUYEN QUANG VINH → N Q VINH, chốt 12/10); vẫn dài thì cắt phần tên cho vừa. */
  function memo(name, S, inst){
    var tail=S+'B'+(inst?' TRA GOP':''), n=ascii(name), full=(n?n+' ':'')+tail;
    if(full.length<=25) return full;
    var w=n.split(' ');
    if(w.length>1){ n=w.slice(0,-1).map(function(x){ return x.charAt(0); }).concat(w[w.length-1]).join(' '); full=n+' '+tail; if(full.length<=25) return full; }
    var room=25-tail.length-1; return room>0 ? (n.slice(0,room).trim()+' '+tail) : tail;
  }
  /* VietQR động (NAPAS 247 · EMVCo MPM): số tiền + nội dung điền sẵn. CRC-16/CCITT-FALSE, tính cả "6304". */
  function tlv(id,v){ v=String(v); return id+(v.length<10?'0':'')+v.length+v; }
  function crc16(s){ var c=0xFFFF; for(var i=0;i<s.length;i++){ c^=s.charCodeAt(i)<<8; for(var j=0;j<8;j++) c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF; } return ('000'+c.toString(16).toUpperCase()).slice(-4); }
  function vietqr(bin, acc, amount, content){
    var mai=tlv('00','A000000727')+tlv('01', tlv('00',bin)+tlv('01',acc))+tlv('02','QRIBFTTA');
    var p=tlv('00','01')+tlv('01','12')+tlv('38',mai)+tlv('53','704')+tlv('54',String(Math.round(amount)))+tlv('58','VN')+tlv('62',tlv('08',content))+'6304';
    return p+crc16(p);
  }
  var BANKS={'970407':'TECHCOMBANK'};
  return {PKG:PKG, PRICE:PRICE, CAP:CAP, WEEKS:WEEKS, INST:INST, CARDS:CARDS, FREQ:FREQ, MONTHS:MONTHS, BANKS:BANKS,
          vnd:vnd, tr:tr, pctTxt:pctTxt, match:match, price:price, giftMax:giftMax, dMax:dMax, dCap:dCap, locked:locked,
          quote:quote, split:split, gross:gross, ascii:ascii, memo:memo, tlv:tlv, crc16:crc16, vietqr:vietqr};
})();

/* ---------------- QRX · mã QR (ISO/IEC 18004) — chế độ chữ-số / byte, mức sửa lỗi H, tự chọn mặt nạ ----------------
   Theo thuật toán tham chiếu của Nayuki (MIT). Trả ma trận n × n (1 = đen) + mặt nạ module chức năng. */
var QRX=(function(){
  var EXP=[], LOG=[];
  (function(){ var x=1; for(var i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x&256) x^=0x11D; } for(var j=255;j<512;j++) EXP[j]=EXP[j-255]; })();
  function gmul(a,b){ return (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]]; }
  function rsDivisor(deg){ var r=[], i, j, root=1; for(i=0;i<deg-1;i++) r.push(0); r.push(1);
    for(i=0;i<deg;i++){ for(j=0;j<deg;j++){ r[j]=gmul(r[j],root); if(j+1<deg) r[j]^=r[j+1]; } root=gmul(root,2); } return r; }
  function rsRemainder(data, div){ var r=div.map(function(){ return 0; });
    for(var i=0;i<data.length;i++){ var f=data[i]^r.shift(); r.push(0); for(var j=0;j<div.length;j++) r[j]^=gmul(div[j],f); } return r; }
  /* mức H: số mã sửa lỗi mỗi khối · số khối (phiên bản 1–40) */
  var ECW=[-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30];
  var NB=[-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81];
  var ALNUM='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  function rawModules(v){ var r=(16*v+128)*v+64; if(v>=2){ var na=Math.floor(v/7)+2; r-=(25*na-10)*na-55; if(v>=7) r-=36; } return r; }
  function dataCodewords(v){ return Math.floor(rawModules(v)/8)-ECW[v]*NB[v]; }
  function alignPos(v){ if(v===1) return []; var n=v*4+17, na=Math.floor(v/7)+2, step=(v===32)?26:Math.ceil((v*4+4)/(na*2-2))*2, r=[6];
    for(var p=n-7; r.length<na; p-=step) r.splice(1,0,p); return r; }
  function utf8(s){ var out=[]; var e=unescape(encodeURIComponent(s)); for(var i=0;i<e.length;i++) out.push(e.charCodeAt(i)); return out; }
  function segBits(text, v){
    var bits=[], isAl=/^[0-9A-Z $%*+\-.\/:]*$/.test(text), i;
    function put(val, len){ for(var k=len-1;k>=0;k--) bits.push((val>>>k)&1); }
    if(isAl){ put(2,4); put(text.length, v<10?9:(v<27?11:13));
      for(i=0;i+2<=text.length;i+=2) put(ALNUM.indexOf(text[i])*45+ALNUM.indexOf(text[i+1]), 11);
      if(text.length%2) put(ALNUM.indexOf(text[text.length-1]), 6); }
    else { var b=utf8(text); put(4,4); put(b.length, v<10?8:16); b.forEach(function(x){ put(x,8); }); }
    return bits;
  }
  function encode(text, minVer){
    var v, bits;
    for(v=Math.max(1,minVer||1); v<=40; v++){ bits=segBits(text, v); if(bits.length<=dataCodewords(v)*8) break; }
    if(v>40) throw new Error('qr_too_long');
    var cap=dataCodewords(v)*8, i, j;
    function put(val, len){ for(var k=len-1;k>=0;k--) bits.push((val>>>k)&1); }
    put(0, Math.min(4, cap-bits.length)); put(0, (8-bits.length%8)%8);
    for(var pad=0xEC; bits.length<cap; pad^=0xEC^0x11) put(pad,8);
    var data=[]; for(i=0;i<bits.length;i+=8){ var by=0; for(j=0;j<8;j++) by=(by<<1)|bits[i+j]; data.push(by); }
    /* chia khối, thêm mã sửa lỗi, xen kẽ */
    var nb=NB[v], ecl=ECW[v], raw=Math.floor(rawModules(v)/8), nShort=nb-raw%nb, shortLen=Math.floor(raw/nb), div=rsDivisor(ecl), blocks=[], k=0;
    for(i=0;i<nb;i++){ var dat=data.slice(k, k+shortLen-ecl+(i<nShort?0:1)); k+=dat.length; var ecc=rsRemainder(dat, div); if(i<nShort) dat.push(0); blocks.push(dat.concat(ecc)); }
    var cw=[]; for(i=0;i<blocks[0].length;i++) for(j=0;j<blocks.length;j++) if(i!==shortLen-ecl || j>=nShort) cw.push(blocks[j][i]);
    /* ma trận */
    var n=v*4+17, M=new Uint8Array(n*n), F=new Uint8Array(n*n);
    function set(x,y,d){ M[y*n+x]=d?1:0; F[y*n+x]=1; }
    for(i=0;i<n;i++){ set(6,i,i%2===0); set(i,6,i%2===0); }
    function finder(cx,cy){ for(var dy=-4;dy<=4;dy++) for(var dx=-4;dx<=4;dx++){ var dist=Math.max(Math.abs(dx),Math.abs(dy)), x=cx+dx, y=cy+dy; if(x>=0&&x<n&&y>=0&&y<n) set(x,y,dist!==2&&dist!==4); } }
    finder(3,3); finder(n-4,3); finder(3,n-4);
    var ap=alignPos(v), na=ap.length;
    for(i=0;i<na;i++) for(j=0;j<na;j++){ if((i===0&&j===0)||(i===0&&j===na-1)||(i===na-1&&j===0)) continue;
      for(var ay=-2;ay<=2;ay++) for(var ax=-2;ax<=2;ax++) set(ap[i]+ax, ap[j]+ay, Math.max(Math.abs(ax),Math.abs(ay))!==1); }
    function formatBits(mask){ var d=(2<<3)|mask, r=d; for(var q=0;q<10;q++) r=(r<<1)^((r>>>9)*0x537); var b=((d<<10)|r)^0x5412;   /* mức H = 2 */
      for(q=0;q<=5;q++) set(8,q,(b>>>q)&1); set(8,7,(b>>>6)&1); set(8,8,(b>>>7)&1); set(7,8,(b>>>8)&1);
      for(q=9;q<15;q++) set(14-q,8,(b>>>q)&1);
      for(q=0;q<8;q++) set(n-1-q,8,(b>>>q)&1);
      for(q=8;q<15;q++) set(8,n-15+q,(b>>>q)&1);
      set(8,n-8,1); }
    formatBits(0);
    if(v>=7){ var r=v; for(i=0;i<12;i++) r=(r<<1)^((r>>>11)*0x1F25); var vb=(v<<12)|r;
      for(i=0;i<18;i++){ var bit=(vb>>>i)&1, a=n-11+i%3, b2=Math.floor(i/3); set(a,b2,bit); set(b2,a,bit); } }
    /* đặt dữ liệu zigzag */
    var bi=0, tot=cw.length*8;
    for(var right=n-1; right>=1; right-=2){ if(right===6) right=5;
      for(var vert=0; vert<n; vert++) for(j=0;j<2;j++){ var x=right-j, up=((right+1)&2)===0, y=up?n-1-vert:vert;
        if(!F[y*n+x] && bi<tot){ M[y*n+x]=(cw[bi>>>3]>>>(7-(bi&7)))&1; bi++; } } }
    function maskFn(m,x,y){ switch(m){ case 0: return (x+y)%2===0; case 1: return y%2===0; case 2: return x%3===0; case 3: return (x+y)%3===0;
      case 4: return (Math.floor(x/3)+Math.floor(y/2))%2===0; case 5: return x*y%2+x*y%3===0; case 6: return (x*y%2+x*y%3)%2===0; default: return ((x+y)%2+x*y%3)%2===0; } }
    function applyMask(m){ for(var y=0;y<n;y++) for(var x=0;x<n;x++) if(!F[y*n+x] && maskFn(m,x,y)) M[y*n+x]^=1; }
    function penalty(){
      var res=0, x, y, dark=0;
      function addH(len, h){ if(h[0]===0) len+=n; h.pop(); h.unshift(len); }
      function countP(h){ var c=h[1], core=c>0&&h[2]===c&&h[3]===c*3&&h[4]===c&&h[5]===c; return (core&&h[0]>=c*4&&h[6]>=c?1:0)+(core&&h[6]>=c*4&&h[0]>=c?1:0); }
      function term(col, len, h){ if(col){ addH(len,h); len=0; } len+=n; addH(len,h); return countP(h); }
      for(var pass=0; pass<2; pass++){
        for(var a=0;a<n;a++){ var rc=0, rl=0, h=[0,0,0,0,0,0,0];
          for(var b=0;b<n;b++){ var c=pass?M[b*n+a]:M[a*n+b];
            if(c===rc){ rl++; if(rl===5) res+=3; else if(rl>5) res++; }
            else { addH(rl,h); if(!rc) res+=countP(h)*40; rc=c; rl=1; } }
          res+=term(rc,rl,h)*40; } }
      for(y=0;y<n-1;y++) for(x=0;x<n-1;x++){ var c0=M[y*n+x]; if(c0===M[y*n+x+1] && c0===M[(y+1)*n+x] && c0===M[(y+1)*n+x+1]) res+=3; }
      for(x=0;x<n*n;x++) dark+=M[x];
      res+=(Math.ceil(Math.abs(dark*20-n*n*10)/(n*n))-1)*10;
      return res;
    }
    var best=0, bp=Infinity;
    for(var m=0;m<8;m++){ applyMask(m); formatBits(m); var p=penalty(); if(p<bp){ bp=p; best=m; } applyMask(m); }
    applyMask(best); formatBits(best);
    return {n:n, v:v, mask:best, mod:M, fn:F};
  }
  return {encode:encode};
})();

/* =====================================================================
   SVX · giao diện (chỉ trong trình duyệt) · v2.10.0 — chuyển động theo reel v10 (b0dy-ban-cho-khach-moi-reel-v10.mp4)
   Mỗi bước là một trang .page dựng lại bằng JS, luân phiên hai khung #p-sv / #p-sv2. Trang KHÔNG trượt: từng phần tử đổi tại chỗ
   như reel — tiêu đề trồi lên trong khung che, dãy số trồi từ dưới lên, hàng trả lời trồi + kẻ mảnh vẽ từ trái, bước cũ rút lên
   (lùi thì ngược chiều). Số 0 lộ trình vẽ trên MỘT canvas #sv-dial nằm dưới các trang, cùng đồng hồ MT của app.js (một rAF):
   mỗi hạt có hai đồng hồ — vị trí (lò xo) và dáng (cỡ · màu · độ sáng, có nảy) → hạt bay về vòng rồi sáng nối nhau theo tuần.
   Số ở tâm là DOM #sv-ctr: chữ số lăn kiểu đồng hồ. Khoảnh khắc riêng: lật máy sang phiếu, phiếu in từng nấc rồi xé, số tiền bay
   sang câu sau; dòng nội dung rơi thành thẻ VietQR, mã lan từ ô logo, ⌂ nở thành Xong; Xong → thẻ thu vào ô Acid → chấm bay về
   nút Sell. Rảnh 10 s thì số 0 thôi "thở" (không vẽ khi không cần). Giảm chuyển động: chỉ mờ, không dịch chuyển.
   ===================================================================== */
var SVX=null;
if(typeof window!=='undefined' && typeof document!=='undefined') SVX=(function(){
  var $id=function(id){ return document.getElementById(id); };
  var RAT=1.3068, CP=[250,250,250], CA=[212,255,0];
  function arcTs(rx,ry,n){ var M=1440, L=[0], px=0, py=-ry, i; for(i=1;i<=M;i++){ var t=i/M*2*Math.PI, x=rx*Math.sin(t), y=-ry*Math.cos(t); L.push(L[i-1]+Math.hypot(x-px,y-py)); px=x; py=y; }
    var tot=L[M], out=[], j=0; for(var k=0;k<n;k++){ var tg=tot*k/n; while(j<M && L[j+1]<tg) j++; var f=(tg-L[j])/((L[j+1]-L[j])||1); out.push((j+f)/M*2*Math.PI); } return out; }
  function ep(rx,ry,t,o){ var x=rx*Math.sin(t), y=-ry*Math.cos(t), nx=x/(rx*rx), ny=y/(ry*ry), l=Math.hypot(nx,ny)||1; return [x+nx/l*o, y+ny/l*o]; }
  /* 24 vạch = 24 tuần chia đều theo độ dài cung từ 12 giờ (chữ 0 có chấm, elip 1 : 1,3068) */
  var TS24=arcTs(128,128*RAT,24);
  /* trạng thái hạt (Figma "bộ sinh số 0"): [đường kính, màu, alpha (-1 = theo chiều sâu), rỗng]
     g tuần trống · v kỳ sau · d buổi còn lại · o còn trong trần tặng · q buổi tuỳ chọn (làn ngoài) · p buổi trong gói · a buổi tặng · m mốc thu kỳ sau */
  var SD={g:[3.6,CP,.16,0], v:[4.6,CP,.24,0], d:[5,CP,.40,0], o:[5.6,CP,.5,1], q:[5.6,CP,.5,1], p:[5.6,CP,-1,0], a:[6.6,CA,1,0], m:[8.4,CA,1,0]};
  /* 72 hạt chờ (Figma "số 0 · hạt chờ", toạ độ màn 393 × 852, tâm 196,5 · 376) — [x, y, đường kính, alpha] */
  var CL=[[195.13,207.78,4.73,.61],[175.09,216.05,4.09,.56],[168.46,205.24,4.43,.59],[157.26,219.51,4.84,.63],[135.89,232.01,5.57,.69],[126.3,235.35,3.36,.51],[122.87,245.94,2.36,.43],[111.93,259.41,1.91,.4],[105.09,255.76,3.49,.53],[105.52,268.03,3.37,.52],[95.04,279.4,4.74,.65],[80.47,293.43,5.63,.73],[89.71,309.42,4.64,.65],[69.1,328.91,3.44,.55],[60.57,336.95,5.35,.73],[75.68,345.56,3.11,.53],[62.19,360.27,3.69,.59],[62.63,379.34,6.43,.85],[64.96,404.39,6.31,.85],[74.17,400.8,2.05,.45],[71.33,423.13,3.47,.59],[74.7,446.53,5.23,.77],[93.36,451.09,2.92,.55],[94.59,460.67,4.16,.67],[91.51,473.7,3.97,.66],[98.85,479.2,6.36,.9],[107.58,496.55,4.59,.73],[109.86,510.9,7.05,.98],[128.37,518.68,2.41,.52],[132.35,504.86,7.2,.98],[139.69,521.88,6.95,.98],[158.62,534.4,7.71,.99],[168.23,532.59,6.24,.92],[167.78,547.75,2.27,.51],[184.71,539.49,7.81,1],[200.84,549.99,6.76,.98],[215.74,548.71,6.38,.94],[208.65,538.12,3.54,.64],[222.29,543.1,5.19,.81],[234.03,539.65,3.97,.69],[260.14,531.53,4.48,.74],[268.52,516.71,4.94,.78],[267.98,512.56,6.09,.89],[274.45,505.1,7.59,.98],[289.67,489.66,2.98,.57],[285.65,487.74,2.94,.56],[297.24,471.87,3.48,.61],[311.77,463.59,2.44,.51],[309.56,446.55,2.59,.51],[316.51,431.22,2.51,.5],[324.3,425.13,6.48,.88],[318.77,410.57,4.33,.67],[332.68,396.08,3.8,.61],[321.7,379.2,3.61,.59],[318.64,360.33,6.9,.88],[312.06,345.48,4.3,.64],[325.76,323.04,3.77,.58],[317.59,317.65,3.48,.55],[320.07,313.03,3.17,.52],[308.37,283.53,2.74,.47],[299.07,270.31,3.38,.53],[292.33,272.93,4.06,.58],[279.1,250.13,2.18,.42],[278.94,257.32,2.64,.46],[276.1,240.65,3.67,.54],[252.78,229.04,5.54,.69],[240.01,225.54,2.8,.46],[242.25,226.64,2.55,.44],[229.96,212.51,5.24,.66],[221.33,213.53,5.97,.72],[204,215.33,1.81,.37],[191.1,217.55,2.95,.47]];
  /* hạt chờ thứ k → (tuần, làn): xếp theo góc rồi theo bán kính → bay về đúng chỗ gần nhất trên số 0 */
  var CLM=(function(){ var pts=CL.map(function(p,k){ var u=p[0]-196.5, v=(p[1]-376)/RAT, a=Math.atan2(u,-v); if(a<-0.06) a+=2*Math.PI; return {k:k, a:a, r:Math.hypot(u,v)}; });
    pts.sort(function(A,B){ return A.a-B.a; }); var m=new Array(72);
    for(var w=0;w<24;w++){ var g=pts.slice(w*3,w*3+3).sort(function(A,B){ return A.r-B.r; }); for(var r=0;r<3;r++) m[w*3+r]=g[r].k; } return m; })();

  /* ---------- nhịp: đúng các đường cong của reel v10 ---------- */
  var EB=bez(.2,0,0,1), EIN=bez(.55,0,.8,.2), EOUT=bez(.16,1,.3,1);                 /* B0DY · vào nhanh dừng êm · rút đi · bật ra */
  var C_EB='cubic-bezier(.2,0,0,1)', C_EIN='cubic-bezier(.55,0,.8,.2)', C_EOUT='cubic-bezier(.16,1,.3,1)', C_EA='cubic-bezier(.22,.85,.22,1)', C_EIO='cubic-bezier(.65,0,.35,1)';
  function spring(t,w,z){ if(t<=0) return 0; if(z<1){ var wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); } return 1-Math.exp(-w*t)*(1+w*t); }
  function springE(w,z,dur){ return function(k){ return k>=1 ? 1 : spring(k*dur,w,z); }; }
  function seg(t,a,b){ return b<=a ? (t>=b?1:0) : clamp((t-a)/(b-a),0,1); }
  function pop(t){ return t<=0 ? 0 : spring(t,21,.44); }                               /* nảy: vượt 21 % rồi về */
  function mixc(a,b,p){ return [a[0]+(b[0]-a[0])*p, a[1]+(b[1]-a[1])*p, a[2]+(b[2]-a[2])*p]; }
  function qbez(a,c,b,t){ var u=1-t; return [u*u*a[0]+2*u*t*c[0]+t*t*b[0], u*u*a[1]+2*u*t*c[1]+t*t*b[1]]; }
  var SPR=springE(14,.72,.55);                                                         /* lò xo mặc định cho hình học số 0 (vượt ~4 %) */
  function anim(el,kf,o){ if(!el || !el.animate) return null; try{ return el.animate(kf,o); }catch(e){ return null; } }
  function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

  /* ---------- trạng thái bán hàng ---------- */
  var PGS=['p-sv','p-sv2'], PI=1, ST=null, HIST=[], STEP=null, LOCK=0, NAVT=0, ON=false, BANK=null, BANK_P=null, ADV=0, LASTQR='';
  var GEO={cx:196.5, cy:377, rx:128, gap:8, s:1};
  function fresh(){ return {mode:null, f:null, m:null, S:null, b:0, d:0, split:null, pay:null, card:null, names:['',''], who:0}; }
  function Q(){ return SVE.quote(ST.mode||'1:1', ST.S, ST.b, ST.d); }
  function kyList(){ var q=Q(); return (ST.split && q.kys>1) ? SVE.split(q.total, q.kys) : [q.total]; }
  function per(){ return ST.mode==='1:2' ? ' · MỖI NGƯỜI' : ''; }
  var vnd=SVE.vnd;

  /* ---------- hạt: 2 người (1:2 = hai số 0 lệch ±9 pt) × (24 tuần × 5 làn + vòng hai 3 tuần × 3 làn) ---------- */
  var SL=[];
  [0,1].forEach(function(p){ var w, l; for(w=0;w<24;w++) for(l=0;l<5;l++) SL.push({p:p, lap:1, w:w, l:l}); for(w=0;w<3;w++) for(l=0;l<3;l++) SL.push({p:p, lap:2, w:w, l:l}); });
  (function(){ var R=mulberry(29); SL.forEach(function(s){ s.r=[R(),R(),R(),R(),R(),R()]; }); })();
  function idxOf(s){ return s.lap===2 ? 72+s.w*3+s.l : (s.l<3 ? s.w*3+s.l : -1); }
  function vis(s, code, G){
    if(code==='cloud'){ var c=CL[CLM[s.w*3+s.l]], k=G.rx/128*(s.p?0.7:1); return {cl:1, cx:G.cx, cy:G.cy, u:(c[0]-196.5)*k, v:(c[1]-376)*k/RAT, d:c[2]*Math.max(.8,k), c:CP, a:c[3], h:0}; }
    var ry=G.rx*RAT, off=(s.lap===2 ? -(s.l+3) : (s.l-1))*G.gap, P=ep(G.rx, ry, TS24[s.w], off), dp=P[1]/ry, px=(ST && ST.mode==='1:2') ? (s.p?9:-9)*G.s : 0;
    if(!code) return {x:G.cx+P[0]+px, y:G.cy+P[1], d:3.6*G.s, c:CP, a:0, h:0};
    var sd=SD[code]; return {x:G.cx+P[0]+px, y:G.cy+P[1], d:sd[0]*(1+.12*dp)*G.s, c:sd[1], a:sd[2]<0 ? .86+.14*(.5+.5*dp) : sd[2], h:sd[3]};
  }
  /* đám mây đang "thở": xoay chậm 0,05 rad/s + rung ±1,4 pt (reel cloudA) — biên độ theo IDLE.amp */
  function tgt(s,B){ B=B||s.B; if(!B.cl) return B;
    var r=IDLE.rot, cs=Math.cos(r), sn=Math.sin(r), u=B.u*cs-B.v*sn, v=B.u*sn+B.v*cs, am=IDLE.amp, q=s.r;
    var dx=am*1.4*Math.sin(IDLE.t*(1.9+q[0]*1.6)+q[1]*6.28), dy=am*1.4*Math.cos(IDLE.t*(1.7+q[2]*1.5)+q[3]*6.28);
    return {x:B.cx+u+dx, y:B.cy+v*RAT+dy, d:B.d, c:B.c, a:B.a, h:0, arc:1, f:0, cl:1};
  }
  /* vệt sáng chạy quanh các hạt đã sáng (reel shimmer) */
  function live(s,P){
    if(IDLE.amp<0.002 || P.cl || P.h>0 || P.c[0]<200 || P.c[1]<200 || P.a<0.6 || s.lap!==1) return P;
    var k=Math.pow(Math.max(0, Math.cos(TS24[s.w]-2.1*IDLE.t)), 14)*IDLE.amp; if(k<0.01) return P;
    return {x:P.x, y:P.y, d:P.d*(1+.1*k), c:P.c, a:Math.min(1,P.a+.14*k), h:P.h, arc:P.arc, f:P.f, lab:P.lab, la:P.la};
  }
  function blend(A,B,p,pp){ var q=clamp(p,0,1); return {d:lerp(A.d,B.d,q)*(1+(pp||0)*Math.sin(Math.PI*q)), c:mixc(A.c,B.c,q), a:lerp(A.a,B.a,q), h:lerp(A.h,B.h,q), arc:B.h>A.h ? q : 1, la:lerp(A.lab?A.a:0, B.lab?B.a:0, q)}; }
  /* hai đồng hồ mỗi hạt: vị trí (tp, dp, ep — lò xo, có thể vượt) · dáng (ta, da, ea, nảy pop; M = dáng giữa chừng) */
  function cur(s){
    if(!s.B) return null; var B=tgt(s, s.B);
    if(!s.A) return live(s,B);
    var kp=s.dp>0 ? clamp((MT-s.tp)/s.dp,0,1) : 1, ka=s.da>0 ? clamp((MT-s.ta)/s.da,0,1) : 1, A=s.A;
    if(kp>=1 && ka>=1) return live(s,B);
    /* giảm chuyển động: hạt không bay — mờ dần tại chỗ cũ rồi hiện dần ở chỗ mới */
    if(s.fade){ var k=Math.max(kp,ka), F=k<.5 ? A : B, f=k<.5 ? 1-2*k : 2*k-1; return {x:F.x, y:F.y, d:F.d, c:F.c, a:F.a*f, h:F.h, arc:1, f:0, lab:F.lab, la:(F.lab?F.a:0)*f}; }
    if(s.path) return s.path(s,A,B,kp,ka);
    var e=s.ep(kp), ap=(s.M && MT<s.ta) ? blend(A, s.M, e, 0) : blend(s.M||A, B, s.ea(ka), s.pop);
    return live(s, {x:lerp(A.x,B.x,e), y:lerp(A.y,B.y,e), d:ap.d, c:ap.c, a:ap.a, h:ap.h, arc:ap.arc, f:0, lab:B.lab, la:ap.la});
  }
  /* hạt sinh ra: xoáy từ ngoài màn vào, to + nhoè rồi nét dần, chạm chỗ thì nảy nhẹ (reel genA) */
  function genPath(s,A,B,kp){
    if(kp<=0) return {x:B.x, y:B.y, d:B.d, c:CP, a:0, h:0, arc:1, f:0};
    var G=GEO, q=s.r, u=B.x-G.cx, v=(B.y-G.cy)/RAT, rho=Math.hypot(u,v), phi=Math.atan2(v,u), R0=420+q[0]*460, sw=.9+q[2], e=EOUT(kp);
    var rr=rho+R0*(1-e), st=seg(kp,.62,1); rr-=6*Math.sin(Math.PI*st)*(1-st);
    var ph=phi-sw*(1-EOUT(clamp(kp*1.06,0,1))), z=1+4.2*Math.pow(1-e,2.2);
    return {x:G.cx+rr*Math.cos(ph), y:G.cy+rr*Math.sin(ph)*RAT, d:B.d*z, c:CP, a:B.a*(.3+.7/z)*clamp(kp*6,0,1), h:0, arc:1, f:clamp((z-1)/3,0,1)};
  }
  /* lịch thu xoáy về tâm rồi tắt — nhường chỗ cho ô họ tên (reel dialGone) */
  function gonePath(s,A,B,kp){
    var G=GEO, e=EIN(kp), u=A.x-G.cx, v=A.y-G.cy, rr=Math.hypot(u,v)*(1-e), ph=Math.atan2(v,u)+.8*e;
    return {x:G.cx+rr*Math.cos(ph), y:G.cy+rr*Math.sin(ph), d:A.d*(1-.7*e), c:A.c, a:A.a*(1-EIN(seg(kp,.4,1))), h:A.h, arc:1, f:0};
  }
  /* các kế hoạch hạt theo bước — trả mã trạng thái hoặc null (ẩn) */
  function lane(s, litW, f0, f1, optW){
    if(s.lap!==1) return null;
    if(s.w<litW){ if(s.l<f0) return 'p'; if(s.l<f1) return 'q'; return s.l<3?'g':null; }
    if(s.w<optW){ if(s.l<f1) return 'q'; return s.l<3?'g':null; }
    return s.l<3?'g':null;
  }
  var PLAN={
    cloud:function(s){ return (s.lap===1 && s.l<3 && (s.p===0 || ST.mode==='1:2')) ? 'cloud' : null; },
    freq:function(s){ return lane(s, 4, ST.f[0], ST.f[1], 0); },
    months:function(s){ return lane(s, ST.m[0]*4, ST.f[0], ST.f[1], ST.m[1]*4); },
    pkg:function(s){ if(s.lap!==1 || s.l>2) return null; return s.w<ST.S/3 ? 'p' : 'g'; },
    deal:function(s){ var i=idxOf(s); if(i<0) return null; var q=Q(), k=i-ST.S;
      if(k>=0 && k<q.B){ if(k<q.b) return 'a'; if(SVE.locked(ST.mode,ST.S,k+1,q.d)) return s.lap===1?'g':null; return 'o'; }
      if(s.lap===2) return null; return i<ST.S ? 'p' : 'g'; },
    pay:function(s){ return payCode(s, false); },
    pos:function(s){ return payCode(s, true); },
    none:function(){ return null; }
  };
  function payCode(s, pos){
    var i=idxOf(s); if(i<0) return null; var n=ST.S+ST.b;
    if(i>=n) return s.lap===1 ? 'g' : null;
    var due=(ST.split && SVE.INST[ST.S]) ? SVE.INST[ST.S] : [];
    if(!due.length || i<due[0]-1) return 'p';
    for(var j=0;j<due.length;j++) if(i===due[j]-1) return 'm';
    return pos ? 'v' : 'd';
  }
  function mlabel(s){ var due=(ST.split && SVE.INST[ST.S]) ? SVE.INST[ST.S] : [], i=idxOf(s); for(var j=0;j<due.length;j++) if(i===due[j]-1) return 'KỲ '+(j+2); return ''; }
  var PLAN_NOW='none', NEED=false, SMALL=false;   /* SMALL: màn thấp, số 0 không đủ chỗ cho số ở tâm → tắt số 0 ở bước đó */
  function same(A,B){
    if(!A || !B) return false;
    if(A.cl || B.cl) return !!(A.cl && B.cl) && A.cx===B.cx && A.cy===B.cy && Math.abs(A.u-B.u)<.01 && Math.abs(A.v-B.v)<.01 && Math.abs(A.d-B.d)<.01 && Math.abs(A.a-B.a)<.002;
    return Math.abs(A.x-B.x)<.01 && Math.abs(A.y-B.y)<.01 && Math.abs(A.a-B.a)<.002 && Math.abs(A.d-B.d)<.01 && A.c[1]===B.c[1] && A.h===B.h && A.lab===B.lab;
  }
  /* đổi kế hoạch / hình học: mọi hạt đi tiếp từ chỗ đang hiện (ngắt được).
     o: dp/ep/stag (vị trí) · da/ea (dáng) · chase(s, mã cũ, mã mới) → trễ riêng cho dáng + pop/mid (sáng nối nhau theo tuần)
        from(s,B) (hạt chưa hiện bắt đầu từ đâu) · path (quỹ đạo riêng: sinh ra / xoáy đi) · gone (xoáy về tâm rồi tắt) */
  function dial(plan, o){
    o=o||{}; if(SMALL && plan!=='none'){ plan='none'; o={dp:.2, da:.2}; }
    var G=GEO, fn=PLAN[plan]||PLAN.none, fade=rm(); PLAN_NOW=plan; idleKick();
    for(var i=0;i<SL.length;i++){
      var s=SL[i], code=(s.p===1 && (!ST || ST.mode!=='1:2') && plan!=='cloud') ? null : fn(s), B=vis(s, code, G), oc=s.code;
      if(code==='m' && s.p===(ST && ST.mode==='1:2' ? 1 : 0)) B.lab=mlabel(s);   /* 1:2: nhãn KỲ chỉ ở số 0 bên phải (không in đôi) */
      s.code=code;
      var A=cur(s);
      if(o.gone){ if(!A || A.a<=0.004){ s.A=null; s.B=B; s.path=null; continue; }
        s.A=A; s.B={x:A.x, y:A.y, d:A.d, c:A.c, a:0, h:A.h}; s.path=fade ? null : gonePath; s.M=null; s.pop=0; s.fade=fade;
        s.tp=s.ta=MT+(fade?0:(s.w/23)*.12); s.dp=s.da=fade?.2:.4; s.ep=s.ea=LIN; continue; }
      if(s.B && !o.force && same(s.B,B) && !s.path) continue;   /* đích không đổi → để tween đang chạy chạy tiếp, không giật */
      if(!A || A.a<=0.004){
        if(B.a<=0.004){ s.A=null; s.B=B; s.path=null; continue; }
        if(o.path){ A={x:0, y:0, d:0, c:CP, a:0, h:0}; }
        else { var T0=B.cl ? tgt(s,B) : B;
          A=o.from ? o.from(s,T0) : {x:T0.x, y:T0.y, d:T0.d*.5, c:T0.c, a:0, h:0}; }
      } else if(!B.cl && Math.abs(A.x-B.x)<.01 && Math.abs(A.y-B.y)<.01 && Math.abs(A.a-B.a)<.002 && Math.abs(A.d-B.d)<.01 && A.c[1]===B.c[1] && A.h===B.h && A.lab===B.lab){ s.A=null; s.B=B; s.path=null; continue; }
      s.A=A; s.B=B; s.path=fade ? null : (o.path||null); s.M=null; s.pop=0; s.fade=fade;
      var st=(!fade && o.stag) ? o.stag(s) : 0;
      s.tp=MT+st; s.dp=fade ? (o.dp===0?0:.2) : (o.dp!=null ? o.dp : .55); s.ep=o.ep||SPR;
      s.ta=MT+st; s.da=fade ? s.dp : (o.da!=null ? o.da : .3); s.ea=o.ea||EB;
      if(o.path && !fade){ s.tp=s.ta=MT+(o.pt?o.pt(s):0); s.dp=s.da=(o.pd?o.pd(s):.8); }
      if(!fade && o.chase){ var ch=o.chase(s, oc, code); if(ch!=null){ s.ta=MT+ch; s.da=o.chaseDur||.22; s.pop=(o.pop!=null?o.pop:.55); if(o.mid && oc==='cloud') s.M=vis(s, o.mid, G); } }
    }
    NEED=true; motWake();
  }
  function chaseLit(base, per0, from){ return function(s, oc, nc){ if(s.lap!==1) return null; var lit=(nc==='p'||nc==='q'), was=(oc==='p'||oc==='q');
    if(!lit || was) return null; return base+(Math.max(0,s.w-(from||0)))*per0+(nc==='q'?.08:0); }; }
  function fromCenter(s,B){ return {x:GEO.cx, y:GEO.cy, d:1.6, c:B.c, a:0, h:B.h}; }

  /* ---------- hiệu ứng phụ trên canvas: gợn tròn, sao chổi (reel comet / ripple) ---------- */
  var FXL=[];
  function fxRing(x,y,d0,d1,a0,dur,delay,col,ell){ if(rm() || SMALL) return; FXL.push({k:'r', x:x, y:y, d0:d0, d1:d1, a0:a0, t0:MT+(delay||0), dur:dur, c:col||CA, ell:!!ell}); NEED=true; motWake(); }
  function fxComet(a,ctl,to,dur,delay,sz){ if(rm() || SMALL) return; FXL.push({k:'c', a:a, ctl:ctl, to:to, t0:MT+(delay||0), dur:dur, sz:sz||6.6}); NEED=true; motWake(); }
  function fxDraw(){
    for(var i=FXL.length-1;i>=0;i--){ var f=FXL[i], p=(MT-f.t0)/f.dur; if(p<0) continue; if(p>=1){ FXL.splice(i,1); continue; }
      if(f.k==='r'){ var d=f.d0+(f.d1-f.d0)*EOUT(p); ctx.strokeStyle=rgba(f.c, f.a0*(1-p)); ctx.lineWidth=1; ctx.beginPath();
        if(f.ell) ctx.ellipse(f.x, f.y, d/2, d/2*RAT, 0, 0, 6.2832); else ctx.arc(f.x, f.y, Math.max(.1,d/2-.5), 0, 6.2832); ctx.stroke(); }
      else { var T=typeof f.to==='function' ? f.to() : f.to; for(var g=5;g>=0;g--){ var e=EIO(clamp(p-g*.03,0,1)), P=qbez(f.a, f.ctl, T, e);
        ctx.fillStyle=rgba(CA, g ? .2*(1-g/6) : 1); ctx.beginPath(); ctx.arc(P[0], P[1], f.sz*(1-g*.12)/2, 0, 6.2832); ctx.fill(); } }
    }
  }
  /* ---------- "thở": rảnh 10 s thì thôi (không vẽ lại khi không ai nhìn) ---------- */
  var IDLE={t:0, rot:0, amp:0, until:0};
  function idleKick(){ IDLE.until=MT+10; NEED=true; }
  function idleStep(dv){
    var want=(ON && !rm() && !SMALL && PLAN_NOW!=='none' && MT<IDLE.until) ? 1 : 0;
    if(want>IDLE.amp) IDLE.amp=Math.min(want, IDLE.amp+dv/.6); else if(want<IDLE.amp) IDLE.amp=Math.max(want, IDLE.amp-dv/1.2);
    if(!want && IDLE.amp<0.002) IDLE.amp=0;
    if(IDLE.amp>0){ IDLE.t+=dv; IDLE.rot+=.05*dv*IDLE.amp; }
  }
  /* chấm Acid ở tâm (khách mới): nảy ra khi vào câu 01 · đập một nhịp khi sang câu 02 · thu lại khi chọn tần suất */
  var CD={d:0, m:1};
  function cdot(on, delay){ var to=on?10:0; if(!twHas('svcd') && Math.abs(CD.d-to)<.01) return;
    tw({key:'svcd', from:CD.d, to:to, dur:on?.55:.22, ease:on ? springE(21,.44,.55) : EIN, delay:delay||0, set:function(v){ CD.d=Math.max(0,v); NEED=true; }}); }
  function cpulse(delay){ if(rm()) return; tw({key:'svcp', from:0, to:1, dur:.22, ease:LIN, delay:delay||0, set:function(k){ CD.m=1+.5*Math.sin(Math.PI*k); NEED=true; }, done:function(){ CD.m=1; }}); }

  var cv=null, ctx=null, CW=0, CH=0, CK=0, SZ=1;   /* SZ: cần đo lại khung (mở luồng / đổi cỡ cửa sổ) — không đọc layout trong từng khung hình */
  function canvas(){
    if(!cv){ cv=$id('sv-dial'); ctx=cv.getContext('2d'); }
    if(SZ){ SZ=0; var w=document.body.clientWidth, h=document.body.clientHeight, k=Math.min(window.devicePixelRatio||1,3);
      if(w!==CW || h!==CH || k!==CK){ CW=w; CH=h; CK=k; cv.width=Math.round(w*k); cv.height=Math.round(h*k); } }
    ctx.setTransform(CK,0,0,CK,0,0);
  }
  function rgba(c,a){ return 'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+(a>1?1:a<0?0:a).toFixed(3)+')'; }
  function spaced(t, x, y, ls){ for(var i=0;i<t.length;i++){ ctx.fillText(t[i], x, y); x+=ctx.measureText(t[i]).width+ls; } }
  function draw(dv){
    if(!cv && !ON) return; canvas(); ctx.clearRect(0,0,CW,CH);
    idleStep(dv||0);
    var busy=false, pts=[], labs=[];
    for(var i=0;i<SL.length;i++){
      var s=SL[i]; if(!s.B) continue;
      if(s.A){ if(MT<Math.max(s.tp+s.dp, s.ta+s.da)) busy=true; else { s.A=null; s.path=null; s.M=null; s.pop=0; } }
      var P=cur(s); if(P && P.a>0.004) pts.push(P);
    }
    pts.sort(function(a,b){ return a.d-b.d; });
    for(var j=0;j<pts.length;j++){ dot(pts[j]); if(pts[j].lab) labs.push(pts[j]); }
    var cd=CD.d*CD.m; if(cd>0.05){ ctx.fillStyle='#D4FF00'; ctx.beginPath(); ctx.arc(GEO.cx, GEO.cy, cd/2, 0, 6.2832); ctx.fill(); }
    if(labs.length){ ctx.font='500 11px "JetBrains Mono", Menlo, monospace'; ctx.textBaseline='middle';
      labs.forEach(function(P){ var a=P.la!=null?P.la:P.a; if(a<=0.01) return; ctx.fillStyle=rgba(CA, a); spaced(P.lab, P.x+9*GEO.s+2, P.y+.5, .88); }); }
    fxDraw();
    if(QRA) busy=qrStep() || busy;
    NEED=busy || twHas('svcd') || twHas('svcp') || FXL.length>0 || IDLE.amp>0.002 || !!QRA;
  }
  function dot(P){
    if(P.f>0.04){ var r=P.d/2*(1+P.f*1.6), g=ctx.createRadialGradient(P.x,P.y,0,P.x,P.y,r), k=1-.75*P.f;
      g.addColorStop(0,rgba(P.c,P.a)); g.addColorStop(k*.55,rgba(P.c,P.a*.9)); g.addColorStop(Math.min(.999,k*.55+.45),rgba(P.c,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(P.x,P.y,r,0,6.2832); ctx.fill(); return; }
    if(P.h>0.001){ var fa=P.a*(1-P.h); if(fa>0.004){ ctx.fillStyle=rgba(P.c, fa); ctx.beginPath(); ctx.arc(P.x,P.y,P.d/2,0,6.2832); ctx.fill(); }
      var arc=P.arc<1 ? P.arc : 1; if(arc<=0) return;
      ctx.strokeStyle=rgba(P.c, P.a*(P.arc<1 ? 1 : P.h)); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(P.x,P.y,Math.max(.05,P.d/2-.5),-Math.PI/2,-Math.PI/2+6.2832*arc); ctx.stroke(); }
    else { ctx.fillStyle=rgba(P.c, P.a); ctx.beginPath(); ctx.arc(P.x,P.y,P.d/2,0,6.2832); ctx.fill(); }
  }
  function slotPos(i, p){ for(var k=0;k<SL.length;k++){ var s=SL[k]; if(s.p===(p||0) && idxOf(s)===i){ var P=s.B && !s.B.cl ? s.B : vis(s, s.code||'g', GEO); return [P.x, P.y]; } } return [GEO.cx, GEO.cy]; }

  /* ---------- số ở tâm số 0 (DOM, dưới trang): từng dòng đặt theo khoảng cách tới tâm (Figma) · chữ số lăn (reel slotStr / rollTo) ---------- */
  var CTR_KIND='', CTR_HTML='';
  /* bề ngang lòng số 0 (trừ 3 làn hạt + lệch ±9 của 1:2); số Mono rộng 0,6 em/ký tự → biết trước số có lọt không */
  function inner(){ var G=GEO; if(SMALL || !STEP || /^(bill|name|qr)$/.test(STEP) || (STEP==='val' && ST.pay!=='card')) return document.body.clientWidth-48; return 2*(G.rx-14*G.s)-(ST.mode==='1:2' ? 18*G.s : 0)-8; }
  function monoW(t, size, ls){ return t.length*(0.6*size+ls); }
  function N(cls, t, extra){ return '<span class="'+cls+'" data-t="'+t+'"'+(extra||'')+'>'+t+'</span>'; }
  function ctrRows(kind){
    var q=ST.S ? Q() : null, L=function(t){ return '<span class="lb">'+t+'</span>'; }, W=inner();
    function rng(a,b){ return a===b ? String(a) : a+'–'+b; }
    switch(kind){
      case 'freq': var a=ST.f[0]*4, b=ST.f[1]*4; return [[-73, L('MỖI THÁNG')], [-50, N('n72', rng(a,b), ' data-lo="'+a+'" data-hi="'+b+'"')], [26, '<span class="u20">BUỔI</span>']];
      case 'range': var lo=ST.f[0]*ST.m[0]*4, hi=ST.f[1]*ST.m[1]*4, t=rng(lo,hi), ex=' data-lo="'+lo+'" data-hi="'+hi+'"';
        return monoW(t,72,-2.16)<=W ? [[-50, N('n72', t, ex)], [26, '<span class="u20">BUỔI</span>']] : [[-37, N('n44', t, ex)], [13, '<span class="u20">BUỔI</span>']];
      case 'pkg': return monoW(String(ST.S),112,-3.36)<=W ? [[-68.5, N('n112', String(ST.S))], [44.5, '<span class="u20">BUỔI</span>']] : [[-50, N('n72', String(ST.S))], [26, '<span class="u20">BUỔI</span>']];
      case 'deal': return [[-44.5, L('ĐƠN GIÁ SAU ƯU ĐÃI')], [-21.5, N('n44', vnd(q.unit), ' data-k="unit"')+'<span class="u20">₫</span>'],
                           [30.5, '<span class="m12">Σ '+N('pp', vnd(q.total), ' data-k="tot"')+' ₫ / '+N('', String(q.sessions), ' data-k="ses"')+' BUỔI</span>']];
      case 'pay': var k=kyList(), tv=SVE.tr(k.length>1 ? k[1] : k[0]), lb=L(k.length>1 ? 'TRẢ MỖI KỲ' : 'THANH TOÁN');
        return monoW(tv,72,-2.16)+32<=W ? [[-57, lb], [-34, N('n72', tv)+'<span class="u20">TR</span>']] : [[-44, lb], [-21, N('n44', tv)+'<span class="u20">TR</span>']];
      case 'fee': return [[-44, L('PHÍ QUẸT THẺ')], [-21, N('n44', SVE.pctTxt(SVE.CARDS[ST.card].f))+'<span class="u20">%</span>']];
      case 'val': var v=kyList()[0], lab=(kyList().length>1 ? 'THANH TOÁN KỲ 1' : 'THANH TOÁN')+per(), rows=[[-44, L(lab)]];
        if(ST.pay==='card'){ var T=SVE.gross(v, SVE.CARDS[ST.card].f); rows.push([-21, N('n44 ac', vnd(T))+'<span class="u20">₫</span>']);
          rows.push([31, '<span class="m14">+ '+vnd(T-v)+'</span><span class="m12">₫</span><span class="lb">PHÍ QUẸT THẺ</span>']); }
        else rows.push([-21, N('n44 ac', vnd(v))+'<span class="u20">₫</span>']);
        return rows;
    }
    return [];
  }
  /* trễ (s) theo reel: l nhãn · n số · u đơn vị · s dòng phụ · spin / stag / spins của chữ số lăn */
  var TIM={freq:{l:.36, n:.22, u:.32, s:.32, spin:.3, stag:.05}, range:{l:.04, n:.04, u:.1, s:.1, spin:.3, stag:.05}, pkg:{l:.06, n:.06, u:.2, s:.2, spin:.28, stag:.05},
           deal:{l:.14, n:.16, u:.40, s:.50, spin:.32, stag:.05}, pay:{l:.1, n:.02, u:.12, s:.2, spin:.3, stag:.06}, fee:{l:.14, n:.06, u:.14, s:.2, spin:.22, stag:.04},
           val:{l:.3, n:.16, u:.7, s:.82, spin:.42, stag:.065, spins:3}};
  function ctr(kind, cy, o){
    var el=$id('sv-ctr'); if(cy!=null){ el.style.transform='translateY('+Math.round(cy)+'px)'; }
    var html=kind ? ctrRows(kind).map(function(r){ return '<div class="k" style="top:'+r[0]+'px">'+r[1]+'</div>'; }).join('') : '';
    var old=el.querySelector('.ly:not(.out)');
    if(kind && old && (kind===CTR_KIND || (CTR_KIND==='freq' && kind==='range'))){
      if(html===CTR_HTML) return; if(kind==='deal'){ ctrDeal(true); return; }
      if(!rm()){ CTR_KIND=kind; CTR_HTML=html; ctrMorph(old, kind, html, o||{}); ctrFit(old); return; }
    }
    CTR_KIND=kind; CTR_HTML=html;
    /* ngắt được: lớp cũ đang hiện dở thì rút đi từ đúng độ mờ / vị trí đang có */
    if(old){ var cs=getComputedStyle(old); old.style.opacity=cs.opacity; if(cs.transform && cs.transform!=='none') old.style.transform=cs.transform;
      old.classList.add('out'); setTimeout(function(){ if(old.parentNode) old.parentNode.removeChild(old); }, 200); }
    if(!kind) return;
    var ly=document.createElement('div'); ly.className='ly'+(rm()?' rmin':''); ly.innerHTML=html; el.appendChild(ly); srcMark(ly); ctrFit(ly);
    var oo={}; for(var k in (o||{})) oo[k]=o[k]; if(old) oo.delay=(oo.delay||0)+.08;   /* lớp cũ rút (.16 s) gần xong mới lăn số mới → không chồng hai con số */
    layerIn(ly, kind, oo);
  }
  /* nhớ HTML gốc từng hàng (chữ số lăn / đếm làm DOM đổi) để so khi đổi tại chỗ */
  function srcMark(ly){ [].forEach.call(ly.children, function(r){ var n=r.querySelector('.n72,.n44,.n112'); r._src=r.innerHTML; r._num=n ? n.outerHTML : ''; }); }
  function layerIn(ly, kind, o){
    if(rm()) return;
    var d=o.delay||0, K=TIM[kind]||TIM.pkg;
    [].forEach.call(ly.children, function(r){ rowIn(r, K, d, o); });
  }
  function rowIn(r, K, d, o){
    var num=r.querySelector('.n72,.n44,.n112');
    if(num){
      if(o.count && num.dataset.lo!=null) countIn(num, o.count); else roll(num, {delay:d+K.n, spin:K.spin, stag:K.stag, spins:K.spins||2});
      [].forEach.call(r.children, function(u){ if(u===num) return; anim(u, [{opacity:0},{opacity:1}], {duration:220, delay:(d+K.u)*1000, easing:C_EB, fill:'backwards'}); });
    } else {
      var lab=r.children.length===1 && r.firstElementChild.classList.contains('lb');
      anim(r, [{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'none'}], {duration:240, delay:(d+(lab?K.l:K.s))*1000, easing:C_EB, fill:'backwards'});
    }
  }
  /* cùng họ số (cùng kiểu, hoặc tần suất → khoảng buổi): đổi TẠI CHỖ — hàng giống hệt đứng yên, con số cùng cỡ cùng chỗ lăn / đếm ngay
     trong ô cũ (reel countQ3 / rollTo), hàng khác mờ chéo riêng từng hàng → không bao giờ hai lớp số chồng nhau */
  function ctrMorph(ly, kind, html, o){
    var tmp=document.createElement('div'); tmp.innerHTML=html; var nk=[].slice.call(tmp.children), ok=[].slice.call(ly.children), used=[], K=TIM[kind]||TIM.pkg;
    function rowOut(r){ var a=anim(r, [{opacity:+getComputedStyle(r).opacity||1},{opacity:0, transform:'translateY(-8px)'}], {duration:160, easing:C_EIN, fill:'forwards'}); setTimeout(function(){ if(r.parentNode) r.parentNode.removeChild(r); }, 170); }
    function add(nr){ var n=nr.querySelector('.n72,.n44,.n112'); nr._src=nr.innerHTML; nr._num=n ? n.outerHTML : ''; ly.appendChild(nr); rowIn(nr, K, .06, o); }
    nk.forEach(function(nr){
      var m=null; for(var i=0;i<ok.length;i++){ if(!used[i] && ok[i].style.top===nr.style.top){ m=ok[i]; used[i]=1; break; } }
      if(!m){ add(nr); return; }
      if(m._src===nr.innerHTML) return;
      var on=m.querySelector('.n72,.n44,.n112'), nn=nr.querySelector('.n72,.n44,.n112');
      if(on && nn && on.className.replace(/\brl\b/,'').trim()===nn.className && m._src.replace(m._num,'')===nr.innerHTML.replace(nn.outerHTML,'')){
        if(nn.dataset.lo!=null){ on.dataset.lo=nn.dataset.lo; on.dataset.hi=nn.dataset.hi; } else { delete on.dataset.lo; delete on.dataset.hi; }
        if(o.count && nn.dataset.lo!=null){ on.dataset.t=nn.dataset.t; countIn(on, o.count); } else setNum(on, nn.dataset.t, true);
        m._src=nr.innerHTML; m._num=nn.outerHTML; return;
      }
      rowOut(m); add(nr);
    });
    ok.forEach(function(r,i){ if(!used[i]) rowOut(r); });
  }
  function ctrFit(ly){
    if(!ly) return; ly.style.scale=''; var mx=0;
    [].forEach.call(ly.children, function(k){ var l=1e9, r=-1e9; [].forEach.call(k.children, function(c){ var b=c.getBoundingClientRect(); if(b.width){ l=Math.min(l,b.left); r=Math.max(r,b.right); } }); if(r>l) mx=Math.max(mx, r-l); });
    var k=mx>0 ? Math.min(1, inner()/mx) : 1; if(k<1){ ly.style.transformOrigin='50% 0'; ly.style.scale=Math.max(.7,k).toFixed(3); }
  }
  /* cập nhật tâm Ưu đãi: chạm vòng / đổi gói → chữ số lăn xuống tới số mới (reel rollTo) · đang kéo thanh → đổi ngay */
  function ctrDeal(animate){ var el=$id('sv-ctr'), q=Q(), ly=el.querySelector('.ly:not(.out)'); if(!ly || CTR_KIND!=='deal') return ctr('deal');
    setNum(ly.querySelector('[data-k=unit]'), vnd(q.unit), animate); setNum(ly.querySelector('[data-k=tot]'), vnd(q.total), animate); setNum(ly.querySelector('[data-k=ses]'), String(q.sessions), animate);
    CTR_HTML=ctrRows('deal').map(function(r){ return '<div class="k" style="top:'+r[0]+'px">'+r[1]+'</div>'; }).join(''); ctrFit(ly); }
  function setNum(el, txt, animate){ if(!el) return; var was=el.dataset.t!=null ? el.dataset.t : el.textContent; if(was===txt) return; el.dataset.t=txt;
    if(animate && !rm()) rollTo(el, was, txt); else { el._rt=(el._rt||0)+1; el.classList.remove('rl'); el.textContent=txt; } }
  function lineH(el){ var v=parseFloat(getComputedStyle(el).lineHeight); return isFinite(v) && v>0 ? v : (el.offsetHeight||16); }
  /* khung lăn: chữ thật (ẩn) giữ bố cục + đường chân chữ; lớp .rr đè lên, mỗi ký tự một ô cao đúng một dòng */
  function rollCells(el, txt){ el._rt=(el._rt||0)+1; el.classList.add('rl'); el.textContent='';
    var gh=document.createElement('span'); gh.className='gh'; gh.textContent=txt; el.appendChild(gh);
    var rr=document.createElement('span'); rr.className='rr'; rr.setAttribute('aria-hidden','true'); el.appendChild(rr); return rr; }
  function rollEnd(el, txt, ms){ var tok=el._rt; setTimeout(function(){ if(el._rt===tok && el.isConnected){ el.classList.remove('rl'); el.textContent=txt; } }, ms+40); }
  function roll(el, o){
    var txt=el.dataset.t!=null ? el.dataset.t : el.textContent; el.dataset.t=txt; if(rm() || !el.animate){ el.textContent=txt; return; }
    var lh=lineH(el), rr=rollCells(el, txt), di=0, end=0, sp=10*(o.spins||2), t0=(o.delay||0)*1000, spin=(o.spin||.3)*1000, stag=(o.stag||.05)*1000;
    for(var j=0;j<txt.length;j++){ var ch=txt[j], cell=document.createElement('span'); cell.className='rc'; cell.style.height=lh+'px'; rr.appendChild(cell);
      if(ch>='0' && ch<='9'){ var dg=+ch, s=''; for(var k=0;k<=sp+1;k++) s+=(k?'\n':'')+((dg+k)%10);
        var st=document.createElement('span'); st.className='sp'; st.textContent=s; cell.appendChild(st);
        if(t0>0) anim(cell, [{opacity:0},{opacity:1}], {duration:100, delay:t0, easing:'linear', fill:'backwards'});   /* chưa tới lượt quay: ô trống (không lộ sẵn số đích) */
        var dur=spin+di*stag; end=Math.max(end, t0+dur);
        anim(st, [{transform:'translateY(0px)', easing:C_EOUT}, {transform:'translateY('+(-sp*lh)+'px)', offset:.84, easing:'ease-out'}, {transform:'translateY('+(-(sp+.14)*lh)+'px)', offset:.92, easing:'ease-in-out'}, {transform:'translateY('+(-sp*lh)+'px)'}], {duration:dur, delay:t0, fill:'both'});
        di++;
      } else { cell.textContent=ch; var tl=t0+spin+Math.max(0,di-1)*stag; anim(cell, [{opacity:0},{opacity:1}], {duration:180, delay:Math.max(0,tl-60), easing:C_EB, fill:'both'}); }
    }
    rollEnd(el, txt, end);
  }
  /* từ số cũ lăn tới số mới (reel rollTo): tăng thì chữ số trồi lên, giảm thì trượt xuống; giá (≥ 4 chữ số) quay thêm một vòng cho ra
     chất máy đếm; chữ số không đổi đứng yên; so le 35 ms từ trái, chạm đích nảy 12 % dòng */
  function rollTo(el, from, to){
    if(from.length!==to.length || from.replace(/\d/g,'#')!==to.replace(/\d/g,'#')){ el.dataset.t=to; return roll(el, {spin:.28, stag:.03, spins:1}); }
    var nf=+from.replace(/\D/g,''), nt=+to.replace(/\D/g,''), up=nt>nf, big=to.replace(/\D/g,'').length>=4;
    var lh=lineH(el), rr=rollCells(el, to), di=0, end=0, dur=420, stag=35, B=.12*lh;
    for(var j=0;j<to.length;j++){ var ch=to[j], cell=document.createElement('span'); cell.className='rc'; cell.style.height=lh+'px'; rr.appendChild(cell);
      if(ch>='0' && ch<='9'){ var d0=+from[j], d1=+ch, dl=di*stag; di++;
        if(d0===d1){ cell.textContent=ch; continue; }
        var steps=(up ? (d1-d0+10)%10 : (d0-d1+10)%10)+(big?10:0), s='', a, b, k;
        for(k=0;k<=steps;k++) s+=(k?'\n':'')+((up ? d0+k : d1+k)%10);
        if(up){ a=0; b=-steps*lh; } else { a=-steps*lh; b=0; }
        var st=document.createElement('span'); st.className='sp'; st.textContent=s; cell.appendChild(st);
        anim(st, [{transform:'translateY('+a+'px)', easing:C_EOUT}, {transform:'translateY('+b+'px)', offset:.84, easing:'ease-out'}, {transform:'translateY('+(b+(up?-B:B))+'px)', offset:.92, easing:'ease-in-out'}, {transform:'translateY('+b+'px)'}], {duration:dur, delay:dl, fill:'both'});
        end=Math.max(end, dl+dur);
      } else cell.textContent=ch;
    }
    rollEnd(el, to, end);
  }
  /* đếm lên cùng nhịp các tuần sáng dần trên số 0 (reel countQ2/countQ3): chữ số hàng chục giữ chỗ (mờ) → con số không xô lệch */
  function padN(v,w){ var s=String(Math.max(0,Math.round(v))); return (s.length<w ? '<i class="z">'+'0000'.slice(0,w-s.length)+'</i>' : '')+s; }
  function countIn(el, c){
    var lo=+el.dataset.lo, hi=+el.dataset.hi, txt=el.dataset.t, wl=String(lo).length, wh=String(hi).length, one=lo===hi, t0=MT; if(rm()) return;
    el._rt=(el._rt||0)+1; var tok=el._rt;
    var put=function(){ if(el._rt!==tok) return; var p=c.prog(MT-t0); el.innerHTML=padN(lerp(c.from[0],lo,p),wl)+(one?'':'–'+padN(lerp(c.from[1],hi,p),wh)); };
    put(); tw({key:'svcnt', from:0, to:1, dur:c.dur, ease:LIN, set:put, done:function(){ if(el._rt===tok) el.textContent=txt; }});
  }
  function chaseProg(base, per0, n){ return function(t){ if(n<=0) return 1; var v=0; for(var w=0;w<n;w++) v+=EB(seg(t, base+w*per0, base+w*per0+.22)); return v/n; }; }

  /* ---------- dựng từng bước ---------- */
  var TITLE={q1:'Hình thức tập?', q2:'Tần suất tập?', q3:'Thời gian tập?', pk:'Gói tập?', bill:'Đề xuất cho khách', pm:'Phương thức trả?', pf:'Hình thức trả?', card:'Loại thẻ của khách?', val:'Giá trị phải trả', qr:'Quét mã QR'};
  function title(id){
    if(id==='deal') return '<span class="tt">Ưu đãi cho gói</span> <span class="ac">'+ST.S+' buổi</span>';
    if(id==='name') return '<span class="tt">'+(ST.mode==='1:2' ? 'Họ tên khách '+(ST.who+1)+'?' : 'Họ tên khách?')+'</span>';
    return '<span class="tt">'+TITLE[id]+'</span>';
  }
  function fx3(v){ return v.toFixed(3)+'s'; }
  /* dãy số: trễ vào theo reel (số đầu .12 s — .16 s nếu câu trước cũng là dãy số — mỗi số sau +35 ms) · rút ra so le 20 ms */
  function nums(list, unit, wide, base){
    return '<div class="sv-ans sv-q'+(wide?' w':'')+'"><div class="sv-unit">'+(unit||'')+'</div>'+
      '<div class="sv-row">'+list.map(function(v,i){ return '<button class="sv-n" data-i="'+i+'" style="--d:'+fx3(base+i*.035)+';--o:'+fx3(i*.02)+'"><span>'+v+'</span></button>'; }).join('')+'</div>'+
      '<i class="sv-cap" aria-hidden="true"><i class="cl"></i><i class="cm"></i><i class="cr"></i></i></div>';
  }
  var LOGO='<span class="svlogo" aria-hidden="true"><svg viewBox="0 0 23 16"><rect width="23" height="16" rx="2.5" fill="#fff"/><path fill="#172B85" fill-rule="evenodd" d="M7.02517 10.8392H5.63182L4.58697 6.79524C4.53738 6.60922 4.43208 6.44477 4.27718 6.36726C3.89063 6.17248 3.46468 6.01746 3 5.93928V5.78359H5.24458C5.55437 5.78359 5.78671 6.01746 5.82543 6.28908L6.36756 9.20609L7.76023 5.78359H9.11486L7.02517 10.8392ZM9.88932 10.8392H8.57341L9.65698 5.78359H10.9729L9.88932 10.8392ZM12.6754 7.18413C12.7141 6.91184 12.9464 6.75615 13.2175 6.75615C13.6434 6.71706 14.1074 6.79524 14.4947 6.98935L14.727 5.90087C14.3398 5.74517 13.9138 5.66699 13.5273 5.66699C12.2501 5.66699 11.3207 6.36726 11.3207 7.33915C11.3207 8.07851 11.979 8.46673 12.4437 8.7006C12.9464 8.9338 13.14 9.08949 13.1013 9.32269C13.1013 9.67249 12.7141 9.82818 12.3275 9.82818C11.8629 9.82818 11.3982 9.71158 10.9729 9.5168L10.7406 10.606C11.2052 10.8001 11.708 10.8783 12.1726 10.8783C13.6047 10.9167 14.4947 10.2171 14.4947 9.167C14.4947 7.84464 12.6754 7.76713 12.6754 7.18413ZM19.1 10.8392L18.0552 5.78359H16.9329C16.7005 5.78359 16.4682 5.93928 16.3907 6.17248L14.4559 10.8392H15.8106L16.081 10.1005H17.7454L17.9003 10.8392H19.1ZM17.1265 7.14505L17.513 9.05041H16.4294L17.1265 7.14505Z"/></svg>'+
    '<svg viewBox="0 0 23 16"><rect width="23" height="16" rx="2.5" fill="#fff"/><path fill="#ED0006" d="M14.9745 2.99219C17.75 2.99232 19.9999 5.20576 19.9999 7.93555C19.9996 10.6651 17.7499 12.8778 14.9745 12.8779C13.73 12.8779 12.5915 12.4322 11.7137 11.6953C10.8361 12.4319 9.6982 12.8779 8.45398 12.8779C5.6785 12.8777 3.42859 10.6643 3.42859 7.93457C3.42885 5.20504 5.67866 2.99238 8.45398 2.99219C9.69798 2.99219 10.8361 3.43748 11.7137 4.17383C12.5914 3.43716 13.7302 2.99219 14.9745 2.99219Z"/><path fill="#F9A000" d="M14.974 2.99219C17.7496 2.99219 20.0004 5.20568 20.0004 7.93555C20.0001 10.6652 17.7495 12.8779 14.974 12.8779C13.7295 12.8779 12.592 12.4313 11.7142 11.6943C12.7939 10.7878 13.4797 9.44114 13.4799 7.93555C13.4799 6.42953 12.7943 5.08141 11.7142 4.1748C12.5919 3.43809 13.7297 2.99223 14.974 2.99219Z"/><path fill="#FF5E00" d="M11.7141 4.17383C12.7944 5.08036 13.4796 6.42847 13.4797 7.93457C13.4797 9.44065 12.7943 10.7887 11.7141 11.6953C10.6341 10.7887 9.94849 9.44056 9.94849 7.93457C9.9486 6.42856 10.6339 5.08036 11.7141 4.17383Z"/></svg></span>';
  /* hàng trả lời: chữ trồi 24 pt (.12 s + 50 ms mỗi hàng), kẻ mảnh vẽ từ trái (sớm hơn 60 ms), rút ra so le 25 ms */
  function rows(list, size, sel){
    var n=list.length;
    return '<div class="sv-ans sv-rows '+size+(sel!=null?' pick':'')+'" style="--dl:'+fx3(.06+(n-1)*.05)+'">'+list.map(function(r,i){
      return '<button class="sv-r'+(sel===i?' on':'')+'" data-i="'+i+'" style="--d:'+fx3(.12+i*.05)+';--dl:'+fx3(.06+i*.05)+';--o:'+fx3(i*.025)+(sel===i?';--sdd:'+fx3(.4+i*.05):'')+'"><i class="sd"></i><span class="l"><span class="t">'+r.l+(r.logo?LOGO:'')+'</span>'+(r.sub?'<span class="sub">'+r.sub+'</span>':'')+'</span>'+
        '<span class="v">'+(r.v?'<b>'+r.v+'</b>':'')+(r.u?'<em>'+r.u+'</em>':'')+'</span></button>'; }).join('')+'</div>';
  }
  function levers(){
    var B=SVE.giftMax(ST.S), g='';
    for(var k=1;k<=B;k++) g+='<button class="sv-g" data-k="'+k+'" aria-label="Tặng '+k+' buổi" style="--d:'+fx3(.34+(k-1)*.05)+'"><i class="fl"></i>'+ico('i-plus')+'</button>';
    return '<div class="sv-ans sv-lev"><div class="sv-lv"><div class="h"><span class="t">Tặng buổi</span><span class="v"><b data-k="b" data-t="0">0</b><em>BUỔI</em></span></div><div class="sv-gs'+(B>4?' n7':'')+'">'+g+'</div></div>'+
      '<div class="sv-lv"><div class="h"><span class="t">Giảm giá</span><span class="v"><b data-k="d" data-t="0">0</b><em>₫</em></span></div><div class="sv-sl" role="slider" aria-label="Giảm giá"><i class="tw"><i class="tk"></i><i class="bk"></i></i><i class="kn"><i></i></i></div></div></div>';
  }
  function zz(down){ var d=down?'M0 0':'M0 6V5', i; for(i=0;i<35;i++) d+= down ? 'L'+((i+.5)*313/35).toFixed(2)+' 5L'+((i+1)*313/35).toFixed(2)+' 0' : 'L'+((i+.5)*313/35).toFixed(2)+' 0L'+((i+1)*313/35).toFixed(2)+' 5'; return d+(down?'Z':'V6Z'); }
  function bill(){
    var q=Q(), r=[], dt=new Date(), date=pad2(dt.getDate())+'.'+pad2(dt.getMonth()+1)+'.'+dt.getFullYear();
    r.push(['ĐƠN GIÁ', vnd(q.P), '₫/BUỔI']);
    if(q.b) r.push(['TẶNG THÊM', String(q.b), 'BUỔI']);
    if(q.d) r.push(['GIẢM GIÁ', vnd(q.d), '₫']);
    if(q.b || q.d) r.push(['ĐƠN GIÁ SAU ƯU ĐÃI', vnd(q.unit), '₫/BUỔI']);
    if(q.weeks) r.push(['THỜI HẠN', String(q.weeks), 'TUẦN']);
    if(q.kys>1){ var sp=SVE.split(q.total, q.kys); r.push(['KỲ TRẢ GÓP', q.kys+' × '+vnd(sp[1]), '₫']); if(sp[0]!==sp[1]) r.push(['KỲ 1 THÊM', vnd(sp[0]-sp[1]), '₫']); }
    return '<div class="sv-ans sv-billw"><div class="sv-bill"><svg class="zz" viewBox="0 0 313 6" preserveAspectRatio="none" aria-hidden="true"><path d="'+zz(false)+'"/></svg>'+
      '<svg class="zz2" viewBox="0 0 313 6" preserveAspectRatio="none" aria-hidden="true"><path d="'+zz(true)+'"/></svg>'+
      '<svg class="wm" viewBox="0 0 132 43" aria-label="B0DY"><use href="#b0dy-k"/></svg><div class="dt">PHIẾU ĐỀ XUẤT · '+date+'</div><i class="dl"></i>'+
      '<div class="pk">GÓI '+q.S+' BUỔI'+(ST.mode==='1:2'?' · 1:2':'')+'</div><div class="rs">'+
      r.map(function(x){ return '<div class="r"><span class="l">'+x[0]+'</span><span class="v"><b>'+x[1]+'</b><em>'+x[2]+'</em></span></div>'; }).join('')+
      '</div><i class="dl"></i><div class="tl">THANH TOÁN'+per()+'</div><div class="tt"><b>'+vnd(q.total)+'</b><em>₫</em></div></div><i class="sv-slot"></i></div>';
  }
  function nameBox(){
    var v=ST.names[ST.who]||'';
    return '<div class="sv-nm"><input class="sv-in" id="sv-in" type="text" value="'+esc(v)+'" placeholder="Họ và tên đầy đủ" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="next" aria-label="Họ tên khách">'+
      '<i class="sv-ul"></i><div class="lab">NỘI DUNG CHUYỂN KHOẢN</div><div class="sv-memo" id="sv-memo"></div></div>';
  }
  function qrBox(){
    var v=kyList()[0];
    return '<div class="sv-qrw"><div class="sv-card"><div class="sv-qq"><canvas class="sv-qrc" id="sv-qrc" aria-label="Mã VietQR"></canvas><div class="sv-badge"><svg viewBox="0 0 132 43" aria-hidden="true"><use href="#b0dy-k"/></svg></div><div class="sv-qe lab" id="sv-qe" hidden></div></div>'+
      '<div class="sv-strip"><div class="sv-amt"><b data-t="'+vnd(v)+'">'+vnd(v)+'</b><em>₫</em></div><div class="sv-mm" id="sv-mm"><span></span></div></div></div><div class="lab sv-bank" id="sv-bank"></div></div>';
  }
  function bodyOf(id, prev){
    var sp='<div class="sv-sp"></div>', q, base=/^q[123]$/.test(prev||'') ? .16 : .12;
    switch(id){
      case 'q1': return sp+nums(['1:1','1:2'], '', true, base);
      case 'q2': return sp+nums(SVE.FREQ, 'BUỔI/TUẦN', false, base);
      case 'q3': return sp+nums(SVE.MONTHS, 'THÁNG', false, base);
      case 'pk': var L=pkList(); if(L.length===1 && ST.S==null) ST.S=L[0];
        return sp+rows(L.map(function(S){ return {l:S+' buổi', v:vnd(SVE.price(ST.mode,S)), u:'₫/BUỔI'}; }), L.length>2?'S':'L', ST.S!=null && L.indexOf(ST.S)>=0 ? L.indexOf(ST.S) : null);
      case 'deal': return sp+levers();
      case 'bill': return bill();
      case 'pm': q=Q(); var sp2=SVE.split(q.total, q.kys);
        return sp+rows([{l:'Một lần', v:vnd(q.total), u:'₫'}, {l:'Chia '+q.kys+' kỳ', v:q.kys+' × '+vnd(sp2[1]), u:'₫', sub: sp2[0]!==sp2[1] ? 'KỲ 1 THÊM '+vnd(sp2[0]-sp2[1])+' ₫' : ''}], 'L', ST.split==null?null:(ST.split?1:0));
      case 'pf': return sp+rows([{l:'Chuyển khoản', u:'KHÔNG PHÍ'}, {l:'Tiền mặt', u:'KHÔNG PHÍ'}, {l:'Thẻ', u:'KHÁCH CHỊU PHÍ QUẸT'}], 'L', ST.pay==null?null:['ck','cash','card'].indexOf(ST.pay));
      case 'card': return sp+rows(SVE.CARDS.map(function(c){ return {l:c.n, v:SVE.pctTxt(c.f), u:'%', logo:c.logo}; }), 'S', ST.card);
      case 'val': return sp;
      case 'name': return nameBox()+sp;
      case 'qr': return qrBox()+sp;
    }
    return sp;
  }
  /* màn mã QR: ⌂ vẫn đứng chỗ cũ (nút ".phantom" trùng chữ ký với ⌂ màn trước → nav đứng yên) cho tới lúc nở thành Xong */
  function navOf(id){
    var back=id!=='q1', cta=null, home=true, ph=false;
    if(id==='deal') cta={t:'Chốt ưu đãi', d:.55};
    else if(id==='bill') cta={t:'Khách đồng ý', d:.3};
    else if(id==='name') cta={t:'Tiếp', c:'sv-tiep'};
    else if(id==='qr'){ cta={t:(ST.mode==='1:2' && ST.who===0) ? 'Tiếp' : 'Xong', c:'paper'}; home=false; ph=true; }
    else if(id==='val'){ cta={t:'Xong', c:'paper'}; home=false; }
    return '<div class="nav sv-nav">'+(back ? '<button class="ghost svb" aria-label="Quay lại" onclick="SVX.back()">'+ico('i-back24','s24')+'</button>' : '<span class="gh0"></span>')+
      (cta ? '<button class="cta svc '+(cta.c||'')+'" onclick="SVX.cta()" style="--cd:'+fx3(cta.d||.1)+'"><span>'+cta.t+'</span></button>' : '')+
      (home ? '<button class="ghost svh" aria-label="Về trang chủ" onclick="SVX.home()">'+ico('i-home24','s24')+'</button>'
            : ph ? '<button class="ghost svh phantom" aria-label="Về trang chủ" tabindex="-1" onclick="SVX.home()">'+ico('i-home24','s24')+'</button>' : '<span class="gh0"></span>')+'</div>';
  }
  function pkList(){ return SVE.match(ST.f[0], ST.f[1], ST.m[0], ST.m[1]); }

  /* hình học số 0 theo khoảng trống giữa khối đỉnh và khối trả lời (Figma: cách ≥ 44 pt, rx ≤ 128; màn số phải trả 162) */
  function topIn(el, pg){ var y=0; while(el && el!==pg){ y+=el.offsetTop; el=el.offsetParent; } return y; }
  function geoOf(id, pg){
    var hd=pg.querySelector('.head'), top=hd.offsetTop+hd.offsetHeight, anc=pg.querySelector('.sv-row') || pg.querySelector('.sv-ans') || pg.querySelector('.sv-nav'),
        bot=topIn(anc, pg), h=Math.max(120, bot-top), cap=(id==='val')?162:128, m=h<420?24:44, rx=Math.max(60, Math.min(cap, Math.floor(((h/2-m)-12)/RAT))), s=Math.max(.7, Math.min(1, rx/128));
    return {cx:pg.clientWidth/2, cy:Math.round(top+h/2), rx:rx, gap:Math.round(8*s*10)/10, s:s};
  }
  /* toạ độ bố cục (bỏ qua transform đang chạy) của một phần tử HTML trên màn */
  function layRect(el){ var x=0, y=0, e=el; while(e){ x+=e.offsetLeft; y+=e.offsetTop; e=e.offsetParent; } return {left:x, top:y, width:el.offsetWidth, height:el.offsetHeight}; }

  /* ---------- lớp bay (fixed, ngoài trang): dòng nội dung, số phải trả, nhãn gói, chấm Acid lúc kết ---------- */
  var FLY=[];
  function flyAdd(el, keep){ document.body.appendChild(el); var f={el:el, keep:!!keep}; FLY.push(f); return f; }
  function flyDrop(f){ var i=FLY.indexOf(f); if(i>=0) FLY.splice(i,1); if(f.el.parentNode) f.el.parentNode.removeChild(f.el); }
  function flyClear(all){ FLY.slice().forEach(function(f){ if(all || !f.keep){ if(f.a) try{ f.a.cancel(); }catch(e){} flyDrop(f); if(f.undo) f.undo(); } }); }
  /* bản sao một dòng chữ đúng font / cỡ / màu tại toạ độ màn hình r */
  function flyText(src, r, o){ var cs=getComputedStyle(src), el=document.createElement('div'); el.className='svfly'; el.textContent=o.text!=null ? o.text : src.textContent;
    el.style.cssText='left:'+r.left+'px;top:'+r.top+'px;height:'+r.height+'px;font-family:'+cs.fontFamily+';font-size:'+cs.fontSize+';line-height:'+r.height+'px;letter-spacing:'+cs.letterSpacing+';color:'+(o.color||cs.color)+';z-index:'+(o.z!=null?o.z:60);
    return flyAdd(el, o.keep); }
  /* đường bay cong (bezier bậc hai) → khung WAAPI: tịnh tiến + co, mốc thời gian theo đường cong EA */
  function flyPath(f, a, ctl, b, k0, k1, ms, delay, ease, extra){
    var kf=[], n=14; for(var i=0;i<=n;i++){ var u=i/n, e=(ease||EO)(u), P=qbez(a, ctl, b, e), sc=lerp(k0,k1,e), o={transform:'translate('+(P[0]-a[0]).toFixed(2)+'px,'+(P[1]-a[1]).toFixed(2)+'px) scale('+sc.toFixed(4)+')', offset:u};
      if(extra) extra(o, u, e); kf.push(o); }
    f.a=anim(f.el, kf, {duration:ms, delay:delay||0, fill:'both', easing:'linear'}); return f.a;
  }

  /* ---------- điều hướng giữa các bước ---------- */
  var CHIP=null;
  function render(id, dir, push, how){
    if(push && STEP) HIST.push({id:STEP, who:ST.who});
    var prev=STEP, oldPg=STEP ? $id(PGS[PI]) : null; STEP=id; clearTimeout(ADV); LOCK=0; flyClear(false); qrStop();
    PI=1-PI; var pg=$id(PGS[PI]); var back=dir==='back';
    pg.classList.remove('flyac','landed','rv','flipin','flipout','in','out','bk'); if(pg._fa){ pg._fa.forEach(function(a){ try{ a.cancel(); }catch(e){} }); pg._fa=null; }
    if(oldPg) freezeOut(oldPg);
    pg.innerHTML='<div class="head"><span class="t1">'+title(id)+'</span></div><div class="body sv-b">'+bodyOf(id, prev)+'</div>'+navOf(id);
    pg.dataset.step=id;
    var flip=!rm() && !!oldPg && ((prev==='deal' && id==='bill' && !back) || (prev==='bill' && id==='deal' && back));
    var acf=!rm() && !!oldPg && prev==='pk' && id==='deal' && !back;
    /* pha biên đạo (app.css): .in bước mới · .out bước cũ · .bk lùi. Lật máy thì cả trang quay — không pha */
    if(oldPg){ oldPg.classList.remove('in'); oldPg.classList.toggle('out', !flip); oldPg.classList.toggle('bk', back);
      var ph=oldPg.querySelector('.svh.phantom'); if(ph && !oldPg.classList.contains('rv')) ph.parentNode.removeChild(ph); }   /* ⌂ đã nở thành Xong → ⌂ màn sau hiện lại có nhịp, không bật ra */
    if(flip){ oldPg.classList.add('flipout'); pg.classList.add('flipin'); } else pg.classList.add('in');
    if(back) pg.classList.add('bk');
    if(acf) pg.classList.add('flyac');
    go(pg.id, dir||'fwd');
    var gc=pg.querySelector('.sv-nav .svc'); if(gc && gc.classList.contains('swap')) gc.classList.add('gro');   /* nút chính mới → mọc từ chấm */
    if(flip) flipRun(oldPg, pg, back);
    bind(id, pg, prev, how, oldPg, flip);
    /* bước không có số 0 (phiếu, họ tên, mã QR, tiền mặt): giữ hình học cũ để hạt tắt / thu tại chỗ; số ở tâm vẫn theo khoảng trống mới */
    var G=geoOf(id, pg), hasDial=!(id==='bill' || id==='name' || id==='qr' || (id==='val' && ST.pay!=='card'));
    if(hasDial){ SMALL=G.rx<92; GEO=G; }
    var after=(flip && back) ? .25 : 0;   /* lật về ưu đãi: số 0 + số ở tâm hiện cùng mặt trước */
    function go2(){ if(STEP!==id) return; switch(id){
      case 'q1':
        if(!prev){ var c=chipDot(); if(c && !rm()) fxComet(c, [c[0]-30, (c[1]+G.cy)/2-40], [G.cx, G.cy], .34, 0, 7);
          cdot(true, c?.3:.1); fxRing(G.cx, G.cy, 12, 182, .2, .95, c?.33:.13, CP); fxRing(G.cx, G.cy, 280, 400, .14, .8, c?1.12:.92, CP, true);
          dial('cloud', {path:genPath, pt:function(s){ return (c?.2:0)+.14+s.r[4]*.4; }, pd:function(s){ return .74+s.r[5]*.26; }}); }
        else { cdot(true); dial('cloud'); }
        ctr('', G.cy); break;
      case 'q2':
        if(prev==='q1' && !back && !ST.f){ var dp=oldPg && capAt(oldPg); if(dp && !rm()){ fxComet(dp, [dp[0]-55, dp[1]-224], [G.cx, G.cy], .42, 0, 8); fxRing(G.cx, G.cy, 10, 80, .6, .48, .42); } cpulse(.4); }
        cdot(!ST.f); if(ST.f){ dial('freq'); ctr('freq', G.cy); } else { dial('cloud'); ctr('', G.cy); } break;
      case 'q3': cdot(false); if(ST.m){ dial('months'); ctr('range', G.cy); } else { dial('freq'); ctr('freq', G.cy); } break;
      case 'pk': if(ST.S!=null && pkList().indexOf(ST.S)>=0){ dial('pkg'); ctr('pkg', G.cy); } else { dial('months'); ctr('range', G.cy); } break;
      case 'deal': if(prev==='pk' && !back) dial('deal', {chase:function(s,oc,nc){ var i=idxOf(s)-ST.S; return (nc==='o' && oc!=='o' && i>=0) ? .30+i*.05 : null; }, chaseDur:.3, pop:0, ep:springE(13,.72,.6), dp:.6});
        else dial('deal'); ctr('deal', G.cy); dealSync(pg); break;
      case 'bill': if(!flip) dial('none', {dp:.2, da:.2}); ctr('', null); break;
      case 'pm': if(prev==='bill' && !back) dial('pay', {from:fromCenter, ep:springE(12,.62,.7), dp:.7, da:.45, stag:function(s){ return s.w*.012; }}); else dial('pay');
        ctr(ST.split==null ? '' : 'pay', G.cy); break;
      case 'pf': if(prev==='bill' && !back) dial('pay', {from:fromCenter, ep:springE(12,.62,.7), dp:.7, da:.45, stag:function(s){ return s.w*.012; }});
        else if(prev==='name' && back) dial('pay', {from:fromCenter, ep:springE(12,.62,.7), dp:.7, da:.45, stag:function(s){ return s.w*.012; }});
        else dial('pay', {ep:springE(16,.66,.5), dp:.5}); ctr('pay', G.cy); break;
      case 'card': dial('pay', {ep:springE(16,.66,.5), dp:.5}); ctr(ST.card!=null ? 'fee' : '', G.cy); break;
      case 'val': if(ST.pay==='card') dial('pos', {ep:springE(10.5,.4,.9), dp:.9, da:.35}); else dial('none', {dp:.2, da:.2}); ctr('val', G.cy); break;
      case 'name': dial('none', {gone:true}); ctr('', null); break;
      case 'qr': dial('none', {dp:.2, da:.2}); ctr('', null); break;
    } }
    if(after) setTimeout(go2, after*1000); else go2();
  }
  /* trang cũ: chụp transform / opacity đang chạy vào inline → bước cũ rút đi từ đúng chỗ đang thấy (ngắt được, không bật về) */
  function freezeOut(pg){
    if(rm()) return;
    var els=pg.querySelectorAll('.head .tt, .head .ac, .sv-n>span, .sv-r>.l, .sv-r>.v, .sv-unit, .sv-lv .h, .sv-g, .sv-lev, .sv-nm>*, .sv-qrw');
    var cs=[].map.call(els, function(e){ var c=getComputedStyle(e); return [e, c.transform, c.opacity]; });
    cs.forEach(function(x){ if(x[1] && x[1]!=='none') x[0].style.transform=x[1]; if(x[2]!=='1') x[0].style.opacity=x[2]; });
  }
  /* chấm của chữ 0 trên nút Sell (toạ độ bố cục) — nơi luồng bắt đầu và kết thúc */
  function chipDot(){ var c=$id('h-sell'), s=c && c.querySelector('svg'); if(!c || !c.offsetParent || !s) return null; var r=layRect(c);
    return [r.left+parseFloat(getComputedStyle(c).paddingLeft||12)+s.getBoundingClientRect().width/2, r.top+r.height/2]; }
  function capAt(pg){ var c=pg.querySelector('.sv-cap.on .cl'); if(!c) return null; var r=c.getBoundingClientRect(); return [r.left+4, r.top+4]; }
  function advance(delay){ LOCK=1; clearTimeout(ADV); ADV=setTimeout(function(){ LOCK=0; var n=nextOf(STEP); if(n) render(n, 'fwd', true); }, rm() ? 120 : (delay==null ? 200 : delay)); }
  function nextOf(id){
    switch(id){
      case 'q1': return 'q2'; case 'q2': return 'q3'; case 'q3': return 'pk';
      case 'pk': return SVE.giftMax(ST.S) ? 'deal' : 'bill';
      case 'deal': return 'bill';
      case 'bill': return SVE.INST[ST.S] ? 'pm' : 'pf';
      case 'pm': return 'pf';
      case 'pf': return ST.pay==='card' ? 'card' : (ST.pay==='ck' ? 'name' : 'val');
      case 'card': return 'val';
      case 'name': return 'qr';
    }
    return null;
  }
  function guard(){ var t=Date.now(); if(t-NAVT<260) return false; NAVT=t; return true; }

  /* ---------- lật máy sang khách (reel drawFlip): mặt trước quay 0 → 90°, mặt sau −90° → 0 rồi lắc tắt dần; mép máy sáng lúc nghiêng ---------- */
  function flipKF(from, to, n, f){ var kf=[]; for(var i=0;i<=n;i++){ var u=i/n; kf.push({transform:'perspective(1500px) rotateY('+f(u).toFixed(2)+'deg)', offset:u}); } return kf; }
  function flipRun(oldPg, pg, back){
    var sg=back?-1:1, D=180/Math.PI;
    var kOut=flipKF(0,90,10,function(u){ return sg*Math.PI*EIO(u*.5)*D; });
    var kIn=flipKF(-90,0,24,function(u){ var t=.25+u*.69; return sg*(t<.5 ? Math.PI*EIO(t/.5)-Math.PI : .075*Math.exp(-7*(t-.5))*Math.sin(17*(t-.5)))*D; });
    var a1=anim(oldPg, kOut, {duration:250, fill:'forwards'}), a2=anim(pg, kIn, {duration:690, delay:250, fill:'both'});
    pg._fa=[a2]; oldPg._fa=[a1];
    [oldPg, pg].forEach(function(p, j){ var e=document.createElement('i'); e.className='svedge'; p.appendChild(e);
      anim(e, j ? [{opacity:.24},{opacity:0}] : [{opacity:0},{opacity:.24}], {duration:j?260:250, delay:j?250:0, easing:j?C_EOUT:C_EIN, fill:'both'}); });
    if(!back){ var dc=$id('sv-dial'), lys=[].slice.call($id('sv-ctr').querySelectorAll('.ly'));
      var ad=anim(dc, kOut, {duration:250, fill:'forwards'}), al=lys.map(function(l){ return anim(l, kOut, {duration:250, fill:'forwards'}); });
      setTimeout(function(){ if(ad) ad.cancel(); dial('none', {dp:0, da:0}); al.forEach(function(a){ if(a) a.cancel(); }); if(STEP==='bill') ctr('', null); NEED=true; motWake(); }, 250);
    }
    if(a2) a2.onfinish=function(){ pg.classList.remove('flipin'); try{ a2.cancel(); }catch(e){} pg._fa=null; var e=pg.querySelector('.svedge'); if(e) e.remove(); };
  }

  /* ---------- tương tác từng bước ---------- */
  function bind(id, pg, prev, how, oldPg, flip){
    if(id==='q1') bindNums(pg, false, function(a){ var m=a?'1:2':'1:1'; if(m!==ST.mode){ ST.mode=m; ST.b=0; ST.d=0; } dial('cloud', {dp:.36}); advance(); }, ST.mode ? [ST.mode==='1:2'?1:0, ST.mode==='1:2'?1:0] : null);
    else if(id==='q2') bindNums(pg, true, function(a,b){ var f=[SVE.FREQ[a], SVE.FREQ[b]], first=!ST.f, was=ST.f; ST.f=f; checkPkg(); cdot(false, .08);
        if(first){ dial('freq', {ep:springE(15,.62,.6), dp:.6, stag:function(s){ return s.w*.011+s.r[1]*.03; }, chase:chaseLit(.34,.07), mid:'g', pop:.55});
          ctr('freq', null, {count:{from:[0,0], dur:.8, prog:chaseProg(.34,.07,4)}}); }
        else { dial('freq', {dp:.45, stag:function(s){ return s.w*.011; }, chase:chaseLit(.06,.05), pop:.55}); ctr('freq'); }
        advance(); },
        ST.f ? [SVE.FREQ.indexOf(ST.f[0]), SVE.FREQ.indexOf(ST.f[1])] : null);
    else if(id==='q3') bindNums(pg, true, function(a,b){ var was=ST.m; ST.m=[SVE.MONTHS[a], SVE.MONTHS[b]]; checkPkg(); var W=ST.m[0]*4;
        dial('months', {dp:.45, chase:chaseLit(.06,.05,4), pop:.6, chaseDur:.2});
        ctr('range', null, was ? {} : {count:{from:[ST.f[0]*4, ST.f[1]*4], dur:.3+Math.max(0,W-4)*.05, prog:chaseProg(.06,.05,Math.max(0,W-4))}}); advance(); },
        ST.m ? [SVE.MONTHS.indexOf(ST.m[0]), SVE.MONTHS.indexOf(ST.m[1])] : null);
    else if(id==='pk') bindRows(pg, function(i){ var S=pkList()[i]; if(S!==ST.S){ ST.S=S; ST.b=0; ST.d=0; ST.split=null; }
        dial('pkg', {stag:function(s){ return .08+s.w*.015; }, dp:.3, da:.24, ea:EIN, ep:EIN}); advance(); });   /* tâm giữ khoảng buổi → Ưu đãi lăn thẳng sang đơn giá (không chớp "36" 0,2 s) */
    else if(id==='pm') bindRows(pg, function(i){ var was=ST.split; ST.split=(i===1);
        if(ST.split && !was && !rm()){ dial('pay', {dp:.3, chase:function(s,oc,nc){ var x=idxOf(s); return (x>=14 && nc!==oc) ? .06+(x-14)*.011 : null; }, chaseDur:.24, pop:0});
          var m=SVE.INST[ST.S]; if(m){ var P=slotPos(m[0]-1, ST.mode==='1:2'?1:0); fxRing(P[0], P[1], 8, 38, .7, .48, .12); mpop(m[0]-1); } }
        else dial('pay', {dp:.3, stag:function(s){ return s.w*.011; }});
        ctr('pay'); advance(); });
    else if(id==='pf') bindRows(pg, function(i){ ST.pay=['ck','cash','card'][i];
        if(ST.pay==='ck'){ ST.who=0; render('name', 'fwd', true); focusName(); return; }   /* iOS chỉ mở bàn phím khi focus ngay trong lượt chạm */
        advance(); });
    else if(id==='card') bindRows(pg, function(i){ ST.card=i; advance(); });   /* phí hiện ngay ở bước sau (số quẹt + phí) */
    else if(id==='deal'){ bindDeal(pg); if(how!=='nofly' && pg.classList.contains('flyac')) flyPkg(pg, oldPg); }
    else if(id==='bill') billIn(pg, flip ? .30 : .12);
    else if(id==='name') bindName(pg);
    else if(id==='qr'){ qrFit(pg); qrFill(pg, how==='reveal' ? oldPg : null); }
    /* chạm bất kỳ đâu trên trang → số 0 thở lại (rảnh 10 s thì thôi) */
    if(!pg._ik){ pg._ik=1; pg.addEventListener('pointerdown', function(){ if(ON){ idleKick(); motWake(); } }, true); }
  }
  /* hạt mốc KỲ 2: nảy khi lịch thu tách đôi */
  function mpop(i){ SL.forEach(function(s){ if(idxOf(s)===i && s.A && !s.fade){ s.pop=.9; } }); }
  function checkPkg(){ if(ST.S!=null && ST.f && ST.m && pkList().indexOf(ST.S)<0){ ST.S=null; ST.b=0; ST.d=0; ST.split=null; } }
  /* dãy số: chạm = một mức · kéo qua nhiều số = một khoảng (viên Acid giãn theo ngón tay) · nhả tay = sang câu sau.
     Viên = 2 đầu tròn + thân 1 px co giãn bằng transform (không đổi width) — nảy từ .9 (chuẩn #5) khi vừa chọn */
  function bindNums(pg, range, onPick, init){
    var box=pg.querySelector('.sv-q'), row=box.querySelector('.sv-row'), btns=[].slice.call(row.children), cap=box.querySelector('.sv-cap'), cl=cap.children[0], cm=cap.children[1], cr=cap.children[2], st=null, shown=false;
    function cx(i){ var b=btns[i]; return row.offsetLeft+b.offsetLeft+b.offsetWidth/2; }
    function at(clientX){ var r=row.getBoundingClientRect(), x=clientX-r.left, best=0; for(var i=1;i<btns.length;i++){ if(Math.abs(btns[i].offsetLeft+btns[i].offsetWidth/2-x)<Math.abs(btns[best].offsetLeft+btns[best].offsetWidth/2-x)) best=i; } return best; }
    function show(a,b,popIt){ btns.forEach(function(x,i){ x.classList.toggle('dim', a!=null && (i<a || i>b)); x.setAttribute('aria-pressed', a!=null && i>=a && i<=b ? 'true' : 'false'); });
      if(a==null){ cap.classList.remove('on','pop'); shown=false; return; }
      var c0=cx(a), c1=cx(b);
      if(!shown) cap.classList.add('nt');
      cl.style.transform='translateX('+(c0-4)+'px)'; cr.style.transform='translateX('+(c1-4)+'px)'; cm.style.transform='translateX('+c0+'px) scaleX('+Math.max(0,c1-c0)+')';
      if(!shown){ cap.style.transformOrigin=c0+'px 4px'; void cap.offsetWidth; cap.classList.remove('nt'); if(popIt){ cap.classList.remove('pop'); void cap.offsetWidth; cap.classList.add('pop'); } cap.classList.add('on'); shown=true; } }
    show(init?init[0]:null, init?init[1]:null, false);
    row.addEventListener('pointerdown', function(e){ if(LOCK) return; st={a:at(e.clientX), id:e.pointerId}; st.b=st.a; try{ row.setPointerCapture(e.pointerId); }catch(x){} if(shown){ cap.classList.remove('on'); shown=false; } show(st.a, st.b, true); });
    row.addEventListener('pointermove', function(e){ if(!st || !range) return; var b=at(e.clientX); if(b!==st.b){ st.b=b; show(Math.min(st.a,b), Math.max(st.a,b)); } });
    row.addEventListener('pointerup', function(){ if(!st) return; var a=Math.min(st.a,st.b), b=Math.max(st.a,st.b); st=null; onPick(a,b); });
    row.addEventListener('pointercancel', function(){ st=null; shown=false; show(init?init[0]:null, init?init[1]:null, false); });
    btns.forEach(function(x,i){ x.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); if(!LOCK){ shown=false; show(i,i,true); onPick(i,i); } } }); });
  }
  function bindRows(pg, onPick){
    var box=pg.querySelector('.sv-rows');
    [].forEach.call(box.querySelectorAll('.sv-r'), function(r){ r.onclick=function(){ if(LOCK) return; var i=+r.dataset.i;
      [].forEach.call(box.querySelectorAll('.sv-r'), function(x){ x.classList.toggle('on', x===r); x.style.removeProperty('--sdd'); }); box.classList.add('pick'); onPick(i); }; });
  }
  /* Ưu đãi: vòng tặng (một vòng = một buổi; chạm vòng n = tặng n, chạm lại vòng cuối đang sáng = bớt một; vòng khoá = phần giảm
     đang dùng đã chiếm chỗ) + thanh giảm (bước 10.000 ₫; nét đứt = phần đã đổi ra buổi tặng). Tặng thêm: sao chổi Acid bay từ vòng
     tới hạt tặng trên số 0, hạt sáng + gợn khi tới (reel comet) */
  function bindDeal(pg){
    [].forEach.call(pg.querySelectorAll('.sv-g'), function(g){ g.onclick=function(){ var k=+g.dataset.k; if(SVE.locked(ST.mode,ST.S,k,ST.d)){ g.classList.remove('no'); void g.offsetWidth; g.classList.add('no'); return; }
      var ob=ST.b, nb=(k===ST.b) ? k-1 : k; ST.b=nb; var q=Q(); nb=q.b;
      if(nb>ob && !rm()){ var pp=ST.mode==='1:2'?1:0;
        for(var j=ob+1;j<=nb;j++){ var gb=pg.querySelector('.sv-g[data-k="'+j+'"]').getBoundingClientRect(), a=[gb.left+gb.width/2, gb.top+gb.height/2], to=slotPos(ST.S+j-1, pp), dl=(j-ob-1)*.1;
          fxComet(a, [a[0]+(to[0]-a[0])*.25, Math.min(a[1],to[1])-60], to, .3, dl, 6.6); fxRing(to[0], to[1], 6, 32, .75, .42, .32+dl); }
        dealSync(pg, true); dial('deal', {dp:.3, chase:function(s,oc,nc){ var i=idxOf(s)-ST.S; return (nc==='a' && oc!=='a' && i>=0) ? .32+(i-ob)*.1 : null; }, chaseDur:.3, pop:.8});
      } else { dealSync(pg, true); dial('deal', {dp:.3, da:.22}); }
      ctrDeal(true); }; });
    var sl=pg.querySelector('.sv-sl'), drag=null;
    function setX(clientX){ var r=sl.getBoundingClientRect(), W=r.width, D=SVE.dMax(ST.mode,ST.S), f=clamp((clientX-r.left-12)/(W-24),0,1), d=Math.round(f*D/10000)*10000;
      d=Math.min(d, SVE.dCap(ST.mode,ST.S,ST.b)); if(d!==ST.d){ ST.d=d; dealSync(pg, false); ctrDeal(false); dial('deal', {dp:.2, da:.2}); } }
    sl.addEventListener('pointerdown', function(e){ if(!SVE.dMax(ST.mode,ST.S)) return; drag=e.pointerId; try{ sl.setPointerCapture(e.pointerId); }catch(x){} sl.classList.add('drag'); setX(e.clientX); });
    sl.addEventListener('pointermove', function(e){ if(drag==null) return; setX(e.clientX); });
    function up(){ drag=null; sl.classList.remove('drag'); }
    sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
  }
  function dealSync(pg, animate){
    var q=Q(); ST.b=q.b; ST.d=q.d;
    [].forEach.call(pg.querySelectorAll('.sv-g'), function(g){ var k=+g.dataset.k, lk=SVE.locked(ST.mode,ST.S,k,q.d);
      g.classList.toggle('on', k<=q.b); g.classList.toggle('lk', lk && k>q.b); g.classList.toggle('nx', k===q.b+1 && !lk); g.setAttribute('aria-pressed', k<=q.b?'true':'false'); });
    setNum(pg.querySelector('[data-k=b]'), String(q.b), animate); setNum(pg.querySelector('[data-k=d]'), vnd(q.d), animate);
    var sl=pg.querySelector('.sv-sl'), W=sl.clientWidth||345, reach=q.B ? W*(1-q.b/q.B) : W, kx=q.D ? 12+(W-24)*(q.d/q.D) : 12;
    sl.querySelector('.tk').style.transform='scaleX('+(reach/W).toFixed(4)+')';
    var bk=sl.querySelector('.bk'); bk.style.transform='translateX('+Math.min(W, reach+6).toFixed(1)+'px)'; bk.classList.toggle('off', reach>=W-0.5);
    sl.querySelector('.kn').style.transform='translateX('+(kx-12).toFixed(1)+'px)';
    sl.setAttribute('aria-valuenow', q.d); sl.setAttribute('aria-valuemax', q.dcap);
  }
  /* "36 buổi" của hàng gói vừa chọn bay lên cuối tiêu đề Ưu đãi, chạm đích thì sáng Acid (reel dealHeader) */
  function flyPkg(pg, oldPg){
    var ac=pg.querySelector('.head .ac'), srcRow=oldPg && oldPg.querySelector('.sv-r.on .t');
    if(!ac || !srcRow){ pg.classList.add('landed'); return; }
    var r0=srcRow.getBoundingClientRect(), r1=layRect(ac), f=flyText(srcRow, {left:r0.left, top:r0.top, height:r0.height}, {text:ac.textContent, z:60});
    srcRow.style.visibility='hidden';
    var k1=parseFloat(getComputedStyle(ac).fontSize)/parseFloat(getComputedStyle(srcRow).fontSize), b1=[r1.left, r1.top+(r1.height-r0.height*k1)/2];
    var a=flyPath(f, [r0.left, r0.top], [r0.left-44, 40], b1, 1, k1, 500, 0, EO);
    anim(f.el, [{color:'#FAFAFA'},{color:'#FAFAFA', offset:.6},{color:'#D4FF00'}], {duration:520, fill:'both'});
    var done=function(){ if(STEP==='deal') pg.classList.add('landed'); flyDrop(f); };
    if(a) a.onfinish=done; else done(); f.undo=function(){ pg.classList.add('landed'); };
  }

  /* ---------- phiếu đề xuất: in từng nấc (8 nấc × 150 ms, mỗi nấc đẩy giấy 90 ms) rồi xé khi khách đồng ý ---------- */
  function billIn(pg, delay){
    var w=pg.querySelector('.sv-billw'), sh=w.querySelector('.sv-bill'); if(sh.offsetHeight>w.clientHeight-10) sh.classList.add('tight');   /* màn thấp: phiếu gọn lại cho đủ đầu phiếu */
    if(rm() || !sh.animate){ sh.style.transform='none'; return; }
    var H=sh.offsetHeight+8, n=8, kf=[];
    for(var k=0;k<n;k++){ kf.push({transform:'translateY('+(H*(1-k/n)).toFixed(1)+'px)', offset:k/n, easing:C_EOUT}); kf.push({transform:'translateY('+(H*(1-(k+1)/n)).toFixed(1)+'px)', offset:(k+.6)/n, easing:'linear'}); }
    kf.push({transform:'translateY(0px)', offset:1});
    var a=anim(sh, kf, {duration:1200, delay:delay*1000, fill:'both'}); sh._pa=a;
    if(a) a.onfinish=function(){ sh.style.transform='none'; try{ a.cancel(); }catch(e){} if(sh._pa===a) sh._pa=null; };
    else sh.style.transform='none';
  }
  function curY(el){ var t=getComputedStyle(el).transform; if(!t || t==='none') return 0; var m=t.match(/matrix(3d)?\(([^)]+)\)/); if(!m) return 0; var v=m[2].split(',').map(parseFloat); return m[1] ? v[13] : v[5]; }
  /* khách đồng ý: tờ phiếu giật lên 8 pt rồi bị kéo đi (gia tốc đều), số phải trả ở lại rồi bay về hàng "Một lần" của câu kế (reel drawBill / drawTotalFly) */
  function tear(next){
    var pg=$id(PGS[PI]), sh=pg.querySelector('.sv-bill');
    if(rm() || !sh || !sh.animate){ render(next, 'fwd', true); return; }
    LOCK=2;
    var y0=curY(sh); if(sh._pa){ try{ sh._pa.cancel(); }catch(e){} sh._pa=null; } sh.style.transform='translateY('+y0.toFixed(1)+'px)';
    var tb=sh.querySelector('.tt b'), te=sh.querySelector('.tt em'), rb=tb.getBoundingClientRect(), re=te.getBoundingClientRect();
    /* bản sao Paper nằm TRÊN trang, bị cắt theo mép xé: giấy rời tới đâu số lộ ra tới đó (z −1 dưới trang bị lớp ghép của Chrome che mất) */
    var fb=flyText(tb, rb, {color:'#FAFAFA', z:60, keep:true}), fu=flyText(te, re, {color:'#9E9E9E', z:60, keep:true});
    sh.classList.add('torn');
    var edge=sh.getBoundingClientRect().bottom+5, lift=edge+75, Y=function(v){ return 'translateY('+(y0+v).toFixed(1)+'px)'; }, D=[0,0,8], O=[0,.067,.267], E=[null,C_EOUT,'linear'];
    for(var i=1;i<=8;i++){ var u=i/8; D.push(8+lift*u*u); O.push(.267+.733*u); E.push('linear'); }
    anim(sh, D.map(function(v,k){ var f={transform:Y(-v), offset:O[k]}; if(E[k]) f.easing=E[k]; return f; }), {duration:300, fill:'forwards'});
    [[fb,rb],[fu,re]].forEach(function(x){ var r=x[1]; anim(x[0].el, D.map(function(v,k){ var y=clamp(edge-v-r.top, 0, r.height+40), c='inset('+y.toFixed(1)+'px -40px -40px -40px)', f={clipPath:c, webkitClipPath:c, offset:O[k]}; if(E[k]) f.easing=E[k]; return f; }), {duration:300, fill:'both'}); });
    anim(pg.querySelector('.sv-slot'), [{opacity:1},{opacity:0}], {duration:220, delay:100, easing:C_EB, fill:'forwards'});
    setTimeout(function(){ if(STEP!=='bill'){ flyDrop(fb); flyDrop(fu); return; } render(next, 'fwd', true); landTotal(fb, fu, next); }, 220);
  }
  function landTotal(fb, fu, next){
    var pg=$id(PGS[PI]), v=next==='pm' && pg.querySelector('.sv-r[data-i="0"] .v'); fb.keep=fu.keep=false;
    if(!v){ [fb, fu].forEach(function(f){ f.a=anim(f.el, [{opacity:1},{opacity:0}], {duration:200, delay:140, fill:'forwards'}); if(f.a) f.a.onfinish=function(){ flyDrop(f); }; else flyDrop(f); }); return; }
    v.classList.add('wait'); var tb=v.querySelector('b'), te=v.querySelector('em'), r1=layRect(tb), r2=layRect(te), s0=fb.el.getBoundingClientRect(), u0=fu.el.getBoundingClientRect();
    var k1=parseFloat(getComputedStyle(tb).fontSize)/parseFloat(fb.el.style.fontSize), k2=parseFloat(getComputedStyle(te).fontSize)/parseFloat(fu.el.style.fontSize);
    var a=flyPath(fb, [s0.left, s0.top], [s0.left+40, s0.top-140], [r1.left, r1.top+(r1.height-s0.height*k1)/2], 1, k1, 360, 0, EO);
    flyPath(fu, [u0.left, u0.top], [u0.left+20, u0.top-140], [r2.left, r2.top+(r2.height-u0.height*k2)/2], 1, k2, 360, 0, EO);
    var fin=function(){ v.classList.remove('wait'); flyDrop(fb); flyDrop(fu); };
    fb.undo=function(){ v.classList.remove('wait'); };
    if(a) a.onfinish=fin; else fin();
  }

  /* ---------- Họ tên khách: dòng NỘI DUNG CHUYỂN KHOẢN viết theo từng chữ; phím Tiếp của bàn phím = sang mã QR ---------- */
  function bindName(pg){
    var inp=pg.querySelector('#sv-in'), cta=pg.querySelector('.sv-tiep');
    function sync(){ ST.names[ST.who]=inp.value; $id('sv-memo').textContent=SVE.memo(inp.value, ST.S, kyList().length>1);
      var ok=/[A-Z]/.test(SVE.ascii(inp.value)); cta.classList.toggle('off', !ok); cta.classList.toggle('away', document.activeElement===inp); }
    inp.addEventListener('input', sync);
    inp.addEventListener('focus', function(){ sync(); kbFit(); }); inp.addEventListener('blur', function(){ setTimeout(function(){ if(STEP==='name' && inp.isConnected && $id(PGS[PI]).contains(inp)){ sync(); kbFit(); } }, 60); });
    inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); nameNext(); } });
    sync();
  }
  function focusName(){ var inp=$id('sv-in'); if(inp){ try{ inp.focus({preventScroll:true}); }catch(e){ inp.focus(); } } }
  function nameNext(){
    var inp=$id('sv-in'); if(!inp) return;
    if(!/[A-Z]/.test(SVE.ascii(inp.value))){ var u=inp.parentNode.querySelector('.sv-ul'); u.classList.remove('err'); void u.offsetWidth; u.classList.add('err'); focusName(); return; }
    ST.names[ST.who]=inp.value.trim(); inp.blur(); render('qr', 'fwd', true, 'reveal');
  }
  /* bàn phím hệ thống mở → hàng điều hướng đi lên theo, cách mép bàn phím 12 pt (Figma 811:499) */
  function kbFit(){
    var pg=STEP==='name' && $id(PGS[PI]); if(!pg) return; var nav=pg.querySelector('.sv-nav'), vv=window.visualViewport;
    var kb=vv ? Math.max(0, window.innerHeight-vv.height-vv.offsetTop) : 0;
    nav.style.transform= kb>80 ? 'translateY('+(-(kb-16)).toFixed(0)+'px)' : '';
  }
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', kbFit); window.visualViewport.addEventListener('scroll', kbFit); }

  /* ---------- mã VietQR ---------- */
  function bankLoad(){
    if(DEMO){ BANK={demo:1, bin:'970407', bank:'TECHCOMBANK', name:'BẢN DEMO · KHÔNG CHUYỂN KHOẢN'}; return Promise.resolve(BANK); }
    if(!BANK){ try{ var c=JSON.parse(localStorage.getItem('lb_bank')||'null'); if(c && c.acc) BANK=c; }catch(e){} }
    if(BANK_P) return BANK_P;
    BANK_P=api({action:'bank'}, 1).then(function(r){ BANK_P=null;
      if(r && r.ok && r.acc){ BANK={bin:String(r.bin||'970407'), acc:String(r.acc), bank:String(r.bank||SVE.BANKS[String(r.bin||'970407')]||''), name:String(r.name||'')}; try{ localStorage.setItem('lb_bank', JSON.stringify(BANK)); }catch(e){} }
      else if(r && r.error==='no_bank'){ BANK=null; try{ localStorage.removeItem('lb_bank'); }catch(e){} }
      return BANK; }, function(){ BANK_P=null; return BANK; });
    return BANK_P;
  }
  /* thẻ mã: 78 pt dưới tiêu đề (Figma), màn thấp thì bớt khoảng rồi thu mã — không bao giờ đè hàng điều hướng */
  function qrFit(pg){
    var body=pg.querySelector('.body'), w=pg.querySelector('.sv-qrw'), card=w.querySelector('.sv-card'), H=body.clientHeight, W=body.clientWidth;
    var fixed=16+16+96+20+13, q=W-32, mt=78, room=H-28;
    if(mt+q+fixed>room){ mt=Math.max(16, room-q-fixed); if(mt+q+fixed>room){ q=Math.max(180, room-16-fixed); mt=16; } }
    w.style.marginTop=mt+'px'; card.style.width=(q+32)+'px'; card.style.marginLeft='auto'; card.style.marginRight='auto';
  }
  function qrFill(pg, src){
    var mm=SVE.memo(ST.names[ST.who], ST.S, kyList().length>1), amt=kyList()[0];
    pg.querySelector('#sv-mm>span').textContent=mm;
    var rev=!!src && !rm() && reveal(pg, src);
    function paint(play){
      var cvs=pg.querySelector('#sv-qrc'), qe=pg.querySelector('#sv-qe'), lab=pg.querySelector('#sv-bank'); if(!cvs) return;
      if(!BANK || (!BANK.demo && !BANK.acc)){ cvs.hidden=true; qe.hidden=false; qe.textContent='CHƯA CÓ TÀI KHOẢN NHẬN'; lab.textContent='';
        notify('Chưa cài tài khoản nhận chuyển khoản', {err:true, action:{label:'Thử lại', fn:function(){ bankLoad().then(function(){ if(STEP==='qr') paint(false); }); }}}); return; }
      cvs.hidden=false; qe.hidden=true;
      var text=BANK.demo ? 'B0DY DEMO KHONG CHUYEN KHOAN' : SVE.vietqr(BANK.bin, BANK.acc, amt, mm);
      var r=play ? qrStart(cvs, text, 'in', .74) : qrDraw(cvs, text); LASTQR=text; cvs.dataset.v=r.v;
      var bt=[BANK.bank, BANK.name].filter(Boolean).join(' · ').toUpperCase();
      if(play) typeOn(lab, bt, 1.2, .012); else lab.textContent=bt;
    }
    if(BANK) paint(rev); else { busyLine(true); bankLoad().then(function(){ busyLine(false); if(STEP==='qr') paint(false); }); }
  }
  /* chấm tròn 0,86 mô-đun, ba mắt bo 2,2 / 1,4 / 1 mô-đun, vùng trống giữa mã cho ô logo (24,5 % bề rộng mã) — Figma 812:535 */
  function qrGeo(cvs, text){
    var W=cvs.clientWidth||313, k=Math.min(window.devicePixelRatio||1,3);
    if(cvs._g && cvs._g.text===text && cvs._g.W===W && cvs._g.k===k) return cvs._g;   /* mã đã dựng: không mã hoá lại (≈ 5 ms máy thật mỗi lần) */
    var r=QRX.encode(text, 9), n=r.n, M=W/n;
    cvs.width=Math.round(W*k); cvs.height=Math.round(W*k);
    var hole=Math.round(n*76.8/313)+2; if((n-hole)%2) hole++; var h0=(n-hole)/2, h1=h0+hole, c=W/2, R=mulberry(53), dots=[], dmax=0;
    function eye(x,y){ return (x<7&&y<7)||(x>=n-7&&y<7)||(x<7&&y>=n-7); }
    for(var y=0;y<n;y++) for(var x=0;x<n;x++){ if(!r.mod[y*n+x] || eye(x,y) || (x>=h0&&x<h1&&y>=h0&&y<h1)) continue;
      var px=(x+.5)*M, py=(y+.5)*M, d=Math.hypot(px-c, py-c); if(d>dmax) dmax=d; dots.push({x:px, y:py, d:d, j:R()}); }
    return (cvs._g={text:text, r:r, n:n, W:W, k:k, M:M, c:c, dots:dots, dmax:dmax, eyes:[[3.5*M,3.5*M],[(n-3.5)*M,3.5*M],[3.5*M,(n-3.5)*M]], ctx:cvs.getContext('2d')});
  }
  function qrEye(c, cx, cy, M, s, a){ var m=M*s; if(m<=.01 || a<=.004) return; c.globalAlpha=Math.min(1,a);
    function rr(x,y,w,ra,col){ c.fillStyle=col; c.beginPath(); if(c.roundRect) c.roundRect(x,y,w,w,ra); else c.rect(x,y,w,w); c.fill(); }
    rr(cx-3.5*m, cy-3.5*m, 7*m, 2.2*m, '#0A0A0A'); rr(cx-2.5*m, cy-2.5*m, 5*m, 1.4*m, '#FAFAFA'); rr(cx-1.5*m, cy-1.5*m, 3*m, 1*m, '#0A0A0A'); c.globalAlpha=1; }
  function qrPaint(g){ var c=g.ctx; c.setTransform(g.k,0,0,g.k,0,0); c.clearRect(0,0,g.W,g.W);
    c.fillStyle='#0A0A0A'; c.beginPath(); g.dots.forEach(function(D){ c.moveTo(D.x+.43*g.M, D.y); c.arc(D.x, D.y, .43*g.M, 0, 6.2832); }); c.fill();
    g.eyes.forEach(function(e){ qrEye(c, e[0], e[1], g.M, 1, 1); }); }
  function qrDraw(cvs, text){ var g=qrGeo(cvs, text); qrPaint(g); return g.r; }
  /* mã lan theo sóng từ ô logo ra (2,4 ms mỗi pt, mỗi chấm nảy), ba mắt dập vào sau cùng · lúc kết: chấm thu từ mép vào (reel qrDot / qrEye) */
  var QRA=null;
  function qrStart(cvs, text, mode, delay){ var g=qrGeo(cvs, text); QRA={g:g, mode:mode, t0:MT+(delay||0), cvs:cvs, text:text}; NEED=true; motWake(); qrStep(); return g.r; }
  function qrStop(){ if(QRA && QRA.mode==='in' && QRA.cvs.isConnected) qrPaint(QRA.g); QRA=null; }
  function qrStep(){
    var A=QRA; if(!A) return false; if(!A.cvs.isConnected){ QRA=null; return false; }
    var g=A.g, c=g.ctx, t=MT-A.t0, M=g.M, on=false, i, D, x, y, r;
    c.setTransform(g.k,0,0,g.k,0,0); c.clearRect(0,0,g.W,g.W); c.fillStyle='#0A0A0A'; c.beginPath();
    for(i=0;i<g.dots.length;i++){ D=g.dots[i];
      if(A.mode==='in'){ var u=t-(D.d*.0024+D.j*.04); if(u<.62) on=true; if(u<=0) continue; var dr=1-.1*(1-EOUT(seg(u,0,.32))); x=g.c+(D.x-g.c)*dr; y=g.c+(D.y-g.c)*dr; r=.43*M*pop(u); }
      else { var to=(g.dmax-D.d)*.0014+D.j*.03, v=seg(t,to,to+.14); if(v>=1) continue; on=true; var e=EIN(v); x=g.c+(D.x-g.c)*(1-.12*e); y=g.c+(D.y-g.c)*(1-.12*e); r=.43*M*(1-e); }
      if(r>.02){ c.moveTo(x+r, y); c.arc(x, y, r, 0, 6.2832); }
    }
    c.fill();
    for(i=0;i<3;i++){ var E=g.eyes[i];
      if(A.mode==='in'){ var ue=t-(.42+.06*i); if(ue<.25) on=true; if(ue>0) qrEye(c, E[0], E[1], M, 1+.35*(1-EOUT(seg(ue,0,.24))), EB(seg(ue,0,.1))); }
      else { var ve=seg(t,.03*i,.03*i+.18); if(ve<1){ on=true; qrEye(c, E[0], E[1], M, 1-EIN(ve), 1); } } }
    if(!on){ if(A.mode==='in') qrPaint(g); else { c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,A.cvs.width,A.cvs.height); } QRA=null; return false; }
    return true;
  }
  function typeOn(el, text, delay, rate){ if(rm()){ el.textContent=text; return; } el.textContent='';
    tw({key:'svtype', from:0, to:text.length, dur:Math.max(.05, text.length*rate), delay:delay, ease:LIN, set:function(v){ if(el.isConnected) el.textContent=text.slice(0, Math.round(v)); }, done:function(){ if(el.isConnected) el.textContent=text; }}); }
  /* Họ tên → mã: dòng nội dung rơi xuống, viên Acid nở quanh nó thành thẻ, số tiền lăn vào, ô logo nở, mã lan, ⌂ nở thành Xong (reel v10) */
  function reveal(pg, src){
    var card=pg.querySelector('.sv-card'), mm=pg.querySelector('#sv-mm>span'), amt=pg.querySelector('.sv-amt b'), unit=pg.querySelector('.sv-amt em'), badge=pg.querySelector('.sv-badge'), memo=src && src.querySelector('#sv-memo');
    if(!card || !card.animate) return false;
    pg.classList.add('rv');
    var r1=layRect(mm), cr=layRect(card);
    if(memo && memo.textContent){ var r0=memo.getBoundingClientRect(), f=flyText(memo, {left:r0.left, top:r0.top, height:r0.height}, {text:mm.textContent, z:60});
      memo.style.visibility='hidden'; mm.style.visibility='hidden';
      var k=parseFloat(getComputedStyle(mm).fontSize)/parseFloat(getComputedStyle(memo).fontSize);
      var a=flyPath(f, [r0.left, r0.top], [r0.left+10, r1.top-30], [r1.left, r1.top+(r1.height-r0.height*k)/2], 1, k, 380, 20, EO);
      anim(f.el, [{color:'#FAFAFA'},{color:'#FAFAFA', offset:.55},{color:'#4A4A4A', offset:.8},{color:'#4A4A4A'}], {duration:400, fill:'both'});
      var fin=function(){ mm.style.visibility=''; flyDrop(f); }; f.undo=function(){ mm.style.visibility=''; };
      if(a) a.onfinish=fin; else fin();
    }
    var pl={l:r1.left-cr.left-12, t:r1.top-cr.top-(32-r1.height)/2, w:r1.width+24, h:32};
    var c0='inset('+pl.t.toFixed(1)+'px '+(cr.width-pl.l-pl.w).toFixed(1)+'px '+(cr.height-pl.t-pl.h).toFixed(1)+'px '+pl.l.toFixed(1)+'px round 16px)', c1='inset(0px 0px 0px 0px round 24px)';
    anim(card, [{opacity:0},{opacity:1}], {duration:60, delay:240, fill:'backwards'});
    anim(card, [{clipPath:c0, webkitClipPath:c0},{clipPath:c1, webkitClipPath:c1}], {duration:440, delay:280, easing:C_EA, fill:'backwards'});
    roll(amt, {delay:.5, spin:.32, stag:.05}); anim(unit, [{opacity:0},{opacity:1}], {duration:180, delay:720, easing:C_EB, fill:'backwards'});
    var z0='circle(0% at 50% 50%)', z1='circle(75% at 50% 50%)';
    anim(badge, [{clipPath:z0, webkitClipPath:z0},{clipPath:z1, webkitClipPath:z1}], {duration:240, delay:660, easing:C_EOUT, fill:'backwards'});
    anim(badge, [{transform:'scale(.9)'},{transform:'scale(1.12)', offset:.45},{transform:'scale(.98)', offset:.75},{transform:'scale(1)'}], {duration:420, delay:660, easing:C_EB, fill:'backwards'});
    anim(badge.querySelector('svg'), [{opacity:0},{opacity:1}], {duration:180, delay:720, easing:C_EB, fill:'backwards'});
    setTimeout(function(){ morph(pg); }, 1400);
    return true;
  }
  /* ⌂ nở thành Xong: nền Paper lan từ vòng ⌂ sang trái thành viên nút, ⌂ tắt ở 35 % đầu, chữ hiện ở 55 % cuối (reel drawPersist) */
  function morph(pg){
    if(STEP!=='qr' || !pg.classList.contains('rv')) return;
    var x=pg.querySelector('.svc'), h=pg.querySelector('.svh.phantom');
    if(!x || !h || !x.animate){ pg.classList.remove('rv'); return; }
    var rx=x.getBoundingClientRect(), rh=h.getBoundingClientRect(), W=rh.right-rx.left;
    var mf=document.createElement('i'); mf.className='mf'; mf.style.width=W.toFixed(1)+'px'; x.appendChild(mf); x.classList.add('mph'); h.classList.add('fading');
    pg.classList.remove('rv');
    var c0='inset(0px 0px 0px '+(W-rh.width).toFixed(1)+'px round 24px)', c1='inset(0px '+(W-rx.width).toFixed(1)+'px 0px 0px round 24px)';
    var a=anim(mf, [{clipPath:c0, webkitClipPath:c0, opacity:0}, {opacity:1, offset:.35}, {clipPath:c1, webkitClipPath:c1, opacity:1}], {duration:400, easing:C_EA, fill:'both'});
    anim(x.querySelector('span'), [{opacity:0},{opacity:0, offset:.55},{opacity:1}], {duration:400, fill:'both'});
    var ah=anim(h, [{opacity:1},{opacity:0}], {duration:140, fill:'both'}); if(ah) ah.onfinish=function(){ h.classList.remove('fading'); };
    var fin=function(){ x.style.transition='none'; x.classList.remove('mph'); if(mf.parentNode) mf.parentNode.removeChild(mf); void x.offsetWidth; x.style.transition=''; };   /* nền Paper vào ngay, không chạy transition từ trong suốt */
    if(a) a.onfinish=fin; else fin();
  }
  /* Xong: chấm mã thu từ mép vào, dải số tiền rút lên, thẻ co vào ô Acid; ô Acid thu thành chấm bay về chữ 0 của nút Sell (reel drawOutro) */
  function outro(){
    var pg=$id(PGS[PI]), card=pg.querySelector('.sv-card'), badge=pg.querySelector('.sv-badge'), cvs=pg.querySelector('#sv-qrc');
    if(rm() || !card || !card.animate){ exit(); return; }
    LOCK=2;
    qrStop(); if(cvs && !cvs.hidden && LASTQR){ QRA={g:qrGeo(cvs, LASTQR), mode:'out', t0:MT, cvs:cvs, text:LASTQR}; NEED=true; motWake(); }
    [pg.querySelector('.sv-amt'), pg.querySelector('.sv-mm'), pg.querySelector('#sv-bank'), pg.querySelector('#sv-qe')].forEach(function(e){ if(e) anim(e, [{opacity:1, transform:'none'},{opacity:0, transform:'translateY(8px)'}], {duration:160, easing:C_EIN, fill:'forwards'}); });
    var cr=card.getBoundingClientRect(), br=badge.getBoundingClientRect(), bl=br.left-cr.left, bt=br.top-cr.top;
    var k0='inset(0px 0px 0px 0px round 24px)', k1='inset(0px 0px 96px 0px round 24px)', k2='inset('+bt.toFixed(1)+'px '+(cr.width-bl-br.width).toFixed(1)+'px '+(cr.height-bt-br.height).toFixed(1)+'px '+bl.toFixed(1)+'px round '+(br.width*.22).toFixed(1)+'px)';
    anim(card, [{clipPath:k0, webkitClipPath:k0, offset:0}, {clipPath:k0, webkitClipPath:k0, offset:.034, easing:C_EIO}, {clipPath:k1, webkitClipPath:k1, offset:.483, easing:C_EIO}, {clipPath:k2, webkitClipPath:k2, offset:1}], {duration:580, fill:'forwards'});
    anim(badge.querySelector('svg'), [{opacity:1},{opacity:0}], {duration:160, delay:460, easing:C_EIN, fill:'forwards'});
    setTimeout(function(){
      var b=badge.getBoundingClientRect(), d=document.createElement('i'); d.className='svdotf';
      d.style.cssText='left:'+b.left.toFixed(1)+'px;top:'+b.top.toFixed(1)+'px;width:'+b.width.toFixed(1)+'px;height:'+b.height.toFixed(1)+'px;border-radius:'+(b.width*.22).toFixed(1)+'px';
      badge.style.visibility='hidden'; card.style.visibility='hidden';
      exit(); document.body.appendChild(d);
      var to=chipDot(), cx=b.left+b.width/2, cy=b.top+b.height/2; if(!to){ d.remove(); return; }
      var a=anim(d, [{transform:'translate(0px,0px) scale(1)', borderRadius:(b.width*.22).toFixed(1)+'px'}, {transform:'translate('+(to[0]-cx).toFixed(1)+'px,'+(to[1]-cy).toFixed(1)+'px) scale('+(3.2/b.width).toFixed(4)+')', borderRadius:(b.width/2).toFixed(1)+'px'}], {duration:520, easing:C_EIO, fill:'forwards'});
      var fin=function(){ var f=anim(d, [{opacity:1},{opacity:0}], {duration:220, easing:C_EB, fill:'forwards'}); if(f) f.onfinish=function(){ d.remove(); }; else d.remove(); };
      if(a) a.onfinish=fin; else d.remove();
    }, 580);
  }

  /* ---------- vào / ra ---------- */
  function ensureMarks(){
    if($id('b0dy-k')) return; var s=$id('b0dy'); if(!s) return;
    var k=s.cloneNode(true); k.id='b0dy-k'; [].forEach.call(k.querySelectorAll('path'), function(p){ p.removeAttribute('fill'); }); s.parentNode.appendChild(k);
  }
  function open(){
    if(ON && STEP) return; ensureMarks();
    ST=fresh(); HIST=[]; STEP=null; ON=true; CTR_KIND=''; CTR_HTML=''; SZ=1; FXL=[]; IDLE.amp=0; CD.d=0; CD.m=1;
    SL.forEach(function(s){ s.A=null; s.B=null; s.code=null; s.path=null; s.M=null; });
    $id('sv-dial').hidden=false; $id('sv-ctr').hidden=false; $id('sv-ctr').innerHTML=''; canvas();   /* cấp bộ nhớ canvas ngay lúc chạm (trước khi các chuyển động bắt đầu), không giữa khung đầu */
    bankLoad();
    render('q1', 'fwd', false);
  }
  function hide(){
    if(!ON) return; var inp=$id('sv-in'); if(inp) inp.blur();
    var pg=STEP ? $id(PGS[PI]) : null; if(pg && pg.classList.contains('on')){ freezeOut(pg); pg.classList.remove('in'); pg.classList.add('out','bk'); }   /* rời luồng: bước đang hiện rút xuống */
    ON=false; STEP=null; clearTimeout(ADV); LOCK=0; cdot(false); SMALL=false; flyClear(true); QRA=null; FXL=[];
    dial('none', {dp:.2, da:.2}); ctr('', null);
    setTimeout(function(){ if(!ON){ $id('sv-dial').hidden=true; $id('sv-ctr').hidden=true; $id('sv-ctr').innerHTML=''; SL.forEach(function(s){ s.A=null; s.B=null; s.code=null; s.path=null; });
      if(cv){ cv.width=0; cv.height=0; } CW=CH=0; SZ=1; } }, 260);   /* trả bộ nhớ canvas toàn màn (dpr 3 ≈ 12 MB) khi luồng đã đóng */
  }
  function exit(){ hide(); go('p-home','back'); }
  function home(){ if(LOCK===2 || !guard()) return; exit(); }
  function back(){
    if(LOCK===2 || !guard()) return; var h=HIST.pop(); if(!h){ exit(); return; }
    var inp=$id('sv-in'); if(inp) inp.blur();
    ST.who=h.who; render(h.id, 'back', false);
  }
  function cta(){
    if(LOCK===2 || !guard()) return;
    if(STEP==='deal'){ render('bill', 'fwd', true); return; }
    if(STEP==='bill'){ tear(nextOf('bill')); return; }
    if(STEP==='name'){ nameNext(); return; }
    if(STEP==='qr' && ST.mode==='1:2' && ST.who===0){ HIST.push({id:'qr', who:0}); ST.who=1; render('name', 'fwd', false); focusName(); return; }
    if(STEP==='qr'){ outro(); return; }
    if(STEP==='val'){ exit(); }
  }
  /* chữ "thật" của một nút số ở tâm (bỏ lớp lăn, chữ số giữ chỗ) — dùng cho test */
  function txtOf(n){ if(n.nodeType===3) return n.textContent; if(n.nodeType!==1) return ''; if(n.dataset && n.dataset.t!=null) return n.dataset.t;
    if(n.classList.contains('z') || n.classList.contains('rr')) return ''; var s=''; [].forEach.call(n.childNodes, function(c){ s+=txtOf(c); }); return s; }
  return {
    open:open, back:back, home:home, cta:cta, hide:hide,
    draw:function(dv){ if(NEED) draw(dv); },
    busy:function(){ return NEED; },
    onGo:function(id){ if(ON && !/^p-sv/.test(id||'')) hide(); },
    resize:function(){ SZ=1; if(!ON || !STEP) return; var pg=$id(PGS[PI]); if(!pg || !pg.classList.contains('on')) return; GEO=geoOf(STEP, pg); dial(PLAN_NOW, {dp:0, da:0, force:true}); var y=GEO.cy; $id('sv-ctr').style.transform='translateY('+y+'px)'; },
    /* test / chẩn đoán */
    _st:function(){ return ST; }, _step:function(){ return STEP; }, _geo:function(){ return GEO; }, _bank:function(v){ if(v!==undefined) BANK=v; return BANK; }, _qr:function(){ return LASTQR; }, _kb:function(){ kbFit(); }, _small:function(){ return SMALL; },
    _fade:function(){ var n=0, bad=0; SL.forEach(function(s){ if(!s.A || !s.B || !s.fade) return; var P=cur(s); if(!P || P===s.B) return; n++;
      var on=function(Q){ return Math.abs(P.x-Q.x)<.01 && Math.abs(P.y-Q.y)<.01; }; if(!on(s.A) && !on(s.B)) bad++; }); return {n:n, bad:bad}; },
    _dots:function(){ var o={}; SL.forEach(function(s){ var P=s.B; if(P && P.a>0.004 && s.code){ var k=s.code==='q'?'o':(s.code==='cloud'?'p':s.code); o[k]=(o[k]||0)+1; } }); return o; },
    _ctr:function(){ var ly=$id('sv-ctr').querySelector('.ly:not(.out)'); return ly ? [].map.call(ly.children, txtOf).join(' ') : ''; },
    _idle:function(){ return {amp:IDLE.amp, need:NEED, fx:FXL.length, qra:!!QRA, lock:LOCK, fly:FLY.length}; }
  };
})();
if(SVX) window.addEventListener('resize', function(){ SVX.resize(); });

if(typeof module!=='undefined' && module.exports){ module.exports={SVE:SVE, QRX:QRX}; }

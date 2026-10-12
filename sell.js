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
   SVX · giao diện (chỉ trong trình duyệt) · v2.11.0 — chuyển động tiết chế
   Mỗi bước là một trang .page dựng lại bằng JS, luân phiên hai khung #p-sv / #p-sv2, chuyển bằng go()/show() của app. Trang Bán không
   trượt (số 0 nằm dưới, đứng yên): nội dung cũ tắt hẳn trong 100 ms rồi nội dung mới hiện + trồi 8 pt 220 ms (lùi: từ trên xuống) — MỘT nhịp
   cho mọi bước (app.css). Mỗi bước chỉ một chuyển động kể chuyện, và nó nằm trên số 0 (canvas #sv-dial, cùng đồng hồ MT của app): đám
   mây gom lại khi mở luồng · thành vòng 24 tuần khi chọn tần suất · tuần sáng thêm khi chọn tháng · buổi tặng sáng Acid · lịch thu.
   Số ở tâm (#sv-ctr): lớp cũ tắt rồi lớp mới hiện (không chồng chữ). Phiếu trồi khỏi khe in một lần. Không có gì đổi thì không vẽ (không "thở", không vòng rAF
   chạy không). 1:2 = 1:1 với bảng giá 1:2 (một khách, một số 0, một mã). Giảm chuyển động: chỉ mờ, không dịch chuyển.
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
  function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  /* một đường cong cho mọi thứ: B0DY (.2,0,0,1) — vào nhanh, dừng êm. Rời = mờ tuyến tính (app.css) */
  var EB=bez(.2,0,0,1), C_EB='cubic-bezier(.2,0,0,1)';
  function anim(el,kf,o){ if(!el || !el.animate) return null; try{ return el.animate(kf,o); }catch(e){ return null; } }

  /* ---------- trạng thái bán hàng ---------- */
  var PGS=['p-sv','p-sv2'], PI=1, ST=null, HIST=[], STEP=null, LOCK=0, NAVT=0, ON=false, BANK=null, BANK_P=null, ADV=0, LASTQR='';
  var GEO={cx:196.5, cy:377, rx:128, gap:8, s:1};
  function fresh(){ return {mode:null, f:null, m:null, S:null, b:0, d:0, split:null, pay:null, card:null, name:''}; }
  function Q(){ return SVE.quote(ST.mode||'1:1', ST.S, ST.b, ST.d); }
  function kyList(){ var q=Q(); return (ST.split && q.kys>1) ? SVE.split(q.total, q.kys) : [q.total]; }
  var vnd=SVE.vnd;

  /* ---------- hạt: 24 tuần × 5 làn + vòng hai (3 tuần × 3 làn, buổi tặng gói 72) — một khách, một số 0 (1:2 cũng vậy) ---------- */
  var SL=[];
  (function(){ var w, l; for(w=0;w<24;w++) for(l=0;l<5;l++) SL.push({lap:1, w:w, l:l}); for(w=0;w<3;w++) for(l=0;l<3;l++) SL.push({lap:2, w:w, l:l}); })();
  (function(){ var R=mulberry(29); SL.forEach(function(s){ s.r=R(); }); })();   /* lệch ngẫu nhiên (cố định) lúc đám mây gom lại */
  function idxOf(s){ return s.lap===2 ? 72+s.w*3+s.l : (s.l<3 ? s.w*3+s.l : -1); }
  function vis(s, code, G){
    if(code==='cloud'){ var c=CL[CLM[s.w*3+s.l]], k=G.rx/128; return {x:G.cx+(c[0]-196.5)*k, y:G.cy+(c[1]-376)*k, d:c[2]*Math.max(.8,k), c:CP, a:c[3], h:0}; }
    var ry=G.rx*RAT, off=(s.lap===2 ? -(s.l+3) : (s.l-1))*G.gap, P=ep(G.rx, ry, TS24[s.w], off), dp=P[1]/ry;
    if(!code) return {x:G.cx+P[0], y:G.cy+P[1], d:3.6*G.s, c:CP, a:0, h:0};
    var sd=SD[code]; return {x:G.cx+P[0], y:G.cy+P[1], d:sd[0]*(1+.12*dp)*G.s, c:sd[1], a:sd[2]<0 ? .86+.14*(.5+.5*dp) : sd[2], h:sd[3]};
  }
  function mixc(a,b,p){ return [a[0]+(b[0]-a[0])*p, a[1]+(b[1]-a[1])*p, a[2]+(b[2]-a[2])*p]; }
  function blend(A,B,p){ var q=clamp(p,0,1); return {d:lerp(A.d,B.d,q), c:mixc(A.c,B.c,q), a:lerp(A.a,B.a,q), h:lerp(A.h,B.h,q), arc:B.h>A.h ? q : 1, la:lerp(A.lab?A.a:0, B.lab?B.a:0, q)}; }
  /* vị trí và dáng (cỡ · màu · độ sáng) đi cùng một đường cong, có thể lệch nhau một chút; giảm chuyển động: mờ ở chỗ cũ rồi hiện ở chỗ mới */
  function cur(s){
    if(!s.B) return null; var B=s.B; if(!s.A) return B;
    var kp=s.dp>0 ? clamp((MT-s.tp)/s.dp,0,1) : 1, ka=s.da>0 ? clamp((MT-s.ta)/s.da,0,1) : 1, A=s.A;
    if(kp>=1 && ka>=1) return B;
    if(s.fade){ var k=Math.max(kp,ka), F=k<.5 ? A : B, f=k<.5 ? 1-2*k : 2*k-1; return {x:F.x, y:F.y, d:F.d, c:F.c, a:F.a*f, h:F.h, arc:1, lab:F.lab, la:(F.lab?F.a:0)*f}; }
    var e=EB(kp), ap=blend(A, B, EB(ka));
    return {x:lerp(A.x,B.x,e), y:lerp(A.y,B.y,e), d:ap.d, c:ap.c, a:ap.a, h:ap.h, arc:ap.arc, lab:B.lab, la:ap.la};
  }
  /* kế hoạch hạt theo bước — trả mã trạng thái hoặc null (ẩn) */
  function lane(s, litW, f0, f1, optW){
    if(s.lap!==1) return null;
    if(s.w<litW){ if(s.l<f0) return 'p'; if(s.l<f1) return 'q'; return s.l<3?'g':null; }
    if(s.w<optW){ if(s.l<f1) return 'q'; return s.l<3?'g':null; }
    return s.l<3?'g':null;
  }
  var PLAN={
    cloud:function(s){ return (s.lap===1 && s.l<3) ? 'cloud' : null; },
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
  function same(A,B){ return !!A && !!B && Math.abs(A.x-B.x)<.01 && Math.abs(A.y-B.y)<.01 && Math.abs(A.a-B.a)<.002 && Math.abs(A.d-B.d)<.01 && A.c[1]===B.c[1] && A.h===B.h && A.lab===B.lab; }
  /* đổi kế hoạch / hình học: mọi hạt đi tiếp từ chỗ đang hiện (ngắt được). Hạt chưa hiện thì hiện tại chỗ (to dần từ nửa cỡ).
     o: dp / da (s) · stag(s) → trễ riêng (s) · from(s, B) → điểm xuất phát của hạt chưa hiện · force */
  function dial(plan, o){
    o=o||{}; if(SMALL && plan!=='none'){ plan='none'; o={dp:.16, da:.16}; }
    var G=GEO, fn=PLAN[plan]||PLAN.none, fade=rm(); PLAN_NOW=plan;
    for(var i=0;i<SL.length;i++){
      var s=SL[i], code=fn(s), B=vis(s, code, G);
      if(code==='m') B.lab=mlabel(s);
      s.code=code;
      if(s.B && !o.force && same(s.B,B)) continue;   /* đích không đổi → để chuyển động đang chạy chạy tiếp */
      var A=cur(s);
      if(!A || A.a<=0.004){
        if(B.a<=0.004){ s.A=null; s.B=B; continue; }
        A=o.from ? o.from(s,B) : {x:B.x, y:B.y, d:B.d*.5, c:B.c, a:0, h:0};
      } else if(same(A,B)){ s.A=null; s.B=B; continue; }
      s.A=A; s.B=B; s.fade=fade;
      s.tp=s.ta=MT+((!fade && o.stag) ? o.stag(s) : 0);
      s.dp=fade ? .2 : (o.dp!=null ? o.dp : .3); s.da=fade ? .2 : (o.da!=null ? o.da : .24);
    }
    NEED=true; motWake();
  }
  /* mở luồng: đám mây gom vào từ 108 % và hiện dần (lệch ngẫu nhiên ≤ 120 ms) — thay cho xoáy + sao chổi + gợn */
  function gather(s,B){ return {x:GEO.cx+(B.x-GEO.cx)*1.08, y:GEO.cy+(B.y-GEO.cy)*1.08, d:B.d*.6, c:B.c, a:0, h:0}; }

  /* chấm Acid ở tâm (khách mới): hiện từ .9 + mờ khi mở luồng, tắt khi chọn tần suất */
  var CD={k:0};
  function cdot(on, delay){ var to=on?1:0; if(!twHas('svcd') && Math.abs(CD.k-to)<.01) return;
    tw({key:'svcd', from:CD.k, to:to, dur:on?.28:.16, ease:EB, delay:delay||0, set:function(v){ CD.k=clamp(v,0,1); NEED=true; }}); }

  var cv=null, ctx=null, CW=0, CH=0, CK=0, SZ=1;   /* SZ: cần đo lại khung (mở luồng / đổi cỡ cửa sổ) — không đọc layout trong từng khung hình */
  function canvas(){
    if(!cv){ cv=$id('sv-dial'); ctx=cv.getContext('2d'); }
    if(SZ){ SZ=0; var w=document.body.clientWidth, h=document.body.clientHeight, k=Math.min(window.devicePixelRatio||1,3);
      if(w!==CW || h!==CH || k!==CK){ CW=w; CH=h; CK=k; cv.width=Math.round(w*k); cv.height=Math.round(h*k); } }
    ctx.setTransform(CK,0,0,CK,0,0);
  }
  function rgba(c,a){ return 'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+(a>1?1:a<0?0:a).toFixed(3)+')'; }
  function spaced(t, x, y, ls){ for(var i=0;i<t.length;i++){ ctx.fillText(t[i], x, y); x+=ctx.measureText(t[i]).width+ls; } }
  /* vẽ chỉ khi có hạt đang đổi; xong thì NEED = false → app.js thôi gọi khung (canvas giữ hình cuối, không tốn gì) */
  function draw(){
    if(!cv && !ON) return; canvas(); ctx.clearRect(0,0,CW,CH);
    var busy=false, pts=[], labs=[];
    for(var i=0;i<SL.length;i++){
      var s=SL[i]; if(!s.B) continue;
      if(s.A){ if(MT<Math.max(s.tp+s.dp, s.ta+s.da)) busy=true; else s.A=null; }
      var P=cur(s); if(P && P.a>0.004) pts.push(P);
    }
    pts.sort(function(a,b){ return a.d-b.d; });
    for(var j=0;j<pts.length;j++){ dot(pts[j]); if(pts[j].lab) labs.push(pts[j]); }
    if(CD.k>0.01){ ctx.fillStyle=rgba(CA, CD.k); ctx.beginPath(); ctx.arc(GEO.cx, GEO.cy, (9+CD.k)/2, 0, 6.2832); ctx.fill(); }
    if(labs.length){ ctx.font='500 11px "JetBrains Mono", Menlo, monospace'; ctx.textBaseline='middle';
      labs.forEach(function(P){ var a=P.la!=null?P.la:P.a; if(a<=0.01) return; ctx.fillStyle=rgba(CA, a); spaced(P.lab, P.x+9*GEO.s+2, P.y+.5, .88); }); }
    NEED=busy || twHas('svcd');
  }
  function dot(P){
    if(P.h>0.001){ var fa=P.a*(1-P.h); if(fa>0.004){ ctx.fillStyle=rgba(P.c, fa); ctx.beginPath(); ctx.arc(P.x,P.y,P.d/2,0,6.2832); ctx.fill(); }
      var arc=P.arc<1 ? P.arc : 1; if(arc<=0) return;
      ctx.strokeStyle=rgba(P.c, P.a*(P.arc<1 ? 1 : P.h)); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(P.x,P.y,Math.max(.05,P.d/2-.5),-Math.PI/2,-Math.PI/2+6.2832*arc); ctx.stroke(); }
    else { ctx.fillStyle=rgba(P.c, P.a); ctx.beginPath(); ctx.arc(P.x,P.y,P.d/2,0,6.2832); ctx.fill(); }
  }

  /* ---------- số ở tâm số 0 (DOM, dưới trang): từng dòng đặt theo khoảng cách tới tâm (Figma) · đổi = lớp cũ tắt rồi lớp mới hiện (app.css) ---------- */
  var CTR_KIND='', CTR_HTML='';
  /* bề ngang lòng số 0 (trừ 3 làn hạt); số Mono rộng 0,6 em/ký tự → biết trước số có lọt không */
  function inner(){ var G=GEO; if(SMALL || !STEP || /^(bill|name|qr)$/.test(STEP) || (STEP==='val' && ST.pay!=='card')) return document.body.clientWidth-48; return 2*(G.rx-14*G.s)-8; }
  function monoW(t, size, ls){ return t.length*(0.6*size+ls); }
  function ctrRows(kind){
    var q=ST.S ? Q() : null, L=function(t){ return '<span class="lb">'+t+'</span>'; }, N=function(c,t,k){ return '<span class="'+c+'"'+(k?' data-k="'+k+'"':'')+'>'+t+'</span>'; }, W=inner();
    function rng(a,b){ return a===b ? String(a) : a+'–'+b; }
    switch(kind){
      case 'freq': return [[-73, L('MỖI THÁNG')], [-50, N('n72', rng(ST.f[0]*4, ST.f[1]*4))], [26, '<span class="u20">BUỔI</span>']];
      case 'range': var t=rng(ST.f[0]*ST.m[0]*4, ST.f[1]*ST.m[1]*4);
        return monoW(t,72,-2.16)<=W ? [[-50, N('n72', t)], [26, '<span class="u20">BUỔI</span>']] : [[-37, N('n44', t)], [13, '<span class="u20">BUỔI</span>']];
      case 'pkg': return monoW(String(ST.S),112,-3.36)<=W ? [[-68.5, N('n112', String(ST.S))], [44.5, '<span class="u20">BUỔI</span>']] : [[-50, N('n72', String(ST.S))], [26, '<span class="u20">BUỔI</span>']];
      case 'deal': return [[-44.5, L('ĐƠN GIÁ SAU ƯU ĐÃI')], [-21.5, N('n44', vnd(q.unit), 'unit')+'<span class="u20">₫</span>'],
                           [30.5, '<span class="m12">Σ '+N('pp', vnd(q.total), 'tot')+' ₫ / '+N('', String(q.sessions), 'ses')+' BUỔI</span>']];
      case 'pay': var k=kyList(), tv=SVE.tr(k.length>1 ? k[1] : k[0]), lb=L(k.length>1 ? 'TRẢ MỖI KỲ' : 'THANH TOÁN');
        return monoW(tv,72,-2.16)+32<=W ? [[-57, lb], [-34, N('n72', tv)+'<span class="u20">TR</span>']] : [[-44, lb], [-21, N('n44', tv)+'<span class="u20">TR</span>']];
      case 'fee': return [[-44, L('PHÍ QUẸT THẺ')], [-21, N('n44', SVE.pctTxt(SVE.CARDS[ST.card].f))+'<span class="u20">%</span>']];
      case 'val': var v=kyList()[0], rows=[[-44, L(kyList().length>1 ? 'THANH TOÁN KỲ 1' : 'THANH TOÁN')]];
        if(ST.pay==='card'){ var T=SVE.gross(v, SVE.CARDS[ST.card].f); rows.push([-21, N('n44 ac', vnd(T))+'<span class="u20">₫</span>']);
          rows.push([31, '<span class="m14">+ '+vnd(T-v)+'</span><span class="m12">₫</span><span class="lb">PHÍ QUẸT THẺ</span>']); }
        else rows.push([-21, N('n44 ac', vnd(v))+'<span class="u20">₫</span>']);
        return rows;
    }
    return [];
  }
  /* o.instant: kéo thanh giảm → đổi chữ ngay trong lớp đang hiện (không thay lớp mỗi bước 10.000 ₫) */
  function ctr(kind, cy, o){
    var el=$id('sv-ctr'); if(cy!=null) el.style.transform='translateY('+Math.round(cy)+'px)';
    var html=kind ? ctrRows(kind).map(function(r){ return '<div class="k" style="top:'+r[0]+'px">'+r[1]+'</div>'; }).join('') : '', old=el.querySelector('.ly:not(.out)');
    if(old && kind===CTR_KIND && html===CTR_HTML) return;
    if(old && kind && kind===CTR_KIND && o && o.instant){ old.innerHTML=html; CTR_HTML=html; ctrFit(old); return; }
    CTR_KIND=kind; CTR_HTML=html;
    /* lớp cũ đang hiện dở thì mờ đi từ đúng độ mờ đang có (không bật về rồi mới tắt) */
    if(old){ var cs=getComputedStyle(old); old.style.opacity=cs.opacity; if(cs.transform && cs.transform!=='none') old.style.transform=cs.transform;
      old.classList.add('out'); setTimeout(function(){ if(old.parentNode) old.parentNode.removeChild(old); }, 140); }
    if(!kind) return;
    var ly=document.createElement('div'); ly.className='ly'+(old?' x':''); ly.innerHTML=html; el.appendChild(ly); ctrFit(ly);
  }
  function ctrFit(ly){
    if(!ly) return; ly.style.scale=''; var mx=0;
    [].forEach.call(ly.children, function(k){ var l=1e9, r=-1e9; [].forEach.call(k.children, function(c){ var b=c.getBoundingClientRect(); if(b.width){ l=Math.min(l,b.left); r=Math.max(r,b.right); } }); if(r>l) mx=Math.max(mx, r-l); });
    var k=mx>0 ? Math.min(1, inner()/mx) : 1; if(k<1){ ly.style.transformOrigin='50% 0'; ly.style.scale=Math.max(.7,k).toFixed(3); }
  }

  /* ---------- dựng từng bước ---------- */
  var TITLE={q1:'Hình thức tập?', q2:'Tần suất tập?', q3:'Thời gian tập?', pk:'Gói tập?', bill:'Đề xuất cho khách', pm:'Phương thức trả?', pf:'Hình thức trả?', card:'Loại thẻ của khách?', val:'Giá trị phải trả', name:'Họ tên khách?', qr:'Quét mã QR'};
  function title(id){ return id==='deal' ? 'Ưu đãi cho gói <span class="ac">'+ST.S+' buổi</span>' : TITLE[id]; }
  /* dãy số: chạm = một mức · kéo qua nhiều số = một khoảng · viên Acid dưới số chọn (2 đầu tròn + thân 1 pt co giãn bằng transform) */
  function nums(list, unit, wide){
    return '<div class="sv-ans sv-q'+(wide?' w':'')+'"><div class="sv-unit">'+(unit||'')+'</div><div class="sv-row">'+list.map(function(v,i){ return '<button class="sv-n" data-i="'+i+'">'+v+'</button>'; }).join('')+'</div>'+
      '<i class="sv-cap" aria-hidden="true"><i class="cl"></i><i class="cm"></i><i class="cr"></i></i></div>';
  }
  var LOGO='<span class="svlogo" aria-hidden="true"><svg viewBox="0 0 23 16"><rect width="23" height="16" rx="2.5" fill="#fff"/><path fill="#172B85" fill-rule="evenodd" d="M7.02517 10.8392H5.63182L4.58697 6.79524C4.53738 6.60922 4.43208 6.44477 4.27718 6.36726C3.89063 6.17248 3.46468 6.01746 3 5.93928V5.78359H5.24458C5.55437 5.78359 5.78671 6.01746 5.82543 6.28908L6.36756 9.20609L7.76023 5.78359H9.11486L7.02517 10.8392ZM9.88932 10.8392H8.57341L9.65698 5.78359H10.9729L9.88932 10.8392ZM12.6754 7.18413C12.7141 6.91184 12.9464 6.75615 13.2175 6.75615C13.6434 6.71706 14.1074 6.79524 14.4947 6.98935L14.727 5.90087C14.3398 5.74517 13.9138 5.66699 13.5273 5.66699C12.2501 5.66699 11.3207 6.36726 11.3207 7.33915C11.3207 8.07851 11.979 8.46673 12.4437 8.7006C12.9464 8.9338 13.14 9.08949 13.1013 9.32269C13.1013 9.67249 12.7141 9.82818 12.3275 9.82818C11.8629 9.82818 11.3982 9.71158 10.9729 9.5168L10.7406 10.606C11.2052 10.8001 11.708 10.8783 12.1726 10.8783C13.6047 10.9167 14.4947 10.2171 14.4947 9.167C14.4947 7.84464 12.6754 7.76713 12.6754 7.18413ZM19.1 10.8392L18.0552 5.78359H16.9329C16.7005 5.78359 16.4682 5.93928 16.3907 6.17248L14.4559 10.8392H15.8106L16.081 10.1005H17.7454L17.9003 10.8392H19.1ZM17.1265 7.14505L17.513 9.05041H16.4294L17.1265 7.14505Z"/></svg>'+
    '<svg viewBox="0 0 23 16"><rect width="23" height="16" rx="2.5" fill="#fff"/><path fill="#ED0006" d="M14.9745 2.99219C17.75 2.99232 19.9999 5.20576 19.9999 7.93555C19.9996 10.6651 17.7499 12.8778 14.9745 12.8779C13.73 12.8779 12.5915 12.4322 11.7137 11.6953C10.8361 12.4319 9.6982 12.8779 8.45398 12.8779C5.6785 12.8777 3.42859 10.6643 3.42859 7.93457C3.42885 5.20504 5.67866 2.99238 8.45398 2.99219C9.69798 2.99219 10.8361 3.43748 11.7137 4.17383C12.5914 3.43716 13.7302 2.99219 14.9745 2.99219Z"/><path fill="#F9A000" d="M14.974 2.99219C17.7496 2.99219 20.0004 5.20568 20.0004 7.93555C20.0001 10.6652 17.7495 12.8779 14.974 12.8779C13.7295 12.8779 12.592 12.4313 11.7142 11.6943C12.7939 10.7878 13.4797 9.44114 13.4799 7.93555C13.4799 6.42953 12.7943 5.08141 11.7142 4.1748C12.5919 3.43809 13.7297 2.99223 14.974 2.99219Z"/><path fill="#FF5E00" d="M11.7141 4.17383C12.7944 5.08036 13.4796 6.42847 13.4797 7.93457C13.4797 9.44065 12.7943 10.7887 11.7141 11.6953C10.6341 10.7887 9.94849 9.44056 9.94849 7.93457C9.9486 6.42856 10.6339 5.08036 11.7141 4.17383Z"/></svg></span>';
  function rows(list, size, sel){
    return '<div class="sv-ans sv-rows '+size+(sel!=null?' pick':'')+'">'+list.map(function(r,i){
      return '<button class="sv-r'+(sel===i?' on':'')+'" data-i="'+i+'"><i class="sd"></i><span class="l"><span class="t">'+r.l+(r.logo?LOGO:'')+'</span>'+(r.sub?'<span class="sub">'+r.sub+'</span>':'')+'</span>'+
        '<span class="v">'+(r.v?'<b>'+r.v+'</b>':'')+(r.u?'<em>'+r.u+'</em>':'')+'</span></button>'; }).join('')+'</div>';
  }
  function levers(){
    var B=SVE.giftMax(ST.S), g='';
    for(var k=1;k<=B;k++) g+='<button class="sv-g" data-k="'+k+'" aria-label="Tặng '+k+' buổi">'+ico('i-plus')+'</button>';
    return '<div class="sv-ans sv-lev"><div class="sv-lv"><div class="h"><span class="t">Tặng buổi</span><span class="v"><b data-k="b">0</b><em>BUỔI</em></span></div><div class="sv-gs'+(B>4?' n7':'')+'">'+g+'</div></div>'+
      '<div class="sv-lv"><div class="h"><span class="t">Giảm giá</span><span class="v"><b data-k="d">0</b><em>₫</em></span></div><div class="sv-sl" role="slider" aria-label="Giảm giá"><i class="tw"><i class="tk"></i><i class="bk"></i></i><i class="kn"></i></div></div></div>';
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
      '<svg class="wm" viewBox="0 0 132 43" aria-label="B0DY"><use href="#b0dy-k"/></svg><div class="dt">PHIẾU ĐỀ XUẤT · '+date+'</div><i class="dl"></i>'+
      '<div class="pk">GÓI '+q.S+' BUỔI'+(ST.mode==='1:2'?' · 1:2':'')+'</div><div class="rs">'+
      r.map(function(x){ return '<div class="r"><span class="l">'+x[0]+'</span><span class="v"><b>'+x[1]+'</b><em>'+x[2]+'</em></span></div>'; }).join('')+
      '</div><i class="dl"></i><div class="tl">THANH TOÁN</div><div class="tt"><b>'+vnd(q.total)+'</b><em>₫</em></div></div><i class="sv-slot"></i></div>';
  }
  function nameBox(){
    return '<div class="sv-nm"><input class="sv-in" id="sv-in" type="text" value="'+esc(ST.name)+'" placeholder="Họ và tên đầy đủ" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="next" aria-label="Họ tên khách">'+
      '<i class="sv-ul"></i><div class="lab">NỘI DUNG CHUYỂN KHOẢN</div><div class="sv-memo" id="sv-memo"></div></div>';
  }
  function qrBox(){
    var v=kyList()[0];
    return '<div class="sv-qrw"><div class="sv-card"><div class="sv-qq"><canvas class="sv-qrc" id="sv-qrc" aria-label="Mã VietQR"></canvas><div class="sv-badge"><svg viewBox="0 0 132 43" aria-hidden="true"><use href="#b0dy-k"/></svg></div><div class="sv-qe lab" id="sv-qe" hidden></div></div>'+
      '<div class="sv-strip"><div class="sv-amt"><b>'+vnd(v)+'</b><em>₫</em></div><div class="sv-mm" id="sv-mm"><span></span></div></div></div><div class="lab sv-bank" id="sv-bank"></div></div>';
  }
  function bodyOf(id){
    var sp='<div class="sv-sp"></div>', q;
    switch(id){
      case 'q1': return sp+nums(['1:1','1:2'], '', true);
      case 'q2': return sp+nums(SVE.FREQ, 'BUỔI/TUẦN');
      case 'q3': return sp+nums(SVE.MONTHS, 'THÁNG');
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
  /* nút chính luôn ở giữa: ← · nút chính · ⌂ (màn không có ⌂ thì ghost giữ chỗ). Họ tên: Tiếp luôn hiện, kể cả khi bàn phím mở (chủ studio 12/10 18:50) */
  function navOf(id){
    var back=id!=='q1', cta=null, home=true;
    if(id==='deal') cta={t:'Chốt ưu đãi'};
    else if(id==='bill') cta={t:'Khách đồng ý'};
    else if(id==='name') cta={t:'Tiếp', c:'sv-tiep'};
    else if(id==='qr' || id==='val'){ cta={t:'Xong', c:'paper'}; home=false; }
    return '<div class="nav sv-nav">'+(back ? '<button class="ghost svb" aria-label="Quay lại" onclick="SVX.back()">'+ico('i-back24','s24')+'</button>' : '<span class="gh0"></span>')+
      (cta ? '<button class="cta svc '+(cta.c||'')+'" onclick="SVX.cta()">'+cta.t+'</button>' : '')+
      (home ? '<button class="ghost svh" aria-label="Về trang chủ" onclick="SVX.home()">'+ico('i-home24','s24')+'</button>' : '<span class="gh0"></span>')+'</div>';
  }
  function pkList(){ return SVE.match(ST.f[0], ST.f[1], ST.m[0], ST.m[1]); }

  /* hình học số 0 theo khoảng trống giữa khối đỉnh và khối trả lời (Figma: cách ≥ 44 pt, rx ≤ 128; màn số phải trả 162) */
  function topIn(el, pg){ var y=0; while(el && el!==pg){ y+=el.offsetTop; el=el.offsetParent; } return y; }
  function geoOf(id, pg){
    var hd=pg.querySelector('.head'), top=hd.offsetTop+hd.offsetHeight, anc=pg.querySelector('.sv-row') || pg.querySelector('.sv-ans') || pg.querySelector('.sv-nav'),
        bot=topIn(anc, pg), h=Math.max(120, bot-top), cap=(id==='val')?162:128, m=h<420?24:44, rx=Math.max(60, Math.min(cap, Math.floor(((h/2-m)-12)/RAT))), s=Math.max(.7, Math.min(1, rx/128));
    return {cx:pg.clientWidth/2, cy:Math.round(top+h/2), rx:rx, gap:Math.round(8*s*10)/10, s:s};
  }

  /* ---------- điều hướng giữa các bước ---------- */
  function render(id, dir, push){
    if(push && STEP) HIST.push(STEP);
    var prev=STEP, oldPg=STEP ? $id(PGS[PI]) : null; STEP=id; clearTimeout(ADV); LOCK=0;
    PI=1-PI; var pg=$id(PGS[PI]);
    if(oldPg) freeze(oldPg);
    pg.innerHTML='<div class="head"><span class="t1">'+title(id)+'</span></div><div class="body sv-b">'+bodyOf(id)+'</div>'+navOf(id);
    pg.dataset.step=id;
    go(pg.id, dir||'fwd');
    bind(id, pg);
    /* bước không có số 0 (phiếu, họ tên, mã QR, tiền mặt): giữ hình học cũ để hạt tắt tại chỗ; số ở tâm vẫn theo khoảng trống mới */
    var G=geoOf(id, pg), hasDial=!(id==='bill' || id==='name' || id==='qr' || (id==='val' && ST.pay!=='card'));
    if(hasDial){ SMALL=G.rx<92; GEO=G; }
    switch(id){
      case 'q1': if(!prev){ cdot(true, .12); dial('cloud', {from:gather, stag:function(s){ return s.r*.12; }, dp:.5, da:.4}); } else { cdot(true); dial('cloud'); } ctr('', G.cy); break;
      case 'q2': cdot(!ST.f); if(ST.f){ dial('freq'); ctr('freq', G.cy); } else { dial('cloud'); ctr('', G.cy); } break;
      case 'q3': cdot(false); if(ST.m){ dial('months'); ctr('range', G.cy); } else { dial('freq'); ctr('freq', G.cy); } break;
      case 'pk': if(ST.S!=null && pkList().indexOf(ST.S)>=0){ dial('pkg'); ctr('pkg', G.cy); } else { dial('months'); ctr('range', G.cy); } break;
      case 'deal': dial('deal'); ctr('deal', G.cy); dealSync(pg); break;
      case 'pm': dial('pay'); ctr(ST.split==null ? '' : 'pay', G.cy); break;
      case 'pf': dial('pay'); ctr('pay', G.cy); break;
      case 'card': dial('pay'); ctr(ST.card!=null ? 'fee' : '', G.cy); break;
      case 'val': if(ST.pay==='card') dial('pos', {dp:.36, da:.3}); else dial('none', {dp:.16, da:.16}); ctr('val', G.cy); break;
      default: dial('none', {dp:.16, da:.16}); ctr('', null);   /* phiếu · họ tên · mã QR */
    }
  }
  /* trang cũ đang hiện dở: chép độ mờ / vị trí đang có vào inline → mờ đi từ đúng chỗ đang thấy (không bật về rồi mới tắt) */
  function freeze(pg){ if(rm()) return; [].forEach.call(pg.querySelectorAll(':scope>.head, :scope>.body'), function(e){ var c=getComputedStyle(e); if(c.opacity!=='1') e.style.opacity=c.opacity; if(c.transform && c.transform!=='none') e.style.transform=c.transform; }); }
  /* chọn xong: viên / chấm vừa nảy (240 ms) thì sang câu sau — chờ 200 ms (mục B, chủ studio 12/10 16:06) */
  function advance(){ LOCK=1; clearTimeout(ADV); ADV=setTimeout(function(){ LOCK=0; var n=nextOf(STEP); if(n) render(n, 'fwd', true); }, rm() ? 120 : 200); }
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

  /* ---------- tương tác từng bước: chạm → dữ liệu trên số 0 đổi ngay (một chuyển động), số ở tâm đổi lớp, rồi sang câu ---------- */
  function bind(id, pg){
    var init2=function(L, v){ return v ? [L.indexOf(v[0]), L.indexOf(v[1])] : null; };
    if(id==='q1') bindNums(pg, false, function(a){ var m=a?'1:2':'1:1'; if(m!==ST.mode){ ST.mode=m; ST.b=0; ST.d=0; } advance(); }, ST.mode ? [ST.mode==='1:2'?1:0, ST.mode==='1:2'?1:0] : null);
    else if(id==='q2') bindNums(pg, true, function(a,b){ ST.f=[SVE.FREQ[a], SVE.FREQ[b]]; checkPkg(); cdot(false);
        dial('freq', {dp:.42, da:.3, stag:function(s){ return s.w*.004; }}); ctr('freq'); advance(); }, init2(SVE.FREQ, ST.f));
    else if(id==='q3') bindNums(pg, true, function(a,b){ ST.m=[SVE.MONTHS[a], SVE.MONTHS[b]]; checkPkg();
        dial('months', {dp:.3, da:.24, stag:function(s){ return s.w*.006; }}); ctr('range'); advance(); }, init2(SVE.MONTHS, ST.m));
    else if(id==='pk') bindRows(pg, function(i){ var S=pkList()[i]; if(S!==ST.S){ ST.S=S; ST.b=0; ST.d=0; ST.split=null; } dial('pkg', {dp:.24, da:.24}); advance(); });   /* tâm giữ khoảng buổi → Ưu đãi đổi thẳng sang đơn giá */
    else if(id==='pm') bindRows(pg, function(i){ ST.split=(i===1); dial('pay', {dp:.24, da:.24}); ctr('pay'); advance(); });
    else if(id==='pf') bindRows(pg, function(i){ ST.pay=['ck','cash','card'][i];
        if(ST.pay==='ck'){ render('name', 'fwd', true); focusName(); return; }   /* iOS chỉ mở bàn phím khi focus ngay trong lượt chạm */
        advance(); });
    else if(id==='card') bindRows(pg, function(i){ ST.card=i; advance(); });   /* phí hiện ngay ở bước sau (số quẹt + phí) */
    else if(id==='deal') bindDeal(pg);
    else if(id==='bill') billIn(pg);
    else if(id==='name') bindName(pg);
    else if(id==='qr'){ qrFit(pg); qrFill(pg); }
  }
  function checkPkg(){ if(ST.S!=null && ST.f && ST.m && pkList().indexOf(ST.S)<0){ ST.S=null; ST.b=0; ST.d=0; ST.split=null; } }
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
      [].forEach.call(box.querySelectorAll('.sv-r'), function(x){ x.classList.toggle('on', x===r); x.classList.remove('pop'); }); void r.offsetWidth; r.classList.add('pop');
      box.classList.add('pick'); onPick(i); }; });
  }
  /* Ưu đãi: vòng tặng (một vòng = một buổi; chạm vòng n = tặng n, chạm lại vòng cuối đang sáng = bớt một; vòng khoá = phần giảm đang dùng
     đã chiếm chỗ) + thanh giảm (bước 10.000 ₫; nét đứt = phần đã đổi ra buổi tặng). Tặng: hạt tặng sáng Acid ngay trên số 0 */
  function bindDeal(pg){
    [].forEach.call(pg.querySelectorAll('.sv-g'), function(g){ g.onclick=function(){ var k=+g.dataset.k;
      if(SVE.locked(ST.mode,ST.S,k,ST.d)){ g.classList.remove('no'); void g.offsetWidth; g.classList.add('no'); return; }
      ST.b=(k===ST.b) ? k-1 : k; dealSync(pg); dial('deal', {dp:.22, da:.22}); ctr('deal'); }; });
    var sl=pg.querySelector('.sv-sl'), drag=null;
    function setX(clientX){ var r=sl.getBoundingClientRect(), W=r.width, D=SVE.dMax(ST.mode,ST.S), f=clamp((clientX-r.left-12)/(W-24),0,1), d=Math.round(f*D/10000)*10000;
      d=Math.min(d, SVE.dCap(ST.mode,ST.S,ST.b)); if(d!==ST.d){ ST.d=d; dealSync(pg); ctr('deal', null, {instant:true}); dial('deal', {dp:.16, da:.16}); } }
    sl.addEventListener('pointerdown', function(e){ if(!SVE.dMax(ST.mode,ST.S)) return; drag=e.pointerId; try{ sl.setPointerCapture(e.pointerId); }catch(x){} sl.classList.add('drag'); setX(e.clientX); });
    sl.addEventListener('pointermove', function(e){ if(drag==null) return; setX(e.clientX); });
    function up(){ drag=null; sl.classList.remove('drag'); }
    sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
  }
  function dealSync(pg){
    var q=Q(); ST.b=q.b; ST.d=q.d;
    [].forEach.call(pg.querySelectorAll('.sv-g'), function(g){ var k=+g.dataset.k, lk=SVE.locked(ST.mode,ST.S,k,q.d);
      g.classList.toggle('on', k<=q.b); g.classList.toggle('lk', lk && k>q.b); g.classList.toggle('nx', k===q.b+1 && !lk); g.setAttribute('aria-pressed', k<=q.b?'true':'false'); });
    pg.querySelector('[data-k=b]').textContent=String(q.b); pg.querySelector('[data-k=d]').textContent=vnd(q.d);
    var sl=pg.querySelector('.sv-sl'), W=sl.clientWidth||345, reach=q.B ? W*(1-q.b/q.B) : W, kx=q.D ? 12+(W-24)*(q.d/q.D) : 12;
    sl.querySelector('.tk').style.transform='scaleX('+(reach/W).toFixed(4)+')';
    var bk=sl.querySelector('.bk'), ci='inset(0px 0px 0px '+Math.min(W, reach+6).toFixed(1)+'px)'; bk.style.clipPath=ci; bk.style.webkitClipPath=ci; bk.classList.toggle('off', reach>=W-0.5);   /* nét đứt = phần đã đổi ra tặng (cắt, không đẩy ra ngoài màn) */
    sl.querySelector('.kn').style.transform='translateX('+(kx-12).toFixed(1)+'px)';
    sl.setAttribute('aria-valuenow', q.d); sl.setAttribute('aria-valuemax', q.dcap);
  }

  /* ---------- phiếu đề xuất: trồi khỏi khe in một lần (420 ms, sau nhịp vào của trang) ---------- */
  function billIn(pg){
    var w=pg.querySelector('.sv-billw'), sh=w.querySelector('.sv-bill'); if(sh.offsetHeight>w.clientHeight-10) sh.classList.add('tight');   /* màn thấp: phiếu gọn lại cho đủ đầu phiếu */
    sh.style.transform='none'; if(rm()) return;
    anim(sh, [{transform:'translateY(calc(100% + 8px))'},{transform:'translateY(0)'}], {duration:420, delay:120, easing:C_EB, fill:'backwards'});
  }

  /* ---------- Họ tên khách: dòng NỘI DUNG CHUYỂN KHOẢN viết theo từng chữ; Tiếp luôn hiện (xám tới khi có tên); Return = Tiếp ---------- */
  function bindName(pg){
    var inp=pg.querySelector('#sv-in'), cta=pg.querySelector('.sv-tiep');
    function sync(){ ST.name=inp.value; $id('sv-memo').textContent=SVE.memo(inp.value, ST.S, kyList().length>1); cta.classList.toggle('off', !/[A-Z]/.test(SVE.ascii(inp.value))); }
    inp.addEventListener('input', sync);
    inp.addEventListener('focus', kbFit); inp.addEventListener('blur', function(){ setTimeout(function(){ if(STEP==='name' && inp.isConnected && $id(PGS[PI]).contains(inp)) kbFit(); }, 60); });
    inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); nameNext(); } });
    sync();
  }
  function focusName(){ var inp=$id('sv-in'); if(inp){ try{ inp.focus({preventScroll:true}); }catch(e){ inp.focus(); } } }
  function nameNext(){
    var inp=$id('sv-in'); if(!inp) return;
    if(!/[A-Z]/.test(SVE.ascii(inp.value))){ var u=inp.parentNode.querySelector('.sv-ul'); u.classList.remove('err'); void u.offsetWidth; u.classList.add('err'); focusName(); return; }
    ST.name=inp.value.trim(); inp.blur(); render('qr', 'fwd', true);
  }
  /* bàn phím hệ thống mở → hàng điều hướng (← · Tiếp · ⌂) đi lên theo, cách mép bàn phím 12 pt (Figma 811:499) */
  function kbFit(){
    var pg=STEP==='name' && $id(PGS[PI]); if(!pg) return; var nav=pg.querySelector('.sv-nav'), vv=window.visualViewport;
    var kb=vv ? Math.max(0, window.innerHeight-vv.height-vv.offsetTop) : 0;
    nav.style.transform= kb>80 ? 'translateY('+(-(kb-16)).toFixed(0)+'px)' : '';
  }
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', kbFit); window.visualViewport.addEventListener('scroll', kbFit); }

  /* ---------- mã VietQR: vẽ sẵn, hiện cùng nhịp với nội dung bước ---------- */
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
  function qrFill(pg){
    var mm=SVE.memo(ST.name, ST.S, kyList().length>1), amt=kyList()[0];
    pg.querySelector('#sv-mm>span').textContent=mm;
    function paint(){
      var cvs=pg.querySelector('#sv-qrc'), qe=pg.querySelector('#sv-qe'), lab=pg.querySelector('#sv-bank'); if(!cvs) return;
      if(!BANK || (!BANK.demo && !BANK.acc)){ cvs.hidden=true; qe.hidden=false; qe.textContent='CHƯA CÓ TÀI KHOẢN NHẬN'; lab.textContent='';
        notify('Chưa cài tài khoản nhận chuyển khoản', {err:true, action:{label:'Thử lại', fn:function(){ bankLoad().then(function(){ if(STEP==='qr') paint(); }); }}}); return; }
      cvs.hidden=false; qe.hidden=true;
      var text=BANK.demo ? 'B0DY DEMO KHONG CHUYEN KHOAN' : SVE.vietqr(BANK.bin, BANK.acc, amt, mm);
      LASTQR=text; cvs.dataset.v=qrDraw(cvs, text).v;
      lab.textContent=[BANK.bank, BANK.name].filter(Boolean).join(' · ').toUpperCase();
    }
    if(BANK) paint(); else { busyLine(true); bankLoad().then(function(){ busyLine(false); if(STEP==='qr') paint(); }); }
  }
  /* chấm tròn 0,86 mô-đun, ba mắt bo 2,2 / 1,4 / 1 mô-đun, vùng trống giữa mã cho ô logo (24,5 % bề rộng mã) — Figma 812:535 */
  function qrGeo(cvs, text){
    var W=cvs.clientWidth||313, k=Math.min(window.devicePixelRatio||1,3);
    if(cvs._g && cvs._g.text===text && cvs._g.W===W && cvs._g.k===k) return cvs._g;
    var r=QRX.encode(text, 9), n=r.n, M=W/n;
    cvs.width=Math.round(W*k); cvs.height=Math.round(W*k);
    var hole=Math.round(n*76.8/313)+2; if((n-hole)%2) hole++; var h0=(n-hole)/2, h1=h0+hole, dots=[];
    function eye(x,y){ return (x<7&&y<7)||(x>=n-7&&y<7)||(x<7&&y>=n-7); }
    for(var y=0;y<n;y++) for(var x=0;x<n;x++){ if(!r.mod[y*n+x] || eye(x,y) || (x>=h0&&x<h1&&y>=h0&&y<h1)) continue; dots.push([(x+.5)*M, (y+.5)*M]); }
    return (cvs._g={text:text, r:r, W:W, k:k, M:M, dots:dots, eyes:[[3.5*M,3.5*M],[(n-3.5)*M,3.5*M],[3.5*M,(n-3.5)*M]], ctx:cvs.getContext('2d')});
  }
  function qrEye(c, cx, cy, M, s, a){ var m=M*s; if(m<=.01 || a<=.004) return; c.globalAlpha=Math.min(1,a);
    function rr(x,y,w,ra,col){ c.fillStyle=col; c.beginPath(); if(c.roundRect) c.roundRect(x,y,w,w,ra); else c.rect(x,y,w,w); c.fill(); }
    rr(cx-3.5*m, cy-3.5*m, 7*m, 2.2*m, '#0A0A0A'); rr(cx-2.5*m, cy-2.5*m, 5*m, 1.4*m, '#FAFAFA'); rr(cx-1.5*m, cy-1.5*m, 3*m, 1*m, '#0A0A0A'); c.globalAlpha=1; }
  function qrDraw(cvs, text){
    var g=qrGeo(cvs, text), c=g.ctx, R=.43*g.M; c.setTransform(g.k,0,0,g.k,0,0); c.clearRect(0,0,g.W,g.W);
    c.fillStyle='#0A0A0A'; c.beginPath(); g.dots.forEach(function(D){ c.moveTo(D[0]+R, D[1]); c.arc(D[0], D[1], R, 0, 6.2832); }); c.fill();
    g.eyes.forEach(function(e){ qrEye(c, e[0], e[1], g.M, 1, 1); }); return g.r;
  }

  /* ---------- vào / ra ---------- */
  function ensureMarks(){
    if($id('b0dy-k')) return; var s=$id('b0dy'); if(!s) return;
    var k=s.cloneNode(true); k.id='b0dy-k'; [].forEach.call(k.querySelectorAll('path'), function(p){ p.removeAttribute('fill'); }); s.parentNode.appendChild(k);
  }
  function open(){
    if(ON && STEP) return; ensureMarks();
    ST=fresh(); HIST=[]; STEP=null; ON=true; CTR_KIND=''; CTR_HTML=''; SZ=1; CD.k=0;
    SL.forEach(function(s){ s.A=null; s.B=null; s.code=null; });
    $id('sv-dial').hidden=false; $id('sv-ctr').hidden=false; $id('sv-ctr').innerHTML=''; canvas();   /* cấp canvas ngay lúc chạm, trước khi chuyển động bắt đầu */
    bankLoad();
    render('q1', 'fwd', false);
  }
  function hide(){
    if(!ON) return; var inp=$id('sv-in'); if(inp) inp.blur();
    var pg=STEP ? $id(PGS[PI]) : null; if(pg) freeze(pg);
    ON=false; STEP=null; clearTimeout(ADV); LOCK=0; cdot(false); SMALL=false;
    dial('none', {dp:.16, da:.16}); ctr('', null);
    setTimeout(function(){ if(!ON){ $id('sv-dial').hidden=true; $id('sv-ctr').hidden=true; $id('sv-ctr').innerHTML=''; SL.forEach(function(s){ s.A=null; s.B=null; s.code=null; });
      if(cv){ cv.width=0; cv.height=0; } CW=CH=0; SZ=1; } }, 240);   /* trả bộ nhớ canvas toàn màn (dpr 3 ≈ 12 MB) khi luồng đã đóng */
  }
  function exit(){ hide(); go('p-home','back'); }
  function home(){ if(!guard()) return; exit(); }
  function back(){
    if(!guard()) return; var id=HIST.pop(); if(!id){ exit(); return; }
    var inp=$id('sv-in'); if(inp) inp.blur();
    render(id, 'back', false);
  }
  function cta(){
    if(!guard()) return;
    if(STEP==='deal') render('bill', 'fwd', true);
    else if(STEP==='bill') render(nextOf('bill'), 'fwd', true);
    else if(STEP==='name') nameNext();
    else if(STEP==='qr' || STEP==='val') exit();
  }
  return {
    open:open, back:back, home:home, cta:cta, hide:hide,
    draw:function(dv){ if(NEED) draw(dv); },
    busy:function(){ return NEED; },
    onGo:function(id){ if(ON && !/^p-sv/.test(id||'')) hide(); },
    resize:function(){ SZ=1; if(!ON || !STEP) return; var pg=$id(PGS[PI]); if(!pg || !pg.classList.contains('on')) return; GEO=geoOf(STEP, pg); dial(PLAN_NOW, {dp:0, da:0, force:true}); $id('sv-ctr').style.transform='translateY('+GEO.cy+'px)'; },
    /* test / chẩn đoán */
    _st:function(){ return ST; }, _step:function(){ return STEP; }, _geo:function(){ return GEO; }, _bank:function(v){ if(v!==undefined) BANK=v; return BANK; }, _qr:function(){ return LASTQR; }, _kb:function(){ kbFit(); }, _small:function(){ return SMALL; },
    _fade:function(){ var n=0, bad=0; SL.forEach(function(s){ if(!s.A || !s.B || !s.fade) return; var P=cur(s); if(!P || P===s.B) return; n++;
      var on=function(Q){ return Math.abs(P.x-Q.x)<.01 && Math.abs(P.y-Q.y)<.01; }; if(!on(s.A) && !on(s.B)) bad++; }); return {n:n, bad:bad}; },
    _dots:function(){ var o={}; SL.forEach(function(s){ var P=s.B; if(P && P.a>0.004 && s.code){ var k=s.code==='q'?'o':(s.code==='cloud'?'p':s.code); o[k]=(o[k]||0)+1; } }); return o; },
    _ctr:function(){ var ly=$id('sv-ctr').querySelector('.ly:not(.out)'); return ly ? [].map.call(ly.children, function(k){ return k.textContent; }).join(' ') : ''; },
    _idle:function(){ return {need:NEED, lock:LOCK}; }
  };
})();
if(SVX) window.addEventListener('resize', function(){ SVX.resize(); });

if(typeof module!=='undefined' && module.exports){ module.exports={SVE:SVE, QRX:QRX}; }

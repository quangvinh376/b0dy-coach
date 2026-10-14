/* =====================================================================
   B0DY · Coach app — VÉ GIẤY THẬT (v2.18.0 · 14/10/2026)
   Chủ studio 14/10 16:03: lớp sáng tối v2.17.2 "chưa hề realistic, trông vẫn rất gượng ép — go all out, làm một realistically
   masterpiece". Lớp phủ gradient không bao giờ ra giấy thật: sáng tối vẽ tay không khớp hình dạng (vé vẫn phẳng như tấm dán). Nay vé
   được VẼ như một tờ giấy trong không gian 3D (WebGL2):
   · hình dạng thật: đầu vé (vết xé lần trước) cong lùi ra sau, cuống gập ra sau ở đường lỗ kim + xé hở bên trái (dáng Figma 03),
     phối cảnh thật (phần lùi xa nhỏ lại) — chữ in nằm TRÊN mặt giấy nên cong, co, nhận sáng cùng giấy
   · một nguồn sáng (trên, hơi trái, chếch về phía người xem) + bầu trời mờ: sáng tối sinh ra từ pháp tuyến của mặt giấy, không vẽ tay;
     giấy in nhiệt hơi bóng (vệt bóng mờ trượt theo độ cong)
   · chất giấy: thớ mịn (lệch pháp tuyến rất nhẹ), loang rất nhẹ; mực in nhiệt đậm nhạt không đều một chút
   · mép: răng cưa của dao xé không đều (độ sâu từng răng, sợi giấy ở mép); vết xé lần này của cuống và răng mẩu giấy trong khe là
     MỘT đường (khớp nhau tuyệt đối); đường lỗ kim xé ra có xơ giấy, hai mép khớp nhau; lỗ kim + khía là lỗ thật (thấy nền qua lỗ)
   · khe máy in: giấy càng vào sâu càng tối; vé lơ lửng đổ bóng mềm lên mép trên mặt máy (càng gần càng đậm, càng sắc)
   DOM vẫn là MÔ HÌNH: vé HTML (sell.js) giữ nguyên bố cục, nhịp, WAAPI, test — mỗi khung bộ vẽ đọc dáng đang có (ma trận vé, cuống,
   mẩu giấy, độ mờ từng dòng chữ, gạch dưới) rồi vẽ lại đúng dáng đó bằng giấy thật; vé DOM chỉ trong suốt. Độ cong / gập suy ra từ
   chính góc nghiêng của vé và cuống (in ra: phẳng → xé: cong + gập → Khách đồng ý: thẳng, phẳng lại) nên luôn khớp nhịp, lùi được,
   ngắt giữa chừng được. Lúc in (phẳng, z = 0) giấy trùng khít vé DOM tới từng điểm ảnh → con số bay hạ đúng chỗ.
   Chạy chung vòng rAF của app (SVX.draw / busy), tự dừng khi vé đứng yên (không tốn pin). Không có WebGL2 / mất ngữ cảnh → vé DOM như
   cũ (dự phòng). Tắt tay: localStorage 've3d' = '0'.
   ===================================================================== */
var VE3D=(function(){
  'use strict';
  if(typeof window==='undefined' || typeof document==='undefined') return null;

  /* ---------- tham số vật lý (đơn vị: pt của vé) ---------- */
  var V={
    curl:44,          /* đầu vé lùi ra sau tối đa (pt) khi đã xé — cong một chiều, phẳng dần về đường lỗ kim */
    curlP:.35,        /* lúc đang in: giấy càng ra khỏi khe càng ngả nhẹ ra sau (35 % độ cong) — dòng giá chính gần đáy nên vẫn đúng chỗ con số hạ */
    bend:.095,        /* cuống gập ra sau ở đường lỗ kim (rad ≈ 5,4°) */
    wave:1.5,         /* giấy không phẳng tuyệt đối: gợn rất nhẹ (pt) — lúc in giấy bị kéo căng (30 %), xé ra thì thả lỏng */
    exp:.9, knee:.9,         /* phơi sáng: giấy phẳng giữa vé ≈ #F7, chỗ sáng nhất không cháy trắng */
    cs:5,             /* cuống cong thêm về đuôi (pt) */
    eye:1150,         /* khoảng cách mắt (px) — phối cảnh nhẹ như nhìn điện thoại */
    eyeY:.42,         /* tâm phối cảnh theo chiều cao khung */
    lp:[.12, -1.6, 1000],   /* đèn chính: x, y theo khung (cao phía trên, hơi trái) · z (px, về phía người xem) — chiếu chếch từ trên nên độ cong hiện rõ */
    att:.55,          /* độ giảm sáng theo khoảng cách (mũ) */
    ka:.3, kd:.75, kh:.12, ks:.05, sh:18,    /* nền · khuếch tán · bầu trời · bóng (giấy in nhiệt hơi bóng) */
    grain:.045,       /* thớ giấy (lệch pháp tuyến) */
    fx:.16, fb:.3,    /* quán tính: đang nhấc / đang mở thì giấy cong, cuống gập thêm một chút rồi thả về (0 ở hai đầu nhịp) */
    m:2.5             /* lề lưới quanh mép (khử răng cưa bằng hàm khoảng cách) */
  };
  var SEL=['.ty','.dt','.gl','.bg .n','.bg .bu','.bg .md','.gd .c .l','.gd .c .v b','.gd .c .v em','.hp .l','.hp .v b','.hp .v em','.tl','.tt b','.tt em','.cd'];
  var TXI=null, TXD=null, T0=null, cv=null, gl=null, PG=null, SG=null, BG=null, NZ=null, OK=null, LOST=false, CUR=null, WMP=null, FR=0, ERR='';

  function off(){ try{ return localStorage.getItem('ve3d')==='0' || /[?&]ve=0\b/.test(location.search); }catch(e){ return false; } }
  function forced(){ try{ return localStorage.getItem('ve3d')==='1' || /[?&]ve=1\b/.test(location.search); }catch(e){ return false; } }
  /* WebGL chạy bằng CPU (không có GPU: SwiftShader / llvmpipe — máy bàn bị chặn GPU, trình duyệt kiểm thử) → vẽ giấy thật mỗi khung sẽ chậm
     → dùng vé DOM. iPhone: "Apple GPU". Ép bật: localStorage 've3d' = '1' */
  function soft(g){ try{ var x=g.getExtension('WEBGL_debug_renderer_info'), r=String(x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)); return /swiftshader|llvmpipe|software|microsoft basic/i.test(r) ? r : ''; }catch(e){ return ''; } }
  function clamp(x,a,b){ return x<a?a:(x>b?b:x); }
  function sm(t){ t=clamp(t,0,1); return t*t*(3-2*t); }

  /* ---------- shader ---------- */
  var VS_P=[
    '#version 300 es',
    'precision highp float; precision highp int;',
    'layout(location=0) in vec2 aP;',
    'uniform int uPc;',                      /* 0 thân · 1 cuống · 2 mẩu giấy trong khe */
    'uniform float uPy, uSh, uCurl, uBend, uCs, uK;',
    'uniform mat3 uSt, uTk, uRl;',
    'uniform vec3 uEye; uniform vec2 uCv; uniform float uWave;',
    /* gợn giấy: hai sóng rất dài (≈ 300 pt), biên độ uWave — trả về z và đạo hàm theo x, y (toạ độ vé) */
    'vec3 wave(vec2 p){ float a=p.x*0.021+p.y*0.006+1.3, b=p.y*0.017-0.4, c=p.x*0.009-p.y*0.013+2.1;',
    '  float z=0.6*sin(a)*sin(b)+0.4*sin(c);',
    '  float zx=0.6*0.021*cos(a)*sin(b)+0.4*0.009*cos(c), zy=0.6*(0.006*cos(a)*sin(b)+0.017*sin(a)*cos(b))-0.4*0.013*cos(c);',
    '  return vec3(z, zx, zy)*uWave; }',
    'out vec2 vP; out vec2 vT; out vec3 vN; out vec3 vW;',
    'void main(){',
    '  vec3 L; vec3 N; vec2 T;',
    '  if(uPc==0){',                          /* thân: z = −C(1 − v/py)² — đầu vé lùi, phẳng ở đường lỗ kim */
    '    float t=1.0-clamp(aP.y/uPy,0.0,1.0), dz=2.0*uCurl*t/uPy; vec3 w=wave(aP);',
    '    vec3 Ts=normalize(vec3(0.0,1.0,dz)), Nb=normalize(vec3(0.0,-dz,1.0));',
    '    L=vec3(aP.x, aP.y, -uCurl*t*t)+Nb*w.x; N=normalize(Nb-vec3(w.y,0.0,0.0)-Ts*w.z); T=aP;',
    '  } else if(uPc==1){',                   /* cuống: gập ra sau quanh đường lỗ kim + cong thêm về đuôi, rồi xoay trong mặt phẳng (DOM) */
    '    float s=aP.y, q=clamp(s/uSh,0.0,1.2), cb=cos(uBend), sb=sin(uBend), dz=-sb-2.0*uCs*q/uSh; vec3 w=wave(vec2(aP.x, uPy+s));',
    '    vec3 Ts=normalize(vec3(0.0,cb,dz)), Nb=normalize(vec3(0.0,-dz,cb));',
    '    L=vec3(aP.x, uPy+s*cb, -s*sb-uCs*q*q)+Nb*w.x; N=normalize(Nb-vec3(w.y,0.0,0.0)-Ts*w.z);',
    '    vec3 r=uSt*vec3(L.xy,1.0); L.xy=r.xy; N.xy=mat2(uSt)*N.xy; T=vec2(aP.x, uPy+s);',
    '  } else {',
    '    vec3 r=uRl*vec3(aP,1.0); L=vec3(r.xy,0.0); N=vec3(0.0,0.0,1.0); T=aP;',
    '  }',
    '  if(uPc!=2){ vec3 r=uTk*vec3(L.xy,1.0); L.xy=r.xy; L.z*=uK; N.xy=mat2(uTk)*N.xy/uK; }',
    '  float q=uEye.z/(uEye.z-L.z); vec2 s=uEye.xy+(L.xy-uEye.xy)*q; float w=1.0/q;',
    '  vP=aP; vT=T; vN=N; vW=L;',
    '  gl_Position=vec4((s.x/uCv.x*2.0-1.0)*w, (1.0-s.y/uCv.y*2.0)*w, 0.0, w);',
    '}'].join('\n');
  var FS_P=[
    '#version 300 es',
    'precision highp float; precision highp int;',
    'in vec2 vP; in vec2 vT; in vec3 vN; in vec3 vW;',
    'uniform int uPc, uUlId;',
    'uniform float uW, uPy, uSh, uH, uZd, uNz, uNh, uOpen, uAlpha, uDpr, uCvH, uGrain, uIref, uShin, uExp;',
    'uniform sampler2D uInk, uId, uNoise;',
    'uniform float uOp[32];',
    'uniform vec4 uUl, uSlot, uLt;',          /* gạch dưới (x, -, rộng, tiến độ) · khe (đỉnh, đáy, độ đậm) · ánh sáng (ka, kd, kh, ks) */
    'uniform vec3 uLp, uEp; uniform vec2 uAtt;',   /* vị trí đèn · vị trí mắt (toạ độ canvas, z về phía người xem) · giảm sáng (khoảng cách chuẩn, mũ) */
    'out vec4 o;',
    'float sabs(float x){ return sqrt(x*x+0.0016); }',
    'float nz(float x, float row){ return texture(uNoise, vec2(x, row)).r*2.0-1.0; }',
    /* mép xé của dao răng cưa: lệch chậm + sợi giấy; độ sâu từng răng không đều */
    'float edgeN(float u, float sd){ return 0.30*nz(u*0.0061+sd, 0.11) + 0.14*nz(u*0.027+sd, 0.37) + 0.07*nz(u*0.093+sd, 0.61); }',
    'float zigE(float u, float sd){ float w=uW/uNz, i=floor(u/w), f=fract(u/w); return uZd*(1.0+0.22*nz(i*0.137+sd, 0.71))*sabs(2.0*f-1.0+0.12*nz(i*0.291+sd, 0.43)); }',
    /* đường lỗ kim xé ra: mỗi cầu giấy giữa hai lỗ đứt một kiểu — vết xé võng lên hoặc xuống (mẩu cầu còn dính bên thân hay bên cuống,
       0 ở tâm lỗ) + xơ giấy; hai mép dùng chung một hàm → khớp nhau */
    'float perfN(float u){ float q=(u-17.0)/9.0, k=floor(q), b=2.0*(q-k)-1.0, w=(1.0-b*b)*(1.0-b*b);',
    '  return 2.4*nz(k*0.173+0.05, 0.27)*w + 0.40*nz(u*0.033, 0.53) + 0.20*nz(u*0.12, 0.83) + 0.08*nz(u*0.37, 0.29); }',
    'float holeD(vec2 p, float y){ float j=clamp(floor((p.x-17.0)/9.0+0.5), 0.0, uNh-1.0); return length(p-vec2(17.0+9.0*j, y))-2.0; }',
    /* phủ của một mép: s = độ xơ (pt) — mép xé mềm, mép dao cắt sắc */
    'float cA(float d, float s){ return clamp(d/max(fwidth(d)+s, 1e-3)+0.5, 0.0, 1.0); }',
    'vec3 lin(vec3 c){ return pow(max(c,vec3(0.0)), vec3(2.2)); }',
    'vec3 srgb(vec3 c){ return pow(max(c,vec3(0.0)), vec3(1.0/2.2)); }',
    /* vai mềm cho vùng sáng (như phim): trên 0,85 nén dần — giấy chỗ sáng nhất vẫn còn chi tiết, không cháy trắng */
    'uniform float uKnee;',
    'vec3 tone(vec3 x){ vec3 k=vec3(uKnee); return mix(x, k+(1.0-k)*(1.0-exp(-(x-k)/(1.0-k))), step(k, x)); }',
    'void main(){',
    '  vec2 p=vP; float sd=min(p.x, uW-p.x), t1, t2=1e3, nt=1e3, ho=1e3, cov;',
    '  if(uPc==0){',
    '    t1=p.y<uZd*1.4+3.0 ? p.y-zigE(p.x,0.5)-edgeN(p.x,0.5) : p.y-uZd*0.5;',          /* vết xé lần trước */
    '    t2=p.y>uPy-4.0 ? uPy+1.2*(1.0-uOpen)+perfN(p.x)*uOpen-p.y : uPy+1.2-p.y;',     /* còn liền: lấn 1,2 pt xuống dưới cuống (không lộ đường nối) */
    '    nt=min(length(p-vec2(0.0,uPy)), length(p-vec2(uW,uPy)))-11.0; ho=holeD(p,uPy);',
    '    cov=cA(t1,0.4)*cA(sd,0.0)*cA(t2,0.32*uOpen)*cA(nt,0.0)*cA(ho,0.1);',
    '  } else if(uPc==1){',
    '    t1=p.y<4.0 ? p.y-perfN(p.x)*uOpen : p.y;',
    '    t2=p.y>uSh-uZd*1.4-3.0 ? (uSh-uZd)+zigE(p.x,0.0)+edgeN(p.x,0.0)-p.y : uSh-uZd*0.5-p.y;',   /* vết xé lần này — cùng hàm với răng mẩu giấy trong khe */
    '    nt=min(length(p), length(p-vec2(uW,0.0)))-11.0; ho=holeD(p,0.0);',
    '    cov=cA(t1,0.32*uOpen)*cA(sd,0.0)*cA(t2,0.4)*cA(nt,0.0)*cA(ho,0.1);',
    '  } else { t1=p.y-zigE(p.x,0.0)-edgeN(p.x,0.0); cov=cA(t1,0.4)*cA(sd,0.0); }',
    '  if(cov<=0.002) discard;',
    '  float dm=min(min(min(t1,t2),min(nt,ho)),sd);',
    '  vec4 g=texture(uNoise, vT*0.0066);',                                             /* thớ ~0,6 pt */
    '  vec4 m=texture(uNoise, vT*0.0011+vec2(0.37,0.11));',                             /* loang chậm */
    '  vec3 N=normalize(vN+vec3((g.g-0.5)*uGrain, (g.b-0.5)*uGrain, 0.0));',
    '  vec3 paper=vec3(0.98)*(1.0+(m.a-0.5)*0.012+(g.a-0.5)*0.01);',
    '  vec3 alb=paper; float ik=0.0;',
    '  if(uPc!=2){',
    '    vec2 uv=vT/vec2(uW,uH);',
    '    vec4 ink=texture(uInk, uv);',                                                  /* mực (premultiplied, sRGB) */
    '    int id=int(texture(uId, uv).r*31.875+0.5);',
    '    float op=uOp[clamp(id,0,31)];',
    '    if(id==uUlId) op*=step(vT.x, uUl.x+uUl.z*uUl.w);',
    '    float dn=op*(0.975+0.025*m.r)*(0.985+0.015*g.a);',                            /* mực in nhiệt đậm nhạt không đều — rất nhẹ */
    '    alb=paper*(1.0-ink.a*dn)+ink.rgb*dn; ik=ink.a*dn;',
    '  }',
    /* đèn chính (điểm, xa) + bầu trời; bóng mờ của giấy in nhiệt theo vị trí mắt */
    '  vec3 Lv=uLp-vW; float dl=length(Lv); vec3 L=Lv/dl, V=normalize(uEp-vW), H=normalize(L+V);',
    '  float at=pow(uAtt.x/dl, uAtt.y);',
    '  float I=(uLt.x+uLt.y*max(dot(N,L),0.0)*at+uLt.z*(0.5-0.5*N.y))/uIref;',
    '  float sp=uLt.w*pow(max(dot(N,H),0.0), uShin)*at;',
    '  float y=uCvH-gl_FragCoord.y/uDpr;',                                              /* khe: giấy càng vào sâu càng tối */
    '  float ao=y>uSlot.x ? mix(0.34,0.05,clamp((y-uSlot.x)/max(uSlot.y-uSlot.x,1.0),0.0,1.0)) : 1.0-0.5*exp(-(uSlot.x-y)/4.5);',
    '  ao=mix(1.0, ao, uSlot.z);',
    /* mép giấy (dày ~0,1 mm): mép quay về phía đèn bắt sáng, mép quay đi tối hơn */
    '  vec2 gd=vec2(dFdx(dm), dFdy(dm)); float gn=length(gd); vec2 ou=gn>1e-6 ? -gd/gn : vec2(0.0);',
    '  float f=dot(ou, normalize(vec2(L.x, -L.y)+vec2(1e-5))), e=1.0-smoothstep(0.0, 1.1, dm);',
    '  float rim=1.0+e*(0.05*max(f,0.0)-0.1*max(-f,0.0)-0.02);',
    '  vec3 c=srgb(tone((lin(alb)*I*rim*ao+vec3(sp*ao*(1.0-0.9*ik)))*uExp));',
    '  float a=cov*uAlpha; o=vec4(c*a, a);',
    '}'].join('\n');
  /* bóng đổ của vé lên mép trên mặt máy in: từ mép đáy vé (đỉnh răng cuống) đã chiếu phối cảnh */
  var VS_S=['#version 300 es','precision highp float; precision highp int;','layout(location=0) in vec2 aP;','uniform vec4 uR; uniform vec2 uCv; out vec2 vC;',
    'void main(){ vec2 c=uR.xy+aP*uR.zw; vC=c; gl_Position=vec4(c.x/uCv.x*2.0-1.0, 1.0-c.y/uCv.y*2.0, 0.0, 1.0); }'].join('\n');
  var FS_S=['#version 300 es','precision highp float; precision highp int;','in vec2 vC;',
    'uniform vec2 uE0, uE1; uniform vec4 uPl; uniform float uA;',             /* uPl: mép trên mặt máy, đỉnh khe, trái, phải */
    'out vec4 o;',
    'void main(){',
    '  float x=vC.x, y=vC.y, t=clamp((x-uE0.x)/max(uE1.x-uE0.x,1.0),0.0,1.0), ey=mix(uE0.y,uE1.y,t);',
    '  float gap=uPl.x-ey, dep=y-uPl.x;',                                      /* vé cao hơn mặt máy bao nhiêu · điểm này sâu xuống mặt máy bao nhiêu */
    '  float sf=2.0+max(gap,0.0)*0.55;',                                        /* càng cao càng nhoè */
    '  float k=0.8*exp(-max(gap,0.0)/38.0)*(1.0-smoothstep(-1.0, sf+3.0, dep))*smoothstep(-sf-1.0, 0.5, dep+0.5);',
    '  k*=smoothstep(uE0.x-sf, uE0.x+sf, x)*(1.0-smoothstep(uE1.x-sf, uE1.x+sf, x));',
    '  k*=smoothstep(uPl.z, uPl.z+10.0, x)*(1.0-smoothstep(uPl.w-10.0, uPl.w, x));',
    '  k*=1.0-smoothstep(uPl.y-1.0, uPl.y+1.0, y);',                           /* chỉ trên mặt máy (khe đã tối sẵn) */
    '  o=vec4(0.0,0.0,0.0,k*uA);',
    '}'].join('\n');

  var FS_B=['#version 300 es','precision highp float; precision highp int;','in vec2 vC;',
    'uniform vec2 uQ[8]; uniform vec3 uSo; uniform float uA;',            /* tứ giác thân + cuống (toạ độ canvas, theo chiều kim đồng hồ) · lệch x, y, độ nhoè */
    'out vec4 o;',
    'float sdq(vec2 p, int b){ float d=-1e9; for(int i=0;i<4;i++){ vec2 a=uQ[b+i], c=uQ[b+(i+1)%4], e=normalize(c-a); d=max(d, dot(p-a, vec2(e.y,-e.x))); } return d; }',
    'void main(){ vec2 p=vC-uSo.xy; float d=min(sdq(p,0), sdq(p,4));',
    '  float k=1.0-smoothstep(-uSo.z, uSo.z, d); o=vec4(0.0,0.0,0.0,k*k*uA); }'].join('\n');
  function sh(type, src){ var s=gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ var e=gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('ve3d shader: '+e); } return s; }
  function prog(vs, fs, names){ var p=gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('ve3d link: '+gl.getProgramInfoLog(p));
    var u={p:p}; names.forEach(function(n){ u[n]=gl.getUniformLocation(p, n); }); return u; }

  /* nhiễu lặp 256² (seed cố định): R nhiễu trơn (mép xé) · G, B đạo hàm thớ giấy · A loang */
  function noiseTex(){
    var N=256, a=new Uint8Array(N*N*4), s=0xB0D1;
    function rnd(){ s|=0; s=s+0x6D2B79F5|0; var t=Math.imul(s^s>>>15, 1|s); t=t+Math.imul(t^t>>>7, 61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }
    function lattice(n){ var g=new Float32Array(n*n); for(var i=0;i<n*n;i++) g[i]=rnd(); return g; }
    /* nhiễu giá trị: chỉ số ô + hệ số nội suy theo từng trục tính sẵn (cùng phép tính như từng điểm → cùng kết quả) */
    function layer(g, n){ var i0=new Int32Array(N), i1=new Int32Array(N), t=new Float64Array(N), o=new Float64Array(N*N), x, y;
      for(x=0;x<N;x++){ var f=x*n/N, x0=Math.floor(f), tx=f-x0; t[x]=tx*tx*(3-2*tx); i1[x]=(x0+1)%n; i0[x]=x0%n; }
      for(y=0;y<N;y++){ var r0=i0[y]*n, r1=i1[y]*n, ty=t[y], k=y*N;
        for(x=0;x<N;x++){ var c0=i0[x], c1=i1[x], tx=t[x], a0=g[r0+c0]+(g[r0+c1]-g[r0+c0])*tx, a1=g[r1+c0]+(g[r1+c1]-g[r1+c0])*tx; o[k+x]=a0+(a1-a0)*ty; } }
      return o; }
    var g4=layer(lattice(64), 64), g16=layer(lattice(16), 16), h1=layer(lattice(128), 128), h2=layer(lattice(64), 64), m8=layer(lattice(8), 8), m32=layer(lattice(32), 32), hf=new Float32Array(N*N), x, y, j;
    for(j=0;j<N*N;j++) hf[j]=.65*h1[j]+.35*h2[j];
    for(y=0;y<N;y++) for(x=0;x<N;x++){ j=y*N+x; var i=j*4, xr=(x+1)%N, yd=(y+1)%N;
      a[i]=Math.round(255*clamp(.7*g4[j]+.3*g16[j],0,1));
      a[i+1]=Math.round(255*clamp(.5+(hf[y*N+xr]-hf[j])*1.6,0,1));
      a[i+2]=Math.round(255*clamp(.5+(hf[yd*N+x]-hf[j])*1.6,0,1));
      a[i+3]=Math.round(255*clamp(.6*m8[j]+.4*m32[j],0,1)); }
    var t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
  /* khởi động theo bước: ngữ cảnh · shader giấy · shader bóng · nhiễu · vẽ thử. warm() làm từng bước một lúc luồng bán hàng rảnh (mỗi
     bước một tác vụ, giữa các bước trình duyệt vẫn vẽ khung); setup() (lúc gắn vé) làm nốt phần còn lại ngay */
  var NB=0;
  function setup(){ while(OK===null) boot1(); return OK; }
  function boot1(){
    try{
      if(!NB){
        if(off()){ OK=false; return; }
        cv=document.createElement('canvas'); cv.className='ve3d'; cv.setAttribute('aria-hidden', 'true');
        gl=cv.getContext('webgl2', {alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false});
        if(!gl){ cv=null; OK=false; return; }
        var sw=soft(gl); if(sw && !forced()){ ERR='soft: '+sw; var lx=gl.getExtension('WEBGL_lose_context'); if(lx) lx.loseContext(); gl=null; cv=null; OK=false; return; }
        cv.addEventListener('webglcontextlost', function(e){ e.preventDefault(); LOST=true; if(CUR) CUR.w.classList.remove('gl'); }, false);
        if(document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function(e){ var c=CUR;   /* phông (kể cả bảng CSS đến muộn) nạp xong sau khi dựng */
          if(c && !c.dead && c.fam && [].some.call(e.fontfaces || [], function(f){ return c.fam[fams(f.family)[0]]; })){ c.rb=1; kick(); } });
        cv.addEventListener('webglcontextrestored', function(){ try{ init(); LOST=false; if(CUR && !CUR.dead){ build(CUR); size(CUR); CUR.w.classList.add('gl'); kick(); } }catch(e){ LOST=true; } }, false);
        NB=1; return;
      }
      [initP, initS, initN, warmDraw][NB-1](); NB++;
      if(NB>4) OK=true;
    }catch(e){ ERR=String(e && e.message || e); gl=null; cv=null; OK=false; }
  }
  function warm(){ if(OK!==null) return; boot1(); if(OK===null) setTimeout(warm, 34); }   /* một bước mỗi ~2 khung */
  function init(){ initP(); initS(); initN(); }
  function initP(){
    TXI=TXD=null;   /* ngữ cảnh mới (lần đầu / có lại sau khi mất) → texture cũ không còn */
    PG=prog(VS_P, FS_P, ['uPc','uPy','uSh','uCurl','uBend','uCs','uK','uSt','uTk','uRl','uEye','uCv','uUlId','uW','uH','uZd','uNz','uNh','uOpen','uAlpha','uDpr','uCvH','uGrain','uInk','uId','uNoise','uOp','uUl','uSlot','uLt','uShin','uIref','uLp','uEp','uAtt','uWave','uExp','uKnee']);
    PG.bufs={};
  }
  function initS(){
    SG=prog(VS_S, FS_S, ['uR','uCv','uE0','uE1','uPl','uA']);
    BG=prog(VS_S, FS_B, ['uR','uCv','uQ','uSo','uA']);
    var b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW); SG.q=b;
  }
  function initN(){
    NZ=noiseTex();
    T0=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, T0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  /* vẽ thử 1 điểm ảnh mỗi chương trình: trình điều khiển (Metal) dựng pipeline ngay lúc này, không phải ở khung đầu tiên của vé */
  function warmDraw(){
    if(cv.width!==1){ cv.width=1; cv.height=1; } gl.viewport(0, 0, 1, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T0); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, NZ);
    gl.bindBuffer(gl.ARRAY_BUFFER, SG.q); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(SG.p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(BG.p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(PG.p); gl.uniform1i(PG.uInk, 0); gl.uniform1i(PG.uId, 1); gl.uniform1i(PG.uNoise, 2);
    mesh('w', grid(0, 1, 1, 0, 1, 1)); var b=PG.bufs.w; gl.bindBuffer(gl.ARRAY_BUFFER, b.b); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.e);
    gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.flush();
  }
  /* rời luồng bán hàng: trả bộ nhớ lớn (khung vẽ dpr 3 ≈ 8 MB + texture chữ ≈ 9 MB); giữ ngữ cảnh + shader đã dịch cho lần sau */
  function sleep(){ var c=CUR;
    (function chk(n){ if(CUR!==c) return;
      if(c && c.bc.isConnected && c.bc.offsetParent!==null && n<10){ setTimeout(function(){ chk(n+1); }, 300); return; }   /* trang phiếu còn đang hiện (đang rời) → chờ */
      if(c){ c.dead=1; c.w.classList.remove('gl'); if(c.ci) c.ci.width=c.ci.height=0; if(c.cd) c.cd.width=c.cd.height=0; } CUR=null;
      if(!gl || LOST || !OK) return; if(cv.parentNode) cv.parentNode.removeChild(cv); cv.width=cv.height=1;
      if(TXI) gl.deleteTexture(TXI); if(TXD) gl.deleteTexture(TXD); TXI=TXD=null; })(0); }
  /* lưới một mảnh giấy: nx × ny ô (giấy cong theo chiều dọc, gợn nhẹ theo cả hai chiều) */
  function grid(x0, x1, nx, y0, y1, ny){ var a=[], ix=[], i, j;
    for(j=0;j<=ny;j++) for(i=0;i<=nx;i++) a.push(x0+(x1-x0)*i/nx, y0+(y1-y0)*j/ny);
    for(j=0;j<ny;j++) for(i=0;i<nx;i++){ var k=j*(nx+1)+i; ix.push(k, k+1, k+nx+1, k+1, k+nx+2, k+nx+1); }
    return {d:new Float32Array(a), ix:new Uint16Array(ix)}; }
  function mesh(key, m){ var b=PG.bufs[key]; if(!b){ b=PG.bufs[key]={b:gl.createBuffer(), e:gl.createBuffer()}; }
    gl.bindBuffer(gl.ARRAY_BUFFER, b.b); gl.bufferData(gl.ARRAY_BUFFER, m.d, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.e); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ix, gl.STATIC_DRAW); b.n=m.ix.length; }

  /* ---------- đọc bố cục vé (bản sao không biến đổi) → texture mực + bản đồ dòng ---------- */
  function graphemes(s){
    if(window.Intl && Intl.Segmenter){ var a=[], it=new Intl.Segmenter('vi', {granularity:'grapheme'}).segment(s)[Symbol.iterator](), r; while(!(r=it.next()).done) a.push(r.value.segment); return a; }
    var b=[]; Array.from(s).forEach(function(c){ if(/[̀-ͯ]/.test(c) && b.length) b[b.length-1]+=c; else b.push(c); }); return b; }
  function items(root){ var L=[]; SEL.forEach(function(q){ [].forEach.call(root.querySelectorAll(q), function(e){ L.push({k:'t', e:e}); }); });
    var e; if((e=root.querySelector('.wm'))) L.push({k:'wm', e:e}); if((e=root.querySelector('.hl'))) L.push({k:'hl', e:e}); if((e=root.querySelector('.bc'))) L.push({k:'bc', e:e});
    if((e=root.querySelector('.hp .v b.u'))) L.push({k:'ul', e:e}); return L; }
  function wmPaths(){ if(WMP) return WMP; var s=document.getElementById('b0dy-k') || document.getElementById('b0dy'); WMP=[];
    if(s && window.Path2D) [].forEach.call(s.querySelectorAll('path'), function(p){ WMP.push(new Path2D(p.getAttribute('d'))); }); return WMP; }
  function measure(tk){
    var host=tk.parentNode, cl=tk.cloneNode(true);
    [].forEach.call(cl.querySelectorAll('[style]'), function(e){ e.removeAttribute('style'); });
    cl.removeAttribute('style'); cl.style.cssText='transform:none;visibility:hidden;opacity:1;left:0;top:0;bottom:auto;margin-left:0';
    host.appendChild(cl);
    var base=cl.getBoundingClientRect(), tm=cl.querySelector('.sv-tm'), ts=cl.querySelector('.sv-ts'), rg=document.createRange(), out=[];
    items(cl).forEach(function(it){
      var e=it.e, r=e.getBoundingClientRect(), cs=getComputedStyle(e), o={k:it.k, x:r.left-base.left, y:r.top-base.top, w:r.width, h:r.height, color:cs.color};
      if(it.k==='t'){
        var pr=document.createElement('i'); pr.style.cssText='display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline';
        e.insertBefore(pr, e.firstChild); o.bl=pr.getBoundingClientRect().top-base.top; e.removeChild(pr);
        o.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily; o.ff=cs.fontFamily; o.fw=cs.fontWeight; o.up=cs.textTransform==='uppercase'; o.g=[];
        var tw=document.createTreeWalker(e, NodeFilter.SHOW_TEXT), n;
        while((n=tw.nextNode())){ var k=0; graphemes(n.data).forEach(function(g){ if(/\S/.test(g)){ rg.setStart(n, k); rg.setEnd(n, k+g.length); o.g.push([o.up ? g.toUpperCase() : g, rg.getBoundingClientRect().left-base.left]); } k+=g.length; }); }
      } else if(it.k==='hl') o.color=cs.backgroundColor;
      else if(it.k==='bc'){ var vb=e.viewBox && e.viewBox.baseVal; o.d=e.querySelector('path').getAttribute('d'); o.vw=vb && vb.width || 1; o.vh=vb && vb.height || 1; }
      else if(it.k==='ul'){ o.y=o.y+o.h+1; o.h=1.5; }   /* b.u::after: bottom −2,5 · cao 1,5 */
      out.push(o);
    });
    var M={W:cl.offsetWidth, H:cl.offsetHeight, py:tm.offsetHeight, sh:ts.offsetHeight, items:out, tight:cl.classList.contains('tight')};
    host.removeChild(cl); return M;
  }
  function tex(t, src, nearest, premul){
    if(!t) t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!premul);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    var f=nearest ? gl.NEAREST : gl.LINEAR; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t; }
  /* dựng vé: lúc bấm chỉ đo bố cục + lưới (vài ms); vẽ chữ lên texture chia 3 bước, mỗi khung một bước trong lúc chữ còn ẩn (vé nằm
     trong khe ~110 ms đầu, chữ hiện sau ~0,5 s) — chữ cần hiện mà chưa xong (lùi về phiếu, giảm chuyển động, test) → làm nốt ngay khung đó */
  function build(c){
    var t0=performance.now(), M=measure(c.tk);
    c.M=M; c.ts=Math.min(3, Math.max(2, window.devicePixelRatio||1)); c.ulId=0; M.items.forEach(function(o, i){ if(o.k==='ul') c.ulId=i+1; });
    c.ul=M.items[c.ulId-1] || null;
    c.items=items(c.tk).map(function(it){ var ch=[], e=it.e; while(e && e!==c.tk){ ch.push(e); e=e.parentElement; } return {k:it.k, e:it.e, ch:ch}; });
    var m=V.m, nh=0; for(var hx=17;hx<M.W-12;hx+=9) nh++; c.nh=nh;
    mesh('b', grid(-m, M.W+m, 12, -m, M.py+m, 56)); mesh('s', grid(-m, M.W+m, 12, -m, M.sh+m, 20)); mesh('r', grid(-m, M.W+m, 1, -m, 12.5, 1));
    if(c.ci) c.ci.width=c.ci.height=0; if(c.cd) c.cd.width=c.cd.height=0;
    c.ci=c.cd=c.ink=c.idt=null; c.q=[paint, upInk, upId]; c.sig=''; c.force=1; c.rb=0;
    fontWait(c);
    c.tm=[+(performance.now()-t0).toFixed(1)];
  }
  function paint(c){
    var t=performance.now(), M=c.M, s=c.ts, w=Math.ceil(M.W*s), h=Math.ceil(M.H*s);
    var ci=c.ci=document.createElement('canvas'), cd=c.cd=document.createElement('canvas'); ci.width=w; ci.height=h; cd.width=Math.ceil(w/2); cd.height=Math.ceil(h/2);
    var x=ci.getContext('2d', {willReadFrequently:true}), xd=cd.getContext('2d', {willReadFrequently:true});   /* canvas CPU: nạp texture là chép bộ nhớ, không đọc ngược từ GPU */
    x.setTransform(s,0,0,s,0,0); xd.setTransform(s/2,0,0,s/2,0,0); x.textBaseline='alphabetic';
    M.items.forEach(function(o, i){ var id=i+1, e=o.k==='ul' ? 1 : 3;
      xd.fillStyle='rgb('+(id*8)+',0,0)'; xd.fillRect(o.x-e, o.y-e, o.w+2*e, o.h+2*e);
      x.fillStyle=o.color;
      if(o.k==='t'){ x.font=o.font; o.g.forEach(function(g){ x.fillText(g[0], g[1], o.bl); }); }
      else if(o.k==='hl' || o.k==='ul') x.fillRect(o.x, o.y, o.w, o.h);
      else if(o.k==='wm'){ x.save(); x.translate(o.x, o.y); x.scale(o.w/132, o.h/43); wmPaths().forEach(function(p){ x.fill(p, 'evenodd'); }); x.restore(); }
      else if(o.k==='bc' && window.Path2D){ x.save(); x.translate(o.x, o.y); x.scale(o.w/o.vw, o.h/o.vh); x.fill(new Path2D(o.d)); x.restore(); }
    });
    c.tm.push(+(performance.now()-t).toFixed(1));
  }
  /* một cặp texture dùng lại cho mọi lần vào phiếu (không rò bộ nhớ GPU); canvas trả bộ nhớ ngay sau khi nạp (WebKit) */
  function upInk(c){ var t=performance.now(); TXI=tex(TXI, c.ci, false, true); c.ci.width=c.ci.height=0; c.ci=null; c.tm.push(+(performance.now()-t).toFixed(1)); }
  function upId(c){ var t=performance.now(); TXD=tex(TXD, c.cd, true, false); c.cd.width=c.cd.height=0; c.cd=null; c.ink=TXI; c.idt=TXD; c.tm.push(+(performance.now()-t).toFixed(1)); }
  /* phông: chỉ soi các FontFace đúng họ + độ đậm + dải ký tự dùng trên vé (rẻ). Không dùng fonts.check(): nó dò cả phông hệ thống trong
     danh sách (-apple-system, Menlo…) theo từng ký tự → 30–40 ms mỗi lần, quá đắt ngay lúc bấm. Phông về sau → dựng lại ở khung kế */
  function fams(f){ return String(f||'').split(',').map(function(x){ return x.trim().replace(/^["']|["']$/g, '').toLowerCase(); }); }
  function wIn(fw, ws){ var a=String(fw||'').replace(/normal/g, '400').replace(/bold/g, '700').split(/\s+/).map(Number); if(isNaN(a[0])) return true; var lo=a[0], hi=a.length>1 && !isNaN(a[1]) ? a[1] : a[0];
    return ws.some(function(w){ return w>=lo && w<=hi; }); }
  function uHit(ur, cps){ var R=[], re=/U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/gi, m; while((m=re.exec(ur||''))) R.push([parseInt(m[1].replace(/\?/g, '0'), 16), m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16)]);
    return !R.length || cps.some(function(k){ return R.some(function(r){ return k>=r[0] && k<=r[1]; }); }); }
  function fontWait(c){
    var F=document.fonts, fam={}, ws={}, cp={}, wait=[];
    c.M.items.forEach(function(o){ if(o.k!=='t') return; fams(o.ff).forEach(function(f){ fam[f]=1; }); ws[+o.fw||400]=1;
      o.g.forEach(function(g){ var t=g[0]; for(var i=0;i<t.length;i++){ var k=t.codePointAt(i); if(k>0xffff) i++; cp[k]=1; } }); });
    c.fam=fam; if(!F || !F.forEach || c.fw) return;
    var cps=Object.keys(cp).map(Number), wl=Object.keys(ws).map(Number);
    F.forEach(function(ff){ if(ff.status==='loaded' || ff.status==='error' || !fam[fams(ff.family)[0]] || !wIn(ff.weight, wl) || !uHit(ff.unicodeRange, cps)) return;
      wait.push(ff.status==='unloaded' ? ff.load() : ff.loaded); });
    if(!wait.length) return;
    c.fw=1; Promise.all(wait.map(function(p){ return p.catch(function(){}); })).then(function(){ if(CUR===c && !c.dead){ c.rb=1; kick(); } });
  }

  /* ---------- gắn vào trang Đề xuất ---------- */
  function attach(pg, o){
    var w=pg && pg.querySelector('.sv-billw'), bc=w && w.querySelector('.sv-bc'), tk=bc && bc.querySelector('.sv-tk');
    if(!tk || !setup() || LOST) return false;
    if(CUR && CUR.w!==w) CUR.w.classList.remove('gl');   /* trang Đề xuất cũ còn đang chìm: trả về vé DOM */
    var c={pg:pg, w:w, bc:bc, tk:tk, tsEl:tk.querySelector('.sv-ts'), tm:tk.querySelector('.sv-tm'), roll:w.querySelector('.sv-roll'), shade:w.querySelector('.sv-shade'), plate:w.querySelector('.sv-slot'),
      a1:(o && o.a1 || 1.6)*Math.PI/180, a2:(o && o.a2 || 2.6)*Math.PI/180, idle:0, dead:0};
    try{ build(c); }catch(e){ return false; }
    bc.appendChild(cv); CUR=c; size(c); w.classList.add('gl'); kick(); return true;
  }
  function size(c){ var d=Math.min(3, window.devicePixelRatio||1), cw=c.bc.clientWidth, ch=c.bc.clientHeight; c.cw=cw; c.ch=ch; c.dpr=d;
    cv.style.width=cw+'px'; cv.style.height=ch+'px'; var W=Math.round(cw*d), H=Math.round(ch*d); if(cv.width!==W) cv.width=W; if(cv.height!==H) cv.height=H; c.force=1; }
  function refit(pg){ var c=CUR; if(!c || c.pg!==pg || c.dead || !gl || LOST) return; try{ build(c); size(c); }catch(e){} kick(); }
  function kick(){ if(CUR) CUR.idle=0; if(typeof motWake==='function') motWake(); }
  function running(el){ try{ return el.getAnimations({subtree:true}).some(function(a){ return a.playState==='running' || a.pending; }); }catch(e){ return false; } }
  function busy(){ var c=CUR; return !!(c && !c.dead && gl && !LOST && (c.idle<2 || c.q.length>0 || c.rb || running(c.w))); }

  /* ---------- mô hình DOM → dáng ---------- */
  function mat(el){ var t=el ? getComputedStyle(el).transform : 'none', m; if(!t || t==='none') return [1,0,0,1,0,0];
    if((m=/matrix\(([^)]+)\)/.exec(t))) return m[1].split(',').map(Number);
    if((m=/matrix3d\(([^)]+)\)/.exec(t))){ var v=m[1].split(',').map(Number); return [v[0],v[1],v[4],v[5],v[12],v[13]]; } return [1,0,0,1,0,0]; }
  function org(el){ var o=getComputedStyle(el).transformOrigin.split(' '); return [parseFloat(o[0])||0, parseFloat(o[1])||0]; }
  /* canvas = A·p + (L + O − A·O + t) — ma trận 3×3 theo cột cho shader */
  function aff(m, O, L){ return [m[0], m[1], 0, m[2], m[3], 0, L[0]+O[0]-(m[0]*O[0]+m[2]*O[1])+m[4], L[1]+O[1]-(m[1]*O[0]+m[3]*O[1])+m[5], 1]; }
  function ap(A, x, y){ return [A[0]*x+A[3]*y+A[6], A[1]*x+A[4]*y+A[7]]; }
  function op(it){ var a=1; for(var i=0;i<it.ch.length;i++){ var cs=getComputedStyle(it.ch[i]); a*=+cs.opacity; if(i===0 && cs.visibility!=='visible') a=0; } return a; }
  function pose(c){
    var M=c.M, tk=c.tk, mt=mat(tk), ms=mat(c.tsEl), K=Math.hypot(mt[0], mt[1]) || 1;
    var r1=Math.atan2(mt[1], mt[0]), r2=Math.atan2(ms[1], ms[0]), p1=clamp(-r1/c.a1, 0, 1), p2=clamp(-r2/c.a2, 0, 1);
    var e1=1-Math.pow(1-p1, 2), e2=sm(p2), f1=e1*(1+V.fx*Math.sin(Math.PI*p1)), f2=e2*(1+V.fb*Math.sin(Math.PI*p2)), out=Math.abs(r1)<1e-4 ? clamp(1-mt[5]/Math.max(1, K*(M.H-5)), 0, 1) : 1;
    var Tk=aff(mt, org(tk), [tk.offsetLeft, tk.offsetTop]), so=org(c.tsEl), pv=[c.tsEl.offsetLeft+so[0], c.tsEl.offsetTop+so[1]];
    var St=[ms[0], ms[1], 0, ms[2], ms[3], 0, pv[0]-(ms[0]*pv[0]+ms[2]*pv[1]), pv[1]-(ms[1]*pv[0]+ms[3]*pv[1]), 1];
    var rc=c.roll && getComputedStyle(c.roll), Rl=rc ? aff(mat(c.roll), org(c.roll), [parseFloat(rc.left)+parseFloat(rc.marginLeft), c.bc.clientHeight-parseFloat(rc.bottom)-parseFloat(rc.height)]) : [1,0,0,0,1,0,0,0,1];
    var P={K:K, p1:p1, p2:p2, out:out, curl:V.curl*Math.max(f1, V.curlP*out*out), bend:V.bend*f2, cs:V.cs*f2, wave:V.wave*(.3+.7*e1), open:clamp(p2*4, 0, 1), Tk:Tk, St:St, Rl:Rl,
      ra:c.roll ? +getComputedStyle(c.roll).opacity : 0, sa:c.shade ? +getComputedStyle(c.shade).opacity : 0, pa:c.plate ? +getComputedStyle(c.plate).opacity : 0, ops:[], ulp:1};
    c.items.forEach(function(it){ P.ops.push(op(it)); });
    if(c.ul){ var u=c.items[c.ulId-1].e, t=getComputedStyle(u, '::after').transform, m=t && /matrix\(([^)]+)\)/.exec(t); P.ulp=m ? clamp(+m[1].split(',')[0], 0, 1) : 1; }
    /* mép trên mặt máy + khe (toạ độ canvas) */
    var pl=c.plate, bcT=c.bc.offsetTop, pt=pl ? pl.offsetTop-bcT : c.ch-22, pb=pl ? getComputedStyle(pl, '::before') : null;
    var sT=pl ? pt+pl.offsetHeight-(parseFloat(pb.bottom)||22)-(parseFloat(pb.height)||8) : c.ch-8;
    P.plate=[pt, sT, pl ? pl.offsetLeft-c.bc.offsetLeft : 0, pl ? pl.offsetLeft-c.bc.offsetLeft+pl.offsetWidth : c.cw]; P.slot=[sT, c.ch];
    /* mép đáy vé (đỉnh răng cuống trái / phải) sau mọi biến đổi + phối cảnh → bóng đổ */
    var eye=[c.cw/2, c.ch*V.eyeY, V.eye];
    function stubPt(u){ var s=M.sh, cb=Math.cos(P.bend), sb=Math.sin(P.bend), X=u, Y=M.py+s*cb, Z=-s*sb-P.cs, q=ap(St, X, Y); q=ap(Tk, q[0], q[1]); Z*=K;
      var k=eye[2]/(eye[2]-Z); return [eye[0]+(q[0]-eye[0])*k, eye[1]+(q[1]-eye[1])*k]; }
    P.E0=stubPt(0); P.E1=stubPt(M.W); P.eye=eye;
    function proj(X, Y, Z){ var q=ap(Tk, X, Y), z=Z*K, k=eye[2]/(eye[2]-z); return [eye[0]+(q[0]-eye[0])*k, eye[1]+(q[1]-eye[1])*k]; }
    function stubAt(u, s){ var cb=Math.cos(P.bend), sb=Math.sin(P.bend), q=ap(St, u, M.py+s*cb); return proj(q[0], q[1], -s*sb-P.cs*Math.pow(s/M.sh, 2)); }
    P.Q=[proj(0, 0, -P.curl), proj(M.W, 0, -P.curl), proj(M.W, M.py, 0), proj(0, M.py, 0), stubAt(0, 0), stubAt(M.W, 0), stubAt(M.W, M.sh), stubAt(0, M.sh)];
    var lp=[c.cw*V.lp[0], c.ch*V.lp[1], V.lp[2]], cc=ap(Tk, M.W/2, M.H*.45), dv=[lp[0]-cc[0], lp[1]-cc[1], lp[2]], dl=Math.hypot(dv[0], dv[1], dv[2]);
    P.lp=lp; P.ad=dl; P.iref=V.ka+V.kd*Math.max(dv[2]/dl, 0)+V.kh*.5;
    return P;
  }
  function sig(P){ return [P.Tk.join(','), P.St[0].toFixed(5), P.St[1].toFixed(5), P.Rl.join(','), P.ra.toFixed(3), P.sa.toFixed(3), P.pa.toFixed(3), P.ops.map(function(x){ return x.toFixed(3); }).join(''), P.ulp.toFixed(3)].join('|'); }

  /* ---------- vẽ một khung ---------- */
  function frame(force){ try{ frame0(force); }catch(e){ ERR=String(e && e.message || e); var c=CUR; if(c){ c.dead=1; c.w.classList.remove('gl'); } OK=false; LOST=true; } }
  function frame0(force){
    var c=CUR; if(!c || c.dead || !gl || LOST) return;
    if(!c.bc.isConnected || c.bc.offsetParent===null){ c.dead=1; return; }
    if(c.rb) build(c);   /* phông vừa về → đo + vẽ chữ lại */
    if(c.bc.clientWidth!==c.cw || c.bc.clientHeight!==c.ch) size(c);
    var P=pose(c);
    if(c.q.length){ var now=force || P.ops.some(function(x){ return x>.001; }); do c.q.shift()(c); while(now && c.q.length); if(!c.q.length) c.force=1; }
    var S=sig(P);
    if(S===c.sig && !c.force && !force){ c.idle++; return; }
    c.sig=S; c.force=0; c.idle=0; c.P=P; FR++;
    draw(c, P);
  }
  function draw(c, P){
    var M=c.M, d=c.dpr;
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    /* 1 · bóng đổ lên mặt máy */
    if(P.pa>0.01){ gl.useProgram(SG.p); gl.bindBuffer(gl.ARRAY_BUFFER, SG.q); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(SG.uR, P.plate[2], P.plate[0]-6, P.plate[3]-P.plate[2], P.plate[1]-P.plate[0]+8); gl.uniform2f(SG.uCv, c.cw, c.ch);
      gl.uniform2f(SG.uE0, P.E0[0], P.E0[1]); gl.uniform2f(SG.uE1, P.E1[0], P.E1[1]); gl.uniform4f(SG.uPl, P.plate[0], P.plate[1], P.plate[2], P.plate[3]); gl.uniform1f(SG.uA, P.pa);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    /* 1b · bóng vé xuống nền (độ cao theo dáng: lúc in còn sát, xé ra thì nhấc lên) */
    var el=.15+.85*Math.max(P.p1, 0); gl.useProgram(BG.p); gl.bindBuffer(gl.ARRAY_BUFFER, SG.q); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var bx=[1e9,1e9,-1e9,-1e9]; P.Q.forEach(function(q){ bx[0]=Math.min(bx[0], q[0]); bx[1]=Math.min(bx[1], q[1]); bx[2]=Math.max(bx[2], q[0]); bx[3]=Math.max(bx[3], q[1]); });
    var pad=30; gl.uniform4f(BG.uR, bx[0]-pad+3, bx[1]-pad+5, bx[2]-bx[0]+2*pad+10, bx[3]-bx[1]+2*pad+16); gl.uniform2f(BG.uCv, c.cw, c.ch); gl.uniform2fv(BG.uQ, new Float32Array([].concat.apply([], P.Q)));
    gl.uniform3f(BG.uSo, 3+6*el, 5+11*el, 6+12*el); gl.uniform1f(BG.uA, .5); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    /* 2 · giấy: mẩu giấy trong khe · thân · cuống */
    var u=PG; gl.useProgram(u.p);
    var rdy=!c.q.length && c.ink && c.idt;   /* chữ chưa nạp xong → texture rỗng (không lộ chữ của vé trước) */
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rdy ? c.ink : T0); gl.uniform1i(u.uInk, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rdy ? c.idt : T0); gl.uniform1i(u.uId, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, NZ); gl.uniform1i(u.uNoise, 2);
    var ops=new Float32Array(32); ops[0]=1; P.ops.forEach(function(x, i){ if(i+1<32) ops[i+1]=x; }); gl.uniform1fv(u.uOp, ops);
    gl.uniform1i(u.uUlId, c.ulId); gl.uniform4f(u.uUl, c.ul ? c.ul.x : 0, 0, c.ul ? c.ul.w : 0, P.ulp);
    gl.uniform1f(u.uPy, M.py); gl.uniform1f(u.uSh, M.sh); gl.uniform1f(u.uW, M.W); gl.uniform1f(u.uH, M.H); gl.uniform1f(u.uZd, 5); gl.uniform1f(u.uNz, 35); gl.uniform1f(u.uNh, c.nh);
    gl.uniform1f(u.uCurl, P.curl); gl.uniform1f(u.uBend, P.bend); gl.uniform1f(u.uCs, P.cs); gl.uniform1f(u.uK, P.K); gl.uniform1f(u.uOpen, P.open);
    gl.uniformMatrix3fv(u.uSt, false, P.St); gl.uniformMatrix3fv(u.uTk, false, P.Tk); gl.uniformMatrix3fv(u.uRl, false, P.Rl);
    gl.uniform3f(u.uEye, P.eye[0], P.eye[1], P.eye[2]); gl.uniform2f(u.uCv, c.cw, c.ch); gl.uniform1f(u.uDpr, d); gl.uniform1f(u.uCvH, cv.height/d);
    gl.uniform4f(u.uSlot, P.slot[0], P.slot[1], P.sa, 0); gl.uniform4f(u.uLt, V.ka, V.kd, V.kh, V.ks); gl.uniform1f(u.uShin, V.sh); gl.uniform1f(u.uGrain, V.grain);
    gl.uniform3f(u.uLp, P.lp[0], P.lp[1], P.lp[2]); gl.uniform3f(u.uEp, P.eye[0], P.eye[1], P.eye[2]); gl.uniform2f(u.uAtt, P.ad, V.att); gl.uniform1f(u.uIref, P.iref); gl.uniform1f(u.uWave, P.wave); gl.uniform1f(u.uExp, V.exp); gl.uniform1f(u.uKnee, V.knee);
    [['r', 2, P.ra], ['b', 0, 1], ['s', 1, 1]].forEach(function(x){ if(x[2]<=0.004) return; var b=u.bufs[x[0]];
      gl.bindBuffer(gl.ARRAY_BUFFER, b.b); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.e);
      gl.uniform1i(u.uPc, x[1]); gl.uniform1f(u.uAlpha, x[2]); gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, 0); });
  }

  /* ---------- chẩn đoán / test ---------- */
  function dbg(){ var c=CUR, P=c && c.P; return {ok:OK, err:ERR, gl:!!gl, lost:LOST, on:!!(c && !c.dead), cls:!!(c && c.w.classList.contains('gl')), frames:FR, idle:c ? c.idle : -1, busy:busy(),
    p1:P ? P.p1 : null, p2:P ? P.p2 : null, out:P ? P.out : null, curl:P ? P.curl : null, bend:P ? P.bend : null, open:P ? P.open : null, K:P ? P.K : null, E0:P ? P.E0 : null, E1:P ? P.E1 : null,
    ops:P ? P.ops.slice() : null, ulp:P ? P.ulp : null, ra:P ? P.ra : null, sa:P ? P.sa : null, pa:P ? P.pa : null, Rl:P ? P.Rl : null, plate:P ? P.plate : null, slot:P ? P.slot : null, M:c && c.M ? {W:c.M.W, H:c.M.H, py:c.M.py, sh:c.M.sh, n:c.M.items.length, tight:c.M.tight} : null, cw:c ? c.cw : 0, ch:c ? c.ch : 0, ts:c ? c.ts : 0, tm:c ? c.tm : null, q:c && c.q ? c.q.length : -1, V:V}; }
  /* đọc điểm ảnh (toạ độ CSS trong canvas) ngay sau một lượt vẽ */
  function px(pts){ var c=CUR; if(!c || !gl || LOST) return null; frame(true); var d=c.dpr, b=new Uint8Array(4);
    return pts.map(function(p){ gl.readPixels(Math.round(p[0]*d), Math.round(cv.height-p[1]*d-1), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2], b[3]]; }); }
  /* đọc một vùng (toạ độ CSS trong canvas) → thống kê điểm ảnh: số điểm tối (< 90), sáng (> 200), trong suốt; hộp bao điểm tối; điểm tối lẻ
     loi giữa vùng sáng (đường nối lưới / lỗi chia cho 0 lộ nền) */
  function rd(x, y, w, h, th){ var c=CUR; th=th||90; if(!c || !gl || LOST) return null; frame(true); var d=c.dpr, X=Math.round(x*d), Y=Math.round(cv.height-(y+h)*d), W=Math.max(1, Math.round(w*d)), Hh=Math.max(1, Math.round(h*d)), b=new Uint8Array(W*Hh*4);
    gl.readPixels(X, Y, W, Hh, gl.RGBA, gl.UNSIGNED_BYTE, b);
    var o={n:W*Hh, dark:0, light:0, clear:0, lone:0, box:null, sum:0}, L=function(i, j){ return b[((Hh-1-j)*W+i)*4]; };
    for(var j=0;j<Hh;j++) for(var i=0;i<W;i++){ var k=((Hh-1-j)*W+i)*4, v=b[k], a=b[k+3]; o.sum+=v; if(a<8){ o.clear++; continue; }
      if(v<th){ o.dark++; var px=x+i/d, py=y+j/d; if(!o.box) o.box=[px, py, px, py]; else { o.box[0]=Math.min(o.box[0], px); o.box[1]=Math.min(o.box[1], py); o.box[2]=Math.max(o.box[2], px); o.box[3]=Math.max(o.box[3], py); } }
      else if(v>200) o.light++;
      if(i>1 && j>1 && i<W-2 && j<Hh-2 && v<200 && L(i-2, j)>225 && L(i+2, j)>225 && L(i, j-2)>225 && L(i, j+2)>225) o.lone++; }
    o.mean=o.sum/o.n; delete o.sum; return o; }
  /* chụp cả canvas (PNG data URL) — để soi bằng mắt */
  function snap(){ var c=CUR; if(!c || !gl || LOST) return null; frame(true); return cv.toDataURL('image/png'); }

  return {attach:attach, refit:refit, kick:kick, busy:busy, warm:warm, sleep:sleep, frame:function(){ frame(false); }, _dbg:dbg, _px:px, _rd:rd, _snap:snap, _V:V};
})();

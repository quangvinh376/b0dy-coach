/* v2.15.1 — lên domain chính checkin.b0dy.studio: font woff2 + preload, service worker font cache-first, dọn dữ liệu kiosk cũ.
   Chạy: NODE_PATH=/opt/node22/lib/node_modules node test/domain_fonts.js
   F1 máy mới: font chỉ 1 request woff2 (200), không còn .woff/.otf/.ttf, không 404 cùng origin
   F2 woff2 vẽ y hệt ttf (so điểm ảnh chữ Việt + số + dấu)
   F3 dọn b0dy_apin / b0dy_ip / b0dy_members, giữ lb_*
   F4 service worker: cài sẵn woff2; mở lại → font lấy từ cache (máy chủ không nhận thêm request); 404 không bị cất
   F5 0 pageerror. Không gọi mạng thật (font ngoài + máy chủ đều giả). */
var { chromium } = require('playwright'); var http = require('http'); var fs = require('fs'); var path = require('path');
var CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..')), PORT = +process.env.PORT || 19521;
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
var HITS = {};
function serve() {
  return new Promise(function (res) {
    var s = http.createServer(function (req, r) {
      var u = req.url.split('?')[0]; if (u === '/') u = '/index.html';
      HITS[u] = (HITS[u] || 0) + 1;
      if (u === '/ft-t.html' || u === '/ft-w.html') { r.writeHead(200, { 'Content-Type': TYPES['.html'] }); r.end(FONTTEST[u.charAt(4)]); return; }
      var f = path.join(ROOT, u);
      fs.readFile(f, function (e, d) { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(d); });
    });
    s.listen(PORT, function () { res(s); });
  });
}
var SAMPLE = 'Nguyễn Quang Vinh — Đã tập 12/24 · Hoa hồng 1.250.000 · Thiết lập set · Nghỉ xong · kế tiếp · ĐỘ KHÓ 68,0 kg × 8 → Tổng';
/* hai trang cùng bố cục, chỉ khác file font (đặt cùng vị trí: vị trí dọc khác nhau làm vị trí điểm ảnh lẻ khác nhau → so sai) */
function fontPage(file, fmt) {
  return '<!doctype html><meta charset="utf-8"><style>' +
    "@font-face{font-family:X;src:url('fonts/" + file + "') format('" + fmt + "');font-weight:500}" +
    'body{margin:0;background:#0A0A0A;color:#FAFAFA}#d{font-family:X;font-weight:500;font-size:22px;line-height:30px;padding:8px 12px;width:900px;letter-spacing:-.16px}' +
    '</style><div id="d">' + SAMPLE + '<br>' + SAMPLE.toUpperCase() + '</div>';
}
var FONTTEST = { t: fontPage('SVN-Switzer-Medium.ttf', 'truetype'), w: fontPage('SVN-Switzer-Medium.woff2', 'woff2') };

var pass = 0, fail = 0, PAGEERR = [];
function check(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }
async function ctxNew(browser) {
  var ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.route(/fontshare|fonts\.googleapis|fonts\.gstatic/, function (r) { return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
  await ctx.route(/api\.ipify\.org/, function (r) { return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ip":"203.0.113.5"}' }); });
  await ctx.route(/workers\.dev|script\.google\.com/, function (r) { return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true,"pong":1}' }); });
  return ctx;
}

(async function () {
  var srv = await serve(), browser = await chromium.launch({ executablePath: CHROME }), URL = 'http://localhost:' + PORT + '/';
  var ctx, pg, r;

  console.log('== F1 máy mới: chỉ 1 request font woff2, không 404 ==');
  ctx = await ctxNew(browser); pg = await ctx.newPage(); pg.on('pageerror', function (e) { PAGEERR.push(String(e)); });
  var bad = []; pg.on('response', function (x) { var u = new (require('url').URL)(x.url()); if (u.host === 'localhost:' + PORT && x.status() >= 400) bad.push(u.pathname + ' ' + x.status()); });
  HITS = {};
  await pg.goto(URL, { waitUntil: 'load' }); await pg.waitForTimeout(800);
  var fontHits = Object.keys(HITS).filter(function (k) { return /^\/fonts\//.test(k); }).map(function (k) { return k + '×' + HITS[k]; });
  check('font: đúng 1 request /fonts/SVN-Switzer-Medium.woff2 (preload + @font-face dùng chung)', fontHits.join() === '/fonts/SVN-Switzer-Medium.woff2×1', fontHits);
  check('không request cùng origin nào lỗi (trước đây 2 × 404 .woff/.woff2)', bad.length === 0, bad);
  r = await pg.evaluate(async function () { await document.fonts.ready; return { ok: document.fonts.check('500 16px "SVN-Switzer"'), st: Array.from(document.fonts).filter(function (f) { return f.family.replace(/"/g, '') === 'SVN-Switzer'; }).map(function (f) { return f.status; }) }; });
  check('font SVN-Switzer đã nạp (status loaded)', r.ok && r.st.indexOf('loaded') >= 0, r);
  check('preload có crossorigin + type woff2 (khớp request của @font-face, không tải 2 lần)', await pg.evaluate(function () { var l = document.querySelector('link[rel=preload][as=font]'); return !!l && l.getAttribute('href') === 'fonts/SVN-Switzer-Medium.woff2' && l.hasAttribute('crossorigin') && l.type === 'font/woff2'; }));
  check('APP_VER v2.15.1', await pg.evaluate(function () { return typeof APP_VER !== 'undefined' && APP_VER === 'v2.15.1'; }));
  await ctx.close();

  console.log('== F2 woff2 vẽ y hệt ttf ==');
  ctx = await browser.newContext({ viewport: { width: 960, height: 120 }, deviceScaleFactor: 2 }); pg = await ctx.newPage();
  var shots = {}, loaded = {};
  for (var n of ['t', 'w']) {
    await pg.goto(URL + 'ft-' + n + '.html', { waitUntil: 'load' });
    await pg.evaluate(async function () { await document.fonts.load('500 22px X'); await document.fonts.ready; });
    loaded[n] = await pg.evaluate(function () { return document.fonts.check('500 22px X') && Array.from(document.fonts).some(function (f) { return f.family === 'X' && f.status === 'loaded'; }); });
    shots[n] = await pg.screenshot();
  }
  check('cả hai font đều nạp thật (không so hai font dự phòng)', loaded.t && loaded.w, loaded);
  check('ảnh chữ ttf == woff2 (cùng vị trí, dpr 2, từng byte PNG)', Buffer.compare(shots.t, shots.w) === 0, { ttf: shots.t.length, woff2: shots.w.length });
  await ctx.close();

  console.log('== F3 dọn dữ liệu kiosk cũ, giữ dữ liệu app coach ==');
  ctx = await ctxNew(browser); pg = await ctx.newPage(); pg.on('pageerror', function (e) { PAGEERR.push(String(e)); });
  await pg.goto(URL + 'manifest.webmanifest');
  await pg.evaluate(function () { localStorage.setItem('b0dy_apin', '0000'); localStorage.setItem('b0dy_ip', '203.0.113.5'); localStorage.setItem('b0dy_members', '[]'); localStorage.setItem('lb_ip', '203.0.113.5'); localStorage.setItem('lb_outbox', '[]'); });
  await pg.goto(URL, { waitUntil: 'load' }); await pg.waitForTimeout(300);
  r = await pg.evaluate(function () { return { apin: localStorage.getItem('b0dy_apin'), ip: localStorage.getItem('b0dy_ip'), mem: localStorage.getItem('b0dy_members'), lbip: localStorage.getItem('lb_ip'), ob: localStorage.getItem('lb_outbox') }; });
  check('b0dy_apin / b0dy_ip / b0dy_members bị xoá', r.apin === null && r.ip === null && r.mem === null, r);
  check('lb_ip / lb_outbox giữ nguyên', r.lbip === '203.0.113.5' && r.ob === '[]', r);
  await ctx.close();

  console.log('== F4 service worker ==');
  ctx = await ctxNew(browser); pg = await ctx.newPage(); pg.on('pageerror', function (e) { PAGEERR.push(String(e)); });
  await pg.goto(URL, { waitUntil: 'load' });
  r = await pg.evaluate(async function () {
    var reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
    var ks = await caches.keys(), c = await caches.open(ks[0]), keys = (await c.keys()).map(function (q) { return new URL(q.url).pathname; });
    return { ks: ks, woff2: keys.indexOf('/fonts/SVN-Switzer-Medium.woff2') >= 0, n: keys.length };
  });
  check('cache b0dy-coach-v2.15.1 có sẵn woff2 sau khi cài', r.ks.join() === 'b0dy-coach-v2.15.1' && r.woff2, r);
  await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(300);
  check('trang đã do service worker điều khiển', await pg.evaluate(function () { return !!navigator.serviceWorker.controller; }));
  var before = HITS['/fonts/SVN-Switzer-Medium.woff2'] || 0, beforeCss = HITS['/app.css'] || 0;
  await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(500);
  check('mở lại: font lấy từ cache, máy chủ không nhận request font mới', (HITS['/fonts/SVN-Switzer-Medium.woff2'] || 0) === before, { before: before, after: HITS['/fonts/SVN-Switzer-Medium.woff2'] });
  check('mở lại: app.css vẫn network-first (máy chủ nhận request)', (HITS['/app.css'] || 0) > beforeCss, { before: beforeCss, after: HITS['/app.css'] });
  r = await pg.evaluate(async function () { var x = await fetch('fonts/khong-co.woff2'); var m = await caches.match('fonts/khong-co.woff2'); return { st: x.status, cached: !!m }; });
  check('font 404 không bị cất vào cache', r.st === 404 && !r.cached, r);
  r = await pg.evaluate(async function () { return await document.fonts.check('500 16px "SVN-Switzer"'); });
  check('font vẫn hiện khi lấy từ cache', r);
  await ctx.close();

  await browser.close(); srv.close();
  check('0 pageerror', PAGEERR.length === 0, PAGEERR);
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });

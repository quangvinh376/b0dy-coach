/* B0DY Coach — service worker: mở được app khi mất mạng.
   index.html: network-first (bản mới lên là dùng ngay), rớt mạng → bản đã cache.
   Font/asset tĩnh: cache-first. Không đụng tới API (script.google.com). */
var VER='b0dy-coach-v1.5';
var SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',function(e){ e.waitUntil(caches.open(VER).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate',function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){return k!==VER}).map(function(k){return caches.delete(k)})); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener('fetch',function(e){
  var u=new URL(e.request.url);
  if(e.request.method!=='GET') return;
  if(/script\.google\.com|googleusercontent|ipify/.test(u.host)) return;          /* API: không cache */
  if(u.origin===location.origin && u.search){ e.respondWith(fetch(e.request)); return; } /* ?u= kiểm tra bản mới: không cache */
  if(u.origin===location.origin){                                                   /* shell: network-first */
    e.respondWith(fetch(e.request).then(function(r){ var cp=r.clone(); caches.open(VER).then(function(c){ c.put(e.request,cp); }); return r; })
      .catch(function(){ return caches.match(e.request).then(function(r){ return r||caches.match('./index.html'); }); }));
    return;
  }
  if(/fonts\.gstatic|fonts\.googleapis|fontshare|cdn\.fontshare/.test(u.host)){    /* font: cache-first */
    e.respondWith(caches.match(e.request).then(function(r){ return r||fetch(e.request).then(function(x){ var cp=x.clone(); caches.open(VER).then(function(c){ c.put(e.request,cp); }); return x; }); }));
  }
});

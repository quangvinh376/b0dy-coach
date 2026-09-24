/* máy chủ tĩnh nhỏ cho test (không cache) */
var http=require('http'), fs=require('fs'), path=require('path');
var root=path.resolve(__dirname,'..'), types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
module.exports=function(port){ return new Promise(function(res){ var srv=http.createServer(function(req,r){ var u=req.url.split('?')[0]; if(u==='/') u='/index.html'; var f=path.join(root,u); fs.readFile(f,function(e,d){ if(e){ r.writeHead(404); r.end(); return; } r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); r.end(d); }); }); srv.listen(port,function(){ res(srv); }); }); };

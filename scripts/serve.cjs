const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const port=Number(process.env.QA_PORT||4173);
http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'||pathname==='/index.html'||pathname==='/demo.html'){
  let html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
  html=html.replace(/<script src="vendor\/firebase-[^"]+"[^>]*><\/script>/g,'');
  // (v5.5) 합성 미리보기는 fixture를 인라인으로 주입하므로 배포용 CSP(해시 고정)를 뗀다 — 운영 HTML과 구분
  html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');
  html=html.replace('<script>',()=>'<script>'+fs.readFileSync(path.join(root,'tests/fixture.js'),'utf8')+'</script>\n<script>');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
 }
 if(!['/favicon.ico','/apple-touch-icon.png'].includes(pathname)){res.writeHead(404);res.end();return;}
 res.end(fs.readFileSync(path.join(root,'dist',pathname.slice(1))));
}).listen(port,'127.0.0.1',()=>console.log('Synthetic preview http://127.0.0.1:'+port));

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),out=path.join(root,'dist');
let html=fs.readFileSync(path.join(root,'src/index.html'),'utf8').replace(/\r\n?/g,'\n');
for(const [key,file] of [['STYLE','styles.css'],['DOMAIN','domain.js'],['INVESTMENT','investment.js'],['APP','app.js'],['INVESTMENT_UI','investment-ui.js'],['UX','ux.js']]){
 // (v5.5) 줄바꿈을 LF로 고정 — HTML 파서는 CRLF를 LF로 바꾸므로, 원본 바이트로 CSP 해시를 내면 CRLF 체크아웃에서 전부 차단된다
 const source=fs.readFileSync(path.join(root,'src',file),'utf8').replace(/\r\n?/g,'\n');
 if(file.endsWith('.js'))new vm.Script(source,{filename:file});
 /* (v5.5) 인라인 스크립트 안의 '</script'는 HTML 파서가 스크립트를 거기서 끝낸다 — 빌드를 멈춘다. */
 if(file.endsWith('.js')&&/<\/script/i.test(source))throw Error(file+': 인라인 스크립트에 </script 문자열이 있습니다');
 html=html.replace('/* BUILD:'+key+' */',()=>source);
}
/* (v5.5) 벤더 스크립트 SRI — 배포하는 바로 그 파일의 sha384 */
const VENDOR='vendor/firebase-10.14.1';
const vsrc=path.join(root,'assets',VENDOR);
html=html.replace(/integrity="BUILD:SRI:([^"]+)"/g,(_,f)=>{
 const b=fs.readFileSync(path.join(vsrc,f));
 return 'integrity="sha384-'+crypto.createHash('sha384').update(b).digest('base64')+'"';
});
if(/BUILD:SRI/.test(html))throw Error('SRI placeholder left');
/* (v5.5) CSP — 인라인 스크립트는 **해시로만** 허용한다(unsafe-inline 없음). 워커 주소는 사용자 설정값이라
 * connect-src는 제한하지 않는다. apis.google.com은 Firebase Auth 팝업이 싣는 gapi 스크립트. */
const hashes=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1],'utf8').digest('base64')+"'");
const csp="script-src 'self' "+hashes.join(' ')+" https://apis.google.com; object-src 'none'; base-uri 'self'; form-action 'self'";
if(!html.includes('<!-- BUILD:CSP -->'))throw Error('CSP placeholder missing');
html=html.replace('<!-- BUILD:CSP -->','<meta http-equiv="Content-Security-Policy" content="'+csp+'">');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),html);
for(const file of ['favicon.ico','apple-touch-icon.png'])fs.copyFileSync(path.join(root,'assets',file),path.join(out,file));
fs.mkdirSync(path.join(out,VENDOR),{recursive:true});
for(const f of fs.readdirSync(vsrc))fs.copyFileSync(path.join(vsrc,f),path.join(out,VENDOR,f));
console.log('Built dist/index.html, deployment icons and '+VENDOR+' (CSP '+hashes.length+' inline hashes · SRI 3)');

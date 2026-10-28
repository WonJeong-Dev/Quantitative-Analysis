const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../backend/cloudflare_worker.js'),'utf8');
 const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const W=module.default;
 let count=0;const ok=(label,test)=>{assert.ok(test,label);console.log('PASS '+label);count++;};
 const call=(url,options,env={})=>W.fetch(new Request('https://worker.test'+url,options),env);
 /* (v7.0) 인증·CORS·캐시·패스스루·KRX https 단정은 tests/worker-security.cjs(118개)가 맡는다.
  * 여기서는 무인증 요청이 **어떤 설정에서도** 데이터에 닿지 못하는지와 순수 함수만 본다. */
 global.fetch=async()=>{throw Error('upstream must not be called');};
 let r=await call('/summary?sym=NVDA',{method:'POST'});ok('methods bounded',r.status===405);
 r=await call('/summary?sym=NVDA',{},{ALLOWED_EMAILS:'a@b.c'});ok('no token -> 401 (Origin 없는 curl도 차단)',r.status===401);
 r=await call('/summary?sym=NVDA',{headers:{Origin:'https://untrusted.test'}},{ALLOWED_EMAILS:'a@b.c'});ok('untrusted origin without token -> 401, no ACAO',r.status===401&&!r.headers.get('Access-Control-Allow-Origin'));
 r=await call('/summary?sym=NVDA',{},{});ok('allowlist unset fails closed (503)',r.status===503);
 r=await call('/?url='+encodeURIComponent('https://query1.finance.yahoo.com/test'),{},{AUTH_MODE:'reprot',ALLOWED_EMAILS:'a@b.c'});ok('typo in AUTH_MODE falls back to enforce',r.status===401);
 r=await call('/health');/* 버전 문자열은 소스에서 읽는다 — 올릴 때마다 검사를 고치게 두면 "검사가 막아서 안 올린다"가
  * 된다. 소스와 VER의 짝은 tests/worker-security.cjs의 WORKERHASH 핀이 지킨다. */
 ok('/health is the only unauthenticated GET',r.status===200&&(await r.json()).ver===(source.match(/const VER = '([^']+)'/)||[])[1]);
 ok('KRX key never over plain http by default',!/http:\/\/data-dbg/.test(source.replace(/KRX_SCHEME[^\n]*http[^\n]*/g,'')));

 /* (v7.1) DART 탐침 — 키는 **서버에서만** 붙고, 무인증으로는 닿지 않는다.
  * 이 경로는 필드명을 눈으로 확인하기 위한 임시 계측기다. 파서가 생기면 지운다. */
 r=await call('/dart?api=fnlttSinglAcnt.json',{},{ALLOWED_EMAILS:'a@b.c'});
 ok('DART probe needs auth like every other route',r.status===401);
 r=await call('/dart?api=fnlttSinglAcnt.json',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c'});
 ok('DART probe without the secret explains itself (no upstream call)',r.status===500&&/DART_API_KEY/.test(await r.text()));
 r=await call('/dart',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'k'});
 ok('DART probe refuses without an api name',r.status===400);
 ok('DART host and path prefix are fixed in source',/https:\/\/opendart\.fss\.or\.kr\/api\/'/.test(source));
 ok('caller can never set crtfc_key',/k2 === 'crtfc_key'\) continue/.test(source)&&/qs\.set\('crtfc_key'/.test(source));

 const g=raw=>({raw});
 const basis=(shares,implied,fx=1,quoteCurrency='USD')=>module.revenueBasis({financialCurrency:'USD',totalRevenue:g(1000)}, {sharesOutstanding:g(shares),impliedSharesOutstanding:g(implied)}, {currency:'USD'}, {currency:quoteCurrency,regularMarketPrice:g(10),marketCap:g(10000)},fx);
 ok('economic share count reconciles to quote market cap',basis(500,1000).revPSQuote===1&&basis(500,1000).shareSource==='impliedSharesOutstanding');
 ok('unreconciled share counts produce no automatic valuation',basis(500,700).revPSQuote===null);
 ok('missing FX never becomes a zero valuation',basis(1000,null,null).revPSQuote===null);
 ok('quote currency disagreement blocks normalization',basis(1000,null,1,'EUR').revPSQuote===null);
 const asml=module.revenueBasis({financialCurrency:'EUR',totalRevenue:g(35327500288)},{sharesOutstanding:g(384100000),impliedSharesOutstanding:g(384100000)},{currency:'USD'},{currency:'USD',regularMarketPrice:g(1679.92),marketCap:g(645257297920)},1.149);
 ok('ASML replay normalizes total revenue into listed-share quote currency',Math.abs(asml.revPSQuote-105.677)<0.01);
 console.log(count+' worker contract assertions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

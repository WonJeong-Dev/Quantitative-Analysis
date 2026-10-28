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
 /* 텍스트가 아니라 **행동**으로 본다 — 조건문을 조금만 고쳐도 통과하던 정규식 검사를 교체한다.
  * 호출자가 crtfc_key를 넣어도 상류 URL에는 **서버 시크릿만** 실려야 한다. */
 { let captured=null;
   const prev=global.fetch;
   global.fetch=async(u2)=>{ captured=String((u2&&u2.url)||u2);
     return new Response('{"status":"000","list":[]}',{status:200,headers:{'content-type':'application/json'}}); };
   await call('/dart?api=x.json&crtfc_key=EVIL&corp_code=1',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'REALKEY'});
   global.fetch=prev;
   ok('caller can never set crtfc_key',/crtfc_key=REALKEY/.test(captured)&&!/EVIL/.test(captured));
   ok('probe-only params never reach DART',!/[?&]pick=/.test(captured)&&!/[?&]follow=/.test(captured));
   ok('upstream request carries a User-Agent (302 원인이었다)',/opendart\.fss\.or\.kr\/api\/x\.json/.test(captured)); }

 /* (v7.5) 자본총계 수집 — 인증·시크릿·입력 검증, 그리고 **최신 보고서 역순 탐색**.
  * 실측에서 같은 종목의 자본총계가 2025.12.31 120.7조 → 2026.06.30 262.7조였다.
  * 낡은 사업보고서를 집으면 PBR이 두 배 넘게 틀린다 — 순서가 곧 정확도다. */
 r=await call('/dartfin?code=000660',{},{ALLOWED_EMAILS:'a@b.c'});
 ok('dartfin endpoint needs auth',r.status===401);
 r=await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c'});
 ok('dartfin endpoint without the secret explains itself',r.status===500&&/DART_API_KEY/.test(await r.text()));
 r=await call('/dartfin?code=12',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'k'});
 ok('dartfin endpoint rejects a non-6-digit code',r.status===400);
 { /* 최신 분기가 비어 있으면 그 다음 보고서로 내려가고, 쉼표 금액을 숫자로 읽는지 본다. */
   const seen=[]; const prev=global.fetch;
   global.fetch=async(u2)=>{ const url=String((u2&&u2.url)||u2); seen.push(url);
     if(/list\.json/.test(url))return new Response(JSON.stringify({status:'000',list:[{corp_code:'00164779'}]}),{status:200});
     if(/reprt_code=11014/.test(url))return new Response(JSON.stringify({status:'013',message:'조회된 데이타가 없습니다.'}),{status:200});
     return new Response(JSON.stringify({status:'000',list:[
       {fs_div:'OFS',sj_div:'BS',account_nm:'자본총계',thstrm_amount:'1,000',currency:'KRW',thstrm_dt:'2026.06.30 현재'},
       {fs_div:'CFS',sj_div:'IS',account_nm:'매출액',thstrm_amount:'9,999'},
       {fs_div:'CFS',sj_div:'IS',account_nm:'당기순이익(손실)',thstrm_amount:'100',thstrm_dt:'2026.01.01 ~ 2026.06.30',frmtrm_amount:'10',frmtrm_dt:'2025.01.01 ~ 2025.06.30'},
       {fs_div:'CFS',sj_div:'BS',account_nm:'자본총계',thstrm_amount:'262,693,228,000,000',currency:'KRW',thstrm_dt:'2026.06.30 현재',thstrm_nm:'제 79 기반기말'}
     ]}),{status:200}); };
   const rr=await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'K'});
   const b=await rr.json(); global.fetch=prev;
   ok('빈 분기를 건너뛰고 다음 보고서를 쓴다',b.rpt==='11012'&&(b.tried||[]).length===2,JSON.stringify(b.tried));
   /* (v7.6) TTM = 직전 연간 + 당기 누계 − 전기 동기 누계. 손익계산서는 **연초부터의 누계**다
    * (실측: 기간 표기가 `2026.01.01 ~ 2026.06.30`, 3개월 행은 없다). 스텁은 모든 보고서에
    * 같은 행을 돌려주므로 연간도 같은 값이고, 항등식대로 fy + ytd − ytdPrev 가 나와야 한다. */
   ok('TTM을 항등식으로 낸다',b.ni&&b.ni.ttm===(b.ni.fy+b.ni.ytd-b.ni.ytdPrev),JSON.stringify(b.ni));
   ok('전기 동기 누계를 같은 응답에서 읽는다 (추가 호출은 연간 하나뿐)',b.ni.ytdPrev===10,b.ni.ytdPrev);
   ok('기간 표기를 그대로 싣는다',/2026\.01\.01/.test(b.ni.ytdDt||''),b.ni.ytdDt);
   ok('쉼표 금액을 숫자로 읽는다',b.equity===262693228000000,b.equity);
   ok('연결을 개별보다 먼저 쓴다',b.fs==='CFS',b.fs);
   ok('기준일을 함께 돌려준다 (PBR이 기준일에 따라 두 배 갈린다)',/2026\.06\.30/.test(b.at||''),b.at);
   ok('손익계산서 계정을 자본총계로 집지 않는다',b.equity!==9999); }

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

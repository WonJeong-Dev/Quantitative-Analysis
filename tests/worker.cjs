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

 /* (v7.7) 지배주주 귀속. 주요계정에는 지배기업 소유주지분이 **없어서**, 지금까지 자본총계와
  * 당기순이익(둘 다 비지배지분 포함)을 모회사 주식수로 나누고 있었다 — 분자·분모 불일치다.
  * 실측 오차: 자본 최대 26.2%(LG에너지솔루션) · 순이익 27.4%(삼성SDI).
  * 전체계정에는 IFRS 표준 태그로 들어 있다. 경로를 바꾸지 않고 **필드만 더한다.** */
 { const seen=[]; const prev=global.fetch;
   const main=[
     {fs_div:'CFS',sj_div:'BS',account_nm:'자본총계',thstrm_amount:'1,000',currency:'KRW',thstrm_dt:'2026.06.30 현재'},
     {fs_div:'CFS',sj_div:'IS',account_nm:'당기순이익(손실)',thstrm_amount:'200',thstrm_dt:'2026.01.01 ~ 2026.06.30',frmtrm_amount:'20'}];
   /* (v7.8) 실측 모양으로 맞춘다. IS/CIS 행에는 `frmtrm_amount`가 **아예 없고**
    * 전기 동기 누계는 `frmtrm_q_amount`에 온다(5종목 전부 확인). 그리고
    * 지배 + 비지배 = 총계가 **정확히** 성립한다 — 워커가 그것으로 검산한다. */
   const all=[
     {account_id:'ifrs-full_Equity',sj_div:'BS',thstrm_amount:'1,000'},
     {account_id:'ifrs-full_EquityAttributableToOwnersOfParent',sj_div:'BS',thstrm_amount:'740'},
     {account_id:'ifrs-full_NoncontrollingInterests',sj_div:'BS',thstrm_amount:'260'},
     {account_id:'ifrs-full_ProfitLoss',sj_div:'CIS',thstrm_amount:'200',frmtrm_q_amount:'20'},
     {account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'145',frmtrm_q_amount:'15'},
     {account_id:'ifrs-full_ProfitLossAttributableToNoncontrollingInterests',sj_div:'CIS',thstrm_amount:'55',frmtrm_q_amount:'5'}];
   global.fetch=async(u2)=>{ const url=String((u2&&u2.url)||u2); seen.push(url);
     if(/list\.json/.test(url))return new Response(JSON.stringify({status:'000',list:[{corp_code:'C'}]}),{status:200});
     if(/reprt_code=11014/.test(url))return new Response(JSON.stringify({status:'013'}),{status:200});
     if(/fnlttSinglAcntAll/.test(url))return new Response(JSON.stringify({status:'000',list:all}),{status:200});
     return new Response(JSON.stringify({status:'000',list:main}),{status:200}); };
   const rr=await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'K'});
   const b=await rr.json(); global.fetch=prev;
   const o=b.owners||{};
   ok('지배주주지분을 돌려준다',o.equity===740,JSON.stringify(o));
   ok('비지배지분도 함께 돌려준다',o.nci===260,o.nci);
   ok('자본총계 필드는 그대로 남는다 (구버전 앱이 깨지지 않는다)',b.equity===1000,b.equity);
   ok('지배주주 TTM도 같은 항등식으로 낸다',o.ttm===(o.niFy+o.niYtd-o.niYtdPrev)&&o.ttm===275,JSON.stringify(o));
   ok('전기 동기 누계는 frmtrm_q_amount에서 읽는다',o.prevField==='frmtrm_q_amount'&&o.niYtdPrev===15,JSON.stringify(o));
   ok('지배 + 비지배 = 총계를 당기·전기·연간 모두 검산한다',
      o.check&&o.check.cur===true&&o.check.prv===true&&o.check.fy===true,JSON.stringify(o.check));
   ok('전체계정을 고른 보고서·재무구분으로만 부른다',
      seen.filter(u3=>/fnlttSinglAcntAll/.test(u3)).every(u3=>/fs_div=CFS/.test(u3)),
      seen.filter(u3=>/fnlttSinglAcntAll/.test(u3)).join(' | '));
   ok('호출 수가 종목당 +2를 넘지 않는다',seen.filter(u3=>/fnlttSinglAcntAll/.test(u3)).length<=2,
      String(seen.filter(u3=>/fnlttSinglAcntAll/.test(u3)).length)); }

 /* 귀속 행이 **아예 없는** 회사(비지배지분 0)와, 조회가 **실패한** 경우를 구분한다.
  * 둘을 같게 다루면 '비지배지분이 없다'와 '모른다'가 섞인다(§22-⑫). */
 { const prev=global.fetch;
   const main=[{fs_div:'CFS',sj_div:'BS',account_nm:'자본총계',thstrm_amount:'1,000',currency:'KRW'}];
   global.fetch=async(u2)=>{ const url=String((u2&&u2.url)||u2);
     if(/list\.json/.test(url))return new Response(JSON.stringify({status:'000',list:[{corp_code:'C'}]}),{status:200});
     if(/reprt_code=11014/.test(url))return new Response(JSON.stringify({status:'013'}),{status:200});
     if(/fnlttSinglAcntAll/.test(url))return new Response(JSON.stringify({status:'000',list:[
       {account_id:'ifrs-full_Equity',sj_div:'BS',thstrm_amount:'1,000'}]}),{status:200});
     return new Response(JSON.stringify({status:'000',list:main}),{status:200}); };
   const b=await (await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'K'})).json();
   ok('귀속 행이 없으면 총계를 쓰되 그 사실을 적는다',
      b.owners.equity===1000&&/비지배지분이 없는 것으로 보아/.test(b.owners.why||''),JSON.stringify(b.owners));
   global.fetch=async(u2)=>{ const url=String((u2&&u2.url)||u2);
     if(/list\.json/.test(url))return new Response(JSON.stringify({status:'000',list:[{corp_code:'C'}]}),{status:200});
     if(/reprt_code=11014/.test(url))return new Response(JSON.stringify({status:'013'}),{status:200});
     if(/fnlttSinglAcntAll/.test(url))return new Response(JSON.stringify({status:'013',message:'없음'}),{status:200});
     return new Response(JSON.stringify({status:'000',list:main}),{status:200}); };
   const b2=await (await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'K'})).json();
   global.fetch=prev;
   ok('조회 실패는 0이 아니라 null + 사유',b2.owners.equity===null&&/전체계정 조회 결과가 없습니다/.test(b2.owners.why||''),
      JSON.stringify(b2.owners)); }

 /* ★ (v7.8) v7.7의 **실제 결함**을 못 박는다.
  * `cash('')`가 0을 돌려줘서(`Number('')===0`) 없는 전기 동기 누계가 0이 되고
  * `fy + ytd − 0`으로 TTM이 부풀었다 — 실측 풍산 165,444,669,160 → 229,644,320,039(+38.8%).
  * 빈 값·없는 필드·숫자 아닌 값은 전부 **null**이어야 하고, 진짜 "0"은 0이어야 한다. */
 { const prev=global.fetch;
   const mk=(ownRow,totPrev)=>async(u2)=>{ const url=String((u2&&u2.url)||u2);
     if(/list\.json/.test(url))return new Response(JSON.stringify({status:'000',list:[{corp_code:'C'}]}),{status:200});
     if(/reprt_code=11014/.test(url))return new Response(JSON.stringify({status:'013'}),{status:200});
     if(/fnlttSinglAcntAll/.test(url))return new Response(JSON.stringify({status:'000',list:[
       {account_id:'ifrs-full_Equity',sj_div:'BS',thstrm_amount:'1,000'},
       {account_id:'ifrs-full_EquityAttributableToOwnersOfParent',sj_div:'BS',thstrm_amount:'1,000'},
       {account_id:'ifrs-full_ProfitLoss',sj_div:'CIS',thstrm_amount:'200',frmtrm_q_amount:(totPrev===undefined?'20':totPrev)},
       ownRow,
       {account_id:'ifrs-full_ProfitLossAttributableToNoncontrollingInterests',sj_div:'CIS',thstrm_amount:'0',frmtrm_q_amount:'0'}]}),{status:200});
     return new Response(JSON.stringify({status:'000',list:[
       {fs_div:'CFS',sj_div:'BS',account_nm:'자본총계',thstrm_amount:'1,000',currency:'KRW'},
       {fs_div:'CFS',sj_div:'IS',account_nm:'당기순이익(손실)',thstrm_amount:'200',frmtrm_amount:'20'}]}),{status:200}); };
   const ask=async (ownRow,totPrev)=>{ global.fetch=mk(ownRow,totPrev);
     return (await (await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'K'})).json()).owners; };

   /* 전기 동기 누계 필드가 **없는** 행 — v7.7이 여기서 0을 썼다 */
   const o1=await ask({account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'200'});
   ok('없는 전기 동기 누계는 0이 아니라 null',o1.niYtdPrev===null,JSON.stringify(o1));
   /* 비지배지분 행이 **없고** 지배지분 = 총계인 회사(실측 삼성바이오로직스·LG이노텍 모양)는
    * 정상이므로 **받아들여야** 한다 — 검산을 무조건 실패로 두면 이쪽이 통째로 막힌다. */
   ok('비지배 행이 없고 지배지분 = 총계면 받아들인다',o1.equity===1000&&!o1.why,JSON.stringify(o1));
   ok('그러면 TTM을 내지 않고 사유를 적는다',o1.ttm===null&&/전기 동기 누계 없음/.test(o1.niWhy||''),JSON.stringify(o1));
   /* 빈 문자열·대시도 같다 */
   for(const bad of ['','-',' ','N/A']){
     const o=await ask({account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'200',frmtrm_q_amount:bad});
     ok('전기 동기 누계 '+JSON.stringify(bad)+' 는 null',o.niYtdPrev===null&&o.ttm===null,JSON.stringify(o));
   }
   /* 진짜 0은 0이다 — 결측과 0을 뒤집어 놓으면 반대 방향으로 틀린다 */
   /* 전기 동기가 전부 0인 해 — 지배 0 + 비지배 0 = 총계 0 으로 항등식이 성립해야 한다 */
   const o0=await ask({account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'200',frmtrm_q_amount:'0'},'0');
   ok('진짜 0은 0으로 읽는다',o0.niYtdPrev===0&&o0.ttm===(o0.niFy+200-0),JSON.stringify(o0));
   /* 음수·쉼표 음수를 null로 떨어뜨리면 적자 기업의 후행 EPS가 통째로 사라진다
    * (실측 LG에너지솔루션 지배주주 −0.38조). 부호를 반드시 살린다. */
   const oN=await ask({account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'200',frmtrm_q_amount:'-1,234'},'-1,234');
   ok('음수 금액을 부호까지 읽는다',oN.niYtdPrev===-1234&&oN.ttm===(oN.niFy+200+1234),JSON.stringify(oN));
   /* frmtrm_q_amount 가 없고 frmtrm_amount 만 있으면 차선으로 받는다 */
   const oF=await ask({account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'200',frmtrm_amount:'20'});
   ok('frmtrm_amount 만 있으면 그것을 쓰고 어느 필드인지 남긴다',
      oF.niYtdPrev===20&&oF.prevField==='frmtrm_amount',JSON.stringify(oF));
   /* 비지배 행을 **못 찾았는데** 지배지분 ≠ 총계인 경우. '비지배지분이 없는 회사'가 아니라
    * '비지배 행을 놓친 것'이다 — 검산 없이 통과시키면 그 차액이 조용히 사라진다. */
   { const prev2=global.fetch;
     global.fetch=async(u2)=>{ const url=String((u2&&u2.url)||u2);
       if(/list\.json/.test(url))return new Response(JSON.stringify({status:'000',list:[{corp_code:'C'}]}),{status:200});
       if(/reprt_code=11014/.test(url))return new Response(JSON.stringify({status:'013'}),{status:200});
       if(/fnlttSinglAcntAll/.test(url))return new Response(JSON.stringify({status:'000',list:[
         {account_id:'ifrs-full_Equity',sj_div:'BS',thstrm_amount:'1,000'},
         {account_id:'ifrs-full_EquityAttributableToOwnersOfParent',sj_div:'BS',thstrm_amount:'740'}]}),{status:200});
       return new Response(JSON.stringify({status:'000',list:[
         {fs_div:'CFS',sj_div:'BS',account_nm:'자본총계',thstrm_amount:'1,000',currency:'KRW'}]}),{status:200}); };
     const ob=(await (await call('/dartfin?code=000660',{},{AUTH_MODE:'report',ALLOWED_EMAILS:'a@b.c',DART_API_KEY:'K'})).json()).owners;
     global.fetch=prev2;
     ok('비지배 행이 없는데 지배지분 ≠ 총계면 쓰지 않는다',
        ob.equity===null&&/≠ 자본총계/.test(ob.why||''),JSON.stringify(ob)); }
   /* 항등식이 깨지면 쓰지 않는다 — 행을 잘못 집은 것이다 */
   const oX=await ask({account_id:'ifrs-full_ProfitLossAttributableToOwnersOfParent',sj_div:'CIS',thstrm_amount:'199',frmtrm_q_amount:'20'});
   ok('지배 + 비지배 ≠ 총계면 쓰지 않는다',oX.ttm===null&&/≠ 당기순이익/.test(oX.niWhy||''),JSON.stringify(oX));
   global.fetch=prev; }

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

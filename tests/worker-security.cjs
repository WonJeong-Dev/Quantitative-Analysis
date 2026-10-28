// 워커 스모크 — **실제로 실행**해서 검증한다.
//   `node --check`는 파싱만 하므로 TDZ(ReferenceError: Cannot access 'x' before
//   initialization)를 구조적으로 잡지 못한다. v6.7이 그 구멍으로 배포됐다(§22-㉗).
// 사용법: node worker_smoke.js [cloudflare_worker.js]
// (v6.9) 인증(Firebase ID 토큰 RS256) · CORS · KRX https · /fx 사다리 · /krxshrs ·
//   패스스루 강화 · 크럼 429/형식 · hl 화이트리스트 · 캐시(메모리·엣지) 단정 추가.
//   테스트용 RSA 키쌍을 WebCrypto로 만들어 구글 JWK 엔드포인트를 스텁한다 — 실제 서명
//   검증 경로(crypto.subtle.verify)를 그대로 탄다.
const fs=require('fs'), os=require('os'), path=require('path');
const SRC=path.resolve(process.argv[2]||path.join(__dirname,'../backend/cloudflare_worker.js'));
const subtle=globalThis.crypto.subtle;
// ugd의 90일 창은 워커가 Date.now()로 재므로 기준시각도 현재여야 한다.
// (고정 타임스탬프를 쓰면 시간이 지나면서 조용히 창 밖으로 나간다 — 첫 작성 때 그렇게 틀렸다)
const NOW=Math.floor(Date.now()/1000);
const q=n=>({raw:n});

const YQ={quoteSummary:{result:[{
  financialData:{numberOfAnalystOpinions:q(48),targetMeanPrice:q(210),targetHighPrice:q(300),
    targetLowPrice:q(150),recommendationMean:q(1.6),returnOnEquity:q(1.15),operatingMargins:q(0.62),
    debtToEquity:q(12.5),revenueGrowth:q(0.56),earningsGrowth:q(0.60),revenuePerShare:q(7.4),
    freeCashflow:q(6.1e10),operatingCashflow:q(7.2e10),financialCurrency:'USD'},
  summaryDetail:{priceToSalesTrailing12Months:q(24.1),trailingPE:q(45.2),forwardPE:q(31.0),
    marketCap:q(4.3e12),currency:'USD'},
  defaultKeyStatistics:{trailingEps:q(3.9),forwardEps:q(5.6),priceToBook:q(42.1)},
  calendarEvents:{earnings:{earningsDate:[q(NOW+86400*20)]}},
  recommendationTrend:{trend:[
    {period:'0m',strongBuy:30,buy:18,hold:6,sell:1,strongSell:0},
    {period:'-1m',strongBuy:29,buy:19,hold:6,sell:1,strongSell:0}]},
  upgradeDowngradeHistory:{history:[
    {epochGradeDate:NOW-86400*5,firm:'A',fromGrade:'Hold',toGrade:'Buy',action:'up'},
    {epochGradeDate:NOW-86400*20,firm:'B',fromGrade:'Buy',toGrade:'Hold',action:'down'},
    {epochGradeDate:NOW-86400*40,firm:'C',toGrade:'Buy',action:'init'}]},
  earningsTrend:{trend:[
    {period:'+1q',earningsEstimate:{avg:q(1.42)},revenueEstimate:{avg:q(5.4e10)},
     epsRevisions:{upLast7days:q(3),upLast30days:q(11),downLast30days:q(2),downLast90days:q(4)}},
    {period:'+1y',earningsEstimate:{avg:q(6.1)},revenueEstimate:{avg:q(2.4e11),growth:q(0.41)},
     growth:q(0.38)},
    {period:'0y',earningsEstimate:{avg:q(4.4)}}]},
  earningsHistory:{history:[
    {quarter:q(NOW-86400*95),epsActual:q(1.10),epsEstimate:q(1.01),surprisePercent:q(0.089)},
    {quarter:q(NOW-86400*5),epsActual:q(1.30),epsEstimate:q(1.20)}]},
  cashflowStatementHistoryQuarterly:{cashflowStatements:[
    {endDate:q(NOW-86400*95),capitalExpenditures:q(-1.2e10)},
    {endDate:q(NOW-86400*5), capitalExpenditures:q(-1.9e10)}]}
}]}};
const YQ_ETF={quoteSummary:{result:[{
  fundProfile:{feesExpensesInvestment:{annualReportExpenseRatio:q(0.0020)},
    categoryName:'Large Blend',family:'Vanguard'},
  defaultKeyStatistics:{totalAssets:q(1.5e12),beta3Year:q(1.0)},
  summaryDetail:{yield:q(0.012),navPrice:q(512.3),currency:'USD'}}]}};

/* ---------- 상류 스텁 ---------- */
const JWK_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const mk=(status,body,hdr)=>{ const h={}; for(const k in (hdr||{})) h[k.toLowerCase()]=hdr[k];
  const txt=typeof body==='string'?body:JSON.stringify(body);
  return {ok:status>=200&&status<300,status,headers:{get:k=>h[String(k).toLowerCase()]??null},
          text:async()=>txt,json:async()=>JSON.parse(txt)}; };
const S={                       // 시나리오 스위치 — 테스트마다 바꾼다
  MODE:YQ, JWKS:null, crumb:()=>mk(200,'CRUMB123'), qs:null,
  fx:{}, krx:{}, pass:null, rss:null
};
const LOG=[];                   // 모든 상류 호출 {url, init}
const cnt=re=>LOG.filter(x=>re.test(x.url)).length;
global.fetch=async(url,init)=>{
  const u=String(url); LOG.push({url:u,init:init||{}});
  if(u===JWK_URL) return mk(200,S.JWKS,{'Cache-Control':'public, max-age=19000, must-revalidate'});
  if(u.includes('fc.yahoo.com')) return mk(200,'',{'set-cookie':'A1=abc; Path=/'});
  if(u.includes('getcrumb')) return S.crumb();
  if(u.includes('quoteSummary')) return S.qs?S.qs():mk(200,S.MODE);
  const cm=/\/v8\/finance\/chart\/([^?]+)/.exec(u);
  if(cm&&S.pass==null){ const sym=decodeURIComponent(cm[1]); const v=S.fx[sym];
    return v==null?mk(404,{chart:{result:null,error:{code:'Not Found'}}})
                  :mk(200,{chart:{result:[{meta:{symbol:sym,regularMarketPrice:v}}]}}); }
  if(u.includes('data-dbg.krx.co.kr')){ for(const k in S.krx) if(u.includes(k)) return S.krx[k](u);
    return mk(200,{OutBlock_1:[]}); }
  if(u.startsWith('https://news.google.com/rss')) return S.rss?S.rss(u):mk(200,'<rss></rss>');
  if(S.pass) return S.pass(u,init);
  throw new Error('unexpected fetch: '+u);
};

let pass=0,fail=0;
const ok=(n,c,extra)=>{ c?(pass++,console.log('  OK   '+n))
  :(fail++,console.log('  FAIL '+n+(extra?('  ← '+extra):''))); };

/* 모듈을 새로 읽는다 — 모듈 변수(크럼·JWKS·메모리 캐시·냉각)가 초기화된 워커 인스턴스.
 * Cloudflare의 '새 isolate'에 해당한다. */
const TMP=[];
const load=async()=>{ const f=path.join(os.tmpdir(),'wk_'+Date.now()+'_'+TMP.length+'.mjs');
  fs.writeFileSync(f,fs.readFileSync(SRC,'utf8')); TMP.push(f);
  return (await import('file://'+f)).default; };

/* ---------- 토큰 ---------- */
const b64u=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const PROJ='quantitative-analysis-ed463';
let K1,K2,JWK1;
const claims=o=>Object.assign({
  iss:'https://securetoken.google.com/'+PROJ, aud:PROJ, auth_time:NOW-600, user_id:'u1', sub:'u1',
  iat:NOW-10, exp:NOW+3590, email:'Tester@Example.com', email_verified:true,
  firebase:{identities:{},sign_in_provider:'google.com'}},o||{});
const sign=async(pl,opt)=>{ opt=opt||{};
  const h=b64u(JSON.stringify(Object.assign({alg:'RS256',kid:'k1',typ:'JWT'},opt.hdr||{})));
  const p=b64u(JSON.stringify(pl));
  const sg=await subtle.sign('RSASSA-PKCS1-v1_5',(opt.key||K1).privateKey,new TextEncoder().encode(h+'.'+p));
  return h+'.'+p+'.'+b64u(new Uint8Array(sg)); };
const ENV={ALLOWED_EMAILS:'tester@example.com, other@example.com',KRX_AUTH_KEY:'K'.repeat(32)};
const ORIGIN='https://wonjeong-dev.github.io';

(async()=>{
const gen=()=>subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
K1=await gen(); K2=await gen();
JWK1=Object.assign(await subtle.exportKey('jwk',K1.publicKey),{kid:'k1',alg:'RS256',use:'sig'});
S.JWKS={keys:[JWK1]};
const TOK=await sign(claims());

let W=await load();
const call=async(p,o)=>{ o=o||{}; const h=Object.assign({Origin:ORIGIN},o.headers||{});
  const tok=('token' in o)?o.token:TOK; if(tok) h.Authorization='Bearer '+tok;
  const r=await (o.W||W).fetch(new Request('https://x.dev'+p,{method:o.method||'GET',headers:h}),o.env||ENV);
  const text=r.status===204?'':await r.text(); let b=null; try{ b=JSON.parse(text); }catch(e){}
  return {status:r.status,b,h:r.headers,text}; };

console.log('\n[1] /summary 주식 경로 — 실제 실행 (v6.7 TDZ 회귀 검사)');
S.MODE=YQ;
const r=await call('/summary?sym=NVDA');
ok('HTTP 200 (500 아님)', r.status===200,
   r.status!==200?('status '+r.status+' · '+JSON.stringify(r.b)):'');
ok('ReferenceError 아님', !(r.b&&/ReferenceError/.test(String(r.b.error||''))),
   r.b&&r.b.error?String(r.b.error):'');
if(r.status!==200){ console.log('\n  ↑ 주식 경로가 죽었다. 아래 검사는 의미가 없다.'); }

console.log('\n[2] v6.7 이벤트 채널 6종이 실제로 채워지는가');
const b=r.b||{};
['surp','ugd','rtH','rev','est','capex'].forEach(k=>ok('키 존재: '+k, k in b));
ok('surp — 분기 2건, 최신순', Array.isArray(b.surp)&&b.surp.length===2&&b.surp[0].d>b.surp[1].d);
ok('surp — surprisePercent 없으면 직접 계산', b.surp&&b.surp[0].pct!=null);
ok('ugd — 90일 상1·하1·신규1', b.ugd&&b.ugd.up90===1&&b.ugd.dn90===1&&b.ugd.ini90===1,
   JSON.stringify(b.ugd&&{up90:b.ugd.up90,dn90:b.ugd.dn90,ini90:b.ugd.ini90}));
ok('est — 가이던스 대리축(+1q·+1y·0y)', b.est&&b.est.eq1===1.42&&b.est.ey1===6.1&&b.est.ey0===4.4);
ok('rev — 개정 건수', b.rev&&b.rev.u30===11&&b.rev.d90===4);
ok('capex — 분기 2건 + FCF', b.capex&&b.capex.q&&b.capex.q.length===2&&b.capex.fcf===6.1e10);
ok('rtH — 의견분포 추이 2개월', Array.isArray(b.rtH)&&b.rtH.length===2);

console.log('\n[3] 기존 필드 회귀 (v6.4~v6.6)');
ok('통화 태그 fcur/qcur', b.fcur==='USD'&&b.qcur==='USD');
ok('fx — 동일 통화면 1/same', b.fx===1&&b.fxSrc==='same');
ok('성장 추정 — +1y 우선', Math.abs(b.epsGrowthEst-38)<1e-9&&Math.abs(b.revGrowthEst-41)<1e-9);
ok('멀티플 스냅샷', b.psrY===24.1&&b.perT===45.2&&b.mcap===4.3e12);
// 부동소수: 1.15*100 = 114.99999999999999. 등호 비교는 여기서 틀린다.
ok('재무 품질 %환산', Math.abs(b.roe-115)<1e-9&&Math.abs(b.margin-62)<1e-9,
   'roe='+b.roe+' margin='+b.margin);
ok('실적 발표일', b.earn===NOW+86400*20);
// (v6.9) 응답 키 집합이 v6.8과 같아야 한다(앱 호환) — 키가 빠지거나 늘면 여기서 드러난다
// (v7.0) v5.4 응답 키(deRatio·revenueBasis·workerBuild) + epsFwdSrc — 순서까지 고정
const KEYS68=['sym','n','tgt','tgtHi','tgtLo','rec','lg','roe','margin','de','deRatio','revG','epsG','epsTtm','epsFwd',
  'revPS','revenueBasis','workerBuild','epsFwdSrc','epsGrowthEst','revGrowthEst','earn','rt','surp','ugd','rtH','rev','est','capex','fcur','qcur',
  'fx','fxSrc','psrY','pbrY','perT','perF','mcap'];
ok('/summary 응답 키 = v5.4 37개 + epsFwdSrc', JSON.stringify(Object.keys(b))===JSON.stringify(KEYS68),
   Object.keys(b).join(','));

console.log('\n[4] ETF 경로 · 입력 검증');
S.MODE=YQ_ETF;
const e=await call('/summary?sym=VOO&t=etf');
ok('ETF HTTP 200', e.status===200);
ok('kind=etf · 보수율 0.20%', e.b&&e.b.kind==='etf'&&Math.abs(e.b.exp-0.20)<1e-9);
ok('ETF는 주식 모듈에 닿지 않는다(TDZ 무관)', e.b&&!('surp' in e.b));
const bad=await call('/summary?sym=<script>');
ok('잘못된 심볼 → 400', bad.status===400);
S.MODE=YQ;

console.log('\n[5] (v6.9) 무인증 경로 — OPTIONS · /health · CORS');
const op=await call('/summary?sym=NVDA',{method:'OPTIONS',token:null});
ok('OPTIONS → 204 (토큰 없이)', op.status===204, 'status '+op.status);
ok('Allow-Headers: Authorization, Content-Type', op.h.get('Access-Control-Allow-Headers')==='Authorization, Content-Type');
ok('Max-Age 86400', op.h.get('Access-Control-Max-Age')==='86400');
ok('허용 Origin 반사', op.h.get('Access-Control-Allow-Origin')===ORIGIN);
ok('Vary: Origin', /Origin/.test(op.h.get('Vary')||''));
const op2=await call('/fx?from=USD&to=USD',{method:'OPTIONS',token:null,headers:{Origin:'https://evil.example'}});
ok('비허용 Origin → Allow-Origin 생략', op2.h.get('Access-Control-Allow-Origin')===null);
const op3=await call('/health',{token:null,headers:{Origin:'https://a.example'},
  env:Object.assign({},ENV,{ALLOWED_ORIGINS:'https://a.example, https://b.example'})});
ok('ALLOWED_ORIGINS env 반사', op3.h.get('Access-Control-Allow-Origin')==='https://a.example');
const hl0=await call('/health',{token:null});
/* (v7.1) 버전 문자열은 **소스에서 읽는다** — 올릴 때마다 검사를 고치게 두면 "검사가 막아서
 * 안 올린다"가 된다. 여기서 지키려는 것은 숫자가 아니라 **ver 하나만 실린다**는 사실이다. */
{ const VERSRC=(fs.readFileSync(SRC,'utf8').match(/const VER = '([^']+)'/)||[])[1];
  ok('/health 무인증 200 · {ver} 하나만 (ver='+VERSRC+')',
     hl0.status===200&&JSON.stringify(hl0.b)===JSON.stringify({ver:VERSRC}), hl0.text);
  /* 소스가 바뀌었는데 VER이 그대로면 여기서 깨진다 — /health가 '무엇이 떠 있는가'를
   * 말할 수 있어야 배포 여부를 확인할 수 있다. 고치는 법: VER을 올리고
   * `node scripts/workerhash.cjs --write`. */
  /* 머리 주석이 버전을 다시 선언하면 VER과 갈라진다 — 실제로 갈라져서 "이 파일 맞냐"는
   * 질문을 받았다. 버전을 적는 자리는 VER 하나뿐이다. */
  ok('머리 주석이 버전을 다시 선언하지 않는다',
     !/프록시 v[0-9]/.test(fs.readFileSync(SRC,'utf8').split('\n').slice(0,6).join('\n')));
  const H=require('../scripts/workerhash.cjs'), PIN=JSON.parse(fs.readFileSync(H.PIN,'utf8'));
  ok('워커 소스 ↔ VER 핀이 맞는다 (hash '+H.hash+')', PIN.hash===H.hash&&PIN.ver===VERSRC,
     '핀 '+PIN.ver+'/'+PIN.hash+' ≠ 현재 '+VERSRC+'/'+H.hash); }
const hlNoEnv=await call('/health',{token:null,env:{}});
ok('/health는 ALLOWED_EMAILS 없어도 200', hlNoEnv.status===200);
ok('응답에 `*` 없음 · Cache-Control 없음', r.h.get('Access-Control-Allow-Origin')===ORIGIN&&r.h.get('Cache-Control')===null);

console.log('\n[6] (v6.9) 인증 — 유효 토큰 통과 / 사유별 401');
ok('유효 토큰 → 200 · X-QA-Auth: ok', r.status===200&&r.h.get('X-QA-Auth')==='ok', r.h.get('X-QA-Auth'));
ok('email 대소문자 무시(Tester@ → tester@)', r.status===200);
const A=async(name,tok,reason,o)=>{ const x=await call('/fx?from=EUR&to=EUR',Object.assign({token:tok},o||{}));
  ok(name+' → '+(o&&o.st||401)+' '+reason, x.status===(o&&o.st||401)&&x.b&&x.b.error==='auth'&&x.b.reason===reason&&!!x.b.안내,
     x.status+' '+JSON.stringify(x.b)); return x; };
await A('토큰 없음',null,'no_token');
await A('JWT 아님','abc.def','malformed');
await A('만료(exp=now-61)',await sign(claims({exp:NOW-61})),'expired');
const inSkew=await call('/fx?from=EUR&to=EUR',{token:await sign(claims({exp:NOW-30}))});
ok('만료 30초 전(여유 60초 이내) → 통과', inSkew.status===200, inSkew.status+'');
await A('aud 불일치',await sign(claims({aud:'other-proj'})),'aud');
await A('iss 불일치',await sign(claims({iss:'https://securetoken.google.com/other'})),'iss');
await A('iat 미래(+120초)',await sign(claims({iat:NOW+120})),'iat_future');
await A('auth_time 미래(+120초)',await sign(claims({auth_time:NOW+120})),'auth_time');
await A('sub 비어 있음',await sign(claims({sub:''})),'sub');
{ const t=TOK.split('.'); const p=JSON.parse(Buffer.from(t[1],'base64url'));
  p.email='other@example.com';            // 명단에 있는 다른 사람으로 바꿔치기 — 서명은 그대로
  await A('본문 변조(서명 불일치)',t[0]+'.'+b64u(JSON.stringify(p))+'.'+t[2],'signature'); }
await A('다른 키로 서명(kid는 k1)',await sign(claims(),{key:K2}),'signature');
await A('email 미허용',await sign(claims({email:'stranger@example.com'})),'email_not_allowed');
await A('email_verified false',await sign(claims({email_verified:false})),'email_unverified');
await A('provider 불일치(password)',await sign(claims({firebase:{sign_in_provider:'password'}})),'provider');
await A('alg HS256',await sign(claims(),{hdr:{alg:'HS256'}}),'alg');
const jw0=cnt(/jwk\/securetoken/);
await A('모르는 kid',await sign(claims(),{hdr:{kid:'nope'}}),'kid_unknown');
ok('모르는 kid → 공개키 강제 갱신은 60초에 1번만', cnt(/jwk\/securetoken/)-jw0<=1);
await A('ALLOWED_EMAILS 미설정',TOK,'allowlist_unset',{env:{KRX_AUTH_KEY:'x'},st:503});
ok('공개키는 모듈 캐시(max-age) — 지금까지 받아온 횟수 ≤ 2', cnt(/jwk\/securetoken/)<=2, ''+cnt(/jwk\/securetoken/));
const un=await call('/fx?from=EUR&to=EUR',{token:null});
ok('401 응답에도 X-QA-Auth · WWW-Authenticate', un.h.get('X-QA-Auth')==='fail:no_token'&&/Bearer/.test(un.h.get('WWW-Authenticate')||''));

console.log('\n[7] (v6.9) AUTH_MODE=report — 통과 + 헤더, raw/diag는 거부');
const REP=Object.assign({},ENV,{AUTH_MODE:'report'});
const rp=await call('/fx?from=EUR&to=EUR',{token:await sign(claims({exp:NOW-999})),env:REP});
ok('report: 만료 토큰도 200', rp.status===200&&rp.b&&rp.b.v===1, rp.status+'');
ok('report: X-QA-Auth: fail:expired', rp.h.get('X-QA-Auth')==='fail:expired', rp.h.get('X-QA-Auth'));
const rp2=await call('/fx?from=EUR&to=EUR',{token:null,env:REP});
ok('report: 토큰 없음도 200 · fail:no_token', rp2.status===200&&rp2.h.get('X-QA-Auth')==='fail:no_token');
const rp3=await call('/krxetf?diag=1',{token:null,env:REP});
ok('report: diag 무인증 → 401', rp3.status===401&&rp3.b&&rp3.b.error==='auth', rp3.status+' '+rp3.text);
const rp4=await call('/krxshrs?raw=1',{token:null,env:REP});
ok('report: raw 무인증 → 401', rp4.status===401);
const dg=await call('/krxetf?diag=1');
ok('diag 인증 통과 → 200 · 키 문자열 미노출', dg.status===200&&dg.b&&dg.b.secret등록===true&&!dg.text.includes('KKKK'));
const typo=await call('/fx?from=EUR&to=EUR',{token:null,env:Object.assign({},ENV,{AUTH_MODE:'reprot'})});
ok('AUTH_MODE 오타 → enforce(401)', typo.status===401);

console.log('\n[8] (v6.9) KRX — https · /krxshrs 경로');
const ROW=(code,nm,cls,shrs,vol)=>({BAS_DD:'20260731',ISU_CD:code,ISU_NM:nm,TDD_CLSPRC:String(cls),
  LIST_SHRS:String(shrs),MKTCAP:String(cls*shrs),ACC_TRDVOL:String(vol)});
S.krx={'stk_bydd_trd':()=>mk(200,{OutBlock_1:[ROW('005930','삼성전자',70000,5969782550,1000),ROW('000660','SK하이닉스',200000,728002365,500)]}),
       'ksq_bydd_trd':()=>mk(200,{OutBlock_1:[ROW('060310','3S',2500,48000000,10)]}),
       'etf_bydd_trd':()=>mk(200,{OutBlock_1:[Object.assign(ROW('069500','KODEX 200',35000,1e8,1),{NAV:'35010'})]})};
const k0=LOG.length;
const ks=await call('/krxshrs?codes=005930,060310&d=20260731');
const krxUrls=LOG.slice(k0).map(x=>x.url).filter(x=>x.includes('krx'));
ok('/krxshrs 200', ks.status===200, ks.status+' '+ks.text.slice(0,200));
ok('KRX URL이 전부 https://', krxUrls.length===2&&krxUrls.every(x=>x.startsWith('https://data-dbg.krx.co.kr/')), krxUrls.join(' '));
ok('/krxshrs 요청 코드 2건만 · 항등식 ok', ks.b&&ks.b.n===2&&ks.b.items.every(i=>i.ok&&i.shrs>0), JSON.stringify(ks.b&&ks.b.items));
ok('/krxshrs 응답 키 유지(basDd·요청일·codeSrc·items)', ks.b&&ks.b.basDd==='20260731'&&ks.b.요청일==='20260731'&&ks.b.codeSrc[0]==='isu6');
const k1=LOG.length;
const ke=await call('/krxetf?d=20260731');
ok('/krxetf https · 200', ke.status===200&&LOG.slice(k1).some(x=>x.url.startsWith('https://data-dbg.krx.co.kr/svc/apis/etp/')));
const k2=LOG.length;
await call('/krxshrs?codes=000660&d=20260730',{env:Object.assign({},ENV,{KRX_SCHEME:'http'})});
ok('KRX_SCHEME=http 로 되돌리기', LOG.slice(k2).filter(x=>x.url.includes('krx')).every(x=>x.url.startsWith('http://data-dbg')));
S.krx.ksq_bydd_trd=()=>mk(401,'{"respCode":"401","respMsg":"Unauthorized"}');
const kp=await call('/krxshrs?codes=005930&d=20260729');
ok('부분성공(코스닥 401) → 200 · 부분성공 표시 유지', kp.status===200&&kp.b.부분성공===true);
const kp2c=cnt(/krx/); await call('/krxshrs?codes=005930&d=20260729');
ok('부분성공 응답은 캐시하지 않는다(재요청 시 KRX 재호출)', cnt(/krx/)>kp2c);

console.log('\n[9] (v6.9) /fx 사다리 — pair · inv · usd');
S.fx={'EURUSD=X':1.1, 'USDKRW=X':1400, 'TWD=X':31.5};
const f1=await call('/fx?from=EUR&to=USD');
ok('pair EURUSD=X', f1.b&&f1.b.v===1.1&&f1.b.src==='pair', JSON.stringify(f1.b));
const f2=await call('/fx?from=KRW&to=USD');
ok('inv USDKRW=X → 1/1400', f2.b&&Math.abs(f2.b.v-1/1400)<1e-15&&f2.b.src==='inv', JSON.stringify(f2.b));
const f3=await call('/fx?from=TWD&to=USD');
ok('usd 삼각 TWD=X → 1/31.5', f3.b&&Math.abs(f3.b.v-1/31.5)<1e-15&&f3.b.src==='usd', JSON.stringify(f3.b));
const f4=await call('/fx?from=XAA&to=XBB');
ok('없는 통화 → 502 · 안내', f4.status===502&&f4.b&&f4.b.error==='fx not found');
const f5=await call('/fx?from=EU&to=USD');
ok('잘못된 통화 → 400', f5.status===400);

console.log('\n[10] (v6.9) 패스스루 — 허용목록 · https · redirect · userinfo');
S.pass=(u,init)=>{ if(u.includes('redir')) return mk(302,'',{Location:'https://evil.example/x'});
  return mk(200,{chart:{result:[{meta:{symbol:'AAPL'}}]}}); };
const P=t=>call('/?url='+encodeURIComponent(t));
const p0=LOG.length;
const pOk=await P('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1m');
ok('허용 호스트 https → 200', pOk.status===200&&pOk.b&&pOk.b.chart, pOk.status+' '+pOk.text.slice(0,100));
ok('상류 fetch에 redirect:"manual"', LOG.slice(p0).some(x=>x.init&&x.init.redirect==='manual'));
const pHttp=await P('http://query1.finance.yahoo.com/v8/finance/chart/AAPL');
ok('http:// → 400', pHttp.status===400&&/https only/.test(pHttp.b.error));
const pEvil=await P('https://evil.example/x');
ok('비허용 호스트 → 400 host not allowed', pEvil.status===400&&/host not allowed/.test(pEvil.b.error));
const pSuf=await P('https://query1.finance.yahoo.com.evil.example/x');
ok('접미사 위장 호스트 → 400', pSuf.status===400);
const pUser=await P('https://user:pw@query1.finance.yahoo.com/v8/finance/chart/AAPL');
ok('userinfo 포함 → 400', pUser.status===400&&/credentials/.test(pUser.b.error));
const pPort=await P('https://query1.finance.yahoo.com:8443/v8/finance/chart/AAPL');
ok('포트 지정 → 400', pPort.status===400);
const pRed=await P('https://query1.finance.yahoo.com/redir');
ok('상류 3xx → 502 (따라가지 않음)', pRed.status===502&&/redirect/.test(pRed.b.error)&&pRed.b.to==='evil.example', JSON.stringify(pRed.b));
const pBad=await P('not a url');
ok('URL 아님 → 400', pBad.status===400);
const pNone=await call('/');
ok('url 없음 → 400', pNone.status===400);
const p1=LOG.length;
const pHit=await P('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1m');
ok('같은 패스스루 재요청 → 캐시 적중(mem) · 상류 미호출', pHit.h.get('X-QA-Cache')==='mem'&&LOG.length===p1, pHit.h.get('X-QA-Cache')+' '+(LOG.length-p1));
S.pass=null;

console.log('\n[11] (v6.9) 크럼 — 429 전달·냉각 / 비정상 본문 미캐시');
W=await load();
S.crumb=()=>mk(429,'Too Many Requests',{'Retry-After':'120'});
const c1=await call('/summary?sym=AAA');
ok('크럼 429 → /summary 429', c1.status===429, c1.status+' '+c1.text);
ok('Retry-After: 120 전달', c1.h.get('Retry-After')==='120', c1.h.get('Retry-After'));
const cr0=cnt(/getcrumb|fc\.yahoo/);
const c2=await call('/summary?sym=BBB');
ok('냉각 중 → 상류(쿠키·크럼) 미호출 · 429', c2.status===429&&cnt(/getcrumb|fc\.yahoo/)===cr0);
W=await load();
S.crumb=()=>mk(200,'Too Many Requests');                 // 200에 오류 문장 — 형식 검사로 걸려야 한다
const c3=await call('/summary?sym=CCC');
ok('크럼 형식 이상 → 502', c3.status===502&&/형식/.test(c3.b.error), c3.status+' '+c3.text);
S.crumb=()=>mk(200,'aB3dE.fG/hI');
const g0=cnt(/getcrumb/);
const c4=await call('/summary?sym=DDD');
ok('비정상 크럼은 캐시되지 않았다 → 다음 요청에서 다시 발급', c4.status===200&&cnt(/getcrumb/)===g0+1);
await call('/summary?sym=EEE');
ok('정상 크럼은 캐시된다(재발급 없음)', cnt(/getcrumb/)===g0+1);
const c4q=LOG.filter(x=>/quoteSummary\/DDD/.test(x.url)).pop();
ok('실제 크럼 문자셋(. /) 통과 · URL 인코딩', c4q&&c4q.url.includes('crumb=aB3dE.fG%2FhI'));
S.crumb=()=>mk(200,'<html>err</html>');
W=await load();
const c5=await call('/summary?sym=FFF');
ok('HTML 크럼 → 502 상류 오류(v7.0: 내부 오류 원문 대신 UpErr)', c5.status===502&&/crumb fail/.test(c5.b.error));
W=await load(); S.crumb=()=>mk(200,'CRUMB123');
S.qs=()=>mk(429,'{"finance":{"error":{"code":"Too Many Requests"}}}',{'Retry-After':'30'});
const q0=cnt(/quoteSummary/);
const c6=await call('/summary?sym=GGG');
ok('quoteSummary 429 → 429 · Retry-After 30 · 재시도 없음', c6.status===429&&c6.h.get('Retry-After')==='30'&&cnt(/quoteSummary/)===q0+1,
   c6.status+' '+c6.h.get('Retry-After')+' '+(cnt(/quoteSummary/)-q0));
const c7=await call('/summary?sym=HHH');
ok('quoteSummary 429 이후 냉각 — 상류 미호출', c7.status===429&&cnt(/quoteSummary/)===q0+1);
S.qs=null;

console.log('\n[12] (v6.9) /news — hl 화이트리스트');
W=await load();
S.rss=u=>mk(200,'<rss><item><title>Headline - Src</title><link>https://n/1</link><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item></rss>');
const n1=await call('/news?q=NVDA&hl=fr');
ok('hl=fr → 400', n1.status===400&&n1.b.error==='bad hl');
const n2=await call('/news?q=NVDA&hl=en%26gl%3DXX');
ok('hl에 & 끼워넣기 → 400', n2.status===400);
const n0=LOG.length;
const n3=await call('/news?q=삼성전자&hl=ko');
ok('hl=ko → 200 · {q, items}', n3.status===200&&n3.b.q==='삼성전자'&&n3.b.items.length===1&&n3.b.items[0].s==='Src');
ok('RSS URL hl=ko&gl=KR', LOG.slice(n0).some(x=>/news\.google\.com\/rss.*hl=ko&gl=KR&ceid=KR:ko/.test(x.url)));
const n4=await call('/news?q=NVDA');
ok('hl 생략 → en (v6.8 동작)', n4.status===200);
S.rss=()=>mk(503,'down');
const n5=await call('/news?q=AMD&hl=en');
ok('상류 실패 → 200 {items:[]} (v6.8 호환)', n5.status===200&&n5.b.items.length===0);
S.rss=u=>mk(200,'<rss><item><title>A - B</title><link>l</link></item></rss>');
const n6c=cnt(/news\.google\.com\/rss/);
const n6=await call('/news?q=AMD&hl=en');
ok('상류 실패 응답은 캐시되지 않았다(다시 조회 · 1건)', n6.b.items.length===1&&cnt(/news\.google\.com\/rss/)===n6c+1);
S.rss=null;

console.log('\n[13] (v6.9) 캐시 — 적중 시 상류 미호출 · 인증 선행 · 오류 미캐시 · 엣지 단');
W=await load(); S.MODE=YQ;
const s1=await call('/summary?sym=NVDA');
ok('첫 요청 X-QA-Cache: miss', s1.status===200&&s1.h.get('X-QA-Cache')==='miss');
const s0=cnt(/quoteSummary|getcrumb|fc\.yahoo/);
const TOK2=await sign(claims({email:'other@example.com',sub:'u2',user_id:'u2'}));
const s2=await call('/summary?sym=NVDA',{token:TOK2});
ok('다른 사용자·다른 토큰도 적중(키에 Authorization 없음)', s2.h.get('X-QA-Cache')==='mem'&&cnt(/quoteSummary|getcrumb|fc\.yahoo/)===s0);
ok('적중 응답 본문 = 원 응답', s2.text===s1.text);
const s3=await call('/summary?sym=NVDA',{token:null});
ok('캐시에 있어도 무토큰은 401 (인증이 캐시보다 먼저)', s3.status===401);
const f6c=cnt(/v8\/finance\/chart/);
await call('/fx?from=EUR&to=USD'); await call('/fx?from=EUR&to=USD');
ok('/fx 두 번째는 적중', cnt(/v8\/finance\/chart/)===f6c+1);
const ksc=cnt(/krx/);
S.krx.ksq_bydd_trd=()=>mk(200,{OutBlock_1:[]});
await call('/krxshrs?codes=005930,000660&d=20260731');
const ksh=await call('/krxshrs?codes=000660,005930&d=20260731');
ok('/krxshrs codes 순서만 다른 요청도 적중', ksh.h.get('X-QA-Cache')==='mem'&&cnt(/krx/)===ksc+2);
S.qs=()=>mk(500,'{"finance":{"error":"boom"}}');
const e1=await call('/summary?sym=ERR');
S.qs=null;
const e2=await call('/summary?sym=ERR');
ok('오류 응답(500)은 캐시되지 않는다', e1.status===500&&e2.status===200&&e2.h.get('X-QA-Cache')==='miss');
const rw=cnt(/krx/);
await call('/krxetf?diag=1'); await call('/krxetf?diag=1');
ok('diag는 캐시 우회(bypass)', (await call('/krxetf?diag=1')).h.get('X-QA-Cache')==='bypass');
// 엣지 단: caches.default 스텁 + 새 인스턴스(메모리 비움) → 'edge' 적중
const EDGE=new Map();
global.caches={default:{
  match:async req=>{ const v=EDGE.get(req.url); return v?new Response(v.body,{status:v.status,headers:v.headers}):undefined; },
  put:async(req,res)=>{ EDGE.set(req.url,{body:await res.text(),status:res.status,headers:Object.fromEntries(res.headers)}); }}};
W=await load();
const x1=await call('/summary?sym=MSFT');
const putK=[...EDGE.keys()][0]||'';
ok('엣지에 저장 · 키에 토큰 없음', EDGE.size===1&&!putK.includes(TOK.slice(0,20))&&/\/__qa_cache\//.test(putK), putK);
ok('엣지 저장본 Cache-Control max-age=3600', EDGE.size&&/max-age=3600/.test(EDGE.get(putK).headers['cache-control']||''));
W=await load();                                            // 새 isolate: 메모리 캐시 비어 있음
const x0=cnt(/quoteSummary|getcrumb|fc\.yahoo/);
const x2=await call('/summary?sym=MSFT');
ok('새 인스턴스 → edge 적중 · 상류 미호출', x2.h.get('X-QA-Cache')==='edge'&&cnt(/quoteSummary|getcrumb|fc\.yahoo/)===x0&&x2.b.sym==='MSFT');
ok('edge 적중 응답에 Cache-Control 노출 안 함', x2.h.get('Cache-Control')===null);
delete global.caches;

for(const f of TMP){ try{fs.unlinkSync(f);}catch(_){} }
console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);
})().catch(e=>{ console.error('SMOKE CRASH', e); for(const f of TMP){ try{fs.unlinkSync(f);}catch(_){} } process.exit(2); });

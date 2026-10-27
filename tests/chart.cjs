/* (v5.9.16) 상세 차트 — 250거래일 / 14거래일 두 장.
 * 배포본(dist/index.html)에서 drawChart를 그대로 떼어 **기록용 2D 컨텍스트**로 실행한다.
 * 그림을 눈으로 보는 대신 "무엇을 몇 번 그렸는가"를 센다.
 * 사용법: node tests/chart.cjs [dist/index.html] */
const fs=require('fs');
const HTML=process.argv[2]||__dirname+'/../dist/index.html';
const T=fs.readFileSync(HTML,'utf8'), L=T.split('\n');

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};

console.log('\n[1] 상세 패널이 캔버스 두 장을 낸다');
ok('250거래일 캔버스', /data-bars="250"/.test(T));
ok('14거래일 캔버스',  /data-bars="14"/.test(T));
ok('두 장에 이름표가 붙는다', /250거래일/.test(T)&&/14거래일/.test(T));
ok('14일 이름표가 매물대를 약속한다', /14일 매물대/.test(T));

console.log('\n[2] 호출부 — 한 장만 그리면 나머지가 빈 채로 남는다');
/* querySelector는 첫 캔버스만 집는다. 되돌아가면 14일 패널이 영영 비어 있고,
 * 빈 캔버스는 흰 사각형이라 "그려졌는데 데이터가 없나" 로 읽힌다 — 조용히 틀린다. */
ok("canvas[data-id] 조회가 querySelectorAll이다",
   !/querySelector\('canvas\[data-id=/.test(T)&&/querySelectorAll\('canvas\[data-id=/.test(T),
   (T.match(/querySelectorA?l?l?\('canvas\[data-id=/g)||[]).join(' , '));
ok('두 호출부 모두 forEach로 돈다', (T.match(/querySelectorAll\('canvas\[data-id="'\+CSS\.escape\(id\)\+'"\]'\)\.forEach/g)||[]).length===2,
   (T.match(/querySelectorAll\('canvas\[data-id=/g)||[]).length);

console.log('\n[3] CSS — 좁아지면 세로로 쌓인다 (뷰포트가 아니라 컨테이너 기준)');
const css=T.slice(0,T.lastIndexOf('</style>'));
const rule=n=>{const i=css.indexOf('.'+n+'{');return i<0?'':css.slice(i,css.indexOf('}',i));};
ok('.chartpair가 flex-wrap', /display:flex/.test(rule('chartpair'))&&/flex-wrap:wrap/.test(rule('chartpair')), rule('chartpair'));
ok('.chartbox는 격자 안에서 줄어들 수 있다(min-width:0)', /min-width:0/.test(rule('chartbox')), rule('chartbox'));
ok('long이 short보다 넓게 잡힌다(flex-basis)',
   /flex:3 1 360px/.test(rule('chartbox.long'))&&/flex:1 1 210px/.test(rule('chartbox.short')),
   rule('chartbox.long')+' / '+rule('chartbox.short'));
ok('뷰포트 미디어쿼리로 접지 않는다', !/@media[^{]*\{[^}]*\.chartpair/.test(css));

console.log('\n[4] 실제 렌더 — 기록용 컨텍스트로 돌려 센다');
const grab=p=>{const i=L.findIndex(x=>x.startsWith(p));if(i<0)throw new Error('못 찾음 '+p);
  let d=0,o=[];for(let j=i;j<L.length;j++){o.push(L[j]);
    for(const ch of L[j]){if(ch==='{')d++;else if(ch==='}')d--;}
    if(d===0&&o.length>1)break;} return o.join('\n');};
const src=['function volumeProfile(','function smaArr(','function stdArr(','function emaArr(','function fmtAxis(','function drawChart(cv,id){']
  .map(grab).join('\n');

function rec(){ const r={fillRect:0,arc:0,strokeCount:0,texts:[],moveX:[],dash:[],rects:[]};
  const ctx={ scale(){},clearRect(){},beginPath(){},closePath(){},save(){},restore(){},
    fill(){},stroke(){r.strokeCount++;},fillRect(x,y,w,hh){r.fillRect++;r.rects.push({x,y,w,h:hh});},
    translate(){},rotate(){},
    arc(){r.arc++;}, lineTo(x){r.moveX.push(x);}, moveTo(x){r.moveX.push(x);},
    setLineDash(d){r.dash.push(d);}, measureText(t){return {width:t.length*5};},
    fillText(t,x,y){r.texts.push({t:String(t),x,y});},
    set font(v){}, set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set globalAlpha(v){} };
  return {r,ctx}; }

const n=260,t=[],c=[],h=[],l=[];
let px=100,seed=7; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
const now=Math.floor(Date.now()/1000);
const v=[];
for(let i=0;i<n;i++){ px*=1+0.002+(rnd()-0.5)*0.02;
  t.push(now-(n-i)*86400); c.push(px); h.push(px*1.01); l.push(px*0.99);
  v.push(1e6*(0.5+rnd())); }

const id='X';
const S={cache:{[id]:{c,h,l,t,v,currency:'USD'}},
  calc:{[id]:{price:c[c.length-1],chg:1,currency:'USD',fv:c[c.length-1]*0.5,
    vp1:{lo:Math.min(...l),bw:(Math.max(...h)-Math.min(...l))/20,poc:c[c.length-1]*0.9,
         bins:Array.from({length:20},(_,b)=>b+1)}}},
  stocks:{[id]:{manual:{accum:(c[c.length-1]*0.55).toFixed(2),take:(c[c.length-1]*1.4).toFixed(2)}}},
  ui:{sim:{}}};
const window={devicePixelRatio:1};
const M=new Function('S','window',src+'\n;return {drawChart};')(S,window);

const run=(bars,W)=>{const {r,ctx}=rec();
  M.drawChart({dataset:{bars:String(bars)},clientWidth:W||600,clientHeight:280,
    getContext:()=>ctx,set width(v){},set height(v){}}, id); return r;};

const long=run(250,700), short=run(14,300);
ok('두 축 모두 무언가를 그린다', long.strokeCount>5&&short.strokeCount>5,
   long.strokeCount+' / '+short.strokeCount);
/* 창 길이: 250축은 월 이름표, 14축은 날짜(M/D) 이름표 */
ok('250축은 월로 눈금을 적는다', long.texts.some(x=>/^\d+월$/.test(x.t)), long.texts.map(x=>x.t).slice(0,12).join(','));
ok('14축은 날짜로 적는다 (월이 안 바뀌면 눈금이 하나도 없다)',
   short.texts.some(x=>/^\d+\/\d+$/.test(x.t)) && !short.texts.some(x=>/^\d+월$/.test(x.t)),
   short.texts.map(x=>x.t).join(','));
/* (v5.9.17) 두 축 모두 매물대를 그리되 **구간이 다르다.**
 * 1년짜리 vp1을 14축에 얹으면 읽는 사람이 같은 구간으로 읽는다 — 다시 계산해야 한다. */
ok('250축은 1년 매물대(vp1 20칸)를 그린다', long.fillRect===20, long.fillRect);
ok('14축은 자기 구간으로 다시 계산한다 (12칸)', short.fillRect===12, short.fillRect);
ok('14축 매물대가 그림 안에 들어온다',
   short.rects.length>0&&short.rects.every(q=>q.y>=10&&q.y<=258), JSON.stringify(short.rects.slice(0,2)));
{ /* vp1을 지워도 14축 매물대는 남아야 한다 — 남지 않으면 vp1을 베껴 쓰고 있다는 뜻이다. */
  const keep=S.calc[id].vp1; S.calc[id].vp1=null;
  const s2=run(14,300), l2=run(250,700);
  S.calc[id].vp1=keep;
  ok('vp1 없이도 14축 매물대는 그려진다', s2.fillRect===12, s2.fillRect);
  ok('vp1이 없으면 250축 매물대는 비운다 (지어내지 않는다)', l2.fillRect===0, l2.fillRect); }
{ /* 거래량이 없으면 그리지 않고, 이름표가 약속한 것을 없다고 적는다 */
  const kv=S.cache[id].v; S.cache[id].v=null;
  const s3=run(14,300); S.cache[id].v=kv;
  ok('거래량이 없으면 매물대를 지어내지 않는다', s3.fillRect===0, s3.fillRect);
  ok('없다는 사실을 적는다', s3.texts.some(x=>/거래량 없음/.test(x.t)), s3.texts.map(x=>x.t).join(',')); }
ok('14축은 일중 고저 막대를 그린다 (종가선만으로는 그날이 안 보인다)',
   short.strokeCount>long.strokeCount/3, short.strokeCount);

console.log('\n[5] 범위 밖 기준선 — 숨기지 않고, 겹치지도 않는다');
/* FV 0.5배·적립 0.55배·실현 1.4배로 두면 14일 창 밖이다. 셋 다 흔적이 남아야 하고
 * 아래 두 개(FV·적립)의 y가 같으면 포개져 둘 다 못 읽는다 — 실제로 그랬다. */
const oob=short.texts.filter(x=>/범위 밖/.test(x.t));
ok('범위 밖도 흔적을 남긴다 (§22-⑯)', oob.length>=3, oob.map(x=>x.t).join(' / '));
ok('방향을 ▲▼로 알린다', oob.every(x=>/^[▲▼] /.test(x.t)), oob.map(x=>x.t).join(' / '));
const ys=oob.map(x=>x.y);
ok('같은 자리에 겹쳐 찍지 않는다', new Set(ys).size===ys.length, JSON.stringify(oob.map(x=>[x.t,x.y])));
ok('250축에서는 범위 밖 표식을 쓰지 않는다 (기준선을 범위에 넣으므로)',
   !long.texts.some(x=>/범위 밖/.test(x.t)));
ok('250축은 기준선을 점선으로 긋는다', long.dash.length>=3, long.dash.length);

console.log('\n[5b] POC 이름표에 구간이 붙는다');
/* 같은 모양의 보라색 선이 한쪽은 1년, 한쪽은 14일을 뜻한다. 이름이 없으면 둘 다 안 읽힌다. */
ok('250축은 POC 1Y', long.texts.some(x=>x.t==='POC 1Y'), long.texts.map(x=>x.t).join(','));
ok('14축은 POC 14D', short.texts.some(x=>x.t==='POC 14D'), short.texts.map(x=>x.t).join(','));
ok('구간 없는 맨 POC는 쓰지 않는다', !long.texts.some(x=>x.t==='POC')&&!short.texts.some(x=>x.t==='POC'));

console.log('\n[6] 봉이 모자랄 때');
const few={c:c.slice(0,6),h:h.slice(0,6),l:l.slice(0,6),t:t.slice(0,6),currency:'USD'};
S.cache['Y']=few; S.calc['Y']={price:few.c[5],chg:0,currency:'USD'}; S.stocks['Y']={manual:{}};
const {r:rs,ctx:cs}=rec();
M.drawChart({dataset:{bars:'250'},clientWidth:600,clientHeight:280,getContext:()=>cs,set width(v){},set height(v){}},'Y');
ok('250축은 6봉으로 그리지 않고 이유를 적는다', rs.texts.some(x=>/이상 필요합니다/.test(x.t)), rs.texts.map(x=>x.t).join(','));
const {r:rs2,ctx:cs2}=rec();
M.drawChart({dataset:{bars:'14'},clientWidth:300,clientHeight:280,getContext:()=>cs2,set width(v){},set height(v){}},'Y');
ok('14축은 6봉이면 그린다 (문턱이 다르다)', !rs2.texts.some(x=>/이상 필요합니다/.test(x.t))&&rs2.strokeCount>3, rs2.strokeCount);

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);

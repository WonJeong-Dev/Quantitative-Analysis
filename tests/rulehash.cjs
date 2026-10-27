/* (v6.2) 판정 해시 가드 — **판정이 바뀌면 RULE_VER도 바뀌어야 한다.**
 *
 * 왜 있나: 종전 가드는 `compute`~`const GL_HORIZ=` 구간만 사람이 손으로 해시했다.
 * 그 밖에도 판정을 정하는 코드가 있었고(classifyDetail·fairValue·targetFresh …),
 * 실제로 v6.1은 **판정을 바꿨는데 해시가 그대로였다.** 가드가 일부만 보면,
 * 가드를 믿는 순간이 곧 놓치는 순간이다.
 *
 * 사용법: node tests/rulehash.cjs */
const {execFileSync}=require('child_process');
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('\n       '+x):'')));};

let cur=null,err=null;
try{ cur=JSON.parse(execFileSync(process.execPath,[path.join(ROOT,'scripts','rulehash.cjs'),'--list'],
  {encoding:'utf8',stdio:['ignore','pipe','pipe']})); }
catch(e){ err=String((e.stderr||'')+(e.message||'')).slice(0,300); }

console.log('\n[1] 가드가 돌아간다');
/* 돌지 않는 가드는 없는 가드보다 나쁘다 — 조용히 통과시키지 않는다. */
ok('rulehash가 실행된다 (acorn 필요 — npm install)', !!cur, err);
if(!cur){ console.log('\n'+pass+' passed · '+fail+' failed'); process.exit(1); }

const pin=JSON.parse(fs.readFileSync(path.join(ROOT,'docs','RULEHASH.json'),'utf8'));

console.log('\n[2] 판정 코드와 규칙 버전이 함께 움직인다');
ok('RULE_VER이 핀과 같다', cur.ruleVer===pin.ruleVer,
   '코드 '+cur.ruleVer+' / 핀 '+pin.ruleVer+'  → RULE_VER을 올렸다면 docs/RULEHASH.json도 갱신하세요.');
if(cur.hash!==pin.hash){
  const a=new Set(pin.functions||[]), b=new Set(cur.functions||[]);
  const added=[...b].filter(x=>!a.has(x)), gone=[...a].filter(x=>!b.has(x));
  ok('판정 코드 해시가 핀과 같다', false,
     '핀 '+pin.hash+' → 현재 '+cur.hash+'\n'
    +'       판정에 영향을 주는 코드가 바뀌었습니다.\n'
    +'       · 의도한 변경이면: RULE_VER을 올리고(로그가 섞이지 않도록) 아래를 실행하세요\n'
    +'           node scripts/rulehash.cjs --list > docs/RULEHASH.json\n'
    +'       · 의도하지 않았다면 되돌리세요.\n'
    +(added.length?('       새로 들어온 함수: '+added.join(', ')+'\n'):'')
    +(gone.length ?('       빠진 함수: '+gone.join(', ')+'\n'):'')
    +'       (같은 함수 목록인데 해시만 다르면 본문이 바뀐 것입니다)');
}else ok('판정 코드 해시가 핀과 같다', true);

console.log('\n[3] 가드의 범위가 좁아지거나 번지지 않았다');
const inside=n=>(cur.functions||[]).includes(n);
/* 좁아지면 놓치고, 번지면 거짓 경보로 무시된다. 양쪽을 다 고정한다. */
for(const n of ['compute','classifyDetail','fairValue','fundamentalFV','targetFresh','anaInfo',
                'staleTargetMul','blend','scoreUpsideRaw','volumeProfile','rsiLast','adxWilder',
                'MIN_MARGIN','DT_Z','MA_DEV_MIN','TGT_UNKNOWN_BASE','TGT_SPREAD_FLOOR','QW_DEF','AW_DEF'])
  ok('폐포 안: '+n, inside(n));
for(const n of ['verdictOf','cfvOf','drawChart','diagCollect','exHTML','evHTML','renderLedger','reviewOf'])
  ok('폐포 밖(표시 계층): '+n, !inside(n));

console.log('\n[4] 예외 목록은 늘리지 않는다');
/* 예외가 늘어나면 가드에 구멍이 늘어난다. 여기에 규칙을 넣으면 가드가 그 규칙을 못 본다. */
const src=fs.readFileSync(path.join(ROOT,'scripts','rulehash.cjs'),'utf8');
const ex=(src.match(/const EXCLUDE=new Set\(\[([^\]]*)\]\)/)||[,''])[1];
const exList=(ex.match(/'[^']*'/g)||[]).map(x=>x.slice(1,-1));
ok('예외는 S 하나뿐', exList.length===1&&exList[0]==='S', exList.join(', '));
ok('예외에 이유가 적혀 있다', /런타임 상태 그릇/.test(src));

console.log('\n[5] 핀 파일이 되돌리는 법을 적고 있다');
ok('갱신 명령이 적혀 있다', /rulehash\.cjs --list > docs\/RULEHASH\.json/.test(pin.주석||''));
ok('RULE_VER을 함께 올리라고 적혀 있다', /RULE_VER을 올리고/.test(pin.주석||''));

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);

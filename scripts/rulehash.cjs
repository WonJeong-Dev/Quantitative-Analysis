/* (v6.2) 판정 코드 해시 — **손으로 적는 목록이 아니라 호출을 따라간다.**
 *
 * 왜 바꾸나: 종전 가드는 `compute`~`const GL_HORIZ=` 구간만 해시했다. 그런데 판정을 정하는
 * 코드가 그 밖에도 있다 — `classifyDetail`(관문·등급) · `fairValue`(적정가) · `targetFresh` …
 * 실제로 v6.1은 **판정을 바꿨는데 해시가 그대로였다.** 가드가 일부만 보면, 가드를 믿는
 * 순간이 곧 놓치는 순간이다.
 *
 * 어떻게: 뿌리(compute · classifyDetail)에서 **진짜 파서(acorn)로** 의존 폐포를 구한다.
 * 새 헬퍼를 만들어 쓰면 목록을 고치지 않아도 자동으로 들어온다 —
 * 사람이 유지하는 포함 목록은 반드시 낡는다. 그게 종전 가드가 틀린 이유다.
 *
 * ★ 손으로 짠 렉서로 시도했다가 실패했다: 정규식 리터럴 안의 따옴표를 문자열 시작으로 읽어
 *   코드를 통째로 지웠고, compute가 파일 끝까지 늘어나 폐포가 153개로 번졌다.
 *   정규식과 나눗셈을 가르는 일은 파서의 일이다 — 가드를 추측 위에 세우지 않는다.
 *
 * 사용법: node scripts/rulehash.cjs [--list] [--why NAME] [파일] */
const fs=require('fs'),crypto=require('crypto'),path=require('path');
let acorn; try{ acorn=require('acorn'); }catch(e){
  console.error('acorn을 찾을 수 없습니다 — `npm install` 후 다시 실행하세요.\n'
    +'가드를 조용히 건너뛰지 않습니다: 돌지 않는 가드는 없는 가드보다 나쁩니다.');
  process.exit(3);
}
const args=process.argv.slice(2);
const LIST=args.includes('--list');
const wi=args.indexOf('--why'), WHY=wi>=0?args[wi+1]:null;
const FILE=args.filter((a,i)=>!a.startsWith('--')&&i!==wi+1)[0]||path.join(__dirname,'..','src','app.js');
const SRC=fs.readFileSync(FILE,'utf8');
const AST=acorn.parse(SRC,{ecmaVersion:2022,sourceType:'script'});

/* 최상위 선언만 모은다. 함수 안의 지역 선언은 그 함수 본문에 이미 포함된다. */
const decls=new Map();
for(const node of AST.body){
  if(node.type==='FunctionDeclaration'&&node.id) decls.set(node.id.name,node);
  else if(node.type==='VariableDeclaration')
    for(const d of node.declarations) if(d.id.type==='Identifier') decls.set(d.id.name,{...d,start:node.start,end:node.end});
}
/* 자유 식별자만 센다 — **지역에 묶인 이름은 의존이 아니다.**
 * 단순히 모든 Identifier를 세면 섀도잉에 걸린다: classifyDetail의 지역 `Q`(=k.quality)가
 * 최상위의 `Q`(조회 큐)를 끌어와 폐포에 들어왔다. 큐의 동시성 상수를 바꿀 때마다
 * 판정 해시가 흔들리면 가드가 거짓 경보를 내고, 거짓 경보는 곧 무시된다.
 *
 * 반대로 **덜 세는 쪽은 위험하다** — 놓친 변경이 곧 가드의 실패다. 그래서 '서브트리에
 * 한 번이라도 묶인 이름을 전부 빼는' 간편한 방법을 쓰지 않고, 스코프 사슬을 제대로 따라간다.
 * 속성 이름(a.compute)과 객체 키({compute:1})도 의존이 아니다. */
const FN=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
function bindPattern(p,add){
  if(!p)return;
  if(p.type==='Identifier')add(p.name);
  else if(p.type==='ObjectPattern')for(const x of p.properties)bindPattern(x.value||x.argument,add);
  else if(p.type==='ArrayPattern')for(const x of p.elements)bindPattern(x,add);
  else if(p.type==='AssignmentPattern')bindPattern(p.left,add);
  else if(p.type==='RestElement')bindPattern(p.argument,add);
}
/* 블록 안의 let/const/function과 함수 몸통의 var를 모은다. var는 함수 스코프로 끌어올린다. */
function hoist(body,scope,fnScope){
  const walkVar=(n)=>{ if(!n||typeof n!=='object')return;
    if(Array.isArray(n)){n.forEach(walkVar);return;}
    if(typeof n.type!=='string')return;
    if(FN.has(n.type))return;                       // 안쪽 함수의 var는 그쪽 몫
    if(n.type==='VariableDeclaration'&&n.kind==='var')
      for(const d of n.declarations)bindPattern(d.id,x=>fnScope.add(x));
    for(const k in n){if(k==='start'||k==='end')continue;walkVar(n[k]);} };
  for(const st of (Array.isArray(body)?body:[body])){
    if(!st)continue;
    if(st.type==='VariableDeclaration'&&st.kind!=='var')
      for(const d of st.declarations)bindPattern(d.id,x=>scope.add(x));
    if(st.type==='FunctionDeclaration'&&st.id)scope.add(st.id.name);
    if(st.type==='ClassDeclaration'&&st.id)scope.add(st.id.name);
    walkVar(st);
  }
}
function idsOf(root){
  const out=new Set();
  (function walk(n,scopes,fnScope,skip){
    if(!n||typeof n!=='object')return;
    if(Array.isArray(n)){for(const x of n)walk(x,scopes,fnScope,false);return;}
    if(typeof n.type!=='string')return;
    if(n.type==='Identifier'){
      if(skip)return;
      for(const s of scopes)if(s.has(n.name))return;   // 지역에 묶였다 → 의존 아님
      out.add(n.name); return;
    }
    if(n.type==='MemberExpression'){ walk(n.object,scopes,fnScope,false);
      walk(n.property,scopes,fnScope,!n.computed); return; }
    if(n.type==='Property'){ walk(n.key,scopes,fnScope,!n.computed);
      walk(n.value,scopes,fnScope,false); return; }
    if(FN.has(n.type)){
      const sc=new Set(); for(const p of n.params)bindPattern(p,x=>sc.add(x));
      if(n.id&&n.type!=='FunctionDeclaration')sc.add(n.id.name);
      if(n.body&&n.body.type==='BlockStatement')hoist(n.body.body,sc,sc);
      const next=[sc,...scopes];
      walk(n.body,next,sc,false); return;
    }
    if(n.type==='BlockStatement'){
      const sc=new Set(); hoist(n.body,sc,fnScope||sc);
      walk(n.body,[sc,...scopes],fnScope,false); return;
    }
    if(n.type==='CatchClause'){
      const sc=new Set(); bindPattern(n.param,x=>sc.add(x));
      walk(n.body,[sc,...scopes],fnScope,false); return;
    }
    for(const k in n){ if(k==='start'||k==='end'||k==='loc'||k==='range')continue;
      walk(n[k],scopes,fnScope,false); }
  })(root,[],null,false);
  return out;
}

const ROOTS=['compute','classifyDetail'];   // 판정 결과(k.tier·k.grd·점수 입력)를 만드는 두 함수
/* ★ 유일한 예외. S는 **런타임 상태 그릇**이지 규칙이 아니다 — 탭 기본값이나 캐시 모양을
 * 바꿨다고 판정이 달라지지는 않는데, 포함하면 그럴 때마다 가드가 거짓 경보를 낸다.
 * 판정에 쓰이는 기본 가중(QW_DEF·AW_DEF)은 compute가 **직접** 참조하므로 폐포에 그대로 있고,
 * 사용자가 바꾼 가중은 그림자 장부의 settingsKey가 따로 봉인한다.
 * 이 목록은 **늘리지 않는다** — tests/rulehash.cjs가 크기를 1로 고정한다.
 * 여기에 규칙을 넣으면 가드가 그 규칙을 못 본다. */
const EXCLUDE=new Set(['S']);
const missing=ROOTS.filter(r=>!decls.has(r));
if(missing.length){console.error('뿌리를 못 찾음: '+missing.join(', '));process.exit(2);}

const parent={}, seen=new Set(), q=[...ROOTS];
while(q.length){
  const n=q.shift();
  if(seen.has(n)||!decls.has(n))continue;
  seen.add(n);
  for(const id of idsOf(decls.get(n)))
    if(decls.has(id)&&!seen.has(id)&&!EXCLUDE.has(id)){ if(!parent[id])parent[id]=n; q.push(id); }
}
const names=[...seen].sort();
const slice=n=>SRC.slice(decls.get(n).start,decls.get(n).end);
const blob=names.map(n=>n+'\n'+slice(n)).join('\n\u0000\n');
const hash=crypto.createHash('sha256').update(blob,'utf8').digest('hex').slice(0,16);
const rv=(SRC.match(/const RULE_VER='([^']+)'/)||[])[1]||null;

if(WHY){ const c=[WHY]; while(parent[c[0]])c.unshift(parent[c[0]]);
  console.log(WHY+' | '+(seen.has(WHY)?c.join(' → '):'폐포 밖')); }
else if(LIST) console.log(JSON.stringify({hash,ruleVer:rv,count:names.length,functions:names},null,1));
else console.log(JSON.stringify({hash,ruleVer:rv,count:names.length,excluded:[...EXCLUDE]}));

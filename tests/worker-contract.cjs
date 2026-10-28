/* (v6.11) 앱 ↔ 워커 경로 계약.
 *
 * 왜 있는가. v6.9에서 `/dartequity`를 `/dartfin`으로 바꾸면서 **워커를 먼저 배포**했고,
 * 그 사이 앱 v6.9.0은 이미 없어진 경로를 불렀다 — 깨진 창이 한 판 동안 떠 있었다.
 * 그 사고는 네트워크 없이 **정적으로** 잡을 수 있다. 앱이 부르는 경로는 전부
 * `base+'/xxx...'` 꼴이고, 워커가 받는 경로는 전부 `pathname === '/xxx'` 꼴이기 때문이다.
 *
 * 두 가지를 본다.
 *   ① 앱이 부르는 경로 ⊆ 워커가 받는 경로   (오타·개명 즉시 적발)
 *   ② 핀에 적힌 경로가 사라지지 않았는가     (지우려면 별칭 한 판 또는 앱 먼저 배포)
 * 반대 방향(워커만 가진 경로)은 결함이 아니다 — /dart는 탐침, /health는 배포 확인용이다.
 *
 * 사용법: node tests/worker-contract.cjs */
const fs=require('node:fs'),path=require('node:path');
const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const APP=R('src/app.js'), WK=R('backend/cloudflare_worker.js'), PIN=JSON.parse(R('docs/WORKERHASH.json'));

let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log('  OK   '+n)):(fail++,console.log('  FAIL '+n+(x!==undefined?('  ← '+x):'')));};

/* 워커가 받는 경로 — pathname === '/xxx' */
const served=[...new Set([...WK.matchAll(/pathname\s*===\s*'(\/[a-z][a-z0-9-]*)'/g)].map(m=>m[1]))].sort();
/* 앱이 부르는 경로 — base+'/xxx' (쿼리·따옴표 앞까지) */
const called=[...new Set([...APP.matchAll(/base\s*\+\s*'(\/[a-z][a-z0-9-]*)/g)].map(m=>m[1]))].sort();

console.log('\n[1] 경로 집합을 실제로 뽑았는가');
ok('워커 경로를 찾았다 (3개 이상)', served.length>=3, served.join(' '));
ok('앱 호출 경로를 찾았다 (3개 이상)', called.length>=3, called.join(' '));
/* ★ 추출기가 죽으면 계약 검사가 조용히 통과한다 — 알려진 경로로 추출기 자체를 검사한다 */
ok('워커 경로에 /summary·/health 포함', served.includes('/summary')&&served.includes('/health'), served.join(' '));
ok('앱 호출에 /summary·/dartfin 포함', called.includes('/summary')&&called.includes('/dartfin'), called.join(' '));

console.log('\n[2] 앱이 부르는 경로는 워커가 모두 받는다');
const missing=called.filter(p=>!served.includes(p));
ok('없는 경로를 부르지 않는다', missing.length===0,
   missing.length?('워커에 없는 경로: '+missing.join(' ')+' — 개명이면 한 판 동안 별칭을 남기거나 앱을 **나중에** 배포하라'):undefined);

console.log('\n[3] 핀에 적힌 경로가 사라지지 않았다');
if(!Array.isArray(PIN.paths)){
  ok('핀에 paths가 있다', false, 'docs/WORKERHASH.json에 paths가 없다 — `node scripts/workerhash.cjs --write`로 찍어라');
}else{
  const dropped=PIN.paths.filter(p=>!served.includes(p));
  ok('핀의 경로가 모두 살아 있다', dropped.length===0,
     dropped.length?('사라진 경로: '+dropped.join(' ')+' — 지우려면 (가) 한 판 동안 별칭을 남기고 (나) 앱을 먼저 배포한 뒤 (다) 핀을 다시 찍어라'):undefined);
  const added=served.filter(p=>!PIN.paths.includes(p));
  ok('핀이 현재 워커와 일치한다 (새 경로는 핀을 다시 찍는다)', added.length===0,
     added.length?('핀에 없는 새 경로: '+added.join(' ')+' — `node scripts/workerhash.cjs --write`'):undefined);
}

console.log('\n[4] 워커 소스와 VER·핀이 함께 움직인다');
const wh=require('../scripts/workerhash.cjs');
ok('워커 VER이 핀과 같다', wh.ver===PIN.ver, wh.ver+' vs '+PIN.ver);
ok('워커 해시가 핀과 같다', wh.hash===PIN.hash, wh.hash+' vs '+PIN.hash);

console.log('\n────────────────────────────');
console.log(pass+' passed · '+fail+' failed');
process.exit(fail?1:0);

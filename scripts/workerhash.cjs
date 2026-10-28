/* (v7.1) 워커 소스 ↔ VER 핀.
 * /dart를 더하고도 VER을 그대로 둔 탓에 /health가 '7.0'을 돌려줘도 **그 7.0이 어느 7.0인지**
 * 알 수 없었다 — 배포 여부를 확인할 수 없는 상태였다. 앱의 판정 폐포 해시와 같은 장치를
 * 워커에도 둔다: 소스가 한 바이트라도 바뀌면 해시가 달라지고, 그러면 VER을 올리고 핀을
 * 다시 찍어야 한다. 그래야 /health가 '무엇이 떠 있는가'를 말할 수 있다.
 * 사용법: node scripts/workerhash.cjs          (현재 해시 출력)
 *        node scripts/workerhash.cjs --write  (docs/WORKERHASH.json 갱신) */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const SRC=path.join(__dirname,'..','backend','cloudflare_worker.js');
const PIN=path.join(__dirname,'..','docs','WORKERHASH.json');
const src=fs.readFileSync(SRC,'utf8');
const ver=(src.match(/const VER = '([^']+)'/)||[])[1]||null;
const hash=crypto.createHash('sha256').update(src,'utf8').digest('hex').slice(0,16);
/* (v6.11) 받는 경로도 함께 찍는다 — 경로가 사라졌는지를 네트워크 없이 보려면 기준이 필요하다.
 * tests/worker-contract.cjs 가 이 목록과 현재 소스를 대조한다. */
const paths=[...new Set([...src.matchAll(/pathname\s*===\s*'(\/[a-z][a-z0-9-]*)'/g)].map(m=>m[1]))].sort();
const out={주석:'워커 소스가 바뀌면 VER을 올리고 `node scripts/workerhash.cjs --write`로 다시 찍는다. '
  +'paths는 워커가 받는 경로 — 경로를 지우려면 한 판 동안 별칭을 남기거나 앱을 먼저 배포한 뒤 다시 찍는다',ver,hash,paths};
if(process.argv.includes('--write')){ fs.writeFileSync(PIN,JSON.stringify(out,null,2)+'\n'); console.log('wrote '+PIN); }
console.log(JSON.stringify({ver,hash,paths}));
module.exports={ver,hash,paths,PIN,SRC};

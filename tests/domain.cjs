const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../src/domain.js');
const t=(x={})=>({date:'2026-08-03',market:'KR',type:'stock',code:'000001',name:'Example',account:'general',side:'buy',price:100,qty:10,...x});
test('units: percent and ratio normalize identically without threshold discontinuity',()=>{
 assert.equal(D.debtRatio({de:80,deUnit:'percent'},{}),.8);assert.equal(D.debtRatio({de:.8,deUnit:'ratio'},{}),.8);
 assert.equal(D.debtRatio(null,{de:5}),.05);assert.equal(D.debtRatio(null,{de:5.01}),.0501);
 assert.equal(D.debtRatio({de:.8},{}),null);assert.equal(D.debtRatio(null,{deRatio:.8,de:500}),.8);
});
test('identity: same code renames combine; same name distinct codes remain separate',()=>{
 assert.equal(D.positions([t(),t({name:'Renamed'})],()=>1).length,1);
 assert.equal(D.positions([t(),t({code:'000002'})],()=>1).length,2);
 assert.equal(D.positions([t(),t({account:'general:other'})],()=>1).length,2);
});
test('chronological moving average respects explicit intraday sequence',()=>{
 const [p]=D.positions([t({date:'2026-08-02'}),t({side:'sell',price:200,sequence:1}),t({price:300,sequence:2})],()=>1);
 assert.equal(p.realized,1000);assert.equal(p.cost,3000);assert.equal(p.qty,10);assert.ok(p.valid);
});
test('unknown or duplicate intraday order cannot produce confirmed P&L',()=>{
 for(const rows of [[t(),t({side:'sell'})],[t({sequence:1}),t({side:'sell',sequence:1})]]){
 const [p]=D.positions(rows,()=>1);assert.equal(p.valid,false);assert.equal(p.realized,null);assert.equal(p.cost,null);}
});
test('oversell retains deficit and excludes uncertain monetary values',()=>{
 const [p]=D.positions([t(),t({date:'2026-08-04',side:'sell',qty:15,price:200})],()=>1);
 assert.equal(p.qty,-5);assert.ok(p.over);assert.equal(p.realized,null);assert.equal(p.valid,false);
});
test('split adjustment conserves cash cost',()=>{
 const [p]=D.positions([t()],()=>2);assert.equal(p.qty,20);assert.equal(p.cost,1000);
});
test('import preserves account separation, offers repeat fills, rejects wrong units',()=>{
 const plan=D.importPlan([t({account:'isa'}),t(),t({price:'1e309'})],[t()]);
 assert.equal(plan.add.length,1);assert.equal(plan.candidates.length,1);assert.equal(plan.invalid.length,1);
});
test('import source IDs are scoped by account and are idempotent',()=>{
 const p=D.importPlan([t({sourceId:'123'}),t({sourceId:'123',account:'isa'})],[t({sourceId:'123'})]);
 assert.equal(p.duplicate.length,1);assert.equal(p.add.length,1);
});
test('import validates actual dates, side and market rather than inventing defaults',()=>{
 const p=D.importPlan([t({date:'2026-02-30'}),t({side:'unknown'}),t({market:'??'})],[]);assert.equal(p.invalid.length,3);
});
test('historical snapshots are not treated as observed decisions',()=>{
 const [p]=D.positions([t({snap:{tier:'상'}})],()=>1);assert.equal(p.snap,null);assert.ok(p.snapshotIncomplete);
});
test('forward returns enter after observation and never at a future same-day close',()=>{
 const times=['2026-07-31T13:30:00Z','2026-08-03T13:30:00Z','2026-08-04T13:30:00Z'].map(x=>Date.parse(x)/1000);
 const c={t:times,o:[90,100,120],c:[95,110,125]};
 const r=D.forward(c,Date.parse('2026-08-03T01:00:00Z'),1,Date.parse('2026-08-10'));
 assert.equal(r.entryAt,times[1]);assert.ok(Math.abs(r.value-10)<1e-8);
 assert.equal(D.forward(c,Date.parse('2026-08-03T01:00:00Z'),1,Date.parse('2026-08-03T18:00:00Z')),null);
 assert.equal(D.forward({...c,o:null},Date.parse('2026-08-03'),1),null);
});
test('settings provenance deterministic across property ordering',()=>{
 assert.equal(D.settingsKey({a:1,b:{c:2,d:3}}),D.settingsKey({b:{d:3,c:2},a:1}));
 assert.notEqual(D.settingsKey({a:1}),D.settingsKey({a:2}));
});
test('backup rejects arbitrary collections, traversal and duplicate IDs',()=>{
 const b=collections=>({format:'qa-board-backup',version:1,collections});
 assert.equal(D.validateBackup(b({qa_trades:[{id:'a',data:t()}]})),1);
 assert.throws(()=>D.validateBackup(b({other:[]})));
 assert.throws(()=>D.validateBackup(b({qa_trades:[{id:'../x',data:{}}]})));
 assert.throws(()=>D.validateBackup(b({qa_trades:[{id:'a',data:{}},{id:'a',data:{}}]})));
});

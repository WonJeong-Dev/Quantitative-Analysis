const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const script of ['scripts/build.cjs','tests/domain.cjs','tests/investment.cjs','tests/integration.cjs','tests/worker.cjs','tests/worker-security.cjs','tests/criteria-v55.cjs','tests/shadow.cjs','tests/shadow-ui.cjs','tests/consfv.cjs','tests/consfv-ui.cjs','tests/possize.cjs','tests/possize-ui.cjs','tests/diagnostics-smoke.cjs','tests/worker-summary-smoke.cjs']){
 const r=spawnSync(process.execPath,[path.join(__dirname,'..',script)],{stdio:'inherit'});
 if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
}
console.log('All offline verification suites passed. Browser and Firebase emulator checks are separate.');

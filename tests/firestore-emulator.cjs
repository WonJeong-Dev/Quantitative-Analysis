// Requires a running local Firestore emulator plus firebase and @firebase/rules-unit-testing.
// This suite never falls back to production.
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp}=require('firebase/firestore');const fs=require('node:fs'),path=require('node:path');
(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST||!/^127\.0\.0\.1:|^localhost:/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('Local emulator required');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-qa-board',firestore:{host,port:+port,rules:fs.readFileSync(path.join(__dirname,'../backend/firestore.rules'),'utf8')}});
 const claims=email=>({email,email_verified:true,firebase:{sign_in_provider:'google.com'}});
 try{
  const a=env.authenticatedContext('A',claims('ALLOWED_EMAIL_1@example.com')).firestore();
  const b=env.authenticatedContext('B',claims('ALLOWED_EMAIL_2@example.com')).firestore();
  const anon=env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(a,'users/A/qa_trades/example'),{qty:1}));
  await assertSucceeds(setDoc(doc(b,'users/B/qa_trades/example'),{qty:1}));
  await assertFails(getDoc(doc(b,'users/A/qa_trades/example')));
  await assertFails(setDoc(doc(b,'users/A/qa_trades/example'),{qty:2}));
  await assertFails(getDoc(doc(anon,'users/A/qa_trades/example')));
  await assertFails(setDoc(doc(a,'qa_trades/oldroot'),{qty:1}));
  const unverified=env.authenticatedContext('A',{...claims('ALLOWED_EMAIL_1@example.com'),email_verified:false}).firestore();
  await assertFails(getDoc(doc(unverified,'users/A/qa_trades/example')));
  /* (v5.5) 판정 로그 불변성 · 사전 고정 검증 보관본 */
  const kst=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  const old='2026-01-02';
  const log=d=>({schema:2,d,at:Date.now(),sat:serverTimestamp(),rv:'v5.5',cols:['tier'],rows:{X:['상']}});
  await assertSucceeds(setDoc(doc(a,'users/A/qa_gradelog/v55_'+kst),log(kst)));
  await assertFails(setDoc(doc(a,'users/A/qa_gradelog/v55_'+old),log(old)));                         // 백데이팅
  await assertFails(setDoc(doc(a,'users/A/qa_gradelog/v55_x'+kst),log(kst)));                        // id 형식
  await assertFails(setDoc(doc(a,'users/A/qa_gradelog/v55_'+kst+'b'),{...log(kst),sat:new Date()})); // 클라이언트 시각
  await assertSucceeds(setDoc(doc(a,'users/A/qa_gradelog/v55_'+kst),{fwd:{X:{r20:1}}},{merge:true}));
  await assertFails(updateDoc(doc(a,'users/A/qa_gradelog/v55_'+kst),{rows:{X:['하']}}));              // 판정 수정
  await assertFails(deleteDoc(doc(a,'users/A/qa_gradelog/v55_'+kst)));
  await assertFails(getDoc(doc(b,'users/A/qa_gradelog/v55_'+kst)));
  await assertSucceeds(setDoc(doc(a,'users/A/qa_prereg/p1'),{id:'p1',at:1,rows:[],outcomes:{}}));
  await assertFails(setDoc(doc(a,'users/A/qa_prereg/p1'),{id:'p1',at:2,rows:[],outcomes:{}}));
  await assertFails(deleteDoc(doc(a,'users/A/qa_prereg/p1')));
  await assertSucceeds(setDoc(doc(a,'users/A/qa_settings/global'),{investmentPlans:[]},{merge:true}));
  console.log('PASS 19 Firestore rule assertions');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});

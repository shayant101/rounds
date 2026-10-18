const assert=require('assert'); const path=require('path').join(__dirname,'..','server','voice.js');
(async()=>{
  let v=require(path);
  // no keys
  delete process.env.ASSEMBLYAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await v.token()).body.configured,false); assert.equal((await v.understand({text:'hola'})).body.configured,false);
  assert.equal((await v.understand({text:''})).status,400);
  // token with mocked AssemblyAI
  process.env.ASSEMBLYAI_API_KEY='k'; let seen;
  global.fetch=async(u,o)=>{ seen={u:String(u),o}; return {ok:true,json:async()=>({token:'tmp123'})}; };
  let r=await v.token(); assert.equal(r.status,200); assert.equal(r.body.token,'tmp123'); assert.match(seen.u,/v3\/token\?expires_in_seconds=60&max_session_duration_seconds=60/); assert.equal(seen.o.headers.Authorization,'k');
  global.fetch=async()=>({ok:false,status:401,json:async()=>({error:'bad key'})}); assert.equal((await v.token()).status,502);
  // understand with mocked Claude
  process.env.ANTHROPIC_API_KEY='c'; const clients=[{id:'robert',name:'Robert',room:'4'},{id:'dolores',name:'Dolores',room:'7'}];
  const reply=obj=>async(u,o)=>{ seen={u,body:JSON.parse(o.body)}; return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify(obj)}]})}; };
  global.fetch=reply({kind:'vital',clientId:'robert',vital:'bp',value:'120/80'});
  r=await v.understand({text:'presión 120 sobre 80 para Roberto',clients}); assert.equal(r.body.action.kind,'vital'); assert.equal(seen.body.model,'claude-haiku-5-5');
  global.fetch=reply({kind:'vital',clientId:'robert',vital:'bp',value:'130/80'});
  r=await v.understand({text:'presión 120 sobre 80 para Roberto',clients}); assert.equal(r.body.action.kind,'unsure','invented number must be rejected');
  global.fetch=reply({kind:'pass',clientId:'ghost',status:'took'});
  r=await v.understand({text:'se tomó sus medicinas',clients}); assert.equal(r.body.action.clientId,null,'unknown client dropped');
  global.fetch=reply({kind:'delete_everything'}); r=await v.understand({text:'x',clients}); assert.equal(r.body.action.kind,'unsure');
  global.fetch=async()=>({ok:true,json:async()=>({content:[{type:'text',text:'Sure! ```json\n{"kind":"flag","clientId":"dolores","flag":"doctor"}\n```'}]})});
  r=await v.understand({text:'que la vea el médico, Dolores',clients}); assert.equal(r.body.action.flag,'doctor');
  // model fallback on 404
  let calls=[]; global.fetch=async(u,o)=>{ const m=JSON.parse(o.body).model; calls.push(m); if(m==='claude-haiku-5-5') return {ok:false,status:404,json:async()=>({error:{message:'model not found'}})}; return {ok:true,json:async()=>({content:[{text:'{"kind":"handoff"}'}]})}; };
  r=await v.understand({text:'entrega de turno',clients}); assert.deepEqual(calls,['claude-haiku-5-5','claude-sonnet-5-5']); assert.equal(r.body.action.kind,'handoff');
  console.log('unit: all passed');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});

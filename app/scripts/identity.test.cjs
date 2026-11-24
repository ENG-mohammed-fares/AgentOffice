const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createProvider} = require('../electron/identity.cjs');
const config = {origin:'https://example.supabase.co',key:'sb_publishable_fixture'};
const reply = (value,status=200) => new Response(JSON.stringify(value),{status});

test('unconfigured identity never sends email or launches Google',async()=>{
  const offline=createProvider(null);
  await assert.rejects(offline.sendCode('person@example.test'),/not configured/);
  await assert.rejects(offline.google(),/not configured/);
  await assert.rejects(offline.github(),/not configured/);
});
test('email OTP verifies the same confirmed address',async t=>{
  let email='person@example.test';
  t.mock.method(global,'fetch',async(url,opts)=>{
    assert.equal(opts.headers.apikey,config.key);
    const body=JSON.parse(opts.body);
    if(url.endsWith('/otp')){assert.deepEqual(body,{email,create_user:true});return reply({})}
    assert.ok(url.endsWith('/verify'));assert.equal(body.type,'email');
    if(body.token!=='123456')return reply({},403);
    return reply({access_token:'temporary',user:{email,email_confirmed_at:'2026-01-01'}});
  });
  const provider=createProvider(config);
  await provider.sendCode(email);await provider.verifyCode(email,'123456');
  await assert.rejects(provider.verifyCode(email,'000000'),/expired/);
  await assert.rejects(provider.verifyCode('different@example.test','123456'),/expired/);
});
test('system-browser callback and PKCE exchange use the same verifier',async t=>{
  const realFetch=global.fetch;let challenge='';
  t.mock.method(global,'fetch',async(url,opts)=>{
    if(url.endsWith('/token?grant_type=pkce')){
      const {code_verifier,auth_code}=JSON.parse(opts.body);
      assert.equal(auth_code,'test-code');assert.equal(crypto.createHash('sha256').update(code_verifier).digest('base64url'),challenge);
      return reply({access_token:'for-this-test'});
    }
    assert.ok(url.endsWith('/user'));assert.equal(opts.headers.Authorization,'Bearer for-this-test');
    return reply({identities:[{provider:'google',identity_data:{sub:'123',email:'person@example.test',email_verified:true,name:'Tester'}}]});
  });
  const provider=createProvider(config,async address=>{
    const auth=new URL(address);assert.equal(auth.origin,config.origin);
    assert.equal(auth.searchParams.get('provider'),'google');challenge=auth.searchParams.get('code_challenge');
    const callback=new URL(auth.searchParams.get('redirect_to'));
    assert.equal(callback.hostname,'127.0.0.1');
    const wrong=new URL('/other',callback);assert.equal((await realFetch(wrong)).status,404);
    callback.searchParams.set('code','test-code');assert.equal((await realFetch(callback)).status,200);
  });
  const user=await provider.google();assert.match(user.id,/^google:[a-f0-9]{64}$/);
  assert.equal(user.name,'Tester');
});

test('GitHub PKCE uses minimal scope and a separate verified identity',async t=>{
  const realFetch=global.fetch;let challenge='';
  t.mock.method(global,'fetch',async(url,opts)=>{
    if(url.endsWith('/token?grant_type=pkce')){
      const {auth_code,code_verifier}=JSON.parse(opts.body);
      assert.equal(auth_code,'github-code');assert.equal(crypto.createHash('sha256').update(code_verifier).digest('base64url'),challenge);
      return reply({access_token:'fixture'});
    }
    assert.ok(url.endsWith('/user'));assert.equal(opts.headers.Authorization,'Bearer fixture');
    return reply({email:'dev@example.test',email_confirmed_at:'2026-01-01',identities:[{provider:'github',id:'123',identity_data:{sub:'123',email:'dev@example.test',user_name:'Developer'}}]});
  });
  const provider=createProvider(config,async address=>{
    const url=new URL(address);assert.equal(url.searchParams.get('provider'),'github');assert.equal(url.searchParams.get('scopes'),'user:email');
    challenge=url.searchParams.get('code_challenge');const cb=new URL(url.searchParams.get('redirect_to'));
    assert.equal(cb.hostname,'127.0.0.1');assert.match(cb.pathname,/^\/agentoffice\/github\/[a-f0-9]{48}$/);
    cb.searchParams.set('code','github-code');assert.equal((await realFetch(cb)).status,200);
  });
  const user=await provider.github();assert.match(user.id,/^github:[a-f0-9]{64}$/);assert.equal(user.name,'Developer');
});

test('automatic update policy only restarts a safe idle sign-in screen',()=>{
  const {mayAutoRestart}=require('../electron/update-policy.cjs');
  const base={ready:true,configured:true,installing:false,authSafe:true,idleSeconds:120,readySeconds:15};
  assert.equal(mayAutoRestart(base),true);
  for(const override of [{ready:false},{configured:false},{installing:true},{authSafe:false},{idleSeconds:119},{idleSeconds:NaN},{readySeconds:14},{readySeconds:Infinity}]) assert.equal(mayAutoRestart({...base,...override}),false);
});

test('startup gate waits for a verified download and installs before opening',()=>{
  const {createStartupGate}=require('../electron/startup-update.cjs');
  let timer=null,delay=0,opens=[],installs=0;
  const gate=createStartupGate({open:r=>opens.push(r),install:()=>{installs++;return true},
    setTimer:(fn,ms)=>{timer=fn;delay=ms;return 1},clearTimer:()=>{timer=null}});
  assert.equal(delay,20000);
  gate.status('available');assert.equal(delay,300000);
  gate.status('downloading');assert.equal(opens.length,0);
  gate.status('ready');gate.status('ready');
  assert.equal(installs,1);assert.equal(opens.length,0);assert.equal(timer,null);
  assert.equal(gate.phase,'installing');
});
test('startup gate opens installed version on no update, errors, timeout or installation failure',()=>{
  const {createStartupGate}=require('../electron/startup-update.cjs');
  for(const [events,expected] of [
    [['current'],'current'],[['error'],'error'],[['timeout'],'check-timeout'],
    [['available','timeout'],'download-timeout'],[['available','error'],'error'],
    [['ready'],'install-failed']
  ]){
    let timer=null,opens=[],installs=0;
    const gate=createStartupGate({open:r=>opens.push(r),install:()=>{installs++;return false},
      setTimer:fn=>{timer=fn;return 1},clearTimer:()=>{timer=null}});
    for(const event of events)event==='timeout'?timer():gate.status(event);
    gate.status('ready');assert.deepEqual(opens,[expected]);
    assert.equal(installs,events.includes('ready')?1:0);assert.equal(gate.phase,'done');
  }
});
test('startup gate handles asynchronous installer errors and cancellation',()=>{
  const {createStartupGate}=require('../electron/startup-update.cjs');
  const opens=[];let timer=null;
  const options={open:r=>opens.push(r),install:()=>true,setTimer:fn=>{timer=fn;return 1},clearTimer:()=>{timer=null}};
  const gate=createStartupGate(options);gate.status('ready');gate.status('error');
  assert.deepEqual(opens,['error']);
  const canceled=createStartupGate(options);canceled.cancel();canceled.status('ready');
  assert.equal(timer,null);assert.deepEqual(opens,['error']);
});

test('explicit update installation is always silent and relaunches automatically',()=>{
  const {installSilently}=require('../electron/update-policy.cjs');
  const calls=[];const updater={quitAndInstall:(...args)=>calls.push(args)};
  installSilently(updater);installSilently(updater,false);
  assert.deepEqual(calls,[[true,true],[true,false]]);
});

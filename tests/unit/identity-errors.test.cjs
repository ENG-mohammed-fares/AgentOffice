'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createProvider,configuration}=require('../../app/electron/identity.cjs');
const {deferred}=require('../mocks/auth-fixture.cjs');
const config={origin:'https://example.supabase.co',key:'sb_publishable_fixture'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('configuration rejects non-HTTPS, non-Supabase hosts, paths and secret keys',t=>{
 const oldUrl=process.env.AGENTOFFICE_SUPABASE_URL,oldKey=process.env.AGENTOFFICE_SUPABASE_PUBLISHABLE_KEY;
 t.after(()=>{for(const [key,value] of [['AGENTOFFICE_SUPABASE_URL',oldUrl],['AGENTOFFICE_SUPABASE_PUBLISHABLE_KEY',oldKey]]){if(value===undefined)delete process.env[key];else process.env[key]=value}});
 process.env.AGENTOFFICE_SUPABASE_PUBLISHABLE_KEY=config.key;
 for(const url of ['http://example.supabase.co','https://example.com','https://example.supabase.co/path','https://user:pass@example.supabase.co','https://example.supabase.co/?secret=1','invalid']){process.env.AGENTOFFICE_SUPABASE_URL=url;assert.equal(configuration(),null)}
 process.env.AGENTOFFICE_SUPABASE_URL=config.origin;assert.deepEqual(configuration(),config);
 process.env.AGENTOFFICE_SUPABASE_PUBLISHABLE_KEY='sb_secret_fixture';assert.equal(configuration(),null);
});
test('identity API maps rate limits and network failures without leaking raw server responses',async t=>{
 const provider=createProvider(config);const fn=t.mock.method(global,'fetch',async()=>reply({secret:'not for UI'},429));
 await assert.rejects(provider.sendCode('qa@example.test'),/^Error: Too many attempts$/);
 fn.mock.mockImplementation(async()=>{throw Error('private transport detail')});
 await assert.rejects(provider.sendCode('qa@example.test'),/^Error: Identity service unavailable$/);
 fn.mock.mockImplementation(async()=>reply({secret:'not for UI'},500));
 await assert.rejects(provider.sendCode('qa@example.test'),/^Error: Identity service unavailable$/);
});
test('OAuth stays locked during token exchange and late canceled tokens are discarded',async t=>{
 const realFetch=global.fetch,exchange=deferred(),started=deferred();
 t.mock.method(global,'fetch',async(url)=>{
   if(String(url).includes('/token?')){started.resolve();return exchange.promise}
   throw Error('Canceled flow must not fetch user');
 });
 const provider=createProvider(config,async address=>{
   const cb=new URL(new URL(address).searchParams.get('redirect_to'));cb.searchParams.set('code','fixture');
   assert.equal((await realFetch(cb)).status,200);
 });
 const login=provider.google(),failure=assert.rejects(login,/canceled/);
 await started.promise;await assert.rejects(provider.github(),/already open/);
 provider.cancelGoogle();exchange.resolve(reply({access_token:'discard-this-fixture'}));await failure;
});
test('browser failure does not lock future OAuth attempts',async()=>{
 const provider=createProvider(config,async()=>{throw Error('browser unavailable')});
 await assert.rejects(provider.google(),/sign-in unavailable/);await assert.rejects(provider.github(),/sign-in unavailable/);
});

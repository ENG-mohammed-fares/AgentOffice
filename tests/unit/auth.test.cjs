'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {authFixture,deferred}=require('../mocks/auth-fixture.cjs');
const credentials={name:'QA User',email:'qa@example.test',password:'test-password-123'};
test('local account validates input, normalizes email and stores a salted hash only',async t=>{
 const f=await authFixture(t);
 for(const [payload,error] of [[{...credentials,name:'x'},/Name/],[{...credentials,email:'bad'},/valid email/],[{...credentials,password:'short'},/Password/]]) await assert.rejects(f.invoke('signup',payload),error);
 const user=await f.invoke('signup',{...credentials,email:' QA@EXAMPLE.TEST '});
 assert.equal(user.email,credentials.email);assert.equal(user.guest,false);assert.equal(user.digest,undefined);
 const raw=await fs.readFile(f.file,'utf8'),stored=JSON.parse(raw).accounts[0];
 assert.match(stored.salt,/^[a-f0-9]{48}$/);assert.match(stored.digest,/^[a-f0-9]{128}$/);assert.ok(!raw.includes(credentials.password));
 assert.deepEqual(await f.invoke('current'),user);assert.equal(f.safety.canAutoRestart(),false);
 await f.invoke('logout');assert.equal(await f.invoke('current'),null);assert.equal(f.safety.canAutoRestart(),true);
 await assert.rejects(f.invoke('signin',{...credentials,password:'incorrect-password'}),/Incorrect/);
 assert.deepEqual(await f.invoke('signin',credentials),user);
});
test('parallel duplicate signups are serialized and cannot corrupt accounts',async t=>{
 const f=await authFixture(t);const results=await Promise.allSettled([f.invoke('signup',credentials),f.invoke('signup',credentials)]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/already open/);
 await assert.rejects(f.invoke('signup',credentials),/already exists/);
 assert.equal(JSON.parse(await fs.readFile(f.file,'utf8')).accounts.length,1);
});
test('duplicate authentication requests cannot supersede a valid in-flight attempt',async t=>{
 const p=deferred(),started=deferred();
 const f=await authFixture(t,{google:()=>{started.resolve();return p.promise}});
 const login=f.invoke('google');await started.promise;
 await assert.rejects(f.invoke('github'),/already open/);
 await assert.rejects(f.invoke('signup',credentials),/already open/);
 p.resolve({id:'google:first',guest:false});assert.equal((await login).id,'google:first');
 assert.equal((await f.invoke('current')).id,'google:first');
 await f.invoke('logout');await f.invoke('signup',credentials);await f.invoke('logout');
 await f.invoke('signup',{...credentials,email:'second@example.test'});
 assert.equal(JSON.parse(await fs.readFile(f.file,'utf8')).accounts.length,2);
});
test('invalid and unknown login do not establish session; rate limit expires',async t=>{
 const f=await authFixture(t);await f.invoke('signup',credentials);await f.invoke('logout');
 await assert.rejects(f.invoke('signin',{email:'bad',password:'x'}),/Incorrect/);
 await assert.rejects(f.invoke('signin',{...credentials,email:'unknown@example.test'}),/Incorrect/);
 for(let i=0;i<7;i++)await assert.rejects(f.invoke('signin',{...credentials,password:'wrong-password-123'}),/Incorrect/);
 await assert.rejects(f.invoke('signin',credentials),/Too many attempts/);
 f.advance(120001);assert.equal((await f.invoke('signin',credentials)).email,credentials.email);
});
test('password recovery validates address, cooldown, OTP, grant and one-time use',async t=>{
 const f=await authFixture(t);await f.invoke('signup',credentials);await f.invoke('logout');
 await assert.rejects(f.invoke('request-code',{email:'bad'}),/valid email/);
 await f.invoke('request-code',{email:'unknown@example.test'});
 assert.equal(f.calls.filter(c=>c[0]==='send').length,0);
 await assert.rejects(f.invoke('verify-code',{email:'unknown@example.test',code:'123456'}),/Invalid/);
 await f.invoke('request-code',{email:credentials.email});assert.equal(f.safety.canAutoRestart(),false);
 await assert.rejects(f.invoke('request-code',{email:credentials.email}),/Too many/);
 await assert.rejects(f.invoke('verify-code',{email:credentials.email,code:'abc'}),/Invalid/);
 await assert.rejects(f.invoke('verify-code',{email:'wrong@example.test',code:'123456'}),/Invalid/);
 await assert.rejects(f.invoke('verify-code',{email:credentials.email,code:'000000'}),/Invalid/);
 const grant=await f.invoke('verify-code',{email:credentials.email,code:'123456'});assert.match(grant,/^[a-f0-9]{64}$/);
 await assert.rejects(f.invoke('verify-code',{email:credentials.email,code:'123456'}),/Invalid/);
 await assert.rejects(f.invoke('reset-password',{grant:'wrong',password:'new-password-123'}),/Invalid/);
 await assert.rejects(f.invoke('reset-password',{grant,password:'short'}),/Password/);
 await f.invoke('reset-password',{grant,password:'new-password-123'});
 await assert.rejects(f.invoke('reset-password',{grant,password:'another-password-123'}),/Invalid/);
 await assert.rejects(f.invoke('signin',credentials),/Incorrect/);
 assert.equal((await f.invoke('signin',{...credentials,password:'new-password-123'})).email,credentials.email);
});
test('recovery expiry and provider failure do not leave restart blocked',async t=>{
 const f=await authFixture(t,{async sendCode(){throw Error('offline')}});
 await f.invoke('signup',credentials);await f.invoke('logout');
 await assert.rejects(f.invoke('request-code',{email:credentials.email}),/offline/);assert.equal(f.safety.canAutoRestart(),true);
 f.provider.sendCode=async()=>{};await f.invoke('request-code',{email:credentials.email});f.advance(600001);
 await assert.rejects(f.invoke('verify-code',{email:credentials.email,code:'123456'}),/Invalid/);assert.equal(f.safety.canAutoRestart(),true);
 await f.invoke('request-code',{email:credentials.email});const grant=await f.invoke('verify-code',{email:credentials.email,code:'123456'});f.advance(300001);
 await assert.rejects(f.invoke('reset-password',{grant,password:'new-password-123'}),/Invalid/);
});
test('unconfigured provider, guest and GitHub sessions are isolated',async t=>{
 const f=await authFixture(t,{configured:false});assert.equal(await f.invoke('identity-status'),false);
 await assert.rejects(f.invoke('request-code',{email:credentials.email}),/not configured/);
 const guest=await f.invoke('guest');assert.equal(guest.guest,true);await f.invoke('logout');
 const second=await authFixture(t);await second.invoke('github');assert.equal((await second.invoke('current')).id,'github:fixture');assert.equal(await f.invoke('current'),null);
});
test('late OAuth result cannot resurrect a logged-out or canceled session',async t=>{
 const pending=deferred(),started=deferred();
 const f=await authFixture(t,{google:()=>{started.resolve();return pending.promise}});
 const login=f.invoke('google');const rejected=assert.rejects(login,/superseded/);await started.promise;
 assert.equal(f.safety.canAutoRestart(),false);await f.invoke('logout');
 pending.resolve({id:'google:late',guest:false});await rejected;
 assert.equal(await f.invoke('current'),null);assert.equal(f.safety.canAutoRestart(),true);
});
test('guest choice wins over late OAuth; cancellation invalidates a late result',async t=>{
 const p=deferred(),started=deferred();const f=await authFixture(t,{google:()=>{started.resolve();return p.promise}});
 const login=f.invoke('google');const rejected=assert.rejects(login,/superseded/);await started.promise;
 await f.invoke('guest');p.resolve({id:'google:late'});await rejected;assert.equal((await f.invoke('current')).id,'guest');
 const q=deferred(),s=deferred();f.provider.google=()=>{s.resolve();return q.promise};
 const next=f.invoke('google');const failure=assert.rejects(next,/superseded/);await s.promise;await f.invoke('cancel-google');q.resolve({id:'google:late'});await failure;assert.equal((await f.invoke('current')).id,'guest');
});
test('corrupt account data fails closed instead of replacing user data',async t=>{
 const f=await authFixture(t);await fs.writeFile(f.file,'{"accounts":null}');await assert.rejects(f.invoke('signup',credentials),/invalid/);assert.equal(await fs.readFile(f.file,'utf8'),'{"accounts":null}');
});

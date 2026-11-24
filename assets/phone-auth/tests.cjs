
test('disabled GitHub is detected before opening browser',async t=>{
  t.mock.method(global,'fetch',async()=>reply({external:{github:false}}));
  const provider=createProvider(config,()=>{throw Error('Browser must not open')});
  await assert.rejects(provider.github(),/provider disabled/);
});
test('phone OTP disabled by default and confirms matching phone',async t=>{
  let requests=0;
  t.mock.method(global,'fetch',async(url,opts)=>{
    requests++;
    if(url.endsWith('/settings'))return reply({external:{phone:true}});
    const body=JSON.parse(opts.body);
    if(url.endsWith('/otp')){assert.deepEqual(body,{phone:'+970599123456',channel:'sms',create_user:true});return reply({})}
    assert.equal(body.type,'sms');
    return reply({access_token:'fixture',user:{id:'fixture-user',phone:body.token==='123456'?'970599123456':'970599123457',phone_confirmed_at:'2026-01-01'}});
  });
  const disabled=createProvider(config,undefined,{phoneEnabled:false});
  await assert.rejects(disabled.sendPhoneCode('+970599123456'),/not configured/);assert.equal(requests,0);
  const enabled=createProvider(config,undefined,{phoneEnabled:true});
  await enabled.sendPhoneCode('+970599123456');
  const user=await enabled.verifyPhoneCode('+970599123456','123456');assert.match(user.id,/^phone:[a-f0-9]{64}$/);assert.equal(user.email,null);
  await assert.rejects(enabled.verifyPhoneCode('+970599123456','654321'),/expired/);
});
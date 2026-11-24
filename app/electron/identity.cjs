'use strict';
const crypto = require('node:crypto');
const http = require('node:http');
const defaults = require('./identity-config.json');

function configuration() {
  const raw = process.env.AGENTOFFICE_SUPABASE_URL || defaults.projectUrl;
  const key = process.env.AGENTOFFICE_SUPABASE_PUBLISHABLE_KEY || defaults.publishableKey;
  if (!raw || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.host) &&
        url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) {
      return {origin:url.origin,key};
    }
  } catch {}
  return null;
}

async function api(config, path, {body, token}={}) {
  const headers = {apikey:config.key,'Content-Type':'application/json'};
  if (token) headers.Authorization = 'Bearer '+token;
  const response = await fetch(config.origin+'/auth/v1'+path, {
    method:body?'POST':'GET',headers,body:body&&JSON.stringify(body),
    redirect:'error',signal:AbortSignal.timeout(15000)
  }).catch(()=>{throw Error('Identity service unavailable')});
  if (!response.ok) {
    if (response.status===429) throw Error('Too many attempts');
    if (path==='/verify' && [400,401,403,422].includes(response.status)) throw Error('Invalid or expired code');
    throw Error('Identity service unavailable');
  }
  return response.json();
}

function createProvider(config=configuration(), openBrowser=url=>require('electron').shell.openExternal(url)) {
  function ready() {if(!config)throw Error('Identity not configured')}
  let activeOAuth=null;
  async function oauth(provider) {
      const label=provider==='google'?'Google':'GitHub';
      ready();if(activeOAuth)throw Error('Sign-in already open');
      const flight={canceled:false,abort:null};activeOAuth=flight;
      const ensureActive=()=>{if(flight.canceled)throw Error(label+' sign-in canceled')};
      try {
      const verifier=crypto.randomBytes(48).toString('base64url');
      const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
      const state=crypto.randomBytes(24).toString('hex');
      const callback='/agentoffice/'+provider+'/'+state;
      const server=http.createServer();
      const code=await new Promise((resolve,reject)=>{
        let finished=false;
        const finish=(err,value)=>{
          if(finished)return;finished=true;clearTimeout(timer);flight.abort=null;
          server.close();server.closeAllConnections();
          if(err)reject(err);else resolve(value);
        };
        const timer=setTimeout(()=>finish(Error(label+' sign-in expired')),120000);
        flight.abort=()=>finish(Error(label+' sign-in canceled'));
        server.once('error',()=>finish(Error(label+' sign-in unavailable')));
        server.listen(0,'127.0.0.1',()=>{
          const host='127.0.0.1:'+server.address().port;
          const redirect=new URL('http://'+host+callback);
          server.on('request',(req,res)=>{
            let url;
            try{url=new URL(req.url,redirect)}catch{res.writeHead(400).end();return}
            if(req.method!=='GET'||req.headers.host!==host||url.pathname!==callback){
              res.writeHead(404).end();return;
            }
            const result=url.searchParams.get('code');
            res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
            res.end('Return to AgentOffice. يمكنك العودة إلى التطبيق.',()=>{
              if(!result||url.searchParams.has('error'))finish(Error(label+' sign-in canceled'));
              else finish(null,result);
            });
          });
          const auth=new URL('/auth/v1/authorize',config.origin);
          auth.search=new URLSearchParams({provider,redirect_to:redirect.href,code_challenge:challenge,code_challenge_method:'s256',scopes:provider==='google'?'openid email profile':'user:email'}).toString();
          Promise.resolve().then(()=>openBrowser(auth.href)).catch(()=>finish(Error(label+' sign-in unavailable')));
        });
      });
      ensureActive();
      const tokens=await api(config,'/token?grant_type=pkce',{body:{auth_code:code,code_verifier:verifier}});
      ensureActive();if(!tokens.access_token)throw Error(label+' sign-in failed');
      const user=await api(config,'/user',{token:tokens.access_token});
      ensureActive();
      const identity=user.identities?.find(i=>i.provider===provider);
      const data=identity?.identity_data;
      const sub=provider==='google'?data?.sub:(data?.sub||identity?.id||identity?.identity_id);
      const email=provider==='google'?data?.email:(data?.email||user.email);
      if(!sub || typeof email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (provider==='google'?data.email_verified!==true:!user.email_confirmed_at))throw Error(label+' sign-in failed');
      const id=provider+':'+crypto.createHash('sha256').update(config.origin+'|'+sub).digest('hex');
      return {id,email,name:data?.full_name||data?.name||data?.user_name||email,guest:false};
      } finally {if(activeOAuth===flight)activeOAuth=null}
  }
  return {
    configured:Boolean(config),
    async sendCode(email) {
      ready();
      await api(config,'/otp',{body:{email,create_user:true}});
    },
    async verifyCode(email,token) {
      ready();
      const data=await api(config,'/verify',{body:{email,token,type:'email'}});
      if(!data.access_token || !data.user?.email_confirmed_at || data.user.email?.toLowerCase()!==email) {
        throw Error('Invalid or expired code');
      }
    },
    cancelGoogle(){if(activeOAuth){activeOAuth.canceled=true;activeOAuth.abort?.()}},
    google:()=>oauth('google'),
    github:()=>oauth('github')
  };
}
module.exports={createProvider,configuration};

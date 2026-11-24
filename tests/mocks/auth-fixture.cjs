'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {registerAuth}=require('../../app/electron/auth.cjs');

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
async function authFixture(t,overrides={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentoffice-unit-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'accounts.json');
  const handlers=new Map(),calls=[];
  let time=Date.UTC(2026,0,1);
  const provider={configured:true,
    async sendCode(email){calls.push(['send',email])},
    async verifyCode(email,code){calls.push(['verify',email,code]);if(code!=='123456')throw Error('Invalid or expired code')},
    async google(){return {id:'google:fixture',name:'Google',email:'google@example.test',guest:false}},
    async github(){return {id:'github:fixture',name:'GitHub',email:'github@example.test',guest:false}},
    cancelGoogle(){calls.push(['cancel'])},...overrides};
  const safety=registerAuth({handle(name,fn){if(handlers.has(name))throw Error('Duplicate IPC handler');handlers.set(name,fn)}},provider,{accountFile:file,now:()=>time});
  return {file,calls,provider,safety,advance(ms){time+=ms},invoke(name,payload){return Promise.resolve().then(()=>{const fn=handlers.get('agentoffice:auth:'+name);if(!fn)throw Error('Unknown IPC channel');return fn({},payload)})}};
}
module.exports={authFixture,deferred};

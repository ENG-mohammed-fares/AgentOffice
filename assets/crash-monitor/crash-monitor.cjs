'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const LIMIT=50;
const MAX_AGE_MS=14*24*60*60*1000;
const filename=/^incident-[0-9]{13}-[0-9a-f-]{36}\.json$/;
const reasons=new Set(['abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure','memory-eviction']);
const types=new Set(['Utility','Zygote','Sandbox helper','GPU','Pepper Plugin','Pepper Plugin Broker','Unknown']);
const choose=(value,allowed,fallback)=>allowed.has(value)?value:fallback;

function prune(directory,now,keep=LIMIT){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const entries=fs.readdirSync(directory,{withFileTypes:true})
    .filter(e=>e.isFile()&&filename.test(e.name))
    .map(e=>({name:e.name,time:Number(e.name.slice(9,22))}))
    .sort((a,b)=>a.time-b.time||a.name.localeCompare(b.name,'en'));
  const fresh=[];
  for(const e of entries){
    if(now-e.time>MAX_AGE_MS)fs.unlinkSync(path.join(directory,e.name));
    else fresh.push(e);
  }
  for(const e of fresh.slice(0,Math.max(0,fresh.length-keep)))fs.unlinkSync(path.join(directory,e.name));
}

function createRecorder({directory,version,clock=Date.now}){
  const safeVersion=typeof version==='string'&&/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)?version:'unknown';
  function cleanup(){
    try{prune(directory(),clock());return true;}catch{return false;}
  }
  function record(kind,details={}){
    // Fixed schema only: never persist arbitrary error text, stack traces,
    // renderer URLs, IPC content, tokens, account details or memory dumps.
    if(details.reason==='clean-exit')return false;
    if(!['renderer','child','main'].includes(kind))return false;
    try{
      const now=clock(),dir=directory();
      prune(dir,now,LIMIT-1);
      const incident={schemaVersion:1,time:new Date(now).toISOString(),version:safeVersion,process:kind,
        reason:kind==='main'?'uncaught-exception':choose(details.reason,reasons,'unknown'),
        exitCode:Number.isSafeInteger(details.exitCode)&&details.exitCode>=-2147483648&&details.exitCode<=4294967295?details.exitCode:null};
      if(kind==='child')incident.childType=choose(details.type,types,'Unknown');
      if(kind==='main')incident.origin=details.origin==='unhandledRejection'?'unhandledRejection':'uncaughtException';
      const name='incident-'+String(now).padStart(13,'0')+'-'+randomUUID()+'.json';
      fs.writeFileSync(path.join(dir,name),JSON.stringify(incident)+'\n',{flag:'wx',mode:0o600});
      return true;
    }catch{return false;} // diagnostics must not break authentication or recovery.
  }
  return {record,cleanup};
}

function installCrashMonitor({app,processTarget=process}){
  const recorder=createRecorder({directory:()=>path.join(app.getPath('userData'),'crash-incidents'),version:app.getVersion()});
  const renderer=(_event,_contents,details)=>recorder.record('renderer',details);
  const child=(_event,details)=>recorder.record('child',details);
  const fatal=(_error,origin)=>recorder.record('main',{origin});
  const ready=()=>recorder.cleanup();
  app.on('render-process-gone',renderer);
  app.on('child-process-gone',child);
  // Observe without swallowing fatal exceptions or changing Node's exit policy.
  processTarget.on('uncaughtExceptionMonitor',fatal);
  if(app.isReady())ready();else app.once('ready',ready);
  return ()=>{
    app.removeListener('ready',ready);
    app.removeListener('render-process-gone',renderer);
    app.removeListener('child-process-gone',child);
    processTarget.removeListener('uncaughtExceptionMonitor',fatal);
  };
}
module.exports={createRecorder,installCrashMonitor,LIMIT,MAX_AGE_MS};

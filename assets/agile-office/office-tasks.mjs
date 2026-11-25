// Selective port of PR #11's task store/runtime onto the actual seven-role office.
export const STATUSES=Object.freeze(['Backlog','In progress','Done']);
const MAX_TASKS=250;
export function createTaskStore({roles,accountId,storage,uuid=()=>globalThis.crypto.randomUUID()}){
  if(!Array.isArray(roles)||!roles.length||roles.some(r=>typeof r!=='string'||!r)||new Set(roles).size!==roles.length)throw Error('Invalid roles');
  const key=typeof accountId==='string'&&accountId.trim()?'agentoffice:agile-tasks:v1:'+encodeURIComponent(accountId):null;
  let storageFailed=false,tasks=[];
  const valid=t=>t&&typeof t.id==='string'&&typeof t.title==='string'&&t.title.trim()&&t.title.length<=160&&roles.includes(t.owner)&&STATUSES.includes(t.status);
  if(key){
    try{
      const data=JSON.parse(storage?.getItem(key)||'null');
      if(Array.isArray(data)){
        const seen=new Set();
        tasks=data.filter(t=>{if(!valid(t)||seen.has(t.id))return false;seen.add(t.id);return true}).slice(0,MAX_TASKS).map(({id,title,owner,status})=>({id,title,owner,status}));
      }
    }catch{storageFailed=true}
  }
  const subscribers=new Set();
  const snapshot=()=>tasks.map(t=>({...t}));
  function changed(){
    if(key){try{if(!storage)throw Error('Storage unavailable');storage.setItem(key,JSON.stringify(tasks));storageFailed=false}catch{storageFailed=true}}
    for(const fn of subscribers)fn();
  }
  return {
    get:snapshot,get storageFailed(){return storageFailed},
    subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)},
    add(title,owner){
      if(typeof title!=='string')return false;
      title=title.trim();
      if(!title||title.length>160||!roles.includes(owner)||tasks.length>=MAX_TASKS)return false;
      const id=uuid();
      if(typeof id!=='string'||!id||tasks.some(t=>t.id===id))return false;
      tasks=[...tasks,{id,title,owner,status:'Backlog'}];changed();return true;
    },
    update(id,status){
      if(!STATUSES.includes(status)||!tasks.some(t=>t.id===id))return false;
      tasks=tasks.map(t=>t.id===id?{...t,status}:t);changed();return true;
    }
  };
}
export function createActivityDemo({roles,emit,setTimer=setInterval,clearTimer=clearInterval}){
  let timer=null,index=0,disposed=false;
  const tick=()=>{if(timer===null||disposed||!roles.length)return;const role=roles[index%roles.length];const activity=['working','talking','available'][index%3];index++;emit({role,activity})};
  return {
    get running(){return timer!==null},
    start(){if(!disposed&&timer===null)timer=setTimer(tick,12000)},
    stop(){if(timer!==null){clearTimer(timer);timer=null}},
    dispose(){this.stop();disposed=true}
  };
}

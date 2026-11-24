'use strict';
// Never expose the workspace while an initial update check is pending.
function createStartupGate({open, install, setTimer=setTimeout, clearTimer=clearTimeout, checkMs=20000, downloadMs=300000}) {
  let phase='checking', timer=null;
  function clear() { if(timer!==null){clearTimer(timer);timer=null} }
  function finish(reason) {
    if(phase==='done')return;
    clear();phase='done';open(reason);
  }
  function arm(ms,reason) {clear();timer=setTimer(()=>finish(reason),ms)}
  arm(checkMs,'check-timeout');
  return {
    status(state) {
      if(phase==='done')return;
      if(state==='error'||state==='unconfigured'||state==='development') {finish(state);return}
      if(phase==='installing')return;
      if(state==='current'){finish('current');return}
      if((state==='available'||state==='downloading')&&phase==='checking'){
        phase='downloading';arm(downloadMs,'download-timeout');
      }
      if(state==='ready'){
        clear();phase='installing';
        try{if(!install())finish('install-failed')}catch{finish('install-failed')}
      }
    },
    cancel(){clear();phase='done'},
    get phase(){return phase}
  };
}
module.exports={createStartupGate};

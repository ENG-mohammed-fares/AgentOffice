import screen from './auth-screen.html?raw';
import {mountLoadingIntro} from './loading-intro.js';

export function mountAuth({onAuthenticated,initialEmail='',passwordUpdated=false}) {
  let entered=false;
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
  const frame = document.createElement('iframe');
  frame.title = 'AgentOffice — تسجيل الدخول / Sign in';
  frame.style.cssText = 'display:block;width:100%;height:100dvh;border:0;background:#181a19';
  frame.addEventListener('load', async () => {
    try {await frame.contentWindow.connectAgentOffice({
      auth: window.agentOfficeDesktop?.auth,
      getVersion: window.agentOfficeDesktop?.version,
      initialEmail,passwordUpdated,
      passwordChanged: address => {
        if(entered||!frame.isConnected)return;
        entered=true;
        mountLoadingIntro({mode:'password',onComplete:()=>mountAuth({onAuthenticated,initialEmail:address,passwordUpdated:true})});
      },
      enter: user => {
        if(entered||!frame.isConnected)return;
        entered=true;
        mountLoadingIntro({mode:'signin',onComplete:()=>onAuthenticated(user)});
      }
    });frame.dataset.authReady='true';resolveReady()}catch(err){rejectReady(err)}
  }, {once:true});
  frame.srcdoc = screen;
  document.querySelector('#app').replaceChildren(frame);
  return ready;
}

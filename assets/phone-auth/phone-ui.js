(()=>{
Object.assign(words.en,{githubDisabled:'GitHub sign-in is not enabled on the identity service.',phoneLogin:'Continue with phone',phoneHelp:'Enter your international phone number.',phoneNumber:'Phone number',phoneSend:'Send code',phoneVerify:'Verify and sign in',phoneInvalid:'Enter a valid international phone number.',phoneSent:'Enter the six-digit SMS code.',phoneUnavailable:'Phone sign-in is not available.'});
Object.assign(words.ar,{githubDisabled:'تسجيل الدخول عبر GitHub غير مفعّل في خدمة الهوية.',phoneLogin:'المتابعة برقم الهاتف',phoneHelp:'أدخل رقم هاتفك مع رمز الدولة الدولي.',phoneNumber:'رقم الهاتف',phoneSend:'إرسال الرمز',phoneVerify:'تحقّق وسجّل الدخول',phoneInvalid:'أدخل رقم هاتف دوليًا صحيحًا.',phoneSent:'أدخل رمز التحقق المكوّن من ستة أرقام.',phoneUnavailable:'تسجيل الدخول بالهاتف غير متاح.'});
Object.assign(words.en,{phoneInstead:'Use phone instead',phoneUnavailable:'Phone sign-in is not available yet. Use email, Google or GitHub instead.'});
Object.assign(words.ar,{phoneInstead:'استخدم رقم الهاتف',phoneUnavailable:'الدخول بالهاتف غير متاح بعد. استخدم البريد أو Google أو GitHub.'});
Object.assign(words.fr,{phoneInstead:'Utiliser le téléphone',phoneUnavailable:'La connexion par téléphone est indisponible pour le moment.'});
Object.assign(words.de,{phoneInstead:'Telefon verwenden',phoneUnavailable:'Die Anmeldung per Telefon ist noch nicht verfügbar.'});
Object.assign(words.es,{phoneInstead:'Usar teléfono',phoneUnavailable:'El acceso por teléfono aún no está disponible.'});
Object.assign(words.he,{phoneInstead:'השתמש בטלפון',phoneUnavailable:'כניסה באמצעות הטלפון עדיין אינה זמינה.'});
let available=false,opened=false,sent=false,number='',notice='',bad=false,pending=false,resendAt=0,timer;
const el=byId, digits=v=>v.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)<1776?1632:1776)));
function update(){
  el('phoneLogin').hidden=false;
  el('phoneLogin').disabled=busy;
  el('phonePanel').hidden=!opened;
  if(opened){el('loginPanel').hidden=true;el('recovery').hidden=true}
  el('phoneCodeRow').hidden=!sent;
  el('phoneNumber').readOnly=sent;
  el('phoneNumber').disabled=pending;el('phoneCode').disabled=pending;
  el('phoneNext').disabled=pending||!available;el('phoneNext').textContent=t(pending?'pending':sent?'phoneVerify':'phoneSend');
  el('phoneBack').disabled=pending;el('phoneResend').hidden=!sent;el('phoneResend').disabled=pending||Date.now()<resendAt;
  el('phoneNotice').textContent=notice?t(notice):(!available&&opened?t('phoneUnavailable'):'');el('phoneNotice').classList.toggle('error',bad);
}
const previousRecovery=renderRecovery;renderRecovery=function(){previousRecovery();update()};
const previousConnect=window.connectAgentOffice;
window.connectAgentOffice=async connection=>{await previousConnect(connection);try{available=await connection.auth?.phoneStatus?.()===true}catch{available=false}update()};
function clear(){clearInterval(timer);opened=sent=false;number=notice='';bad=false;el('phoneNumber').value=el('phoneCode').value='';void session?.auth?.phoneCancel?.().catch(()=>{});render()}
el('phoneLogin').onclick=()=>{if(busy)return;opened=true;notice='';bad=false;render();el('phoneNumber').focus()};
el('phoneBack').onclick=()=>{if(!pending)clear()};
async function send(){
  const p=digits(el('phoneNumber').value).replace(/[\s()-]/g,'');
  if(!/^\+[1-9]\d{6,14}$/.test(p)){notice='phoneInvalid';bad=true;update();return}
  pending=true;busy=true;notice='';update();
  try{await session.auth.phoneRequest(p);number=p;sent=true;notice='phoneSent';bad=false;resendAt=Date.now()+60000;clearInterval(timer);timer=setInterval(update,1000)}
  catch(err){notice=cloudError(err);bad=true}
  finally{pending=false;busy=false;update();if(sent)el('phoneCode').focus()}
}
el('phoneResend').onclick=()=>{if(available&&!pending&&Date.now()>=resendAt)void send().catch(err=>{notice=cloudError(err);bad=true;update()})};
el('phoneForm').onsubmit=async event=>{
  event.preventDefault();if(pending||!available)return;
  if(!sent){await send();return}
  const code=digits(el('phoneCode').value.trim());if(!/^\d{6}$/.test(code)){notice='expired';bad=true;update();return}
  pending=true;busy=true;update();
  try{const user=await session.auth.phoneVerify(number,code);clearInterval(timer);session.enter(user)}
  catch(err){notice=cloudError(err);bad=true}
  finally{pending=false;busy=false;update()}
};
update();
})();
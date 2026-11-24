import './inline-spinner.css';

const spinning=new WeakMap();
// Attach to a real pending operation. Never replace the workspace.
export async function withInlineSpinner(target,operation) {
  if(!target)return operation();
  if(spinning.has(target))return spinning.get(target);
  const originalDisabled=target.disabled;
  const originalBusy=target.getAttribute('aria-busy');
  const wrapper=document.createElement('span');
  wrapper.className='ao-inline-spinner';
  wrapper.setAttribute('role','status');
  wrapper.setAttribute('aria-label','Loading');
  wrapper.innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="ao-spinner-track" cx="20" cy="20" r="15"/><g class="ao-spinner-orbit"><path d="M20 5 A15 15 0 1 1 7.01 27.5" class="ao-spinner-arc"/><circle class="ao-spinner-tip" cx="20" cy="5" r="2"/></g><rect class="ao-spinner-core" x="15" y="15" width="10" height="10" rx="3"/></svg>';
  target.append(wrapper);
  target.disabled=true;
  target.setAttribute('aria-busy','true');
  const promise=Promise.resolve().then(operation);
  spinning.set(target,promise);
  try{return await promise}finally{
    spinning.delete(target);wrapper.remove();target.disabled=originalDisabled;
    if(originalBusy===null)target.removeAttribute('aria-busy');else target.setAttribute('aria-busy',originalBusy);
  }
}

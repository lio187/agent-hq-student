// Shared markup for page states. One component for empty, offline, login, setup, uncertain and
// error results, so every module tells the user what happened and offers the next safe step.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const GLYPHS={empty:'○',offline:'!',error:'!',login:'→',setup:'+',uncertain:'?',loading:'…'};
export function stateView({kind='empty',title,body='',actions=[]}){
 const buttons=actions.map(a=>a.href?'<a class="ui-btn'+(a.primary?' ui-btn--primary':'')+'" href="'+esc(a.href)+'" target="'+(a.external===false?'_self':'_blank')+'" rel="noopener noreferrer"'+(a.attr?' '+a.attr:'')+'>'+esc(a.label)+'</a>':'<button type="button" class="ui-btn'+(a.primary?' ui-btn--primary':'')+'" data-action="'+esc(a.action)+'" data-id="'+esc(a.id||'')+'">'+esc(a.label)+'</button>').join('');
 return '<div class="ui-state" data-kind="'+esc(kind)+'" role="status"><span class="ui-state-icon" aria-hidden="true">'+(GLYPHS[kind]||'○')+'</span>'+(title?'<h3>'+esc(title)+'</h3>':'')+(body?'<p>'+esc(body)+'</p>':'')+(buttons?'<div class="ui-state-actions">'+buttons+'</div>':'')+'</div>';
}
// Map an API failure to the state the user can act on. 409 uncertain results never offer a retry.
export function errorState(error,{retry='refresh'}={}){
 const status=error?.status,code=error?.code||'';
 if(status===401&&/team|sign/i.test(code+(error?.message||'')))return stateView({kind:'error',title:'Team Hub refused this request',body:'The dashboard reads Team Hub with its own server connection, not your login. Check Connections, then try again.',actions:[{label:'Check again',action:retry}]});
 if(status===401)return stateView({kind:'error',title:'Your office session expired',body:'Reload the office to start a new local session.',actions:[{label:'Reload office',href:'/',external:false}]});
 if(status===409||/uncertain/.test(code))return stateView({kind:'uncertain',title:'Result not confirmed',body:(error?.message||'The source did not confirm the last action.')+' Inspect the source before trying again.'});
 if(status===404||/not_deployed|setup|not_configured/.test(code))return stateView({kind:'setup',title:'Not set up yet',body:error?.message||'This source has not been activated.',actions:[{label:'Check again',action:retry}]});
 if(status>=500||/unavailable|timeout/.test(code))return stateView({kind:'offline',title:'Source temporarily unavailable',body:(error?.message?error.message+' ':'')+'Your office remains connected.',actions:[{label:'Try again',action:retry}]});
 return stateView({kind:'error',title:'Something went wrong',body:error?.message||'The request failed.',actions:[{label:'Try again',action:retry}]});
}
export function skeleton(rows=3){return '<div class="ui-skeleton-grid" aria-hidden="true">'+Array.from({length:rows},()=>'<div class="ui-skeleton-card"><span class="ui-skeleton" style="width:40%"></span><span class="ui-skeleton" style="width:70%;height:20px"></span><span class="ui-skeleton" style="width:55%"></span></div>').join('')+'</div>'}
// Brand motion (6 October 2026): a line trace of the 187N infinity mark. It draws once as an intro and
// loops as the loading signal; the PNG mark itself is never redrawn or altered. With reduced motion it
// stays a still outline.
const INFINITY='M60,30C72,16 80,6 92,6C106,6 116,17 116,30C116,43 106,54 92,54C80,54 72,44 60,30C48,16 40,6 28,6C14,6 4,17 4,30C4,43 14,54 28,54C40,54 48,44 60,30Z';
export function brandTrace({mode='loop',label='',size='md'}={}){
 return '<span class="brand-trace brand-trace--'+esc(size)+'" data-mode="'+esc(mode)+'"'+(label?' role="img" aria-label="'+esc(label)+'"':' aria-hidden="true"')+'><svg viewBox="0 0 120 60"><path class="trace-base" d="'+INFINITY+'"></path><path class="trace-draw" pathLength="1" d="'+INFINITY+'"></path>'+(mode==='loop'?'<path class="trace-glint" pathLength="1" d="'+INFINITY+'"></path>':'')+'</svg></span>';
}
export const loadingView=(text='Loading…')=>'<div class="ui-loading" role="status">'+brandTrace({mode:'loop'})+'<span>'+esc(text)+'</span></div>';

// Patches to the office source for this area (see student.mjs): {files: {'<module>': {patches, after}}, removeActions,
// titles, descriptions}. Counted string patches: [match, replacement, times = 1].
//
// Connections › Reconnect on an AI tool (runtime:claude, runtime:codex, runtime:hermes): the app opens the official
// sign-in (or installer) in Terminal and notices by itself when it is done, so the dialog explains that instead of
// showing a login link, and the page refreshes once the tool is ready.
const RECONNECT = "if(a==='connector-reconnect'){b.disabled=true;b.textContent='Creating login link…';try{const r=await api('integrations/'+encodeURIComponent(id)+'/reconnect',{});";
const RUNTIME_RECONNECT = "if(a==='connector-reconnect'){const rt=String(id).startsWith('runtime:');b.disabled=true;b.textContent=rt?'Opening Terminal…':'Creating login link…';try{const r=await api('integrations/'+encodeURIComponent(id)+'/reconnect',{});"
  + "if(rt){const rid=String(id).slice(8),t0=Date.now(),tick=setInterval(async()=>{try{const x=((await api('runtimes/status')).runtimes||[]).find(q=>q.id===rid);if(!x||!x.pending||Date.now()-t0>600000){clearInterval(tick);if(x?.ready)navigate(section,{refresh:true})}}catch{clearInterval(tick)}},3000);"
  + "return preview(r.title||'Sign in','<p>'+esc(r.reason||'')+'</p>'+(r.account?'<p class=\"source\">Account: '+esc(r.account)+'</p>':'')+'<p class=\"source\">You can close this dialog. This page shows the tool as connected once you are done in Terminal.</p>')}";

export default {files: {'workspace-view.mjs': {patches: [[RECONNECT, RUNTIME_RECONNECT]]}}, removeActions: [], titles: {}, descriptions: {}};

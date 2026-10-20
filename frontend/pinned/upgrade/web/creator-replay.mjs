// Saved evidence only: this controller has no network or provider dependency.
export function createResearchReplay({onFrame,setTimer=setTimeout,clearTimer=clearTimeout,delay=650}){
 let timer=null,generation=0,posts=[],index=0,status='idle';
 const frame=()=>({status,active:status==='playing',index,total:posts.length,visible:posts.slice(0,index),current:posts[index-1]||null});
 function cancelTimer(){if(timer!==null)clearTimer(timer);timer=null;generation++}
 function advance(){
  if(status!=='playing')return;
  index=Math.min(posts.length,index+Math.max(1,Math.ceil(posts.length/48)));
  if(index===posts.length)status='complete';
  onFrame(frame());
  if(status==='playing'){const expected=generation;timer=setTimer(()=>{if(expected!==generation)return;timer=null;advance()},delay)}
 }
 return {
  start(source){cancelTimer();posts=source.filter(p=>p.analysis&&!p.excludedReason);index=0;status=posts.length?'playing':'empty';if(posts.length)advance();else onFrame(frame())},
  stop({notify=true}={}){cancelTimer();status='stopped';if(notify)onFrame(frame())},
  get active(){return status==='playing'},
 };
}

export function replayControls(){
 return '<section aria-label="Saved analysis replay"><h3>Replay saved analysis</h3><p>Revisit the classified Reels in the current filtered order. This replay uses saved evidence and starts no provider analysis.</p><button type="button" data-research-replay="start">Replay saved analysis</button> <button type="button" data-research-replay="stop" disabled>Stop replay</button><p data-research-replay-status role="status">Ready to replay saved evidence.</p><div data-research-replay-evidence></div></section>';
}

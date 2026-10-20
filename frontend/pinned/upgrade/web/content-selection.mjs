export const CONTENT_BUSINESS_ACCOUNTS={tao:'liogpt','187n':'187n'};
export const CONTENT_BUSINESS_VIEWS=new Set(['content','board','record','campaigns','reviews','social','production','accounts','studio']);
export function contentSelection(section,business,account){
 const scoped=CONTENT_BUSINESS_VIEWS.has(section)?business:'all';
 return {business:scoped,account:CONTENT_BUSINESS_ACCOUNTS[scoped]||account};
}
export function createContentReader(api,{now=Date.now}={}){
 let cached,key,at=0,generation=0;
 return async selection=>{
  const selected=new URLSearchParams(selection).toString(),ticket=++generation;
  if(key===selected&&cached&&now()-at<45000)return cached;
  const result=await api('workspace/team/content?'+selected);
  if(ticket!==generation)throw Error('Content selection changed; outdated response discarded.');
  cached=result;key=selected;at=now();return result;
 };
}

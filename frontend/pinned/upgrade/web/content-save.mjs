export function verifyContentSave(item,attempt){
 const source=attempt.source,patch=attempt.patch;
 if(!item||item.id!==source.id||item.revision!==source.revision+1||item.accountId!==source.accountId||item.accountRegistryId!==source.accountRegistryId)throw Error('The source does not confirm this content revision. Compare the current source with your saved draft.');
 for(const [key,value] of Object.entries(patch)){
  if(key==='blocks'){
   for(const block of value){const matches=(item.blocks||[]).filter(b=>b.id===block.id);if(matches.length!==1||matches[0].text!==block.text)throw Error('The source does not confirm the saved script blocks.')}
  }else if(item[key]!==value)throw Error('The source does not confirm the saved field '+key+'.');
 }
 return item;
}
export async function readContentSave(api,attempt){
 const detail=await api('workspace/team/item?id='+encodeURIComponent(attempt.source.id));
 return verifyContentSave(detail.item,attempt);
}

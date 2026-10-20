// Only the latest request in the same navigation/business selection may open a detail.
export function createDeliveryDetails({api,current}){
 let generation=0;
 return async project=>{
  const request=++generation,selection={...current()};
  if(typeof project!=='string'||!project.trim())throw Error('Choose a delivery project.');
  const active=()=>request===generation&&current().serial===selection.serial&&current().business===selection.business;
  let data;
  try{data=await api('workspace/delivery?'+new URLSearchParams({business:selection.business,project}));}
  catch(error){if(!active())return null;throw error;}
  if(!active())return null;
  if(data?.scope?.business!==selection.business||data.scope.project!==project||data.scope.sourceBusiness!=='187n'||
     data.source!=='187n/operating-system/crisis-control'||!Array.isArray(data.projects)||data.projects.length!==1||data.projects[0]?.externalId!==project)
   throw Error('Delivery selection could not be verified. Refresh the register.');
  return data.projects[0];
 };
}

export function connectorService(tool,connections){
 if(typeof tool!=='string')return null;
 const normalized=tool.toLowerCase();
 if(normalized.startsWith('mcp__')){
  const matches=[...new Set(connections.filter(c=>c.adapter==='hermes-mcp'&&normalized.startsWith('mcp__'+c.name.replace(/[^A-Za-z0-9_]/g,'_').toLowerCase()+'__')).map(c=>c.name))];
  return matches.length===1?matches[0]:null;
 }
 return connections.map(c=>c.name).find(name=>normalized.split(/__|[.:]/).some(part=>part.startsWith(name.toLowerCase()+'_')))||null;
}

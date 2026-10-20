// Visual office organization, never an authorization or a claim of tool execution.
export const DEPARTMENT_TOOLS={
 googledocs:['content','operations','finance'],google_maps:['growth','revenue'],
 gmail:['revenue','operations','finance'],googlecalendar:['revenue','command'],
 googledrive:['content','build','finance'],slack:['operations','build','command'],
 github:['build'],figma:['content','build'],todoist:['operations','command'],
 fathom:['revenue','command'],notion:['operations','content'],calendly:['revenue'],
 vercel:['build'],youtube:['content','growth'],linkedin:['growth','revenue'],
 whop:['content','revenue'],zernio_mcp:['growth','content'],googlemeet:['revenue','command'],
 'content-os':['content','growth'],kit:['growth','content'],supabase:['build'],
 whatsapp:['revenue','operations'],notes:['operations'],time:['command']
};
export const DEPARTMENT_COLORS={growth:'#c98e74',content:'#78a68c',revenue:'#bba34e',operations:'#ac99ba',build:'#73a9b7',finance:'#9999b8',command:'#e2561f'};
export const connectorGroup=name=>{const base=name?.replace(/-(native|oauth)$/,'');return base in DEPARTMENT_TOOLS?base:name;};
export function headerConnections(connections){
 const groups=new Map();
 for(const c of connections){const name=connectorGroup(c.name);if(['time','notes'].includes(name))continue;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(c)}
 return [...groups].map(([name,accounts])=>({name,accounts}));
}
export function departmentLinks(connection,profiles=[],overrides={}){
 const saved=overrides[connection.id],pinned=saved||connection.departments||[];
 const observed=(connection.agent_activity||[]).map(a=>profiles.find(p=>p.id===a.profile)?.department).filter(Boolean);
 const explicit=[...pinned,...(connection.selected_departments||[]),...observed];
 const custom=Array.isArray(saved)||connection.layout_configured||pinned.length>0;
 const defaults=custom||explicit.length?[]:DEPARTMENT_TOOLS[connectorGroup(connection.name)]||[];
 return [...new Set([...explicit,...defaults])].filter(d=>d in DEPARTMENT_COLORS).map(department=>({department,basis:pinned.includes(department)?'pinned':observed.includes(department)?'observed':connection.selected_departments?.includes(department)?'selected':'layout'}));
}

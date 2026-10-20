import {OFFICE} from './palette.mjs';
// Role-specific visual workspaces. Status and task title come from observed work;
// cursor motion is office ambience, never fabricated execution or progress.
export function paintDeskScreen(record,now=0,animate=false){
 const {p,dept,status,task,index,desk}=record,c=desk.screenSet.ctx,w=256,h=160;
 // Linear screens: carbon UI and mist text, with each department's original accent colour.
 const accent=OFFICE.screens[dept]||OFFICE.screens.command;
 const phase=animate?Math.floor(now/650+index)%4:0;
 c.fillStyle='#0f1011';c.fillRect(0,0,w,h);c.fillStyle='#161718';c.fillRect(0,0,w,23);c.fillStyle=accent;for(let i=0;i<3;i++){c.beginPath();c.arc(9+i*9,11,2.5,0,7);c.fill()}
 c.font='500 9px "JetBrains Mono",monospace';c.fillStyle='#d0d6e0';c.fillText(p.name.slice(0,30),39,15);
 c.fillStyle='#131416';c.fillRect(0,23,37,118);c.fillStyle=accent;c.fillRect(5,34+(index%3)*22,27,15);c.fillStyle='#383b3f';for(let i=0;i<4;i++)c.fillRect(7,39+i*23,20,2);
 const text=(value,x,y,color='#8a8f98',font='9px "JetBrains Mono",monospace')=>{c.fillStyle=color;c.font=font;c.fillText(value,x,y)};
 text(task?.title?.slice(0,31)||({build:'Development workspace',content:'Content workspace',growth:'Campaign workspace',revenue:'Client workspace',finance:'Finance workspace',operations:'Knowledge workspace',command:'Office overview'})[dept],46,36,'#ffffff','500 9px "JetBrains Mono",monospace');
 if(dept==='build'){
  const lines=['// '+p.name,'workspace {','  role: "'+p.id.slice(0,15)+'",','  state: "'+status+'",','  source: "Hermes"','}'];lines.forEach((line,i)=>{text(String(i+1),44,52+i*13,'#62666d','8px monospace');text(line.slice(0,29),60,52+i*13,i===3?accent:'#d0d6e0')});
 }else if(dept==='revenue'||dept==='command'){
  ['NEXT','ACTIVE','REVIEW'].forEach((label,col)=>{text(label,46+col*66,51,'#62666d','8px monospace');for(let i=0;i<2+(col+index)%2;i++){c.fillStyle=col===phase%3?'#23252a':'#191a1d';c.fillRect(45+col*66,58+i*25,57,20);c.fillStyle=accent;c.fillRect(49+col*66,63+i*25,3,10);c.fillStyle='#383b3f';c.fillRect(56+col*66,63+i*25,35,2);c.fillRect(56+col*66,69+i*25,25,2)}});
 }else if(dept==='growth'||dept==='finance'){
  text(dept==='finance'?'Ledger overview':'Campaign planning',46,52,'#62666d','8px monospace');for(let i=0;i<6;i++){c.fillStyle=i===(phase+index)%6?accent:'#2e3137';c.fillRect(48+i*22,110-(18+(i*11+index*7)%40),13,18+(i*11+index*7)%40)}c.strokeStyle='#23252a';c.beginPath();c.moveTo(46,111);c.lineTo(241,111);c.stroke();text('WORKSPACE PREVIEW',46,128,'#62666d','8px monospace');
 }else{
  const labels=dept==='content'?['Draft','Outline','Review','Publish']:['Sources','Notes','Linked documents','Review'];for(let i=0;i<4;i++){c.fillStyle=i===index%4?'#23252a':'#191a1d';c.fillRect(45,44+i*21,196,18);text(labels[i],51,56+i*21,'#d0d6e0','8px monospace');c.fillStyle=accent;c.fillRect(125,50+i*21,32+(index*17+i*23)%66,2);c.fillStyle='#383b3f';c.fillRect(125,55+i*21,42,2)}
 }
 if(animate&&phase<2){c.fillStyle='#d0d6e0';c.fillRect(229,123,3,8)}
 c.fillStyle='#161718';c.fillRect(0,141,256,19);text(status.toUpperCase(),7,153,status==='blocked'?'#eb5757':status==='waiting'?'#e8a33d':'#27a644','500 8px "JetBrains Mono",monospace');text('VISUAL WORKSPACE',151,153,'#62666d','8px monospace');desk.screenSet.tex.needsUpdate=true;record.screenFrame=phase;
}

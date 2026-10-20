class HQMicrophone extends AudioWorkletProcessor {
 constructor(){super();this.samples=[];this.pending=[];this.position=0;this.ratio=sampleRate/16000;}
 process(inputs){const data=inputs[0]?.[0];if(data){for(const sample of data)this.samples.push(sample);const pcm=[];while(this.position+this.ratio<=this.samples.length){let sum=0,n=0;for(let i=Math.floor(this.position);i<Math.floor(this.position+this.ratio);i++){sum+=this.samples[i];n++}pcm.push(Math.round(Math.max(-1,Math.min(1,sum/(n||1)))*32767));this.position+=this.ratio}const consumed=Math.floor(this.position);this.samples.splice(0,consumed);this.position-=consumed;this.pending.push(...pcm);while(this.pending.length>=1600){const chunk=this.pending.splice(0,1600),buffer=new ArrayBuffer(3200),view=new DataView(buffer);chunk.forEach((v,i)=>view.setInt16(i*2,v,true));this.port.postMessage(buffer,[buffer])}}return true}
}
registerProcessor('hq-microphone',HQMicrophone);

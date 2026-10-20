// Patches to the office source for this area (see student.mjs): {files: {'<module>': {patches, after}}, removeActions,
// titles, descriptions}. Counted string patches: [match, replacement, times = 1].
// Voice Mode (A5): the office's voice session (voice-session.mjs) runs every call, from the Voice page and from the
// dock's Talk button. The office's own voice-* actions were only used by its call screen, which this edition does
// not ship; the Voice page has its own controls (mk-voice-*), so those actions stay removed.
export default {
  files: {
    'voice-session.mjs': {patches: [
      // The greeting uses the student's first name (from the licence) when there is one.
      ["enqueue('Hi. '+c.name", "enqueue('Hi'+(statusInfo?.first_name?' '+statusInfo.first_name:'')+'. '+c.name"],
      // Talk before Voice Mode is set up: say what to do (and ask for the microphone only once it is ready).
      ['const [c]=await Promise.all([getContext(pin),voiceStatus(pin),audio()]);if(epoch!==startEpoch)return;',
       "const [c,ready]=await Promise.all([getContext(pin),voiceStatus(pin),audio()]);if(epoch!==startEpoch)return;if(ready&&ready.ready===false){statusPromise=null;throw new Error(ready.reason||'Voice is not set up yet. Open Setup, then Voice.')}"],
    ]},
  },
  removeActions: ['voice-start', 'voice-stop', 'voice-mute', 'voice-interrupt'],
  titles: {}, descriptions: {},
};

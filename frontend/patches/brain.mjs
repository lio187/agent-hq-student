// Patches to the office source for the second brain (see student.mjs): {files: {'<module>': {patches, after}}, removeActions,
// titles, descriptions}. Counted string patches: [match, replacement, times = 1].
export default {
  files: {
    'brain-view.mjs': {patches: [
      // Every time the Brain opens it reads the index again, so a note added since shows up without reloading the app.
      // Finished layouts stay cached per index time, so an unchanged brain still opens at once.
      ["performance.mark('hq:brain-open');", "performance.mark('hq:brain-open');slims.clear();communitiesRequest=null;"],
      // The app returns a note's text as a JSON string (its API speaks JSON); the reader shows the text itself.
      ["const text=await read({id,path,title,kind:k,source_url:url});",
       "const text=(t=>{try{const j=JSON.parse(t);return typeof j==='string'?j:t}catch{return t}})(await read({id,path,title,kind:k,source_url:url}));"],
    ]},
  },
  removeActions: [], titles: {}, descriptions: {},
};

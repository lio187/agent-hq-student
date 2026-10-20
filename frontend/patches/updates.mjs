// Updates (1.3.0): the Setup page's Updates view (overlay mk-updates.mjs), its title and description, and the
// "Version X is available" notice on the Overview too (the Overview renders on its own path, without the page hook).
export default {
  titles: {updates: 'Updates'},
  descriptions: {updates: 'This version, the newest version from 187N, and its download, checked against 187N’s signature.'},
  files: {'workspace-view.mjs': {patches: [
    ['await renderOverview(ticket,jump,fresh)}else{', "await renderOverview(ticket,jump,fresh);if(ticket===serial)mkHost.mounted(section,$('#view'),mkCtx)}else{"],
  ]}},
};

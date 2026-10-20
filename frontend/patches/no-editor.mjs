// The office's Video editor (FilmCraft, section `editor`, 11–12 Oct 2026) is not part of the student app: owner decision
// of 12 Oct 2026. The student engine has no /api/hq/v1/editor/ API and no /apps/filmcraft/ app, so the section, its
// host, its embed entry and its lazy module are taken out at export. The export stops if editor-view is still reachable,
// and tests/unit/export.test.mjs fails if any editor route, host or nav entry reaches a build.
export default {
  files: {'workspace-view.mjs': {patches: [['<section id="editor-host" hidden></section>', '']]}},
  // Structural removals in workspace-view.mjs (see export.mjs viewOps): `views.editor=…`, the host's show/hide
  // statements and EMBEDS.editor; the now unused editorM/editorModule declarations are pruned.
  views: ['editor'],
  statements: ["'#editor-host'", 'editorM?.hide()'],
  objectProps: {EMBEDS: ['editor']},
  forbidden: ['editor-view'],
};

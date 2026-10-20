export function localBuildRows(reference){
 const evidence=reference?.localBuildObservation;
 if(!evidence)return [];
 return [
  ['Local build observation',evidence.buildStatus+' · '+evidence.observedAt],
  ['Local QA scope','Isolated local source snapshot; production and client acceptance not verified'],
  ['Local tests',evidence.testsPassed+' tests in '+evidence.testFiles+' files'],
  ['Local base commit',evidence.baseCommit],
  ['Uncommitted patch SHA-256',evidence.dirtyPatchSha256],
  ['Local review artifact',evidence.report],
  ['Local verification artifact',evidence.verification],
  ['Verification SHA-256',evidence.verificationSha256],
 ];
}

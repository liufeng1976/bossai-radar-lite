import { execFileSync } from 'node:child_process';
import process from 'node:process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

let status;
let head;
try {
  status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  head = git(['rev-parse', 'HEAD']);
} catch (error) {
  console.error(`PUBLIC_FINAL_GATE_FAILED: unable to inspect git state: ${error.message}`);
  process.exit(1);
}

if (status) {
  console.error('PUBLIC_FINAL_GATE_FAILED: the release candidate must be an exact clean Git commit.');
  console.error('Uncommitted or untracked non-ignored files are present:');
  console.error(status);
  console.error('Stage and commit only the reviewed release batch, preserve unrelated work separately, then rerun this gate from the exact release commit.');
  process.exit(1);
}

console.log('PUBLIC_FINAL_GATE_PASSED');
console.log(JSON.stringify({ head, cleanWorkingTree: true, releaseCandidate: 'exact-git-commit' }, null, 2));

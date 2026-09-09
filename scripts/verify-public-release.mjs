import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const requiredFiles = [
  'README.md',
  'README_EN.md',
  'LICENSE',
  'NOTICE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'AGENT_INSTALL.md',
  'agent-install.json',
  'docs/PUBLIC_RELEASE.md',
  'docs/GITHUB_LAUNCH_CHECKLIST.md',
  'docs/PUBLIC_RELEASE_BATCH_2026-08-30.md',
  'docs/AGENT_API.md',
  'agent-api.json',
  'openapi/agent-api.json',
  'public-release.json',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/release.yml',
  'docs/LITE_VS_PRO.md',
  'docs/COMMERCIAL_LICENSE.md',
  'docs/LEAD_PRIVACY.md',
  'scripts/verify-public-final.mjs',
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath))) {
    failures.push(`missing required public-release file: ${relativePath}`);
  }
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const publicRelease = JSON.parse(readFileSync(path.join(root, 'public-release.json'), 'utf8'));
if (publicRelease.schema !== 'bossai.public-release.v1') failures.push('public-release.json schema must be bossai.public-release.v1');
if (publicRelease.product?.id !== packageJson.name) failures.push('public-release.json product.id must match package.json name');
if (publicRelease.product?.version !== packageJson.version) failures.push('public-release.json product.version must match package.json version');
if (!publicRelease.repository?.includes('github.com/liufeng1976/bossai-radar-lite')) failures.push('public-release.json repository must use the canonical GitHub repository');
if (publicRelease.authorities?.runtime !== 'bossai-os' || publicRelease.authorities?.ownsRuntime !== false) failures.push('public-release.json must preserve BossAI OS as Runtime authority');
if (publicRelease.authorities?.commercial !== 'bossai-headquarters-commerce' || publicRelease.authorities?.ownsBilling !== false) failures.push('public-release.json must preserve Headquarters Commerce as commercial authority');
const agentApi = JSON.parse(readFileSync(path.join(root, 'agent-api.json'), 'utf8'));
if (agentApi.schema !== 'bossai.agent-api.v1' || agentApi.id !== packageJson.name || agentApi.version !== packageJson.version) failures.push('agent-api.json must match package identity/version');
if (agentApi.authority?.runtime !== 'bossai-os' || agentApi.authority?.ownsRuntime !== false) failures.push('agent-api.json must preserve BossAI OS Runtime authority');
if (agentApi.bossaiConnector?.automaticExternalActions !== false || (agentApi.bossaiConnector?.writeOperations ?? []).length !== 0) failures.push('BossAI connector projection must remain read-only with automaticExternalActions=false');
if (publicRelease.claims?.publiclyLaunched !== false || publicRelease.claims?.productionReady !== false || publicRelease.claims?.realUserValidated !== false) failures.push('public-release.json must not overclaim launch/readiness/validation before external evidence exists');
if (packageJson.scripts?.['verify:public-final'] !== 'node scripts/verify-public-final.mjs') failures.push('package.json must expose verify:public-final');
if (!packageJson.scripts?.['release:public-final']?.includes('verify:public-final')) failures.push('package.json release:public-final must enforce the clean-commit final gate');
if (packageJson.license !== 'SEE LICENSE IN LICENSE') failures.push('package.json license must point readers to the repository LICENSE file');
if (!packageJson.repository?.url?.includes('github.com/liufeng1976/bossai-radar-lite')) {
  failures.push('package.json repository must point to the canonical GitHub repository');
}
if (!packageJson.homepage?.includes('github.com/liufeng1976/bossai-radar-lite')) {
  failures.push('package.json homepage must point to the canonical GitHub repository');
}
if (!packageJson.bugs?.url?.includes('/issues')) failures.push('package.json bugs.url must point to the GitHub issue tracker');

const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
for (const marker of ['source-available', 'docs/LITE_VS_PRO.md', 'BossAI OS']) {
  if (!readme.includes(marker)) failures.push(`README.md must contain public-boundary marker: ${marker}`);
}

let candidateFiles = [];
try {
  candidateFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
} catch (error) {
  failures.push(`unable to inspect release-candidate files with git ls-files: ${error.message}`);
}

const forbiddenTrackedSecretNames = [
  /(^|\/)\.env$/i,
  /(^|\/)\.env\.(local|production|prod|staging)$/i,
  /(^|\/)(id_rsa|id_ed25519)$/i,
  /(^|\/)(credentials|secrets)\.json$/i,
  /\.(p12|pfx)$/i,
  /(^|\/).*private.*\.(pem|key)$/i,
  /(^|\/)(nul|con|prn|aux)$/i,
];

for (const file of candidateFiles) {
  if (forbiddenTrackedSecretNames.some((pattern) => pattern.test(file))) {
    failures.push(`release-candidate file looks secret-bearing and must be reviewed/removed: ${file}`);
  }
}

const forbiddenContentPatterns = [
  { label: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'OpenAI-style project key', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'GitHub personal access token', pattern: /\bghp_[A-Za-z0-9]{36}\b/ },
  { label: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
];

for (const file of candidateFiles) {
  if (!/\.(?:js|cjs|mjs|ts|tsx|json|md|txt|yml|yaml|env|example)$/i.test(file)) continue;
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  let content;
  try {
    content = readFileSync(absolute, 'utf8');
  } catch {
    continue;
  }
  for (const item of forbiddenContentPatterns) {
    if (item.pattern.test(content)) failures.push(`release-candidate text contains a ${item.label}: ${file}`);
  }
}

if (failures.length > 0) {
  console.error('Public release verification FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Public release verification PASSED');
console.log(`- required public/legal files: ${requiredFiles.length}`);
console.log(`- tracked + untracked release-candidate files inspected for secret filename hazards: ${candidateFiles.length}`);
console.log('- release-candidate text checked for selected high-confidence secret patterns');
console.log('- source-available license marker: present');
console.log('- BossAI OS authority boundary marker: present');
console.log('This is packaging evidence only; it is not a production-readiness or real-user-validation claim.');

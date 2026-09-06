import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO = 'liufeng1976/bossai-radar-lite';

function runGh(args) {
  return execFileSync('gh', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ghJson(args) {
  const raw = runGh(args);
  return raw ? JSON.parse(raw) : null;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function ensureInsideRepo(target) {
  const absolute = path.resolve(ROOT, target);
  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Snapshot output must stay inside the repository.');
  }
  return { absolute, relative };
}

function main() {
  if (process.argv.includes('--self-test')) {
    const probe = ensureInsideRepo('.bossai-local/github-traffic/self-test.json');
    if (!probe.relative.startsWith('.bossai-local')) {
      throw new Error('Self-test output guard failed.');
    }
    console.log('GitHub traffic report self-test passed.');
    return;
  }

  const views = ghJson(['api', `repos/${REPO}/traffic/views`]);
  const clones = ghJson(['api', `repos/${REPO}/traffic/clones`]);
  const referrers = ghJson(['api', `repos/${REPO}/traffic/popular/referrers`]) || [];
  const popularPaths = ghJson(['api', `repos/${REPO}/traffic/popular/paths`]) || [];
  const community = ghJson(['repo', 'view', REPO, '--json', 'stargazerCount,forkCount,issues']);

  const report = {
    schemaVersion: 1,
    project: 'bossai-radar-lite',
    capturedAt: new Date().toISOString(),
    semantics: {
      traffic: 'GitHub Traffic API rolling 14-day window; not cumulative growth.',
      community: 'Point-in-time cumulative counts.',
    },
    traffic: {
      views: views.count,
      uniqueVisitors: views.uniques,
      clones: clones.count,
      uniqueCloners: clones.uniques,
    },
    community: {
      stars: community.stargazerCount,
      forks: community.forkCount,
      openIssues: community.issues.totalCount,
    },
    topReferrers: referrers,
    popularPaths,
  };

  const savePath = argValue('--save');
  if (savePath) {
    const target = ensureInsideRepo(savePath);
    if (!target.relative.startsWith('.bossai-local')) {
      throw new Error('Local traffic snapshots must be saved under .bossai-local/.');
    }
    fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
    fs.writeFileSync(target.absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.error(`Saved GitHub traffic snapshot: ${target.relative}`);
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  console.log('BossAI Radar Lite GitHub traffic report');
  console.log(`Captured:        ${report.capturedAt}`);
  console.log('Rolling 14-day traffic');
  console.log(`Views:           ${report.traffic.views}`);
  console.log(`Unique visitors: ${report.traffic.uniqueVisitors}`);
  console.log(`Clones:          ${report.traffic.clones}`);
  console.log(`Unique cloners:  ${report.traffic.uniqueCloners}`);
  console.log('Community counts');
  console.log(`Stars:           ${report.community.stars}`);
  console.log(`Forks:           ${report.community.forks}`);
  console.log(`Open issues:     ${report.community.openIssues}`);
  console.log('Top referrers');
  for (const item of report.topReferrers.slice(0, 10)) {
    console.log(`- ${item.referrer}: ${item.count} views / ${item.uniques} uniques`);
  }
  console.log('Popular paths');
  for (const item of report.popularPaths.slice(0, 10)) {
    console.log(`- ${item.path}: ${item.count} views / ${item.uniques} uniques`);
  }
}

try {
  main();
} catch (error) {
  console.error(`GitHub traffic report failed: ${error.message}`);
  process.exit(1);
}

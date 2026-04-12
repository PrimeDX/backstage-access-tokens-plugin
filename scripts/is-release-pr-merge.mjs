#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function listChangedFilesSinceFirstParent() {
  const parentsLine = runGit(['rev-list', '--parents', '-n', '1', 'HEAD']);
  const [, firstParent] = parentsLine.split(' ');

  if (!firstParent) {
    return [];
  }

  const output = runGit(['diff', '--name-only', `${firstParent}..HEAD`]);
  return output.split('\n').map(line => line.trim()).filter(Boolean);
}

function isVersionedPackageFile(filePath) {
  return /^packages\/[^/]+\/package\.json$/.test(filePath);
}

const pullRequestTitle = process.env.GITHUB_EVENT_PULL_REQUEST_TITLE ?? '';
const changedFiles = listChangedFilesSinceFirstParent();
const changedPackageVersions = changedFiles.filter(isVersionedPackageFile);

let shouldPublish = false;
let reason = '';

if (pullRequestTitle !== 'Version Packages') {
  reason = 'Merged pull request is not the Changesets release PR.';
} else if (changedPackageVersions.length === 0) {
  reason = 'Release PR merge does not include package version changes.';
} else {
  shouldPublish = true;
  reason = `Detected version-package changes in ${changedPackageVersions.length} package.json file(s).`;
}

process.stdout.write(
  JSON.stringify(
    {
      shouldPublish,
      reason,
      changedFiles,
      changedPackageVersions,
    },
    null,
    2,
  ),
);

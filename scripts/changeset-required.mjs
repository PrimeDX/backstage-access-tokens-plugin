#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const baseRef = process.argv[2];

if (!baseRef) {
  console.error('Usage: node scripts/changeset-required.mjs <base-ref-or-sha>');
  process.exit(1);
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function listChangedFiles(base) {
  const output = runGit(['diff', '--name-only', `${base}...HEAD`]);
  return output.split('\n').map(line => line.trim()).filter(Boolean);
}

function listPackages() {
  const packagesDir = path.join(repoRoot, 'packages');
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dir = path.join(packagesDir, entry.name);
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );

      return {
        name: entry.name,
        root: `packages/${entry.name}`,
        publishedFiles: new Set(packageJson.files ?? []),
      };
    });
}

function isChangesetFile(filePath) {
  return (
    filePath.startsWith('.changeset/') &&
    filePath.endsWith('.md') &&
    !filePath.endsWith('README.md')
  );
}

function isPublishablePackageChange(filePath, packages) {
  const pkg = packages.find(candidate => filePath.startsWith(`${candidate.root}/`));
  if (!pkg) {
    return false;
  }

  const relativePath = filePath.slice(`${pkg.root}/`.length);

  if (relativePath === 'package.json' || relativePath === 'README.md') {
    return true;
  }

  return pkg.publishedFiles.has(relativePath);
}

const changedFiles = listChangedFiles(baseRef);
const packages = listPackages();

const publishableChanges = changedFiles.filter(filePath =>
  isPublishablePackageChange(filePath, packages),
);
const changesetFiles = changedFiles.filter(isChangesetFile);

if (publishableChanges.length === 0) {
  console.log('No publishable package changes detected; no changeset required.');
  process.exit(0);
}

if (changesetFiles.length > 0) {
  console.log('Publishable package changes detected and a changeset file is present.');
  process.exit(0);
}

console.error('Publishable package changes detected, but no changeset file was added or updated.');
console.error('');
console.error('Changes requiring a changeset:');
for (const filePath of publishableChanges) {
  console.error(`- ${filePath}`);
}
console.error('');
console.error('Add or update a .changeset/*.md file to describe the release impact.');
process.exit(1);

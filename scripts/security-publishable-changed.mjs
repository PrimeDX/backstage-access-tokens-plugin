#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const BASE_REF = process.env.SECURITY_BASE_REF ?? 'origin/main';
const MODERATE_OR_HIGHER = new Set(['moderate', 'high', 'critical']);
const DEP_FILES = ['yarn.lock', 'package.json', 'packages'];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...opts,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function gitOutput(args, opts = {}) {
  const result = run('git', args, opts);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout.trim();
}

function hasPublishableLockChanges(baseRef) {
  const diffResult = run('git', [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    `${baseRef}...HEAD`,
    '--',
    'yarn.lock',
    'package.json',
    'packages/**/package.json',
  ]);

  const statusResult = run('git', [
    'status',
    '--porcelain',
    '--',
    'yarn.lock',
    'package.json',
    'packages/**/package.json',
  ]);

  return Boolean(diffResult.stdout.trim()) || Boolean(statusResult.stdout.trim());
}

function parseYarnAuditJsonLines(output) {
  const advisories = new Map();
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (parsed.type !== 'auditAdvisory' || !parsed.data?.advisory) {
      continue;
    }

    const advisory = parsed.data.advisory;
    const severity = String(advisory.severity ?? '').toLowerCase();
    if (!MODERATE_OR_HIGHER.has(severity)) {
      continue;
    }

    const id = String(advisory.id ?? '').trim();
    if (!id) {
      continue;
    }

    advisories.set(id, {
      id,
      moduleName: String(advisory.module_name ?? '').trim(),
      severity,
      title: String(advisory.title ?? '').trim(),
      url: String(advisory.url ?? '').trim(),
    });
  }

  return advisories;
}

function runRootAudit(cwd) {
  const result = run('yarn', ['audit', '--level', 'moderate', '--json'], {
    cwd,
    env: process.env,
  });

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  return parseYarnAuditJsonLines(combinedOutput);
}

function extractBaseTree(baseRef) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'security-publishable-'));
  const archive = run('git', ['archive', '--format=tar', baseRef, ...DEP_FILES], {
    encoding: null,
  });

  if (archive.status !== 0) {
    const stderr = archive.stderr ? archive.stderr.toString() : '';
    throw new Error(`git archive failed for ${baseRef}: ${stderr}`);
  }

  const untar = run('tar', ['-x', '-C', tempRoot], {
    input: archive.stdout,
    encoding: null,
  });

  if (untar.status !== 0) {
    const stderr = untar.stderr ? untar.stderr.toString() : '';
    throw new Error(`tar extract failed for ${baseRef}: ${stderr}`);
  }

  return tempRoot;
}

function printAdvisories(title, advisories) {
  console.error(title);
  for (const advisory of advisories) {
    const packageDisplay = advisory.moduleName || 'unknown-package';
    const urlDisplay = advisory.url ? `\n  ${advisory.url}` : '';
    console.error(`- [${advisory.severity}] ${packageDisplay} (${advisory.id})\n  ${advisory.title}${urlDisplay}`);
  }
}

function main() {
  try {
    gitOutput(['rev-parse', '--verify', BASE_REF]);
  } catch {
    console.log(`Skipping security:publishable: base ref "${BASE_REF}" not found. Run with SECURITY_BASE_REF=<ref> once available.`);
    process.exit(0);
  }

  if (!hasPublishableLockChanges(BASE_REF)) {
    console.log(`No publishable dependency changes detected against ${BASE_REF}. Skipping.`);
    process.exit(0);
  }

  let tempRoot;
  try {
    tempRoot = extractBaseTree(BASE_REF);
    const baseAdvisories = runRootAudit(tempRoot);
    const headAdvisories = runRootAudit(resolve('.'));

    const newAdvisories = [...headAdvisories.values()].filter(a => !baseAdvisories.has(a.id));
    if (newAdvisories.length === 0) {
      console.log(`No new moderate/high/critical advisories introduced in publishable dependencies compared to ${BASE_REF}.`);
      process.exit(0);
    }

    printAdvisories(`New moderate/high/critical advisories introduced in publishable dependencies (base: ${BASE_REF}):`, newAdvisories);
    process.exit(1);
  } finally {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

main();

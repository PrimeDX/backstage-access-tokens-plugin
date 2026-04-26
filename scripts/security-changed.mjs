#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const HARNESS_LOCKFILE = 'e2e/harness/yarn.lock';
const HARNESS_DIR = 'e2e/harness';
const BASE_REF = process.env.SECURITY_BASE_REF ?? 'origin/main';
const MODERATE_OR_HIGHER = new Set(['moderate', 'high', 'critical']);

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

function hasLockfileChanges(baseRef) {
  const diffResult = run('git', [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    `${baseRef}...HEAD`,
    '--',
    HARNESS_LOCKFILE,
  ]);

  const statusResult = run('git', ['status', '--porcelain', '--', HARNESS_LOCKFILE]);

  return Boolean(diffResult.stdout.trim()) || Boolean(statusResult.stdout.trim());
}

function parseAuditJsonLines(output) {
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

    const payload = parsed?.children;
    const severity = String(payload?.Severity ?? '').toLowerCase();
    if (!MODERATE_OR_HIGHER.has(severity)) {
      continue;
    }
    const advisoryUrl = String(payload?.URL ?? '').trim();
    if (!advisoryUrl) {
      continue;
    }

    const advisoryId = String(payload?.ID ?? parsed?.value ?? '').trim();
    if (!advisoryId) {
      continue;
    }

    advisories.set(advisoryId, {
      id: advisoryId,
      packageName: String(parsed?.value ?? '').trim(),
      severity,
      issue: String(payload?.Issue ?? '').trim(),
      url: advisoryUrl,
    });
  }

  return advisories;
}

function runHarnessAudit(cwd) {
  const result = run(
    'yarn',
    ['npm', 'audit', '-A', '-R', '--severity', 'moderate', '--json'],
    {
      cwd,
      env: process.env,
    },
  );

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  return parseAuditJsonLines(combinedOutput);
}

function extractBaseHarnessTree(baseRef) {
  const lsTree = run('git', ['ls-tree', '-d', '--name-only', baseRef, HARNESS_DIR]);
  if (lsTree.status !== 0 || !lsTree.stdout.trim()) {
    return null;
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'security-changed-'));
  const archive = run('git', ['archive', '--format=tar', baseRef, HARNESS_DIR], {
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

  return {
    tempRoot,
    harnessCwd: resolve(tempRoot, HARNESS_DIR),
  };
}

function printAdvisories(title, advisories) {
  console.error(title);
  for (const advisory of advisories) {
    const packageDisplay = advisory.packageName || 'unknown-package';
    const urlDisplay = advisory.url ? `\n  ${advisory.url}` : '';
    console.error(
      `- [${advisory.severity}] ${packageDisplay} (${advisory.id})\n  ${advisory.issue}${urlDisplay}`,
    );
  }
}

function main() {
  try {
    gitOutput(['rev-parse', '--verify', BASE_REF]);
  } catch {
    console.log(
      `Skipping security:changed: base ref "${BASE_REF}" not found. Run with SECURITY_BASE_REF=<ref> once available.`,
    );
    process.exit(0);
  }

  if (!hasLockfileChanges(BASE_REF)) {
    console.log(`No changes detected in ${HARNESS_LOCKFILE} against ${BASE_REF}. Skipping.`);
    process.exit(0);
  }

  let extracted;
  try {
    extracted = extractBaseHarnessTree(BASE_REF);
    const baseAdvisories = extracted
      ? runHarnessAudit(extracted.harnessCwd)
      : new Map();
    const headAdvisories = runHarnessAudit(resolve(HARNESS_DIR));

    const newAdvisories = [...headAdvisories.values()].filter(
      advisory => !baseAdvisories.has(advisory.id),
    );

    if (newAdvisories.length === 0) {
      console.log(
        `No new moderate/high/critical advisories introduced in ${HARNESS_LOCKFILE} compared to ${BASE_REF}.`,
      );
      process.exit(0);
    }

    printAdvisories(
      `New moderate/high/critical advisories introduced in ${HARNESS_LOCKFILE} (base: ${BASE_REF}):`,
      newAdvisories,
    );
    process.exit(1);
  } finally {
    if (extracted?.tempRoot) {
      rmSync(extracted.tempRoot, { recursive: true, force: true });
    }
  }
}

main();

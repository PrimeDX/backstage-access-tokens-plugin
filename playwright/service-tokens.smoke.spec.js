import { test, expect } from '@playwright/test';

test.setTimeout(240_000);

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(daysFromNow) {
  return addDays(new Date(), daysFromNow).toISOString().slice(0, 10);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseEntityRef(entityRef) {
  const [kindPart = '', targetPart = ''] = String(entityRef).split(':', 2);
  const [namespacePart = 'default', namePart = ''] = targetPart.split('/', 2);
  const kind = kindPart.toLocaleLowerCase('en-US');
  const namespace = namespacePart || 'default';
  const name = namePart;

  if (!kind || !name) {
    throw new Error(`Invalid entity ref: ${entityRef}`);
  }

  return { kind, namespace, name };
}

async function maybeEnterGuest(page) {
  const enterButton = page.getByRole('button', { name: /^Enter$/i });
  if (await enterButton.count()) {
    await enterButton.first().click({ timeout: 2000 }).catch(() => {});
  }
}

async function fetchGuestAccessToken(page, backendUrl) {
  let response;
  let rawPayload = '';

  try {
    response = await page.request.get(`${backendUrl}/api/auth/guest/refresh`);
    rawPayload = await response.text();
  } catch (error) {
    return {
      status: 'fetch-error',
      token: '',
      payloadSnippet: String(error?.message ?? error ?? 'unknown fetch error'),
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    payload = {};
  }

  return {
    status: response.status(),
    token: payload?.backstageIdentity?.token ?? '',
    payloadSnippet: rawPayload.replace(/\s+/g, ' ').slice(0, 300),
  };
}

async function waitForGuestAuthReady(page) {
  const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:7007';
  const timeoutMs = 120_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const snapshot = await fetchGuestAccessToken(page, backendUrl);
    if (snapshot.status === 200 && snapshot.token) {
      return;
    }
    await page.waitForTimeout(1000);
  }

  throw new Error('guest auth endpoint did not become ready in time');
}

async function readCatalogGroups(page, url, token) {
  let response;
  let rawPayload = '';

  try {
    response = await page.request.get(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    rawPayload = await response.text();
  } catch (error) {
    return {
      status: 'fetch-error',
      refs: [],
      payloadSnippet: String(error?.message ?? error ?? 'unknown fetch error'),
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    payload = [];
  }

  const entities = Array.isArray(payload) ? payload : payload?.items ?? [];
  const refs = entities.map(entity => {
    const namespace = entity?.metadata?.namespace ?? 'default';
    const name = entity?.metadata?.name ?? '';
    return `group:${namespace}/${name}`;
  });

  return {
    status: response.status(),
    refs,
    payloadSnippet: rawPayload.replace(/\s+/g, ' ').slice(0, 300),
  };
}

async function readCatalogEntityByName(page, url, token) {
  let response;
  let rawPayload = '';

  try {
    response = await page.request.get(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    rawPayload = await response.text();
  } catch (error) {
    return {
      status: 'fetch-error',
      payloadSnippet: String(error?.message ?? error ?? 'unknown fetch error'),
    };
  }

  return {
    status: response.status(),
    payloadSnippet: rawPayload.replace(/\s+/g, ' ').slice(0, 300),
  };
}

async function waitForServiceTokensPage(page) {
  const heading = page.getByRole('main').getByRole('heading', {
    name: 'Service Tokens',
    exact: true,
  });
  const enterButton = page.getByRole('button', { name: /^Enter$/i });
  const timeoutMs = 60_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const headingVisible = await heading.isVisible().catch(() => false);
    if (headingVisible) {
      return;
    }

    const guestErrorVisible = await page
      .getByText(/You cannot sign in as a guest/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (guestErrorVisible) {
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1000);
      continue;
    }

    const canEnter = await enterButton.isVisible().catch(() => false);
    if (canEnter) {
      await enterButton.first().click({ timeout: 2000 }).catch(() => {});
    }

    await page.waitForTimeout(500);
  }

  await expect(heading).toBeVisible();
}

async function waitForCatalogGroup(page, entityRef) {
  const timeoutMs = 180_000;
  const start = Date.now();
  const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:7007';
  const { kind, namespace, name } = parseEntityRef(entityRef);
  const groupsUrlLower = `${backendUrl}/api/catalog/entities?filter=kind=group&limit=200`;
  const groupsUrlUpper = `${backendUrl}/api/catalog/entities?filter=kind=Group&limit=200`;
  const groupByNameUrl = `${backendUrl}/api/catalog/entities/by-name/${kind}/${namespace}/${name}`;
  let lastStatus = 'n/a';
  let lastRefs = [];
  let lastSnippet = '';

  while (Date.now() - start < timeoutMs) {
    const authSnapshot = await fetchGuestAccessToken(page, backendUrl);
    const lowerSnapshot = await readCatalogGroups(page, groupsUrlLower, authSnapshot.token);
    const upperSnapshot = await readCatalogGroups(page, groupsUrlUpper, authSnapshot.token);
    const byNameSnapshot = await readCatalogEntityByName(page, groupByNameUrl, authSnapshot.token);

    lastStatus = `auth:${authSnapshot.status} lower:${lowerSnapshot.status} upper:${upperSnapshot.status} byName:${byNameSnapshot.status}`;
    lastRefs = lowerSnapshot.refs.length ? lowerSnapshot.refs : upperSnapshot.refs;
    lastSnippet = byNameSnapshot.status === 200
      ? byNameSnapshot.payloadSnippet
      : lowerSnapshot.refs.length
      ? lowerSnapshot.payloadSnippet
      : upperSnapshot.refs.length
      ? upperSnapshot.payloadSnippet
      : authSnapshot.payloadSnippet ||
        byNameSnapshot.payloadSnippet ||
        lowerSnapshot.payloadSnippet ||
        upperSnapshot.payloadSnippet;

    if (byNameSnapshot.status === 200 || lastRefs.includes(entityRef)) {
      return;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(
    `waiting for catalog group ${entityRef} failed; urls=[${groupsUrlLower}, ${groupsUrlUpper}, ${groupByNameUrl}]; status=${lastStatus}; refs=${JSON.stringify(lastRefs)}; payload=${lastSnippet}`,
  );
}

async function waitForCreateTokenActionable(page) {
  const createButton = page.getByRole('button', { name: /Create token|Loading groups/i });
  const timeoutMs = 120_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const enabled = await createButton.isEnabled().catch(() => false);
    if (enabled) {
      await expect(page.getByRole('button', { name: 'Create token' })).toBeVisible();
      return;
    }
    await page.waitForTimeout(1000);
  }

  throw new Error('Create token button never became actionable (groups not ready)');
}

async function selectMaterialOption(page, _label, optionName) {
  const dialog = page.getByRole('dialog');
  const field = dialog.locator('[role="button"][aria-haspopup="listbox"]').first();
  const optionMatcher = new RegExp(`\\b${escapeRegex(optionName)}\\b`, 'i');
  const timeoutMs = 120_000;
  const start = Date.now();
  let lastOptions = [];

  await expect(field).toBeVisible();

  while (Date.now() - start < timeoutMs) {
    await field.click().catch(() => {});
    const optionElements = page.getByRole('option');
    const optionCount = await optionElements.count();
    lastOptions = [];

    for (let i = 0; i < optionCount; i += 1) {
      const text = (await optionElements.nth(i).innerText().catch(() => '')).trim();
      if (text) {
        lastOptions.push(text);
      }
      if (optionMatcher.test(text)) {
        await optionElements.nth(i).click();
        return;
      }
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1000);
  }

  throw new Error(
    `waiting for "${optionName}" option to become available; visibleOptions=${JSON.stringify(lastOptions)}`,
  );
}

test('create, audit, and revoke a service token from the admin UI', async ({ page }) => {
  const owningGroupRef = 'group:development/platform';
  const { name: owningGroupName } = parseEntityRef(owningGroupRef);
  const tokenName = `ui-smoke-${Date.now()}`;
  const revokeReason = 'Playwright smoke revocation';

  await waitForGuestAuthReady(page);
  await page.goto('/admin/service-tokens');
  await maybeEnterGuest(page);
  await waitForServiceTokensPage(page);

  await waitForCatalogGroup(page, owningGroupRef);
  await waitForCreateTokenActionable(page);

  await page.getByRole('button', { name: 'Create token' }).click();

  const createDialog = page.getByRole('dialog');
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByText('Create service token')).toBeVisible();

  await createDialog.locator('input').first().fill(tokenName);
  await createDialog.locator('textarea').first().fill('Created by the Playwright smoke test');
  await selectMaterialOption(page, 'Owning group', owningGroupName);
  await createDialog.getByRole('checkbox', { name: /catalog:read/i }).check();
  await createDialog.locator('input[type="date"]').fill(isoDate(60));
  await createDialog.getByRole('button', { name: 'Create token' }).click();

  await expect(page.getByText('Token created')).toBeVisible();
  const rawTokenText = page.getByText(/^bsst_[A-Za-z0-9_-]+$/).last();
  await expect(rawTokenText).toBeVisible();

  await createDialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const row = page.getByRole('row', { name: new RegExp(tokenName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Active');

  await row.getByRole('button', { name: 'Audit' }).click();
  const auditDialog = page.getByRole('dialog');
  const closeAuditButton = auditDialog.getByRole('button', { name: /^Close$/ }).last();
  await expect(auditDialog.getByText(`Audit log — ${tokenName}`)).toBeVisible();
  const auditRows = auditDialog.getByRole('row');
  await expect(auditRows).toHaveCount(2);
  await expect(auditRows.nth(1)).toContainText('created');
  await closeAuditButton.click();

  await row.getByRole('button', { name: 'Revoke' }).click();
  const revokeDialog = page.getByRole('dialog');
  await expect(revokeDialog.getByText('Revoke token?')).toBeVisible();
  await revokeDialog.locator('textarea').first().fill(revokeReason);
  await revokeDialog.getByRole('button', { name: 'Revoke' }).click();

  await expect(revokeDialog).toBeHidden();
  await expect(row).toContainText('Revoked');
  await expect(row.getByRole('button', { name: 'Revoke' })).toBeDisabled();

  await row.getByRole('button', { name: 'Audit' }).click();
  await expect(auditDialog.getByText(`Audit log — ${tokenName}`)).toBeVisible();
  const updatedAuditRows = auditDialog.getByRole('row');
  await expect(updatedAuditRows).toHaveCount(3);
  await expect(updatedAuditRows.nth(1)).toContainText('revoked');
  await expect(updatedAuditRows.nth(1)).toContainText(revokeReason);
  await expect(updatedAuditRows.nth(2)).toContainText('created');
  await closeAuditButton.click();
});

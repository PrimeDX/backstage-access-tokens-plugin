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

async function selectAutocompleteOption(page, label, query, optionName) {
  const field = page.getByRole('textbox', { name: label });
  await expect(field).toBeVisible();
  await field.fill(query);

  const option = page.getByRole('option', { name: new RegExp(escapeRegex(optionName), 'i') });
  await expect(option.first()).toBeVisible();
  await option.first().click();
}

async function waitForPersonalTokensPage(page) {
  const createButton = page.getByRole('button', { name: 'Create token' });
  const enterButton = page.getByRole('button', { name: /^Enter$/i });
  const timeoutMs = 60_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const createVisible = await createButton.isVisible().catch(() => false);
    if (createVisible) {
      return;
    }

    const canEnter = await enterButton.isVisible().catch(() => false);
    if (canEnter) {
      await enterButton.first().click({ timeout: 2000 }).catch(() => {});
    }

    await page.waitForTimeout(500);
  }

  await expect(createButton).toBeVisible();
}

async function rowIndex(row) {
  return Number(await row.getAttribute('index'));
}

async function createPersonalAccessToken(page, name) {
  await page.getByRole('button', { name: 'Create token' }).click();
  const createDialog = page.getByRole('dialog');
  await expect(createDialog.getByText('Create personal access token')).toBeVisible();
  await createDialog.locator('input').first().fill(name);
  await createDialog.locator('input[type="datetime-local"]').fill(
    addDays(new Date(), 30).toISOString().slice(0, 16),
  );
  await createDialog.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText('Create personal access token')).toBeVisible();
  await expect(page.getByText(/integration, tool, or automation/i)).toBeVisible();
  await expect(page.getByText(/authenticates as your user principal/i)).toBeVisible();
  await page.getByRole('button', { name: 'Create token' }).click();

  await expect(page.getByText('Token created')).toBeVisible();
  await expect(page.getByText(/Do not send this refresh token directly/i)).toBeVisible();
  await expect(page.getByLabel('token value')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const row = page.getByRole('row', { name: new RegExp(escapeRegex(name)) });
  await expect(row).toBeVisible();
  return row;
}

test('create, audit, and revoke a service token from the admin UI', async ({ page }) => {
  const owningGroupRef = 'group:development/platform';
  const { namespace: owningGroupNamespace, name: owningGroupName } = parseEntityRef(owningGroupRef);
  const owningGroupDisplay = `${owningGroupNamespace}/${owningGroupName}`;
  const tokenSuffix = Date.now();
  const tokenName = `ui-smoke-a-${tokenSuffix}`;
  const newerTokenName = `ui-smoke-b-${tokenSuffix}`;
  const revokeReason = 'Playwright smoke revocation';

  await waitForGuestAuthReady(page);
  await page.goto('/admin/access-tokens');
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
  const rawTokenText = page.getByText(/^bsat_[A-Za-z0-9_-]+$/).last();
  await expect(rawTokenText).toBeVisible();

  await createDialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const row = page.getByRole('row', { name: new RegExp(escapeRegex(tokenName)) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Active');
  await expect(row).toContainText(owningGroupDisplay);
  await expect(row).not.toContainText(owningGroupRef);
  await expect(row).toContainText('development/guest');
  await expect(row).not.toContainText('user:development/guest');

  const groupFilter = page.getByRole('textbox', { name: 'Group' });
  await expect(groupFilter).toBeVisible();
  await groupFilter.fill(owningGroupName.slice(0, 4));
  await expect(row).toBeVisible();

  await selectAutocompleteOption(page, 'Group', owningGroupName, owningGroupRef);
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: 'Create token' }).click();
  await expect(createDialog).toBeVisible();
  await createDialog.locator('input').first().fill(newerTokenName);
  await createDialog.locator('textarea').first().fill('Created by the Playwright smoke test');
  await selectMaterialOption(page, 'Owning group', owningGroupName);
  await createDialog.getByRole('checkbox', { name: /catalog:read/i }).check();
  await createDialog.locator('input[type="date"]').fill(isoDate(60));
  await createDialog.getByRole('button', { name: 'Create token' }).click();
  await expect(page.getByText('Token created')).toBeVisible();
  await createDialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const newerRow = page.getByRole('row', { name: new RegExp(escapeRegex(newerTokenName)) });
  await expect(newerRow).toBeVisible();

  const createdHeader = page.getByRole('columnheader', { name: 'Created', exact: true });
  const createdSortButton = createdHeader.getByRole('button', { name: 'Created', exact: true }).first();
  await expect(newerRow).toHaveAttribute('index', '0');
  await expect(row).toHaveAttribute('index', '1');

  await createdSortButton.click();
  await expect(row).toBeVisible();
  await expect(newerRow).toBeVisible();
  await expect(row).toHaveAttribute('index', '0');
  await expect(newerRow).toHaveAttribute('index', '1');

  await createdSortButton.click();
  await expect(row).toBeVisible();
  await expect(newerRow).toBeVisible();
  await expect(newerRow).toHaveAttribute('index', '0');
  await expect(row).toHaveAttribute('index', '1');

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

test('create and sort personal access tokens from the settings UI', async ({ page }) => {
  const tokenSuffix = Date.now();
  const tokenName = `personal-smoke-a-${tokenSuffix}`;
  const newerTokenName = `personal-smoke-b-${tokenSuffix}`;

  await waitForGuestAuthReady(page);
  await page.goto('/settings/personal-tokens');
  await maybeEnterGuest(page);
  await waitForPersonalTokensPage(page);

  const row = await createPersonalAccessToken(page, tokenName);
  const newerRow = await createPersonalAccessToken(page, newerTokenName);

  const createdHeader = page.getByRole('columnheader', { name: 'Created', exact: true });
  const createdSortButton = createdHeader.getByRole('button', { name: 'Created', exact: true }).first();
  await expect(newerRow).toBeVisible();
  await expect(row).toBeVisible();
  expect(await rowIndex(newerRow)).toBeLessThan(await rowIndex(row));

  await createdSortButton.click();
  await expect(newerRow).toBeVisible();
  await expect(row).toBeVisible();
  expect(await rowIndex(row)).toBeLessThan(await rowIndex(newerRow));

  await createdSortButton.click();
  await expect(newerRow).toBeVisible();
  await expect(row).toBeVisible();
  expect(await rowIndex(newerRow)).toBeLessThan(await rowIndex(row));

  const statusHeader = page.getByRole('columnheader', { name: 'Status', exact: true });
  await statusHeader.getByRole('button', { name: 'Status', exact: true }).first().click();
  await expect(newerRow).toBeVisible();
  await expect(row).toBeVisible();

  const beforeActionsClick = {
    row: await rowIndex(row),
    newerRow: await rowIndex(newerRow),
  };
  const actionsHeader = page.getByRole('columnheader', { name: 'Actions', exact: true });
  await actionsHeader.click();
  await expect(row).toHaveAttribute('index', String(beforeActionsClick.row));
  await expect(newerRow).toHaveAttribute('index', String(beforeActionsClick.newerRow));
});

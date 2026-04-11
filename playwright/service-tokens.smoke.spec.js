import { test, expect } from '@playwright/test';

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(daysFromNow) {
  return addDays(new Date(), daysFromNow).toISOString().slice(0, 10);
}

async function maybeEnterGuest(page) {
  const enterButton = page.getByRole('button', { name: /^Enter$/i });
  if (await enterButton.count()) {
    await enterButton.first().click();
  }
}

async function selectMaterialOption(page, _label, optionName) {
  const dialog = page.getByRole('dialog');
  const field = dialog.getByRole('button').first();
  await field.click();

  const option = page
    .getByRole('option', { name: optionName, exact: true })
    .or(page.getByRole('menuitem', { name: optionName, exact: true }))
    .or(page.getByText(optionName, { exact: true }));

  await expect(option.first()).toBeVisible();
  await option.first().click();
}

test('create, audit, and revoke a service token from the admin UI', async ({ page }) => {
  const tokenName = `ui-smoke-${Date.now()}`;
  const revokeReason = 'Playwright smoke revocation';

  await page.goto('/admin/service-tokens');
  await maybeEnterGuest(page);

  await expect(page.getByRole('main').getByRole('heading', { name: 'Service Tokens' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create token' })).toBeVisible();

  await page.getByRole('button', { name: 'Create token' }).click();

  const createDialog = page.getByRole('dialog');
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByText('Create service token')).toBeVisible();

  await createDialog.locator('input').first().fill(tokenName);
  await createDialog.locator('textarea').first().fill('Created by the Playwright smoke test');
  await selectMaterialOption(page, 'Owning group', 'platform');
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

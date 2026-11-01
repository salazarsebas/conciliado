import { expect, test, type Page } from '@playwright/test';
import { BATCH_TX, EXPLORER_BASE } from '../src/landing/batch';

// Longest the rebuild may take, including its own RPC retries. Waits below
// are on page state, never fixed sleeps.
const REBUILD_TIMEOUT_MS = 90_000;

/** Collect uncaught page errors so a test can assert there were none. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('landing: rebuild from chain', () => {
  test('rebuilds 6 of 6 matched, ties out, and links the batch on explorer.arc.io', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await expect(page).toHaveTitle(/Conciliado/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rebuild it from the chain');
    await expect(page.getByText('No ledger yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Rebuild from chain' }).click();

    // Wait for the outcome of the rebuild. Resolve on any end state (matched,
    // error, or still pending after the app's own retries) so a failed rebuild
    // reports its real cause at once instead of timing out.
    const matched = page.getByText('6 of 6 matched', { exact: true });
    const retry = page.getByRole('button', { name: 'Retry' });
    const pending = page.getByText('Pending. Waiting for the receipt.');
    await matched.or(retry).or(pending).waitFor({ timeout: REBUILD_TIMEOUT_MS });
    // The outcome is settled by now, so assert on it without polling.
    expect(await retry.count(), 'rebuild ended in the error state').toBe(0);
    expect(await pending.count(), 'rebuild stayed pending: the RPC kept answering with no receipt').toBe(0);

    // 6 of 6 matched, every ledger row matched
    await expect(matched).toBeVisible();
    await expect(page.getByText('(rebuilt from chain)')).toBeVisible();
    const table = page.getByRole('table');
    await expect(table.getByText('Matched', { exact: true })).toHaveCount(6);
    await expect(table.getByText('Mismatch')).toHaveCount(0);
    await expect(table.getByText('Not matched')).toHaveCount(0);

    // The tie-out: ledger equals the wallet balance change, difference zero
    await expect(page.getByText('Wallet balance change')).toBeVisible();
    await expect(page.getByText('Ties out. 6 of 6 matched.', { exact: true })).toBeVisible();
    await expect(page.getByText('0.000000 USDC, 0 wei')).toBeVisible();
    await expect(page.getByText('Does not tie')).toHaveCount(0);

    // Explorer link for the batch points at explorer.arc.io
    const expectedTxUrl = `${EXPLORER_BASE}/tx/${BATCH_TX}`;
    expect(new URL(expectedTxUrl).hostname).toBe('explorer.arc.io');
    const txLink = page.locator(`a[href="${expectedTxUrl}"]`).first();
    await expect(txLink).toBeVisible();
    await expect(txLink).toHaveAttribute('target', '_blank');
    await expect(txLink).toHaveAttribute('rel', /noopener/);

    // Every explorer link on the page stays on explorer.arc.io
    const hrefs = await page
      .locator('a[href*="explorer"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(new URL(href).hostname, href).toBe('explorer.arc.io');
    }

    expect(errors, 'uncaught page errors').toEqual([]);
  });
});

test.describe('run page without a wallet', () => {
  test('/run loads and shows the connect state', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/run');
    await expect(page.getByRole('heading', { level: 1, name: 'Run a batch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Connect wallet' })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();

    // Network choice is offered and no pay action exists before a batch is loaded
    await expect(page.getByRole('radiogroup', { name: 'Network' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pay/i })).toHaveCount(0);

    expect(errors, 'uncaught page errors').toEqual([]);
  });

  test('direct load of /run returns the app, not a 404', async ({ page, request }) => {
    // The Vercel rewrite serves index.html for any path.
    const response = await request.get('/run');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('<div id="root">');

    const navigation = await page.goto('/run');
    expect(navigation?.status()).toBe(200);
    await expect(page).toHaveURL(/\/run$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Run a batch' })).toBeVisible();
  });
});

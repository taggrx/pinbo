import { test, expect, aliceWallet } from '../fixtures.js';

test.describe('Posting messages', () => {
  test('CONNECT WALLET button is visible when disconnected', async ({ page }) => {
    // No mock provider injected — disconnected state
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'CONNECT WALLET' })).toBeVisible();
  });

  test('POST button appears after connecting wallet', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await expect(page.getByRole('button', { name: 'POST' })).toBeVisible({ timeout: 10_000 });
  });

  test('PostForm appears after clicking POST', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'POST' }).click({ timeout: 10_000 });
    // The editor textarea should appear (markdown mode is set in fixture)
    await expect(page.locator('.toastui-editor-md-container textarea')).toBeVisible();
  });

  test('submitting a message adds it to the feed', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'POST' }).click({ timeout: 10_000 });

    await page.locator('.toastui-editor-md-container textarea').fill('E2E test post');
    await page.getByRole('button', { name: 'SEND' }).click();

    // After receipt, message card appears in feed
    await expect(
      page.locator('.message.card').filter({ hasText: 'E2E test post' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('SEND button is disabled when message is empty', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'POST' }).click({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'SEND' })).toBeDisabled();
  });

  test('fee is displayed in the post form', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'POST' }).click({ timeout: 10_000 });
    await expect(page.locator('.fee-info')).toContainText('0.0001 ETH');
  });

  test('draft persists in localStorage across reload', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'POST' }).click({ timeout: 10_000 });

    await page.locator('.toastui-editor-md-container textarea').fill('unsaved draft text');

    // The effect runs on next tick, give it a moment
    await page.waitForTimeout(300);

    // Reload — draft should be restored
    await page.reload();

    // After reload, wagmi may auto-reconnect or stay disconnected.
    // Wait for either the POST button (auto-reconnected) or CONNECT WALLET to be stable.
    const postBtn = page.getByRole('button', { name: 'POST' });
    const connectBtn = page.getByRole('button', { name: 'CONNECT WALLET' });
    await expect(connectBtn.or(postBtn)).toBeVisible({ timeout: 15_000 });
    // Give wagmi a moment to fully settle
    await page.waitForTimeout(500);

    if (!(await postBtn.isVisible())) {
      await connectBtn.click();
    }
    await postBtn.click({ timeout: 10_000 });
    // Draft restored → editor value non-empty → SEND button enabled
    await expect(page.locator('.post-section')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'SEND' })).toBeEnabled({ timeout: 5_000 });
  });

  test('CLOSE button hides the post form', async ({ alicePage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'POST' }).click({ timeout: 10_000 });
    await expect(page.locator('.toastui-editor-md-container textarea')).toBeVisible();

    await page.getByRole('button', { name: 'CLOSE' }).click();
    await expect(page.locator('.toastui-editor-md-container textarea')).not.toBeVisible();
  });

  test('wrong network banner shows when provider reports wrong chain', async ({ page }) => {
    // Inject a mock provider that claims a wrong chain ID (0x539 = 1337, not 1)
    await page.addInitScript(() => {
      localStorage.setItem('pinbo_editor_mode', 'markdown');
    });
    await page.addInitScript(`
      (function() {
        var ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        window.ethereum = {
          isMetaMask: false,
          chainId: '0x539',
          selectedAddress: ACCOUNT,
          request: function(args) {
            if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts')
              return Promise.resolve([ACCOUNT]);
            if (args.method === 'eth_chainId') return Promise.resolve('0x539');
            if (args.method === 'net_version') return Promise.resolve('1337');
            return Promise.reject(new Error('not implemented'));
          },
          on: function() {},
          removeListener: function() {},
        };
      })();
    `);
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await expect(page.locator('.error-banner')).toBeVisible({ timeout: 10_000 });
  });
});

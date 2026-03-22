import {
  test,
  expect,
  postMessageNode,
  getMessageEvent,
  aliceClient,
  bobClient,
  TOPIC_TYPE,
  testConfig,
} from '../fixtures.js';
import { hexToBytes, bytesToHex } from 'viem';
import { decode as msgpackDecode } from '@msgpack/msgpack';

test.describe('Inbox (ADDRESS topic / DMs)', () => {
  test('empty inbox shows correct empty state', async ({ alicePage: page }) => {
    await page.goto(`/#/i/${testConfig.aliceAddress}`);
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('NO MESSAGES ADDRESSED TO THIS ADDRESS.')).toBeVisible();
  });

  test('DM button appears on a profile page when connected', async ({ alicePage: page }) => {
    await page.goto(`/#/a/${testConfig.bobAddress}`);
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await expect(page.getByRole('button', { name: 'DM' })).toBeVisible({ timeout: 10_000 });
  });

  test('clicking DM locks the TO field to the profile address', async ({ alicePage: page }) => {
    await page.goto(`/#/a/${testConfig.bobAddress}`);
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'DM' }).click({ timeout: 10_000 });

    // The TO field should show Bob's address and be disabled
    const toInput = page.locator('.to-input');
    await expect(toInput).toBeVisible();
    await expect(toInput).toHaveValue(testConfig.bobAddress);
    await expect(toInput).toBeDisabled();
  });

  test('submitted DM appears in the recipient inbox', async ({ alicePage: page }) => {
    await page.goto(`/#/a/${testConfig.bobAddress}`);
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'DM' }).click({ timeout: 10_000 });

    await page.locator('.toastui-editor-md-container textarea').fill('Hey Bob, this is a DM!');
    await page.getByRole('button', { name: 'SEND' }).click();

    // Wait for the tx to land (navigates to permalink)
    await expect(page).toHaveURL(/#\/p\/0x[a-f0-9]{64}/i, { timeout: 30_000 });

    // Reload so cachedLatestBlock is refreshed to include the new block
    await page.reload();
    // Wait for the page to be ready (loading state resolved)
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 15_000 });

    // Navigate to Bob's inbox
    await page.goto(`/#/i/${testConfig.bobAddress}`);
    await expect(
      page.locator('.message.card').filter({ hasText: 'Hey Bob, this is a DM!' }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('sent DM encodes ADDRESS topic with recipient bytes on-chain', async ({
    alicePage: page,
  }) => {
    await page.goto(`/#/a/${testConfig.bobAddress}`);
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.getByRole('button', { name: 'DM' }).click({ timeout: 10_000 });

    await page
      .locator('.toastui-editor-md-container textarea')
      .fill('Topic encoding test DM');
    await page.getByRole('button', { name: 'SEND' }).click();

    await expect(page).toHaveURL(/#\/p\/0x[a-f0-9]{64}/i, { timeout: 30_000 });
    const dmHash = page.url().match(/#\/p\/(0x[a-f0-9]{64})/i)?.[1] as `0x${string}`;

    const log = await getMessageEvent(dmHash);
    expect(log).not.toBeNull();

    const rawBytes = hexToBytes(log!.args.message as `0x${string}`);
    expect(rawBytes[0]).toBe(0x01);
    const decoded = msgpackDecode(rawBytes.slice(1)) as {
      message: Uint8Array;
      topics?: Array<[number, Uint8Array]>;
    };
    expect(decoded.topics).toBeDefined();
    const addrTopic = decoded.topics!.find(([t]) => t === TOPIC_TYPE.ADDRESS);
    expect(addrTopic).toBeDefined();
    // The ADDRESS payload should match Bob's address bytes
    expect(bytesToHex(addrTopic![1]).toLowerCase()).toBe(
      testConfig.bobAddress.toLowerCase(),
    );
  });

  test('own inbox shows YOUR INBOX label', async ({ alicePage: page }) => {
    await page.goto(`/#/i/${testConfig.aliceAddress}`);
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await expect(page.getByText('YOUR INBOX')).toBeVisible({ timeout: 10_000 });
  });

  test('own inbox shows LOGOUT button instead of POST', async ({ alicePage: page }) => {
    await page.goto(`/#/i/${testConfig.aliceAddress}`);
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await expect(page.getByRole('button', { name: 'LOGOUT' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'POST' })).not.toBeVisible();
  });

  test('inbox DM count badge appears in header after receiving a DM', async ({
    alicePage: page,
  }) => {
    // Bob sends Alice a DM from Node
    const dmTopics: Array<[number, Uint8Array]> = [
      [TOPIC_TYPE.ADDRESS, hexToBytes(testConfig.aliceAddress)],
    ];
    await postMessageNode(bobClient, 'Badge test DM', dmTopics);

    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();

    // The [N] badge should appear next to Alice's address badge
    await expect(page.locator('.dm-count')).toBeVisible({ timeout: 15_000 });
  });

  test('multiple DMs from different senders all appear in inbox', async ({
    alicePage: page,
  }) => {
    const dmTopics: Array<[number, Uint8Array]> = [
      [TOPIC_TYPE.ADDRESS, hexToBytes(testConfig.aliceAddress)],
    ];
    await postMessageNode(aliceClient, 'DM from Alice to Alice', dmTopics);
    await postMessageNode(bobClient, 'DM from Bob to Alice', dmTopics);

    await page.goto(`/#/i/${testConfig.aliceAddress}`);
    await expect(page.getByText('DM from Alice to Alice')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('DM from Bob to Alice')).toBeVisible();
  });

  test('DM message shows sender → recipient header', async ({ alicePage: page }) => {
    const dmTopics: Array<[number, Uint8Array]> = [
      [TOPIC_TYPE.ADDRESS, hexToBytes(testConfig.bobAddress)],
    ];
    await postMessageNode(aliceClient, 'Directed DM message', dmTopics);

    await page.goto(`/#/i/${testConfig.bobAddress}`);
    // Scope to the specific message card to avoid strict mode violations
    const dmCard = page.locator('.message.card').filter({ hasText: 'Directed DM message' }).first();
    await expect(dmCard).toBeVisible({ timeout: 15_000 });
    // The to-arrow (→) should appear between sender and recipient badges
    await expect(dmCard.locator('.to-arrow')).toBeVisible();
  });
});

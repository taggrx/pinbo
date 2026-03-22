import { test, expect, postMessageNode, getMessageEvent, aliceClient, bobClient, TOPIC_TYPE, testConfig } from '../fixtures.js';
import { hexToBytes, bytesToHex } from 'viem';
import { decode as msgpackDecode } from '@msgpack/msgpack';

test.describe('Replies (REPOST topic)', () => {
  test('REPLY button appears on permalink when connected', async ({ alicePage: page }) => {
    const txHash = await postMessageNode(aliceClient, 'Original post for reply test');
    await page.goto(`/#/p/${txHash}`);
    // Wait for permalink mode (message loaded) before connecting
    await expect(page.getByText('Original post for reply test')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    // REPLY button appears in the single message's footer when connected
    await expect(page.locator('.message.card').getByRole('button', { name: 'REPLY' })).toBeVisible({ timeout: 10_000 });
  });

  test('clicking REPLY shows the reply form with reply placeholder', async ({
    alicePage: page,
  }) => {
    const txHash = await postMessageNode(aliceClient, 'Post to reply to');
    await page.goto(`/#/p/${txHash}`);
    // Wait for permalink mode
    await expect(page.getByText('Post to reply to')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.locator('.message.card').getByRole('button', { name: 'REPLY' }).click({ timeout: 10_000 });
    await expect(
      page.locator('.toastui-editor-md-container textarea'),
    ).toBeVisible();
    // The submit button in the post form should say REPLY
    await expect(page.locator('.post-section').getByRole('button', { name: 'REPLY' })).toBeVisible();
  });

  test('submitted reply navigates to the reply permalink', async ({ alicePage: page }) => {
    const parentHash = await postMessageNode(aliceClient, 'Parent post');
    await page.goto(`/#/p/${parentHash}`);
    // Wait for permalink mode
    await expect(page.getByText('Parent post')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.locator('.message.card').getByRole('button', { name: 'REPLY' }).click({ timeout: 10_000 });

    await page.locator('.toastui-editor-md-container textarea').fill('My reply text');
    await page.locator('.post-section').getByRole('button', { name: 'REPLY' }).click();

    // After receipt, URL should change to the new reply's permalink (not the parent's)
    await page.waitForURL(
      (url) =>
        url.href.includes('#/p/') &&
        !url.href.toLowerCase().includes(parentHash.slice(2).toLowerCase()),
      { timeout: 30_000 },
    );
  });

  test('reply encodes REPOST topic with parent tx hash on-chain', async ({
    alicePage: page,
  }) => {
    const parentHash = await postMessageNode(aliceClient, 'Parent for topic check');
    await page.goto(`/#/p/${parentHash}`);
    // Wait for permalink mode
    await expect(page.getByText('Parent for topic check')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();
    await page.locator('.message.card').getByRole('button', { name: 'REPLY' }).click({ timeout: 10_000 });

    await page.locator('.toastui-editor-md-container textarea').fill('Reply with topic');
    await page.locator('.post-section').getByRole('button', { name: 'REPLY' }).click();

    // Wait for the URL to change to the reply permalink (not the parent's)
    await page.waitForURL(
      (url) =>
        url.href.includes('#/p/') &&
        !url.href.toLowerCase().includes(parentHash.slice(2).toLowerCase()),
      { timeout: 30_000 },
    );

    // Extract reply tx hash from the URL
    const replyHash = page.url().match(/#\/p\/(0x[a-f0-9]{64})/i)?.[1] as `0x${string}`;
    expect(replyHash).toBeTruthy();

    // Verify the on-chain event contains the REPOST topic
    const log = await getMessageEvent(replyHash);
    expect(log).not.toBeNull();

    const rawBytes = hexToBytes(log!.args.message as `0x${string}`);
    // Version byte 0x01
    expect(rawBytes[0]).toBe(0x01);
    const decoded = msgpackDecode(rawBytes.slice(1)) as {
      message: Uint8Array;
      topics?: Array<[number, Uint8Array]>;
    };
    expect(decoded.topics).toBeDefined();
    const repostTopic = decoded.topics!.find(([t]) => t === TOPIC_TYPE.REPOST);
    expect(repostTopic).toBeDefined();
    // The repost payload bytes should equal the parent tx hash
    expect(bytesToHex(repostTopic![1])).toBe(parentHash.toLowerCase());
  });

  test('clicking REPLY on a feed message navigates to its permalink first', async ({
    alicePage: page,
  }) => {
    const txHash = await postMessageNode(aliceClient, 'Feed message for reply navigation');
    await page.goto('/');
    await page.getByRole('button', { name: 'CONNECT WALLET' }).click();

    await expect(page.getByText('Feed message for reply navigation')).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator('.message.card')
      .filter({ hasText: 'Feed message for reply navigation' })
      .getByRole('button', { name: 'REPLY' })
      .click();

    // Should navigate to the permalink
    await expect(page).toHaveURL(new RegExp(`#/p/${txHash}`), { timeout: 5_000 });
  });

  test('repost card is rendered inside the parent message', async ({ alicePage: page }) => {
    const parentHash = await postMessageNode(aliceClient, 'Parent with repost card');
    // Post the reply directly from Node (bypassing UI) so we can assert on the feed
    const replyTopics: Array<[number, Uint8Array]> = [
      [TOPIC_TYPE.REPOST, hexToBytes(parentHash)],
    ];
    const replyHash = await postMessageNode(bobClient, 'Node-posted reply', replyTopics);

    // The repost card shows the REFERENCED message (parent) inside the reply's view
    await page.goto(`/#/p/${replyHash}`);
    await expect(page.locator('.repost')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.repost')).toContainText('Parent with repost card');
  });
});

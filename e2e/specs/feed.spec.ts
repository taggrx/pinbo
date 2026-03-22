import { test, expect, postMessageNode, aliceClient, bobClient } from '../fixtures.js';

test.describe('Feed', () => {
  test('shows empty state when no messages have been posted', async ({ alicePage: page }) => {
    await page.goto('/');
    // Wait for the loading state to finish
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('NO MESSAGES YET')).toBeVisible();
  });

  test('displays a message posted before page load', async ({ alicePage: page }) => {
    await postMessageNode(aliceClient, 'Hello Pinbo world');
    await page.goto('/');
    await expect(page.getByText('Hello Pinbo world')).toBeVisible({ timeout: 15_000 });
  });

  test('shows multiple messages newest-first', async ({ alicePage: page }) => {
    const ts = Date.now();
    const first = `OrderTest-first-${ts}`;
    const second = `OrderTest-second-${ts}`;
    const third = `OrderTest-third-${ts}`;
    // Space posts by >1 s so each lands in a distinct block.timestamp (second-granularity).
    await postMessageNode(aliceClient, first);
    await new Promise((r) => setTimeout(r, 1100));
    await postMessageNode(aliceClient, second);
    await new Promise((r) => setTimeout(r, 1100));
    await postMessageNode(aliceClient, third);
    await page.goto('/');

    // Wait for all three messages to appear, then verify their relative order.
    // Use toPass() to retry until the sort stabilizes (streaming may re-sort incrementally).
    await expect(page.getByText(third)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(second)).toBeVisible();
    await expect(page.getByText(first)).toBeVisible();

    await expect(async () => {
      const [thirdPos, secondPos, firstPos] = await page.evaluate(([t, s, f]) => {
        const all = [...document.querySelectorAll('.message.card')];
        return [
          all.findIndex((el) => el.textContent?.includes(t)),
          all.findIndex((el) => el.textContent?.includes(s)),
          all.findIndex((el) => el.textContent?.includes(f)),
        ];
      }, [third, second, first]);
      expect(thirdPos).toBeGreaterThanOrEqual(0);
      expect(thirdPos).toBeLessThan(secondPos);
      expect(secondPos).toBeLessThan(firstPos);
    }).toPass({ timeout: 10_000 });
  });

  test('message card click navigates to permalink', async ({ alicePage: page }) => {
    const txHash = await postMessageNode(aliceClient, 'Click me to permalink');
    await page.goto('/');
    await expect(page.getByText('Click me to permalink')).toBeVisible({ timeout: 15_000 });

    // Click the card (not a link/button inside it)
    await page.locator('.message.card').filter({ hasText: 'Click me to permalink' }).click();
    await expect(page).toHaveURL(new RegExp(`#/p/${txHash}`));
  });

  test('shows messages from multiple senders', async ({ alicePage: page }) => {
    await postMessageNode(aliceClient, 'Alice says hello');
    await postMessageNode(bobClient, 'Bob says hi');
    await page.goto('/');
    await expect(page.getByText('Alice says hello')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Bob says hi')).toBeVisible();
  });
});

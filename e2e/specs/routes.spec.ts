import { test, expect, postMessageNode, aliceClient, bobClient, testConfig } from '../fixtures.js';

test.describe('Hash-based routing', () => {
	test('root hash shows the main feed', async ({ alicePage: page }) => {
		await postMessageNode(aliceClient, 'Feed route message');
		await page.goto('/');
		await expect(page.getByText('Feed route message')).toBeVisible({ timeout: 15_000 });
		// No profile/inbox sections should be present
		await expect(page.locator('.profile-section')).not.toBeVisible();
		await expect(page.locator('.inbox-section')).not.toBeVisible();
	});

	test('#/p/:txHash shows the permalink view', async ({ alicePage: page }) => {
		const txHash = await postMessageNode(aliceClient, 'Permalink route test message');
		await page.goto(`/#/p/${txHash}`);
		// Permalink renders without truncation
		await expect(page.getByText('Permalink route test message')).toBeVisible({
			timeout: 15_000,
		});
		// The message card should NOT be clickable on permalink (no clickable class)
		await expect(page.locator('.message.card.clickable')).not.toBeVisible();
	});

	test('#/a/:address shows only that address messages', async ({ alicePage: page }) => {
		await postMessageNode(aliceClient, 'Alice profile message');
		await postMessageNode(bobClient, 'Bob profile message');

		await page.goto(`/#/a/${testConfig.aliceAddress}`);
		await expect(page.getByText('Alice profile message')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Bob profile message')).not.toBeVisible();
	});

	test('#/a/:address shows the ETH balance', async ({ alicePage: page }) => {
		await page.goto(`/#/a/${testConfig.aliceAddress}`);
		// Alice has 10 ETH (minus a tiny bit for fees), balance should show ~10 ETH
		await expect(page.locator('.balance')).toBeVisible({ timeout: 10_000 });
	});

	test('#/i/:address shows the inbox view', async ({ alicePage: page }) => {
		await page.goto(`/#/i/${testConfig.aliceAddress}`);
		await expect(page.locator('.loading')).not.toBeVisible({ timeout: 15_000 });
		// Inbox view should be present
		await expect(page.locator('.inbox-section')).toBeVisible({ timeout: 10_000 });
	});

	test('#/about shows the README content', async ({ alicePage: page }) => {
		await page.goto('/#/about');
		// README contains "Pinbo" heading
		await expect(page.locator('.about-section')).toBeVisible();
		await expect(page.locator('.about-section')).toContainText('Pinbo');
	});

	test('PINBO logo click from a deep route returns to the feed', async ({ alicePage: page }) => {
		await postMessageNode(aliceClient, 'Post for logo nav test');
		const txHash = await postMessageNode(aliceClient, 'Second post');

		await page.goto(`/#/p/${txHash}`);
		await page.getByRole('button', { name: /PINBO/i }).click();

		// Should be back on the feed (window.location.hash='' results in trailing # or no hash)
		await expect(page).toHaveURL(/localhost:8080\/?#?$/, { timeout: 5_000 });
		await expect(page.getByText('Post for logo nav test').first()).toBeVisible({ timeout: 15_000 });
	});

	test('clicking a message TX link opens etherscan in a new tab', async ({ alicePage: page }) => {
		const txHash = await postMessageNode(aliceClient, 'TX link test');
		await page.goto('/');
		await expect(page.getByText('TX link test')).toBeVisible({ timeout: 15_000 });

		const [newPage] = await Promise.all([
			page.waitForEvent('popup'),
			page
				.locator('.message.card')
				.filter({ hasText: 'TX link test' })
				.getByRole('link', { name: 'TX' })
				.click(),
		]);
		await expect(newPage).toHaveURL(/etherscan\.io\/tx/);
		await newPage.close();
	});
});

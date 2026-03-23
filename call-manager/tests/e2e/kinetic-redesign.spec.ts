import { test, expect } from '@playwright/test';

test.describe('Kinetic Redesign - Frontend Overhaul', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to local dev server
        await page.goto('/');
    });

    test('Sidebar should be persistent and navigate correctly', async ({ page }) => {
        // 1. Initial Load (Dashboard)
        await expect(page.locator('h1')).toContainText('Overview');

        // 2. Click Campaigns in Sidebar (Using href)
        const campaignsLink = page.locator('aside a[href="/campaigns"]');
        await campaignsLink.click();
        await page.waitForURL('**/campaigns');

        // 3. Verify on Campaigns Page
        await expect(page.locator('h1')).toContainText('Campaign Registry');

        // 4. Verify Sidebar Still Present (persistent)
        await expect(page.locator('aside')).toBeVisible();

        // 5. Click New Campaign in Sidebar (Using href)
        const newCampaignLink = page.locator('aside a[href="/campaigns/new"]');
        await newCampaignLink.click();
        await page.waitForURL('**/campaigns/new');

        // 6. Verify on New Campaign Page
        await expect(page.locator('h1')).toContainText('Initialize Sequence');
        await expect(page.locator('aside')).toBeVisible();
    });

    test('Dashboard Agent Accordion should toggle correctly', async ({ page }) => {
        const accordionHeader = page.locator('[class*="accordionHeader"]');
        await expect(accordionHeader).toBeVisible();
        await expect(accordionHeader).toContainText('Arch'); // Ribbon check
        await accordionHeader.click();

        const accordionBody = page.locator('[class*="accordionBody"]');
        await expect(accordionBody).toBeVisible();
        await expect(accordionBody).toContainText('Agent Stack');
    });

    test('New Call Modal should support advanced overrides', async ({ page }) => {
        // 1. Click New Call (+) icon in sidebar using title
        const newCallBtn = page.locator('button[title="New Single Call"]');
        await expect(newCallBtn).toBeVisible();
        await newCallBtn.click();

        // 2. Verify Modal is Open
        const modal = page.locator('[class*="modal"]');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Initialize Session');

        // 3. Toggle Advanced Settings
        const advancedToggle = modal.locator('[class*="advancedToggle"]');
        await expect(advancedToggle).toBeVisible();
        await advancedToggle.click();

        // 4. Verify Advanced Panel is Visible
        const advancedPanel = modal.locator('[class*="advancedPanel"]');
        await expect(advancedPanel).toBeVisible();
        // In AgentSettingsPanel, there is a tab called Configuration
        await expect(advancedPanel).toContainText('Configuration');

        // 5. Check Recipient Context field
        const recipientContext = modal.locator('textarea[placeholder*="Rahul"]');
        await expect(recipientContext).toBeVisible();
    });

    test('Dashboard Metrics should correctly display live data', async ({ page }) => {
        // 1. Verify metrics section
        const metricsSection = page.locator('section[id="overview"]');
        await expect(metricsSection).toBeVisible();

        // 2. Check each card for a large number
        const queuedCount = metricsSection.locator('div:has-text("Queued") strong');
        await expect(queuedCount).toBeVisible();

        const activeCount = metricsSection.locator('div:has-text("Active") strong');
        await expect(activeCount).toBeVisible();

        // Ensure numbers are digits or zero (not '--')
        const countText = await queuedCount.innerText();
        expect(parseInt(countText)).toBeGreaterThanOrEqual(0);
    });
});

import { expect, test } from '@playwright/test';

test('Expo 웹 앱의 개발 갤러리에 진입한다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('컴포넌트 갤러리', { exact: true })).toBeVisible();
});

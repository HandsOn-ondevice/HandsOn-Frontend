import { expect, test, type Page } from '@playwright/test';

async function openDeviceCheck(page: Page) {
  await page.goto('/researcher-workflow');
  await page.getByRole('button', { name: '새 Mock 실험 준비 시작', exact: true }).click();
  const labels = [
    '필수 준비물 7개 확인',
    '장치 ID LED-M03 확인',
    '전원 차단 확인',
    '센서 배선 연결',
    'LED와 BH1750 거리 20cm',
  ];
  await expect(page.getByRole('button', { name: '확인 완료', exact: true })).toBeDisabled();
  for (const [index, name] of labels.entries()) {
    await page.getByRole('checkbox', { name, exact: true }).click();
    await expect(
      page.getByText(`준비 진행도 · ${index + 1} / 6 항목 완료`, { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: '확인 완료', exact: true }).click();
  await expect(page).toHaveURL(/\/device-check$/);
}

test('S04와 동일 세션으로 점검하고 6/6 복귀·S06 시작·재진입한다', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 920 });
  await openDeviceCheck(page);
  const deviceURL = page.url();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
  await expect(page.getByText('장치·센서 점검 중입니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Orange Pi 5+ 연결됨 · Mock 점검 성공', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page.getByText('준비 진행도 · 6 / 6 항목 완료', { exact: true })).toBeVisible();
  await expect(page.getByText(/Mock 시스템 근거/)).toBeVisible();
  await page.getByRole('button', { name: '확인 완료', exact: true }).click();
  await expect(page).toHaveURL(deviceURL);
  await page.getByRole('button', { name: '실험 측정 시작', exact: true }).click();
  await expect(page).toHaveURL(deviceURL.replace('/device-check', '/execution'));
  await expect(page.getByText('핵심 실행 화면', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(deviceURL);
  await expect(
    page.getByRole('button', { name: '장치·센서 다시 점검', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '실험 진행으로 돌아가기', exact: true }),
  ).toBeEnabled();
});

test('360px에서 긴 오류와 스크롤·재점검·복구 흐름을 확인한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openDeviceCheck(page);
  await page.getByRole('button', { name: 'Mock 점검 시나리오: 정상 연결', exact: true }).click();
  await page.getByRole('radio', { name: '센서 통신 오류', exact: true }).click();
  await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
  await expect(page.getByText('장치·센서 점검에 실패했습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
  const retry = page.getByRole('button', { name: '장치·센서 다시 점검', exact: true });
  await retry.scrollIntoViewIfNeeded();
  const retryBox = await retry.boundingBox();
  const shelfBox = await page
    .getByRole('button', { name: '실험 측정 시작', exact: true })
    .boundingBox();
  expect(retryBox).not.toBeNull();
  expect(shelfBox).not.toBeNull();
  expect(retryBox!.y + retryBox!.height).toBeLessThan(shelfBox!.y);
  await page.screenshot({ path: testInfo.outputPath('s05-error-360x800.png') });
  await page
    .getByRole('button', { name: 'Mock 점검 시나리오: 센서 통신 오류', exact: true })
    .click();
  await page.getByRole('radio', { name: '정상 연결', exact: true }).click();
  await retry.click();
  await expect(
    page.getByText('Orange Pi 5+ 연결됨 · Mock 점검 성공', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeEnabled();
});

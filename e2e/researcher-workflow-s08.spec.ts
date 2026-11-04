import { expect, test, type Page } from '@playwright/test';

async function response(page: Page, current: string, next: string) {
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await page.getByRole('button', { name: '미리보기 설정', exact: true }).click();
  await page.getByRole('button', { name: `측정 응답 조건: ${current}`, exact: true }).click();
  await page.getByRole('radio', { name: next, exact: true }).click();
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
}

test('S08 보류·재진입·실패·복구 후 같은 회차를 명시적으로 완료한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/researcher-workflow');
  await page.getByRole('button', { name: '새 실험 준비 시작', exact: true }).click();
  for (const name of [
    '필수 준비물 7개 확인',
    '장치 ID LED-M03 확인',
    '전원 차단 확인',
    '센서 배선 연결',
    'LED와 BH1750 거리 20cm',
  ])
    await page.getByRole('checkbox', { name, exact: true }).click();
  await page.getByRole('button', { name: '확인 완료', exact: true }).click();
  await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '실험 측정 시작', exact: true }).click();
  const sample = page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true });
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  for (let count = 1; count <= 7; count++) {
    await sample.click();
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(page.getByText(`유효 측정 ${count} / 15회`, { exact: true })).toBeAttached();
  }
  await response(page, '정상 응답', '오래된 값 · 보류');
  await sample.click();
  const recovery = page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true });
  await expect(recovery).toBeEnabled();
  await expect(complete).toBeDisabled();
  await recovery.click();
  await expect(page).toHaveURL(/\/recovery$/);
  await expect(page.getByText('50% 조건 · 2회차', { exact: true })).toBeVisible();
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
  await expect(page.getByText('대기', { exact: true })).toHaveCount(3);
  await expect(page.getByText('마지막 값 · 회차 무효', { exact: true })).toBeVisible();
  await expect(page.getByText(/^오래된 값 · \d+(?:\.\d)?초 전$/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('s08-held-412x920.png') });
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(complete).toBeDisabled();
  await recovery.click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: '조치 듣기', exact: true }).click();
  const notice = page.getByText(/음성 안내 서비스는 아직 연결되지 않았습니다/);
  await notice.scrollIntoViewIfNeeded();
  const box = await notice.boundingBox();
  const shelf = await page
    .getByRole('button', { name: '센서 다시 확인', exact: true })
    .boundingBox();
  expect(box!.y + box!.height).toBeLessThan(shelf!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('s08-bottom-360x800.png') });
  await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
  const failed = page.getByText('센서 상태를 다시 확인해 주세요', { exact: true });
  await failed.scrollIntoViewIfNeeded();
  await expect(failed).toBeVisible();
  await response(page, '오래된 값 · 보류', '정상 응답');
  await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
  const success = page.getByText('새 센서값이 수신되었습니다', { exact: true });
  await success.scrollIntoViewIfNeeded();
  await expect(success).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('s08-recovered-360x800.png') });
  await page.getByRole('button', { name: '현재 작업으로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(/\/execution$/);
  await expect(page.getByText('유효 측정 7 / 15회', { exact: true })).toBeAttached();
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(page.getByText('유효 측정 8 / 15회', { exact: true })).toBeAttached();
  expect(errors).toEqual([]);
});

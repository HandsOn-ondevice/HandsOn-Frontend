import { expect, test, type Page } from '@playwright/test';

async function chooseResponse(page: Page, current: string, next: string) {
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  const preview = page.getByRole('button', { name: '미리보기 설정', exact: true });
  await preview.click();
  await page.getByRole('button', { name: `측정 응답 조건: ${current}`, exact: true }).click();
  await page.getByRole('radio', { name: next, exact: true }).click();
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
}

async function openExecution(page: Page) {
  await page.goto('/researcher-workflow');
  await page.getByRole('button', { name: '새 실험 준비 시작', exact: true }).click();
  for (const name of [
    '필수 준비물 7개 확인',
    '장치 ID LED-M03 확인',
    '전원 차단 확인',
    '센서 배선 연결',
    'LED와 BH1750 거리 20cm',
  ]) {
    await page.getByRole('checkbox', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: '확인 완료', exact: true }).click();
  await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '실험 측정 시작', exact: true }).click();
  await expect(page).toHaveURL(/\/execution$/);
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
}

test('412px에서 S06 완료·S05 재진입·S07 연결 왕복으로 상태를 보존한다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openExecution(page);
  const executionURL = page.url();
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  const sample = page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true });
  await expect(page.getByText('LED 출력 특성 측정', { exact: true })).toBeVisible();
  await expect(complete).toBeDisabled();
  await sample.click();
  await expect(complete).toBeEnabled();
  await expect(page.getByLabel(/BH1750 조도, 18.4, lx/)).toBeVisible();
  await complete.click();
  await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeVisible();
  await expect(complete).toBeDisabled();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await page.getByRole('button', { name: '실험 진행으로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeVisible();
  await sample.click();
  await expect(complete).toBeEnabled();
  await page.getByRole('button', { name: /^음성 명령 확인,/ }).click();
  await expect(page).toHaveURL(/\/voice-clarification$/);
  await expect(page.getByText('모호한 음성 확인', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeVisible();
  await expect(complete).toBeEnabled();
  await page.getByText('LED 출력 특성 측정', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('s06-normal-412x920.png') });
  expect(errors).toEqual([]);
});

test('360px에서 긴 보류 문구와 최하단 콘텐츠가 버튼 위로 스크롤되고 재요청한다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openExecution(page);
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  const sample = page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true });
  await chooseResponse(page, '정상 응답', '작업 보류');
  await sample.click();
  await expect(page.getByText(/현재 작업을 보류했습니다/)).toBeVisible();
  await expect(complete).toBeDisabled();
  const last = page.getByText(/센서 응답 확인만으로 작업자 완료가 기록되지 않습니다/);
  await last.scrollIntoViewIfNeeded();
  const contentBox = await last.boundingBox();
  const shelfBox = await complete.boundingBox();
  expect(contentBox).not.toBeNull();
  expect(shelfBox).not.toBeNull();
  expect(contentBox!.y + contentBox!.height).toBeLessThan(shelfBox!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('s06-held-bottom-360x800.png') });
  await chooseResponse(page, '작업 보류', '정상 응답');
  await sample.click();
  await expect(complete).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
});

test('15/15 완료 후 마지막 유효 측정값을 표시하고 재측정이나 재완료를 허용하지 않는다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  await openExecution(page);
  const sample = page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true });
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  for (let count = 1; count <= 15; count++) {
    await sample.click();
    await expect(complete).toBeEnabled();
    await complete.click();
    const progress = page.getByText(`유효 측정 ${count} / 15회`, { exact: true });
    await progress.scrollIntoViewIfNeeded();
    await expect(progress).toBeVisible();
  }
  const last = page.getByText('마지막 유효 측정값 · 100% 조건 3회차', { exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  await expect(page.getByLabel(/BH1750 조도, 810, lx/)).toBeVisible();
  await expect(page.getByText('현재 회차 응답 없음', { exact: true })).toHaveCount(0);
  await expect(sample).toBeDisabled();
  await expect(complete).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('s06-completed-412x920.png') });
});

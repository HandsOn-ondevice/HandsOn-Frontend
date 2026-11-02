import { expect, test, type Page } from '@playwright/test';

async function openExecution(page: Page) {
  await page.goto('/researcher-workflow');
  await page.getByRole('button', { name: '새 Mock 실험 준비 시작', exact: true }).click();
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
  const sample = page.getByRole('button', { name: '현재 회차 Mock 응답 확인', exact: true });
  await expect(page.getByText(/Mock 초안 절차/)).toBeVisible();
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
  await page.getByRole('button', { name: /^음성 명령 시뮬레이션,/ }).click();
  await expect(page).toHaveURL(/\/voice-clarification$/);
  await expect(page.getByText('모호한 음성 확인', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '선택하지 않고 취소', exact: true }).click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeVisible();
  await expect(complete).toBeEnabled();
  await page
    .getByText('LED 출력 단계별 조도·소비전력 측정', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('s06-normal-412x920.png') });
  expect(errors).toEqual([]);
});

test('360px에서 긴 보류 문구와 최하단 콘텐츠가 버튼 위로 스크롤되고 재요청한다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openExecution(page);
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  const sample = page.getByRole('button', { name: '현재 회차 Mock 응답 확인', exact: true });
  await page
    .getByRole('button', { name: 'Mock 실행 시나리오: 정상 Mock 응답', exact: true })
    .click();
  await page.getByRole('radio', { name: '작업 보류', exact: true }).click();
  await sample.click();
  await expect(page.getByText(/작업 보류 시뮬레이션입니다/)).toBeVisible();
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
  await page.getByRole('button', { name: 'Mock 실행 시나리오: 작업 보류', exact: true }).click();
  await page.getByRole('radio', { name: '정상 Mock 응답', exact: true }).click();
  await sample.click();
  await expect(complete).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
});

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
  await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
}
async function openVoice(page: Page) {
  await page.getByRole('button', { name: /^말씀하세요,/ }).click();
  await expect(page).toHaveURL(/\/voice-clarification$/);
  await expect(page.getByText('모호한 음성 확인', { exact: true })).toBeVisible();
}

test('412px S07 선택·명시적 확인·같은 회차 재측정·복귀가 일관된다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openExecution(page);
  const executionURL = page.url();
  await openVoice(page);
  const back = page.getByRole('button', { name: '현재 작업으로 돌아가기', exact: true });
  await expect(back).toBeDisabled();
  await page.getByRole('button', { name: '현재 안내를 다시 듣기', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '현재 안내를 다시 듣기 · 선택됨', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('s07-choice-412x920.png') });
  await back.click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByText(/선택한 명령: 현재 안내를 다시 듣기/)).toBeVisible();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
  await openVoice(page);
  await page.getByRole('button', { name: '0% 조건 1회차 다시 측정', exact: true }).click();
  await back.click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByText(/같은 회차의 측정값 확인 요청/)).toBeVisible();
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
  await openVoice(page);
  await page.getByRole('button', { name: '아무것도 하지 않기', exact: true }).click();
  await back.click();
  await expect(page).toHaveURL(executionURL);
  await expect(
    page.getByRole('progressbar', { name: '유효 측정 0 / 15회, 진행 중', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: '완료 요청', exact: true }).click();
  await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('360px에서 선택 없이 취소·뒤로가기·재진입하고 하단 겹침이 없다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openExecution(page);
  const executionURL = page.url();
  await openVoice(page);
  const cancel = page.getByRole('button', { name: '뒤로가기', exact: true });
  const last = page.getByText('현재 단계와 측정 회차는 바꾸지 않았습니다.', { exact: true });
  await last.scrollIntoViewIfNeeded();
  const item = await last.boundingBox();
  const footer = await page
    .getByRole('button', { name: '현재 작업으로 돌아가기', exact: true })
    .boundingBox();
  expect(item).not.toBeNull();
  expect(footer).not.toBeNull();
  expect(item!.y + item!.height).toBeLessThan(footer!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('s07-bottom-360x800.png') });
  await cancel.click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
  await openVoice(page);
  await page.getByRole('button', { name: '0% 조건 1회차 다시 측정', exact: true }).click();
  // 브라우저 자체 뒤로가기는 확정으로 취급하지 않는다. 대기 요청을 다시 열어 취소한다.
  await page.goBack();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^음성 명령 확인 대기,/ }).click();
  await expect(page).toHaveURL(/\/voice-clarification$/);
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(executionURL);
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
});

test('없는 세션으로 직접 S07 진입하면 오류와 재조회만 제공하고 실행하지 않는다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/researcher-workflow/missing/voice-clarification');
  await expect(
    page.getByText('세션을 찾을 수 없습니다. Mock 세션은 앱 재시작 시 초기화됩니다.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '요청 다시 불러오기', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /회차 다시 측정/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('s07-missing-360x800.png') });
});

import { expect, test, type Page } from '@playwright/test';

async function scenario(page: Page, current: string, next: string, screenId = 'execution-screen') {
  await page.getByTestId(screenId).getByRole('button', { name: '더 보기', exact: true }).click();
  await page.getByRole('button', { name: '미리보기 설정', exact: true }).click();
  await page.getByRole('button', { name: `측정 응답 조건: ${current}`, exact: true }).click();
  await page.getByRole('radio', { name: next, exact: true }).click();
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
}
async function openRecovered(page: Page, failures = 0) {
  await page.goto('/researcher-workflow');
  await page.getByRole('button', { name: '새 Mock 실험 준비 시작', exact: true }).click();
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
  await scenario(page, '정상 응답', '오래된 값 · 보류');
  await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
  await page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery$/);
  for (let index = 0; index < failures; index++) {
    const recheck = page.getByRole('button', { name: '센서 다시 확인', exact: true });
    await recheck.click();
    await expect(recheck).toBeDisabled();
    await expect(recheck).toBeEnabled();
    await expect(page.getByText('센서 상태를 다시 확인해 주세요', { exact: true })).toBeVisible();
  }
  await scenario(page, '오래된 값 · 보류', '정상 응답', 'recovery-screen');
  await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/remeasurement$/);
  await expect(
    page
      .getByTestId('remeasurement-screen')
      .getByText('새 조도값이 수신되었습니다', { exact: true }),
  ).toBeVisible();
}

test('S09 412px·360px의 기록·뒤로 가기·S06 우회 차단과 명시적 재측정 완료', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openRecovered(page);
  const url = page.url();
  const s09 = page.getByTestId('remeasurement-screen');
  const successTitle = s09.getByText('새 조도값이 수신되었습니다', { exact: true });
  await expect(successTitle).toHaveCount(1);
  await expect(s09.getByText('새 센서값이 수신되었습니다', { exact: true })).toHaveCount(0);
  await expect(s09.getByText('BH1750', { exact: true })).toBeVisible();
  await expect(s09.getByText('18.4 lx', { exact: true })).toBeVisible();
  await expect(s09.getByText('0% 조건 · 1회차', { exact: true })).toBeVisible();
  await expect(s09.getByText(/정상 · \d+(?:\.\d)?초 전/)).toBeVisible();
  await expect(page.getByText(/· 센서 재확인 요청$/)).toHaveCount(1);
  await expect(page.getByText(/I2C 케이블 재연결 확인/)).toHaveCount(0);
  await expect(page.getByText(/5\/5초/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('s09-412x920.png') });
  await page.setViewportSize({ width: 360, height: 800 });
  await successTitle.scrollIntoViewIfNeeded();
  await expect(successTitle).toBeVisible();
  await expect(s09.getByText('새 센서값이 수신되었습니다', { exact: true })).toHaveCount(0);
  const titleBox = await successTitle.boundingBox();
  expect(titleBox!.x).toBeGreaterThanOrEqual(0);
  expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath('s09-illuminance-360x800-top.png') });
  const voiceDescription = s09.getByText('0% 조건 1회차 · 아래 버튼으로 다시 측정해 주세요.', {
    exact: true,
  });
  await voiceDescription.scrollIntoViewIfNeeded();
  const voice = await voiceDescription.boundingBox();
  const footer = await page
    .getByRole('button', { name: '1회차 다시 측정', exact: true })
    .boundingBox();
  expect(voice!.y + voice!.height).toBeLessThan(footer!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('s09-360x800-bottom.png') });
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery$/);
  await page
    .getByTestId('recovery-screen')
    .getByRole('button', { name: '더 보기', exact: true })
    .click();
  await page.getByRole('button', { name: '현재 작업으로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(/\/execution$/);
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  await expect(complete).toBeDisabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: '복구 후 재측정 안내', exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByText(/· 센서 재확인 요청$/)).toHaveCount(1);
  await page.getByRole('button', { name: '1회차 다시 측정', exact: true }).click();
  await expect(page).toHaveURL(/\/execution$/);
  await expect(complete).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeAttached();
  await complete.click();
  await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeAttached();
  expect(errors).toEqual([]);
});

test('S09 재측정 오류는 새 보류·복구 흐름에 연결되고 이전 요청 이력을 유지한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openRecovered(page);
  await scenario(page, '정상 응답', '통신 오류', 'remeasurement-screen');
  await page.getByRole('button', { name: '1회차 다시 측정', exact: true }).click();
  await expect(page).toHaveURL(/\/execution$/);
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/recovery$/);
  await scenario(page, '통신 오류', '정상 응답', 'recovery-screen');
  await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
  await expect(page).toHaveURL(/\/remeasurement$/);
  await expect(page.getByText(/· 센서 재확인 요청$/)).toHaveCount(2);
  await expect(page.getByText(/· 측정 보류·오류 기록$/)).toHaveCount(2);
  await page.getByRole('button', { name: '1회차 다시 측정', exact: true }).click();
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeAttached();
});

test('없는 세션으로 S09에 직접 진입하면 오류와 재조회만 제공한다', async ({ page }) => {
  await page.goto('/researcher-workflow/missing/remeasurement');
  await expect(
    page.getByText('세션을 찾을 수 없습니다. Mock 세션은 앱 재시작 시 초기화됩니다.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '현재 회차 다시 측정', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '복구 기록 다시 불러오기', exact: true }).click();
  await expect(
    page.getByText('세션을 찾을 수 없습니다. Mock 세션은 앱 재시작 시 초기화됩니다.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('S09의 긴 복구 이력은 생략하지 않고 준비 안내 전체를 두 해상도에서 스크롤할 수 있다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  await openRecovered(page, 2);
  const s09 = page.getByTestId('remeasurement-screen');
  const history = s09.getByText(/^\d{2}:\d{2}:\d{2} ·/);
  await expect(history).toHaveCount(7);
  await expect(s09.getByText(/· 센서 재확인 요청$/)).toHaveCount(3);
  await expect(s09.getByText(/· 측정 보류·오류 기록$/)).toHaveCount(3);
  await expect(s09.getByText(/· 센서 응답 재확인 완료$/)).toHaveCount(1);
  await expect(s09.getByText('재측정 준비 완료', { exact: true })).toHaveCount(1);
  const details = s09.getByText('0% 조건 1회차 · 아래 버튼으로 다시 측정해 주세요.', {
    exact: true,
  });
  const footer = page.getByRole('button', { name: '1회차 다시 측정', exact: true });
  const layouts = [];
  for (const viewport of [
    { width: 412, height: 920 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await s09.getByText('0% 조건 · 1회차', { exact: true }).scrollIntoViewIfNeeded();
    const before = await details.boundingBox();
    await page.screenshot({
      path: testInfo.outputPath(`s09-long-${viewport.width}x${viewport.height}-top.png`),
    });
    await details.scrollIntoViewIfNeeded();
    const end = await details.boundingBox();
    const button = await footer.boundingBox();
    expect(end!.y + end!.height).toBeLessThan(button!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(history).toHaveCount(7);
    layouts.push({
      viewport,
      before,
      after: end,
      footer: button,
      historyCount: await history.count(),
    });
    await page.screenshot({
      path: testInfo.outputPath(`s09-long-${viewport.width}x${viewport.height}-bottom.png`),
    });
  }
  await testInfo.attach('long-history-layout', {
    body: JSON.stringify(layouts, null, 2),
    contentType: 'application/json',
  });
  await footer.click();
  await expect(page).toHaveURL(/\/execution$/);
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeEnabled();
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeAttached();
});

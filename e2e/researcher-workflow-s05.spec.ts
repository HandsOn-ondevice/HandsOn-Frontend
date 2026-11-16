import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

async function chooseScenario(page: Page, current: string, next: string, testInfo?: TestInfo) {
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '장치 점검 정보', exact: true })).toBeVisible();
  const select = page.getByRole('button', { name: `Mock 점검 시나리오: ${current}`, exact: true });
  await select.scrollIntoViewIfNeeded();
  await select.click();
  await page.getByRole('radio', { name: next, exact: true }).click();
  await expect(
    page.getByRole('radio', { name: next, exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `Mock 점검 시나리오: ${next}`, exact: true }),
  ).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('s05-info-top.png') });
  const note = page.getByText(
    '표시값은 점검 시점의 기록입니다. 실시간 센서 감시·안전 범위 판정은 수행하지 않습니다.',
    { exact: true },
  );
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeVisible();
  expect((await note.boundingBox())!.y + (await note.boundingBox())!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('s05-info-bottom.png') });
  const close = page.getByRole('button', { name: '하단 시트 닫기', exact: true });
  await close.scrollIntoViewIfNeeded();
  await close.click();
  await expect(close).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Mock 점검 시나리오:/ })).toHaveCount(0);
}

async function captureResult(page: Page, testInfo: TestInfo, name: string) {
  const retry = page.getByRole('button', { name: '장치·센서 다시 점검', exact: true });
  await retry.scrollIntoViewIfNeeded();
  const retryBox = await retry.boundingBox();
  const shelfBox = await page
    .getByRole('button', { name: '실험 측정 시작', exact: true })
    .boundingBox();
  expect(retryBox!.y + retryBox!.height).toBeLessThan(shelfBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`${name}-bottom.png`) });
  await page
    .getByRole('heading', { name: '실험 시작 전 점검', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`${name}-top.png`) });
}

test('S04와 동일 세션으로 점검하고 6/6 복귀·S06 시작·재진입한다', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 920 });
  await openDeviceCheck(page);
  const deviceURL = page.url();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
  await expect(page.getByText('장치·센서 점검 중입니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
  await expect(page.getByText('점검 응답을 확인했어요', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page.getByText('준비 진행도 · 6 / 6 항목 완료', { exact: true })).toBeVisible();
  await expect(page.getByText(/Mock 시스템 근거/)).toBeVisible();
  await page.getByRole('button', { name: '확인 완료', exact: true }).click();
  await expect(page).toHaveURL(deviceURL);
  await page.getByRole('button', { name: '실험 측정 시작', exact: true }).click();
  await expect(page).toHaveURL(deviceURL.replace('/device-check', '/execution'));
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(deviceURL);
  await expect(
    page.getByRole('button', { name: '장치·센서 다시 점검', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '실험 진행으로 돌아가기', exact: true }),
  ).toBeEnabled();
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}×${viewport.height} S05 시트 선택·실패·재점검과 기존 성공 결과 보존`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDeviceCheck(page);
    await expect(page.getByRole('button', { name: /Mock 점검 시나리오:/ })).toHaveCount(0);
    await chooseScenario(page, '정상 연결', '센서 통신 오류', testInfo);
    await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
    await expect(page.getByText('장치·센서 점검에 실패했습니다', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
    await captureResult(page, testInfo, 's05-error');
    await chooseScenario(page, '센서 통신 오류', '정상 연결');
    await expect(page.getByText('장치·센서 점검에 실패했습니다', { exact: true })).toBeAttached();
    const retry = page.getByRole('button', { name: '장치·센서 다시 점검', exact: true });
    await retry.click();
    await expect(page.getByText('점검 응답을 확인했어요', { exact: true })).toBeVisible();
    await expect(page.getByText('18.4 lx', { exact: true })).toBeAttached();
    await expect(page.getByText(/연결됨|Mock 점검 성공/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeEnabled();
    await captureResult(page, testInfo, 's05-success');
    await chooseScenario(page, '정상 연결', '장치 미연결');
    // 선택만으로 이전 성공·센서값·시작 조건을 바꾸지 않는다.
    await expect(page.getByText('점검 응답을 확인했어요', { exact: true })).toBeAttached();
    await expect(page.getByText('18.4 lx', { exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '더 보기', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Mock 점검 시나리오: 장치 미연결', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/점검 시도 2회/)).toBeVisible();
    await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
    await retry.click();
    await expect(page.getByText('장치·센서 점검에 실패했습니다', { exact: true })).toBeVisible();
    await expect(page.getByText('18.4 lx', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '실험 측정 시작', exact: true })).toBeDisabled();
    await chooseScenario(page, '장치 미연결', '정상 연결');
    await retry.click();
    await expect(page.getByText('점검 응답을 확인했어요', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '실험 측정 시작', exact: true }).click();
    await expect(page).toHaveURL(/\/execution$/);
    await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeAttached();
    expect(errors).toEqual([]);
  });
}

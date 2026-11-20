import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function pauseFromMenu(page: Page) {
  const execution = page.getByTestId('execution-screen');
  await expect(execution.getByRole('button', { name: '실험 일시정지', exact: true })).toHaveCount(
    0,
  );
  await execution.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/session-menu$/);
  await page
    .getByTestId('session-menu-screen')
    .getByRole('button', { name: '실험 일시정지', exact: true })
    .click();
}

async function enterExecution(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지능형 임베디드·IoT 센서 연구실', exact: true }).click();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await page.getByRole('button', { name: '이어서 진행', exact: true }).click();
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
  await expect(page).toHaveURL('/researcher-workflow/demo-session-led-m03/execution');
}

const connectionCard = (page: Page) =>
  page.getByRole('button', { name: /^센서 근거, Orange Pi 5\+와 필수 센서 3개 연결,/ });
const voltageCard = (page: Page) => page.getByRole('button', { name: /^센서 근거, 공급 전압/ });
async function checkCard(page: Page, target: 'connection' | 'voltage') {
  const card = target === 'connection' ? connectionCard(page) : voltageCard(page);
  await card.click();
  await expect(card).toHaveAccessibleName(/, 확인$/);
}

async function capture(page: Page, testInfo: TestInfo, name: string, bottomText: RegExp) {
  const last = page.getByText(bottomText);
  await last.scrollIntoViewIfNeeded();
  const box = await last.boundingBox();
  const shelf = await page
    .getByRole('button', { name: /^(바로 재개|확인하고 재개)$/ })
    .boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(shelf!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`${name}-bottom.png`) });
  await page
    .getByTestId(name.startsWith('s10') ? 'pause-heading' : 'resume-screen')
    .getByText(name.startsWith('s10') ? '실험 일시정지' : /간 일시정지됨$/, { exact: false })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`${name}-top.png`) });
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}×${viewport.height} S01 이어하기·S10 보관·홈 재진입·S11 확인·같은 회차 재개`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await enterExecution(page);
    const sample = page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true });
    const complete = page.getByRole('button', { name: '완료 요청', exact: true });
    await sample.click();
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(page.getByText('“0% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await pauseFromMenu(page);
    await expect(page).toHaveURL(/\/demo-session-led-m03\/paused$/);
    await expect(page.getByText('진행 상태를 안전하게 저장했어요', { exact: true })).toBeVisible();
    await expect(page.getByText('다음 작업 · 0% 2회차', { exact: true })).toBeVisible();
    await expect(page.getByText('완료 근거 5건 유지', { exact: true })).toBeVisible();
    await capture(
      page,
      testInfo,
      `s10-${viewport.width}x${viewport.height}`,
      /^앱 실행 중에만 보관합니다\./,
    );
    await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
    await expect(complete).toBeDisabled();
    await expect(page.getByText('실험이 일시정지되어 있습니다', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '일시정지 기록 확인', exact: true }).click();
    await page.getByRole('button', { name: '홈으로', exact: true }).click();
    await expect(page).toHaveURL('/student');
    await page.getByRole('button', { name: '이어서 진행', exact: true }).click();
    await expect(page).toHaveURL(/\/demo-session-led-m03\/paused$/);
    await page.getByRole('button', { name: '바로 재개', exact: true }).click();
    await expect(page).toHaveURL(/\/demo-session-led-m03\/resume$/);
    await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
    await expect(page.getByText('공급 전압 확인 필요', { exact: true })).toBeAttached();
    await capture(
      page,
      testInfo,
      `s11-${viewport.width}x${viewport.height}`,
      /^“거리와 방향 확인했어”$/,
    );
    await expect(
      page.getByRole('button', { name: '장치·센서 다시 확인', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveAccessibleName(
      '복원 위치 · 9/16단계, 일시정지',
    );
    await expect(page.getByRole('progressbar')).toContainText('56%');
    await checkCard(page, 'connection');
    await expect(voltageCard(page)).toHaveAccessibleName(/, 대기$/);
    await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
    await capture(
      page,
      testInfo,
      `s11-connection-${viewport.width}x${viewport.height}`,
      /^“거리와 방향 확인했어”$/,
    );
    await checkCard(page, 'voltage');
    await expect(page.getByText('공급 전압 5.01 V', { exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
    const operator = page.getByText('거리 20cm와 지그 고정 확인', { exact: true });
    await operator.click();
    await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeEnabled();
    await operator.click();
    await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
    await operator.click();
    await capture(
      page,
      testInfo,
      `s11-ready-${viewport.width}x${viewport.height}`,
      /^같은 회차에서 새 측정 응답을 확인합니다\.$/,
    );
    await page.getByRole('button', { name: '확인하고 재개', exact: true }).click();
    await expect(page).toHaveURL(/\/demo-session-led-m03\/execution$/);
    await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeAttached();
    await expect(page.getByText('“0% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await expect(complete).toBeDisabled();
    await sample.click();
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(page.getByText('유효 측정 2 / 15회', { exact: true })).toBeAttached();
    expect(errors).toEqual([]);
  });
}

test('S11 실패 응답은 재개를 차단하며 재시도와 재진입에도 확인 조건을 유지한다', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 412, height: 920 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enterExecution(page);
  await pauseFromMenu(page);
  await page.getByRole('button', { name: '바로 재개', exact: true }).click();
  async function scenario(current: string, next: string) {
    await expect(page).toHaveURL(/\/demo-session-led-m03\/resume$/);
    const more = page
      .getByTestId('resume-screen')
      .getByRole('button', { name: '더 보기', exact: true });
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await page.getByRole('button', { name: '미리보기 설정', exact: true }).click();
    await page.getByRole('button', { name: `Mock 점검 시나리오: ${current}`, exact: true }).click();
    await page.getByRole('radio', { name: next, exact: true }).click();
    await expect(
      page.getByRole('button', { name: `Mock 점검 시나리오: ${next}`, exact: true }),
    ).toBeVisible();
    // SelectField는 별도 fade Modal이다. 상태 갱신 뒤에도 DOM과 포커스 처리가 남으므로
    // 선택창이 완전히 제거된 뒤 바깥 BottomSheet를 닫는다.
    await expect(
      page.getByRole('radio', { name: next, exact: true, includeHidden: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '재개 전 확인 정보', exact: true })).toHaveCount(
      0,
    );
  }
  for (const target of ['connection', 'voltage'] as const) {
    await scenario('정상 연결', '장치 미연결');
    const card = target === 'connection' ? connectionCard(page) : voltageCard(page);
    await card.click();
    await expect(card).toHaveAccessibleName(/, 실패$/);
    await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`s11-${target}-failed.png`) });
    await scenario('장치 미연결', '응답 시간 초과');
    await card.click();
    await expect(card).toHaveAccessibleName(/응답 시간 초과.*실패$/);
    await scenario('응답 시간 초과', '오래된 센서값');
    await card.click();
    await expect(card).toHaveAccessibleName(/최신성 확인 실패.*실패$/);
    await scenario('오래된 센서값', '정상 연결');
    await checkCard(page, target);
  }
  await expect(page.getByText('공급 전압 5.01 V', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await page.getByRole('button', { name: '바로 재개', exact: true }).click();
  await expect(connectionCard(page)).toHaveAccessibleName(/, 확인$/);
  await expect(voltageCard(page)).toHaveAccessibleName(/, 확인$/);
  await expect(page.getByRole('progressbar')).toHaveAccessibleName(
    '복원 위치 · 9/16단계, 일시정지',
  );
  await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
  await page.getByText('거리 20cm와 지그 고정 확인', { exact: true }).click();
  await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeEnabled();
  await checkCard(page, 'connection');
  await expect(voltageCard(page)).toHaveAccessibleName(/, 확인$/);
  await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

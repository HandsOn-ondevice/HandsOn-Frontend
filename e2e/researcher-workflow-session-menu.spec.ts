import { expect, test, type Page } from '@playwright/test';
import { openWorkflowInformation, closeWorkflowInformation } from './helpers/workflow-information';

async function enterExecution(page: Page) {
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
  await page.getByRole('button', { name: '실험 측정 시작', exact: true }).click();
  await expect(page).toHaveURL(/\/execution$/);
  return new URL(page.url()).pathname.replace(/\/execution$/, '');
}

async function menu(page: Page) {
  await expect(
    page
      .getByTestId('execution-screen')
      .getByRole('button', { name: '실험 일시정지', exact: true }),
  ).toHaveCount(0);
  await page
    .getByTestId('execution-screen')
    .getByRole('button', { name: '더 보기', exact: true })
    .click();
  await expect(page).toHaveURL(/\/session-menu$/);
  await expect(page.getByText('실험 작업 메뉴', { exact: true })).toBeVisible();
  await expect(
    page
      .getByTestId('session-menu-screen')
      .getByRole('button', { name: '실험 일시정지', exact: true }),
  ).toBeEnabled();
}

async function returnToExecution(page: Page, route: string) {
  await page.getByRole('button', { name: '현재 작업으로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(`${route}/execution`);
}

async function navigate(page: Page, path: string) {
  // 같은 앱 실행 중 URL 직접 진입. 새로고침으로 Mock을 초기화하지 않는다.
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}px 메뉴·장치 조회·S11 재확인에서 같은 조건과 회차를 유지한다`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const route = await enterExecution(page);
    const sample = page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true });
    const complete = page.getByRole('button', { name: '완료 요청', exact: true });
    for (let count = 1; count <= 7; count++) {
      await sample.click();
      await expect(complete).toBeEnabled();
      await complete.click();
      await expect(page.getByText(`유효 측정 ${count} / 15회`, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('“50% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    const executionScreen = page.getByTestId('execution-screen');
    await expect(
      executionScreen.getByRole('button', { name: '실험 일시정지', exact: true }),
    ).toHaveCount(0);
    await executionScreen.getByText('유효 측정 7 / 15회', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`s06-final-${viewport.width}-top.png`) });
    await executionScreen
      .getByText(/센서 응답 확인만으로 작업자 완료가 기록되지 않습니다/)
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`s06-final-${viewport.width}-bottom.png`) });
    await menu(page);
    await page.screenshot({ path: testInfo.outputPath(`session-menu-${viewport.width}.png`) });
    await returnToExecution(page, route);
    await expect(complete).toBeDisabled();
    await expect(page.getByText('유효 측정 7 / 15회', { exact: true })).toBeVisible();
    await menu(page);
    await page.getByRole('button', { name: '장치 상태 확인', exact: true }).click();
    await expect(page).toHaveURL(`${route}/device-status`);
    const deviceScreen = page.getByTestId('session-device-status-screen');
    await expect(deviceScreen.getByText('420 lx', { exact: true })).toBeVisible();
    await expect(deviceScreen.getByText('5.01 V · 83 mA · 416 mW', { exact: true })).toBeAttached();
    await expect(deviceScreen.getByText('24.3 °C · 46 %', { exact: true })).toBeAttached();
    await expect(
      page.getByText('시뮬레이션 · 실제 장치 연결·실측값이 아닙니다.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '장치·센서 다시 점검', exact: true }),
    ).toHaveCount(0);
    const footer = page.getByText(/마지막 응답의 기록입니다\./);
    await footer.scrollIntoViewIfNeeded();
    const footerBox = await footer.boundingBox();
    const shelf = await page
      .getByRole('button', { name: '현재 작업으로 돌아가기', exact: true })
      .boundingBox();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(shelf!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({
      path: testInfo.outputPath(`device-status-${viewport.width}-bottom.png`),
    });
    await page.getByRole('heading', { name: '실행 중 장치 상태' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`device-status-${viewport.width}-top.png`) });
    await deviceScreen.getByRole('button', { name: '뒤로가기', exact: true }).click();
    await expect(page).toHaveURL(`${route}/session-menu`);
    await expect(page.getByText('실험 작업 메뉴', { exact: true })).toBeVisible();
    await returnToExecution(page, route);
    await expect(page.getByText('유효 측정 7 / 15회', { exact: true })).toBeVisible();
    await expect(page.getByText('“50% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await menu(page);
    await page.getByRole('button', { name: '장치 상태 확인', exact: true }).click();
    await expect(page).toHaveURL(`${route}/device-status`);
    await returnToExecution(page, route);
    await expect(complete).toBeDisabled();
    await expect(page.getByText('“50% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await menu(page);
    await page.getByRole('button', { name: '실험 일시정지', exact: true }).click();
    await expect(page).toHaveURL(`${route}/paused`);
    await expect(page.getByText('다음 작업 · 50% 2회차', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '바로 재개', exact: true }).click();
    await expect(page).toHaveURL(`${route}/resume`);
    const resumeScreen = page.getByTestId('resume-screen');
    const resume = resumeScreen.getByRole('button', { name: '확인하고 재개', exact: true });
    await expect(resume).toBeDisabled();
    await expect(
      resumeScreen.getByText('50% 조건\n2회차부터 재개합니다', { exact: true }),
    ).toBeVisible();
    await expect(resumeScreen.getByRole('progressbar')).toHaveAccessibleName(
      '복원 위치 · 11/16단계, 일시정지',
    );
    await expect(resumeScreen.getByRole('progressbar')).toContainText('69%');
    await expect(resumeScreen.getByText(/유효 측정 7 \/ 15회 · 47%/)).toBeVisible();
    for (const name of [
      /^센서 근거, Orange Pi 5\+와 필수 센서 3개 연결,/,
      /^센서 근거, 공급 전압/,
    ]) {
      const card = resumeScreen.getByRole('button', { name });
      await card.click();
      await expect(card).toHaveAccessibleName(/, 확인$/);
    }
    await expect(resume).toBeDisabled();
    await page.getByText('거리 20cm와 지그 고정 확인', { exact: true }).click();
    await expect(page.getByText('재개 준비 완료', { exact: true })).toBeAttached();
    await expect(resume).toBeEnabled();
    await page
      .getByText('같은 회차에서 새 측정 응답을 확인합니다.', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`resume-ready-${viewport.width}-bottom.png`),
    });
    await page.getByText(/간 일시정지됨$/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`resume-ready-${viewport.width}-top.png`) });
    await resume.click();
    await expect(page).toHaveURL(`${route}/execution`);
    await expect(page.getByText('유효 측정 7 / 15회', { exact: true })).toBeVisible();
    await expect(page.getByText('“50% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await expect(complete).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('장치 조회는 S05를 현재 응답으로 쓰지 않고 최신 센서 오류와 진행 차단을 보존한다', async ({
  page,
}) => {
  const route = await enterExecution(page);
  await menu(page);
  await page.getByRole('button', { name: '장치 상태 확인', exact: true }).click();
  await expect(page.getByText('Orange Pi 5+ 실행 응답 없음', { exact: true })).toBeVisible();
  await expect(page.getByText('실행 중 응답 없음', { exact: true })).toHaveCount(3);
  await returnToExecution(page, route);
  await openWorkflowInformation(page);
  await page.getByRole('button', { name: '미리보기 설정', exact: true }).click();
  await page.getByRole('button', { name: /^측정 응답 조건:/ }).click();
  await page.getByRole('radio', { name: '통신 오류', exact: true }).click();
  await closeWorkflowInformation(page);
  await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }),
  ).toBeEnabled();
  await menu(page);
  await page.getByRole('button', { name: '장치 상태 확인', exact: true }).click();
  await expect(page.getByText(/^통신 오류/)).toBeVisible();
  await expect(page.getByText('— lx', { exact: true })).toBeVisible();
  await returnToExecution(page, route);
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }),
  ).toBeEnabled();
});

test('S11 직접 진입은 실행 중 세션을 S06으로 보내고 없는 세션을 자동 생성하지 않는다', async ({
  page,
}) => {
  const route = await enterExecution(page);
  await navigate(page, `${route}/resume`);
  await expect(page).toHaveURL(`${route}/execution`);
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
  await navigate(page, '/researcher-workflow/missing-session/resume');
  await expect(page.getByText('재개 전 확인을 처리하지 못했습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확인하고 재개', exact: true })).toBeDisabled();
  await navigate(page, `${route}/execution`);
  await expect(page.getByText('유효 측정 0 / 15회', { exact: true })).toBeVisible();
});

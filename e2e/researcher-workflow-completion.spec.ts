import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function enterExecution(page: Page) {
  page.setDefaultTimeout(15_000);
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
async function measure(page: Page) {
  await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
  const complete = page.getByRole('button', { name: '완료 요청', exact: true });
  await expect(complete).toBeEnabled();
  await complete.click();
}
async function scenario(page: Page, label: string) {
  const screen = page.getByTestId(
    new URL(page.url()).pathname.endsWith('/recovery') ? 'recovery-screen' : 'execution-screen',
  );
  await screen.getByRole('button', { name: '더 보기', exact: true }).click();
  await page.getByRole('button', { name: '미리보기 설정', exact: true }).click();
  await page.getByRole('button', { name: /^측정 응답 조건:/ }).click();
  await page.getByRole('radio', { name: label, exact: true }).click();
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
}
// 같은 앱 실행 중 URL 이동·뒤로 가기를 재현한다. 새로고침으로 메모리 Repository를 바꾸지 않는다.
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(path);
}
async function resultIdentity(page: Page) {
  await page
    .getByTestId('result-summary-screen')
    .getByRole('button', { name: '더 보기', exact: true })
    .click();
  const identity = page.getByText(/^전체 결과 ID:/);
  await expect(identity).toBeVisible();
  const value = await identity.innerText();
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
  return value;
}
async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  heading: string,
  lastText: string,
  shelfName: string,
) {
  const last = page.getByText(lastText, { exact: true });
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  const shelf = await page.getByRole('button', { name: shelfName, exact: true }).boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(shelf!.y);
  await page.screenshot({ path: testInfo.outputPath(`${name}-bottom.png`) });
  await page.getByRole('heading', { name: heading, exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('heading', { name: heading, exact: true }).evaluate((element) => {
    let parent = element.parentElement;
    while (parent) {
      if (
        parent.scrollHeight > parent.clientHeight &&
        /auto|scroll/.test(getComputedStyle(parent).overflowY)
      ) {
        parent.scrollTop = 0;
        break;
      }
      parent = parent.parentElement;
    }
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}-top.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}×${viewport.height} S04~S15 측정·복구·검토·정리·상세·Mock 제출`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const route = await enterExecution(page);
    // 실제 실패와 복구 후 재측정을 만든다. 완료 기록을 주입하지 않는다.
    await scenario(page, '통신 오류');
    await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
    await page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }).click();
    await expect(page).toHaveURL(`${route}/recovery`);
    await page
      .getByTestId('recovery-screen')
      .getByRole('button', { name: '더 보기', exact: true })
      .click();
    await page.getByRole('button', { name: '미리보기 설정', exact: true }).click();
    await page.getByRole('button', { name: /^측정 응답 조건:/ }).click();
    await page.getByRole('radio', { name: '정상 응답', exact: true }).click();
    await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
    await page.getByRole('button', { name: '1회차 다시 측정', exact: true }).click();
    await page.getByRole('button', { name: '완료 요청', exact: true }).click();
    for (let index = 1; index < 15; index++) await measure(page);
    await expect(page).toHaveURL(`${route}/review`);
    await expect(page.getByText('유효 측정 15회가 확인되었습니다', { exact: true })).toBeVisible();
    await capture(
      page,
      testInfo,
      `s12-${viewport.width}`,
      '종료 전에 누락과 재측정을 확인하세요',
      '무효 기록은 삭제하지 않고 새 측정 결과와 연결합니다.',
      '장치 정리로 이동',
    );
    await page.getByRole('button', { name: '장치 정리로 이동', exact: true }).click();
    await expect(page).toHaveURL(`${route}/cleanup`);
    const finish = page.getByRole('button', { name: '정리 확인 후 종료 가능', exact: true });
    await expect(finish).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: '센서 케이블 분리와 정리', exact: true }),
    ).toBeDisabled();
    await capture(
      page,
      testInfo,
      `s13-pending-${viewport.width}`,
      '실험 장치를 안전하게 정리하세요',
      '“물리 전원 꺼진 것 확인했어” · 위 항목에서 직접 확인해 주세요.',
      '정리 확인 후 종료 가능',
    );
    const powerOff = page.getByRole('checkbox', { name: 'USB 전원 장치 OFF 확인', exact: true });
    await powerOff.click();
    // S13-2: 두 완료 카드의 초록색과 종료 차단을 두 해상도에서 직접 검사한다.
    await expect(powerOff).toContainText('물리 전원 · 작업자 확인 완료');
    await expect(powerOff).toHaveCSS('background-color', 'rgb(225, 243, 235)');
    await expect(
      page.getByRole('button', { name: 'LED 출력 0% 명령 전송', exact: true }),
    ).toHaveCSS('background-color', 'rgb(225, 243, 235)');
    await expect(finish).toBeDisabled();
    const cables = page.getByRole('checkbox', { name: '센서 케이블 분리와 정리', exact: true });
    const storage = page.getByRole('checkbox', { name: 'LED 모듈·지그 원위치', exact: true });
    await expect(cables).toHaveCSS('background-color', 'rgb(255, 241, 214)');
    await expect(storage).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(storage).toBeDisabled();
    await capture(
      page,
      testInfo,
      `s13-2-${viewport.width}`,
      '실험 장치를 안전하게 정리하세요',
      '전원을 차단한 뒤 센서 케이블을 분리해 주세요.',
      '정리 확인 후 종료 가능',
    );
    const output = page.getByRole('button', { name: 'LED 출력 0% 명령 전송', exact: true });
    const outputRecord = await output.innerText();
    await page
      .getByTestId('completion-종료와 장치 정리')
      .getByRole('button', { name: '뒤로가기', exact: true })
      .click();
    await expect(page).toHaveURL(`${route}/review`);
    await page.getByRole('button', { name: '장치 정리로 이동', exact: true }).click();
    await expect(page).toHaveURL(`${route}/cleanup`);
    await expect(output).toHaveText(outputRecord, { useInnerText: true });
    await expect(powerOff).toContainText('물리 전원 · 작업자 확인 완료');
    await cables.click();
    await expect(powerOff).toBeDisabled();
    await expect(powerOff).toHaveCSS('background-color', 'rgb(225, 243, 235)');
    await expect(cables).toHaveCSS('background-color', 'rgb(225, 243, 235)');
    await expect(storage).toHaveCSS('background-color', 'rgb(255, 241, 214)');
    await expect(finish).toBeDisabled();
    await capture(
      page,
      testInfo,
      `s13-3-${viewport.width}`,
      '실험 장치를 안전하게 정리하세요',
      'LED 모듈과 지그를 보관 위치에 정리해 주세요.',
      '정리 확인 후 종료 가능',
    );
    await storage.click();
    for (const item of [powerOff, cables, storage])
      await expect(item).toHaveCSS('background-color', 'rgb(225, 243, 235)');
    await expect(
      page.getByRole('button', { name: '완료하고 결과 보기', exact: true }),
    ).toBeEnabled();
    await page.getByRole('checkbox', { name: 'LED 모듈·지그 원위치', exact: true }).click();
    await expect(finish).toBeDisabled();
    await page.getByRole('checkbox', { name: 'LED 모듈·지그 원위치', exact: true }).click();
    await capture(
      page,
      testInfo,
      `s13-complete-${viewport.width}`,
      '실험 장치를 안전하게 정리하세요',
      '작업자 확인과 센서 근거를 각각 기록했습니다.',
      '완료하고 결과 보기',
    );
    await page.getByRole('button', { name: '완료하고 결과 보기', exact: true }).click();
    await expect(page).toHaveURL(`${route}/results`);
    await expect(page.getByText('조건별 측정 · 15 / 15', { exact: true })).toBeVisible();
    await capture(
      page,
      testInfo,
      `s14-${viewport.width}`,
      '작업을 완료했어요',
      '시스템 완료는 학술적 데이터 사용 가능 판정을 의미하지 않습니다.',
      '숙련자에게 제출',
    );
    const resultId = await resultIdentity(page);
    await page.getByRole('button', { name: '상세 이력', exact: true }).click();
    await expect(page).toHaveURL(/\/measurement-details\?conditionId=output-0$/);
    await expect(page.getByText('유효 3건 · 무효 1건', { exact: true })).toBeVisible();
    await expect(page.getByText('센서 응답 재확인 완료', { exact: true })).toBeAttached();
    await capture(
      page,
      testInfo,
      `s15-${viewport.width}`,
      '0% 조건 상세',
      'ID · 값 · 단위 · 타임스탬프',
      '전체 결과로 돌아가기',
    );
    await page
      .getByTestId('completion-측정 상세와 근거 이력')
      .getByRole('button', { name: '더 보기', exact: true })
      .click();
    const sheetHeading = page.getByRole('heading', {
      name: '측정 상세와 근거 이력 정보',
      exact: true,
    });
    await sheetHeading.scrollIntoViewIfNeeded();
    await expect(sheetHeading).toBeInViewport({ ratio: 1 });
    await expect(page.getByText(/bh1750 · /).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`s15-sheet-${viewport.width}-top.png`) });
    const lastEvidence = page.getByText(/^작업자 mock-researcher · /).last();
    await lastEvidence.scrollIntoViewIfNeeded();
    await expect(lastEvidence).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`s15-sheet-${viewport.width}-bottom.png`) });
    await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '전체 결과로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '50% 조건 상세 보기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '50% 조건 상세', exact: true })).toBeVisible();
    await expect(page.getByText('420.0 lx', { exact: true })).toBeVisible();
    await capture(
      page,
      testInfo,
      `s15-50-${viewport.width}`,
      '50% 조건 상세',
      'ID · 값 · 단위 · 타임스탬프',
      '전체 결과로 돌아가기',
    );
    await page
      .getByTestId('completion-측정 상세와 근거 이력')
      .getByRole('button', { name: '뒤로가기', exact: true })
      .click();
    await expect(page).toHaveURL(`${route}/results`);
    expect(await resultIdentity(page)).toBe(resultId);
    await expect(page.getByText('조건별 측정 · 15 / 15', { exact: true })).toBeVisible();
    await navigate(page, `${route}/execution`);
    await expect(page).toHaveURL(`${route}/results`);
    await page.getByRole('button', { name: '숙련자에게 제출', exact: true }).dblclick();
    await expect(page.getByText('결과를 제출했습니다', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/mock-researcher · LED-M03 · v1\.2\s*숙련자의 최종 검토를 기다립니다\./),
    ).toBeVisible();
    await expect(page.getByText(/Mock 시연용 제출 · 앱 메모리 내 접수 완료/)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`s14-submitted-${viewport.width}.png`) });
    await page
      .getByTestId('completion-처리 결과')
      .getByRole('button', { name: '더 보기', exact: true })
      .click();
    await expect(page.getByText(/제출은 메모리 안의 Mock 검토 대기열 접수입니다/)).toBeVisible();
    await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
    await navigate(page, `${route}/cleanup`);
    await expect(page).toHaveURL(`${route}/results`);
    await expect(page.getByText('결과를 제출했습니다', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('S12 누락·무효 회차는 기존 복구 흐름으로 이동하고 완료 후 검토로 복귀한다', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const route = await enterExecution(page);
  await navigate(page, `${route}/review`);
  await expect(page.getByText('15건 확인', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '장치 정리로 이동', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('s12-missing.png') });
  await page.getByRole('button', { name: '0% 조건 1회차 재측정', exact: true }).click();
  await scenario(page, '통신 오류');
  await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '완료 요청', exact: true })).toBeDisabled();
  await navigate(page, `${route}/review`);
  await expect(page.getByText('1회차 재측정 · 무효', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('s12-invalid.png') });
  await page.getByRole('button', { name: '현재 재측정으로 돌아가기', exact: true }).click();
  await scenario(page, '정상 응답');
  await page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }).click();
  await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
  await page.getByRole('button', { name: '1회차 다시 측정', exact: true }).click();
  await page.getByRole('button', { name: '완료 요청', exact: true }).click();
  await expect(page).toHaveURL(`${route}/review`);
  await expect(page.getByText('14건 확인', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '0% 조건 2회차 재측정', exact: true }).click();
  await measure(page);
  await expect(page).toHaveURL(`${route}/review`);
  await expect(page.getByText('13건 확인', { exact: true })).toBeVisible();
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}×${viewport.height} S12 선택 조건·14/15 무효 기록·재측정 복귀를 보존한다`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const route = await enterExecution(page);
    for (let i = 0; i < 11; i++) await measure(page);
    await scenario(page, '통신 오류');
    await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
    await scenario(page, '정상 응답');
    await navigate(page, `${route}/review`);
    // 기존 명령으로 나머지 조건을 실제 측정한다. 완료·실패 기록을 주입하지 않는다.
    for (const trial of [1, 2, 3]) {
      await page.getByRole('button', { name: '100% 조건 상세 보기', exact: true }).click();
      await page
        .getByRole('button', { name: `100% 조건 ${trial}회차 재측정`, exact: true })
        .click();
      await measure(page);
      await expect(page).toHaveURL(`${route}/review`);
    }
    await expect(page.getByText('1건 확인', { exact: true })).toBeVisible();
    await expect(page.getByText('75% 조건 3회차가 부족해요', { exact: true })).toBeVisible();
    await expect(page.getByText('유효 측정 2건 · 무효 1건 · 필수', { exact: true })).toBeVisible();
    await expect(page.getByText('14 / 15', { exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: '장치 정리로 이동', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: '0% 조건 상세 보기', exact: true }).click();
    await expect(
      page.getByText('0% 조건의 유효 측정이 확인되었습니다', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('유효 측정 3건 · 무효 0건', { exact: true })).toBeVisible();
    await expect(page.getByText('1회차 · 18.4 lx · 유효', { exact: true })).toBeAttached();
    await expect(page.getByText('3회차 · 무효', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '75% 조건 상세 보기', exact: true }).click();
    await expect(page.getByText('75% 조건 3회차가 부족해요', { exact: true })).toBeVisible();
    await expect(page.getByText('1회차 · 610 lx · 유효', { exact: true })).toBeAttached();
    await capture(
      page,
      testInfo,
      `s12-invalid-14-${viewport.width}`,
      '종료 전에 누락과 재측정을 확인하세요',
      '무효 기록은 삭제하지 않고 새 측정 결과와 연결합니다.',
      '75% 조건 3회차 재측정',
    );
    await page.getByRole('button', { name: '75% 조건 3회차 재측정', exact: true }).click();
    await page.getByRole('button', { name: '센서 오류와 작업 보류 확인', exact: true }).click();
    await page.getByRole('button', { name: '센서 다시 확인', exact: true }).click();
    await page.getByRole('button', { name: '3회차 다시 측정', exact: true }).click();
    await page.getByRole('button', { name: '완료 요청', exact: true }).click();
    await expect(page).toHaveURL(`${route}/review`);
    await expect(page.getByText('유효 측정 15회가 확인되었습니다', { exact: true })).toBeVisible();
    await expect(page.getByText('이전 3회차 · 무효 기록 보존', { exact: true })).toBeAttached();
    await expect(page.getByText('3회차 재측정 · 610 lx · 유효', { exact: true })).toBeAttached();
    await capture(
      page,
      testInfo,
      `s12-repaired-15-${viewport.width}`,
      '종료 전에 누락과 재측정을 확인하세요',
      '무효 기록은 삭제하지 않고 새 측정 결과와 연결합니다.',
      '장치 정리로 이동',
    );
  });
}

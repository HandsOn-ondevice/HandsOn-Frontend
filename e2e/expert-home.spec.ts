import { expect, test, type Page } from '@playwright/test';

const environment = '전자회로 실험실';
const environmentId = 'demo-circuits';
const draftId = `${environmentId}:procedure:led-output-draft`;
const procedureId = `${environmentId}:procedure:led-output`;
const resultId = `${environmentId}:result:led-m03`;

async function enterExpertHome(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '숙련 연구생, 절차 생성·승인' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  const environmentOption = page.getByRole('radio', { name: environment, exact: true });
  await environmentOption.click();
  await expect(environmentOption).toBeHidden();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await expect(page.getByRole('heading', { name: '숙련자 홈' })).toBeVisible();
  await expect(
    page.getByText(environment, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
}

async function returnHome(page: Page) {
  await page.getByRole('button', { name: '숙련자 홈으로' }).click();
  await expect(page).toHaveURL('/expert');
  await expect(page.getByRole('button', { name: '초안, 1, 개' })).toBeVisible();
}

for (const viewport of [
  { width: 412, height: 920 },
  { width: 360, height: 800 },
]) {
  test(`${viewport.width}px 숙련자 홈에서 작성·편집·검토로 식별자를 유지하며 진입한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await enterExpertHome(page);
    await expect(page.getByRole('button', { name: '결과 검토, 2, 건' })).toBeVisible();
    await expect(page.getByRole('button', { name: '승인 절차, 4, 개' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('expert-home.png') });

    await page.getByRole('button', { name: '새 절차 음성으로 만들기' }).click();
    await expect(page).toHaveURL('/expert/procedures/new');
    await expect(page.getByRole('heading', { name: '새 절차 작성' })).toBeVisible();
    await returnHome(page);

    await page
      .getByRole('button', { name: /LED 출력 특성 측정 초안/ })
      .first()
      .click();
    await expect
      .poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/expert/procedures/${draftId}`);
    await expect(page.getByRole('heading', { name: '절차 편집' })).toBeVisible();
    await returnHome(page);

    await page.getByRole('button', { name: /노준혁.*LED-M03/ }).click();
    await expect
      .poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/expert/results/${resultId}`);
    expect(new URL(page.url()).searchParams.get('procedureId')).toBe(procedureId);
    await expect(page.getByRole('heading', { name: '결과 검토', exact: true })).toBeVisible();
    await returnHome(page);

    await page.getByRole('tab', { name: '절차', exact: true }).click();
    await page.getByRole('radio', { name: '승인 절차' }).click();
    await expect(page.getByRole('button', { name: /I2C 센서 수집 점검/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /LED 출력 특성 측정 초안/ })).toHaveCount(0);

    await page.getByRole('tab', { name: '현황' }).click();
    await page.getByRole('radio', { name: '검토 완료' }).click();
    await expect(page.getByRole('button', { name: /이서준.*LED-M01/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /노준혁.*LED-M03/ })).toHaveCount(0);
    await page.getByRole('tab', { name: '내 정보' }).click();
    await page.getByRole('button', { name: '역할·작업 환경 변경' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: /^연구실: / })).toHaveAccessibleName(
      '연구실: 연구실을 선택해 주세요',
    );
    await expect(page.getByRole('button', { name: '설정하고 계속' })).toBeDisabled();
  });
}

import { expect, test, type Page } from '@playwright/test';

const pendingResult = /노준혁.*LED-M03/;
const reviewTitle = '연구생 결과 검토';

async function openPendingResult(page: Page, result = pendingResult) {
  await page.goto('/');
  await page.getByRole('radio', { name: '숙련 연구생, 절차 생성·승인' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  const environment = page.getByRole('radio', { name: '전자회로 실험실', exact: true });
  await environment.click();
  await expect(environment).toBeHidden();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await page.getByRole('button', { name: result }).click();
  await expect(page.getByText(reviewTitle, { exact: true })).toBeVisible();
}

test('조건별 근거를 확인하고 작성한 의견으로 결과 검토를 완료한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 412, height: 920 });
  await openPendingResult(page);
  await page.screenshot({ path: testInfo.outputPath('expert-review.png') });

  const note = page.getByRole('textbox', { name: '검토 의견' });
  await note.fill('50% 조건 재측정 근거를 확인했습니다.');
  await page.getByRole('button', { name: /^50% 조건 센서 오류/ }).click();
  await expect(page.getByRole('heading', { name: '50% 조건 상세', exact: true })).toBeVisible();
  await expect(page.getByText('2회차 · 무효 · 420 lx', { exact: true })).toBeVisible();
  await expect(page.getByText('센서 케이블 재연결', { exact: true })).toBeVisible();
  await expect(page.getByText('2회차 재측정 · 유효 · 423 lx', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('expert-review-evidence.png') });
  await page.getByRole('button', { name: '결과 검토로 돌아가기', exact: true }).click();
  await expect(note).toHaveValue('50% 조건 재측정 근거를 확인했습니다.');

  await page.getByRole('button', { name: '검토 완료', exact: true }).click();
  await expect(page.getByText('결과 검토를 완료했습니다', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('expert-review-completed.png') });
  await page.getByRole('button', { name: '숙련자 홈으로', exact: true }).click();
  await expect(page).toHaveURL('/expert');
  await expect(page.getByRole('button', { name: '결과 검토, 1, 건' })).toBeVisible();

  await page.getByRole('tab', { name: '현황', exact: true }).click();
  await page.getByRole('radio', { name: '검토 완료', exact: true }).click();
  await page.getByRole('button', { name: pendingResult }).click();
  await expect(page.getByRole('button', { name: '검토 완료', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('50% 조건 재측정 근거를 확인했습니다.', { exact: true }),
  ).toBeVisible();
});

test('재측정 요청 후에도 기존 근거를 열고 숙련자 현황에서 처리 상태를 확인할 수 있다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openPendingResult(page);
  await page.getByRole('button', { name: '재측정 요청', exact: true }).click();
  await expect(page.getByText('재측정 요청을 기록했습니다', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('expert-review-remeasurement.png') });
  await page.getByRole('button', { name: '검토 화면으로 돌아가기', exact: true }).click();
  await expect(page.getByText(reviewTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '재측정 요청', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /^50% 조건, 422 lx/ }).click();
  await expect(page.getByText('2회차 · 무효 · 420 lx', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '결과 검토로 돌아가기', exact: true }).click();

  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL('/expert');
  await expect(page.getByRole('button', { name: '결과 검토, 1, 건' })).toBeVisible();
  await page.getByRole('tab', { name: '현황', exact: true }).click();
  await page.getByRole('radio', { name: '재측정 요청', exact: true }).click();
  await expect(page.getByRole('button', { name: pendingResult })).toBeVisible();
});

test('선택한 결과에 근거가 없으면 조건 상세에 빈 상태를 표시한다', async ({ page }) => {
  await openPendingResult(page, /김민지.*LED-M02/);
  await page.getByRole('button', { name: /^100% 조건/ }).click();
  await expect(page.getByRole('heading', { name: '100% 조건 상세', exact: true })).toBeVisible();
  await expect(page.getByText('기록된 측정 근거가 없습니다.', { exact: true })).toBeVisible();
});

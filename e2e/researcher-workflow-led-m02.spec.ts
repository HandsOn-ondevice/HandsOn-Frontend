import { expect, test } from '@playwright/test';

const route = '/researcher-workflow/demo-session-led-m02';
const resultId = 'demo-result-led-m02';
const summary = `${route}/results?resultId=${resultId}&view=summary`;

test('LED-M02 결과 직접 진입·조건별 상세·복귀·새로고침은 동일한 제출 기록을 조회한다', async ({
  page,
}) => {
  await page.goto(summary);
  await expect(page.getByText('제출 완료 · 읽기 전용', { exact: true })).toBeVisible();
  await expect(page.getByText('조건별 측정 · 15 / 15', { exact: true })).toBeVisible();
  await expect(
    page.getByText('작업자 · mock-researcher / 장치 ID · LED-M02', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '숙련자에게 제출', exact: true })).toHaveCount(0);
  for (const [condition, value] of [
    ['0', '18.4'],
    ['25', '210.0'],
    ['50', '420.0'],
    ['75', '610.0'],
    ['100', '810.0'],
  ]) {
    await page.getByRole('button', { name: `${condition}% 조건 상세 보기`, exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `${route}/measurement-details` &&
        url.searchParams.get('conditionId') === `output-${condition}` &&
        url.searchParams.get('resultId') === resultId,
    );
    await expect(page.getByText(`${value} lx`, { exact: true })).toBeVisible();
    await expect(
      page.getByText(`유효 3건 · 무효 ${condition === '50' ? 1 : 0}건`, { exact: true }),
    ).toBeVisible();
    if (condition === '50') {
      await expect(page.getByText('2회차 · 무효 · 420 lx', { exact: true })).toBeVisible();
      await expect(page.getByText('2회차 재측정 · 유효 · 420 lx', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: '전체 결과로 돌아가기', exact: true }).click();
    await expect(page).toHaveURL(summary);
  }
  await page.reload();
  await expect(page.getByText('제출 완료 · 읽기 전용', { exact: true })).toBeVisible();
  await expect(page.getByText('조건별 측정 · 15 / 15', { exact: true })).toBeVisible();
  await page.goto(`${route}/results?resultId=${resultId}`);
  await expect(page.getByText('결과를 제출했습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '제출한 결과 조회', exact: true })).toHaveCount(0);
});

test('LED-M02 결과와 상세 직접 진입에서 없는 결과·세션 및 M03 결과 오연결을 차단한다', async ({
  page,
}) => {
  for (const path of [
    `${route}/results?resultId=missing-result&view=summary`,
    `${route}/measurement-details?conditionId=output-50&resultId=missing-result`,
    `/researcher-workflow/missing-session/results?resultId=${resultId}&view=summary`,
    `/researcher-workflow/demo-session-led-m03/results?resultId=${resultId}&view=summary`,
  ]) {
    await page.goto(path);
    await expect(page.getByText('결과를 찾을 수 없습니다', { exact: true })).toBeVisible();
    await expect(page.getByTestId('result-summary-screen')).toHaveCount(0);
    await expect(page.getByText('50% 조건 상세', { exact: true })).toHaveCount(0);
  }
});

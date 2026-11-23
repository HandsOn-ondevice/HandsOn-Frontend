import { expect, test } from '@playwright/test';
import { enterMockStudentHome, startMockPreparation } from './helpers/mock-researcher-workflow';

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}px 준비 중인 세션을 S01에서 이어 S04·S05·S06을 연결하고 회차를 보존한다`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await enterMockStudentHome(page);
    const route = await startMockPreparation(page);
    await expect(page.getByText('준비 진행도 · 0 / 6 항목 완료')).toBeVisible();
    const materials = page.getByRole('checkbox', { name: '필수 준비물 7개 확인', exact: true });
    await materials.click();
    await expect(page.getByText('준비 진행도 · 1 / 6 항목 완료')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/researcher-workflow');
    await page.goBack();
    await expect(page).toHaveURL('/student');
    await page.getByRole('button', { name: '이어서 진행', exact: true }).click();
    await expect(page).toHaveURL(({ pathname }) => pathname === `${route}/preparation`);
    await expect(page.getByText('준비 진행도 · 1 / 6 항목 완료')).toBeVisible();
    await expect(materials).toContainText('작업자 확인 ·');
    await materials.click();
    await expect(page.getByText('준비 진행도 · 0 / 6 항목 완료')).toBeVisible();
    for (const label of [
      '필수 준비물 7개 확인',
      '장치 ID LED-M03 확인',
      '전원 차단 확인',
      '센서 배선 연결',
      'LED와 BH1750 거리 20cm',
    ]) {
      await page.getByRole('checkbox', { name: label, exact: true }).click();
    }
    await page.screenshot({ path: testInfo.outputPath('s04-resumed.png') });
    await page.getByRole('button', { name: '확인 완료', exact: true }).click();
    await expect(page).toHaveURL(`${route}/device-check`);
    const start = page.getByRole('button', { name: '실험 측정 시작', exact: true });
    await expect(start).toBeDisabled();
    await page.getByRole('button', { name: '장치·센서 점검 시작', exact: true }).click();
    await expect(start).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('s05-resumed.png') });
    await start.click();
    await expect(page).toHaveURL(`${route}/execution`);
    await expect(page.getByText('말씀하세요', { exact: true })).toBeVisible();
    await expect(page.getByText('“0% 조건 1회차 완료했어”', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '실험 일시정지', exact: true })).toHaveCount(0);
    await expect(
      page.getByTestId('execution-screen').getByRole('button', { name: '더 보기', exact: true }),
    ).toBeEnabled();
    const complete = page.getByRole('button', { name: '완료 요청', exact: true });
    await expect(complete).toBeDisabled();
    await page.getByRole('button', { name: '현재 회차 측정값 확인', exact: true }).click();
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(page.getByText('“0% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
    await expect(page).toHaveURL(`${route}/device-check`);
    await page.getByRole('button', { name: '실험 진행으로 돌아가기', exact: true }).click();
    await expect(page).toHaveURL(`${route}/execution`);
    await expect(page.getByText('유효 측정 1 / 15회', { exact: true })).toBeVisible();
    await expect(page.getByText('“0% 조건 2회차 완료했어”', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('s06-resumed.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });
}

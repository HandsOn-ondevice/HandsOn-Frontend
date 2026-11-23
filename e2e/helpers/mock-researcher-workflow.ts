import { expect, type Page } from '@playwright/test';

export async function enterMockStudentHome(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지능형 임베디드·IoT 센서 연구실', exact: true }).click();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await expect(page).toHaveURL('/student');
}

export async function startMockPreparation(page: Page) {
  // 개발 진입점으로 이동하면서 현재 앱의 역할 선택과 Mock 세션 저장소를 유지합니다.
  await page.evaluate(() => {
    history.pushState({}, '', '/researcher-workflow');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: '새 Mock 실험 준비 시작', exact: true }).click();
  await expect(page).toHaveURL(/\/researcher-workflow\/mock-session-[^/]+\/preparation$/);
  return new URL(page.url()).pathname.replace(/\/preparation$/, '');
}

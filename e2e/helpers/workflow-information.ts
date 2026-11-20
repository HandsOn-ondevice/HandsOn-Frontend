import { expect, type Page } from '@playwright/test';

/** S06의 작업 메뉴와 개발용 정보 시트는 별도 화면이다. 복구 화면의 시트는 유지한다. */
export async function openWorkflowInformation(page: Page, screenId?: string) {
  if (screenId === 'execution-screen' || new URL(page.url()).pathname.endsWith('/execution')) {
    await expect(page).toHaveURL(/\/execution$/);
    await page
      .getByTestId('execution-screen')
      .getByRole('button', { name: '더 보기', exact: true })
      .click();
    await expect(page).toHaveURL(/\/session-menu$/);
    await page
      .getByTestId('session-menu-screen')
      .getByRole('button', { name: '더 보기', exact: true })
      .click();
  } else {
    const screen = screenId ? page.getByTestId(screenId) : page;
    await screen.getByRole('button', { name: '더 보기', exact: true }).click();
  }
}

export async function closeWorkflowInformation(page: Page) {
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '하단 시트 닫기', exact: true })).toHaveCount(0);
  if (new URL(page.url()).pathname.endsWith('/session-menu')) {
    await page.getByRole('button', { name: '현재 작업으로 돌아가기', exact: true }).click();
    await expect(page).toHaveURL(/\/execution$/);
  }
}

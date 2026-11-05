import { expect, test } from '@playwright/test';

const studentRole = '신규 연구생, 승인된 절차 실행';
const expertRole = '숙련 연구생, 절차 생성·승인';

test('선택한 환경으로 역할별 홈에 진입하고 뒤로 돌아와 설정을 유지한다', async ({ page }) => {
  const environment = '전자회로 실험실';
  await page.goto('/');

  const continueButton = page.getByRole('button', { name: '설정하고 계속' });
  const environmentField = page.getByRole('button', { name: /^연구실: / });
  const environmentOption = page.getByRole('radio', { name: environment, exact: true });
  const environmentSummary = page.getByText(environment, { exact: true }).filter({ visible: true });
  await page.getByRole('radio', { name: studentRole }).click();
  await environmentField.click();
  await environmentOption.click();
  await expect(environmentOption).toBeHidden();
  await continueButton.click();

  await expect(page).toHaveURL('/student');
  await expect(page.getByRole('heading', { name: '연구생 홈' })).toBeVisible();
  await expect(environmentSummary).toBeVisible();

  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('radio', { name: studentRole })).toBeChecked();
  await expect(environmentField).toHaveAccessibleName(`연구실: ${environment}`);

  await page.getByRole('radio', { name: expertRole }).click();
  await continueButton.click();

  await expect(page).toHaveURL('/expert');
  await expect(page.getByRole('heading', { name: '숙련자 홈' })).toBeVisible();
  await expect(environmentSummary).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('radio', { name: expertRole })).toBeChecked();
  await expect(environmentField).toHaveAccessibleName(`연구실: ${environment}`);
});

for (const home of ['/student', '/expert']) {
  test(`설정 없이 ${home}에 직접 진입하면 역할 선택으로 이동한다`, async ({ page }) => {
    await page.goto(home);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('radio', { name: studentRole })).toBeVisible();
    await expect(page.getByRole('button', { name: '설정하고 계속' })).toBeDisabled();
  });
}

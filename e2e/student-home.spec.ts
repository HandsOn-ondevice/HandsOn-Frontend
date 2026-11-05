import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 412, height: 920 } });

const iotEnvironment = '지능형 임베디드·IoT 센서 연구실';

async function enterStudentHome(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: iotEnvironment, exact: true }).click();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await expect(page.getByRole('button', { name: '이어서 진행' })).toBeVisible();
}

async function returnHome(page: Page) {
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL('/student');
  await expect(page.getByRole('button', { name: '이어서 진행' })).toBeVisible();
}

test('기존 세션과 최근 결과 식별자를 유지하며 홈의 작업 경로로 이동한다', async ({ page }) => {
  await enterStudentHome(page);

  await page.getByRole('button', { name: '이어서 진행' }).click();
  await expect(page).toHaveURL('/researcher-workflow/demo-session-led-m03/preparation');
  await expect(
    page.getByText('저장된 작업을 이어가는 화면을 준비하고 있어요. 홈에서 다시 확인해 주세요.'),
  ).toBeVisible();
  await returnHome(page);

  await page.getByRole('button', { name: '전체 보기' }).click();
  await expect(page).toHaveURL('/procedures?environmentId=demo-embedded-iot');
  await expect(page.getByText('승인된 절차 2개')).toBeVisible();
  await returnHome(page);

  await page.getByRole('tab', { name: '실험', exact: true }).click();
  await expect(page).toHaveURL('/procedures?environmentId=demo-embedded-iot');
  await expect(page.getByText('승인된 절차 2개')).toBeVisible();
  await returnHome(page);

  await page.getByRole('button', { name: 'LED-M02 특성 측정, 결과 보기' }).click();
  await expect(page).toHaveURL('/results/demo-result-led-m02?sessionId=demo-session-led-m02');
  await expect(page.getByText('저장된 결과를 확인하는 화면을 준비하고 있어요.')).toBeVisible();
  await returnHome(page);

  await page.getByRole('tab', { name: '이력', exact: true }).click();
  await expect(page).toHaveURL('/history');
  await expect(page.getByText('지난 작업 이력을 모아 보는 화면을 준비하고 있어요.')).toBeVisible();
  await returnHome(page);

  await page.getByRole('tab', { name: '장치', exact: true }).click();
  await expect(page).toHaveURL('/devices');
  await expect(page.getByText('연결된 장치를 확인하는 화면을 준비하고 있어요.')).toBeVisible();
  await page.getByRole('button', { name: '연구생 홈으로' }).click();
  await expect(page).toHaveURL('/student');
  await expect(page.getByRole('button', { name: '이어서 진행' })).toBeVisible();

  await page.getByRole('button', { name: '프로필' }).click();
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: /^연구실: / })).toHaveAccessibleName(
    `연구실: ${iotEnvironment}`,
  );
});

test('환경을 다시 선택하면 이전 작업을 숨기고 진행 중 작업과 최근 기록이 없는 홈을 표시한다', async ({
  page,
}) => {
  await enterStudentHome(page);
  await page.getByRole('button', { name: '프로필' }).click();
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '전자회로 실험실', exact: true }).click();
  await page.getByRole('button', { name: '설정하고 계속' }).click();

  await expect(page.getByRole('heading', { name: '연구생 홈' })).toHaveText(
    '새 실험을 시작할까요?',
  );
  await expect(page.getByText('승인된 절차가 없어요.')).toBeVisible();
  await expect(page.getByText('아직 완료한 실험이 없어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '이어서 진행' })).toHaveCount(0);
  await expect(
    page.getByTestId('student-home').getByText('전자회로 실험실', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: '승인 절차 선택', exact: true }).click();
  await expect(page).toHaveURL('/procedures?environmentId=demo-circuits');
  await expect(page.getByText('이 작업 환경에 승인된 절차가 없어요.')).toBeVisible();
});

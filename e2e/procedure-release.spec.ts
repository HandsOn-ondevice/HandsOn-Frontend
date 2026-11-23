import { expect, test, type Page } from '@playwright/test';
import {
  createDemoProcedureDraft,
  getDemoProcedureDraftId,
} from '../src/features/procedure-draft/procedureDraftFixtures';
import { emptyProcedureDraftStepCriteria } from '../src/features/procedure-draft/stepCriteria';

const environmentId = 'demo-embedded-iot';
const environmentName = '지능형 임베디드·IoT 센서 연구실';
const draftId = getDemoProcedureDraftId(environmentId);
const draftKey = `handson-procedure-drafts-v1-${encodeURIComponent(environmentId)}`;
const fixture = createDemoProcedureDraft(environmentId, draftId);
if (!fixture) throw new Error('Expected an existing demo draft');

const reviewedDraft = {
  ...fixture,
  savedAt: '2026-11-23T00:00:00.000Z',
  steps: fixture.steps.map((step) => {
    if (step.id === 'power-range') {
      return {
        ...step,
        criteria: {
          ...emptyProcedureDraftStepCriteria,
          voltageMin: 4.9,
          voltageMax: 5.1,
          overcurrentLimit: 240,
          equipmentVerified: true,
        },
      };
    }
    if (step.id === 'sensor-freshness') {
      return {
        ...step,
        criteria: {
          ...emptyProcedureDraftStepCriteria,
          freshnessLimit: 2,
          equipmentVerified: true,
        },
      };
    }
    return step;
  }),
};

async function enterRole(page: Page, role: string) {
  await page.getByRole('radio', { name: role, exact: true }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  const environment = page.getByRole('radio', { name: environmentName, exact: true });
  await environment.click();
  await expect(environment).toBeHidden();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
}

test.use({ viewport: { width: 412, height: 920 } });

test('배포 실패 후 확인을 유지하고 재시도한 버전을 홈과 승인 목록에 반영한다', async ({
  page,
}, testInfo) => {
  await page.addInitScript(
    ({ key, draft }) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, JSON.stringify([draft]));
      }
    },
    { key: draftKey, draft: reviewedDraft },
  );

  await page.goto('/');
  await enterRole(page, '숙련 연구생, 절차 생성·승인');
  const draftCard = page.getByRole('button', { name: /^LED 출력 특성 측정 초안, 작성 중,/ });
  await draftCard.click();
  await page.getByRole('button', { name: '최종 승인 검토', exact: true }).click();
  const approve = page.getByTestId('release-approve');
  await expect(approve).toBeDisabled();

  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.getByText('절차 미리보기', { exact: true })).toBeVisible();
  await expect(page.getByText('BH1750', { exact: true })).toBeVisible();
  await expect(page.getByText(/과전류 보류 기준 240 mA/)).toBeVisible();
  await expect(page.getByText(/센서값 최대 경과 2초/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('e06-preview.png') });
  await page.getByRole('button', { name: '승인 검토로 돌아가기', exact: true }).click();

  const equipment = page.getByTestId('release-equipment-confirmed');
  const review = page.getByTestId('release-review-confirmed');
  await equipment.click();
  await expect(approve).toBeDisabled();
  await review.click();
  await expect(approve).toBeEnabled();

  await page.evaluate((keyToFail) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && key === keyToFail && value.includes('"release":')) {
        Storage.prototype.setItem = setItem;
        throw new DOMException('Release storage quota reached', 'QuotaExceededError');
      }
      setItem.call(this, key, value);
    };
  }, draftKey);

  await approve.click();
  await expect(page.getByRole('alert')).toContainText('승인·배포 요청에 실패했어요.');
  await expect(equipment).toBeChecked();
  await expect(review).toBeChecked();
  await expect(page.getByText('v1.3 승인·배포 완료', { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), draftKey)).not.toContain(
    '"release":',
  );
  await page.screenshot({ path: testInfo.outputPath('e06-failed.png') });

  await expect(approve).toHaveText('다시 시도');
  await approve.click();
  await expect(page.getByText('v1.3 승인·배포 완료', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('e06-published.png') });

  await page.getByRole('button', { name: '숙련자 홈으로', exact: true }).click();
  await expect(page).toHaveURL('/expert');
  await expect(draftCard).toHaveCount(0);
  await page.getByRole('tab', { name: '절차', exact: true }).click();
  await page.getByRole('radio', { name: '승인 절차', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^LED 출력 특성 측정 초안, 승인, .*v1\.3/ }),
  ).toBeVisible();

  await page.getByRole('tab', { name: '내 정보', exact: true }).click();
  await page.getByRole('button', { name: '역할·작업 환경 변경', exact: true }).click();
  await enterRole(page, '신규 연구생, 승인된 절차 실행');
  await expect(
    page.getByRole('button', { name: 'LED 출력 특성 측정 초안, v1.3, 승인 절차 선택' }),
  ).toBeVisible();

  await page.getByRole('button', { name: '이어서 진행', exact: true }).click();
  await expect(page).toHaveURL(
    ({ pathname }) => pathname === '/researcher-workflow/demo-session-led-m03/resume',
  );
  await expect(page.getByTestId('resume-screen').getByText('v1.2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();

  await page.getByRole('button', { name: '전체 보기', exact: true }).click();
  const latest = page.getByRole('button', { name: /^LED 출력 특성 측정 초안, 승인, .*v1\.3/ });
  await expect(latest).toBeVisible();
  await expect(page.getByRole('button', { name: /LED.*승인, .*v1\.2/s })).toHaveCount(0);
  await latest.click();
  await page.getByRole('button', { name: '선택한 절차 확인', exact: true }).click();
  await expect(page.getByText('LED-M03 · 승인 버전 v1.3', { exact: true })).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import {
  createDemoProcedureDraft,
  getDemoProcedureDraftId,
} from '../src/features/procedure-draft/procedureDraftFixtures';

const environmentId = 'demo-circuits';
const existingDraftId = getDemoProcedureDraftId(environmentId);
const generatedDraftId = getDemoProcedureDraftId(environmentId, 'generated');
const fixture = createDemoProcedureDraft(environmentId, existingDraftId);
if (!fixture || fixture.steps.length < 2) throw new Error('Expected an editable demo draft');

const {
  steps: [firstStep, secondStep],
  pendingItems,
} = fixture;
const stepTitle = '측정 순서 다시 확인';
const stepDescription = '기록을 남기기 전에 표시된 값을 다시 확인합니다.';
const material = '예비 연결 케이블';
const precaution = '연결 상태를 작업자와 함께 확인합니다.';

async function enterExpertHome(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '숙련 연구생, 절차 생성·승인' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  const environment = page.getByRole('radio', { name: '전자회로 실험실', exact: true });
  await environment.click();
  await expect(environment).toBeHidden();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await expect(page.getByRole('heading', { name: '숙련자 홈' })).toBeVisible();
}

function draftPath(draftId: string) {
  return `/expert/drafts/${draftId}`;
}

async function expectDraftRoute(page: Page, draftId: string) {
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(draftPath(draftId));
  await expect(page.getByRole('heading', { name: 'AI 절차 초안', exact: true })).toBeVisible();
}

async function openExistingDraft(page: Page) {
  await page.getByRole('button', { name: /작성 중, .*실행 불가/ }).click();
  await expectDraftRoute(page, existingDraftId);
}

async function editStep(page: Page, position: number, originalTitle: string, moveUp = false) {
  await page.getByRole('button', { name: `${position}단계 ${originalTitle}`, exact: true }).click();
  await page.getByRole('button', { name: `${originalTitle} 편집`, exact: true }).click();
  await page.getByRole('textbox', { name: '단계 이름' }).fill(stepTitle);
  await page.getByRole('textbox', { name: '단계 내용' }).fill(stepDescription);
  if (moveUp) await page.getByRole('button', { name: '위로 이동', exact: true }).click();
  const apply = page.getByRole('button', { name: '편집 적용', exact: true });
  await apply.click();
  await expect(apply).toBeHidden();
}

async function saveDraft(page: Page, capture?: string) {
  await page.getByRole('button', { name: '임시 저장', exact: true }).click();
  await expect(page.getByText('초안을 저장했습니다', { exact: true })).toBeVisible();
  if (capture) await page.screenshot({ path: capture });
  await page.getByRole('button', { name: '초안으로 돌아가기', exact: true }).click();
  await expect(page.getByRole('button', { name: '임시 저장', exact: true })).toBeVisible();
}

async function editDraftList(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await page.getByRole('button', { name: `${label} 편집`, exact: true }).click();
  await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  const apply = page.getByRole('button', { name: '편집 적용', exact: true });
  await apply.click();
  await expect(apply).toBeHidden();
}

test.use({ viewport: { width: 412, height: 920 } });

test('E01에서 다시 연 초안에 편집 내용과 순서를 복원하고 같은 단계로 기준값 검토에 들어간다', async ({
  page,
}, testInfo) => {
  await enterExpertHome(page);
  await openExistingDraft(page);
  await expect(page.getByText('16단계 · 준비물 7개', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('e04-draft.png') });
  await editStep(page, 2, secondStep.title, true);
  await editDraftList(page, '준비물', material);
  await editDraftList(page, '주의사항', precaution);
  await saveDraft(page, testInfo.outputPath('e04-saved.png'));

  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL('/expert');
  await openExistingDraft(page);
  const editedStep = page.getByRole('button', { name: `1단계 ${stepTitle}`, exact: true });
  await expect(editedStep).toContainText(stepDescription);
  await expect(
    page.getByRole('button', { name: `2단계 ${firstStep.title}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('16단계 · 준비물 1개', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByText(material, { exact: true })).toBeVisible();
  await expect(page.getByText(precaution, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '하단 시트 닫기', exact: true }).click();
  await expect(page.getByText(precaution, { exact: true })).toBeHidden();

  await page.getByRole('button', { name: `2단계 ${firstStep.title}`, exact: true }).click();
  await page.getByRole('button', { name: '기준값 검토', exact: true }).click();
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`${draftPath(existingDraftId)}/review`);
  expect(new URL(page.url()).searchParams.get('stepId')).toBe(firstStep.id);
  await expect(
    page.getByText(`2. ${firstStep.title}`, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});

test('저장에 실패하면 편집과 미확정 상태를 유지하고 기준값 검토로 이동하지 않는다', async ({
  page,
}) => {
  await page.addInitScript(
    (draftKey) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === window.localStorage && key === draftKey) {
          throw new DOMException('Draft storage quota reached', 'QuotaExceededError');
        }
        setItem.call(this, key, value);
      };
    },
    `handson-procedure-drafts-v1-${encodeURIComponent(environmentId)}`,
  );

  await enterExpertHome(page);
  await openExistingDraft(page);
  await editStep(page, 1, firstStep.title);
  const save = page.getByRole('button', { name: '임시 저장', exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('저장하지 못');
  await expect(save).toBeEnabled();
  await expect(page.getByRole('button', { name: `1단계 ${stepTitle}`, exact: true })).toBeVisible();
  await expect(page.getByText('편집 중 · 승인 전', { exact: true })).toBeVisible();
  await expect(page.getByText(`${pendingItems.length}개 미확정`, { exact: true })).toBeVisible();
  await expect(page.getByText('초안을 저장했습니다', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '기준값 검토', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('저장하지 못');
  await expectDraftRoute(page, existingDraftId);

  const back = page.getByRole('button', { name: '뒤로가기', exact: true });
  const discard = page.getByRole('button', { name: '저장하지 않고 나가기', exact: true });
  await back.click();
  await expect(discard).toBeVisible();
  await page.getByRole('button', { name: '계속 편집', exact: true }).click();
  await expect(discard).toBeHidden();
  await expect(page.getByRole('button', { name: `1단계 ${stepTitle}`, exact: true })).toBeVisible();

  await back.click();
  await discard.click();
  await expect(page).toHaveURL('/expert');
  await openExistingDraft(page);
  await expect(
    page.getByRole('button', { name: `1단계 ${firstStep.title}`, exact: true }),
  ).toBeVisible();
});

test('생성된 초안을 E04로 받은 뒤 저장하면 앱을 다시 열어도 E01에서 같은 초안을 열 수 있다', async ({
  page,
}) => {
  await enterExpertHome(page);
  // Deliver the generated draft URL to the running app while retaining the selected expert context.
  await page.evaluate(
    (path) => {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    draftPath(encodeURIComponent(generatedDraftId)),
  );
  await expectDraftRoute(page, generatedDraftId);
  await editStep(page, 1, firstStep.title);
  await saveDraft(page);

  await enterExpertHome(page);
  await expect(page.getByRole('button', { name: '초안, 2, 개' })).toBeVisible();
  await page
    .getByRole('button', { name: /임시 저장 완료/ })
    .first()
    .click();
  await expectDraftRoute(page, generatedDraftId);
  await expect(page.getByRole('button', { name: `1단계 ${stepTitle}`, exact: true })).toContainText(
    stepDescription,
  );
});

import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const sessionsPath = '/api/v1/sessions';
export const simulationPath = '/api/v1/simulation';
export const viewport = { width: 360, height: 800 };

type Command =
  | { type: 'setPreparationCheck'; checkId: string; checked: boolean }
  | { type: 'requestExecutionSample'; cursorId: string }
  | { type: 'completeExecutionStep'; cursorId: string; sampleAttemptId: string }
  | { type: 'completePreparation' | 'startDeviceCheck' | 'startExecution' | 'cancel' };

export type CreateBody = {
  requestId: string;
  workflowVersion: '2.0';
  procedureId: string;
  procedureVersion: string;
  workProfileId: string;
  operatorId: string;
  resumePolicyVersion?: '1.0' | '2.0';
};
export type CommandBody = { requestId: string; expectedRevision: number; command: Command };
export type SimulationConfig = { scenario: string; distanceCm: number; ledFailure: boolean };
type Cursor = { cursorId: string; conditionId: string; trialIndex: number };

export type Session = {
  sessionId: string;
  phase: string;
  revision: number;
  holdReason?: { code: string; message: string } | null;
  workflowVersion?: '1.0' | '2.0';
  resumePolicyVersion?: '1.0' | '2.0';
  hold?: {
    holdId: string;
    cursorId: string | null;
    allowedCommands: string[];
    nextSampleCommand: string | null;
    requiresConfirmation: boolean;
    confirmationValidityMs: number;
  } | null;
  resumeChecks?: { status: string }[];
  dataOrigin: string;
  checks: { id: string; checked: boolean }[];
  procedure: {
    procedureId: string;
    version: string;
    workProfileId: string;
    title: string;
    preparation: { id: string; title: string; owner: string }[];
    execution: { conditions: { id: string; label: string }[] };
  };
  events: { type: string; requestId: string }[];
  deviceChecks: {
    attemptId: string;
    status: string;
    issue?: { code: string; message: string };
  }[];
  pendingJob: { kind: string; attemptId: string } | null;
  execution?: {
    cursor: Cursor;
    attempts: { attemptId: string; status: string }[];
    recoveries?: { recoveryId: string; status: string; confirmationEvidenceId?: string }[];
  };
};

export function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

export async function checkLayout(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
}

export async function reopen(page: Page, path: string) {
  // Keep the app's in-memory authentication while mounting the route from its session ID.
  await page.evaluate((target) => {
    history.pushState({}, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(path);
}

export async function enterStudentHome(page: Page, token: string) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  try {
    await page.getByLabel(/Edge (?:접속|API) 토큰/).fill(token);
  } catch {
    throw new Error('Could not fill the local Edge credential field.');
  }
  await page.getByRole('button', { name: /^(작업 환경 불러오기|다시 시도)$/ }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();
  await button(page, '설정하고 계속').click();
}

export async function enterProcedure(page: Page, token: string, procedureTitle: string) {
  await enterStudentHome(page, token);
  await page.getByRole('tab', { name: '실험', exact: true }).click();
  await expect(page).toHaveURL('/procedures?environmentId=kit-lab');
  await page.getByRole('button', { name: `${procedureTitle}, 승인,` }).click();
  await button(page, '선택한 절차 확인').click();
  await expect(page).toHaveURL(/\/procedures\/kit-distance\?/);
}

export function isolatedEdge(request: APIRequestContext) {
  const origin = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    throw new Error(
      'Run session E2E only on a dedicated loopback Edge with its own data directory.',
    );
  }
  const operatorToken = process.env.HANDSON_E2E_OPERATOR_TOKEN;
  const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (!operatorToken || !expertToken) {
    throw new Error('Set the operator and expert test tokens for the isolated Edge.');
  }
  const operatorHeaders = { Authorization: `Bearer ${operatorToken}` };
  const expertHeaders = { Authorization: `Bearer ${expertToken}` };

  return {
    origin: origin.origin,
    operatorToken,
    async read<T>(path: string, role?: 'operator' | 'expert') {
      const headers =
        role === 'operator' ? operatorHeaders : role === 'expert' ? expertHeaders : undefined;
      const response = await request.get(new URL(path, origin).href, { headers });
      expect(response.status(), `GET ${path}`).toBe(200);
      return (await response.json()) as T;
    },
    async create(
      procedure: Session['procedure'],
      resumePolicyVersion?: CreateBody['resumePolicyVersion'],
    ) {
      const requestId = crypto.randomUUID();
      const response = await request.post(`${origin.origin}${sessionsPath}`, {
        headers: { ...operatorHeaders, 'Idempotency-Key': requestId },
        data: {
          requestId,
          workflowVersion: '2.0',
          procedureId: procedure.procedureId,
          procedureVersion: procedure.version,
          workProfileId: procedure.workProfileId,
          operatorId: 'operator-01',
          ...(resumePolicyVersion && { resumePolicyVersion }),
        } satisfies CreateBody,
      });
      expect(response.status(), `POST ${sessionsPath}`).toBe(201);
      return (await response.json()) as Session;
    },
    async command(sessionId: string, expectedRevision: number, command: Command) {
      const requestId = crypto.randomUUID();
      const response = await request.post(`${origin.origin}${sessionsPath}/${sessionId}/commands`, {
        headers: { ...operatorHeaders, 'Idempotency-Key': requestId },
        data: { requestId, expectedRevision, command },
      });
      expect(response.status(), command.type).toBe(200);
      return (await response.json()) as Session;
    },
    async configure(config: SimulationConfig) {
      const response = await request.post(`${origin.origin}${simulationPath}`, {
        headers: expertHeaders,
        data: { requestId: crypto.randomUUID(), config },
      });
      expect(response.status()).toBe(200);
    },
  };
}

export async function currentKitProcedure(edge: ReturnType<typeof isolatedEdge>) {
  const procedures = await edge.read<Session['procedure'][]>(
    '/api/v1/procedures?environmentId=kit-lab',
    'operator',
  );
  const procedure = procedures.find(({ procedureId }) => procedureId === 'kit-distance');
  if (!procedure) throw new Error('Isolated Edge has no approved kit-distance procedure.');
  return procedure;
}

export type TestEdge = ReturnType<typeof isolatedEdge>;

export async function seedRunningSession(edge: TestEdge, created: Session) {
  let session = created;
  async function send(command: Command) {
    session = await edge.command(session.sessionId, session.revision, command);
  }

  for (const { id, owner } of session.procedure.preparation) {
    if (owner === 'operator')
      await send({ type: 'setPreparationCheck', checkId: id, checked: true });
  }
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  session = await waitForJob(edge, session.sessionId);
  expect(session.phase).toBe('readyToExecute');
  await send({ type: 'startExecution' });
  return session;
}

export async function submitSample(edge: TestEdge, running: Session) {
  const cursorId = running.execution?.cursor.cursorId;
  if (!cursorId) throw new Error('Edge did not return an execution cursor.');
  return edge.command(running.sessionId, running.revision, {
    type: 'requestExecutionSample',
    cursorId,
  });
}

export async function waitForJob(edge: TestEdge, sessionId: string) {
  let state = await edge.read<Session>(`${sessionsPath}/${sessionId}`, 'operator');
  await expect
    .poll(async () => {
      state = await edge.read<Session>(`${sessionsPath}/${sessionId}`, 'operator');
      return state.pendingJob;
    })
    .toBeNull();
  return state;
}

export async function seedCompletedTrial(edge: TestEdge, created: Session) {
  const running = await seedRunningSession(edge, created);
  await submitSample(edge, running);
  const session = await waitForJob(edge, running.sessionId);
  const attempt = session.execution?.attempts.at(-1);
  if (!attempt || !session.execution) throw new Error('Edge did not return a measurement attempt.');
  expect(attempt.status).toBe('ready');
  return edge.command(session.sessionId, session.revision, {
    type: 'completeExecutionStep',
    cursorId: session.execution.cursor.cursorId,
    sampleAttemptId: attempt.attemptId,
  });
}

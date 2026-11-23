import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { isolatedEdge, type TestEdge } from './edge-session';

export const healthPath = '/api/v1/system/health';
export const demoViewport = { width: 412, height: 920 };

type DemoEdge = TestEdge & { expertToken: string; setLight: (adc: number) => Promise<void> };

export const test = base.extend<{ demo: DemoEdge }>({
  demo: async ({ request }, run, info) => {
    const repo = process.env.HANDSON_E2E_DEMO_BACKEND_DIR;
    if (!repo || !isAbsolute(repo)) {
      throw new Error('Set HANDSON_E2E_DEMO_BACKEND_DIR to an absolute HandsOn-Backend path.');
    }
    const python = join(repo, '.venv', 'bin', 'python');
    await access(python);
    const webURL = info.project.use.baseURL;
    if (!webURL || !['localhost', '127.0.0.1'].includes(new URL(webURL).hostname)) {
      throw new Error('Run the demo against a loopback Expo web server.');
    }
    const port = process.env.HANDSON_E2E_DEMO_EDGE_PORT ?? '18056';
    const edge = isolatedEdge(request, 'http://127.0.0.1:' + port);
    const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN;
    if (!expertToken) throw new Error('Set HANDSON_E2E_EXPERT_TOKEN for the isolated demo Edge.');

    const directory = await mkdtemp(join(tmpdir(), 'handson-edge-demo-'));
    const lightFile = join(directory, 'light.adc');
    async function setLight(adc: number) {
      const next = lightFile + '.new';
      await writeFile(next, String(adc) + '\n', 'ascii');
      await rename(next, lightFile);
    }

    try {
      await setLight(2135);
      const server = spawn(
        python,
        [
          join(info.config.rootDir, 'support', 'edge-demo-server.py'),
          '--backend-dir',
          repo,
          '--port',
          port,
          '--web-origin',
          new URL(webURL).origin,
          '--state-dir',
          join(directory, 'state'),
          '--light-file',
          lightFile,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const closed = once(server, 'close').catch(() => undefined);
      let startup = '';
      const addLog = (message: string) => {
        startup = (startup + message).slice(-8000);
      };
      server.stdout.setEncoding('utf8').on('data', addLog);
      server.stderr.setEncoding('utf8').on('data', addLog);
      try {
        await expect
          .poll(() => startup.includes('Uvicorn running on ' + edge.origin), {
            message: 'Start a new isolated Edge process for this test',
            timeout: 10_000,
          })
          .toBe(true);
        const health = await edge.read<{ executionMode: string; hardwareVerified: boolean }>(
          healthPath,
        );
        expect(health).toMatchObject({ executionMode: 'simulation', hardwareVerified: false });
        await edge.configure({ scenario: 'normal', distanceCm: 16.7, ledFailure: false });
        await run({ ...edge, expertToken, setLight });
      } finally {
        server.kill('SIGTERM');
        await closed;
        await info.attach('edge-server-log', { body: startup, contentType: 'text/plain' });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
});

test.use({
  viewport: demoViewport,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'reduce',
  actionTimeout: 12_000,
  trace: 'on',
  video: 'off',
  screenshot: 'off',
});

export async function captureDemo(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png');
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

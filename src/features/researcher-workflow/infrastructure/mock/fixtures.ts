import type { ProcedureSnapshot } from '../../domain/models';

/** Figma LED 예시용 합성 절차. 실제 장비 승인이나 센서 임계값을 뜻하지 않는다. */
export const mockProcedure: ProcedureSnapshot = {
  procedureId: 'mock-led-output',
  version: '1.2',
  approval: 'approved',
  title: 'LED 출력 단계별 조도·소비전력 측정',
  deviceId: 'LED-M03',
  preparation: [
    {
      id: 'materials',
      title: '필수 준비물 7개 확인',
      description: '작업자 확인 필요',
      guidance: '절차의 필수 준비물을 확인해 주세요.',
      owner: 'operator',
      verifiedAt: 'S04',
      requiredForDeviceCheck: true,
    },
    {
      id: 'device',
      title: '장치 ID LED-M03 확인',
      description: '절차 대상 일치 여부 확인',
      guidance: '장치 라벨과 절차의 장치 ID를 확인해 주세요.',
      owner: 'operator',
      verifiedAt: 'S04',
      requiredForDeviceCheck: true,
    },
    {
      id: 'powerOff',
      title: '전원 차단 확인',
      description: '작업자 확인 필요',
      guidance: '배선 전에 전원이 차단됐는지 확인해 주세요.',
      owner: 'operator',
      verifiedAt: 'S04',
      requiredForDeviceCheck: true,
    },
    {
      id: 'wiring',
      title: '센서 배선 연결',
      description: '전원 · GND · SDA · SCL 순서',
      guidance: '전원을 차단한 상태에서 센서 배선을 확인해 주세요.',
      owner: 'operator',
      verifiedAt: 'S04',
      requiredForDeviceCheck: true,
    },
    {
      id: 'distance',
      title: 'LED와 BH1750 거리 20cm',
      description: '수광면 정렬과 고정 상태 확인',
      guidance: '수광면 정렬, 거리 20cm와 지그 고정 상태를 확인해 주세요.',
      owner: 'operator',
      verifiedAt: 'S04',
      requiredForDeviceCheck: true,
    },
    {
      id: 'communication',
      title: '전원·센서 통신 점검',
      description: '센서 근거 · 다음 화면에서 확인',
      guidance: '통신 점검은 S05에서 별도로 수행합니다.',
      owner: 'system',
      verifiedAt: 'S05',
      requiredForDeviceCheck: false,
    },
  ],
};

/** 새 실험과 분리된 2/6 디자인 검증 시나리오. */
export const figmaPreparationFixture = {
  name: 'figma-2-of-6',
  confirmed: ['materials', 'device'] as const,
};

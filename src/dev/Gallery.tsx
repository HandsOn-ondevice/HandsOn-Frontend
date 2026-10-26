import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomNavigation,
  BottomSheet,
  BrandLogo,
  Symbol,
  Button,
  CheckboxRow,
  ConditionProgress,
  EvidenceRow,
  FeedbackPanel,
  HeroPanel,
  Icon,
  IconButton,
  MetricTile,
  ProcedureCard,
  ResultChart,
  RoleCard,
  SectionHeader,
  SegmentedControl,
  SensorCard,
  StatusBadge,
  StatusBar,
  StepProgress,
  SurfaceCard,
  TextField,
  TimelineItem,
  VoicePanel,
  SelectField,
  colors,
  spacing,
} from '../design-system';
import type { IconName, Tone } from '../design-system';
import { ExecutionExample } from './ExecutionExample';

const groups = {
  입력: ['Button', 'IconButton', 'TextField', 'SelectField', 'CheckboxRow', 'SegmentedControl'],
  레이아웃: [
    'AppBar',
    'BottomNavigation',
    'SectionHeader',
    'SurfaceCard',
    'ActionShelf',
    'BottomSheet',
    'HeroPanel',
    'StatusBar',
  ],
  상태: ['StatusBadge', 'FeedbackPanel'],
  '업무 표현': [
    'ProcedureCard',
    'SensorCard',
    'MetricTile',
    'ConditionProgress',
    'StepProgress',
    'EvidenceRow',
    'VoicePanel',
    'TimelineItem',
    'ResultChart',
    'RoleCard',
  ],
  기초: ['Typography', 'Colors', 'Icons'],
} as const;
type Group = keyof typeof groups;
type ComponentName = (typeof groups)[Group][number];
const tones: Tone[] = ['info', 'success', 'warning', 'danger', 'neutral'];
const iconNames: IconName[] = [
  'home',
  'flask',
  'device',
  'mic',
  'guidance',
  'pause',
  'retry',
  'alert',
  'power',
  'light',
  'environment',
  'clock',
  'history',
  'approval',
  'edit',
  'result',
  'check',
  'person',
  'back',
  'arrow',
  'more',
  'play',
  'bolt',
  'lock',
];
const conditions = ['0%', '25%', '50%', '75%', '100%'].map((label, index) => ({
  label,
  value: ['3/3', '3/3', '2/3', '0/3', '0/3'][index],
}));

function Example({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.example}>
      <AppText variant="caption">{label}</AppText>
      {children}
    </View>
  );
}

export function Gallery({
  initialComponent,
  initialExample,
}: {
  initialComponent?: string;
  initialExample?: string;
}) {
  const entry = (Object.entries(groups) as [Group, readonly ComponentName[]][]).find(([, names]) =>
    names.some((name) => name === initialComponent),
  );
  const [group, setGroup] = useState<Group>(entry?.[0] ?? '입력');
  const [selected, setSelected] = useState<ComponentName>(
    (entry && (initialComponent as ComponentName)) || 'Button',
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [value, setValue] = useState('LED 출력 특성 측정');
  const [selection, setSelection] = useState('all');
  const [checked, setChecked] = useState(false);
  const [active, setActive] = useState<'home' | 'work' | 'device' | 'history'>('home');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTone, setSheetTone] = useState<'info' | 'warning' | 'success'>('info');
  const [notice, setNotice] = useState('상태를 선택하고 직접 조작해 보세요.');
  const [execution, setExecution] = useState(initialExample === 'execution');
  const press = () => setNotice('onPress 콜백이 호출되었습니다. 업무 상태는 변경하지 않습니다.');
  if (execution) return <ExecutionExample onBack={() => setExecution(false)} />;

  const examples = () => {
    switch (selected) {
      case 'Button':
        return ['primary', 'secondary', 'tertiary', 'danger'].flatMap((variant) =>
          ['default', 'pressed', 'focus', 'disabled', 'loading'].map((state) => (
            <Example key={`${variant}-${state}`} label={`${variant} · ${state}`}>
              <Button
                label="계속"
                variant={variant as 'primary' | 'secondary' | 'tertiary' | 'danger'}
                icon="arrow"
                onPress={press}
                disabled={state === 'disabled'}
                loading={state === 'loading'}
                previewState={state === 'pressed' || state === 'focus' ? state : undefined}
              />
            </Example>
          )),
        );
      case 'IconButton':
        return ['light', 'inverse'].flatMap((tone) =>
          ['default', 'pressed', 'focus', 'disabled'].map((state) => (
            <Example key={`${tone}-${state}`} label={`${tone} · ${state}`}>
              <View style={tone === 'inverse' ? styles.inverse : undefined}>
                <IconButton
                  icon="back"
                  accessibilityLabel="뒤로"
                  tone={tone as 'light' | 'inverse'}
                  onPress={press}
                  disabled={state === 'disabled'}
                  previewState={state === 'pressed' || state === 'focus' ? state : undefined}
                />
              </View>
            </Example>
          )),
        );
      case 'TextField':
        return [false, true].flatMap((multiline) =>
          ['default', 'focus', 'filled', 'error', 'disabled'].map((state) => (
            <Example
              key={`${multiline}-${state}`}
              label={`${multiline ? 'multiline' : 'single'} · ${state}`}
            >
              <TextField
                label="절차 이름"
                value={fieldValues[`${multiline}-${state}`] ?? (state === 'default' ? '' : value)}
                onChange={(next) =>
                  setFieldValues((current) => ({ ...current, [`${multiline}-${state}`]: next }))
                }
                multiline={multiline}
                disabled={state === 'disabled'}
                error={state === 'error'}
                support={state === 'error' ? '입력값을 확인해 주세요.' : '수정 가능한 표시용 예제'}
                previewState={state === 'focus' ? 'focus' : undefined}
              />
            </Example>
          )),
        );
      case 'SelectField':
        return <SelectExamples value={selection} onChange={setSelection} />;
      case 'CheckboxRow':
        return ['pending', 'checked', 'current', 'issue', 'disabled'].map((state) => (
          <Example key={state} label={state}>
            <CheckboxRow
              title="전원 차단 확인"
              subtitle="작업자 확인 필요"
              checked={state === 'checked' || (state === 'pending' && checked)}
              onChange={setChecked}
              state={state as 'pending' | 'checked' | 'current' | 'issue' | 'disabled'}
            />
          </Example>
        ));
      case 'SegmentedControl':
        return (
          <SegmentedControl
            options={[
              { label: '전체', value: 'all' },
              { label: 'LED', value: 'led' },
              { label: '센서 점검', value: 'sensor' },
              { label: '최근 사용', value: 'recent' },
            ]}
            value={selection}
            onChange={setSelection}
          />
        );
      case 'AppBar':
        return ['light', 'inverse'].flatMap((tone) =>
          ['brand', 'back'].map((mode) => (
            <Example key={`${tone}-${mode}`} label={`${tone} · ${mode}`}>
              <AppBar
                title="절차 상세"
                mode={mode as 'brand' | 'back'}
                tone={tone as 'light' | 'inverse'}
                onBack={press}
                onMore={press}
                onProfile={press}
              />
            </Example>
          )),
        );
      case 'BottomNavigation':
        return ['student', 'expert'].map((role) => (
          <Example key={role} label={role}>
            <BottomNavigation
              role={role as 'student' | 'expert'}
              active={active}
              onChange={setActive}
            />
          </Example>
        ));
      case 'SectionHeader':
        return (
          <>
            <SectionHeader title="승인된 절차" />
            <SectionHeader title="승인된 절차" action="전체 보기" onAction={press} />
          </>
        );
      case 'SurfaceCard':
        return ['paper', 'subtle', 'inverse'].map((tone) => (
          <SurfaceCard
            key={tone}
            title="작업 환경"
            subtitle="확인 가능한 근거와 정보를 표시합니다."
            tone={tone as 'paper' | 'subtle' | 'inverse'}
          />
        ));
      case 'ActionShelf':
        return ['single', 'dual', 'disabled', 'dualDisabled'].map((layout) => (
          <Example key={layout} label={layout}>
            <ActionShelf
              primary="확인 완료"
              secondary="안내 다시 듣기"
              layout={layout as 'single' | 'dual' | 'disabled' | 'dualDisabled'}
              onPrimary={press}
              onSecondary={press}
              safeArea={false}
            />
          </Example>
        ));
      case 'BottomSheet':
        return (
          <>
            {(['info', 'warning', 'success'] as const).map((tone) => (
              <Button
                key={tone}
                variant="secondary"
                label={`${tone} 시트 열기`}
                onPress={() => {
                  setSheetTone(tone);
                  setSheetOpen(true);
                }}
              />
            ))}
            <AppText>시트를 드래그하거나 뒤로가기로 닫아보세요.</AppText>
          </>
        );
      case 'HeroPanel':
        return (
          <>
            <HeroPanel
              title={'정확한 실험,\n명확한 근거'}
              subtitle="세션과 승인된 절차를 안전하게 이어갑니다."
              tone="aurora"
            />
            <HeroPanel title="함께 준비하는 실험" subtitle="표시용 예제입니다." tone="quiet" />
          </>
        );
      case 'StatusBar':
        return (
          <>
            <AppText>
              OS가 실제 시간·배터리를 표시합니다. 아래 버튼은 상태 표시줄 아이콘의 명암을 바꿉니다.
            </AppText>
            <Button label="Light 배경" onPress={() => setSelection('light')} />
            <Button label="Inverse 배경" onPress={() => setSelection('inverse')} />
            <View style={selection === 'inverse' ? styles.inverse : undefined}>
              <StatusBar tone={selection === 'inverse' ? 'inverse' : 'light'} />
              <AppText>상단 OS 상태 표시줄에서 확인</AppText>
            </View>
          </>
        );
      case 'StatusBadge':
        return tones.map((tone) => (
          <Example key={tone} label={tone}>
            <StatusBadge label="승인 버전" tone={tone} />
          </Example>
        ));
      case 'FeedbackPanel':
        return (['info', 'success', 'warning', 'danger'] as const).map((tone) => (
          <FeedbackPanel
            key={tone}
            title="새 조도값이 수신되었습니다"
            subtitle="안정화 뒤 다시 완료를 요청해 주세요."
            tone={tone}
          />
        ));
      case 'ProcedureCard':
        return (['approved', 'selected', 'draft', 'unresolved'] as const).map((state) => (
          <Example key={state} label={state}>
            <ProcedureCard
              title={'LED 출력 단계별\n조도·소비전력 특성 측정'}
              subtitle="출력 변화에 따른 조도와 전력 특성을 확인합니다."
              meta="v1.2 · 16단계 · 약 25분"
              detail="최근 승인 · 박지연"
              state={state}
              onPress={press}
            />
          </Example>
        ));
      case 'SensorCard':
        return (['normal', 'stale', 'disconnected', 'outOfRange'] as const).map((state) => (
          <Example key={state} label={state}>
            <SensorCard
              title="BH1750"
              subtitle="조도 센서 · 0x23"
              value="420 lx"
              meta={state === 'stale' ? '8초 전' : '0.7초 전'}
              detail="표시용 합성 데이터"
              state={state}
            />
          </Example>
        ));
      case 'MetricTile':
        return tones.map((tone) => (
          <MetricTile
            key={tone}
            title="조도"
            value="420"
            meta="lx · 0.7초 전"
            detail="표시용 합성 데이터"
            tone={tone}
          />
        ));
      case 'ConditionProgress':
        return (['planned', 'running', 'issue', 'complete'] as const).map((state) => (
          <Example key={state} label={state}>
            <ConditionProgress items={conditions} state={state} currentIndex={2} />
          </Example>
        ));
      case 'StepProgress':
        return (['running', 'paused', 'complete'] as const).map((state) => (
          <Example key={state} label={state}>
            <StepProgress
              title="11 / 16단계 · 50% 측정"
              value={state === 'complete' ? 100 : 64}
              state={state}
            />
          </Example>
        ));
      case 'EvidenceRow':
        return (['human', 'sensor', 'program'] as const).flatMap((kind) =>
          (['pending', 'confirmed', 'issue'] as const).map((state) => (
            <Example key={`${kind}-${state}`} label={`${kind} · ${state}`}>
              <EvidenceRow
                title="거리 20cm와 지그 고정 확인"
                subtitle="작업자·센서·프로그램 근거를 구분합니다."
                meta={state}
                kind={kind}
                state={state}
              />
            </Example>
          )),
        );
      case 'VoicePanel':
        return (['idle', 'listening', 'processing', 'confirmed', 'clarify', 'error'] as const).map(
          (state) => (
            <Example key={state} label={state}>
              <VoicePanel state={state} subtitle="표시용 예제 · 실제 녹음하지 않습니다." />
            </Example>
          ),
        );
      case 'TimelineItem':
        return (['valid', 'invalid', 'recovery', 'pending'] as const).map((state) => (
          <Example key={state} label={state}>
            <TimelineItem
              title="2회차 재측정 · 423 lx"
              subtitle="10:08:17 · 표시용 합성 데이터"
              state={state}
            />
          </Example>
        ));
      case 'ResultChart':
        return (
          <>
            {(['preview', 'reviewed'] as const).map((state) => (
              <ResultChart
                key={state}
                title="조건별 조도 평균"
                meta="가상의 합성 데이터"
                state={state}
                items={[
                  { label: '0%', value: 12 },
                  { label: '25%', value: 210 },
                  { label: '50%', value: 420 },
                  { label: '75%', value: 630 },
                  { label: '100%', value: 840 },
                ]}
                unit="lx"
              />
            ))}
            <ResultChart
              title="결측값 예제"
              state="preview"
              items={[
                { label: '0%', value: 0 },
                { label: '25%', value: null },
                { label: '50%', value: 420 },
              ]}
              unit="lx"
            />
            <ResultChart title="데이터 없음" state="preview" items={[]} />
          </>
        );
      case 'RoleCard':
        return (['student', 'expert'] as const).flatMap((role) =>
          (['default', 'selected'] as const).map((state) => (
            <Example key={`${role}-${state}`} label={`${role} · ${state}`}>
              <RoleCard role={role} state={state} onPress={press} />
            </Example>
          )),
        );
      case 'Typography':
        return (
          ['display', 'heading', 'title', 'body', 'label', 'caption', 'measurement'] as const
        ).map((variant) => (
          <Example key={variant} label={variant}>
            <AppText variant={variant}>
              {variant === 'measurement' ? '420.0 lx · 5.01 V' : '정확한 실험, 명확한 근거'}
            </AppText>
          </Example>
        ));
      case 'Colors':
        return Object.entries(colors).flatMap(([groupName, entries]) =>
          Object.entries(entries).map(([name, color]) => (
            <View key={`${groupName}-${name}`} style={styles.swatch}>
              <View style={[styles.color, { backgroundColor: color }]} />
              <AppText variant="caption">
                {groupName}/{name} · {color}
              </AppText>
            </View>
          )),
        );
      case 'Icons':
        return (
          <>
            <View style={styles.iconGrid}>
              {iconNames.map((name) => (
                <View key={name} style={styles.iconExample}>
                  <Icon name={name} />
                  <AppText variant="caption">{name}</AppText>
                </View>
              ))}
            </View>
            <SectionHeader title="로고 · 일러스트" />
            <BrandLogo width={48} />
            <Symbol />
          </>
        );
    }
  };
  return (
    <SafeAreaView
      style={[
        styles.root,
        selected === 'StatusBar' &&
          selection === 'inverse' && { backgroundColor: colors.surface.inverse },
      ]}
      edges={['top', 'bottom']}
    >
      {selected !== 'StatusBar' && <StatusBar tone="light" />}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="caption" color={colors.text.action}>
          HANDSON / AURORA LAB 1.0
        </AppText>
        <AppText variant="heading">컴포넌트 갤러리</AppText>
        <AppText>26개 컴포넌트 · Light 테마</AppText>
        <FeedbackPanel
          tone="info"
          title="가상의 합성 데이터"
          subtitle="센서·음성·차트는 UI 확인용 예제입니다. 실제 장치 통신·녹음·측정은 실행하지 않습니다."
        />
        <Button label="S06 조합 예제 보기" variant="secondary" onPress={() => setExecution(true)} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {(Object.keys(groups) as Group[]).map((name) => (
            <Button
              key={name}
              label={name}
              variant={group === name ? 'primary' : 'secondary'}
              onPress={() => {
                setGroup(name);
                setSelected(groups[name][0]);
                setNotice('상태를 선택하고 직접 조작해 보세요.');
              }}
            />
          ))}
        </ScrollView>
        <View style={styles.chips}>
          {groups[group].map((name) => (
            <Button
              key={name}
              label={name}
              variant={selected === name ? 'primary' : 'tertiary'}
              onPress={() => setSelected(name)}
            />
          ))}
        </View>
        <SectionHeader title={selected} />
        <AppText variant="caption" accessibilityLiveRegion="polite">
          {notice}
        </AppText>
        <View style={styles.examples}>{examples()}</View>
      </ScrollView>
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="확인이 필요해요"
        subtitle="모호한 명령은 실행하지 않고 현재 상태를 유지합니다."
        tone={sheetTone}
      >
        <TextField withinSheet label="시트 입력 예제" value={value} onChange={setValue} />
        <Button label="시트 닫기" onPress={() => setSheetOpen(false)} />
      </BottomSheet>
    </SafeAreaView>
  );
}

function SelectExamples({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { label: '전체', value: 'all' },
    { label: 'LED', value: 'led' },
    { label: '센서 점검', value: 'sensor' },
  ];
  return (
    <>
      {(['default', 'focus', 'disabled'] as const).map((state) => (
        <Example key={state} label={state}>
          <SelectField
            label="연구실"
            value={value}
            onChange={onChange}
            options={options}
            disabled={state === 'disabled'}
            previewState={state === 'focus' ? 'focus' : undefined}
          />
        </Example>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12], paddingBottom: spacing[40] },
  row: { gap: spacing[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  example: { gap: spacing[8] },
  examples: { gap: spacing[16] },
  inverse: { backgroundColor: colors.surface.inverse, padding: spacing[8], borderRadius: 12 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  color: {
    width: 48,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[16] },
  iconExample: {
    width: 80,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
  },
});

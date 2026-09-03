import { getDb } from '@/lib/db/sqlite';

/** §8 전기적 교차검증 — approval-doc/validate.ts와 동일한 "경고만 하고 자동으로
 * 판정/값을 고치지 않는다" 원칙을 따른다. 물리적으로 불가능한 값(PF 범위 초과)만
 * blocking으로 두고 나머지는 전부 warning이다 — 최종 판정은 항상 사람이 내린다. */
export interface ValidationIssue {
  /** 프로젝트 안에서 유일한 키 — approval_inspection_validation_acknowledgements.issue_key와 매칭. */
  key: string;
  severity: 'blocking' | 'warning';
  productId: string;
  itemKey?: string;
  /** 내부 화면·감사로그용 한국어 완성 문장. */
  message: string;
  /** 외부 다국어 화면(inspection-form)이 lang에 맞춰 재구성할 때 쓰는 키+값 — 값 자체는
   * 언어와 무관(숫자/단위/항목명)하므로 그대로 넘기고 문장 템플릿만 클라이언트에서 언어별로 고른다. */
  messageKey: string;
  params?: Record<string, string | number>;
}

interface MeasurementRow {
  id: string; product_id: string; item_key: string; item_label: string;
  baseline_value: string | null; baseline_unit: string | null;
  measured_value: string | null; measured_unit: string | null;
  min_value: string | null; max_value: string | null; tolerance: string | null;
}

function toNumber(v: string | null): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** mA/A 단위를 암페어로 환산 — 단위가 없거나 인식 못 하면 원값을 암페어로 간주한다
 * (참고 엑셀이 "IN mA" 헤더 아래 단위 표기 없는 순수 숫자를 넣어 생긴 혼동을 막기 위함). */
function toAmps(value: number, unit: string | null): number {
  const u = (unit || '').trim().toLowerCase();
  if (u === 'ma') return value / 1000;
  return value;
}

type FieldName = 'baseline' | 'measured';

function collectValues(rows: MeasurementRow[], field: FieldName): Record<string, { value: number; unit: string | null }> {
  const out: Record<string, { value: number; unit: string | null }> = {};
  for (const r of rows) {
    const raw = field === 'baseline' ? r.baseline_value : r.measured_value;
    const unit = field === 'baseline' ? r.baseline_unit : r.measured_unit;
    const n = toNumber(raw);
    if (n != null) out[r.item_key] = { value: n, unit };
  }
  return out;
}

const FIELD_LABEL: Record<FieldName, string> = { baseline: '기준값', measured: '측정값' };

function checkElectricalConsistency(productId: string, rows: MeasurementRow[], field: FieldName): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const v = collectValues(rows, field);
  const label = FIELD_LABEL[field];

  const pf = v.power_factor;
  if (pf && (pf.value < 0 || pf.value > 1.05)) {
    issues.push({ key: `${productId}:${field}:pf_range`, severity: 'blocking', productId, itemKey: 'power_factor',
      message: `[${label}] 역률(PF)이 0~1 범위를 벗어났습니다: ${pf.value}`,
      messageKey: 'pf_range', params: { field, value: pf.value } });
  }

  const inV = v.rated_input_voltage;
  const inI = v.input_current;
  const ratedPower = v.rated_power;
  if (inV && inI && pf && ratedPower && ratedPower.value !== 0) {
    const iAmps = toAmps(inI.value, inI.unit);
    const computed = inV.value * iAmps * pf.value;
    const diffRatio = Math.abs(computed - ratedPower.value) / ratedPower.value;
    if (diffRatio > 0.15) {
      issues.push({ key: `${productId}:${field}:power_mismatch`, severity: 'warning', productId, itemKey: 'rated_power',
        message: `[${label}] 정격전력 불일치: 입력전압×입력전류×PF=${computed.toFixed(2)}W인데 기재된 정격전력은 ${ratedPower.value}W입니다(오차 ${(diffRatio * 100).toFixed(0)}%).`,
        messageKey: 'power_mismatch', params: { field, computed: computed.toFixed(2), rated: ratedPower.value, diffPct: (diffRatio * 100).toFixed(0) } });
    }
  }

  const outV = v.output_voltage;
  const outA = v.output_current;
  if (outV && outA && ratedPower && ratedPower.value !== 0) {
    const outPower = outV.value * outA.value;
    if (outPower > ratedPower.value * 1.1) {
      issues.push({ key: `${productId}:${field}:output_exceeds_rated`, severity: 'warning', productId, itemKey: 'output_voltage',
        message: `[${label}] 출력전력(출력전압×출력전류=${outPower.toFixed(2)}W)이 정격전력(${ratedPower.value}W)을 초과합니다.`,
        messageKey: 'output_exceeds_rated', params: { field, output: outPower.toFixed(2), rated: ratedPower.value } });
    }
  }

  const insulation = v.insulation_resistance;
  if (insulation && (insulation.unit || 'MΩ').toUpperCase().includes('M') && insulation.value < 2) {
    issues.push({ key: `${productId}:${field}:insulation_low`, severity: 'warning', productId, itemKey: 'insulation_resistance',
      message: `[${label}] 절연저항이 일반 기준(≥2MΩ)보다 낮습니다: ${insulation.value}${insulation.unit || 'MΩ'}`,
      messageKey: 'insulation_low', params: { field, value: insulation.value, unit: insulation.unit || 'MΩ' } });
  }

  return issues;
}

function checkRangeAndUnitConsistency(productId: string, rows: MeasurementRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const measured = toNumber(r.measured_value);
    const min = toNumber(r.min_value);
    const max = toNumber(r.max_value);
    const baseline = toNumber(r.baseline_value);
    const tolerance = toNumber(r.tolerance);

    if (measured != null) {
      if (min != null && measured < min) {
        issues.push({ key: `${productId}:${r.id}:below_min`, severity: 'warning', productId, itemKey: r.item_key,
          message: `"${r.item_label}" 측정값(${measured}${r.measured_unit || ''})이 최소 허용값(${min}${r.baseline_unit || ''})보다 작습니다.`,
          messageKey: 'below_min', params: { item: r.item_label, measured, measuredUnit: r.measured_unit || '', min, baselineUnit: r.baseline_unit || '' } });
      }
      if (max != null && measured > max) {
        issues.push({ key: `${productId}:${r.id}:above_max`, severity: 'warning', productId, itemKey: r.item_key,
          message: `"${r.item_label}" 측정값(${measured}${r.measured_unit || ''})이 최대 허용값(${max}${r.baseline_unit || ''})을 초과했습니다.`,
          messageKey: 'above_max', params: { item: r.item_label, measured, measuredUnit: r.measured_unit || '', max, baselineUnit: r.baseline_unit || '' } });
      }
      if (min == null && max == null && baseline != null && tolerance != null) {
        const diff = Math.abs(measured - baseline);
        if (diff > tolerance) {
          issues.push({ key: `${productId}:${r.id}:tolerance_exceeded`, severity: 'warning', productId, itemKey: r.item_key,
            message: `"${r.item_label}" 측정값(${measured})이 기준값(${baseline}) 대비 허용오차(±${tolerance})를 벗어났습니다.`,
            messageKey: 'tolerance_exceeded', params: { item: r.item_label, measured, baseline, tolerance } });
        }
      }
    }

    if (measured != null && r.baseline_unit && r.measured_unit && r.baseline_unit.toLowerCase() !== r.measured_unit.toLowerCase()) {
      const u1 = r.baseline_unit.toLowerCase();
      const u2 = r.measured_unit.toLowerCase();
      const isMaAPair = (u1 === 'ma' && u2 === 'a') || (u1 === 'a' && u2 === 'ma');
      issues.push({ key: `${productId}:${r.id}:unit_mismatch`, severity: 'warning', productId, itemKey: r.item_key,
        message: isMaAPair
          ? `"${r.item_label}" 기준값 단위(${r.baseline_unit})와 측정값 단위(${r.measured_unit})가 달라 환산해 비교해야 합니다(mA↔A 혼용 주의).`
          : `"${r.item_label}" 기준값 단위(${r.baseline_unit})와 측정값 단위(${r.measured_unit})가 다릅니다.`,
        messageKey: isMaAPair ? 'unit_mismatch_ma_a' : 'unit_mismatch',
        params: { item: r.item_label, unit1: r.baseline_unit, unit2: r.measured_unit } });
    }
  }
  return issues;
}

/** 값들 사이의 정합성만 보는 다른 체크들은 "아무것도 안 채운 제품"엔 비교할 값 자체가
 * 없어서 이슈가 하나도 안 나온다 — 그래서 완전히 빈 채로 제출해도 "문제 없음"으로 보이는
 * 문제가 있었다(실사용 중 발견). 측정값/사진이 하나도 없으면 그 자체를 경고로 낸다. */
function checkCompleteness(productId: string, rows: MeasurementRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hasAnyMeasured = rows.some(r => toNumber(r.measured_value) != null);
  if (!hasAnyMeasured) {
    issues.push({ key: `${productId}:completeness:no_measurements`, severity: 'warning', productId,
      message: '이 제품에 입력된 측정값이 하나도 없습니다.', messageKey: 'no_measurements' });
  }
  const db = getDb();
  const photoCount = (db.prepare('SELECT COUNT(*) as c FROM approval_inspection_photos WHERE product_id=? AND is_current=1').get(productId) as { c: number }).c;
  if (photoCount === 0) {
    issues.push({ key: `${productId}:completeness:no_photos`, severity: 'warning', productId,
      message: '이 제품에 업로드된 사진이 하나도 없습니다.', messageKey: 'no_photos' });
  }
  return issues;
}

export function validateProductMeasurements(productId: string): ValidationIssue[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? ORDER BY sort_order').all(productId) as unknown as MeasurementRow[];
  return [
    ...checkElectricalConsistency(productId, rows, 'baseline'),
    ...checkElectricalConsistency(productId, rows, 'measured'),
    ...checkRangeAndUnitConsistency(productId, rows),
    ...checkCompleteness(productId, rows),
  ];
}

export function validateProject(projectId: string): ValidationIssue[] {
  const db = getDb();
  const products = db.prepare('SELECT id FROM approval_inspection_products WHERE project_id=? AND deleted=0').all(projectId) as { id: string }[];
  return products.flatMap(p => validateProductMeasurements(p.id));
}

/** true면(=미확인 blocking 이슈 있음) 제출/생성을 막는다. */
export function hasUnacknowledgedBlockingIssues(projectId: string): { blocked: boolean; issues: ValidationIssue[] } {
  const db = getDb();
  const issues = validateProject(projectId);
  const blocking = issues.filter(i => i.severity === 'blocking');
  if (blocking.length === 0) return { blocked: false, issues };
  const acked = new Set((db.prepare('SELECT issue_key FROM approval_inspection_validation_acknowledgements WHERE project_id=?').all(projectId) as { issue_key: string }[]).map(r => r.issue_key));
  const unacked = blocking.filter(i => !acked.has(i.key));
  return { blocked: unacked.length > 0, issues };
}

import { getDb, newId, now } from '@/lib/db/sqlite';
import { UPLOAD_BASE } from './storage';
import fs from 'fs';
import path from 'path';

/**
 * §2 핵심 요구사항 — 출고선적승인서 생성 시 기준 사전승인서의 제품/측정항목/배선정보/
 * 사진을 "참조"가 아니라 "값 복사"로 스냅샷한다. 이후 원본 사전승인서가 수정·삭제돼도
 * 이미 만든 출고선적승인서의 기준값은 절대 바뀌지 않아야 하기 때문이다.
 *
 * 측정값/배선 길이는 baseline_*(승인 기준값)만 그대로 복사하고 measured_*(실제 출고품
 * 측정값)는 항상 비운다 — 출고 검사자가 새로 입력해야 하는 값이라 이전 측정값을
 * 남겨두면 "값이 이미 있으니 확인 안 해도 된다"는 착각을 유발할 수 있다.
 *
 * 사진은 파일을 물리 복사한다(NAS 경로 그대로 재사용하지 않음) — 원본 사진이 나중에
 * 교체/삭제돼도 스냅샷 시점의 사진이 출고선적승인서에 그대로 남아있어야 한다.
 */
export function snapshotProjectData(sourceProjectId: string, targetProjectId: string): { productCount: number } {
  const db = getDb();
  const sourceProducts = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(sourceProjectId) as Record<string, unknown>[];
  const ts = now();

  db.transaction(() => {
    for (const sp of sourceProducts) {
      const sourceProductId = sp.id as string;
      const newProductId = newId();
      db.prepare(`INSERT INTO approval_inspection_products
        (id, project_id, sort_order, product_category, product_name, model_name, manufacturer, production_lot,
         dimensions, weight_g, cert_number, remark, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        newProductId, targetProjectId, sp.sort_order, sp.product_category, sp.product_name, sp.model_name,
        sp.manufacturer, sp.production_lot, sp.dimensions, sp.weight_g, sp.cert_number, sp.remark, ts, ts,
      );

      const measurements = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=?').all(sourceProductId) as Record<string, unknown>[];
      const insertMeasurement = db.prepare(`INSERT INTO approval_inspection_measurements
        (id, project_id, product_id, item_key, item_label, baseline_value, baseline_unit, measured_value, measured_unit,
         min_value, max_value, tolerance, equipment, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`);
      measurements.forEach(m => insertMeasurement.run(
        newId(), targetProjectId, newProductId, m.item_key, m.item_label, m.baseline_value, m.baseline_unit, m.measured_unit,
        m.min_value, m.max_value, m.tolerance, m.equipment, m.sort_order, ts, ts,
      ));

      const wires = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE product_id=?').all(sourceProductId) as Record<string, unknown>[];
      const insertWire = db.prepare(`INSERT INTO approval_inspection_wire_specs
        (id, project_id, product_id, wire_role, wire_spec, conductor_area, core_count, insulation_material, color,
         baseline_length_value, baseline_length_unit, measured_length_value, measured_length_unit, strip_length, end_treatment,
         connector_manufacturer, connector_model, pin_count, polarity, remark, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      wires.forEach(w => insertWire.run(
        newId(), targetProjectId, newProductId, w.wire_role, w.wire_spec, w.conductor_area, w.core_count, w.insulation_material, w.color,
        w.baseline_length_value, w.baseline_length_unit, w.measured_length_unit, w.strip_length, w.end_treatment,
        w.connector_manufacturer, w.connector_model, w.pin_count, w.polarity, w.remark, w.sort_order, ts, ts,
      ));

      const photos = db.prepare('SELECT * FROM approval_inspection_photos WHERE product_id=? AND is_current=1').all(sourceProductId) as Record<string, unknown>[];
      for (const ph of photos) {
        const sourcePhotoId = ph.id as string;
        const newPhotoId = newId();
        const srcDir = path.join(UPLOAD_BASE, sourceProjectId, sourcePhotoId);
        const dstDir = path.join(UPLOAD_BASE, targetProjectId, newPhotoId);
        let newEditedPath: string | null = null;
        try {
          fs.mkdirSync(dstDir, { recursive: true });
          const srcFile = path.join(srcDir, String(ph.stored_filename));
          if (fs.existsSync(srcFile)) fs.copyFileSync(srcFile, path.join(dstDir, String(ph.stored_filename)));
          if (ph.edited_file_path && fs.existsSync(String(ph.edited_file_path))) {
            const editedName = path.basename(String(ph.edited_file_path));
            newEditedPath = path.join(dstDir, editedName);
            fs.copyFileSync(String(ph.edited_file_path), newEditedPath);
          }
        } catch { /* 파일 복사 실패해도 메타데이터 스냅샷 행은 유지한다(경고성 누락, 전체 실패시키지 않음) */ }

        db.prepare(`INSERT INTO approval_inspection_photos
          (id, project_id, product_id, category_key, original_filename, stored_filename, size_bytes, mime_type, description,
           crop_rect_json, rotation_deg, edited_file_path, version, is_current, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`).run(
          newPhotoId, targetProjectId, newProductId, ph.category_key, ph.original_filename, ph.stored_filename, ph.size_bytes, ph.mime_type, ph.description,
          ph.crop_rect_json, ph.rotation_deg, newEditedPath, ph.sort_order, ts,
        );
      }
    }
  })();

  return { productCount: sourceProducts.length };
}

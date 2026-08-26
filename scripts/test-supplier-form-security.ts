/**
 * 중국 공급업체 자료요청 시스템 — 보안/검증 통합 테스트
 *
 * 이 프로젝트는 별도 테스트 프레임워크(jest/vitest 등)를 쓰지 않으므로, 실제로 떠 있는
 * dev 서버(BASE_URL)에 대해 진짜 HTTP 요청을 보내며 검증하는 스크립트로 작성했다.
 *
 * 실행 전제:
 *   1) SQLITE_DB_PATH를 스크래치 DB로 지정해 `npm run dev` 를 별도 포트로 띄워둘 것
 *      (프로덕션 DB에 대해 절대 실행하지 말 것 — 실제로 프로젝트/토큰을 생성·삭제함)
 *   2) AUTH_SECRET 환경변수를 .env.local과 동일한 값으로 지정
 *
 * 실행:
 *   AUTH_SECRET=... BASE_URL=http://localhost:3930 npx tsx scripts/test-supplier-form-security.ts
 */
import { SignJWT } from 'jose';

const BASE = process.env.BASE_URL || 'http://localhost:3930';
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error('AUTH_SECRET 환경변수가 필요합니다.'); process.exit(1); }

let pass = 0, fail = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; failures.push(label); console.log(`  ❌ ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}

async function signAdminToken(): Promise<string> {
  const secret = new TextEncoder().encode(AUTH_SECRET);
  return new SignJWT({ user: { id: 'tlgeu04bilmsid6z40', name: '테스트관리자', email: 't@test.com', role: 'admin', permissions: [] } })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

async function j(method: string, url: string, opts: { cookie?: string; body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers['Cookie'] = `tradeos_session=${opts.cookie}`;
  let body: BodyInit | undefined;
  if (opts.form) { body = opts.form; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(`${BASE}${url}`, { method, headers, body });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data };
}

async function main() {
  const adminToken = await signAdminToken();
  console.log(`\n=== 공급업체 자료요청 시스템 보안/검증 테스트 (BASE=${BASE}) ===\n`);

  // ── 준비: 프로젝트 2개 + 링크 2개 생성 ────────────────────────────────
  console.log('[준비] 테스트용 프로젝트 2개 생성');
  const p1 = await j('POST', '/api/supplier-requests', { cookie: adminToken, body: { productName: 'SecTest Product A', supplierName: 'SecTest Supplier A', defaultLanguage: 'zh' } });
  const p2 = await j('POST', '/api/supplier-requests', { cookie: adminToken, body: { productName: 'SecTest Product B', supplierName: 'SecTest Supplier B', defaultLanguage: 'en' } });
  const pid1 = (p1.data as { data: { id: string } }).data.id;
  const pid2 = (p2.data as { data: { id: string } }).data.id;
  const l1 = await j('POST', `/api/supplier-requests/${pid1}/link`, { cookie: adminToken, body: {} });
  const l2 = await j('POST', `/api/supplier-requests/${pid2}/link`, { cookie: adminToken, body: {} });
  const token1 = ((l1.data as { data: { url: string } }).data.url).split('/').pop()!;
  const token2 = ((l2.data as { data: { url: string } }).data.url).split('/').pop()!;
  console.log(`  project1=${pid1} token1=${token1.slice(0, 8)}...`);
  console.log(`  project2=${pid2} token2=${token2.slice(0, 8)}...\n`);

  // ── 1. 보안 토큰 없이/위조 토큰으로 외부 접근 차단 ────────────────────
  console.log('[1] 보안 토큰 검증');
  {
    const bogus = await j('GET', '/api/supplier-form/this-token-does-not-exist-at-all-xyz');
    ok(bogus.status === 404, '위조 토큰 접근 -> 404');
    const empty = await j('GET', '/api/supplier-form/');
    ok(empty.status === 404 || empty.status === 400, '빈 토큰 접근 -> 404/400', empty.status);
  }

  // ── 2. 다른 프로젝트 토큰으로 데이터/ID 접근 차단 ─────────────────────
  console.log('[2] 프로젝트 격리 검증');
  {
    const addRes = await j('POST', `/api/supplier-form/${token1}/components`, { body: { listType: 'fixture_part', rowKey: 'led_package' } });
    const itemId = (addRes.data as { data: { id: string } })?.data?.id;
    ok(!!itemId, 'project1에 항목 생성');

    const crossPut = await j('PUT', `/api/supplier-form/${token2}/components/${itemId}`, { body: { modelName: 'HACKED' } });
    ok(crossPut.status === 404, 'project2 토큰으로 project1 항목 PUT -> 404', crossPut.status);

    const crossDelete = await j('DELETE', `/api/supplier-form/${token2}/components/${itemId}`);
    ok(crossDelete.status === 404, 'project2 토큰으로 project1 항목 DELETE -> 404', crossDelete.status);

    const g1 = await j('GET', `/api/supplier-form/${token1}`);
    const g2 = await j('GET', `/api/supplier-form/${token2}`);
    const g1Product = (g1.data as { data: { project: { productName: string } } })?.data?.project?.productName;
    const g2Product = (g2.data as { data: { project: { productName: string } } })?.data?.project?.productName;
    ok(g1Product === 'SecTest Product A' && g2Product === 'SecTest Product B', '각 토큰은 자기 프로젝트 데이터만 반환');
  }

  // ── 3. 컨버터 조건별 첨부 항목 표시 ────────────────────────────────
  console.log('[3] 컨버터 조건별 필수 첨부 검증 (제출 시도로 간접 확인)');
  {
    for (const [type, expectKeys] of [
      ['has_converter', ['converter_ks_kc_cert', 'converter_spec', 'led_module_circuit_a', 'led_module_pcb_a', 'converter_circuit', 'converter_pcb']],
      ['no_converter', ['fixture_circuit', 'fixture_pcb', 'led_module_circuit_b', 'led_module_pcb_b']],
      ['integrated', ['fixture_circuit_int', 'fixture_pcb_int', 'led_module_circuit_int', 'led_module_pcb_int', 'converter_circuit_int', 'converter_pcb_int']],
    ] as const) {
      await j('POST', `/api/supplier-form/${token1}/save`, { body: { converterType: type } });
      const submitRes = await j('POST', `/api/supplier-form/${token1}/submit`, { body: { submitterName: 'Tester', lang: 'zh' } });
      const issues = (submitRes.data as { issues?: { key: string; kind: string }[] })?.issues || [];
      const attachmentIssueKeys = issues.filter(i => i.kind === 'attachment').map(i => i.key);
      const allExpected = expectKeys.every(k => attachmentIssueKeys.includes(k));
      ok(submitRes.status === 400 && allExpected, `${type} 선택 시 필요한 첨부 항목이 누락 목록에 정확히 표시됨`, attachmentIssueKeys);
    }
  }

  // ── 4. 위장 파일 차단 + 정상 PDF 허용 ─────────────────────────────
  console.log('[4] PDF 검증 (매직바이트)');
  {
    await j('POST', `/api/supplier-form/${token1}/save`, { body: { converterType: 'has_converter' } });
    const fakeForm = new FormData();
    fakeForm.append('file', new Blob(['not a real pdf'], { type: 'application/pdf' }), 'fake.pdf');
    fakeForm.append('categoryKey', 'led_package_spec');
    const fakeRes = await j('POST', `/api/supplier-form/${token1}/upload`, { form: fakeForm });
    ok(fakeRes.status === 400, '확장자만 pdf인 위장 파일 -> 400 거부', fakeRes.data);

    const realForm = new FormData();
    realForm.append('file', new Blob(['%PDF-1.4\n%test\n%%EOF'], { type: 'application/pdf' }), 'real.pdf');
    realForm.append('categoryKey', 'led_package_spec');
    const realRes = await j('POST', `/api/supplier-form/${token1}/upload`, { form: realForm });
    ok(realRes.status === 201, '정상 PDF -> 201 허용', realRes.data);

    // 여러 개 업로드 및 버전 관리
    const realForm2 = new FormData();
    realForm2.append('file', new Blob(['%PDF-1.4\n%test2\n%%EOF'], { type: 'application/pdf' }), 'real2.pdf');
    realForm2.append('categoryKey', 'led_package_spec');
    const realRes2 = await j('POST', `/api/supplier-form/${token1}/upload`, { form: realForm2 });
    const v1 = (realRes.data as { data: { version: number } })?.data?.version;
    const v2 = (realRes2.data as { data: { version: number } })?.data?.version;
    ok(v1 === 1 && v2 === 2, '동일 항목 재업로드 시 버전 증가', { v1, v2 });
  }

  // ── 5. LED 직렬×병렬=총수량 검증 ──────────────────────────────────
  console.log('[5] LED 배열 수치 검증');
  {
    await j('POST', `/api/supplier-form/${token1}/save`, { body: { formData: { ledSeriesCount: '10', ledParallelCount: '10', ledTotalCount: '999' } } });
    const submitRes = await j('POST', `/api/supplier-form/${token1}/submit`, { body: { submitterName: 'Tester', lang: 'zh' } });
    const issues = (submitRes.data as { issues?: { key: string; reasonKey: string }[] })?.issues || [];
    ok(issues.some(i => i.key === 'ledTotalCount' && i.reasonKey === 'mismatch'), '직렬×병렬≠총수량 -> mismatch 오류 표시', issues);
  }

  // ── 6. 원문/한국어값 분리 저장 구조 ────────────────────────────────
  console.log('[6] 원문/한국어 확정값 분리 저장');
  {
    await j('POST', `/api/supplier-form/${token1}/save`, { body: { formData: { ratedVoltage: '220V~' }, lang: 'zh' } });
    const g = await j('GET', `/api/supplier-form/${token1}`);
    const formData = (g.data as { data: { formData: Record<string, { original: string; korean: string }> } })?.data?.formData;
    ok(formData?.ratedVoltage?.original === '220V~' && formData?.ratedVoltage?.korean === '220V~', '값 저장 시 original/korean 필드가 분리되어 존재 (preserveOriginal 필드는 자동으로 동일값 확정)', formData?.ratedVoltage);
  }

  // ── 7. 긴 문자열 / 대량 행 입력 시 DOCX 생성 안정성 ───────────────────
  console.log('[7] 긴 텍스트/대량 행 입력 시 DOCX 생성 안정성');
  {
    const longStr = 'A'.repeat(300) + ' 매우 긴 회사명 테스트 '.repeat(20);
    await j('POST', `/api/supplier-form/${token1}/save`, {
      body: {
        converterType: 'has_converter', testCategories: ['base'],
        formData: {
          itemNameModelName: longStr, ratedVoltage: '220V', ratedPower: '40W', correlatedColorTemp: '5700K', cri: '80',
          originCountry: '중국', manufacturerName: longStr, supplierName: 'A', asContact: '123', manufactureDate: '2026.01',
          ledSeriesCount: '10', ledParallelCount: '10', ledTotalCount: '100',
        },
      },
    });
    // 부품 15개 추가 (복수부품 테이블은 템플릿 2행뿐이라 13개는 행 복제가 필요함)
    for (let i = 0; i < 15; i++) {
      const add = await j('POST', `/api/supplier-form/${token1}/components`, { body: { listType: 'multi_component' } });
      const itemId = (add.data as { data: { id: string } })?.data?.id;
      await j('PUT', `/api/supplier-form/${token1}/components/${itemId}`, { body: { partName: `Part${i}`, modelName: `Model-${i}-${longStr.slice(0, 50)}`, qty: String(i + 1) } });
    }
    const docxRes = await fetch(`${BASE}/api/supplier-requests/${pid1}/docx`, { headers: { Cookie: `tradeos_session=${adminToken}` } });
    const buf = Buffer.from(await docxRes.arrayBuffer());
    ok(docxRes.status === 200 && buf.slice(0, 2).toString() === 'PK', '긴 문자열+15개 행으로도 DOCX 생성 성공 (ZIP 유효)', docxRes.status);
  }

  // ── 8. 마감 전/후 동작 차단 ────────────────────────────────────────
  console.log('[8] 마감 상태 서버측 강제');
  {
    const beforeClose = await j('POST', `/api/supplier-form/${token1}/save`, { body: { formData: { asContact: 'before-close' } } });
    ok(beforeClose.status === 200, '마감 전 저장 -> 200');

    const closeRes = await j('POST', `/api/supplier-requests/${pid1}/close`, { cookie: adminToken, body: { action: 'close', reason: 'sectest' } });
    ok(closeRes.status === 200, '마감 처리 -> 200', closeRes.data);

    const saveAfter = await j('POST', `/api/supplier-form/${token1}/save`, { body: { formData: { asContact: 'after-close' } } });
    ok(saveAfter.status === 423, '마감 후 저장 -> 423', saveAfter.status);

    const submitAfter = await j('POST', `/api/supplier-form/${token1}/submit`, { body: { submitterName: 'x', lang: 'zh' } });
    ok(submitAfter.status === 423, '마감 후 제출 -> 423', submitAfter.status);

    const uploadForm = new FormData();
    uploadForm.append('file', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'x.pdf');
    uploadForm.append('categoryKey', 'etc_general');
    const uploadAfter = await j('POST', `/api/supplier-form/${token1}/upload`, { form: uploadForm });
    ok(uploadAfter.status === 423, '마감 후 파일 업로드 -> 423', uploadAfter.status);

    const getAttachments = await j('GET', `/api/supplier-form/${token1}`);
    const attId = ((getAttachments.data as { data: { attachments: { id: string }[] } })?.data?.attachments || [])[0]?.id;
    if (attId) {
      const deleteAfter = await j('DELETE', `/api/supplier-form/${token1}/files/${attId}`);
      ok(deleteAfter.status === 423, '마감 후 파일 삭제 -> 423', deleteAfter.status);
    } else {
      ok(false, '마감 후 파일 삭제 테스트 스킵 (첨부파일 없음)');
    }

    const readAfter = await j('GET', `/api/supplier-form/${token1}`);
    ok(readAfter.status === 200, '마감 후에도 읽기(조회)는 계속 가능 -> 200');

    // 마감 스냅샷 확인
    const detailAfterClose = await j('GET', `/api/supplier-requests/${pid1}`, { cookie: adminToken });
    const closures = (detailAfterClose.data as { data: { closures: unknown[] } })?.data?.closures || [];
    ok(closures.length > 0, '마감 스냅샷이 기록됨', closures.length);
  }

  // ── 9. 마감 해제 후 재수정 + 기존 마감본 보존 ─────────────────────────
  console.log('[9] 마감 해제');
  {
    const reopenRes = await j('POST', `/api/supplier-requests/${pid1}/close`, { cookie: adminToken, body: { action: 'reopen', reason: 'sectest reopen' } });
    ok(reopenRes.status === 200, '마감 해제 -> 200', reopenRes.data);

    const saveAfterReopen = await j('POST', `/api/supplier-form/${token1}/save`, { body: { formData: { asContact: 'after-reopen' } } });
    ok(saveAfterReopen.status === 200, '마감 해제 후 저장 다시 가능 -> 200');

    const detail = await j('GET', `/api/supplier-requests/${pid1}`, { cookie: adminToken });
    const closures = (detail.data as { data: { closures: { reasonMemo?: string; reopenedAt?: string }[] } })?.data?.closures || [];
    const firstClosure = closures[closures.length - 1]; // 오래된 순 확인 위해 마지막 요소(가장 이전) 사용은 아니고 존재 여부만
    ok(closures.some(c => c.reasonMemo === 'sectest') && closures.some(c => !!c.reopenedAt), '기존 마감 스냅샷이 삭제되지 않고 reopenedAt만 기록됨', firstClosure);
  }

  // ── 10. 링크 재발급 후 기존 링크 차단 ─────────────────────────────────
  console.log('[10] 링크 재발급');
  {
    const reissueRes = await j('POST', `/api/supplier-requests/${pid1}/link`, { cookie: adminToken, body: { reason: 'sectest reissue' } });
    const newToken = ((reissueRes.data as { data: { url: string } })?.data?.url || '').split('/').pop();
    ok(!!newToken && newToken !== token1, '재발급 시 새 토큰 발급됨');

    const oldTokenAccess = await j('GET', `/api/supplier-form/${token1}`);
    ok(oldTokenAccess.status === 404, '재발급 후 기존 토큰 접근 -> 404', oldTokenAccess.status);

    const newTokenAccess = newToken ? await j('GET', `/api/supplier-form/${newToken}`) : { status: 0 };
    ok(newTokenAccess.status === 200, '새 토큰은 정상 접근 가능 -> 200');
  }

  // ── 11. 필수 항목 누락 시 제출 차단 + 정확한 항목 표시 ─────────────────
  console.log('[11] 필수 항목 누락 표시');
  {
    const p3 = await j('POST', '/api/supplier-requests', { cookie: adminToken, body: { productName: 'SecTest Empty', supplierName: 'SecTest Empty Co' } });
    const pid3 = (p3.data as { data: { id: string } }).data.id;
    const l3 = await j('POST', `/api/supplier-requests/${pid3}/link`, { cookie: adminToken, body: {} });
    const token3 = ((l3.data as { data: { url: string } }).data.url).split('/').pop()!;
    const submitEmpty = await j('POST', `/api/supplier-form/${token3}/submit`, { body: { submitterName: 'Empty', lang: 'ko' } });
    ok(submitEmpty.status === 400, '완전히 빈 상태로 제출 시도 -> 400 차단', submitEmpty.status);
    const issues = (submitEmpty.data as { issues?: { key: string }[] })?.issues || [];
    ok(issues.some(i => i.key === 'converterType'), '컨버터 미선택이 누락 항목에 정확히 표시됨', issues.map((i: { key: string }) => i.key));
    ok(issues.length >= 10, `누락 항목이 다수(≥10) 구체적으로 나열됨 (실제 ${issues.length}건)`);
  }

  // ── 정리 ──────────────────────────────────────────────────────────
  console.log('\n[정리] 테스트 데이터 삭제 시도 (project delete API 없으면 스킵)');

  console.log(`\n=== 결과: ${pass}건 통과 / ${fail}건 실패 ===`);
  if (fail > 0) {
    console.log('실패 목록:', failures);
    process.exit(1);
  }
}

main().catch(e => { console.error('테스트 실행 중 오류:', e); process.exit(1); });

#!/bin/bash
# YNK 그룹웨어 재해복구 — 복원 검증. 컨테이너가 떴다는 이유만으로 성공 처리하지 않고
# 실제 핵심 기능을 확인한다(요구사항 23/24).
# bash 3.2(macOS 기본)에도 동작하도록 연관배열(declare -A, bash 4+ 전용) 대신
# 이름/결과 두 개의 일반 배열을 인덱스로 짝지어 쓴다.
set -uo pipefail

TARGET="${1:-/volume1/web/tradeos}"
PORT="${2:-3103}"
BASE_URL="http://localhost:$PORT"
REPORT_JSON="$TARGET/RESTORE_REPORT.json"
REPORT_HTML="$TARGET/RESTORE_REPORT.html"

CHECK_NAMES=()
CHECK_RESULTS=()

check() {
  local name="$1"; local cmd="$2"
  CHECK_NAMES+=("$name")
  if eval "$cmd" >/dev/null 2>&1; then
    CHECK_RESULTS+=("OK")
  else
    CHECK_RESULTS+=("FAILED")
  fi
}

echo "=== 복원 검증 시작 ($BASE_URL) ==="

check "login_page" "curl -sf -o /dev/null '$BASE_URL/login'"
check "database_file" "[ -f '$TARGET/data/nexport.db' ] && sqlite3 '$TARGET/data/nexport.db' 'SELECT 1' "
check "database_has_users" "[ \"\$(sqlite3 '$TARGET/data/nexport.db' 'SELECT COUNT(*) FROM users')\" -gt 0 ]"
check "database_has_products" "sqlite3 '$TARGET/data/nexport.db' 'SELECT COUNT(*) FROM products' "
check "attachments_dir" "[ -d '$TARGET/data/uploads' ]"
check "qdrant" "curl -sf -o /dev/null http://127.0.0.1:6333/"
check "ai_config_table" "sqlite3 '$TARGET/data/nexport.db' 'SELECT COUNT(*) FROM ai_settings' "
check "api_health" "curl -sf -o /dev/null '$BASE_URL/api/storage/health'"

echo ""
FAIL_COUNT=0
TMP_RESULT_FILE=$(mktemp)
i=0
while [ "$i" -lt "${#CHECK_NAMES[@]}" ]; do
  NAME="${CHECK_NAMES[$i]}"
  STATUS="${CHECK_RESULTS[$i]}"
  echo "  [$STATUS] $NAME"
  echo "$NAME=$STATUS" >> "$TMP_RESULT_FILE"
  [ "$STATUS" = "FAILED" ] && FAIL_COUNT=$((FAIL_COUNT+1))
  i=$((i+1))
done

node -e "
const fs = require('fs');
const lines = fs.readFileSync('$TMP_RESULT_FILE', 'utf8').trim().split('\n').filter(Boolean);
const result = {};
for (const line of lines) { const idx = line.indexOf('='); result[line.slice(0, idx)] = line.slice(idx + 1); }
const failCount = Object.values(result).filter(v => v === 'FAILED').length;
const report = { generatedAt: new Date().toISOString(), baseUrl: '$BASE_URL', checks: result, failCount, overall: failCount === 0 ? 'SUCCESS' : 'FAILED' };
fs.writeFileSync('$REPORT_JSON', JSON.stringify(report, null, 2));
const rows = Object.entries(result).map(([k,v]) => \`<tr><td>\${k}</td><td style=\"color:\${v==='OK'?'green':'red'}\">\${v}</td></tr>\`).join('');
fs.writeFileSync('$REPORT_HTML', \`<html><head><meta charset=\"utf-8\"><title>RESTORE_REPORT</title></head><body>
<h1>YNK 그룹웨어 복원 검증 리포트</h1>
<p>생성 시각: \${report.generatedAt}</p>
<p>전체 결과: <b style=\"color:\${report.overall==='SUCCESS'?'green':'red'}\">\${report.overall}</b></p>
<table border=1 cellpadding=6><tr><th>항목</th><th>결과</th></tr>\${rows}</table>
</body></html>\`);
"
rm -f "$TMP_RESULT_FILE"

echo ""
echo "리포트 생성됨: $REPORT_JSON, $REPORT_HTML"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "=== 검증 통과 ==="
  exit 0
else
  echo "=== 검증 실패 항목 ${FAIL_COUNT}건 — 위 리포트를 확인하세요 ==="
  exit 1
fi

#!/bin/bash
# YNK 그룹웨어 재해복구 — 도메인 변경
# 사용법: ./change-domain.sh <새도메인> [설치대상경로] [앱 포트(기본 3103, 도메인 스캔용 로컬 호출에 사용)]
set -uo pipefail

NEW_DOMAIN="${1:?사용법: ./change-domain.sh <새도메인> [설치대상경로]}"
TARGET="${2:-/volume1/web/tradeos}"
PORT="${3:-3103}"
ENV_FILE="$TARGET/.env.recovered"

echo "=== 도메인 변경: -> $NEW_DOMAIN ==="

if [ ! -f "$ENV_FILE" ]; then
  echo "[실패] $ENV_FILE 을 찾을 수 없습니다 — restore.sh를 먼저 실행하세요."
  exit 1
fi

# 이 프로젝트는 도메인 의존 설정을 lib/config/domain.ts 하나로 모아뒀고, 그 함수는
# APP_DOMAIN(우선) 또는 NEXT_PUBLIC_APP_URL을 읽는다 — 소스 코드를 하나도 고치지 않고
# 이 두 값만 바꾸면 로그인 리다이렉트/API URL/쿠키 도메인 등이 전부 새 도메인을 따라간다.
grep -v '^APP_DOMAIN=' "$ENV_FILE" | grep -v '^NEXT_PUBLIC_APP_URL=' > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "APP_DOMAIN=$NEW_DOMAIN" >> "$ENV_FILE"
echo "NEXT_PUBLIC_APP_URL=https://$NEW_DOMAIN" >> "$ENV_FILE"
echo "[OK] $ENV_FILE 에 새 도메인 반영됨"

echo ""
echo "다음 안내는 자동화되지 않습니다(외부 서비스라 직접 처리 필요):"
echo "  - DNS: $NEW_DOMAIN 이 이 NAS의 공인 IP를 가리키도록 A/CNAME 레코드를 등록하세요."
echo "  - SSL: Let's Encrypt 등에서 $NEW_DOMAIN 인증서를 새로 발급하세요(DNS 검증 필요)."
echo "  - 리버스 프록시(Synology DSM 제어판 > 로그인 포털 > 고급 > 역방향 프록시)에 새 도메인을 등록하세요."
echo ""

echo "애플리케이션을 재기동해야 새 값이 적용됩니다."
if [ -f "$TARGET/recovery.pid" ] && kill -0 "$(cat "$TARGET/recovery.pid")" 2>/dev/null; then
  kill "$(cat "$TARGET/recovery.pid")" 2>/dev/null || true
  sleep 2
fi
if [ -f "$TARGET/.next/standalone/server.js" ]; then
  set -a; source "$ENV_FILE"; set +a
  nohup env PORT="$PORT" node "$TARGET/.next/standalone/server.js" >> "$TARGET/recovery-start.log" 2>&1 &
  echo $! > "$TARGET/recovery.pid"
  echo "재기동됨(PID $(cat "$TARGET/recovery.pid"))"
  for i in $(seq 1 15); do
    sleep 2
    curl -sf -o /dev/null "http://localhost:$PORT/login" && break
  done
fi

echo ""
echo "구 도메인 하드코딩 잔존 여부를 확인합니다(소스가 있는 CI/개발 환경에서만 의미 있음 — "
echo "이 NAS엔 컴파일된 빌드만 있어 소스 스캔 자체는 건너뜁니다. GitHub Actions 빌드 로그의"
echo "'Domain hardcoding check' 스텝을 참고하세요)."

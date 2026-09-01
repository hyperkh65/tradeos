#!/bin/bash
# YNK 그룹웨어 재해복구 — 메인 복원 스크립트
# 사용법: RECOVERY_PASSWORD='...' ./restore.sh <package.tar.gz> [설치대상경로]
#   RECOVERY_PASSWORD를 안 주면 secrets.enc 복호화 단계에서 프롬프트로 물어본다.
#   시크릿이 없는 백업(Recovery Password 미설정 상태로 만든 백업)이면 이 단계는 건너뛴다.
set -uo pipefail

PACKAGE="${1:?사용법: ./restore.sh <package.tar.gz> [설치대상경로]}"
TARGET="${2:-/volume1/web/tradeos}"
DOCKER="/var/packages/ContainerManager/target/usr/bin/docker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$PACKAGE" ]; then
  echo "[실패] 패키지 파일을 찾을 수 없습니다: $PACKAGE"
  exit 1
fi

echo "=== YNK 그룹웨어 재해복구 시작 ==="
echo "패키지: $PACKAGE"
echo "대상: $TARGET"
echo ""

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "[1/9] 패키지 압축 해제 중..."
tar -xzf "$PACKAGE" -C "$WORKDIR"

echo "[2/9] 체크섬 검증 중..."
if ! (cd "$WORKDIR" && shasum -a 256 -c manifest/checksums.sha256 --status); then
  echo "[실패] 체크섬 검증에 실패했습니다 — 패키지가 손상됐을 수 있습니다. 복원을 중단합니다."
  exit 1
fi
echo "       체크섬 검증 통과"

echo "[3/9] 대상 디렉터리 준비..."
mkdir -p "$TARGET" "$TARGET/data" "$TARGET/data/uploads" "$TARGET/data/qdrant"

echo "[4/9] 애플리케이션 배포 중..."
if [ -d "$WORKDIR/application/build" ]; then
  cp -R "$WORKDIR/application/build/." "$TARGET/"
else
  echo "       [경고] 패키지 안에 컴파일된 빌드가 없습니다(참조 파일만 있는 구버전 백업일 수 있음) — application/package.json 기준으로 npm install && npm run build를 직접 수행해야 합니다."
fi

echo "[5/9] 데이터베이스 복원 중..."
cp "$WORKDIR/database/database.dump" "$TARGET/data/nexport.db"
rm -f "$TARGET/data/nexport.db-wal" "$TARGET/data/nexport.db-shm"

echo "[6/9] 첨부파일 복원 중..."
if [ -d "$WORKDIR/files/attachments" ]; then
  cp -R "$WORKDIR/files/attachments/." "$TARGET/data/uploads/"
fi

echo "[7/9] Qdrant 컨테이너 기동 + snapshot 복원..."
if [ -x "$DOCKER" ] || command -v docker >/dev/null 2>&1; then
  DOCKER_BIN="${DOCKER}"; [ -x "$DOCKER_BIN" ] || DOCKER_BIN="docker"
  if ! $DOCKER_BIN ps --format '{{.Names}}' | grep -qx tradeos-qdrant; then
    $DOCKER_BIN rm -f tradeos-qdrant 2>/dev/null || true
    $DOCKER_BIN run -d --name tradeos-qdrant --restart unless-stopped \
      -p 127.0.0.1:6333:6333 \
      -v "$TARGET/data/qdrant:/qdrant/storage" \
      qdrant/qdrant:latest
    echo "       Qdrant 컨테이너 기동 요청됨(기동 대기 중)..."
    for i in $(seq 1 15); do
      sleep 2
      curl -sf -o /dev/null http://127.0.0.1:6333/ && break
    done
  fi
  SNAPSHOT_FILE=$(find "$WORKDIR/qdrant/snapshots" -name '*.snapshot' 2>/dev/null | head -1)
  if [ -n "${SNAPSHOT_FILE:-}" ]; then
    COLLECTION_NAME=$(basename "$SNAPSHOT_FILE" .snapshot)
    echo "       snapshot 발견($COLLECTION_NAME) — 업로드 복원 시도 중..."
    curl -sf -X POST "http://127.0.0.1:6333/collections/${COLLECTION_NAME}/snapshots/upload?priority=snapshot" \
      -F "snapshot=@${SNAPSHOT_FILE}" && echo "       Qdrant snapshot 복원 완료" \
      || echo "       [경고] Qdrant snapshot 복원 실패 — 앱 기동 후 관리자 화면에서 전체 재인덱싱(Full Rebuild)을 실행하세요."
  else
    echo "       [경고] 패키지에 Qdrant snapshot이 없습니다 — 앱 기동 후 전체 재인덱싱이 필요합니다."
  fi
  if ! $DOCKER_BIN ps --format '{{.Names}}' | grep -qx tradeos-docverify; then
    $DOCKER_BIN rm -f tradeos-docverify 2>/dev/null || true
    if [ -f "$WORKDIR/docker/images/tradeos-docverify.tar" ]; then
      $DOCKER_BIN load -i "$WORKDIR/docker/images/tradeos-docverify.tar"
    fi
    $DOCKER_BIN run -d --name tradeos-docverify --restart unless-stopped \
      -v "$TARGET/data:$TARGET/data" -v /tmp:/tmp tradeos-docverify \
      && echo "       docverify 컨테이너 기동됨" \
      || echo "       [경고] docverify 이미지가 없어 기동하지 못했습니다 — 문서검증 기능만 영향받습니다(핵심 그룹웨어는 정상)."
  fi
  # English Shorts Studio(Admin Tools) 렌더 사이드카 — docverify와 달리 리포 밖
  # 커스텀 이미지가 아니라 공개 이미지(linuxserver/ffmpeg)라 tar 로드가 필요 없고
  # Docker가 registry에서 직접 pull한다(Qdrant와 동일한 방식).
  if ! $DOCKER_BIN ps --format '{{.Names}}' | grep -qx tradeos-ffmpeg; then
    $DOCKER_BIN rm -f tradeos-ffmpeg 2>/dev/null || true
    $DOCKER_BIN run -d --name tradeos-ffmpeg --restart unless-stopped \
      --entrypoint tail \
      -v "$TARGET/data:$TARGET/data" -v /tmp:/tmp \
      linuxserver/ffmpeg -f /dev/null \
      && echo "       ffmpeg 컨테이너 기동됨" \
      || echo "       [경고] ffmpeg 컨테이너를 기동하지 못했습니다 — English Shorts 렌더링 기능만 영향받습니다(핵심 그룹웨어는 정상)."
  fi
else
  echo "       [경고] Docker를 찾을 수 없어 Qdrant/docverify/ffmpeg를 건너뜁니다 — preflight.sh를 다시 확인하세요."
fi

echo "[8/9] 시크릿/설정 복원 중..."
ENV_FILE="$TARGET/.env.recovered"
: > "$ENV_FILE"
if [ -f "$WORKDIR/config/application-config.json" ]; then
  node -e "
    const cfg = require('$WORKDIR/config/application-config.json');
    const lines = [];
    lines.push('PORT=' + cfg.port);
    lines.push('DOCVERIFY_CONTAINER=' + cfg.docverifyContainer);
    lines.push('FFMPEG_CONTAINER=' + cfg.ffmpegContainer);
    lines.push('AI_ENABLED=' + cfg.aiEnabled);
    for (const [k, v] of Object.entries(cfg.notionDbIds || {})) lines.push(k + '=' + JSON.stringify(v));
    require('fs').appendFileSync('$ENV_FILE', lines.join('\n') + '\n');
  " 2>/dev/null || echo "       [경고] application-config.json 처리 실패(node 필요) — 수동으로 NOTION_DB_* 값을 확인하세요."
fi
if [ -f "$WORKDIR/secrets/secrets.enc" ]; then
  if node "$SCRIPT_DIR/decrypt-secrets.js" "$WORKDIR/secrets/secrets.enc" "$WORKDIR/.env.secrets" ; then
    cat "$WORKDIR/.env.secrets" >> "$ENV_FILE"
    cp "$WORKDIR/.env.secrets.ai-providers-reference.json" "$TARGET/AI_PROVIDERS_REFERENCE.json" 2>/dev/null || true
    echo "       시크릿 복호화 완료 → $ENV_FILE"
  else
    echo "       [실패] 시크릿 복호화 실패 — Recovery Password를 확인하세요. .env는 설정값만 포함된 채로 계속 진행합니다."
  fi
else
  echo "       [정보] 이 백업엔 시크릿이 포함되지 않았습니다(Recovery Password 미설정 상태로 생성됨) — .env를 수동으로 채워야 합니다."
fi
echo "SQLITE_DB_PATH=$TARGET/data/nexport.db" >> "$ENV_FILE"
echo "UPLOAD_DIR=$TARGET/data/uploads" >> "$ENV_FILE"
echo "QDRANT_URL=http://127.0.0.1:6333" >> "$ENV_FILE"
# 서버가 이 값을 읽어 사진첩 외부 공유 링크 재검토 알림을 관리자에게 1회 발송한다
# (lib/backup/post-restore.ts) — 옛 환경에서 발급된 공유 링크가 새 환경에서도 계속
# 유효한 게 맞는지는 사람이 판단해야 하는 문제라 자동 폐기 대신 알림만 남긴다.
echo "RECOVERY_RESTORED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$ENV_FILE"
echo "       .env 초안 생성됨: $ENV_FILE (검토 후 실제 .env로 사용하거나 프로세스 매니저에 반영하세요)"

echo "[9/10] 문서 배치..."
mkdir -p "$TARGET/RECOVERY_DOCS"
cp -R "$WORKDIR/documentation/." "$TARGET/RECOVERY_DOCS/" 2>/dev/null || true

echo "[10/10] 애플리케이션 기동 시도..."
if [ -f "$TARGET/.next/standalone/server.js" ]; then
  set -a; source "$ENV_FILE"; set +a
  PORT="${PORT:-3103}"
  nohup env PORT="$PORT" node "$TARGET/.next/standalone/server.js" >> "$TARGET/recovery-start.log" 2>&1 &
  echo $! > "$TARGET/recovery.pid"
  echo "       기동 요청됨(PID $(cat "$TARGET/recovery.pid")) — 응답 대기 중..."
  for i in $(seq 1 15); do
    sleep 2
    if curl -sf -o /dev/null "http://localhost:$PORT/login"; then
      echo "       앱이 포트 $PORT 에서 응답합니다."
      break
    fi
  done
else
  echo "       [정보] 컴파일된 빌드가 없어 자동 기동을 건너뜁니다."
fi

echo ""
echo "=== 복원 완료 ==="
echo "다음 단계:"
echo "  1) $ENV_FILE 내용을 확인하세요(복호화 실패/시크릿 없음 등 경고가 있었다면 수동으로 채워야 합니다)."
echo "  2) (도메인이 바뀌었다면) ./change-domain.sh <새도메인> 을 실행하세요."
echo "  3) ./verify.sh 로 복원 결과를 검증하세요."

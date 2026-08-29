#!/bin/bash
# YNK 그룹웨어 재해복구 — 사전 점검
# 사용법: ./preflight.sh [설치대상경로(기본 /volume1/web/tradeos)]
set -uo pipefail

TARGET="${1:-/volume1/web/tradeos}"
DOCKER="/var/packages/ContainerManager/target/usr/bin/docker"
OK=1

echo "=== YNK 그룹웨어 재해복구 — 사전 점검 ==="
echo "대상 경로: $TARGET"
echo ""

# 1) Synology DSM 여부
if [ -f /etc/synoinfo.conf ] || [ -d /var/packages ]; then
  echo "[OK] Synology DSM 환경으로 확인됨"
else
  echo "[경고] Synology DSM이 아닌 것으로 보입니다 — 이 스크립트는 DSM 전용입니다. 계속 진행은 가능하나 경로/패키지 위치가 다를 수 있습니다."
  OK=0
fi

# 2) Container Manager(Docker) 존재
if [ -x "$DOCKER" ]; then
  echo "[OK] Container Manager 발견: $DOCKER"
elif command -v docker >/dev/null 2>&1; then
  echo "[OK] docker 명령 발견(PATH): $(command -v docker)"
else
  echo "[실패] Docker/Container Manager를 찾을 수 없습니다. Synology 패키지 센터에서 'Container Manager'를 설치한 뒤 다시 실행하세요(자동 설치는 지원하지 않습니다)."
  OK=0
fi

# 3) 디스크 여유공간(최소 5GB 권장)
if command -v df >/dev/null 2>&1; then
  PARENT_DIR=$(dirname "$TARGET")
  AVAIL_KB=$(df -Pk "$PARENT_DIR" 2>/dev/null | tail -1 | awk '{print $4}')
  if [ -n "${AVAIL_KB:-}" ]; then
    AVAIL_GB=$((AVAIL_KB / 1024 / 1024))
    if [ "$AVAIL_GB" -lt 5 ]; then
      echo "[경고] 여유 공간이 ${AVAIL_GB}GB뿐입니다(권장 5GB 이상)."
      OK=0
    else
      echo "[OK] 여유 공간 ${AVAIL_GB}GB"
    fi
  else
    echo "[경고] 여유 공간을 확인하지 못했습니다."
  fi
fi

# 4) 필요 포트(3103, 6333)가 비어 있는지
for PORT in 3103 6333; do
  if command -v netstat >/dev/null 2>&1 && netstat -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "[경고] 포트 $PORT 가 이미 사용 중입니다."
    OK=0
  else
    echo "[OK] 포트 $PORT 사용 가능"
  fi
done

# 5) 외장 HDD(Recovery Package가 있는 위치) 마운트 확인
USB_MOUNTS=$(mount 2>/dev/null | grep -c "/volumeUSB" || true)
if [ "$USB_MOUNTS" -gt 0 ]; then
  echo "[OK] 외장 USB 드라이브 ${USB_MOUNTS}개 마운트됨"
  mount | grep "/volumeUSB" | awk '{print "       " $3}'
else
  echo "[경고] 마운트된 외장 USB 드라이브를 찾지 못했습니다. Recovery Package가 있는 드라이브가 연결/마운트되어 있는지 확인하세요."
fi

# 6) 대상 경로 쓰기 권한
mkdir -p "$TARGET" 2>/dev/null
if [ -w "$TARGET" ]; then
  echo "[OK] 대상 경로 쓰기 가능: $TARGET"
else
  echo "[실패] 대상 경로에 쓰기 권한이 없습니다: $TARGET"
  OK=0
fi

echo ""
if [ "$OK" = "1" ]; then
  echo "=== 사전 점검 통과 — restore.sh를 실행할 수 있습니다 ==="
  exit 0
else
  echo "=== 사전 점검에서 경고/실패 항목이 있습니다 — 위 내용을 확인 후 진행하세요 ==="
  exit 1
fi

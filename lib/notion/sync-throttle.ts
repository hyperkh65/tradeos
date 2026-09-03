const lastSyncedAt = new Map<string, number>();

/** 목록 화면을 새로고침/탭 전환할 때마다 Notion 전체 데이터베이스를 매번 다시 긁어오는 게
 * 체감 속도 저하의 원인이었다(발주/거래처/제품/견적서 화면 실사용 피드백 — Notion 페이지네이션
 * 전체 순회 후 SQLite에 병합하는 걸 매 GET마다 기다림). 같은 리소스를 throttleMs 안에 다시
 * 조회하면 굳이 다시 동기화하지 않고 이미 SQLite에 있는 값을 그대로 쓴다.
 *
 * true가 나오면 이번 호출에서 동기화를 "시작해도 된다"는 뜻이고, 그 즉시(await 전에)
 * markSynced를 불러야 한다 — 그래야 동시에 몰린 다른 요청이 중복으로 또 Notion을 때리지 않는다. */
export function shouldSync(resource: string, throttleMs = 60_000): boolean {
  const last = lastSyncedAt.get(resource);
  return last == null || Date.now() - last > throttleMs;
}

export function markSynced(resource: string): void {
  lastSyncedAt.set(resource, Date.now());
}

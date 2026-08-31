/**
 * Tauri 데스크톱 셸(WKWebView)에서는 JS window.print()가 아무 반응 없이 no-op된다
 * (macOS WKWebView가 print panel delegate를 구현하지 않으면 조용히 무시함 — 브라우저
 * 콘솔 에러도 없어서 겉으로는 버튼이 그냥 고장난 것처럼 보인다). Tauri에서는 Rust
 * 쪽에 등록된 native_print 커맨드(WebviewWindow::print(), macOS 네이티브 인쇄 패널)를
 * 대신 호출한다. 그 외(일반 브라우저, Windows/WebView2 등 native_print 미지원 환경)는
 * invoke가 실패하므로 기존 window.print()로 폴백한다.
 */
export async function triggerPrint(): Promise<void> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('native_print');
      return;
    } catch {
      // native_print 미지원 플랫폼 — 브라우저 인쇄로 폴백
    }
  }
  window.print();
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 이 앱 안의 다른 "페이지"(예: /print, /purchase-orders/print?id=…, /costs/invoice-print)
 * 로 이동한다 — 일반 브라우저는 새 탭(window.open)으로, Tauri는 같은 웹뷰 안에서 이동
 * (location.href)한다. Tauri(WKWebView)는 새 창을 만드는 delegate가 구현되어 있지 않아
 * window.open()이 조용히 아무 반응 없기 때문 — 대신 페이지 이동 후 "뒤로가기" 버튼으로
 * 돌아온다.
 *
 * ⚠️ PDF/이미지 등 "파일"에는 이 함수를 쓰면 안 된다 — WKWebView가 페이지 대신 파일을
 * 렌더링해버려서 앱 전체가 그 파일로 바뀌고 뒤로 갈 방법이 없어진다(실사용자 확인된 버그).
 * 파일 다운로드에는 downloadFile()을 쓴다.
 */
export function openAppUrl(url: string): void {
  if (isTauri()) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

/**
 * 첨부파일/서버생성 PDF·엑셀 등 "파일"을 다운로드한다. openAppUrl()과 달리 페이지 이동을
 * 전혀 하지 않는다 — fetch로 받아 Blob으로 만든 뒤 임시 <a download> 클릭으로 저장 창을
 * 띄운다. 이 방식은 Tauri(WKWebView)든 일반 브라우저든 동일하게 동작하고, PDF/이미지처럼
 * 브라우저가 인라인으로 열 수 있는 파일 타입이어도 항상 "다운로드"로 처리된다(현재 페이지
 * 를 벗어나지 않음).
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || url.split('/').pop()?.split('?')[0] || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (e) {
    alert(e instanceof Error ? e.message : '다운로드에 실패했습니다.');
  }
}

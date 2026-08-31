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
 * 인쇄용 라우트(예: /print, /costs/invoice-print?id=…)를 연다. 일반 브라우저는 새 탭
 * (window.open)으로 — 원래 화면 상태를 유지한 채 인쇄 탭만 따로 뜸. Tauri는 별도 창을
 * 띄우는 WKWebView delegate가 없어 window.open()이 조용히 실패하므로, 같은 웹뷰 안에서
 * 그냥 이동(location.href)한다 — 인쇄 라우트의 "뒤로가기" 링크로 돌아온다.
 */
export function openPrintUrl(url: string): void {
  if (isTauri()) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

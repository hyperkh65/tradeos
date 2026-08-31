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
 * 같은 출처(gw.ynk2014.com)의 URL을 새 탭/파일다운로드로 연다 — 인쇄 라우트
 * (/print, /costs/invoice-print?id=…), 첨부파일 다운로드(선적/발주/매출 서류 등),
 * 서버생성 PDF/엑셀(거래명세표, 견적 등) 전부 동일한 문제를 겪는다: 일반 브라우저는
 * window.open()이나 <a target="_blank">로 새 탭이 잘 뜨지만, Tauri(WKWebView)는 새
 * 창을 만드는 delegate가 구현되어 있지 않아 둘 다 조용히 아무 반응이 없다. Tauri에서는
 * 같은 웹뷰 안에서 그냥 이동(location.href)한다 — 페이지면 "뒤로가기"로, 파일이면
 * WKWebView 기본 다운로드 처리로 돌아온다.
 */
export function openAppUrl(url: string): void {
  if (isTauri()) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

use std::fs;
use std::time::Duration;
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_SERVER_URL: &str = "https://gw.ynk2014.com";
const CACHE_FILE: &str = "server_url.txt";

// 서버 도메인을 코드에 하드코딩해두지 않기 위한 부트스트랩 로직:
// 1) 로컬에 캐싱된 "last-known-good" URL이 있으면 그것으로 먼저 시도
// 2) 없으면 기본값(DEFAULT_SERVER_URL) 1곳으로만 시도
// 3) 그 URL의 /api/desktop/bootstrap을 호출해 서버가 알려주는 최신 serverUrl로 갱신
//    (도메인이 *.ynk2014.com인지 검증한 뒤에만 반영 — 임의 리다이렉트 방지)
// 4) 성공하면 캐시에 저장, 실패하면 캐시(또는 기본값)를 그대로 사용
fn is_allowed_host(url: &Url) -> bool {
    matches!(url.host_str(), Some(host) if host == "gw.ynk2014.com" || host.ends_with(".ynk2014.com"))
}

fn read_cached_url(app: &tauri::AppHandle) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?;
    let content = fs::read_to_string(dir.join(CACHE_FILE)).ok()?;
    let trimmed = content.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn write_cached_url(app: &tauri::AppHandle, url: &str) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(dir.join(CACHE_FILE), url);
    }
}

fn fetch_server_url(base: &str) -> Option<String> {
    let endpoint = format!("{}/api/desktop/bootstrap", base.trim_end_matches('/'));
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(4)))
        .build()
        .into();
    let mut response = ureq::Agent::new_with_config(agent).get(&endpoint).call().ok()?;
    let body: serde_json::Value = response.body_mut().read_json().ok()?;
    body.get("serverUrl")?.as_str().map(|s| s.to_string())
}

fn resolve_server_url(app: &tauri::AppHandle) -> Url {
    let cached = read_cached_url(app);
    let probe_base = cached.clone().unwrap_or_else(|| DEFAULT_SERVER_URL.to_string());

    if let Some(fresh) = fetch_server_url(&probe_base) {
        if let Ok(parsed) = Url::parse(&fresh) {
            if is_allowed_host(&parsed) {
                write_cached_url(app, &fresh);
                return parsed;
            }
        }
    }

    let fallback = cached.unwrap_or_else(|| DEFAULT_SERVER_URL.to_string());
    Url::parse(&fallback).unwrap_or_else(|_| Url::parse(DEFAULT_SERVER_URL).expect("default server url must be valid"))
}

// JS window.print()는 WKWebView(macOS)에서 print panel delegate가 없으면 조용히
// no-op된다. WebviewWindow::print()는 이 문제를 우회하는 네이티브 인쇄 패널 호출이다
// (Tauri 2.11 기준 macOS/wry에서만 지원 — 다른 플랫폼에서는 에러를 반환하고, 그 경우
// JS 쪽(lib/tauri-print.ts)에서 window.print()로 폴백한다).
#[tauri::command]
fn native_print(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![native_print])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let url = resolve_server_url(app.handle());
            let app_handle = app.handle().clone();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("YNK 그룹웨어")
                .inner_size(1280.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                // Windows(WebView2)는 기본적으로 OS 드래그앤드롭을 자체 핸들러가 가로채서
                // 프론트엔드의 HTML5 dataTransfer.files가 항상 비어있게 된다(사진첩/파일/
                // 제품 등 여러 화면의 기존 onDrop이 Windows에서만 조용히 동작 안 하던 원인).
                // macOS(WKWebView)는 원래 문제 없어 이 호출이 사실상 no-op이다.
                .disable_drag_drop_handler()
                .on_navigation(move |url| {
                    if is_allowed_host(url) || url.scheme() == "tauri" {
                        return true;
                    }
                    // 그룹웨어 도메인이 아닌 링크는 웹뷰 내 이동을 막고 시스템 브라우저로 연다.
                    let _ = app_handle.opener().open_url(url.to_string(), None::<&str>);
                    false
                })
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

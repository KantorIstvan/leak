use tauri::Manager;

/// Downloads the update `check` found, verifies it against the updater's public key and installs it. The frontend
/// relaunches afterwards (Windows' installer has already quit the app by then).
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("no update available")?;
    // `download` checks the minisign signature, so the bytes below are the ones the release workflow signed.
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    if tauri::utils::platform::bundle_type() == Some(tauri::utils::config::BundleType::Rpm) {
        return install_rpm(&bytes);
    }
    update.install(bytes).map_err(|e| e.to_string())
}

/// The updater plugin runs `rpm -U` on its own, and rpm 6 (Fedora 43+) refuses a package without a GPG signature,
/// which the released rpm does not have. The bytes were checked against the minisign signature above, so rpm's own
/// signature check is skipped. Its digest check still runs.
#[cfg(target_os = "linux")]
fn install_rpm(bytes: &[u8]) -> Result<(), String> {
    let dir = tempfile::Builder::new()
        .prefix("leak_update")
        .tempdir()
        .map_err(|e| e.to_string())?;
    let pkg = dir.path().join("package.rpm");
    std::fs::write(&pkg, bytes).map_err(|e| e.to_string())?;
    // pkexec shows the desktop's password prompt. Status 126 means the user dismissed it.
    let status = std::process::Command::new("pkexec")
        .args(["rpm", "-U", "--nosignature"])
        .arg(&pkg)
        .status()
        .map_err(|e| format!("could not run pkexec: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("rpm -U failed: {status}"))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Wayland compositors take a window's icon from the .desktop file named after its app_id, which GTK sets from the
    // program name, "leak". The rpm/deb packages install Leak.desktop (after productName), and the lookup is
    // case-sensitive, so without this KDE shows its fallback icon. Has to run before GTK starts.
    #[cfg(target_os = "linux")]
    glib::set_prgname(Some("Leak"));

    tauri::Builder::default()
        // Has to come first. Windows and Linux open a leakbudget:// sign-in link by starting Leak again: this hands the
        // link to the running app (its deep-link plugin emits it there), brings that window up and ends the new process.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![install_update])
        .setup(|_app| {
            // Installers register the leakbudget:// scheme; an AppImage and dev builds register it themselves.
            // A failure only costs Google/GitHub sign-in, so the app still starts.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = _app.deep_link().register_all() {
                    eprintln!("could not register leakbudget:// links: {e}");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

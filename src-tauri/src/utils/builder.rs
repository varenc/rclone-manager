use tauri::{image::Image, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, AppHandle, Emitter, Manager};

use crate::core::tray::{actions::show_main_window, menu::create_tray_menu};

pub async fn setup_tray(
    app: AppHandle,
    max_tray_items: usize,
) -> tauri::Result<()> {
    let mut old_max_tray_items = 0;

    let max_tray_items = if max_tray_items == 0 {
        old_max_tray_items
    } else {
        old_max_tray_items = max_tray_items;
        old_max_tray_items
    };

    let app_clone = app.clone();

    let tray_menu = create_tray_menu(&app_clone, max_tray_items).await?;

    TrayIconBuilder::with_id("main-tray")
        .icon(Image::from_bytes(include_bytes!(
            "../../icons/rclone_symbolic.png"
        ))?)
        .tooltip("RClone Manager")
        .menu(&tray_menu)
        .on_tray_icon_event(move |tray, event| {
            let app = tray.app_handle();

            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    // Show the main window on left click
                    show_main_window(app.clone());
                }
                _ => {}
            }
        })
        .build(&app_clone)?;

    app.emit("tray_menu_updated", ())?;
    Ok(())
}

// Stripped down window creation function with minimal styling and no vibrancy or transparency
pub fn create_app_window(app_handle: AppHandle) {
    println!("Creating window with basic settings for macOS stability");

    // Check if window already exists
    if let Some(window) = app_handle.get_webview_window("main") {
        println!("Window 'main' already exists, focusing and showing it");
        window.set_focus().unwrap_or_else(|e| {
            eprintln!("Failed to focus window: {}", e);
        });
        window.show().unwrap_or_else(|e| {
            eprintln!("Failed to show window: {}", e);
        });
        return;
    }

    // Create a basic window with minimal styling
    let main_window = match tauri::WebviewWindowBuilder::new(
        &app_handle,
        "main",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Rclone Manager")
    .inner_size(800.0, 630.0)
    .resizable(true)
    // No decorations, transparency, or other problematic properties
    .center()
    .min_inner_size(362.0, 240.0)
    .build() {
        Ok(window) => window,
        Err(e) => {
            eprintln!("Failed to create main window: {}", e);
            return;
        }
    };

    println!("Window created successfully, showing window");

    main_window.show().unwrap_or_else(|e| {
        eprintln!("Failed to show main window: {}", e);
    });

    println!("Window showing complete");
}
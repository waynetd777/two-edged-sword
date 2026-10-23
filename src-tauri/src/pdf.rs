// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Export as PDF: the main window's page, with its @media print styles, printed straight to a file
//! (no print panel), as Brainstead does: by WebKit on a Mac, WebView2 on Windows. It prints with no
//! margins: the page (journalDoc.ts) lays out each sheet itself, margins and footer included.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Prints the main window's page to a PDF at `dest` (from the save dialog), waits for it, and opens it.
#[tauri::command]
pub async fn export_pdf(app: AppHandle, dest: String) -> Result<(), String> {
    let dest = PathBuf::from(dest);
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
    }
    let w = app.get_webview_window("main").ok_or("The main window isn't open.")?;
    let d = dest.clone();
    tauri::async_runtime::spawn_blocking(move || print_to_pdf(&w, &d)).await.map_err(|e| e.to_string())??;
    // Done when the file is there and has stopped growing.
    let mut last = None;
    for _ in 0..240 {
        sleep(250).await;
        let size = std::fs::metadata(&dest).ok().map(|m| m.len()).filter(|n| *n > 0);
        if size.is_some() && size == last {
            // Opened in the PDF viewer, to look at straight away.
            let _ = tauri_plugin_opener::open_path(&dest, None::<&str>);
            return Ok(());
        }
        last = size;
    }
    Err("The PDF didn't finish in time.".into())
}

/// The paper a PDF is printed on, in points: the one the user's locale uses (A4, or Letter).
#[tauri::command]
pub fn pdf_paper_size() -> (f64, f64) {
    #[cfg(target_os = "macos")]
    {
        let p = objc2_app_kit::NSPrintInfo::sharedPrintInfo().paperSize();
        (p.width, p.height)
    }
    #[cfg(windows)]
    {
        if win::paper_is_letter() {
            (612.0, 792.0)
        } else {
            (595.28, 841.89)
        }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        (595.28, 841.89)
    }
}

async fn sleep(ms: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await;
}

/// Starts printing the window's page to `dest`. Returns once the printing has started; the file
/// appears when it's done.
fn print_to_pdf(w: &tauri::WebviewWindow, dest: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let dest = dest.to_path_buf();
        let (tx, rx) = std::sync::mpsc::channel();
        w.with_webview(move |wv| {
            // SAFETY: Tauri hands over the live WKWebView, on the main thread.
            let r = unsafe { mac::print_to_pdf(wv.inner() as *mut objc2::runtime::AnyObject, &dest) };
            let _ = tx.send(r);
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(10)).map_err(|_| "Printing didn't start.".to_string())?
    }
    #[cfg(windows)]
    {
        let dest = dest.to_path_buf();
        let (tx, rx) = std::sync::mpsc::channel();
        w.with_webview(move |wv| {
            let _ = tx.send(win::print_to_pdf(&wv, &dest));
        })
        .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(10)).map_err(|_| "Printing didn't start.".to_string())?
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (w, dest);
        Err("Export as PDF isn't available on this system.".into())
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::path::Path;

    /// Prints the page in `webview` (a WKWebView) to a PDF at `dest`, as a sheet on the window and
    /// without the print panel: the synchronous `runOperation` prints blank pages from a WKWebView.
    /// Call on the main thread.
    ///
    /// # Safety
    /// `webview` must be a live WKWebView.
    pub unsafe fn print_to_pdf(webview: *mut objc2::runtime::AnyObject, dest: &Path) -> Result<(), String> {
        use objc2::msg_send;
        use objc2::rc::Retained;
        use objc2::runtime::{AnyObject, Sel};
        use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob, NSPrintingPaginationMode};
        use objc2_foundation::{NSRect, NSString, NSURL};

        let shared = NSPrintInfo::sharedPrintInfo();
        let info: Retained<NSPrintInfo> = msg_send![&*shared, copy];
        info.setJobDisposition(NSPrintSaveJob);
        let url = NSURL::fileURLWithPath(&NSString::from_str(&dest.to_string_lossy()));
        let dict = info.dictionary();
        let _: () = msg_send![&*dict, setObject: &*url, forKey: NSPrintJobSavingURL];
        info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
        info.setVerticallyCentered(false);
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);

        let op: Option<Retained<NSPrintOperation>> = msg_send![webview, printOperationWithPrintInfo: &*info];
        let op = op.ok_or("WebKit couldn't print this page.")?;
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);
        // The operation's view starts with no size, which prints nothing: give it the webview's.
        let bounds: NSRect = msg_send![webview, bounds];
        if let Some(v) = op.view() {
            v.setFrame(bounds);
        }
        let window: *mut AnyObject = msg_send![webview, window];
        if window.is_null() {
            return Err("The window isn't open.".into());
        }
        let none: Option<Sel> = None;
        let _: () = msg_send![
            &*op,
            runOperationModalForWindow: window,
            delegate: std::ptr::null::<AnyObject>(),
            didRunSelector: none,
            contextInfo: std::ptr::null_mut::<std::ffi::c_void>()
        ];
        Ok(())
    }
}

#[cfg(windows)]
mod win {
    use std::path::Path;

    /// WebView2's PrintToPdf, on the main thread: the paper the user's locale uses (A4, or Letter),
    /// no margins and no browser header or footer (the page draws its own), and with backgrounds,
    /// so the cover's band and the verse panels keep their colour.
    pub fn print_to_pdf(wv: &tauri::webview::PlatformWebview, dest: &Path) -> Result<(), String> {
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
        use webview2_com::PrintToPdfCompletedHandler;
        use windows_core::{Interface, HSTRING};
        let old = |_| "This computer's WebView2 is too old to print to PDF: update Microsoft Edge WebView2 Runtime.".to_string();
        // SAFETY: COM calls on the live webview Tauri hands over, on the main thread it lives on.
        unsafe {
            let core = wv.controller().CoreWebView2().map_err(|e| e.to_string())?;
            let core: ICoreWebView2_7 = core.cast().map_err(old)?;
            let env: ICoreWebView2Environment6 = wv.environment().cast().map_err(old)?;
            let s = env.CreatePrintSettings().map_err(|e| e.to_string())?;
            let (pw, ph) = if paper_is_letter() { (8.5, 11.0) } else { (8.27, 11.69) };
            s.SetPageWidth(pw).map_err(|e| e.to_string())?;
            s.SetPageHeight(ph).map_err(|e| e.to_string())?;
            for set in [s.SetMarginTop(0.0), s.SetMarginBottom(0.0), s.SetMarginLeft(0.0), s.SetMarginRight(0.0)] {
                set.map_err(|e| e.to_string())?;
            }
            s.SetShouldPrintHeaderAndFooter(false).map_err(|e| e.to_string())?;
            s.SetShouldPrintBackgrounds(true).map_err(|e| e.to_string())?;
            let done = PrintToPdfCompletedHandler::create(Box::new(|r, ok| {
                if r.is_err() || !ok {
                    eprintln!("export pdf: WebView2's PrintToPdf failed ({r:?})");
                }
                Ok(())
            }));
            core.PrintToPdf(&HSTRING::from(dest.to_string_lossy().as_ref()), &s, &done).map_err(|e| e.to_string())
        }
    }

    /// Whether the user's locale prints on US Letter (LOCALE_IPAPERSIZE 1) rather than A4.
    pub fn paper_is_letter() -> bool {
        use windows_sys::Win32::Globalization::{GetLocaleInfoEx, LOCALE_IPAPERSIZE, LOCALE_RETURN_NUMBER};
        let mut n = [0u16; 2];
        // SAFETY: a null locale name is the user's default; the buffer is two UTF-16 units, the DWORD
        // LOCALE_RETURN_NUMBER writes.
        let got = unsafe { GetLocaleInfoEx(std::ptr::null(), LOCALE_IPAPERSIZE | LOCALE_RETURN_NUMBER, n.as_mut_ptr(), 2) };
        got > 0 && (n[0] as u32 | (n[1] as u32) << 16) == 1
    }
}

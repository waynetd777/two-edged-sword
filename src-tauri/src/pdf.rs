// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! Export as PDF: the main window's page, with its @media print styles, printed straight to a file
//! (no print panel), as Brainstead does. On a Mac WebKit prints it and PDFKit stamps a footer on
//! each page afterwards (WebKit's print has no page counters); on Windows WebView2 prints it and
//! the page's own print style draws the footer.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Prints the main window's page to a PDF at `dest` (from the save dialog), waits for it, and opens it.
/// `footer`: the title put bottom left, with "Page N of M" bottom right (Mac only).
#[tauri::command]
pub async fn export_pdf(app: AppHandle, dest: String, footer: Option<String>) -> Result<(), String> {
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
            if let Some(t) = footer {
                let d = dest.clone();
                tauri::async_runtime::spawn_blocking(move || stamp_footer(&d, &t)).await.map_err(|e| e.to_string())??;
            }
            // Opened in the PDF viewer, to look at straight away.
            let _ = tauri_plugin_opener::open_path(&dest, None::<&str>);
            return Ok(());
        }
        last = size;
    }
    Err("The PDF didn't finish in time.".into())
}

/// The printable area of a page, in points (the paper less the margins `print_to_pdf` sets), for
/// the page to be laid out to.
#[tauri::command]
pub fn pdf_page_size() -> (f64, f64) {
    #[cfg(target_os = "macos")]
    let (w, h) = {
        let p = objc2_app_kit::NSPrintInfo::sharedPrintInfo().paperSize();
        (p.width, p.height)
    };
    #[cfg(windows)]
    let (w, h) = if win::paper_is_letter() { (612.0, 792.0) } else { (595.3, 841.9) };
    #[cfg(not(any(target_os = "macos", windows)))]
    let (w, h) = (595.3, 841.9);
    (w - 2.0 * MARGIN_SIDE, h - 2.0 * MARGIN_TOP)
}

/// The margins, in points: half an inch all round, with the footer in the bottom one.
const MARGIN_SIDE: f64 = 36.0;
const MARGIN_TOP: f64 = 36.0;

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

fn stamp_footer(path: &Path, title: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return mac::stamp_footer(path, title);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, title);
        Ok(())
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
        info.setTopMargin(super::MARGIN_TOP);
        info.setBottomMargin(super::MARGIN_TOP);
        info.setLeftMargin(super::MARGIN_SIDE);
        info.setRightMargin(super::MARGIN_SIDE);

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

    #[link(name = "PDFKit", kind = "framework")]
    unsafe extern "C" {
        static PDFAnnotationSubtypeFreeText: &'static objc2_foundation::NSString;
        static PDFDocumentBurnInAnnotationsOption: &'static objc2_foundation::NSString;
    }

    /// The title bottom left and "Page N of M" bottom right of every page, 8pt grey, burnt in.
    pub fn stamp_footer(path: &Path, title: &str) -> Result<(), String> {
        use objc2::msg_send;
        use objc2::rc::Retained;
        use objc2::runtime::{AnyClass, AnyObject};
        use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURL};

        let title: String =
            if title.chars().count() > 90 { format!("{}…", title.chars().take(89).collect::<String>()) } else { title.into() };
        objc2::rc::autoreleasepool(|_| unsafe {
            let cls = |n: &str| AnyClass::get(&std::ffi::CString::new(n).unwrap()).ok_or(format!("{n} isn't available."));
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
            let doc: Option<Retained<AnyObject>> = msg_send![msg_send![cls("PDFDocument")?, alloc], initWithURL: &*url];
            let doc = doc.ok_or("Couldn't open the exported PDF.")?;
            let n: usize = msg_send![&*doc, pageCount];
            let font: Option<Retained<AnyObject>> =
                msg_send![cls("NSFont")?, fontWithName: &*NSString::from_str("Avenir Next"), size: 8.0f64];
            let font = match font {
                Some(f) => f,
                None => msg_send![cls("NSFont")?, systemFontOfSize: 8.0f64],
            };
            let grey = objc2_app_kit::NSColor::colorWithSRGBRed_green_blue_alpha(
                0x8f as f64 / 255.0,
                0x86 as f64 / 255.0,
                0x78 as f64 / 255.0,
                1.0,
            );
            let clear = objc2_app_kit::NSColor::clearColor();
            let border: Retained<AnyObject> = msg_send![msg_send![cls("PDFBorder")?, alloc], init];
            let _: () = msg_send![&*border, setLineWidth: 0.0f64];
            for i in 0..n {
                let page: Option<Retained<AnyObject>> = msg_send![&*doc, pageAtIndex: i];
                let Some(page) = page else { continue };
                let b: NSRect = msg_send![&*page, boundsForBox: 0isize];
                let (x0, w) = (b.origin.x + super::MARGIN_SIDE, b.size.width - 2.0 * super::MARGIN_SIDE);
                // A free-text annotation pads its text, so the box is well over the 8pt line, or the
                // letters' tails are cut off.
                let y = b.origin.y + 8.0;
                for (text, right) in [(title.clone(), false), (format!("Page {} of {}", i + 1, n), true)] {
                    let rect = NSRect::new(NSPoint::new(x0, y), NSSize::new(w, 20.0));
                    let a: Retained<AnyObject> = msg_send![
                        msg_send![cls("PDFAnnotation")?, alloc],
                        initWithBounds: rect,
                        forType: PDFAnnotationSubtypeFreeText,
                        withProperties: std::ptr::null::<AnyObject>()
                    ];
                    let _: () = msg_send![&*a, setContents: &*NSString::from_str(&text)];
                    let _: () = msg_send![&*a, setFont: &*font];
                    let _: () = msg_send![&*a, setFontColor: &*grey];
                    let _: () = msg_send![&*a, setColor: &*clear];
                    let _: () = msg_send![&*a, setBorder: &*border];
                    let align = if right { objc2_app_kit::NSTextAlignment::Right } else { objc2_app_kit::NSTextAlignment::Left };
                    let _: () = msg_send![&*a, setAlignment: align];
                    let _: () = msg_send![&*page, addAnnotation: &*a];
                }
            }
            let yes = objc2_foundation::NSNumber::new_bool(true);
            let opts: Retained<AnyObject> =
                msg_send![cls("NSDictionary")?, dictionaryWithObject: &*yes, forKey: PDFDocumentBurnInAnnotationsOption];
            let ok: bool = msg_send![&*doc, writeToURL: &*url, withOptions: &*opts];
            if ok {
                Ok(())
            } else {
                Err("Couldn't add the page footer to the PDF.".into())
            }
        })
    }
}

#[cfg(windows)]
mod win {
    use std::path::Path;

    /// WebView2's PrintToPdf, on the main thread: the paper the user's locale uses (A4, or Letter),
    /// the Mac's margins, no browser header or footer (the page's print style draws its own) and
    /// with backgrounds, so the verse panels keep their tint.
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
            let (top, side) = (super::MARGIN_TOP / 72.0, super::MARGIN_SIDE / 72.0);
            for set in [s.SetMarginTop(top), s.SetMarginBottom(top), s.SetMarginLeft(side), s.SetMarginRight(side)] {
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

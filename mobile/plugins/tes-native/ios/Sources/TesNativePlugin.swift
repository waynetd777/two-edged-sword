// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import ObjectiveC
import SwiftRs
import Tauri
import UIKit
import WebKit

class RotationArgs: Decodable {
  let allow: Bool
}

/// The orientations the app allows now: upright, but any way while a picture is open. Info.ios.plist lists
/// every orientation for the iPhone; the web view's view controller narrows them to these.
private var allowed: UIInterfaceOrientationMask = .portrait
private var hooked = Set<ObjectIdentifier>()

class TesNativePlugin: Plugin {
  private weak var webview: WKWebView?

  public override func load(webview: WKWebView) {
    super.load(webview: webview)
    self.webview = webview
    DispatchQueue.main.async { self.hookViewController() }
  }

  /// The view controller showing the web view (Tauri's) is asked which ways it may turn, every time iOS
  /// wonders. Give its class its own answer. (The app delegate's method, as the pager app adds its push
  /// callbacks, doesn't work here: iOS only looks for that one on the delegate at launch.)
  private func hookViewController() {
    guard let vc = webview?.window?.rootViewController else {
      NSLog("tes-native: no view controller yet")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.hookViewController() }
      return
    }
    let cls: AnyClass = type(of: vc)
    if !hooked.contains(ObjectIdentifier(cls)) {
      hooked.insert(ObjectIdentifier(cls))
      let sel = #selector(getter: UIViewController.supportedInterfaceOrientations)
      let block: @convention(block) (AnyObject) -> UInt = { _ in
        // An iPad turns freely, as before.
        return UIDevice.current.userInterfaceIdiom == .pad ? UIInterfaceOrientationMask.all.rawValue : allowed.rawValue
      }
      let imp = imp_implementationWithBlock(block)
      // Added to this class only, so UIViewController itself (and so every other screen) is untouched;
      // replaced if the class already has its own.
      if !class_addMethod(cls, sel, imp, "Q@:"), let m = class_getInstanceMethod(cls, sel) {
        method_setImplementation(m, imp)
      }
      NSLog("tes-native: orientations answered by %@", NSStringFromClass(cls))
    }
    refresh(turnUpright: true)
  }

  @objc public func allowRotation(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(RotationArgs.self)
    DispatchQueue.main.async {
      allowed = args.allow ? .allButUpsideDown : .portrait
      self.refresh(turnUpright: !args.allow)
      invoke.resolve()
    }
  }

  /// Tells iOS the allowed orientations changed, and turns the app upright when they shrink to portrait.
  private func refresh(turnUpright: Bool) {
    guard UIDevice.current.userInterfaceIdiom != .pad, #available(iOS 16.0, *) else { return }
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for w in scene.windows { w.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations() }
      if turnUpright {
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { _ in }
      }
    }
  }
}

@_cdecl("init_plugin_tes_native")
public func initPlugin() -> Plugin {
  return TesNativePlugin()
}

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
/// every orientation for the iPhone, so iOS asks the app delegate, which answers from this.
private var allowed: UIInterfaceOrientationMask = .portrait

class TesNativePlugin: Plugin {
  public override func load(webview: WKWebView) {
    super.load(webview: webview)
    hookAppDelegate()
  }

  /// Tauri owns the app delegate, so add the method iOS asks for the allowed orientations (as the pager
  /// app adds its push callbacks).
  private func hookAppDelegate() {
    guard let delegate = UIApplication.shared.delegate else { return }
    let cls: AnyClass = type(of: delegate)
    let sel = #selector(UIApplicationDelegate.application(_:supportedInterfaceOrientationsFor:))
    let block: @convention(block) (AnyObject, UIApplication, UIWindow?) -> UInt = { _, _, _ in
      // An iPad turns freely, as before.
      UIDevice.current.userInterfaceIdiom == .pad ? UIInterfaceOrientationMask.all.rawValue : allowed.rawValue
    }
    let imp = imp_implementationWithBlock(block)
    if let m = class_getInstanceMethod(cls, sel) {
      method_setImplementation(m, imp)
    } else {
      class_addMethod(cls, sel, imp, "Q@:@@")
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

// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import AVFoundation
import MediaPlayer
import Network
import ObjectiveC
import SwiftRs
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

class RotationArgs: Decodable {
  let allow: Bool
}

class SayArgs: Decodable {
  let word: String
  let lang: String
  let pron: String
}

class SpeakItem: Decodable {
  let id: Int
  let text: String
}

class SpeakArgs: Decodable {
  let items: [SpeakItem]
  /// 1 is iOS's normal pace.
  let rate: Double
  let title: String
  let voice: String?
}

/// The orientations the app allows now: upright, but any way while a picture is open. Info.ios.plist lists
/// every orientation for the iPhone; the web view's view controller narrows them to these.
private var allowed: UIInterfaceOrientationMask = .portrait
private var hooked = Set<ObjectIdentifier>()

/// The Files picker's answer, passed on: the picker's delegate has to be an object of its own (as Tauri's
/// dialog plugin has it); with the plugin itself as its delegate, iOS never called it.
class PickerDelegate: NSObject, UIDocumentPickerDelegate {
  var done: ([URL]) -> Void = { _ in }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls) }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done([]) }
}

/// Bonjour: the computers with the desktop app open (`_tes-sync._tcp`), browsed for a few seconds and each
/// resolved to an address. iOS asks once to let the app find devices on the local network.
struct FoundComputer: Encodable {
  let name: String
  let host: String
  let port: Int
}

/// Bonjour: the computers with the desktop app open (`_tes-sync._tcp`), browsed for a few seconds with
/// Network's NWBrowser, each then connected to once to learn its address. iOS asks once to let the app find
/// devices on the local network.
class SyncFinder {
  private var browser: NWBrowser?
  private var conns: [NWConnection] = []
  private var found: [FoundComputer] = []
  private let q = DispatchQueue(label: "tes.syncfinder")

  func find(_ cb: @escaping ([FoundComputer]) -> Void) {
    q.async {
      self.found = []
      self.conns = []
      let b = NWBrowser(for: .bonjour(type: "_tes-sync._tcp", domain: "local."), using: .tcp)
      self.browser = b
      b.stateUpdateHandler = { st in
        if case .failed(let e) = st { NSLog("tes-native: Bonjour browse failed: %@", "\(e)") }
        if case .waiting(let e) = st { NSLog("tes-native: Bonjour browse waiting: %@", "\(e)") }
      }
      b.browseResultsChangedHandler = { results, _ in
        for r in results {
          guard case .service(let name, _, _, _) = r.endpoint else { continue }
          if self.conns.contains(where: { $0.endpoint == r.endpoint }) { continue }
          NSLog("tes-native: Bonjour found %@", name)
          // Connected to once, to learn the address it resolves to; then closed.
          let c = NWConnection(to: r.endpoint, using: .tcp)
          self.conns.append(c)
          c.stateUpdateHandler = { cs in
            if case .ready = cs {
              if case .hostPort(let host, let port)? = c.currentPath?.remoteEndpoint {
                var h = "\(host)"
                if let pct = h.firstIndex(of: "%") { h = String(h[..<pct]) }
                self.found.removeAll { $0.name == name }
                self.found.append(FoundComputer(name: name, host: h, port: Int(port.rawValue)))
              }
              c.cancel()
            } else if case .failed = cs {
              c.cancel()
            }
          }
          c.start(queue: self.q)
        }
      }
      b.start(queue: self.q)
      self.q.asyncAfter(deadline: .now() + 4) {
        b.cancel()
        self.conns.forEach { $0.cancel() }
        cb(self.found)
      }
    }
  }
}

class TesNativePlugin: Plugin, AVSpeechSynthesizerDelegate {
  private weak var webview: WKWebView?
  private let synth = AVSpeechSynthesizer()
  /// A word said on its own (the word sheet's speaker), apart from Listen's reading.
  private let wordSynth = AVSpeechSynthesizer()
  /// The app's id (a verse) for each utterance queued, and the last one's, to say when all are read.
  private var ids: [ObjectIdentifier: Int] = [:]
  private var lastId: Int?
  private var remoteReady = false

  public override func load(webview: WKWebView) {
    super.load(webview: webview)
    self.webview = webview
    synth.delegate = self
    wordSynth.delegate = self
    DispatchQueue.main.async { self.hookViewController() }
  }

  // ---------- reading aloud ----------

  /// The best English voice the phone has: premium, then enhanced, then the default; the person's own
  /// English (en-GB, en-ZA…) before others.
  private func voice() -> AVSpeechSynthesisVoice? {
    let mine = AVSpeechSynthesisVoice.currentLanguageCode()
    let en = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
    func rank(_ v: AVSpeechSynthesisVoice) -> Int {
      let q: Int
      switch v.quality {
      case .premium: q = 3
      case .enhanced: q = 2
      default: q = 1
      }
      return q * 2 + (v.language == mine ? 1 : 0)
    }
    return en.max { rank($0) < rank($1) } ?? AVSpeechSynthesisVoice(language: "en-US")
  }

  @objc public func speak(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SpeakArgs.self)
    DispatchQueue.main.async {
      // Playback, spoken audio: it carries on with the screen locked (UIBackgroundModes audio) and other
      // audio ducks or pauses for it.
      try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
      try? AVAudioSession.sharedInstance().setActive(true)
      self.ids = [:]
      self.synth.stopSpeaking(at: .immediate)
      let v = args.voice.flatMap { AVSpeechSynthesisVoice(identifier: $0) } ?? self.voice()
      let rate = Float(max(0.5, min(2.0, args.rate))) * AVSpeechUtteranceDefaultSpeechRate
      for item in args.items {
        let u = AVSpeechUtterance(string: item.text)
        u.voice = v
        u.rate = max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, rate))
        u.postUtteranceDelay = 0.15
        self.ids[ObjectIdentifier(u)] = item.id
        self.synth.speak(u)
      }
      self.lastId = args.items.last?.id
      self.nowPlaying(args.title, playing: true)
      invoke.resolve()
    }
  }

  /// In a Hebrew or Greek voice when the phone has one, otherwise the pronunciation in an English voice, as
  /// the desktop's SayButton does.
  @objc public func say(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SayArgs.self)
    DispatchQueue.main.async {
      try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
      self.wordSynth.stopSpeaking(at: .immediate)
      let v = AVSpeechSynthesisVoice.speechVoices().first { $0.language.hasPrefix(args.lang) }
      let u = AVSpeechUtterance(string: v != nil ? args.word : args.pron.replacingOccurrences(of: "[-'ʼ]", with: " ", options: .regularExpression))
      u.voice = v ?? self.voice()
      u.rate = AVSpeechUtteranceDefaultSpeechRate * (v != nil ? 0.8 : 0.9)
      self.wordSynth.speak(u)
      invoke.resolve()
    }
  }

  private let tapper = UIImpactFeedbackGenerator(style: .light)

  /// A light tap felt in the hand, for a button or a word tapped.
  /// The Library's Add from Files: the Files picker, for modules only, more than one at a time. What's
  /// chosen is copied to tmp/tes-picked-Inbox, where the app takes it in (lib.rs import_waiting); the call
  /// answers with how many were copied (0 if the picker was closed).
  private let pickerDelegate = PickerDelegate()
  private let finder = SyncFinder()

  @objc public func discover(_ invoke: Invoke) {
    finder.find { found in invoke.resolve(found) }
  }

  @objc public func pickModules(_ invoke: Invoke) {
    DispatchQueue.main.async {
      let types = ["bbli", "cmti", "dcti", "lexi", "refi", "devi"].compactMap { UTType(filenameExtension: $0, conformingTo: .data) }
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
      picker.allowsMultipleSelection = true
      guard let vc = self.manager.viewController else { return invoke.reject("no window") }
      // Off the main thread: a move is instant, but a copy of a large module isn't.
      self.pickerDelegate.done = { urls in DispatchQueue.global(qos: .userInitiated).async {
        let fm = FileManager.default
        // A folder of the app's own: iOS keeps Documents/Inbox to itself (an app may only read and delete there).
        // lib.rs import_waiting looks in every tmp/*-Inbox.
        let inbox = fm.temporaryDirectory.appendingPathComponent("tes-picked-Inbox")
        try? fm.createDirectory(at: inbox, withIntermediateDirectories: true)
        var n = 0
        for url in urls {
          let to = inbox.appendingPathComponent(url.lastPathComponent)
          try? fm.removeItem(at: to)
          // A move is whole at once; a copy goes out of sight first and is moved in whole, as the app may look
          // in the Inbox meanwhile.
          if (try? fm.moveItem(at: url, to: to)) != nil { n += 1; continue }
          let part = fm.temporaryDirectory.appendingPathComponent("tes-picked-part")
          try? fm.createDirectory(at: part, withIntermediateDirectories: true)
          let p = part.appendingPathComponent(url.lastPathComponent)
          try? fm.removeItem(at: p)
          if (try? fm.copyItem(at: url, to: p)) != nil, (try? fm.moveItem(at: p, to: to)) != nil { n += 1 }
        }
        invoke.resolve(["count": n])
      } }
      picker.delegate = self.pickerDelegate
      vc.present(picker, animated: true)
    }
  }

  @objc public func tap(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.tapper.impactOccurred()
      self.tapper.prepare()
      invoke.resolve()
    }
  }

  /// The English voices installed, best first, for choosing one in Settings.
  @objc public func voices(_ invoke: Invoke) {
    let q: (AVSpeechSynthesisVoice) -> String = {
      switch $0.quality {
      case .premium: return "premium"
      case .enhanced: return "enhanced"
      default: return "default"
      }
    }
    let order = ["premium": 0, "enhanced": 1, "default": 2]
    let list = AVSpeechSynthesisVoice.speechVoices()
      .filter { v in
        // Novelty voices (Bells, Bubbles…) aren't for reading Scripture.
        if #available(iOS 17.0, *), v.voiceTraits.contains(.isNoveltyVoice) { return false }
        return v.language.hasPrefix("en")
      }
      .sorted { (order[q($0)]!, $0.name) < (order[q($1)]!, $1.name) }
      .map { ["id": $0.identifier, "name": $0.name, "language": $0.language, "quality": q($0)] }
    invoke.resolve(["voices": list])
  }

  @objc public func speechPause(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.synth.pauseSpeaking(at: .word)
      self.nowPlaying(nil, playing: false)
      invoke.resolve()
    }
  }

  @objc public func speechResume(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.synth.continueSpeaking()
      self.nowPlaying(nil, playing: true)
      invoke.resolve()
    }
  }

  @objc public func speechStop(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.ids = [:]
      self.synth.stopSpeaking(at: .immediate)
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      invoke.resolve()
    }
  }

  /// The lock screen's title, and its play and pause buttons.
  private func nowPlaying(_ title: String?, playing: Bool) {
    let c = MPNowPlayingInfoCenter.default()
    var info = c.nowPlayingInfo ?? [:]
    if let title = title {
      info[MPMediaItemPropertyTitle] = title
      info[MPMediaItemPropertyArtist] = "Two-edged Sword"
    }
    info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
    c.nowPlayingInfo = info
    if remoteReady { return }
    remoteReady = true
    let rc = MPRemoteCommandCenter.shared()
    rc.playCommand.addTarget { [weak self] _ in
      self?.synth.continueSpeaking()
      self?.nowPlaying(nil, playing: true)
      self?.trigger("speech", data: ["kind": "resumed"])
      return .success
    }
    rc.pauseCommand.addTarget { [weak self] _ in
      self?.synth.pauseSpeaking(at: .word)
      self?.nowPlaying(nil, playing: false)
      self?.trigger("speech", data: ["kind": "paused"])
      return .success
    }
    rc.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self = self else { return .commandFailed }
      if self.synth.isPaused {
        self.synth.continueSpeaking()
        self.trigger("speech", data: ["kind": "resumed"])
      } else {
        self.synth.pauseSpeaking(at: .word)
        self.trigger("speech", data: ["kind": "paused"])
      }
      self.nowPlaying(nil, playing: !self.synth.isPaused)
      return .success
    }
  }

  func speechSynthesizer(_ s: AVSpeechSynthesizer, willSpeakRangeOfSpeechString r: NSRange, utterance u: AVSpeechUtterance) {
    if s === wordSynth { return }
    guard let id = ids[ObjectIdentifier(u)] else { return }
    trigger("speech", data: ["kind": "word", "id": id, "at": r.location, "len": r.length])
  }

  func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) {
    if s === wordSynth { return trigger("say", data: ["kind": "start"]) }
    guard let id = ids[ObjectIdentifier(u)] else { return }
    trigger("speech", data: ["kind": "start", "id": id])
  }

  func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
    if s === wordSynth { trigger("say", data: ["kind": "done"]) }
  }

  func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
    if s === wordSynth { return trigger("say", data: ["kind": "done"]) }
    guard let id = ids.removeValue(forKey: ObjectIdentifier(u)) else { return }
    trigger("speech", data: ["kind": id == lastId && ids.isEmpty ? "end" : "done", "id": id])
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

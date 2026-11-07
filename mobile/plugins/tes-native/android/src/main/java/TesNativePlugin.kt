// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

package com.wayned.tes.plugin

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.net.Uri
import android.provider.OpenableColumns
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.Locale

@InvokeArg
class RotationArgs {
  var allow: Boolean = false
}

@InvokeArg
class SayArgs {
  var word: String = ""
  var lang: String = ""
  var pron: String = ""
}

@InvokeArg
class SpeakItem {
  var id: Int = 0
  var text: String = ""
}

@InvokeArg
class SpeakArgs {
  var items: Array<SpeakItem> = arrayOf()
  /** 1 is the engine's normal pace. */
  var rate: Double = 1.0
  var title: String = ""
  var voice: String? = null
}

/**
 * The Android side of plugins/tes-native, matching the iOS one: the phone stays upright except while a picture
 * is open (allowRotation), reading aloud with Android's own text-to-speech (speak and the rest, with "speech"
 * events for each word), and the system bars' sizes for the page, which Android's web view reports as 0.
 */
@TauriPlugin
class TesNativePlugin(private val activity: Activity) : Plugin(activity) {
  /** The status and gesture bars' heights in CSS pixels (pager-system's lesson). */
  private class Insets {
    @Volatile var top = 0.0
    @Volatile var bottom = 0.0

    @JavascriptInterface fun top(): Double = top

    @JavascriptInterface fun bottom(): Double = bottom
  }

  private val insets = Insets()
  private val tablet get() = activity.resources.configuration.smallestScreenWidthDp >= 600

  private var view: WebView? = null

  /** A light tap felt in the hand, for a button or a word tapped: Android's own key-press feedback. */
  @Command
  fun tap(invoke: Invoke) {
    view?.let { v -> v.post { v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) } }
    invoke.resolve()
  }

  override fun load(webView: WebView) {
    view = webView
    webView.addJavascriptInterface(insets, "TesInsets")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, wi ->
      val bars = wi.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = activity.resources.displayMetrics.density
      insets.top = bars.top / density.toDouble()
      insets.bottom = bars.bottom / density.toDouble()
      webView.evaluateJavascript("window.dispatchEvent(new Event('tes-insets'))", null)
      wi
    }
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    upright(true)
    Thread { unpackModules(webView) }.start()
    takeIn(activity.intent)
    // The word engine started now, so the first tap on a speaker isn't kept waiting for it.
    wordEngine {}
  }

  /** Where the bundled modules were copied to, once they have been. */
  @Volatile private var bundled: String? = null

  /** The modules shipped in the APK's assets, copied to the app's own files (SQLite can't open an asset),
   *  again only after the app is updated; then the page is told, and reads its library again. */
  private fun unpackModules(webView: WebView) {
    val root = File(activity.filesDir, "bundled")
    val dst = File(root, "modules")
    val stamp = File(root, ".stamp")
    val version = activity.packageManager.getPackageInfo(activity.packageName, 0).lastUpdateTime.toString()
    try {
      if (!(stamp.exists() && stamp.readText() == version && dst.isDirectory)) {
        dst.deleteRecursively()
        dst.mkdirs()
        for (name in activity.assets.list("modules") ?: arrayOf()) {
          activity.assets.open("modules/$name").use { i -> File(dst, name).outputStream().use { o -> i.copyTo(o) } }
        }
        stamp.writeText(version)
      }
      bundled = root.absolutePath
      webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('tes-bundled'))", null) }
    } catch (_: Exception) {}
  }

  /** Where a module opened in the app waits to be taken into the library (lib.rs import_waiting). */
  private val inbox get() = File(activity.filesDir, "Inbox")

  override fun onNewIntent(intent: Intent) {
    takeIn(intent)
  }

  /** A file opened in the app (Files, Quick Share) or shared to it: copied to the Inbox under its own name,
   *  then the page is told. Only names ending in a module's extension are kept. */
  private fun takeIn(intent: Intent?) {
    if (intent == null) return
    val uris = mutableListOf<Uri>()
    when (intent.action) {
      Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
      Intent.ACTION_SEND -> intentStream(intent)?.let { uris.add(it) }
      Intent.ACTION_SEND_MULTIPLE -> uris.addAll(intentStreams(intent))
    }
    if (uris.isEmpty()) return
    // Taken once: not again if the activity is made afresh with the same intent.
    activity.intent = Intent(Intent.ACTION_MAIN)
    Thread {
      copyIn(uris)
      view?.post { view?.evaluateJavascript("window.dispatchEvent(new Event('tes-inbox'))", null) }
    }.start()
  }

  /** Copies each file to the Inbox under its own name, if it's named as a module; says how many were. */
  private fun copyIn(uris: List<Uri>): Int {
    inbox.mkdirs()
    var n = 0
    for (uri in uris) {
      try {
        val name = displayName(uri)?.substringAfterLast('/') ?: continue
        if (!Regex("""(?i).+\.(bbli|cmti|dcti|lexi|refi|devi)""").matches(name)) continue
        // Copied out of sight first and moved in whole: the app may look in the Inbox (coming forward as
        // the picker closes) while a large module is still being copied.
        val part = File(activity.filesDir, "Inbox.part").apply { mkdirs() }.let { File(it, name) }
        activity.contentResolver.openInputStream(uri)?.use { i -> part.outputStream().use { o -> i.copyTo(o) } } ?: continue
        if (part.renameTo(File(inbox, name))) n++
      } catch (_: Exception) {}
    }
    return n
  }

  /** The Library's Add from Files: Android's file picker, more than one at a time (any file: Android
   *  doesn't know the module types). What's chosen is copied to the Inbox; answers with how many were. */
  @Command
  fun pickModules(invoke: Invoke) {
    val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    startActivityForResult(invoke, i, "modulesPicked")
  }

  @ActivityCallback
  fun modulesPicked(invoke: Invoke, result: ActivityResult) {
    val data = result.data
    val uris = mutableListOf<Uri>()
    if (result.resultCode == Activity.RESULT_OK && data != null) {
      data.clipData?.let { c -> for (k in 0 until c.itemCount) uris.add(c.getItemAt(k).uri) } ?: data.data?.let { uris.add(it) }
    }
    Thread {
      val r = JSObject()
      r.put("count", copyIn(uris))
      invoke.resolve(r)
    }.start()
  }

  @Suppress("DEPRECATION")
  private fun intentStream(intent: Intent): Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun intentStreams(intent: Intent): List<Uri> = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()

  private fun displayName(uri: Uri): String? {
    if (uri.scheme == "file") return uri.lastPathSegment
    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) return c.getString(0)
    }
    return uri.lastPathSegment
  }

  /** Computers with the desktop app open on this Wi-Fi (`_tes-sync._tcp`), found over Bonjour for three
   *  seconds, then each resolved in turn (older Androids resolve one at a time): name, address, port. */
  @Command
  fun discover(invoke: Invoke) {
    val nsd = activity.getSystemService(Context.NSD_SERVICE) as NsdManager
    val seen = mutableListOf<NsdServiceInfo>()
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(t: String) {}
      override fun onDiscoveryStopped(t: String) {}
      override fun onStartDiscoveryFailed(t: String, code: Int) {}
      override fun onStopDiscoveryFailed(t: String, code: Int) {}
      override fun onServiceFound(s: NsdServiceInfo) {
        synchronized(seen) { if (seen.none { it.serviceName == s.serviceName }) seen.add(s) }
      }
      override fun onServiceLost(s: NsdServiceInfo) {}
    }
    try {
      nsd.discoverServices("_tes-sync._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (_: Exception) {
      invoke.resolve(JSObject().apply { put("list", JSArray()) })
      return
    }
    Handler(Looper.getMainLooper()).postDelayed({
      try { nsd.stopServiceDiscovery(listener) } catch (_: Exception) {}
      val todo = synchronized(seen) { seen.toMutableList() }
      val out = JSArray()
      fun next() {
        val s = todo.removeFirstOrNull()
        if (s == null) {
          invoke.resolve(JSObject().apply { put("list", out) })
          return
        }
        @Suppress("DEPRECATION")
        nsd.resolveService(s, object : NsdManager.ResolveListener {
          override fun onResolveFailed(i: NsdServiceInfo, code: Int) { next() }
          override fun onServiceResolved(i: NsdServiceInfo) {
            // An IPv4 address if there is one: an IPv6 link-local one (fe80::) can't be connected to
            // without its interface, and a connect to it fails ("invalid argument").
            @Suppress("DEPRECATION")
            val all: List<java.net.InetAddress> =
              if (android.os.Build.VERSION.SDK_INT >= 34) i.hostAddresses else listOfNotNull(i.host)
            // The computer announces every address it has, its loopback (127.0.0.1) among them, which
            // here would be the phone itself: a home-network one (192.168…, 10…) first.
            val usable = all.filter { !it.isLoopbackAddress && !it.isLinkLocalAddress && !it.isAnyLocalAddress }
            val pick = usable.firstOrNull { it is java.net.Inet4Address && it.isSiteLocalAddress }
              ?: usable.firstOrNull { it is java.net.Inet4Address }
              ?: usable.firstOrNull()
            val host = pick?.hostAddress
            if (host != null) out.put(JSObject().apply { put("name", i.serviceName); put("host", host.substringBefore('%')); put("port", i.port) })
            next()
          }
        })
      }
      next()
    }, 3000)
  }

  @Command
  fun inboxDir(invoke: Invoke) {
    val r = JSObject()
    r.put("dir", inbox.absolutePath)
    invoke.resolve(r)
  }

  @Command
  fun bundledDir(invoke: Invoke) {
    val r = JSObject()
    bundled?.let { r.put("dir", it) }
    invoke.resolve(r)
  }

  /** A phone stays upright; a tablet turns freely. */
  private fun upright(on: Boolean) {
    activity.runOnUiThread {
      activity.requestedOrientation =
        if (tablet || !on) ActivityInfo.SCREEN_ORIENTATION_FULL_USER else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
  }

  @Command
  fun allowRotation(invoke: Invoke) {
    val args = invoke.parseArgs(RotationArgs::class.java)
    upright(!args.allow)
    invoke.resolve()
  }

  // ---------- reading aloud ----------

  private var tts: TextToSpeech? = null
  private var ready = false
  /** What's being read, so pause can stop and resume can start again from the verse it was on. */
  private var queue: List<SpeakItem> = listOf()
  private var at = 0
  private var rate = 1.0
  private var voiceName: String? = null

  /** The engine, started once; `then` runs when it's ready. */
  private fun engine(then: (TextToSpeech?) -> Unit) {
    tts?.let { if (ready) return then(it) }
    var made: TextToSpeech? = null
    made = TextToSpeech(activity) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (ready) made?.setOnUtteranceProgressListener(progress)
      then(if (ready) made else null)
    }
    tts = made
  }

  private fun event(kind: String, id: Int? = null, at: Int? = null, len: Int? = null) {
    val o = JSObject()
    o.put("kind", kind)
    id?.let { o.put("id", it) }
    at?.let { o.put("at", it) }
    len?.let { o.put("len", it) }
    trigger("speech", o)
  }

  private val progress =
    object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String) {
        val id = utteranceId.toIntOrNull() ?: return
        at = queue.indexOfFirst { it.id == id }.coerceAtLeast(0)
        event("start", id)
      }

      override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) {
        val id = utteranceId.toIntOrNull() ?: return
        event("word", id, start, end - start)
      }

      override fun onDone(utteranceId: String) {
        val id = utteranceId.toIntOrNull() ?: return
        event(if (id == queue.lastOrNull()?.id) "end" else "done", id)
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String) {}
    }

  /** The voice chosen, or the best English one installed that doesn't need the network. */
  private fun voiceFor(t: TextToSpeech): Voice? {
    val all = t.voices?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired } ?: return null
    voiceName?.let { n -> all.firstOrNull { it.name == n }?.let { return it } }
    val mine = Locale.getDefault()
    return all.maxByOrNull { it.quality * 2 + if (it.locale.country == mine.country) 1 else 0 }
  }

  private fun speakFrom(i: Int) {
    engine { t ->
      if (t == null) return@engine
      t.stop()
      voiceFor(t)?.let { t.voice = it }
      t.setSpeechRate(rate.toFloat())
      for (k in i until queue.size) {
        val item = queue[k]
        t.speak(item.text, TextToSpeech.QUEUE_ADD, Bundle(), item.id.toString())
      }
    }
  }

  @Command
  fun speak(invoke: Invoke) {
    val args = invoke.parseArgs(SpeakArgs::class.java)
    queue = args.items.toList()
    rate = args.rate
    voiceName = args.voice
    at = 0
    speakFrom(0)
    invoke.resolve()
  }

  /** Android's engine can't pause in a sentence: it stops, and resume starts that verse again. */
  @Command
  fun speechPause(invoke: Invoke) {
    tts?.stop()
    invoke.resolve()
  }

  @Command
  fun speechResume(invoke: Invoke) {
    speakFrom(at)
    invoke.resolve()
  }

  @Command
  fun speechStop(invoke: Invoke) {
    queue = listOf()
    tts?.stop()
    invoke.resolve()
  }

  @Command
  fun voices(invoke: Invoke) {
    engine { t ->
      val list = JSArray()
      t?.voices
        ?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired }
        ?.sortedWith(compareByDescending<Voice> { it.quality }.thenBy { it.locale.toLanguageTag() })
        ?.forEach {
          val o = JSObject()
          o.put("id", it.name)
          o.put("name", "${it.locale.displayCountry.ifEmpty { "English" }} (${it.name.substringAfterLast('-').take(8)})")
          o.put("language", it.locale.toLanguageTag())
          o.put("quality", if (it.quality >= Voice.QUALITY_VERY_HIGH) "premium" else if (it.quality >= Voice.QUALITY_HIGH) "enhanced" else "default")
          list.put(o)
        }
      val r = JSObject()
      r.put("voices", list)
      invoke.resolve(r)
    }
  }

  /** A word said on its own (the word sheet's speaker), apart from Listen's reading. */
  private var wordTts: TextToSpeech? = null
  private var wordReady = false

  /** In a Hebrew or Greek voice when the phone has one, otherwise the pronunciation in an English voice,
   *  as the desktop's SayButton does. */
  @Command
  fun say(invoke: Invoke) {
    val args = invoke.parseArgs(SayArgs::class.java)
    val go: (TextToSpeech) -> Unit = { t ->
      val lang = Locale(if (args.lang == "he") "iw" else args.lang)
      val has = t.isLanguageAvailable(lang) >= TextToSpeech.LANG_AVAILABLE
      t.language = if (has) lang else Locale.ENGLISH
      t.setSpeechRate(if (has) 0.8f else 0.9f)
      t.speak(if (has) args.word else args.pron.replace(Regex("[-'ʼ]"), " "), TextToSpeech.QUEUE_FLUSH, Bundle(), "word")
    }
    wordEngine { it?.let(go) }
    invoke.resolve()
  }

  /** The word engine, started once, telling the page when a word starts and is done. */
  private fun wordEngine(then: (TextToSpeech?) -> Unit) {
    wordTts?.let { if (wordReady) return then(it) }
    var made: TextToSpeech? = null
    made = TextToSpeech(activity) { status ->
      wordReady = status == TextToSpeech.SUCCESS
      made?.setOnUtteranceProgressListener(
        object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String) = sayEvent("start")

          override fun onDone(utteranceId: String) = sayEvent("done")

          override fun onStop(utteranceId: String, interrupted: Boolean) = sayEvent("done")

          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String) = sayEvent("done")
        }
      )
      then(if (wordReady) made else null)
    }
    wordTts = made
  }

  private fun sayEvent(kind: String) {
    val o = JSObject()
    o.put("kind", kind)
    trigger("say", o)
  }

  override fun onDestroy() {
    tts?.shutdown()
    tts = null
    wordTts?.shutdown()
    wordTts = null
  }
}

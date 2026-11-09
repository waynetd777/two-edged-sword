// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

package com.wayned.tes.plugin

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
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

  /** "he", "el" or "la" for a verse in Hebrew, Greek or Latin: read in that language's voice when the
   *  phone has one. None: the English voice. */
  var lang: String? = null
}

@InvokeArg
class LangArgs {
  var lang: String = ""
}

@InvokeArg
class SpeakArgs {
  var items: Array<SpeakItem> = arrayOf()

  /** 1 is the engine's normal pace. */
  var rate: Double = 1.0
  var title: String = ""
  var voice: String? = null

  /** The sleep timer's end, in ms since the epoch: the reading stops then. */
  var stopAt: Double? = null
}

@InvokeArg
class SleepArgs {
  var stopAt: Double? = null
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
        // Copied beside the old ones and swapped in whole: a copy cut short (the phone full, the app closed)
        // leaves the modules there were, never half of them.
        val tmp = File(root, "modules.tmp")
        tmp.deleteRecursively()
        if (!tmp.mkdirs()) throw java.io.IOException("couldn't make ${tmp.name}")
        for (name in activity.assets.list("modules") ?: arrayOf()) {
          activity.assets.open("modules/$name").use { i -> File(tmp, name).outputStream().use { o -> i.copyTo(o) } }
        }
        stamp.delete()
        dst.deleteRecursively()
        if (!tmp.renameTo(dst)) throw java.io.IOException("couldn't move the modules into place")
        stamp.writeText(version)
      }
      bundled = root.absolutePath
      webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('tes-bundled'))", null) }
    } catch (e: Exception) {
      // Said on the page (Read shows it), and kept for bundledDir in case the page wasn't listening yet.
      val msg = e.message ?: e.javaClass.simpleName
      bundledError = msg
      val js = "window.dispatchEvent(new CustomEvent('tes-bundled-error', {detail: ${JSONObject.quote(msg)}}))"
      webView.post { webView.evaluateJavascript(js, null) }
    }
  }

  /** Why the bundled modules couldn't be copied out, if they couldn't. */
  @Volatile private var bundledError: String? = null

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
      try {
        nsd.stopServiceDiscovery(listener)
      } catch (_: Exception) {}
      val todo = synchronized(seen) { seen.toMutableList() }
      val out = JSArray()
      fun next() {
        val s = todo.removeFirstOrNull()
        if (s == null) {
          invoke.resolve(JSObject().apply { put("list", out) })
          return
        }
        @Suppress("DEPRECATION")
        nsd.resolveService(
          s,
          object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, code: Int) {
              next()
            }
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
              // A home-network IPv4 address resolved now first (current, should the computer's have changed);
              // else the one the computer put in its announcement (sync.rs), as Android may resolve only fe80::.
              val told = i.attributes["ip"]?.let { String(it) }?.takeIf { it.isNotBlank() }
              val v4 = usable.firstOrNull { it is java.net.Inet4Address && it.isSiteLocalAddress }?.hostAddress
              val host = v4 ?: told ?: pick?.hostAddress
              if (host !=
                null
              ) {
                out.put(
                  JSObject().apply {
                    put("name", i.serviceName)
                    put("host", host.substringBefore('%'))
                    put("port", i.port)
                  },
                )
              }
              next()
            }
          },
        )
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
    bundledError?.let { r.put("error", it) }
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

  private val main = Handler(Looper.getMainLooper())

  /** Speech, as Android plays it and as Listen asks for the audio: spoken words, for media. */
  private val speechAudio: AudioAttributes =
    AudioAttributes
      .Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

  /**
   * A text-to-speech engine, started once. Anything asked of it while it starts waits for it, rather than
   * starting another; one that fails to start is shut down, and the next ask tries again. Used on the main
   * thread only.
   */
  private inner class Engine(private val listener: UtteranceProgressListener) {
    var tts: TextToSpeech? = null
      private set
    private var ready = false
    private val waiting = mutableListOf<(TextToSpeech?) -> Unit>()

    fun use(then: (TextToSpeech?) -> Unit) {
      main.post {
        val t = tts
        if (t != null && ready) return@post then(t)
        waiting.add(then)
        if (t != null) return@post // starting: it answers everyone waiting
        var made: TextToSpeech? = null
        made =
          TextToSpeech(activity) { status ->
            val m = made
            ready = status == TextToSpeech.SUCCESS && m != null
            if (ready) {
              m!!.setOnUtteranceProgressListener(listener)
              m.setAudioAttributes(speechAudio)
            } else {
              m?.shutdown()
              if (tts === m) tts = null
            }
            val all = waiting.toList()
            waiting.clear()
            all.forEach { it(if (ready) m else null) }
          }
        tts = made
      }
    }

    fun shutdown() {
      tts?.shutdown()
      tts = null
      ready = false
    }
  }

  /** What's being read, so pause can stop and resume can start again from the verse it was on. */
  @Volatile private var queue: List<SpeakItem> = listOf()

  @Volatile private var at = 0
  private var rate = 1.0
  private var voiceName: String? = null

  /** When the sleep timer stops the reading (ms since the epoch), done here as the page may be asleep. */
  private var sleep: Runnable? = null

  private fun event(kind: String, id: Int? = null, at: Int? = null, len: Int? = null) {
    val o = JSObject()
    o.put("kind", kind)
    id?.let { o.put("id", it) }
    at?.let { o.put("at", it) }
    len?.let { o.put("len", it) }
    // When it happened: an "end" the page hears only on waking (it sleeps with the screen locked) is old news.
    o.put("t", System.currentTimeMillis())
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
        val last = id == queue.lastOrNull()?.id
        if (last) main.post { letGo() }
        event(if (last) "end" else "done", id)
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String) {}
    }

  private val listen = Engine(progress)

  // ---- audio focus: other audio pauses for Listen, and Listen pauses for a call or another app ----

  private val audio get() = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  /** Listen was paused by another sound taking the audio for a while (a call), so carries on after it. */
  private var lostForAWhile = false

  private val focus =
    AudioFocusRequest
      .Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(speechAudio)
      // Speech can't be heard quietly under something else: it pauses rather than ducks.
      .setWillPauseWhenDucked(true)
      .setOnAudioFocusChangeListener({ change ->
        when (change) {
          AudioManager.AUDIOFOCUS_LOSS -> {
            lostForAWhile = false
            if (queue.isNotEmpty()) pauseHere()
          }

          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
            if (queue.isNotEmpty() && listen.tts?.isSpeaking == true) {
              lostForAWhile = true
              pauseHere()
            }
          }

          AudioManager.AUDIOFOCUS_GAIN -> {
            if (lostForAWhile && queue.isNotEmpty()) {
              lostForAWhile = false
              speakFrom(at)
              event("resumed")
            }
          }
        }
      }, main)
      .build()

  private fun takeAudio() = audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED

  private fun letGo() {
    lostForAWhile = false
    audio.abandonAudioFocusRequest(focus)
  }

  /** Paused here rather than by the page: the page is told, as when the lock screen pauses it on iOS. */
  private fun pauseHere() {
    listen.tts?.stop()
    event("paused")
  }

  /** The voice chosen, or the best English one installed that doesn't need the network. */
  private fun voiceFor(t: TextToSpeech): Voice? {
    val all = t.voices?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired } ?: return null
    voiceName?.let { n -> all.firstOrNull { it.name == n }?.let { return it } }
    val mine = Locale.getDefault()
    return all.maxByOrNull { it.quality * 2 + if (it.locale.country == mine.country) 1 else 0 }
  }

  /** The best voice for Hebrew, Greek or Latin, or null: one on the phone, else one of Google's online
   *  voices (often all a phone has for Greek until its voice is downloaded). Latin has no voice of its
   *  own: an Italian one says Church Latin as it's said (as the desktop does). */
  private fun voiceFor(t: TextToSpeech, lang: String): Voice? {
    val any = voicesIn(t, lang)
    val all = any.filter { !it.features.contains("notInstalled") }
    val v = all.filter { !it.isNetworkConnectionRequired }.maxByOrNull { it.quality } ?: all.maxByOrNull { it.quality }
    Log.i("tes-native", "voice for $lang: ${v?.name ?: "none"} (${all.size} usable, ${any.size - all.size} not downloaded)")
    return v
  }

  /** Every voice listed for Hebrew, Greek or Latin (Italian), downloaded or not. */
  private fun voicesIn(t: TextToSpeech, lang: String): List<Voice> {
    val code =
      when (lang) {
        "la" -> "it"
        "he" -> "iw"
        else -> lang
      }
    // Hebrew is "iw" to older Android, "he" to newer.
    return t.voices?.filter { it.locale.language == code || it.locale.language == lang } ?: listOf()
  }

  /** A voice for the language is listed, to download. */
  private fun voiceListed(t: TextToSpeech, lang: String) = voicesIn(t, lang).any { it.features.contains("notInstalled") }

  private fun speakFrom(i: Int) {
    listen.use { t ->
      if (t == null) return@use
      t.stop()
      val english = voiceFor(t)
      val others = mutableMapOf<String, Voice?>()
      val voiceOf = { l: String ->
        if (!others.containsKey(l)) others[l] = voiceFor(t, l)
        others[l]
      }
      t.setSpeechRate(rate.toFloat())
      for (k in i until queue.size) {
        val item = queue[k]
        // The voice is taken as each verse is queued, so a verse in Greek, say, gets the Greek one.
        val v = item.lang?.let(voiceOf) ?: english
        v?.let { t.voice = it }
        t.speak(item.text, TextToSpeech.QUEUE_ADD, Bundle(), item.id.toString())
      }
    }
  }

  /** The sleep timer's end, or none: the reading stops then, and the page is told ("slept"). */
  private fun sleepAt(stopAt: Double?) {
    main.post {
      sleep?.let { main.removeCallbacks(it) }
      sleep = null
      if (stopAt == null) return@post
      val r =
        Runnable {
          sleep = null
          queue = listOf()
          listen.tts?.stop()
          letGo()
          event("slept")
        }
      sleep = r
      main.postDelayed(r, (stopAt.toLong() - System.currentTimeMillis()).coerceAtLeast(0))
    }
  }

  @Command
  fun speak(invoke: Invoke) {
    val args = invoke.parseArgs(SpeakArgs::class.java)
    queue = args.items.toList()
    rate = args.rate
    voiceName = args.voice
    at = 0
    main.post { takeAudio() }
    sleepAt(args.stopAt)
    speakFrom(0)
    invoke.resolve()
  }

  /** The sleep timer changed while reading. */
  @Command
  fun speechSleep(invoke: Invoke) {
    sleepAt(invoke.parseArgs(SleepArgs::class.java).stopAt)
    invoke.resolve()
  }

  /** Android's engine can't pause in a sentence: it stops, and resume starts that verse again. */
  @Command
  fun speechPause(invoke: Invoke) {
    main.post { lostForAWhile = false }
    listen.tts?.stop()
    invoke.resolve()
  }

  @Command
  fun speechResume(invoke: Invoke) {
    main.post { takeAudio() }
    speakFrom(at)
    invoke.resolve()
  }

  @Command
  fun speechStop(invoke: Invoke) {
    queue = listOf()
    listen.tts?.stop()
    sleepAt(null)
    main.post { letGo() }
    invoke.resolve()
  }

  @Command
  fun voices(invoke: Invoke) {
    listen.use { t ->
      val list = JSArray()
      t
        ?.voices
        ?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired }
        ?.sortedWith(compareByDescending<Voice> { it.quality }.thenBy { it.locale.toLanguageTag() })
        ?.forEach {
          val o = JSObject()
          o.put("id", it.name)
          o.put("name", "${it.locale.displayCountry.ifEmpty { "English" }} (${it.name.substringAfterLast('-').take(8)})")
          o.put("language", it.locale.toLanguageTag())
          o.put(
            "quality",
            if (it.quality >= Voice.QUALITY_VERY_HIGH) {
              "premium"
            } else if (it.quality >= Voice.QUALITY_HIGH) {
              "enhanced"
            } else {
              "default"
            },
          )
          list.put(o)
        }
      val r = JSObject()
      r.put("voices", list)
      invoke.resolve(r)
    }
  }

  /** A word said on its own (the word sheet's speaker), apart from Listen's reading, telling the page when
   *  it starts and is done. */
  private val word =
    Engine(
      object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String) = sayEvent("start")

        override fun onDone(utteranceId: String) = sayEvent("done")

        override fun onStop(utteranceId: String, interrupted: Boolean) = sayEvent("done")

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String) = sayEvent("done")
      },
    )

  /** The word engine started now, so the first tap on a speaker isn't kept waiting for it. */
  private fun wordEngine(then: (TextToSpeech?) -> Unit) = word.use(then)

  /** Whether there's a voice for Hebrew, Greek or Latin (Italian): `has`, and `download` when one is
   *  listed but not yet downloaded. */
  @Command
  fun voiceFor(invoke: Invoke) {
    val lang = invoke.parseArgs(LangArgs::class.java).lang
    listen.use { t ->
      val r = JSObject()
      r.put("has", t == null || voiceFor(t, lang) != null)
      r.put("download", t != null && voiceListed(t, lang))
      invoke.resolve(r)
    }
  }

  /** The phone's text-to-speech settings, where a voice is added. */
  @Command
  fun speechSettings(invoke: Invoke) {
    try {
      activity.startActivity(Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
      activity.startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    invoke.resolve()
  }

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

  private fun sayEvent(kind: String) {
    val o = JSObject()
    o.put("kind", kind)
    trigger("say", o)
  }

  override fun onDestroy() {
    sleep?.let { main.removeCallbacks(it) }
    letGo()
    listen.shutdown()
    word.shutdown()
  }
}

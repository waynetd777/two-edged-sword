// Run in every frame of the main window, it does something only in an online devotional's page,
// framed in the reading column (src/WebPage.tsx), and only when the app asks: the app can't reach
// into a page from another site, but it can post it messages. It sets the page's text size, lets
// a click on the page say where to start reading it aloud, and marks the paragraph and word being
// read. ⌘ keys and Escape pressed in the page go to the app, so its shortcuts work there too.
(() => {
  if (window.top === window || window.parent !== window.top) return;
  const APP = ["tauri://localhost", "http://tauri.localhost", "http://localhost:1430"];
  let app = null; // the app's origin, once it has written
  const tell = (m) => app && window.parent.postMessage({ tes: true, ...m }, app);
  const SKIP =
    "nav, header, footer, aside, form, button, select, textarea, audio, video, iframe, svg, canvas, script, style, noscript, template," +
    " [aria-hidden=true], [hidden], [role=navigation], [role=banner], [role=contentinfo], [role=complementary], [role=dialog]";
  // What is read is found from the page as laid out, not from its tags (a site may put its text
  // straight into divs): each run of text that flows together, under the box that holds it
  // (its nearest ancestor not laid out inline), is one paragraph, in the order the page reads.
  // A line break, or a box of its own (a quote, a reference under it), starts the next one.
  // Asides within the text (share buttons, adverts), skipped; and where the text has ended (the
  // comments, related reading), where reading stops.
  const AD = ["share", "social", "subscribe", "newsletter", "promo", "advert", "sponsor", "cookie", "banner"];
  const END = ["comment", "disqus", "related", "recommend"];
  const sel = (ws) => ws.map((w) => `[class*=${w} i], [id*=${w} i]`).join(", ");
  const SKIP_AD = sel(AD),
    STOP = sel(END);
  const inline = (el) => /^(inline|contents)/.test(getComputedStyle(el).display) && el.tagName !== "BR";
  const holder = (n) => {
    let el = n.parentElement;
    while (el && el !== document.body && inline(el)) el = el.parentElement;
    return el;
  };
  const seen = (el) =>
    el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
  // A paragraph: the box holding it and its text nodes, in order.
  const paras = (root) => {
    const out = [];
    let cur = null;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === 1) {
        if (n.tagName === "BR") cur = null;
        continue;
      }
      if (!n.data.trim()) {
        if (cur) cur.nodes.push(n);
        continue;
      }
      const el = holder(n);
      if (!el || !seen(n.parentElement)) continue;
      if (!cur || cur.el !== el) out.push((cur = { el, nodes: [] }));
      cur.nodes.push(n);
    }
    // Only text worth reading: some letters, and not a list of links (a menu, tags, share buttons).
    return out.filter((p) => {
      const t = words(p);
      if (!/\p{L}{2}/u.test(t)) return false;
      const linked = p.nodes.filter((n) => n.parentElement.closest("a")).reduce((k, n) => k + n.data.trim().length, 0);
      // A Bible reference under a verse is a link, but is read.
      return linked < t.replace(/\s/g, "").length * 0.6 || t.length > 120 || /\d+[:.]\d+/.test(t);
    });
  };
  // The words of a paragraph as they are read: runs of space as one, none at the start.
  const words = (p) =>
    p.nodes
      .map((n) => n.data)
      .join("")
      .replace(/\s+/g, " ")
      .replace(/^ /, "")
      .replace(/ $/, "");
  // Where a page's text is, from the paragraph clicked: its article or main part, if it marks one;
  // else the widest box around it no wider than its column, so a sidebar beside it isn't read.
  const region = (p) => {
    const marked = p.el.closest("article, main, [role=main]");
    if (marked) return marked;
    const w = p.el.getBoundingClientRect().width;
    let el = p.el;
    while (el.parentElement && el.parentElement !== document.body && el.parentElement.getBoundingClientRect().width <= w * 1.25)
      el = el.parentElement;
    return el;
  };
  let picking = false,
    read = []; // the paragraphs being read, in order
  const style = document.createElement("style");
  // The word being read looks as it does in the Bible reader: the app sends its colours (made so
  // they come out right through the inverting the dark theme gives the page).
  const css = (c) =>
    "html.tes-pick, html.tes-pick * { cursor: pointer !important; }" +
    "html.tes-dark :is(img, video, canvas, iframe, embed, object), html.tes-dark .tes-bg { filter: invert(1) hue-rotate(180deg) !important; }" +
    `.tes-para { background: ${c.para} !important; border-radius: 4px; }` +
    `.tes-w { position: absolute; pointer-events: none; z-index: 2147483647; border-radius: 3px; background: ${c.word};` +
    ` box-shadow: 0 2px 0 ${c.line}; mix-blend-mode: ${c.blend || "multiply"}; }`;
  style.textContent = css({ para: "#ddf4ff", word: "#d8e6f5", line: "#0969da" });
  const pick = (on) => {
    picking = on;
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.classList.toggle("tes-pick", on);
  };
  // The word's box, drawn as the reader draws it, on a layer of its own over the page: the page's
  // text is left alone, as its own scripts may rebuild it while it's read. Blended with the page,
  // so the word shows through.
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;";
  const unbox = () => layer.replaceChildren();
  const boxAround = (r) => {
    if (!layer.isConnected) document.documentElement.appendChild(layer);
    // The layer's own scale (the page's text size) and place, so the boxes land on the word.
    const o = layer.getBoundingClientRect();
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;width:100px;height:0;";
    layer.appendChild(probe);
    const k = probe.getBoundingClientRect().width / 100 || 1;
    probe.remove();
    for (const x of r.getClientRects()) {
      if (!x.width) continue;
      const b = document.createElement("div");
      b.className = "tes-w";
      layer.appendChild(b);
      // Placed, then moved by however far it landed from the word (zoom isn't the same everywhere).
      let left = (x.left - o.left) / k,
        top = (x.top - o.top) / k;
      const put = () =>
        (b.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${x.width / k}px;height:${x.height / k}px;`);
      put();
      const a = b.getBoundingClientRect();
      left += (x.left - a.left) / k;
      top += (x.top - a.top) / k;
      put();
    }
  };
  const clear = () => {
    unbox();
    document.querySelectorAll(".tes-para").forEach((b) => b.classList.remove("tes-para"));
  };
  // The word at `char` in a paragraph's text, as a range on the page.
  const wordRange = (p, char) => {
    const at = [];
    let space = true;
    for (const n of p.nodes)
      for (let i = 0; i < n.data.length; i++) {
        const ws = /\s/.test(n.data[i]);
        if (ws && space) continue;
        at.push([n, i]);
        space = ws;
      }
    const isWord = (k) => k >= 0 && k < at.length && !/\s/.test(at[k][0].data[at[k][1]]);
    if (!isWord(char)) return null;
    let a = char,
      z = char;
    while (isWord(a - 1)) a--;
    while (isWord(z + 1)) z++;
    const r = document.createRange();
    r.setStart(at[a][0], at[a][1]);
    r.setEnd(at[z][0], at[z][1] + 1);
    return r;
  };
  // A third of the way down the window, where the eye is when following.
  const third = (p) => {
    const g = document.createRange();
    g.setStartBefore(p.nodes[0]);
    g.setEndAfter(p.nodes[p.nodes.length - 1]);
    const r = g.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - innerHeight / 3 + Math.min(r.height, innerHeight / 3) / 2, behavior: "smooth" });
  };
  // In the dark theme the app inverts the whole page; pictures are inverted again here, so they
  // come out as they should. A picture set as a box's background counts, unless it holds text.
  const pictures = () => {
    for (const el of document.querySelectorAll("body *")) {
      if (el.matches("img, video, canvas, iframe, embed, object, svg, svg *") || el.classList.contains("tes-bg")) continue;
      if (
        /url\(/.test(getComputedStyle(el).backgroundImage) &&
        !(el.textContent || "").trim() &&
        !el.querySelector("img, video, canvas, iframe")
      )
        el.classList.add("tes-bg");
    }
  };
  let dark = false;
  const darken = (on) => {
    dark = on;
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.classList.toggle("tes-dark", on);
    if (on) pictures();
  };
  // Pictures that arrive later (a page that loads them as it's read).
  new MutationObserver((ms) => {
    if (dark && ms.some((m) => m.target !== layer)) {
      clearTimeout(darken.t);
      darken.t = setTimeout(pictures, 300);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  // A site whose address can't say the day: on the page the app opened (not the one it leads to),
  // the first link to a day's reading is followed, once the page has made its links.
  const go = ({ from, href }) => {
    const same = (u) => u.replace(/[/#?]+$/, "");
    if (same(location.href) !== same(from)) return false;
    const re = new RegExp(href);
    const until = Date.now() + 15000;
    const look = () => {
      const a = [...document.querySelectorAll("a[href]")].find((a) => re.test(a.href) && a.href !== location.href);
      if (a) location.assign(a.href);
      else if (Date.now() < until) setTimeout(look, 250);
    };
    look();
    return true;
  };
  let shown = -1;
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (e.source !== window.parent || !APP.includes(e.origin) || !m || m.tes !== true) return;
    app = e.origin;
    if (m.zoom) document.documentElement.style.zoom = String(m.zoom);
    if (m.colors) style.textContent = css(m.colors);
    if ("invert" in m) darken(!!m.invert);
    // Following a link to the day's page comes first; reading starts there.
    if (!(m.follow && go(m.follow)) && m.start) startAt(m.start);
    if ("pick" in m) pick(!!m.pick);
    if (m.stop) {
      clear();
      read = [];
      shown = -1;
    }
    if (typeof m.para === "number") {
      let b = read[m.para];
      if (!b) return;
      // The page rebuilt this text since it was found: find it again, by its words.
      if (!b.nodes.every((n) => n.isConnected)) {
        const again = paras(document.body).find((q) => words(q) === b.text);
        if (!again) return unbox();
        again.text = b.text;
        b = read[m.para] = again;
      }
      (document.head || document.documentElement).appendChild(style);
      if (m.para !== shown) {
        clear();
        third(b);
        shown = m.para;
      }
      // As in the reader: the paragraph is tinted only when words aren't highlighted.
      b.el.classList.toggle("tes-para", !m.word);
      unbox();
      const r = m.word && m.char >= 0 ? wordRange(b, m.char) : null;
      if (!r) return;
      boxAround(r);
    }
  });
  // Reading from the paragraph holding `t` (a text node or an element), or the first after it.
  const readFrom = (t, auto) => {
    clear();
    const all = paras(document.body);
    let i = all.findIndex((p) => p.nodes.includes(t));
    if (i < 0) i = all.findIndex((p) => t.compareDocumentPosition(p.nodes[0]) & Node.DOCUMENT_POSITION_FOLLOWING || p.el.contains(t));
    if (i < 0) return tell({ cancel: true, auto });
    // The part of the page clicked in, then (if that was its title or a box before it) the part
    // with the most text in it, the devotional itself, from there on.
    const start = all[i];
    const where = region(start);
    const parts = new Map();
    for (const p of all) {
      const r = region(p);
      parts.set(r, (parts.get(r) ?? 0) + words(p).length);
    }
    const main = [...parts].sort((x, y) => y[1] - x[1])[0][0];
    const inPart = (p) =>
      where.contains(p.el) ||
      (main !== where &&
        !main.contains(start.el) &&
        main.contains(p.el) &&
        main.compareDocumentPosition(start.el) & Node.DOCUMENT_POSITION_PRECEDING);
    // An aside or the end, if it isn't what was clicked in.
    const outside = (el) => el && !el.contains(start.el);
    const stop = all.findIndex((p, k) => k > i && outside(p.el.closest(STOP)));
    read = all.slice(i, stop < 0 ? undefined : stop).filter((p) => inPart(p) && !outside(p.el.closest(SKIP_AD)));
    shown = -1;
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    for (const p of read) p.text = words(p);
    tell({ picked: read.map((p) => esc(p.text)), auto });
  };
  // A page the app knows: reading starts by itself at `start`, once the page has made it.
  const startAt = (sel) => {
    const until = Date.now() + 15000;
    const look = () => {
      const el = document.querySelector(sel);
      if (el && (el.textContent || "").trim()) readFrom(el, true);
      else if (Date.now() < until) setTimeout(look, 250);
      else tell({ cancel: true, auto: true });
    };
    look();
  };
  // Reading starts at the block clicked, or the first one after the click.
  addEventListener(
    "click",
    (e) => {
      if (!picking) return;
      e.preventDefault();
      e.stopPropagation();
      pick(false);
      // The paragraph clicked: the text under the pointer, or failing that the first paragraph
      // that comes after the place clicked.
      const c = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      readFrom(c && c.startContainer.nodeType === 3 ? c.startContainer : e.target);
    },
    true,
  );
  addEventListener(
    "keydown",
    (e) => {
      if (!app || !(e.metaKey || e.key === "Escape")) return;
      if (e.key === "Escape" && picking) pick(false);
      if (e.metaKey && ["=", "+", "-", "0"].includes(e.key)) e.preventDefault();
      tell({ key: { key: e.key, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey } });
    },
    true,
  );
})();

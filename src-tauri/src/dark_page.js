// Run in a devotional's own window (open_web in lib.rs) when the app is dark: the page is shown
// dark by inverting it, with pictures and video inverted back so they look as they should.
// Crude, but it works on any site.
(() => {
  const css =
    "html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }" +
    " img, video, picture, canvas, svg image, [style*='background-image'] { filter: invert(1) hue-rotate(180deg) !important; }";
  const add = () => {
    const at = document.head || document.documentElement;
    if (!document.getElementById("tes-dark")) {
      const s = document.createElement("style");
      s.id = "tes-dark";
      s.textContent = css;
      at.appendChild(s);
    }
    // macOS colours the title bar from the page's theme colour, or failing that from the top of the
    // page as it was before the inversion (white, often): a dark one of our own instead.
    document.querySelectorAll("meta[name='theme-color']:not(#tes-theme)").forEach((m) => m.remove());
    if (!document.getElementById("tes-theme")) {
      const m = document.createElement("meta");
      m.id = "tes-theme";
      m.name = "theme-color";
      m.content = "#121214";
      at.appendChild(m);
    }
  };
  add();
  document.addEventListener("DOMContentLoaded", add);
})();

// The website tutorials: entrances as things scroll into view, the list of steps following along,
// the screenshots' shimmer until they load, and the Mac or Windows switch.
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A screenshot's frame shimmers until its picture has loaded.
  document.querySelectorAll(".shot img, .mini img").forEach(function (img) {
    var frame = img.closest(".shot, .mini");
    var done = function () {
      frame.classList.add("loaded");
    };
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  });

  // Rise into view.
  var rises = document.querySelectorAll(".rise");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    rises.forEach(function (el) {
      io.observe(el);
    });
  } else {
    rises.forEach(function (el) {
      el.classList.add("in");
    });
  }

  // The step being read is marked in the list beside it, and the bar under the list fills up.
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  var lessons = links.map(function (a) {
    return document.querySelector(a.getAttribute("href"));
  });
  var bar = document.querySelector(".toc .bar i");
  if (links.length && lessons.every(Boolean)) {
    var ticking = false;
    var frame = function () {
      ticking = false;
      var mid = window.innerHeight * 0.35;
      var at = 0;
      lessons.forEach(function (l, i) {
        if (l.getBoundingClientRect().top < mid) at = i;
      });
      links.forEach(function (a, i) {
        a.classList.toggle("on", i === at);
      });
      var first = lessons[0].getBoundingClientRect().top;
      var last = lessons[lessons.length - 1].getBoundingClientRect().bottom;
      var p = Math.min(1, Math.max(0, (mid - first) / (last - first)));
      if (bar) bar.style.width = p * 100 + "%";
    };
    var onScroll = function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(frame);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    frame();
  }

  // Mac or Windows, chosen at the top: the install steps for it, and every key (and the odd word,
  // such as menu bar) as it is there. It starts as the computer you're on, and a choice is
  // remembered for next time.
  var seg = document.querySelector(".pick .seg");
  if (seg) {
    var buttons = Array.prototype.slice.call(seg.querySelectorAll("button"));
    var keys = Array.prototype.slice.call(document.querySelectorAll("[data-win]"));
    keys.forEach(function (k) {
      k.dataset.mac = k.textContent;
    });
    var pick = function (os) {
      document.documentElement.dataset.os = os;
      buttons.forEach(function (b) {
        b.setAttribute("aria-selected", String(b.dataset.os === os));
      });
      seg.dataset.mode = os === "win" ? "1" : "0";
      keys.forEach(function (k) {
        k.textContent = os === "win" ? k.dataset.win : k.dataset.mac;
      });
    };
    var saved = null;
    try {
      saved = localStorage.getItem("tutorial-os");
    } catch (e) {
      // No storage (a private window): start from the computer you're on.
    }
    pick(saved || (/Windows/.test(navigator.userAgent) ? "win" : "mac"));
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        pick(b.dataset.os);
        try {
          localStorage.setItem("tutorial-os", b.dataset.os);
        } catch (e) {
          // No storage: the choice holds for this visit only.
        }
      });
    });
  }
})();

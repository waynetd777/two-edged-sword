// Two-edged Sword: the product page's motion (docs/index.html). Plain JS, no build step.
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Screenshots rise into place as they come into view. The hiding only applies once this runs
  // (html.js), and a scroll check backs up the observer, so no screenshot can stay hidden.
  var rises = Array.prototype.slice.call(document.querySelectorAll(".rise"));
  if ("IntersectionObserver" in window && !reduced) {
    var riser = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            riser.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    rises.forEach(function (el) {
      riser.observe(el);
    });
    function sweep() {
      var h = window.innerHeight;
      rises.forEach(function (el) {
        if (el.classList.contains("in")) return;
        var r = el.getBoundingClientRect();
        if (r.top < h * 0.95 && r.bottom > 0) {
          el.classList.add("in");
          riser.unobserve(el);
        }
      });
    }
    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("load", sweep);
    setTimeout(sweep, 1200);
  } else {
    rises.forEach(function (el) {
      el.classList.add("in");
    });
  }

  // A screenshot frame shimmers until its picture has loaded (landing.css, .shot:not(.loaded)).
  document.querySelectorAll(".shot").forEach(function (shot) {
    var img = shot.querySelector("img");
    if (!img) {
      shot.classList.add("loaded");
      return;
    }
    function done() {
      shot.classList.add("loaded");
    }
    if (img.complete) done();
    else {
      img.addEventListener("load", done);
      img.addEventListener("error", done);
    }
  });

  // The hero screenshot lies back a little and comes upright as the page scrolls.
  var hero = document.getElementById("heroShot");
  if (hero && !reduced) {
    var settled = false;
    hero.addEventListener("animationend", function () {
      settled = true;
      tilt();
    });
    function tilt() {
      if (!settled) return;
      var y = Math.min(window.scrollY, 420);
      var deg = 10 * (1 - y / 420);
      hero.style.transform = "rotateX(" + deg + "deg)";
    }
    window.addEventListener(
      "scroll",
      function () {
        window.requestAnimationFrame(tilt);
      },
      { passive: true },
    );
  }

  // A tour: a screenshot with steps. Each step zooms the picture so that one spot (data-x, data-y, in
  // percent) is at the centre, data-s times larger, or shows another picture (data-img); data-caption
  // is written under the picture. Steps play in turn while the tour is on screen, each for data-ms
  // (an animated picture's length) or the tour's data-auto; a click picks one.
  function Tour(root) {
    var img = root.querySelector(".shot:not(.swap) img");
    var swaps = root.querySelectorAll(".shot.swap img");
    var steps = Array.prototype.slice.call(root.querySelectorAll(".steps li"));
    var cap = root.querySelector(".tabcap");
    var every = parseInt(root.getAttribute("data-auto"), 10) || 4000;
    var at = 0,
      timer = null,
      seen = false;
    root.style.setProperty("--dur", every + "ms");

    steps.forEach(function (li, i) {
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      li.addEventListener("click", function () {
        show(i);
        restart();
      });
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show(i);
          restart();
        }
      });
    });

    function show(i) {
      at = i;
      root.style.setProperty("--dur", stay(i) + "ms");
      steps.forEach(function (li, k) {
        li.classList.remove("on");
        if (k === i) {
          void li.offsetWidth;
          li.classList.add("on");
        } // restart the bar
      });
      var li = steps[i];
      if (img) {
        var s = parseFloat(li.getAttribute("data-s") || "1");
        if (s <= 1) {
          img.style.transform = "none";
        } else {
          // The window shown is 1/s of the picture, centred on the spot, kept inside the picture.
          var w = 1 / s;
          var px = parseFloat(li.getAttribute("data-x") || "50") / 100;
          var py = parseFloat(li.getAttribute("data-y") || "50") / 100;
          var left = Math.min(Math.max(px - w / 2, 0), 1 - w);
          var top = Math.min(Math.max(py - w / 2, 0), 1 - w);
          img.style.transformOrigin = "0 0";
          img.style.transform = "scale(" + s + ") translate(" + -left * 100 + "%, " + -top * 100 + "%)";
        }
      }
      if (swaps.length) {
        var which = parseInt(li.getAttribute("data-img") || "0", 10);
        swaps.forEach(function (im, k) {
          im.classList.toggle("on", k === which);
        });
      }
      if (cap && li.hasAttribute("data-caption")) {
        var text = li.getAttribute("data-caption");
        cap.classList.add("fading");
        setTimeout(function () {
          cap.textContent = text;
          cap.classList.remove("fading");
        }, 380);
      }
    }
    function stay(i) {
      return parseInt(steps[i].getAttribute("data-ms"), 10) || every;
    }
    function next() {
      show((at + 1) % steps.length);
      timer = setTimeout(next, stay(at));
    }
    function start() {
      stop();
      if (!reduced && steps.length > 1) timer = setTimeout(next, stay(at));
    }
    function stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    function restart() {
      if (seen) start();
    }

    root.addEventListener("mouseenter", function () {
      root.classList.add("paused");
      stop();
    });
    root.addEventListener("mouseleave", function () {
      root.classList.remove("paused");
      restart();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            seen = e.isIntersecting;
            if (seen) {
              show(at);
              start();
            } else {
              stop();
            }
          });
        },
        { threshold: 0.35 },
      ).observe(root);
    } else {
      seen = true;
      show(0);
      start();
    }
    show(0);
  }
  document.querySelectorAll(".tour").forEach(function (el) {
    try {
      new Tour(el);
    } catch (err) {
      console.error("tour", el, err);
    }
  });

  // The spoken verse: each word lit as it would be read aloud.
  var spoken = document.querySelector(".spoken");
  if (spoken && !reduced) {
    var words = Array.prototype.slice.call(spoken.querySelectorAll("span"));
    var w = -1,
      speaking = null;
    function say() {
      w++;
      if (w >= words.length) {
        words.forEach(function (s) {
          s.classList.remove("now", "said");
        });
        w = -1;
        speaking = setTimeout(say, 1800);
        return;
      }
      words.forEach(function (s, k) {
        s.classList.toggle("now", k === w);
        s.classList.toggle("said", k < w);
      });
      var t = words[w].textContent;
      var pause = /[,.;:]$/.test(t) ? 620 : 240 + t.length * 28;
      speaking = setTimeout(say, pause);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting && !speaking) say();
            else if (!e.isIntersecting && speaking) {
              clearTimeout(speaking);
              speaking = null;
            }
          });
        },
        { threshold: 0.4 },
      ).observe(spoken);
    } else {
      say();
    }
  }
})();

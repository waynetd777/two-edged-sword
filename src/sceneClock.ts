// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Screenshot mode's clock, for an animated scene: from the first window.__tesStep(ms) the page's
// time stands still, and each call moves it on by that much and draws one frame. A frame taken
// after each step is then exactly that far on from the last, however long WebKit takes to draw
// it, so the animation plays smoothly. Before the first step the clock runs as usual.

let frozen: number | null = null;
let queue: FrameRequestCallback[] = [];
let installed = false;

/** Whether the clock has begun to be stepped (an animated scene's frames are being taken). */
export const sceneStepping = () => frozen !== null;

export function installSceneClock() {
  if (installed) return;
  installed = true;
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  let ids = 0;
  performance.now = () => frozen ?? realNow();
  // Every frame is given the page's time, frozen or not, so none mixes the two.
  window.requestAnimationFrame = (cb) => {
    if (frozen === null) return realRaf(() => (frozen === null ? cb(performance.now()) : queue.push(cb)));
    queue.push(cb);
    return --ids; // never a real id, so cancelling one is harmless
  };
  (window as unknown as { __tesStep: (ms: number) => void }).__tesStep = (ms) => {
    if (frozen === null) frozen = realNow();
    frozen += ms;
    // CSS animations and transitions move on with it.
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = (Number(a.currentTime) || 0) + ms;
    }
    const due = queue;
    queue = [];
    for (const cb of due) cb(frozen);
  };
}

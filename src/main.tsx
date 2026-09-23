import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import App from "./App";
import "./styles.css";

/// How long the splash stays up at minimum, so a fast start reads as a deliberate opening.
const MIN_SPLASH_MS = 900;
const splashShownAt = Date.now();

/// Fade out the splash that index.html painted, once there is a real screen to replace it.
export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el || el.classList.contains("gone") || el.dataset.going) return;
  const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - splashShownAt));
  el.dataset.going = "1";
  setTimeout(() => {
    el.classList.add("gone");
    setTimeout(() => el.remove(), 250);
  }, wait);
}

// If anything fails before the first screen, say so on the splash rather than leaving it spinning.
function showStartupError(msg: string) {
  const el = document.querySelector("#splash .what");
  if (el) { el.textContent = `Something went wrong: ${msg}`; (el as HTMLElement).style.whiteSpace = "pre-wrap"; (el as HTMLElement).style.maxWidth = "80vw"; (el as HTMLElement).style.fontStyle = "normal"; }
}
window.addEventListener("error", (e) => showStartupError(`${e.message}\n${e.error?.stack ?? ""}`.slice(0, 1200)));
window.addEventListener("unhandledrejection", (e) => showStartupError(String(e.reason).slice(0, 1200)));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

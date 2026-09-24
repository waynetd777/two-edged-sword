import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/cinzel-decorative/700.css";
import "@fontsource/cinzel-decorative/900.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css";
import App from "./App";
import "./styles.css";

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

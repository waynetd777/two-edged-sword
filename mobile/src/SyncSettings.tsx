// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// More › Settings › Sync: pairing with Two-edged Sword on a computer, and how syncing with it is going
// (phoneSync.ts).

import { useState } from "react";
import { discover, pair, syncNow, unpair, useSync } from "./phoneSync";

type Found = Awaited<ReturnType<typeof discover>>[number];

const deviceName = () => {
  const ua = navigator.userAgent;
  return /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android phone"
        : "Phone";
};

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export function SyncSettings() {
  const s = useSync();
  const [step, setStep] = useState<"idle" | "looking" | "pick" | "code">("idle");
  const [found, setFound] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const look = async () => {
    setErr(null);
    setStep("looking");
    const f = await discover();
    setFound(f);
    if (f.length === 1) {
      setChosen(f[0]);
      setStep("code");
    } else setStep("pick");
  };
  const go = async () => {
    if (!chosen) return;
    setBusy(true);
    setErr(null);
    try {
      await pair(chosen, code, deviceName());
      setStep("idle");
      setCode("");
    } catch (e) {
      setErr(String(e).replace(/^Error: /, ""));
    }
    setBusy(false);
  };

  if (s.paired)
    return (
      <div className="card">
        <p style={{ margin: "0 0 4px" }}>
          Syncing with <b>{s.paired.name}</b>
        </p>
        <p className="m" style={{ margin: "0 0 10px" }}>
          {s.busy ? "Syncing…" : s.error ? s.error : s.last ? `Synced ${ago(s.last)}` : "Not synced yet"}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" disabled={s.busy} onClick={() => syncNow()}>
            Sync now
          </button>
          <button className="secondary" onClick={unpair}>
            Stop syncing
          </button>
        </div>
      </div>
    );

  return (
    <div className="card">
      <p className="m" style={{ margin: "0 0 10px" }}>
        Keep bookmarks, highlights, reading plans, Recent and your place in each book the same as Two-edged Sword on your computer, whenever
        this device is on the same Wi-Fi.
      </p>
      {step === "idle" && (
        <button className="primary" onClick={look}>
          Pair with your computer
        </button>
      )}
      {step === "looking" && <p className="m">Looking for Two-edged Sword on this Wi-Fi…</p>}
      {step === "pick" &&
        (found.length ? (
          <div className="list">
            {found.map((f) => (
              <button
                key={f.name}
                className="row"
                onClick={() => {
                  setChosen(f);
                  setStep("code");
                }}
              >
                <span className="grow">{f.name}</span>
                <span className="m">›</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="m">No computer found. Open Two-edged Sword on your computer, on the same Wi-Fi, then try again.</p>
            <button className="secondary" onClick={look}>
              Try again
            </button>
          </>
        ))}
      {step === "code" && chosen && (
        <>
          <p style={{ margin: "0 0 8px" }}>
            On <b>{chosen.name}</b>, open Settings › Phones and tablets and click <b>Show a pairing code</b>. Enter it here:
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="Pairing code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ flex: 1, fontSize: 20, letterSpacing: "0.15em" }}
            />
            <button className="primary" disabled={busy || code.length !== 6} onClick={go}>
              {busy ? "Pairing…" : "Pair"}
            </button>
          </div>
        </>
      )}
      {err && (
        <p className="m" style={{ color: "var(--red)", marginTop: 8 }}>
          {err}
        </p>
      )}
    </div>
  );
}

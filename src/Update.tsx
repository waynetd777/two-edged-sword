// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// The update prompt (src-tauri/src/updates.rs sends it here): a new version with its notes, and
// Install and Restart, Later or Skip This Version; then the download's progress until the app
// restarts. Esc or a click outside is Later. The update check's other news (up to date, couldn't
// check, the update will wait) shows in the same dialog with OK.

import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Sword } from "./icons";
import { mdToHtml } from "./md";
import { Dialog, fmtSize } from "./ui";

export interface UpdateOffer {
  name: string;
  version: string;
  current: string;
  notes?: string | null;
  /** When it was released (RFC 3339). */
  date?: string | null;
}

export interface UpdateProgress {
  stage: "downloading" | "installing" | "restarting";
  got: number;
  total?: number | null;
}

export type UpdateShown = { offer: UpdateOffer; progress?: UpdateProgress } | { message: { title: string; text: string } };

let show: ((u: UpdateShown) => void) | null = null;
/** Screenshot mode: the dialog with a scene's fixture instead of a real update (scene.ts). */
export const setSceneUpdate = (u: UpdateShown) => show?.(u);

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="update-head">
      <Sword size={56} />
      <div>
        <div style={{ font: "500 24px/1.2 var(--display)" }}>{title}</div>
        <div style={{ color: "var(--muted)", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function Progress({ p }: { p: UpdateProgress }) {
  const known = p.stage === "downloading" && !!p.total;
  const pct = known ? Math.min(100, (p.got / p.total!) * 100) : 0;
  const says =
    p.stage === "restarting"
      ? "Restarting…"
      : p.stage === "installing"
        ? "Installing…"
        : known
          ? `Downloading… ${fmtSize(p.got)} of ${fmtSize(p.total!)}`
          : p.got
            ? `Downloading… ${fmtSize(p.got)}`
            : "Downloading…";
  return (
    <div className="update-progress">
      <div
        className={`update-bar ${known ? "" : "busy"}`}
        role="progressbar"
        aria-label="Update"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(pct) : undefined}
      >
        <i style={known ? { width: `${pct}%` } : undefined} />
      </div>
      <span className="hint" role="status">
        {says}
      </span>
    </div>
  );
}

export function UpdateDialog() {
  const [shown, setShown] = useState<UpdateShown | null>(null);
  useEffect(() => {
    show = setShown;
    const offs = [
      listen<UpdateOffer>("update-offer", (e) => setShown({ offer: e.payload })),
      listen<UpdateProgress>("update-progress", (e) => setShown((s) => (s && "offer" in s ? { ...s, progress: e.payload } : s))),
      listen<{ title: string; text: string }>("update-message", (e) => setShown({ message: e.payload })),
    ];
    return () => {
      show = null;
      offs.forEach((off) => void off.then((f) => f()));
    };
  }, []);
  if (!shown) return null;

  if ("message" in shown) {
    const { title, text } = shown.message;
    return (
      <Dialog onClose={() => setShown(null)} width={460} label={title}>
        <Head title={title} sub={text} />
        <div className="foot">
          <button className="btn primary" type="button" style={{ marginLeft: "auto" }} autoFocus onClick={() => setShown(null)}>
            OK
          </button>
        </div>
      </Dialog>
    );
  }

  const { offer, progress } = shown;
  const answer = (a: "install" | "later" | "skip") => {
    // A busy app or a failed download comes back as a message, which takes the dialog's place.
    setShown(a === "install" ? { offer, progress: { stage: "downloading", got: 0 } } : null);
    api.updateAnswer(a).catch(() => {});
  };
  const date = offer.date ? new Date(offer.date) : null;
  const released =
    date && !isNaN(+date) ? ` · released ${date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}` : "";
  return (
    <Dialog onClose={() => answer("later")} width={540} label={`${offer.name} ${offer.version} is available`} dismiss={!progress}>
      <Head title={`${offer.name} ${offer.version} is available`} sub={`You have ${offer.current}${released}.`} />
      {offer.notes && (
        <div className="update-notes">
          <span className="label">What's new</span>
          <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(offer.notes, false) }} />
        </div>
      )}
      {progress && <Progress p={progress} />}
      <div className="foot">
        {progress ? (
          <span className="hint">Your work is saved before it restarts.</span>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => answer("skip")}>
              Skip This Version
            </button>
            <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => answer("later")}>
              Later
            </button>
            <button className="btn primary" type="button" autoFocus onClick={() => answer("install")}>
              Install and Restart
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

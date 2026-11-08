// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api, Kind, Module, Offer, save, saved, scene } from "./api";
import { Icon } from "./icons";
import { ImageViewer } from "./ImageViewer";
import { NavButtons } from "./NavButtons";
import { renderHtml } from "../../src/esword";

/** Where the downloads live: the GitHub release tagged `modules` (mobile/tools/modules_release.py). */
const RELEASE = "https://github.com/waynetd777/two-edged-sword/releases/download/modules/";

/** Where downloads come from: the release, or (debug builds) the local copy last given as modules=<url>. */
export function downloadsBase() {
  const b = saved<string | null>("modulesBase", null);
  return b ? (b.endsWith("/") ? b : b + "/") : RELEASE;
}

type Group = "bibles" | "commentaries" | "dictionaries" | "books";
const GROUPS: { id: Group; name: string; kinds: Kind[] }[] = [
  { id: "bibles", name: "Bibles", kinds: ["bible"] },
  { id: "commentaries", name: "Commentaries", kinds: ["commentary"] },
  { id: "dictionaries", name: "Dictionaries", kinds: ["dictionary", "lexicon"] },
  { id: "books", name: "Books", kinds: ["reference", "devotional"] },
];

const mb = (n: number) => (n >= 10e6 ? `${Math.round(n / 1e6)} MB` : `${(n / 1e6).toFixed(1)} MB`);

interface Going {
  done: number;
  total: number;
  error?: string;
}

export function Library({
  modules,
  onChanged,
  onRead,
  onDictionary,
  onLexicon,
}: {
  modules: Module[];
  onChanged: () => void;
  onRead: (module: string) => void;
  /** Opens the dictionaries, at this one. */
  onDictionary: (module: string) => void;
  /** Opens Word Study, where every lexicon's entry for a number shows. */
  onLexicon: () => void;
}) {
  const [group, setGroup] = useState<Group>(() => saved("libraryGroup", "commentaries"));
  // The offer from last time draws at once; the release is asked again each time the app opens.
  const [offers, setOffers] = useState<Offer[]>(() => saved("offers", []));
  const [base, setBase] = useState(RELEASE);
  const [offline, setOffline] = useState<string | null>(null);
  const [going, setGoing] = useState<Record<string, Going>>({});
  const [removing, setRemoving] = useState<Module | null>(null);
  /** The About open: a module on the phone (read from it) or one to download (from the manifest). */
  const [about, setAbout] = useState<{ title: string; sub: string; html: string | null } | null>(null);
  /** Where a module on the phone came from: the app, the downloads, or brought in (AirDrop, Files). */
  const whence = (m: Module) => (m.source === "bundled" ? "Built in" : offers.some((o) => o.file === m.file) ? "Downloaded" : "Added");
  const showAbout = (m: Module) => {
    setAbout({ title: m.title, sub: `${whence(m)} · ${mb(m.size)}`, html: null });
    api
      .moduleInfo(m.kind, m.id)
      .then((html) => setAbout((a) => (a && a.title === m.title ? { ...a, html } : a)))
      .catch(() => setAbout((a) => (a && a.title === m.title ? { ...a, html: "" } : a)));
  };
  /** A download's About, from the manifest; its cover is fetched, and shown once it comes. */
  const showOffer = (o: Offer) => {
    const sub = `${mb(o.gz)} to download · ${mb(o.size)} on the phone`;
    const info = o.info ?? "";
    setAbout({ title: o.title, sub, html: info });
    if (!o.cover || !info.includes('<img src="cover">')) return;
    const type = `image/${o.cover.split(".").pop()}`;
    api
      .fetchBytes(downloadsBase() + o.cover)
      .then(
        (buf) =>
          new Promise<string>((done) => {
            const r = new FileReader();
            r.onload = () => done(r.result as string);
            r.readAsDataURL(new Blob([buf], { type }));
          }),
      )
      .then((src) =>
        setAbout((a) => (a && a.title === o.title ? { ...a, html: info.replace('<img src="cover">', `<img src="${src}">`) } : a)),
      )
      .catch(() => {});
  };
  const InfoButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button className="infobtn" aria-label={`About ${label}`} onClick={onClick}>
      <Icon name="info" size={20} />
    </button>
  );
  const [toStart, setGet] = useState<Offer | null>(null);
  /** A picture from an About (its cover), open in the viewer. */
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => save("libraryGroup", group), [group]);
  useEffect(() => {
    // Debug builds can point at a local copy of the release: TES_SCENE=modules=http://localhost:8000/
    scene.then((sc) => {
      // Debug: about opens the first module's About on the phone.
      // aboutget: the About of the last module to download, with its cover fetched.
      // pick: Add from Files tapped, the picker open.
      if (sc.includes("pick"))
        setTimeout(
          () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Add from Files")?.click(),
          2000,
        );
      // aboutcover: then its cover tapped, open in the viewer.
      if (sc.includes("aboutcover")) setTimeout(() => document.querySelector<HTMLImageElement>(".prose.about img")?.click(), 3500);
      if (sc.includes("aboutget")) setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>(".infobtn")].pop()?.click(), 4000);
      else if (sc.includes("about")) setTimeout(() => document.querySelector<HTMLButtonElement>(".infobtn")?.click(), 1500);
      const grp = sc.find((x) => x.startsWith("group="))?.slice(6) as Group | undefined;
      if (grp && GROUPS.some((x) => x.id === grp)) setGroup(grp);
      // A debug build can use a local copy of the downloads (modules=<url>), and remembers it, so the app opened from the home screen keeps using it.
      const b = sc.find((x) => x.startsWith("modules="))?.slice(8) ?? saved<string | null>("modulesBase", null);
      if (sc.some((x) => x.startsWith("modules="))) save("modulesBase", b);
      const url = b ? (b.endsWith("/") ? b : b + "/") : RELEASE;
      setBase(url);
      api
        .fetchManifest(url + "manifest.json")
        .then((t) => {
          const m = JSON.parse(t) as { modules: Offer[] };
          setOffers(m.modules);
          save("offers", m.modules);
          setOffline(null);
          // Debug: get=<file> starts that download, for testing without a tap.
          const want = sc.find((x) => x.startsWith("get="))?.slice(4);
          const o = want && m.modules.find((x) => x.file === want);
          if (o) setGet(o);
        })
        .catch((e) => setOffline(String(e)));
    });
    const un = listen<{ file: string; done: number; total: number }>("download", (e) =>
      setGoing((g) => (g[e.payload.file] ? { ...g, [e.payload.file]: { done: e.payload.done, total: e.payload.total } } : g)),
    );
    return () => {
      un.then((f) => f());
    };
  }, []);

  const get = (o: Offer) => {
    setGoing((g) => ({ ...g, [o.file]: { done: 0, total: o.size } }));
    api
      .download(base + o.file + ".gz", o.file, o.sha256, o.size)
      .then(() => {
        setGoing((g) => {
          const { [o.file]: _, ...rest } = g;
          return rest;
        });
        onChanged();
      })
      .catch((e) =>
        setGoing((g) => {
          if (String(e) === "cancelled") {
            const { [o.file]: _, ...rest } = g;
            return rest;
          }
          return { ...g, [o.file]: { done: 0, total: o.size, error: String(e) } };
        }),
      );
  };
  useEffect(() => {
    if (toStart) get(toStart);
  }, [toStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = (m: Module) => {
    setRemoving(null);
    api
      .removeModule(m.file)
      .then(onChanged)
      .catch(() => {});
  };

  const g = GROUPS.find((x) => x.id === group)!;
  const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  const here = modules.filter((m) => g.kinds.includes(m.kind)).sort(byTitle);
  const have = new Set(modules.map((m) => m.file));
  const toGet = offers.filter((o) => g.kinds.includes(o.kind) && !have.has(o.file)).sort(byTitle);
  const used = modules.reduce((n, m) => n + m.size, 0);

  return (
    <>
      <header className="topbar">
        <NavButtons />
        <h1 className="bartitle">Library</h1>
        <span className="spacer" />
        <span className="m" style={{ paddingRight: 4 }}>
          {mb(used)} used
        </span>
      </header>
      <div className="results">
        <div className="seg fit" role="tablist" style={{ margin: "0 0 14px" }}>
          {GROUPS.map((x) => (
            <button key={x.id} role="tab" aria-selected={group === x.id} onClick={() => setGroup(x.id)}>
              {x.name}
            </button>
          ))}
        </div>

        <div className="card flush" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 10px 0 14px" }}>
            <p className="label" style={{ margin: 0, flex: 1 }}>
              On this phone
            </p>
            {/* A module from elsewhere (AirDropped to Downloads, iCloud Drive, a USB stick): chosen in the system's
                picker, copied to the Inbox, and taken in by App.tsx, which says what came. */}
            <button
              className="mini accent"
              onClick={() =>
                invoke<{ count: number }>("plugin:tes-native|pick_modules")
                  .then((r) => r.count && window.dispatchEvent(new CustomEvent("tes-inbox", { detail: { count: r.count } })))
                  .catch((e) => invoke("log", { msg: `pick_modules: ${e}` }))
              }
            >
              Add from Files
            </button>
          </div>
          {here.length ? (
            here.map((m) => (
              <div key={m.file} className="row">
                <span className="grow" style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                  <span>{m.title}</span>
                  <span className="m">
                    {whence(m)} · {mb(m.size)}
                  </span>
                </span>
                <InfoButton label={m.title} onClick={() => showAbout(m)} />
                {m.kind !== "bible" && m.kind !== "commentary" && (
                  <button
                    className="mini accent"
                    onClick={() => (m.kind === "dictionary" ? onDictionary(m.id) : m.kind === "lexicon" ? onLexicon() : onRead(m.id))}
                  >
                    {m.kind === "reference" || m.kind === "devotional" ? "Read" : "Open"}
                  </button>
                )}
                {m.source === "app" && (
                  <button className="round danger" aria-label={`Remove ${m.title}`} onClick={() => setRemoving(m)}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="empty" style={{ padding: "0 14px 12px" }}>
              None yet.
            </p>
          )}
        </div>

        <div className="card flush">
          <p className="label" style={{ padding: "12px 14px 4px", margin: 0 }}>
            To download
          </p>
          {toGet.map((o) => {
            const d = going[o.file];
            return (
              <div key={o.file} className="row">
                <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", minWidth: 0 }}>
                  <span>{o.title}</span>
                  {d && !d.error ? (
                    <span className="progress">
                      <span style={{ width: `${Math.min(100, (d.done / Math.max(1, d.total)) * 100)}%` }} />
                    </span>
                  ) : (
                    <span className="m" style={d?.error ? { color: "var(--red)" } : undefined}>
                      {d?.error ? `Couldn't download: ${d.error}` : `${mb(o.gz)} to download · ${mb(o.size)} on the phone`}
                    </span>
                  )}
                </span>
                <InfoButton label={o.title} onClick={() => showOffer(o)} />
                {d && !d.error ? (
                  <button className="mini" aria-label={`Stop downloading ${o.title}`} onClick={() => api.cancelDownload(o.file)}>
                    ✕
                  </button>
                ) : (
                  <button className="round" aria-label={`Download ${o.title}`} onClick={() => get(o)}>
                    <Icon name="download" size={18} />
                  </button>
                )}
              </div>
            );
          })}
          {!toGet.length && (
            <p className="empty" style={{ padding: "0 14px 12px" }}>
              {offers.length ? "You have them all." : offline ? "The downloads can't be reached just now." : "Looking…"}
            </p>
          )}
        </div>
        {offline && offers.length > 0 && (
          <p className="m" style={{ marginTop: 10 }}>
            Offline: this is the list from last time.
          </p>
        )}
        <p className="m" style={{ marginTop: 12, lineHeight: 1.5 }}>
          Everything here is in the public domain, built for Two-edged Sword from its original sources.
        </p>
      </div>

      {about && (
        <>
          <div className="scrim" onClick={() => setAbout(null)} />
          <section className="sheet tall" aria-label={`About ${about.title}`}>
            <div className="grab" onClick={() => setAbout(null)}>
              <span />
            </div>
            <div className="shead">
              <h2 style={{ flex: 1 }}>{about.title}</h2>
              <button className="done" onClick={() => setAbout(null)}>
                Done
              </button>
            </div>
            <div className="sbody">
              <p className="m" style={{ marginTop: 0 }}>
                {about.sub}
              </p>
              {about.html === null ? (
                <p className="empty">Opening…</p>
              ) : about.html.trim() ? (
                <div className="prose about">{renderHtml(about.html, { onImage: setImage })}</div>
              ) : (
                <p className="empty">It has no description.</p>
              )}
            </div>
          </section>
        </>
      )}

      {removing && (
        <>
          <div className="scrim" onClick={() => setRemoving(null)} />
          <section className="sheet" aria-label="Remove" style={{ padding: "16px 16px calc(var(--bottom) + 16px)" }}>
            <p style={{ margin: "0 0 14px", fontSize: 16 }}>
              Remove {removing.title}? It frees {mb(removing.size)}, and you can download it again.
            </p>
            <div className="actions">
              <button className="secondary" onClick={() => setRemoving(null)}>
                Keep
              </button>
              <button className="primary danger" onClick={() => remove(removing)}>
                Remove
              </button>
            </div>
          </section>
        </>
      )}
      {image && <ImageViewer src={image} onClose={() => setImage(null)} />}
    </>
  );
}

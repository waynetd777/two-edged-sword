import { useEffect, useState } from "react";
import { api, Verse } from "./api";
import { fmtRef, Ref } from "./bible";
import { plainText } from "./esword";
import { findRefs } from "./md";
import { useApp } from "./state";
import { useRefPreview } from "./StudyPane";
import { Popover } from "./ui";

/** Where a translation's reading differs in meaning from a base Bible's (the KJV), from
 * `variances-<module>.json` in the app's data folder. tools/variances/ builds the file. */
export interface Variance { book: number; chapter: number; verse: number; kind: string; weight: "major" | "minor"; change: string; note: string }
interface VarianceFile { module: string; base: string; updated: string; records: Variance[] }

export const varianceStore = (module: string) => "variances-" + module.replace(/[^A-Za-z0-9_-]/g, "_");

/** This chapter's variances by verse, and the base Bible they are measured against. */
export function useVariances(module: string, book: number, chapter: number) {
  const [file, setFile] = useState<VarianceFile | null>(null);
  useEffect(() => {
    let live = true;
    setFile(null);
    api.storeRead<VarianceFile>(varianceStore(module)).then((f) => { if (live) setFile(f); }).catch(() => {});
    return () => { live = false; };
  }, [module]);
  const byVerse = new Map<number, Variance>();
  for (const r of file?.records ?? []) if (r.book === book && r.chapter === chapter) byVerse.set(r.verse, r);
  return { base: file?.base ?? null, byVerse };
}

const KIND: Record<string, string> = { omission: "Omission", deity: "Deity of Christ", atonement: "Atonement", trinity: "Trinity", salvation: "Salvation", judgment: "Judgment", prophecy: "Prophecy", "virgin-birth": "Virgin birth", other: "Other" };

export function VariancePopover({ v, anchor, base, module, moduleTitle, text, onClose }: { v: Variance; anchor: DOMRect; base: string; module: string; moduleTitle: string; text: string | null; onClose: () => void }) {
  const [baseVerse, setBaseVerse] = useState<Verse | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    api.chapter(base, v.book, v.chapter).then((vs) => { if (live) setBaseVerse(vs.find((x) => x.v === v.verse) ?? null); }).catch(() => live && setBaseVerse(null));
    return () => { live = false; };
  }, [base, v.book, v.chapter, v.verse]);
  const app = useApp();
  const { onRefHover, preview, hide } = useRefPreview(app.settings.bible);
  const open = (r: Ref) => { hide(); onClose(); app.open({ book: r.book, chapter: r.chapter, verse: r.verse, to: r.to }, "read"); };
  /** Text with its references as links: hover for the verse, click to open it, as elsewhere. */
  const linked = (text: string) => {
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const h of findRefs(text)) {
      out.push(text.slice(last, h.index));
      out.push(<a key={h.index} className="ref" onClick={() => open(h.ref)} onMouseEnter={(e) => onRefHover(h.ref, e.currentTarget)} onMouseLeave={() => onRefHover(null, null)}>{text.slice(h.index, h.index + h.length)}</a>);
      last = h.index + h.length;
    }
    out.push(text.slice(last));
    return out;
  };
  const label = { font: "600 11px var(--ui)", letterSpacing: "0.04em", textTransform: "uppercase" as const, color: "var(--muted)", marginBottom: 2 };
  const reading = { font: "400 15px/1.55 var(--serif)", margin: "0 0 12px" };
  return (
    <>
    <Popover anchor={anchor} onClose={onClose} width={420}>
      <div style={{ padding: "12px 14px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <strong style={{ font: "600 14px var(--ui)" }}>{fmtRef({ book: v.book, chapter: v.chapter, verse: v.verse })}</strong>
          <span style={{ font: "500 12px var(--ui)", color: v.weight === "major" ? "var(--accent)" : "var(--muted)" }}>{KIND[v.kind] ?? v.kind} · {v.weight}</span>
        </div>
        <p style={{ font: "500 14px/1.4 var(--ui)", margin: "0 0 12px" }}>{linked(v.change)}</p>
        <div style={label}>{base.toUpperCase()}</div>
        <p style={reading}>{baseVerse === undefined ? "…" : baseVerse ? plainText(baseVerse.text) : "Not in this Bible."}</p>
        <div style={label}>{moduleTitle || module.toUpperCase()}</div>
        <p style={{ ...reading, color: text ? undefined : "var(--muted)", fontStyle: text ? undefined : "italic" }}>{text ? plainText(text) : "Not in this translation."}</p>
        <p style={{ font: "400 13px/1.5 var(--ui)", color: "var(--muted)", margin: 0 }}>{linked(v.note)}</p>
      </div>
    </Popover>
    {preview}
    </>
  );
}

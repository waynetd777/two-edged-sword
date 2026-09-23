// Stroke icons on a 16px grid, drawn in currentColor.

const P: Record<string, string> = {
  read: "M2 3h4a2 2 0 0 1 2 2v8.5A1.5 1.5 0 0 0 6.5 12H2zM14 3h-4a2 2 0 0 0-2 2v8.5A1.5 1.5 0 0 1 9.5 12H14z",
  compare: "M3 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM10 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z",
  search: "M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.5 10.5L14 14",
  word: "M2 13L5.5 3 9 13M3.3 9.5h4.4M12 8.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM14 8v5",
  journal: "M3 13.5l.8-3.2L10.6 3.5l2.4 2.4-6.8 6.8zM9.2 4.9l2.4 2.4",
  plans: "M4 3.5h8a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 13.5H4A1.5 1.5 0 0 1 2.5 12V5A1.5 1.5 0 0 1 4 3.5zM2.5 6.5h11M5.5 2v3M10.5 2v3M5.5 10l1.5 1.5 3-3",
  library: "M3 2.5v11M6 2.5v11M9 3.2l3.6 10",
  settings: "M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
  bookmark: "M4 2.5h8v11l-4-3-4 3z",
  folder: "M2.5 4.5h4l1.5 1.5h5.5v7h-11z",
  back: "M10 3L5 8l5 5",
  fwd: "M6 3l5 5-5 5",
  down: "M4 6l4 4 4-4",
  up: "M4 10l4-4 4 4",
  plus: "M8 3v10M3 8h10",
  minus: "M3.5 8h9",
  x: "M4 4l8 8M12 4l-8 8",
  check: "M3.5 8.5l3 3 6-6.5",
  note: "M3 2.5h7l3 3v8H3zM5.5 7.5h5M5.5 10h3.5",
  copy: "M6.5 5h5.5A1.5 1.5 0 0 1 13.5 6.5v5.5a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 12V6.5A1.5 1.5 0 0 1 6.5 5zM3 11V3.5A1 1 0 0 1 4 2.5h7",
  speaker: "M2.5 6h2.5l3.5-3v10l-3.5-3H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.7a6 6 0 0 1 0 8.6",
  textsize: "M1.5 12.5L4.5 4l3 8.5M2.5 10h4M9 12.5l2.5-6 2.5 6M9.8 10.8h3.4",
  focus: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  pane: "M3.5 2.5h9a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4a1.5 1.5 0 0 1 1.5-1.5zM9.5 2.5v11",
  link: "M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.7.7M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.7-.7",
  chat: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z",
  clock: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5v3l2 1.5",
  send: "M8 13V3M3.5 7.5L8 3l4.5 4.5",
  refresh: "M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3",
  moon: "M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z",
  prev: "M4 3.5v9M12.5 3.5L6.5 8l6 4.5z",
  next: "M12 3.5v9M3.5 3.5l6 4.5-6 4.5z",
  highlight: "M4.5 11.5l6-6 2 2-6 6h-2zM2 14.5h5",
  list: "M6 4h8M6 8h8M6 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5",
  olist: "M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5M2.5 3l1-.5V6",
  quote: "M3 9.5h3v3.5H3zM3 9.5C3 6 4.5 4.5 6 4M9.5 9.5h3v3.5h-3zM9.5 9.5c0-3.5 1.5-5 3-5.5",
  map: "M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9",
  export: "M8 10V2.5M5 5.5l3-3 3 3M3 9.5v3.5h10V9.5",
  finder: "M2.5 3.5h11v9h-11zM2.5 6h11",
  stop: "M4 4h8v8H4z",
  info: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 7.5v3.5M8 5v.5",
  dots: "M3.5 8h.01M8 8h.01M12.5 8h.01",
};

export function Icon({ name, size, className, style }: { name: keyof typeof P | string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`i ${className ?? ""}`} viewBox="0 0 16 16" aria-hidden="true" style={{ ...(size ? { width: size, height: size } : null), ...style }}>
      <path d={P[name] ?? ""} />
    </svg>
  );
}

export function Play({ size = 14 }: { size?: number }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: size, height: size, fill: "currentColor" }}><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" /></svg>;
}
export function Pause({ size = 14 }: { size?: number }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: size, height: size, fill: "currentColor" }}><rect x="3.5" y="2.5" width="3" height="11" rx="1" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" /></svg>;
}

/** The sidebar mark: the app icon's gold sword, without its tile. */
export function Sword({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="300 160 424 736" aria-hidden="true" style={{ width: (size * 424) / 736, height: size }}>
      <path d="M512 176L470 262V640H512Z" fill="#efd9a4" />
      <path d="M512 176L554 262V640H512Z" fill="#c6974a" />
      <path d="M512 292V604" stroke="#8a6630" strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M334 648Q512 612 690 648V684Q512 652 334 684Z" fill="#d8b160" />
      <circle cx="334" cy="666" r="26" fill="#d8b160" /><circle cx="690" cy="666" r="26" fill="#d8b160" />
      <rect x="486" y="674" width="52" height="136" rx="12" fill="#6e4526" />
      <path d="M486 704L538 720M486 734L538 750M486 764L538 780" stroke="#8e5d35" strokeWidth="8" fill="none" />
      <circle cx="512" cy="840" r="40" fill="#d8b160" /><circle cx="512" cy="840" r="14" fill="#b48a3e" />
    </svg>
  );
}

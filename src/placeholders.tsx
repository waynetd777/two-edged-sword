import { SearchField, Topbar } from "./Shell";

/** Screens not built yet. */
export function ComparePlaceholder({ screen, openPalette }: { screen: string; openPalette: () => void }) {
  return (
    <div className="main">
      <Topbar><SearchField onOpen={openPalette} /></Topbar>
      <div className="empty">The {screen} screen is coming next.</div>
    </div>
  );
}

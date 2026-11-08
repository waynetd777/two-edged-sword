// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// Tests of sync's merging (src/sync.ts), run with Node: node --experimental-strip-types tools/sync_test.ts
// Neutral examples only: no real journal text.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPayload, clamp, keepBoth, merge, payload, removedKeys, settle, stamp, validValue } from "../src/sync.ts";
import type { Ledger, Payload } from "../src/sync.ts";

const entry = (id: string, body = "Some text.") => ({
  id,
  title: "A title",
  created: "2026-01-02T03:04",
  updated: "2026-01-02T03:04",
  verses: ["John 1:1"],
  tags: ["one"],
  body,
});

test("only what was removed on purpose is stamped removed", () => {
  const ledger: Ledger = stamp({}, { "hl|1.1.1": "yellow", "j|a": entry("a"), "j|b": entry("b") }, new Set(), 100);
  // j|a deleted here; j|b merely missing (a month not read): unknown, left as it was.
  const next = stamp(ledger, { "hl|1.1.1": "yellow" }, new Set(["j|a"]), 200);
  assert.deepEqual(next["j|a"], { t: 200, del: true });
  assert.deepEqual(next["j|b"], ledger["j|b"]);
  // The unknown one isn't sent at all: the other side keeps its own.
  const p = payload(next, { "hl|1.1.1": "yellow" }, []);
  assert.deepEqual(Object.keys(p.items).sort(), ["hl|1.1.1", "j|a"]);
  assert.equal(p.items["j|a"].del, true);
  // And comes back from the other side's.
  const theirs: Payload = { v: 1, items: { "j|b": { t: 100, v: entry("b") } }, recent: [] };
  assert.ok("j|b" in settle(merge(p, theirs)).now);
});

test("what changed here is found by comparing with the last look", () => {
  assert.deepEqual(removedKeys({ a: 1, b: 2, "j|c": 3 }, { a: 1 }, (k) => k.startsWith("j|")), ["b"]);
});

test("a ledger made afresh loses to the other side's values", () => {
  const mine = payload(stamp({}, { "hl|1.1.1": "yellow" }, new Set(), 0), { "hl|1.1.1": "yellow" }, []);
  const theirs: Payload = { v: 1, items: { "hl|1.1.1": { t: 5, v: "green" } }, recent: [] };
  assert.equal(settle(merge(mine, theirs)).now["hl|1.1.1"], "green");
});

test("keepBoth keeps two copies only when both changed since they last synced", () => {
  const mine = { "j|a": { t: 500, v: entry("a", "Computer's edit.") } };
  const theirs: Payload = { v: 1, since: 400, changed: ["j|a"], from: "iPhone", items: { "j|a": { t: 50, v: entry("a", "Phone's edit.") } }, recent: [] };
  // The phone's clock is far behind (t 50), but it says it changed the entry: both are kept.
  const out = keepBoth({ ...mine }, theirs);
  assert.equal(out["j|a"], undefined);
  const copy = Object.entries(out).find(([k]) => k.startsWith("j|a-"));
  assert.ok(copy && (copy[1].v as { title: string }).title === "A title (from iPhone)");
  // Not changed on the phone since: no copy, the newer wins as usual.
  assert.deepEqual(keepBoth({ ...mine }, { ...theirs, changed: [] }), theirs.items);
  // Not changed on the computer since: no copy.
  assert.deepEqual(keepBoth({ "j|a": { t: 300, v: entry("a", "Old.") } }, theirs), theirs.items);
});

test("times from a clock that's ahead are brought back to now", () => {
  assert.deepEqual(clamp({ a: { t: 10, v: 1 }, b: { t: 99, del: true } }, 50), { a: { t: 10, v: 1 }, b: { t: 50, del: true } });
});

test("what comes in is checked by kind", () => {
  assert.ok(validValue("j|a", entry("a")));
  assert.ok(!validValue("j|b", entry("a")));
  assert.ok(!validValue("j|a", { ...entry("a"), created: "yesterday" }));
  assert.ok(!validValue("j|a", { ...entry("a"), tags: [1] }));
  assert.ok(validValue("hl|1.1.1", "teal") && !validValue("hl|1.1.1", "pink"));
  assert.ok(validValue("bm|v|43.3.16", { book: 43, chapter: 3, verse: 16, bible: "kjv", created: "2026-01-01" }));
  assert.ok(!validValue("bm|v|43.3.17", { book: 43, chapter: 3, verse: 16, bible: "kjv", created: "2026-01-01" }));
  assert.ok(validValue("pd|p1|done|3", 1) && !validValue("pd|p1|done|3", "1"));
  assert.ok(validValue("plan|p1", { id: "p1", kind: "sequence", start: "2026-01-01" }));
  assert.ok(!validValue("plan|p1", { id: "p2", kind: "sequence", start: "2026-01-01" }));
  assert.ok(!validValue("zz|x", 1));

  const r = checkPayload({
    v: 1,
    items: { "j|a": { t: 1, v: entry("a") }, "j|b": { t: 1, v: entry("x") }, "hl|1.1.1": { t: 2, del: true }, bad: { t: "x" } },
    recent: [{ at: 1, book: 1, chapter: 1 }, { at: "x" }],
    changed: ["j|a", 3],
    journal: true,
  });
  assert.ok(r);
  assert.deepEqual(Object.keys(r.payload.items).sort(), ["hl|1.1.1", "j|a"]);
  assert.deepEqual(r.dropped.sort(), ["bad", "j|b", "recent"]);
  assert.deepEqual(r.payload.changed, ["j|a"]);
  assert.equal(r.payload.recent.length, 1);
  assert.equal(checkPayload({ v: 2, items: {}, recent: [] }), null);
  assert.equal(checkPayload({ v: 1, items: [], recent: [] }), null);
});

test("sync status: a dot only when something isn't right", async () => {
  const { deviceLevel, deviceLine, lastLine, worst, DAY } = await import("../src/syncStatus.ts");
  const now = 100 * DAY;
  const d = { id: "a", name: "Phone", paired: now - 30 * DAY, seen: now - 60_000, ok: now - 120_000, sent: 3, received: 1, err: "", errAt: 0, red: false };
  assert.equal(deviceLevel(d, now), "ok");
  assert.equal(deviceLine(d, now), "Synced 2 min ago · 3 sent, 1 received");
  // A failure since the last that worked: amber, or red when it needs the user; an older one doesn't count.
  const failed = { ...d, err: "The app on the computer didn't answer.", errAt: now - 300_000 };
  assert.equal(deviceLevel(failed, now), "ok");
  const later = { ...d, err: "The app on the computer didn't answer.", errAt: now - 60_000 };
  assert.equal(deviceLevel(later, now), "amber");
  assert.equal(deviceLevel({ ...later, red: true }, now), "red");
  assert.equal(deviceLine(later, now), "Failed 1 min ago: The app on the computer didn't answer.");
  // Not synced for over a week.
  const quiet = { ...d, ok: now - 9 * DAY, seen: now - 9 * DAY };
  assert.equal(deviceLevel(quiet, now), "amber");
  assert.equal(deviceLine(quiet, now), "Not synced for 9 days");
  assert.equal(worst(["ok", "amber", "red"]), "red");
  assert.equal(worst([]), "ok");
  assert.equal(lastLine({ ok: 0, sent: 0, received: 0, err: "", errAt: 0 }, now), "Not synced yet");
});

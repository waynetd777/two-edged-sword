#!/usr/bin/env python3
# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""The website tutorials' demo: a home folder for the app to run in (HOME), so their pictures show
invented highlights, bookmarks, journal entries and a reading plan, never the user's own, and only
the built-in modules, which are public domain or openly licensed (no e-Sword X library is found
there, and its modules folder is empty).

The tutorials follow one invented story: you lead the Thursday group at Hillside Church through
Romans 8, Anna asks why her Bible leaves out part of Colossians 1:14, and you keep a daily quiet
time. tools/screenshots.py builds this with "home": "demo" in a scene; the search index, which
takes a while, is kept between runs.

    python3 tools/screenshots/demo_home.py       # (re)write its data; the search index is kept
"""

import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
HOME = ROOT / "tools" / "screenshots" / "out" / "home"
DATA = HOME / "Library" / "Application Support" / "Two-edged Sword"
JOURNAL = HOME / "Documents" / "Two-edged Sword"

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def ymd(d):
    return d.strftime("%Y-%m-%d")


def settings():
    return {
        "theme": "dark",
        "bible": "kjv",
        "favBibles": ["kjv", "web", "bsb"],
        "compare": ["kjv", "asv", "ylt"],
        "layout": "verse",
        "redLetters": True,
        "studyPane": True,
        "studyTab": "commentary",
        "hlNames": {"yellow": "Promises", "red": "Grace", "blue": "Prayer", "green": "Obedience", "purple": "Praise"},
        "offerGuide": False,
        "model": "claude:sonnet",
        "reminder": True,
        "reminderTime": "06:30",
    }


# Highlights, by "book.chapter.verse": the verses the story's reader has marked.
HIGHLIGHTS = {
    **{f"45.8.{v}": "yellow" for v in (1, 28, 38, 39)},
    "45.8.15": "purple",
    "45.8.26": "blue",
    "43.3.16": "red",
    "43.3.17": "red",
    "19.23.1": "yellow",
    "19.23.4": "yellow",
    "20.3.5": "green",
    "20.3.6": "green",
    "50.4.6": "blue",
    "50.4.7": "blue",
    "51.1.14": "red",
}


def entry(id, title, created, verses, tags, body):
    return {"id": id, "title": title, "created": created, "updated": created, "verses": verses, "tags": tags, "body": body}


def entries(today):
    def at(days, hm):
        return (today - datetime.timedelta(days=days)).strftime("%Y-%m-%dT") + hm

    return [
        entry("demo-condemnation", "No condemnation", at(12, "06:40"), ["Romans 8:1"], ["devotion"],
              "There is therefore now no condemnation to them which are in Christ Jesus (Romans 8:1).\n\nThe chapter opens with the verdict before the struggle. Whatever Romans 7 described, this is where it lands."),
        entry("demo-shepherd", "The LORD is my shepherd", at(9, "06:35"), ["Psalm 23"], ["prayer"],
              "Easton's says a shepherd led the flock, guarded it at night and counted the sheep in at the door. Psalm 23 is all of that, said of God.\n\nLord, lead me beside the still waters today."),
        entry("demo-born-again", "Born again", at(6, "07:10"), ["John 3:3–8"], ["study"],
              "Nicodemus came by night. Jesus answers a question he hasn't asked yet: except a man be born again (John 3:3).\n\nThe wind blows where it will (John 3:8): you see what it does, not where it comes from."),
        entry("demo-romans-8", "Romans 8 for Thursday", at(3, "20:15"), ["Romans 8:28–39"], ["study", "group"],
              "### Outline\n\n- Romans 8:28: all things work together for good. Not that all things are good.\n- Romans 8:29–30: the golden chain, from foreknew to glorified.\n- Romans 8:31–39: if God be for us, who can be against us?\n\n### Questions for the group\n\n- What does \"called according to his purpose\" mean? Compare Henry, Clarke and Wesley.\n- Which of the things in verses 38 and 39 do you most need to hear about this week?"),
        entry("demo-colossians", "Through his blood?", at(1, "21:05"), ["Colossians 1:14"], ["question"],
              "Anna asked on Thursday why her Bible leaves out \"through his blood\" in Colossians 1:14.\n\nThe ≠ beside the verse says why: the words are in the Greek text the KJV was translated from, but not in most Greek manuscripts. They are certainly in Ephesians 1:7."),
    ]


def render(e):
    dt = datetime.datetime.strptime(e["created"], "%Y-%m-%dT%H:%M")
    esc = lambda v: v.replace("\\", "\\\\").replace('"', '\\"').replace("--", "\\-\\-").replace("\n", " ")
    meta = f"*{DAYS[dt.weekday()]} {dt.day} {MONTHS[dt.month - 1]} {dt.year} · {dt.strftime('%H:%M')}*"
    if e["verses"]:
        meta += " · " + ", ".join(e["verses"])
    if e["tags"]:
        meta += " · " + " ".join("#" + t for t in e["tags"])
    return (f"## {e['title']}\n"
            f"<!-- tes id=\"{esc(e['id'])}\" created=\"{esc(e['created'])}\" updated=\"{esc(e['updated'])}\" verses=\"{esc('|'.join(e['verses']))}\" tags=\"{esc(','.join(e['tags']))}\" -->\n"
            f"{meta}\n\n{e['body'].rstrip()}\n\n")


def plans(today):
    # A Psalm, a Proverb and one more, two weeks in, read every day but one.
    start = today - datetime.timedelta(days=14)
    done = [ymd(start + datetime.timedelta(days=i)) for i in range(14) if i != 5]
    return [{
        "id": "demo-plan", "kind": "ppo", "name": "Psalm, Proverb and one more", "active": True, "bible": "kjv",
        "start": ymd(start), "nextPsalm": 15, "nextOther": [43, 3], "otherFrom": "all", "shortMonths": "last",
        "devotionals": ["sme"], "worship": {"before": 1, "after": 1}, "closing": True,
        "finale": {"b": 20, "c": 3, "v": 5, "v2": 6}, "doneDates": done, "progress": {"done": [], "key": ymd(today)},
    }]


def main():
    today = datetime.date.today()
    # Written over in place, never removed, so a scene already running on it (or building its
    # search index) isn't disturbed.
    (DATA / "Modules").mkdir(parents=True, exist_ok=True)
    JOURNAL.mkdir(parents=True, exist_ok=True)
    for old in JOURNAL.glob("Me. Journal - *.md"):
        old.unlink()
    write = lambda name, v: (DATA / f"{name}.json").write_text(json.dumps(v, indent=2, ensure_ascii=False), encoding="utf-8")
    write("settings", settings())
    write("highlights", HIGHLIGHTS)
    created = lambda days: (datetime.datetime.combine(today, datetime.time(7)) - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    write("bookmarks", [
        {"id": "demo-bm-1", "ref": {"book": 45, "chapter": 8, "verse": 28}, "bible": "kjv", "created": created(10)},
        {"id": "demo-bm-2", "ref": {"book": 19, "chapter": 23, "verse": 1}, "bible": "kjv", "created": created(8)},
        {"id": "demo-bm-3", "ref": {"book": 20, "chapter": 3, "verse": 5}, "bible": "kjv", "created": created(4)},
    ])
    write("place", {"loc": {"book": 45, "chapter": 8}, "doc": None, "word": None, "recent": [
        {"at": created(0), "book": 45, "chapter": 8},
        {"at": created(1), "book": 51, "chapter": 1},
        {"at": created(2), "book": 43, "chapter": 3},
        {"at": created(3), "book": 19, "chapter": 23},
    ]})
    write("plans", plans(today))
    months = {}
    for e in entries(today):
        months.setdefault(e["created"][:7], []).append(e)
    for key, es in months.items():
        text = f"# {MONTHS[int(key[5:7]) - 1]} {key[:4]}\n\n" + "".join(render(e) for e in sorted(es, key=lambda e: e["created"]))
        (JOURNAL / f"Me. Journal - {key}.md").write_text(text, encoding="utf-8")
    print(f"  {HOME.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

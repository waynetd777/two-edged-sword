// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ModuleInfo } from "./api";
import { AskPanel } from "./Ask";
import { useAssistant } from "./assistant";
import { Icon } from "./icons";
import { Topbar } from "./Shell";
import { useApp } from "./state";
import { APOCRYPHA, BookSizes } from "./bible";
import { bibleSizes, Popover } from "./ui";

/** Where the King James Version came from: the manuscript traditions, the printed editions the
 * translators worked from (1604–1611), the English Bibles before it, and which of them, or what
 * comes closest, is in the user's library. */

interface Source {
  id: string;
  name: string;
  date: string;
  note: string;
  /** Its place in the KJV's story: what the KJV took from it, or how it stands to the KJV. */
  kjv: string;
  /** What it drew on (ids of other sources). */
  from?: string[];
  /** Library Bibles that are this text, and ones that come closest, by title or abbreviation. */
  have?: RegExp;
  near?: RegExp;
  nearNote?: string;
  /** After the KJV: its first year, which places it in the tree, and the Greek its New Testament follows. */
  year?: number;
  nt?: "TR" | "MT" | "CT";
}

const TIERS: { name: string; hint: string; items: Source[] }[] = [
  {
    name: "Manuscript traditions",
    hint: "The handwritten copies behind the printed texts",
    items: [
      {
        id: "mt",
        name: "Masoretic Hebrew",
        date: "copies c. 900–1500",
        note: "The Hebrew Old Testament as the Masoretes fixed its letters, vowels and accents. The KJV's Old Testament follows it.",
        kjv: "The KJV's Old Testament is translated from it, through the printed Rabbinic Bible. Where the KJV's Old Testament differs from the Septuagint or the Vulgate, it is usually following the Masoretic text.",
        have: /Westminster Leningrad|Hebrew Old Testament \(Tanach\)|Miqra according to the Masorah/i,
      },
      {
        id: "byz",
        name: "Byzantine Greek",
        date: "copies c. 400–1500",
        note: "The Greek New Testament as most surviving manuscripts give it. The printed Greek editions of the 1500s were made from a handful of late Byzantine copies.",
        kjv: "The KJV's New Testament rests on it at one remove: the Textus Receptus was printed from a few Byzantine copies. Most places where the KJV differs from modern versions are Byzantine readings.",
        have: /Byzantine/i,
      },
      {
        id: "vul",
        name: "Latin Vulgate",
        date: "Jerome, c. 382–405",
        note: "The Latin Bible of the Western church for a thousand years; the translators consulted it throughout.",
        kjv: "The translators read it beside the Hebrew and Greek, and many of its words reached the KJV through earlier English Bibles. Erasmus used it to fill gaps in his Greek, so a few Vulgate readings (the last verses of Revelation) are in the KJV.",
        have: /Clementine/i,
        near: /Latin Vulgate/i,
        nearNote:
          "A modern critical edition of Jerome's text, not the Clementine the translators knew (it lacks 1 John 5:7 and Acts 8:37).",
      },
      {
        id: "lxx",
        name: "Septuagint",
        date: "Greek, c. 250–100 BC",
        note: "The Greek Old Testament, quoted by the apostles. Consulted for hard Hebrew passages.",
        kjv: "A second witness to the Old Testament: the translators checked it where the Hebrew was obscure. The New Testament often quotes the Old in its wording, so the KJV's quotations sometimes differ from its own Old Testament.",
        have: /Greek Old Testament \(Septuagint\)|Septuagint LXX Greek|^Septuagint \(Greek, Brenton/i,
        near: /Brenton/i,
        nearNote: "Brenton's English translation (1844).",
      },
      {
        id: "tg",
        name: "Aramaic Targums",
        date: "c. 100–700",
        note: "Aramaic paraphrases of the Hebrew read in the synagogue; printed in the Rabbinic Bibles and polyglots the translators used.",
        kjv: "Helped the translators with rare Hebrew words and the Jewish reading of hard passages; they had it in the Rabbinic Bible and the polyglots.",
        have: /^Targum/i,
      },
      {
        id: "syr",
        name: "Syriac Peshitta",
        date: "c. 150–450",
        note: "An early Syriac translation; its New Testament was printed in the Antwerp Polyglot and by Tremellius (1569).",
        kjv: "A minor witness for the New Testament, which the translators could read in Latin in Tremellius' edition.",
        have: /Peshitta|Syriac/i,
      },
    ],
  },
  {
    name: "Printed editions the translators used",
    hint: "On the desks of the six companies at Westminster, Oxford and Cambridge",
    items: [
      {
        id: "bomberg",
        name: "Rabbinic Bible",
        date: "Bomberg, 1524–25",
        note: "Jacob ben Chayyim's edition of the Masoretic text with the Targums: the standard Hebrew Bible of the day.",
        kjv: "The Hebrew text the translators worked from: the KJV's Old Testament is a translation of this edition or a reprint of it.",
        from: ["mt", "tg"],
        have: /^Hebrew Bible \(Ginsburg/i,
        near: /Westminster Leningrad|Hebrew Old Testament \(Tanach\)|Miqra according to the Masorah/i,
        nearNote: "The same Masoretic text from the Leningrad and Aleppo Codices.",
      },
      {
        id: "compl",
        name: "Complutensian Polyglot",
        date: "Alcalá, 1514–17",
        note: "Hebrew, Greek, Latin and Aramaic in parallel columns; the first printed Greek New Testament.",
        kjv: "One of the reference editions on the translators' desks: its parallel columns let them compare the Hebrew, Greek and Latin readings of a passage.",
        from: ["mt", "lxx", "vul", "tg", "byz"],
      },
      {
        id: "antwerp",
        name: "Antwerp Polyglot",
        date: "Plantin, 1569–72",
        note: "Hebrew, Greek, Latin, the Targums and the Syriac New Testament.",
        kjv: "Gave the translators the Syriac New Testament and the Targums beside the Hebrew and Greek, with a word-for-word Latin that helped with the sense.",
        from: ["mt", "lxx", "vul", "tg", "syr"],
      },
      {
        id: "erasmus",
        name: "Erasmus' Greek NT",
        date: "1516–1535",
        note: "The first published Greek New Testament, from about seven late Byzantine manuscripts; the root of the Textus Receptus.",
        kjv: "The start of the Greek text the KJV's New Testament follows; readings such as Acts 8:37 and the last verses of Revelation reached the KJV through him.",
        from: ["byz", "vul"],
        near: /Textus Receptus/i,
        nearNote: "Stephanus' 1550 text, built on Erasmus'.",
      },
      {
        id: "stephanus",
        name: "Stephanus' Greek NT",
        date: "1550",
        note: "Robert Estienne's edition of Erasmus' text with readings from other manuscripts: the Textus Receptus.",
        kjv: "His 1550 edition is the form of the Textus Receptus the KJV is most often compared with, and his 1551 edition gave the New Testament the verse numbers the KJV uses.",
        from: ["byz"],
        have: /Textus Receptus/i,
      },
      {
        id: "beza",
        name: "Beza's Greek NT",
        date: "1588–89, 1598",
        note: "Theodore Beza's revisions of the Textus Receptus, the translators' main Greek text.",
        kjv: "The Greek text the KJV follows most closely: where Beza differs from Stephanus, the KJV usually goes with Beza.",
        from: ["byz"],
        have: /^Greek NT: Beza \(1598\)( w\/ glosses)?$/i,
        near: /Textus Receptus|\(Interlinear\)/i,
        nearNote:
          "Scrivener's 1894 reconstruction of the KJV's Greek (shown as variants in TR+, and σ in INT+) follows Beza where the KJV does.",
      },
      {
        id: "tremellius",
        name: "Tremellius–Junius Latin",
        date: "1575–79",
        note: "A Protestant Latin translation from the Hebrew, with Tremellius' Latin of the Syriac New Testament.",
        kjv: "Consulted for the Old Testament, especially its Latin of difficult Hebrew; some KJV wording follows its sense.",
        from: ["mt", "syr"],
      },
      {
        id: "sixtine",
        name: "Sixtine Septuagint",
        date: "Rome, 1587",
        note: "The Septuagint printed from Codex Vaticanus.",
        kjv: "The standard printed Septuagint of the day, used to compare the Greek Old Testament with the Hebrew.",
        from: ["lxx"],
        have: /^Septuagint \(Greek, Brenton/i,
        near: /Brenton|Greek Old Testament \(Septuagint\)/i,
        nearNote:
          "Brenton's English (1844) translates a text descended from the Sixtine; Rahlfs' Greek (1935) also rests mainly on Vaticanus.",
      },
      {
        id: "clementine",
        name: "Clementine Vulgate",
        date: "1592",
        note: "The Vulgate as revised under Pope Clement VIII.",
        kjv: "The Vulgate as the translators knew it (1592), and the Latin behind the Rheims New Testament they also consulted.",
        from: ["vul"],
        have: /Clementine/i,
        near: /Latin Vulgate/i,
        nearNote: "A modern critical edition of the Vulgate, not the Clementine.",
      },
    ],
  },
  {
    name: "English Bibles before it",
    hint: "Rule 1: follow the Bishops' Bible, “as little altered as the truth of the original will permit”",
    items: [
      {
        id: "tyndale",
        name: "Tyndale",
        date: "NT 1526, Pentateuch 1530",
        note: "The first English New Testament from the Greek; much of the KJV's wording is his.",
        kjv: "The KJV's chief English source: by common estimates over 80% of its New Testament wording is Tyndale's, and much of its Pentateuch.",
        from: ["erasmus", "mt"],
        have: /Tyndale/i,
      },
      {
        id: "coverdale",
        name: "Coverdale",
        date: "1535",
        note: "The first complete printed English Bible, largely from Tyndale, the Latin and Luther.",
        kjv: "Gave the KJV many phrases, and finished the Old Testament books Tyndale didn't live to translate.",
        from: ["tyndale", "vul"],
        have: /Coverdale/i,
      },
      {
        id: "matthew",
        name: "Matthew's Bible",
        date: "1537",
        note: "Tyndale's work completed with Coverdale's, by John Rogers.",
        kjv: "Carried Tyndale's Old Testament books (Genesis to 2 Chronicles) into the line of English Bibles that leads to the KJV.",
        from: ["tyndale", "coverdale"],
        have: /Matthew'?s Bible/i,
      },
      {
        id: "great",
        name: "Great Bible",
        date: "1539",
        note: "The first English Bible authorised for the churches.",
        kjv: "Begins the line of official church Bibles that the Bishops' Bible and then the KJV continued.",
        from: ["matthew"],
        have: /Great Bible/i,
      },
      {
        id: "geneva",
        name: "Geneva Bible",
        date: "1560",
        note: "The Reformers' Bible, with notes; from the Hebrew and Beza's Greek. Shakespeare's and the Pilgrims' Bible.",
        kjv: "The KJV was meant partly to replace it. The translators drew heavily on its scholarship and wording, but left out its notes.",
        from: ["great", "beza", "bomberg"],
        have: /Geneva/i,
      },
      {
        id: "bishops",
        name: "Bishops' Bible",
        date: "1568; 1602 edition",
        note: "The official English Bible; the 1602 printing was the base text the translators revised.",
        kjv: "The KJV is formally a revision of it: the translators' rules told them to follow it and change it only where the original required.",
        from: ["great", "geneva"],
        have: /Bishops/i,
      },
      {
        id: "rheims",
        name: "Rheims New Testament",
        date: "1582",
        note: "The Catholic English New Testament from the Vulgate; the translators borrowed some of its words.",
        kjv: "A Catholic rival, yet the translators consulted it and took some of its Latin-derived words.",
        from: ["vul"],
        have: /^Rheims New Testament \(1582\)$/i,
        near: /Douay|Rheims/i,
        nearNote: "Challoner's 1750 revision of the Douay-Rheims.",
      },
    ],
  },
];

const ALL = TIERS.flatMap((t) => t.items);
const KJV: Source = {
  id: "kjv",
  name: "King James Version",
  date: "1611 (text of 1769)",
  note: "Made by about 47 scholars in six companies, 1604–1611, from the editions above.",
  kjv: "The Authorised Version of the Church of England. The text read today is Benjamin Blayney's Oxford edition of 1769, which modernised the 1611's spelling and corrected its printing errors.",
  // With the KJV+ beside it, as its "+".
  have: /^King James Version( w\/ Strong's Numbers)?$/i,
};

/** After the KJV: the English Bibles since, in families (each a lane of the tree, oldest first), with
 *  what each was revised from and the Greek its New Testament follows. */
const FAMILIES: { name: string; hint: string; items: Source[] }[] = [
  {
    name: "The KJV kept",
    hint: "Its Hebrew and Greek kept, its English brought up to date",
    items: [
      {
        id: "webster",
        name: "Webster's Bible",
        date: "1833",
        year: 1833,
        nt: "TR",
        note: "Noah Webster's light revision of the KJV, putting words that had changed their meaning into the English of his day.",
        kjv: "Keeps the KJV's text, changing only the words that had become obscure or misleading.",
        from: ["kjv"],
        have: /^Webster's Bible/i,
      },
      {
        id: "mkjv",
        name: "Modern King James Version",
        date: "1962–98",
        year: 1962,
        nt: "TR",
        note: "Jay P. Green's KJV in modern English, from the same Hebrew and Greek.",
        kjv: "Keeps the KJV's underlying texts (the Textus Receptus and the Masoretic) while modernising its English.",
        from: ["kjv"],
        have: /Modern King James/i,
      },
      {
        id: "nkjv",
        name: "New King James Version",
        date: "1982",
        year: 1982,
        nt: "TR",
        note: "The KJV in modern English, from the same Hebrew and Greek.",
        kjv: "A revision of the KJV itself: same Hebrew and Greek, same structure, with other texts' readings noted in the margin.",
        from: ["kjv"],
        have: /New King James/i,
      },
      {
        id: "kj21",
        name: "21st Century King James Version",
        date: "1994",
        year: 1994,
        nt: "TR",
        note: "The KJV with the words no longer understood replaced, checked against Webster's dictionary; its wording otherwise kept.",
        kjv: "Keeps the KJV's text and its Textus Receptus, changing only obsolete words.",
        from: ["kjv"],
        have: /21st Century King James|^KJ21$/i,
      },
      {
        id: "mev",
        name: "Modern English Version",
        date: "2014",
        year: 2014,
        nt: "TR",
        note: "Translated by chaplains and scholars in the KJV's tradition, from the Textus Receptus and the Masoretic text.",
        kjv: "A new translation that keeps the KJV's Hebrew and Greek and much of its formal style.",
        from: ["kjv"],
        have: /Modern English Version|^MEV$/i,
      },
    ],
  },
  {
    name: "The revision line",
    hint: "Each revising the one before it, from older Greek manuscripts",
    items: [
      {
        id: "rv",
        name: "Revised Version",
        date: "1881–85",
        year: 1881,
        nt: "CT",
        note: "The official British revision of the KJV, from older Greek manuscripts (Westcott and Hort's text).",
        kjv: "The first official revision of the KJV. Its New Testament changed many readings to follow older manuscripts, so it departs from the Textus Receptus.",
        from: ["kjv"],
        have: /^(English )?Revised Version/i,
      },
      {
        id: "asv",
        name: "American Standard Version",
        date: "1901",
        year: 1901,
        nt: "CT",
        note: "The Revised Version's American edition, as literal as English allows.",
        kjv: "Carries the KJV's revision into American usage, and is the ancestor of the RSV, NASB, WEB and the Living Bible.",
        from: ["rv"],
        have: /American Standard Version/i,
      },
      {
        id: "rsv",
        name: "Revised Standard Version",
        date: "1952",
        year: 1952,
        nt: "CT",
        note: "The ASV revised into modern English.",
        kjv: "Continues the KJV's line of revisions in modern English, through the ASV and the RV.",
        from: ["asv"],
        have: /^Revised Standard Version/i,
      },
      {
        id: "nrsv",
        name: "New Revised Standard Version",
        date: "1989",
        year: 1989,
        nt: "CT",
        note: "The RSV revised by an ecumenical committee, with readings from the Dead Sea Scrolls and inclusive language for people.",
        kjv: "In the KJV's line of revisions through the RSV; the Bible most used in biblical scholarship.",
        from: ["rsv"],
        have: /New Revised Standard/i,
      },
      {
        id: "esv",
        name: "English Standard Version",
        date: "2001",
        year: 2001,
        nt: "CT",
        note: "The RSV revised, in a literal tradition reaching back through the ASV and the RV to the KJV.",
        kjv: "The latest step in the KJV's line of revisions: KJV, RV, ASV, RSV, ESV.",
        from: ["rsv"],
        have: /English Standard Version/i,
      },
    ],
  },
  {
    name: "From the American Standard",
    hint: "Literal Bibles revised from the ASV",
    items: [
      {
        id: "nasb",
        name: "New American Standard Bible",
        date: "1971",
        year: 1971,
        nt: "CT",
        note: "The ASV revised, keeping its word-for-word method.",
        kjv: "In the KJV's line through the ASV, but translated from the modern critical Greek text rather than the Textus Receptus.",
        from: ["asv"],
        have: /New American Standard/i,
      },
      {
        id: "web",
        name: "World English Bible",
        date: "2000",
        year: 2000,
        nt: "MT",
        note: "The ASV revised into modern English and put into the public domain; its New Testament follows the Majority Text.",
        kjv: "A modern descendant of the KJV through the ASV, and free to copy as the KJV is.",
        from: ["asv"],
        have: /World English Bible/i,
      },
      {
        id: "lsb",
        name: "Legacy Standard Bible",
        date: "2021",
        year: 2021,
        nt: "CT",
        note: "The NASB of 1995 revised at The Master's Seminary, giving the divine name as Yahweh and translating a word alike wherever it can.",
        kjv: "In the KJV's line through the ASV and the NASB.",
        from: ["nasb"],
        have: /Legacy Standard/i,
      },
    ],
  },
  {
    name: "Literal, made afresh",
    hint: "Word-for-word translations independent of the KJV",
    items: [
      {
        id: "ylt",
        name: "Young's Literal Translation",
        date: "1862; 1898",
        year: 1862,
        nt: "TR",
        note: "Robert Young's word-for-word translation, keeping the Hebrew and Greek tenses.",
        kjv: "Not a revision of the KJV but a fresh literal translation, mostly from the Textus Receptus; often used to check the KJV's tenses.",
        have: /Young's Literal/i,
      },
      {
        id: "darby",
        name: "Darby Translation",
        date: "1890",
        year: 1890,
        nt: "CT",
        note: "John Nelson Darby's literal translation from the best texts of his day.",
        kjv: "A fresh translation, independent of the KJV, from the critical Greek texts of the 1800s.",
        have: /^Darby/i,
      },
    ],
  },
  {
    name: "New translations",
    hint: "Made from the Hebrew and Greek by new teams, between word for word and meaning for meaning",
    items: [
      {
        id: "niv",
        name: "New International Version",
        date: "1978",
        year: 1978,
        nt: "CT",
        note: "A translation balancing word and meaning, made by an international team.",
        kjv: "A new translation outside the KJV's line, from the modern critical texts; the most widely read alternative to the KJV.",
        have: /^New International Version/i,
      },
      {
        id: "nirv",
        name: "New International Reader's Version",
        date: "1996",
        year: 1996,
        nt: "CT",
        note: "The NIV in simpler words, for young and new readers.",
        kjv: "Simplified from the NIV, so outside the KJV's line.",
        from: ["niv"],
        have: /New International Reader/i,
      },
      {
        id: "hcsb",
        name: "Holman Christian Standard Bible",
        date: "2004",
        year: 2004,
        nt: "CT",
        note: "A new translation for Holman Bible Publishers, aiming at accuracy and readability together.",
        kjv: "A new translation outside the KJV's line, from the modern critical texts.",
        have: /Holman Christian Standard|^HCSB$/i,
      },
      {
        id: "net",
        name: "NET Bible",
        date: "2005",
        year: 2005,
        nt: "CT",
        note: "The New English Translation, first published online, with some 60,000 translators' notes explaining its choices.",
        kjv: "A new translation outside the KJV's line; its notes often say where and why it differs from older versions.",
        have: /New English Translation|^NET( Bible)?$/i,
      },
      {
        id: "isv",
        name: "International Standard Version",
        date: "2011",
        year: 2011,
        nt: "CT",
        note: "A new translation using recent manuscript finds.",
        kjv: "A new translation outside the KJV's line, from the modern critical texts.",
        have: /^International Standard Version/i,
      },
      {
        id: "bsb",
        name: "Berean Standard Bible",
        date: "2016–2023",
        year: 2016,
        nt: "CT",
        note: "A translation of the original languages, put into the public domain in 2023.",
        kjv: "A new translation outside the KJV's line; its Greek is close to the modern critical text.",
        have: /^Berean Standard Bible/i,
      },
      {
        id: "csb",
        name: "Christian Standard Bible",
        date: "2017",
        year: 2017,
        nt: "CT",
        note: "The HCSB revised and renamed.",
        kjv: "A revision of the HCSB, outside the KJV's line.",
        from: ["hcsb"],
        have: /^Christian Standard Bible|^CSB$/i,
      },
    ],
  },
  {
    name: "Plain English",
    hint: "Translated for meaning, in everyday words",
    items: [
      {
        id: "lb",
        name: "The Living Bible",
        date: "1971",
        year: 1971,
        nt: "CT",
        note: "Kenneth Taylor's paraphrase of the American Standard Version, begun for his own children.",
        kjv: "A paraphrase of the ASV, so a distant descendant of the KJV's line.",
        from: ["asv"],
        have: /^(The )?Living Bible|^TLB$/i,
      },
      {
        id: "gnb",
        name: "Good News Bible",
        date: "1976",
        year: 1976,
        nt: "CT",
        note: "A meaning-for-meaning translation in plain, everyday English.",
        kjv: "Breaks with the KJV tradition, translating the meaning of each passage rather than word for word.",
        have: /Good News/i,
      },
      {
        id: "cev",
        name: "Contemporary English Version",
        date: "1995",
        year: 1995,
        nt: "CT",
        note: "Plain English written to be read aloud and understood at a first hearing.",
        kjv: "Outside the KJV's line; written to be heard and understood rather than for word-for-word study.",
        have: /Contemporary English/i,
      },
      {
        id: "nlt",
        name: "New Living Translation",
        date: "1996",
        year: 1996,
        nt: "CT",
        note: "The Living Bible translated afresh from the Hebrew and Greek by some 90 scholars.",
        kjv: "Grew from the Living Bible's paraphrase of the ASV, but is a translation from the original languages.",
        from: ["lb"],
        have: /New Living Translation|^NLT$/i,
      },
      {
        id: "msg",
        name: "The Message",
        date: "1993–2002",
        year: 1993,
        nt: "CT",
        note: "Eugene Peterson's rendering of the Bible into the idiom of everyday American speech.",
        kjv: "A paraphrase from the Hebrew and Greek, as far from the KJV's word-for-word method as an English Bible goes.",
        have: /^The Message|^MSG$/i,
      },
    ],
  },
];
const LATER = FAMILIES.flatMap((t) => t.items);
/** The tree's columns: each card goes in the one its year falls in. */
const ERAS: [string, number][] = [
  ["1800–99", 1800],
  ["1900–49", 1900],
  ["1950–79", 1950],
  ["1980–99", 1980],
  ["2000–09", 2000],
  ["2010 on", 2010],
];
const era = (s: Source) => ERAS.reduce((k, [, y], i) => ((s.year ?? 0) >= y ? i : k), 0);
/** The Greek a Bible's New Testament follows: a mark on its card in the tree. */
const NT_TEXT: Record<NonNullable<Source["nt"]>, string> = {
  TR: "Textus Receptus, the Greek the KJV follows",
  MT: "Majority Text, the Greek as most manuscripts give it",
  CT: "the modern critical text, from the oldest manuscripts",
};

/** The library's Bibles that are this text, and the others that come closest or are related. */
function matches(s: Source, bibles: ModuleInfo[]) {
  const test = (re: RegExp | undefined) => (b: ModuleInfo) => !!re && (re.test(b.title) || re.test(b.abbrev));
  const have = bibles.filter(test(s.have));
  return { have, near: bibles.filter((b) => test(s.near)(b) && !have.includes(b)) };
}

/** Chips grouped into lines: a Bible with its + edition ("wlc" and "wlc+"), each other alone, in order. */
function pairs<T extends { m: ModuleInfo }>(xs: T[]): T[][] {
  const rows = new Map<string, T[]>();
  for (const x of xs) {
    const base = x.m.id.replace(/\+$/, "");
    rows.set(base, [...(rows.get(base) ?? []), x]);
  }
  return [...rows.values()].map((r) => r.sort((a, b) => Number(a.m.id.endsWith("+")) - Number(b.m.id.endsWith("+"))));
}

/** Whether a module has books of the Old Testament, of the New, or of both. */
interface Coverage {
  ot: boolean;
  nt: boolean;
}
const coverageOf = (books: Set<number>): Coverage => ({
  ot: [...books].some((b) => b <= 39),
  nt: [...books].some((b) => b >= 40 && b <= 66),
});

/** The apocryphal books and chapters a Bible has: "Tobit", …, "Additions to Esther (11–16)", "Susanna". */
function apocryphaIn(sz: BookSizes): string[] {
  const out = APOCRYPHA.filter((b) => sz.has(b.n)).map((b) => b.name);
  const est = sz.get(17) ?? 0,
    dan = sz.get(27) ?? 0;
  if (est > 10) out.push(`Additions to Esther (${est > 11 ? `11–${est}` : "11"})`);
  if (dan >= 13) out.push("Susanna (Daniel 13)");
  if (dan >= 14) out.push("Bel and the Dragon (Daniel 14)");
  if ((sz.get(19) ?? 0) > 150) out.push("Psalm 151");
  return out;
}

/** "OT", "NT" or "OT & NT", for a chip's tooltip. */
function coverageText(c: Coverage): string {
  return c.ot && c.nt ? "OT & NT" : c.ot ? "OT" : c.nt ? "NT" : "";
}

const names = (ms: ModuleInfo[]) => ms.map((m) => `${m.title} (${m.abbrev})`).join(", ");
const status = (s: Source, bibles: ModuleInfo[]) => {
  const { have, near } = matches(s, bibles);
  return have.length
    ? `in the library as ${names(have)}${near.length ? `; related there: ${names(near)}` : ""}`
    : near.length
      ? `not in the library; closest there: ${names(near)}`
      : "not in the library";
};

/** The history, summarised for Ask: every source, what it drew on, and whether the user has it. */
function historySummary(bibles: ModuleInfo[]): string {
  const name = (id: string) => [...ALL, KJV, ...LATER].find((s) => s.id === id)?.name ?? id;
  const line = (s: Source) =>
    `- ${s.name} (${s.date}): ${s.note} ${s.kjv}${s.from ? ` Drew on: ${s.from.map(name).join(", ")}.` : ""} ${status(s, bibles)[0].toUpperCase()}${status(s, bibles).slice(1)}.`;
  return (
    "The user is looking at a diagram of where the King James Version came from, and which of its sources are in their library. " +
    "The translators (about 47 scholars in six companies, 1604–1611) worked from printed editions, each resting on manuscript traditions, and revised the English Bibles before them.\n\n" +
    TIERS.map((t) => `${t.name} (${t.hint}):\n${t.items.map(line).join("\n")}`).join("\n\n") +
    `\n\n${line(KJV)}\n\nAfter the KJV:\n\n` +
    FAMILIES.map((t) => `${t.name} (${t.hint}):\n${t.items.map(line).join("\n")}`).join("\n\n") +
    `\n\nWhen answering, the user's own library modules can be named as ones to read.`
  );
}

/** The lines of each view: before the KJV, each source to what drew on it and the printed editions and
 *  English Bibles to the KJV; after it, each Bible from the one it was revised from. */
const EDGES: Record<View, [string, string][]> = {
  before: [
    ...ALL.flatMap((s) => (s.from ?? []).map((f) => [f, s.id] as [string, string])),
    ...TIERS.slice(1).flatMap((t) => t.items.map((s) => [s.id, "kjv"] as [string, string])),
  ],
  after: LATER.flatMap((s) => (s.from ?? []).map((f) => [f, s.id] as [string, string])),
};
type View = "before" | "after";

/** "the Revised Version", but "The Living Bible" as it is. */
const the = (name: string) => (name.startsWith("The ") ? name : `the ${name}`);

/** The English Bibles, which compare word for word with each other: those before the KJV, the KJV and those since. */
const ENGLISH = [...TIERS[2].items, KJV, ...LATER];

/** What an English Bible can be compared with: the English Bibles it came from, and the KJV. */
const compareTargets = (s: Source) => {
  if (s.id === "kjv" || !ENGLISH.includes(s)) return [];
  const parents = ENGLISH.filter((x) => s.from?.includes(x.id));
  return parents.some((x) => x.id === "kjv") ? parents : [...parents, KJV];
};

/** In the library, this text's own copy: its plain edition rather than its + one (KJV, not KJV+). */
const copyOf = (s: Source, bibles: ModuleInfo[]) => {
  const have = matches(s, bibles).have;
  return have.find((m) => !m.id.endsWith("+")) ?? have[0];
};

/** The comparisons the library allows for a card: each Bible it can be set beside (`m`, for `x`) and its own copy. */
function comparable(s: Source, bibles: ModuleInfo[]) {
  const mine = copyOf(s, bibles);
  if (!mine) return [];
  return compareTargets(s).flatMap((x) => {
    const m = copyOf(x, bibles);
    return m ? [{ x, m, mine }] : [];
  });
}

/** "Compare with the RSV": the Bible beside each it came from, and the KJV, in Compare; or what's missing for it. */
function CompareButtons(p: { s: Source; bibles: ModuleInfo[]; onCompare: (ids: string[]) => void }) {
  const targets = compareTargets(p.s);
  if (!targets.length) return null;
  const can = comparable(p.s, p.bibles);
  return can.length ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {can.map(({ x, m, mine }) => (
        <button key={x.id} className="btn primary ks-compare" type="button" onClick={() => p.onCompare([m.id, mine.id])}>
          <Icon name="compare" size={13} />
          Compare with {the(x.name)}
        </button>
      ))}
    </div>
  ) : (
    <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>
      With it and {targets.map((x) => the(x.name)).join(" or ")} in your library, compare them here.
    </p>
  );
}

export function KjvHistoryScreen() {
  const app = useApp();
  const bibles = app.bibles;
  const [asking, setAsking] = useState(false);
  // Ask only with an AI tool installed (its button and panel go otherwise).
  const canAsk = useAssistant().available;
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<{ a: string; b: string; d: string }[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [about, setAbout] = useState<{ s: Source; near: boolean; rect: DOMRect } | null>(null);
  // Before the KJV (where it came from) or after it (the Bibles since, as a family tree).
  const view = app.settings.historyView;
  const edges = EDGES[view];

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const o = el.getBoundingClientRect();
      setLines(
        edges.flatMap(([a, b]) => {
          const ea = cards.current.get(a),
            eb = cards.current.get(b);
          if (!ea || !eb) return [];
          const ra = ea.getBoundingClientRect(),
            rb = eb.getBoundingClientRect();
          // The tree runs left to right in time: from a card's right side to the next one's left.
          if (view === "after") {
            const x1 = ra.right - o.left,
              y1 = ra.top + 22 - o.top,
              x2 = rb.left - o.left,
              y2 = rb.top + 22 - o.top,
              dx = Math.max(18, (x2 - x1) / 2);
            return [{ a, b, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` }];
          }
          const x1 = ra.left + ra.width / 2 - o.left,
            y1 = ra.bottom - o.top,
            x2 = rb.left + rb.width / 2 - o.left,
            y2 = rb.top - o.top;
          // Same tier (Tyndale → Coverdale): from its side, over the top.
          if (Math.abs(ra.top - rb.top) < 4) {
            const ya = ra.top - o.top;
            return [{ a, b, d: `M${x1},${ya} C${x1},${ya - 28} ${x2},${ya - 28} ${x2},${ya}` }];
          }
          const my = (y1 + y2) / 2;
          return [{ a, b, d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` }];
        }),
      );
    };
    draw();
    // Drawn again when the diagram or any card changes size: a card widening (its chips, the
    // Apocrypha's A, arriving) moves the others in its row.
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    cards.current.forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [view, edges]);

  // The hovered card's ancestors and descendants.
  const lit = new Set<string>();
  if (hover) {
    const up = (id: string) => {
      if (lit.has(id + "^")) return;
      lit.add(id + "^");
      lit.add(id);
      edges.filter(([, b]) => b === id).forEach(([a]) => up(a));
    };
    const down = (id: string) => {
      if (lit.has(id + "v")) return;
      lit.add(id + "v");
      lit.add(id);
      edges.filter(([a]) => a === id).forEach(([, b]) => down(b));
    };
    up(hover);
    down(hover);
  }
  const on = (id: string) => !hover || lit.has(id);

  // Closes a book open in Read, which would otherwise stay in front of the Bible (back returns to it).
  const open = (m: ModuleInfo) => {
    app.set({ bible: m.id });
    app.open(app.loc, "read");
  };
  // Which parts of the Bible each module covers, for the bars on the chips.
  const [cov, setCov] = useState<Record<string, Coverage>>({});
  // And what of the Apocrypha each has, for the yellow A beside it.
  const [apo, setApo] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let live = true;
    Promise.all(bibles.map((b) => bibleSizes(b.id).then((sz) => [b.id, sz] as const)))
      .then((r) => {
        if (!live) return;
        setCov(Object.fromEntries(r.map(([id, sz]) => [id, coverageOf(new Set(sz.keys()))])));
        setApo(Object.fromEntries(r.map(([id, sz]) => [id, apocryphaIn(sz)]).filter(([, l]) => l.length)));
      })
      // Without them the chips just lack their bars and the A.
      .catch((e) => console.error("kjv-history", e));
    return () => {
      live = false;
    };
  }, [bibles]);
  // Not when the name already says: "Westminster Leningrad Codex (Hebrew OT)", "Rheims New Testament (1582)".
  const covTip = (m: ModuleInfo) =>
    cov[m.id] && coverageText(cov[m.id]) && !/\b(OT|NT|Old Testament|New Testament|Tanach)\b/i.test(m.title)
      ? ` (${coverageText(cov[m.id])})`
      : "";
  const haveCount = ALL.filter((s) => matches(s, bibles).have.length).length;
  const laterCount = LATER.filter((s) => matches(s, bibles).have.length).length;
  const nearCount = ALL.filter((s) => {
    const m = matches(s, bibles);
    return !m.have.length && m.near.length;
  }).length;

  // `narrow` for the tree after the KJV, whose columns must fit the window.
  const card = (s: Source, wide = false, narrow = false) => {
    const { have, near } = matches(s, bibles);
    const status = have.length ? "have" : near.length ? "near" : "none";
    return (
      <div
        key={s.id}
        ref={(e) => {
          if (e) cards.current.set(s.id, e);
          else cards.current.delete(s.id);
        }}
        className={`ks-card ks-${status} ${wide ? "ks-main" : ""}`}
        style={{
          ...(narrow ? { width: 146 } : { minWidth: wide ? 300 : 168, width: "max-content", maxWidth: 340 }),
          opacity: on(s.id) ? 1 : 0.35,
        }}
        onMouseEnter={() => setHover(s.id)}
        onMouseLeave={() => setHover(null)}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <b style={{ font: wide && !narrow ? "500 19px/1.2 var(--display)" : "600 13px/1.25 var(--ui)", flexGrow: 1 }}>{s.name}</b>
          <button
            className="ibtn"
            type="button"
            aria-label={`About ${s.name}`}
            title="About"
            style={{ width: 20, height: 20, flexShrink: 0, margin: "-2px -6px 0 0" }}
            onClick={(e) => {
              e.stopPropagation();
              setAbout({ s, near: near.length > 0, rect: e.currentTarget.getBoundingClientRect() });
            }}
          >
            <Icon name="info" size={13} />
          </button>
        </div>
        <span className="n" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
          {s.date}
          {s.nt && (
            <span className="ks-nt" title={`New Testament: ${NT_TEXT[s.nt]}`}>
              {s.nt}
            </span>
          )}
        </span>
        {/* One resource to a line, but a Bible and its + edition (WLC, WLC+) side by side. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {pairs([
            ...have.map((m) => ({ m, kind: "have" as const })),
            ...near.map((m, i) => ({ m, kind: !have.length && i === 0 ? ("closest" as const) : ("rel" as const) })),
          ]).map((row) => (
            <div key={row[0].m.id} style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {row.map(({ m, kind }, i) => {
                // Beside its plain edition, a + edition is just "+" (its name is in the tooltip).
                const label = i > 0 ? "+" : m.abbrev;
                return kind === "have" ? (
                  <button
                    key={m.id}
                    type="button"
                    className="ks-chip ks-chip-have"
                    title={`Read ${m.title}${covTip(m)}`}
                    onClick={() => open(m)}
                  >
                    {i === 0 && <Icon name="check" size={11} />}
                    {label}
                  </button>
                ) : (
                  // The closest stands in for a text the library lacks; the rest are related.
                  <button
                    key={m.id}
                    type="button"
                    className={`ks-chip ${kind === "closest" ? "ks-chip-near" : "ks-chip-rel"}`}
                    title={`${kind === "closest" ? "Closest" : "Related"}: ${m.title}${covTip(m)}`}
                    onClick={() => open(m)}
                  >
                    {i === 0 ? (kind === "closest" ? "Closest: " : "Related: ") : ""}
                    {label}
                  </button>
                );
              })}
              {apo[row[0].m.id] && (
                <span className="ks-apo" title={`Apocrypha in ${row[0].m.abbrev}: ${apo[row[0].m.id].join(", ")}`}>
                  A
                </span>
              )}
            </div>
          ))}
          {!have.length && !near.length && <span className="ks-chip">Not in library</span>}
          {/* Side by side in Compare with what it came from, and with the KJV. */}
          {comparable(s, bibles).length > 0 && (
            // As wide as the card the rest makes, wrapping, so the chips don't widen it.
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, width: 0, minWidth: "100%" }}>
              {comparable(s, bibles).map(({ x, m, mine }) => (
                <button
                  key={x.id}
                  type="button"
                  className="ks-chip ks-chip-cmp"
                  title={`Compare ${mine.abbrev} with ${the(x.name)} (${m.abbrev}), side by side`}
                  onClick={(e) => {
                    e.stopPropagation();
                    app.compareWith([m.id, mine.id]);
                  }}
                >
                  <Icon name="compare" size={11} />
                  vs {m.abbrev}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const tier = (t: { name: string; hint: string; items: Source[] }) => (
    <section key={t.name} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <span className="label">{t.name}</span>
        <span className="n" style={{ fontSize: 11.5 }}>
          {t.hint}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>{t.items.map((s) => card(s))}</div>
    </section>
  );

  return (
    <div className="main">
      <Topbar
        right={
          canAsk && (
            <button
              className={`btn ${asking ? "on" : ""}`}
              type="button"
              title="Ask about the KJV's history and sources"
              onClick={() => setAsking(!asking)}
            >
              <Icon name="chat" />
              Ask
            </button>
          )
        }
      />
      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: asking && canAsk ? "minmax(0,1fr) 440px" : "minmax(0,1fr)",
        }}
      >
        <div className="scroll" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "20px 28px 0", flexWrap: "wrap" }}>
            <div style={{ flexGrow: 1, minWidth: 320 }}>
              <div className="seg" role="tablist" aria-label="View" style={{ marginBottom: 12 }}>
                {(
                  [
                    ["before", "Before the KJV"],
                    ["after", "After the KJV"],
                  ] as [View, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    className={view === v ? "on" : ""}
                    onClick={() => {
                      setHover(null);
                      setAbout(null);
                      app.set({ historyView: v });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h1 style={{ margin: 0, font: "500 30px/1.1 var(--display)" }}>
                {view === "before" ? "Where the King James Version came from" : "The English Bibles since the King James"}
              </h1>
              <div className="hint" style={{ fontSize: 12.5, marginTop: 6 }}>
                {view === "before" ? (
                  <>
                    The translators worked from printed editions, each resting on manuscript traditions. {haveCount} of {ALL.length} are in
                    your library, and the closest equivalent of {nearCount} more. Hover a card for its line of descent; click a chip to read
                    it, or a “vs” chip to compare two side by side.
                  </>
                ) : (
                  <>
                    By family, oldest on the left; each line runs from a Bible to one revised from it. {laterCount} of {LATER.length} are in
                    your library. Hover a card for its line of descent; click a chip to read it, or a “vs” chip to compare two side by side.
                  </>
                )}
              </div>
            </div>
            <span className="ks-chip ks-chip-have" style={{ cursor: "default" }}>
              In library
            </span>
            {view === "before" && (
              <>
                <span className="ks-chip ks-chip-near" style={{ cursor: "default" }}>
                  Closest
                </span>
                <span className="ks-chip ks-chip-rel" style={{ cursor: "default" }}>
                  Related
                </span>
              </>
            )}
            <span className="ks-chip" style={{ cursor: "default" }}>
              Not in library
            </span>
            {view === "before" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span className="ks-apo" style={{ cursor: "default" }}>
                  A
                </span>
                <span className="n">Has the Apocrypha (hover for which)</span>
              </span>
            ) : (
              (["TR", "MT", "CT"] as const).map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }} title={NT_TEXT[k]}>
                  <span className="ks-nt">{k}</span>
                  <span className="n">{{ TR: "Textus Receptus", MT: "Majority Text", CT: "Critical text" }[k]}</span>
                </span>
              ))
            )}
          </div>
          <div
            ref={box}
            style={{
              position: "relative",
              padding: view === "after" ? "22px 16px 40px" : "22px 24px 40px",
              display: "flex",
              flexDirection: "column",
              gap: 44,
            }}
          >
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              {lines.map((l, i) => {
                const hi = hover && lit.has(l.a) && lit.has(l.b);
                return (
                  <path
                    key={i}
                    d={l.d}
                    fill="none"
                    stroke={hi ? "var(--accent)" : "var(--border)"}
                    strokeWidth={hi ? 2 : 1.2}
                    opacity={hover && !hi ? 0.25 : 1}
                  />
                );
              })}
            </svg>
            {view === "before" ? (
              <>
                {TIERS.map(tier)}
                <div style={{ display: "flex", justifyContent: "center" }}>{card(KJV, true)}</div>
              </>
            ) : (
              // The KJV first, at the head of the families it began; a lane for each family, a column for each era.
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${ERAS.length + 1}, 146px)`,
                  columnGap: 18,
                  rowGap: 8,
                  alignItems: "start",
                  width: "max-content",
                  margin: "0 auto",
                }}
              >
                {[["1611"], ...ERAS].map(([name]) => (
                  <span
                    key={name}
                    className="label"
                    style={{ textAlign: "center", paddingBottom: 6, borderBottom: "1px solid var(--border)" }}
                  >
                    {name}
                  </span>
                ))}
                <div style={{ gridColumn: 1, gridRow: 3 }}>{card(KJV, true, true)}</div>
                {FAMILIES.flatMap((f, i) => [
                  <div
                    key={f.name}
                    style={{ gridColumn: "2 / -1", gridRow: 2 + i * 2, display: "flex", gap: 10, alignItems: "baseline", marginTop: 14 }}
                  >
                    <span className="label">{f.name}</span>
                    <span className="n" style={{ fontSize: 11.5 }}>
                      {f.hint}
                    </span>
                  </div>,
                  ...ERAS.map((_, k) => (
                    <div
                      key={`${f.name}${k}`}
                      style={{ gridColumn: 2 + k, gridRow: 3 + i * 2, display: "flex", flexDirection: "column", gap: 10 }}
                    >
                      {f.items.filter((s) => era(s) === k).map((s) => card(s, false, true))}
                    </div>
                  )),
                ])}
              </div>
            )}
          </div>
        </div>
        {asking && canAsk && (
          <aside
            aria-label="Ask"
            style={{
              borderLeft: "1px solid var(--border)",
              background: "var(--panel)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <AskPanel
              full
              source="KJV history"
              about="Where the KJV came from"
              context={() => historySummary(bibles)}
              hint="The diagram's history and your library's sources go with the question."
              suggestions={[
                "Summarise how the KJV came to be",
                "Why did the translators follow the Bishops' Bible?",
                "Which of these sources should I add to my library next, and why?",
                "How does the Textus Receptus differ from the Greek behind modern translations?",
              ]}
            />
          </aside>
        )}
      </div>
      {about && (
        <Popover anchor={about.rect} onClose={() => setAbout(null)} width={360}>
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <b style={{ font: "500 18px/1.2 var(--display)" }}>{about.s.name}</b>
              <div className="n" style={{ fontSize: 12 }}>
                {about.s.date}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{about.s.note}</p>
            <span className="label" style={{ marginTop: 4 }}>
              {about.s.id === "kjv" ? "The text" : "For the KJV"}
            </span>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{about.s.kjv}</p>
            {about.near && about.s.nearNote && (
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{about.s.nearNote}</p>
            )}
            <CompareButtons
              s={about.s}
              bibles={bibles}
              onCompare={(ids) => {
                setAbout(null);
                app.compareWith(ids);
              }}
            />
          </div>
        </Popover>
      )}
    </div>
  );
}

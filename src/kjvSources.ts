// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

// KJV History's content, shared by the desktop's screen (KjvHistory.tsx) and the phone's
// (mobile/src/KjvHistory.tsx): every source and Bible, how they descend, and which the library has.

import { APOCRYPHA, BookSizes } from "./bible";

/** A Bible in the library, as much of it as the history needs. */
export interface Bib {
  id: string;
  title: string;
  abbrev: string;
}

/** Where the King James Version came from: the manuscript traditions, the printed editions the
 * translators worked from (1604–1611), the English Bibles before it, and which of them, or what
 * comes closest, is in the user's library. */

export interface Source {
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

export const TIERS: { name: string; hint: string; items: Source[] }[] = [
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

export const ALL = TIERS.flatMap((t) => t.items);
export const KJV: Source = {
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
export const FAMILIES: { name: string; hint: string; items: Source[] }[] = [
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
export const LATER = FAMILIES.flatMap((t) => t.items);
/** The tree's columns: each card goes in the one its year falls in. */
export const ERAS: [string, number][] = [
  ["1800–99", 1800],
  ["1900–49", 1900],
  ["1950–79", 1950],
  ["1980–99", 1980],
  ["2000–09", 2000],
  ["2010 on", 2010],
];
export const era = (s: Source) => ERAS.reduce((k, [, y], i) => ((s.year ?? 0) >= y ? i : k), 0);
/** The Greek a Bible's New Testament follows: a mark on its card in the tree. */
export const NT_TEXT: Record<NonNullable<Source["nt"]>, string> = {
  TR: "Textus Receptus, the Greek the KJV follows",
  MT: "Majority Text, the Greek as most manuscripts give it",
  CT: "the modern critical text, from the oldest manuscripts",
};

/** The library's Bibles that are this text, and the others that come closest or are related. */
export function matches(s: Source, bibles: Bib[]) {
  const test = (re: RegExp | undefined) => (b: Bib) => !!re && (re.test(b.title) || re.test(b.abbrev));
  const have = bibles.filter(test(s.have));
  return { have, near: bibles.filter((b) => test(s.near)(b) && !have.includes(b)) };
}

/** Chips grouped into lines: a Bible with its + edition ("wlc" and "wlc+"), each other alone, in order. */
export function pairs<T extends { m: Bib }>(xs: T[]): T[][] {
  const rows = new Map<string, T[]>();
  for (const x of xs) {
    const base = x.m.id.replace(/\+$/, "");
    rows.set(base, [...(rows.get(base) ?? []), x]);
  }
  return [...rows.values()].map((r) => r.sort((a, b) => Number(a.m.id.endsWith("+")) - Number(b.m.id.endsWith("+"))));
}

/** Whether a module has books of the Old Testament, of the New, or of both. */
export interface Coverage {
  ot: boolean;
  nt: boolean;
}
export const coverageOf = (books: Set<number>): Coverage => ({
  ot: [...books].some((b) => b <= 39),
  nt: [...books].some((b) => b >= 40 && b <= 66),
});

/** The apocryphal books and chapters a Bible has: "Tobit", …, "Additions to Esther (11–16)", "Susanna". */
export function apocryphaIn(sz: BookSizes): string[] {
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
export function coverageText(c: Coverage): string {
  return c.ot && c.nt ? "OT & NT" : c.ot ? "OT" : c.nt ? "NT" : "";
}

const names = (ms: Bib[]) => ms.map((m) => `${m.title} (${m.abbrev})`).join(", ");
export const status = (s: Source, bibles: Bib[]) => {
  const { have, near } = matches(s, bibles);
  return have.length
    ? `in the library as ${names(have)}${near.length ? `; related there: ${names(near)}` : ""}`
    : near.length
      ? `not in the library; closest there: ${names(near)}`
      : "not in the library";
};

/** The history, summarised for Ask: every source, what it drew on, and whether the user has it. */
export function historySummary(bibles: Bib[]): string {
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
export const EDGES: Record<View, [string, string][]> = {
  before: [
    ...ALL.flatMap((s) => (s.from ?? []).map((f) => [f, s.id] as [string, string])),
    ...TIERS.slice(1).flatMap((t) => t.items.map((s) => [s.id, "kjv"] as [string, string])),
  ],
  after: LATER.flatMap((s) => (s.from ?? []).map((f) => [f, s.id] as [string, string])),
};
export type View = "before" | "after";

/** "the Revised Version", but "The Living Bible" as it is. */
export const the = (name: string) => (name.startsWith("The ") ? name : `the ${name}`);

/** The English Bibles, which compare word for word with each other: those before the KJV, the KJV and those since. */
export const ENGLISH = [...TIERS[2].items, KJV, ...LATER];

/** What an English Bible can be compared with: the English Bibles it came from, and the KJV. */
export const compareTargets = (s: Source) => {
  if (s.id === "kjv" || !ENGLISH.includes(s)) return [];
  const parents = ENGLISH.filter((x) => s.from?.includes(x.id));
  return parents.some((x) => x.id === "kjv") ? parents : [...parents, KJV];
};

/** In the library, this text's own copy: its plain edition rather than its + one (KJV, not KJV+). */
export const copyOf = (s: Source, bibles: Bib[]) => {
  const have = matches(s, bibles).have;
  return have.find((m) => !m.id.endsWith("+")) ?? have[0];
};

/** The comparisons the library allows for a card: each Bible it can be set beside (`m`, for `x`) and its own copy. */
export function comparable(s: Source, bibles: Bib[]) {
  const mine = copyOf(s, bibles);
  if (!mine) return [];
  return compareTargets(s).flatMap((x) => {
    const m = copyOf(x, bibles);
    return m ? [{ x, m, mine }] : [];
  });
}

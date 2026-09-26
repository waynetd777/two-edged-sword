# Two-edged Sword

A personal Bible study app for macOS, built on the Bibles, commentaries, dictionaries, lexicons,
reference books, devotionals and maps you already have in e-Sword X. It opens every module
read-only and keeps what you make (journal, bookmarks, highlights, plans, chats) separately.

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/read-dark.png"><img alt="Reading 1 John 1 with the study pane open on the commentaries" src="docs/images/read-light.png"></picture>

## What it does

- **Read** a chapter beside a study pane with every commentary on the verse, cross-references,
  dictionaries, your notes and maps. Click any word for its Greek or Hebrew.
- **Ask** questions about what you're reading. The assistant searches your own commentaries,
  lexicons and dictionaries and names its sources. It runs on Claude Code, Codex,
  Antigravity or GitHub Copilot, whichever is installed.
- **Books and devotionals** from your library, with the same tools as Scripture: highlight,
  bookmark and note a paragraph, listen, and ask about it.
- **Compare** any number of translations verse by verse, with the differences highlighted.
- **Differences from the KJV**: a mark beside each verse where a translation differs in meaning,
  with both readings and the manuscript reason.
- **Greek and Hebrew** Bibles word by word, each word over its English and Strong's number, with
  other editions' readings marked.
- **KJV History**: the manuscripts and editions behind the King James Version, and which of them
  you have.
- **Word Study** a Strong's number: where it is used, every verse in context, and the articles
  about it in your library.
- **Listen** to a chapter, book or journal entry read aloud in any macOS voice, including the
  Premium ones, with each word highlighted as it is spoken; ⌘P and the keyboard's media keys
  control it from anywhere.
- **Quiet time** plans: daily readings and devotionals, worship songs from your Music library
  chosen for the day's reading, and a daily reminder.
- **Journal** entries linked to the verses they're about, kept in step with your Obsidian vault.
- **Search** across the whole library.
- **Build more modules** from free sources: the Targums, the Talmud, the Clementine Vulgate, the
  Syriac Peshitta, Tyndale and the Geneva Bible.
- The **menu-bar** menu starts today's Quiet time or picks up where you left off.

<table>
  <tr>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/ask-dark.png"><img alt="Ask comparing the commentators on 1 John 1:1" src="docs/images/ask-light.png"></picture><br><sub>Ask compares the commentators</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/compare-dark.png"><img alt="KJV+, ASV and YLT compared, differences highlighted" src="docs/images/compare-light.png"></picture><br><sub>Compare translations</sub></td>
  </tr>
  <tr>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/differences-dark.png"><img alt="Colossians 1:14 in the ASV, marked as omitting “through his blood”, with the reason" src="docs/images/differences-light.png"></picture><br><sub>Differences from the KJV</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/interlinear-dark.png"><img alt="Luke 17 in the Greek Textus Receptus, word by word, with Scrivener's readings" src="docs/images/interlinear-light.png"></picture><br><sub>Greek word by word</sub></td>
  </tr>
  <tr>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/kjv-history-dark.png"><img alt="The KJV's family tree, and which sources are in the library" src="docs/images/kjv-history-light.png"></picture><br><sub>KJV History</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/word-study-dark.png"><img alt="Word Study for G26, agapē" src="docs/images/word-study-light.png"></picture><br><sub>Word Study</sub></td>
  </tr>
  <tr>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/quiet-time-dark.png"><img alt="Quiet time with today's readings" src="docs/images/quiet-time-light.png"></picture><br><sub>Quiet time plans</sub></td>
    <td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/listen-dark.png"><img alt="Listening to 1 John 1, the word being spoken highlighted" src="docs/images/listen-light.png"></picture><br><sub>Listen, word by word</sub></td>
  </tr>
</table>

## Quick start

Needs macOS 13+, the Xcode Command Line Tools, e-Sword X with some modules, Rust and Node. Ask
also needs Claude Code, Codex, Antigravity or GitHub Copilot.

```sh
npm install
make dev            # the app with hot reload
cp signing.local.example signing.local   # then name your signing certificate in it
make install-app    # build it and put it in /Applications
```

Without a signing certificate, macOS asks for access to e-Sword's data after every build: see
[Signing and Full Disk Access](docs/development.md#signing-and-full-disk-access).

Licensed Bibles are read where e-Sword keeps them and never copied into this repo.

## Documentation

- [Features](docs/features.md): getting around, and Settings, with a page for each part:
  [Reading](docs/reading.md), [Study](docs/study.md),
  [Translations and manuscripts](docs/manuscripts.md), [Journal](docs/journal.md) and
  [Quiet time](docs/quiet-time.md)
- [Ask](docs/ask.md): the AI assistant, which models it offers, and what it sends
- [Library](docs/library.md): e-Sword modules, adding and building more, and free ones worth having
- [Development](docs/development.md): building, signing, where data lives, and the code

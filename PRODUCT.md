# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The desktop app is a Tauri webview app for macOS and Windows (`src/`). The phone and tablet app (`mobile/`) is a Tauri mobile app for iPhone, iPad and Android, sharing components and the design tokens with the desktop. Both render web UI, so web is the design language on every device.

## Users

Christians reading and studying the Bible alone, at a desk or with a phone or tablet: a daily Quiet time of reading, worship and prayer, and deeper study with commentaries, dictionaries and original languages.

## Product Purpose

A Bible study app that works with nothing else installed: Bibles, commentaries, dictionaries, books, devotionals and maps, beside the user's own journal, highlights and reading plans. The user's own material is kept separately from the modules and synced between the computer and the phone or tablet.

## Positioning

A complete, free (GPL) study library in one quiet app, reading e-Sword X's formats too, with the day's devotional life (plans, worship songs chosen for the reading, a closing verse, and now prayer) joined to the text being read.

## Operating Context

- Quiet time: a daily sequence of readings, optional worship songs before and after, and a closing verse. A prayer step joins it, walking through the prayer list.
- Journal: entries linked to verses, tagged (one common tag is `#prayer`).
- Sync: the desktop and the phone/tablet keep the journal, highlights, plans and bookmarks the same. The prayer list syncs the same way.
- Desktop navigation is a left sidebar of screens with ⌘1–⌘8; the phone uses ☰ with the same screens and icons.

## Capabilities and Constraints

- Prayer list (planned): categories the user names (e.g. Family, Work), each holding prayer points. Points have a title, an optional short note, optional linked verses, and can be marked answered with the date; answered points move to an Answered list. Categories and points are added, edited, deleted and reordered by drag and drop, including moving a point to another category.
- Must work on desktop, phone, and tablet in portrait and landscape.
- Help guides live in `docs/` and show in the in-app help drawer.

## Brand Commitments

- Name: Two-edged Sword. The wordmark and sword logo are existing assets.
- Text on the site and in tutorials honours God, Jesus and the Spirit. Modules are recommended and downloaded, never shared.
- Plain, short, practical wording in the UI and docs.

## Evidence on Hand

- Screenshots of every screen in `docs/images/` (taken from scenes in `tools/screenshots/scenes.json`).
- Never use real journal or prayer content in code, tests, docs or screenshots: neutral examples only.

## Product Principles

- The user's own words are private and theirs: kept apart from modules, never put in the repo.
- Quiet and focused: the app serves reading and prayer, it does not compete for attention.
- One app across desk, phone and tablet: the same screens, adapted to each, kept in sync.
- Everything links back to Scripture.

## Accessibility & Inclusion

Light and dark themes; keyboard shortcuts on desktop; touch-sized targets on phone and tablet.

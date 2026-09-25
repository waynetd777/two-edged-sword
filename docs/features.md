# Features

[Read](#read) · [Books and devotionals](#books-and-devotionals) · [Listen](#listen) ·
[Compare](#compare) · [Search](#search) · [Word Study](#word-study) · [Journal](#journal) ·
[Quiet time](#quiet-time) · [Menu bar](#menu-bar) · [Library](#library) · [Settings](#settings)

⌘1 to ⌘7 switch between the screens, ⌘K goes to any reference, word, Strong's number or
command, and ⌘, opens Settings. Deleting a journal entry, a plan or a chat asks first.

**Back and forward** (the arrows at the top left, or ⌘[ and ⌘]) work across the whole app: every
screen you go to, passage, book chapter, word studied and search is a step you can go back to.
From Word Study's list of words for "love", choosing ἀγάπη and pressing back returns to the list.

The sidebar lists your bookmarks (verses and book paragraphs) and recent chapters (Bible, books
and devotionals), eight of each, with **Show all** for the rest.
Hover an entry for a preview; its × removes it, with **Undo** in the message that follows, and
**Clear** beside the Recent heading empties that list (after asking). Hover any control for a
short description.

## Read

<picture><source media="(prefers-color-scheme: dark)" srcset="images/read-dark.png"><img alt="Reading 1 John 1 with the study pane on the commentaries" src="images/read-light.png"></picture>

The chapter, one verse per line or as paragraphs, beside a study pane that follows the
selected verse:

- **Commentary**: every commentary that covers the verse, in your order, with each one's
  chapter and book introductions, and Treasury of Scripture Knowledge cross-references with
  previews.
- **Dictionary**, **Notes** (your journal entries on the verse) and **Maps** for the book.
- **Ask**: questions about the verse or chapter (see [Ask](ask.md)).

Click any word to look it up: its Greek or Hebrew (for a Bible without Strong's numbers, the
words the KJV+ most often translates it with), how the KJV translates it, dictionary articles,
the commentaries on that verse, and buttons for Word Study, Search and Ask. The speaker beside a
Greek or Hebrew word pronounces it, with macOS's Greek or Hebrew voice (modern pronunciation) if
installed, otherwise from Strong's pronunciation guide. Words in commentary, dictionary articles
and books can be clicked the same way.

Click a verse (anywhere but a word) to select it; ⇧-click for a range. The toolbar above it
offers highlight (six colours), bookmark, note (a journal entry on the verse, N), compare, listen
from here, ask and copy (⌘C). Its labels fold to icons when the column is narrow.

Hover a reference or a Strong's number for a preview. The passage picker goes book, chapter,
then verse. "See ASTRONOMY" in a dictionary and "see on Gen 12:8" in a commentary open that entry
or note in the pane, with back and forward.

⌘. is focus mode (Esc leaves it), ← and → turn the page, and ⌘\\ shows or hides the study
pane.

## Books and devotionals

<picture><source media="(prefers-color-scheme: dark)" srcset="images/books-dark.png"><img alt="Foxe's Book of Martyrs with a paragraph selected and highlighted" src="images/books-light.png"></picture>

The Books menu beside the Bible picker opens a reference book or a devotional in the reading
column: chapters (a devotional's days) down the side, charts at full width, images full screen
on a click, read aloud paragraph by paragraph, and focus mode. A devotional opens on today's
reading.

Paragraphs work like verses: numbered, outlined on hover, selected with a click (⇧-click for a
run), with the same toolbar to highlight, bookmark, note (a journal entry quoting it, linked to
it), listen from here, ask and copy. Bookmarks and notes show beside the paragraph. The study
pane beside the book has **Notes** (journal entries on the chapter), **Dictionary** and **Ask**.

## Listen

<picture><source media="(prefers-color-scheme: dark)" srcset="images/listen-dark.png"><img alt="Listening to 1 John 1, the word being spoken highlighted" src="images/listen-light.png"></picture>

Reads the chapter aloud, highlighting each word as it is spoken, at 0.5× to 2×, with a sleep
timer (minutes, or the end of the chapter). It carries on into the next chapter and announces
each one ("First Samuel, chapter 3"). Space plays and pauses; Esc closes the player (after any
open menu or focus mode).

It speaks through macOS's own synthesiser, so every voice installed on the Mac can be chosen,
including the far more natural **Premium** and **Enhanced** ones. They are a separate download:

1. System Settings › Accessibility › Spoken Content › System voice › Manage Voices.
2. Under English, download a voice marked (Premium): for example Zoe, Ava or Evan (US), or
   Jamie or Serena (UK).
3. Pick it from the voice menu in the player or in Settings. It appears once the download
   finishes and you switch back to the app.

## Compare

<picture><source media="(prefers-color-scheme: dark)" srcset="images/compare-dark.png"><img alt="KJV+, ASV and YLT side by side" src="images/compare-light.png"></picture>

Any number of translations side by side, verse by verse, with **Highlight differences** marking
wording that differs from the first column, and **Strong's numbers** for Bibles that have them.

## Search

<picture><source media="(prefers-color-scheme: dark)" srcset="images/search-dark.png"><img alt="Searching the KJV for “tithe”, with the verse in context" src="images/search-light.png"></picture>

The Bible, every commentary and dictionary, and your journal at once, with a count for each.
Narrow it to one Bible, a range (Old or New Testament, Wisdom, Prophets, Gospels, Letters), and
match the exact phrase, all or any of the words, and whole words only. Selecting a verse shows it
in context beside the results, ready to open or compare, and Ask can summarise what the results
say. A Strong's number such as `G509` finds every verse that uses the word, however it is
translated. The search is kept while you open results and come back, and each new search is a
step back and forward can return to.

## Word Study

<picture><source media="(prefers-color-scheme: dark)" srcset="images/word-study-dark.png"><img alt="Word Study for G26, agapē" src="images/word-study-light.png"></picture>

A Strong's entry, how often and where it is used (by book), every verse in context, related words
and the articles about it in your library. Type an English word ("love") to see the Greek and
Hebrew words the KJV+ renders with it, or a transliteration ("agape"). The speaker beside the
word pronounces it. Word Study opens on the last word you studied, including after a restart.

## Journal

<picture><source media="(prefers-color-scheme: dark)" srcset="images/journal-dark.png"><img alt="A journal entry with its verse references as links" src="images/journal-light.png"></picture>

Dated entries with headings, bold, italic, lists, quotes and verses inserted from the Bible
(⌘N starts one). Each entry is linked to the verses it's about and shows beside them in Read
(Settings › Journal › Show notes beside verses). Entries are Markdown files, one per month, in
`~/Documents/Two-edged Sword/` (change it in Settings, e.g. to a folder in your Obsidian vault).
The toolbar highlights in the reader's six colours (the button keeps the colour last picked;
saved as `==text==` for yellow, which Obsidian shows too, and `<mark class="hl-green">` for the
others), inserts a verse, links one, and adds a tag. ⌘F finds in the entry and ⌥⌘F replaces (⌘G
for the next match; ⌘Z undoes a replacement). An Ask answer can be added to the journal in one
click.

<picture><source media="(prefers-color-scheme: dark)" srcset="images/journal-ask-dark.png"><img alt="Ask in the journal, about the open entry or the whole journal" src="images/journal-ask-light.png"></picture>

**Ask** (right of the toolbar) asks about **This entry** or the **Whole journal**. **This entry**
asks about the entry and its first linked verse, drawing on your library, and can search the
rest of your journal ("What else in my journal connects with this?"). Select some text first
and it asks about that: explain it, suggest verses, say it more clearly. **Insert into entry**
puts an answer after the paragraph you were in. On a blank entry it offers prompts to start
writing. The whole journal means the entries the list shows, so a tag or filter narrows it:
"What themes keep coming back?", "How has my thinking changed over time?"

References in an entry are links, as you wrote them: hover for the verse, click to open it.
"John 3:16", "Rom 8:28-30", "1 John 5, verse 4", "Job 19, verses 25 to 27", "Genesis chapter
3:1 - 5" and a whole chapter by its book's name ("Hebrews 11", "John Chapter 6") all link, and so
do common misspellings ("Isiah", "Pillipians"). References typed now link the next time the
entry opens.

Spelling is checked by macOS's own spell checker: misspelled words get a red wavy underline,
and clicking one offers its suggestions, Add to dictionary and Ignore (either clears the
underline at once). With "Correct spelling automatically" on in macOS (Keyboard › Text Input), a
word is corrected as you finish it; ⌘Z undoes that, and clicking the word offers to change it
back. Verses inserted from the Bible aren't checked.

Changes made to the files elsewhere (in Obsidian, say) show within a few seconds, even in the
open entry, unless you have unsaved edits. If the folder the journal sits in has gone (the vault
moved), saving says so rather than starting an empty journal somewhere else.

## Quiet time

<picture><source media="(prefers-color-scheme: dark)" srcset="images/quiet-time-dark.png"><img alt="Quiet time with today's readings" src="images/quiet-time-light.png"></picture>

Reading plans: the Bible in a year, the New Testament in 90 days, the Gospels, F. B. Meyer's
daily readings (if it's in your library), your own, or a Psalm, a Proverb and one more chapter a day, read in the Bible
chosen for the plan. Add devotionals from your library, or Our Daily Bread and Heartlight online
(opened in a window of their own).

**Read** opens each of the day's chapters and devotionals in turn, with a bar to move between
them; **Read with audio** reads them aloud one after another, two seconds apart. Parts are ticked off as they are
finished, and the day is marked read once its Bible readings are. **Mark as unread** undoes
today's mark and puts the plan back where it was. Click a reading in the day's card to open just
that chapter.

<picture><source media="(prefers-color-scheme: dark)" srcset="images/worship-dark.png"><img alt="The Worship part of Quiet time: why each song suits the day's reading" src="images/worship-light.png"></picture>

**Worship music** (on the plan's page): songs from your Music library, before or after the
reading, chosen by the AI assistant to suit the day's passages. A card explains each choice;
**Play songs** starts them in Music, with pause, skip and **Lyrics** (opens Music, which shows
them) in the bar, and Space pauses too. When the last song ends, Music is stopped rather than
left on AutoPlay, and Quiet time moves on. **Try it now** runs the day's Quiet time with its
songs, without marking anything read. macOS asks once whether the app may control Music.

Under the progress bar: how many days in a row you've read, your best run, and how many of the
last seven days (weekdays, for a weekdays-only plan, so weekends don't break the streak).

**Daily reminder** (Settings › Quiet time): a notification at the time you choose, with the day's
readings, if today isn't marked read yet. It comes once a day, and up to two hours late if the
Mac was asleep at the time. The app keeps running in the menu bar when its window is closed, so
the reminder still comes then; it can't once you quit the app. macOS asks whether to allow
notifications the first time.

<picture><source media="(prefers-color-scheme: dark)" srcset="images/reminder-dark.png"><img alt="The daily reminder in Settings" src="images/reminder-light.png"></picture>

## Menu bar

Closing the window leaves the app in the menu bar and takes it out of the Dock until the window
is opened again. Its menu has:

<img alt="The menu-bar menu" src="images/menu-bar.png" width="340">

- **Open Two-edged Sword**.
- **Start Quiet Time**, with today's readings: the same as **Read** on the day's card. Once the
  day is read it says so, and opens Quiet time instead.
- **Continue Reading**, with the passage or book chapter you were last on.
- **New Journal Entry** and **Search…**
- **Daily Reminder at** the time set, ticked when it's on; choosing it turns the reminder on or off.
- **Open at Login**: starts the app when you log in, in the menu bar with its window closed, so
  the reminder comes without your opening it. It's the same setting as the app's switch in System
  Settings › General › Login Items.
- **Quit** (⌘Q).

## Library

Every module, which Bibles appear in the picker, and the order of commentaries and dictionaries.
Reference books and devotionals open from here too. **Rescan** picks up modules added since the
app started. See [Library](library.md).

## Settings

Theme (match macOS, light or dark), reading font and size, words of Jesus in red, verse or
paragraph layout, the default and Compare translations, verse numbers when copying, the voice and
speed, the journal folder and notes beside verses, the daily Quiet time reminder, what to do when
you fall behind a plan, and the AI assistant: which of Claude Code and Codex are installed, the
default model, whether Ask may search your library (on at first) and your journal entries linked
to the passage (off at first), **Licensed text** (when off, no licensed module's text goes to
Ask: Bibles fall back to public-domain text, and licensed commentaries, lexicons, dictionaries
and books are left out), and your saved chats.

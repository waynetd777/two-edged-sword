# Ask

<a href="images/index.md#ask"><picture><source media="(prefers-color-scheme: dark)" srcset="images/ask-dark.png"><img alt="Ask comparing the commentators on 1 John 1:1" src="images/ask-light.png"></picture></a>

Ask answers questions about what you are reading: a passage in Read or Compare, a word in Word
Study, search results, a journal entry, or a reference book or devotional. Chats stay on this
Mac; find them again under **Recent** on any Ask panel. A chat keeps what was open when it
started (the passage, book chapter, word, search or journal entry): opening it from Recent, or
clicking "Started in…" at its top, goes back there with the chat beside it. An answer can be
added to your journal.

## Claude Code, Codex, Antigravity or Copilot

Ask doesn't talk to an AI service itself. It runs an AI command-line tool already installed and
signed in on this Mac, so it uses your existing account:

- **Claude Code** (`claude -p`), offering Claude Opus, Sonnet and Haiku.
- **Codex** (`codex exec`), offering whichever models Codex's own model picker shows for your
  account, so the list stays current without an app update.
- **Antigravity** (`agy -p`, Google's successor to Gemini CLI), offering whichever models your
  Google account has: Gemini, and some Claude and GPT models.
- **GitHub Copilot** (`copilot -p`), as "Copilot (Auto)": it lists no models, so Copilot picks
  whichever your plan allows. An organisation's Copilot policy can switch the CLI off.

<a href="images/index.md#ask"><picture><source media="(prefers-color-scheme: dark)" srcset="images/ask-models-dark.png"><img alt="The model menu, grouped by the tool that runs each model" src="images/ask-models-light.png" width="330"></picture></a>

The model menu on each Ask panel lists the models from whichever tools are installed, grouped by
tool; choosing one there also makes it the default. Settings › AI assistant shows what was
found. A chat keeps the model it started with.

**If none is installed, Ask is hidden** everywhere: panels, buttons, the study pane's Ask
tab, the command palette entry. Install one, sign in (for Codex or Antigravity, run it once in
Terminal so it lists its models), and open Settings; Ask appears without a restart.

Claude, Antigravity and Copilot stream their answers as they write. Codex's answer appears all at once
when it is done. While any of them is searching your library, the panel shows what it is doing ("Reading Matthew
Henry's Commentary…"). In a new chat, the box's hint is the first suggested question, and the go
button asks it.

## Answers from your library

In a chat about a Bible passage, the app writes out your library's material on it as plain text
files in the chat's folder, and the assistant searches them instead of answering from memory:

- `digest.txt`: every commentary's notes on the passage, the first ~400 words of each, in one
  file. Most questions are answered from this alone, which keeps answers quick.
- `commentaries/`: each commentary's full notes on the passage, with its chapter and book
  introductions.
- `passage/`: the passage in each of your Bibles.
- `lexicons/`: every lexicon's entry for each Strong's number in the passage.
- `differences/`: where a translation differs in meaning from the KJV, in the passage and in all,
  for each translation that has a reviewed list (see [Translations and manuscripts](manuscripts.md)).
- `references/`: passages in your reference books that cite the verses, such as the Talmud's.
- `dictionaries/`: your dictionaries, whole. They are written out once in the background after
  they change (at startup or after a rescan); that takes a while the first time.
- `journal/`: your journal entries linked to the passage, one file each, if Settings › AI
  assistant › **Include my journal** is on (it is off to begin with). The assistant reads them
  for personal questions, or ones about what you have written or preached.

The assistant decides whether a question needs them. "How do the commentators differ on this
verse?" makes it read the digest and compare named commentators; a quick factual question, or a
follow-up on its own answer, is answered straight away. It is told to name the source for each
point and to say when your library has nothing on something.

Turn off **Search my library** and the assistant gets only the passage text, and no journal
entries.

A reference book or devotional works the same way. The chapter goes with the question (about
6,000 words around the paragraph, for long chapters), and the whole book is written out, a file
per chapter with its charts, for the assistant to search.

In the journal, Ask offers two choices:

- **This entry**: the entry goes with the question. If it has a linked verse, the chat gets the
  first one's passage folder as above, with all your other journal entries in `journal/`;
  otherwise (or with Search my library off) it gets the journal alone.
- **Whole journal**: the entries the journal list shows (all, or those with the chosen tag or
  filter), one file each, with an index of their dates, verses and tags.

Include my journal doesn't apply to either.

## What is sent

The first question goes with what you are looking at: the passage, the verse in each compared
translation, the word's lexicon entry, the search results, the open journal entry (and any text
you selected in it), or the book's chapter. After that, only what the assistant opens from the
chat's folder is sent, not the whole folder.

**Licensed text.** Settings › AI assistant › **Licensed text** is on to begin with. Turn it off
and no licensed module's text is sent (one whose description carries a copyright notice):

- A licensed Bible is swapped for a public-domain one, or, with none installed, only the
  reference is sent.
- Compare leaves out licensed columns, and Search sends only references for a licensed Bible.
- Licensed Bibles, commentaries, lexicons and dictionaries are left out of the chat's folder.
- A licensed book or devotional sends neither its text nor its folder; the panel says so.

**What the assistant can reach.** Claude Code gets only read and search tools, confined to the
chat's folder. Your own Claude Code settings still apply, so an allow rule there could widen
that; your hooks and `~/.claude/CLAUDE.md` load too. Codex runs in its read-only sandbox,
without your Codex config (MCP servers, hooks, rules). It is told to stay in the chat's folder,
but nothing enforces that. Antigravity is given a custom agent (`.agents/agents/tes-ask.md`,
written into the chat's folder) that has only its read and search tools, so it can't search the
web, open pages or run commands; reading outside the folder is refused. Your own Antigravity
rules files still load. Copilot is given only its read and search tools (`--available-tools`),
without its GitHub connection or your instruction files; reading outside the folder is refused
and it answers without it. None of them can change files. Each tool keeps its own history of
your questions, as it would for any chat: `~/.claude/`, `~/.codex/`,
`~/.gemini/antigravity-cli/`, `~/.copilot/`.

## Where it keeps things

Under `~/Library/Application Support/Two-edged Sword/`:

| What | Where |
|---|---|
| Chats | `chats.json` |
| A passage chat's folder | `ask/studies/<chat>/` (removed after 60 days unused) |
| A journal chat's entries | `ask/journal/<chat>/` (removed after 60 days unused) |
| Dictionaries, written out whole | `ask/dictionaries/` |
| Reference books and devotionals, written out | `books/` |
| Working folders for chats without one | `claude/`, `codex/`, `agy/`, `copilot/` |

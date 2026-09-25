# Reviewing variance candidates

You are given one batch file from `candidates.py`: verses where a translation (`module`) may differ in meaning from the base Bible (`base`, the KJV). Each candidate has both texts and the reasons it was picked. Most candidates are only differences of wording; your job is to keep only the real ones and explain each.

## What counts

Keep a candidate when the translation's reading changes what the verse says, compared with the KJV:

- a verse, clause or phrase in the KJV is missing (usually because the translation follows the Alexandrian/critical Greek text where the KJV follows the Textus Receptus);
- a name or title of God or Christ is dropped or changed ("Lord Jesus Christ" → "Lord", "God was manifest" → "He appeared", "Son" → "servant");
- a word that carries doctrine is changed (blood, begotten, virgin, hell, firstborn, Joseph as "father", commandments, fasting, everlasting…);
- the translation adds something with no basis in the KJV's text that changes meaning.

Skip it when the difference is only English style: thee/you, modern word order, a pronoun for a noun (or the reverse) where the underlying Greek or Hebrew is the same and the referent is plain, synonyms ("everlasting"/"eternal", "Holy Ghost"/"Holy Spirit", "saviour"/"savior", "charity"/"love"), a paraphrase that keeps every idea. When in doubt about whether the Greek differs, keep it and mark it `minor`.

In the Old Testament both the KJV and most modern translations follow the Masoretic Hebrew text, so most differences there are translation choices, not missing words. Keep them when the choice changes meaning (a messianic reading made generic, "Son" made "son", a clause reworded so a doctrine is lost), or where the translation follows the Septuagint, the Dead Sea Scrolls or an emendation instead of the Masoretic text; say which in the note.

## What to write

For each kept verse, one record:

```json
{"book": 51, "chapter": 1, "verse": 14, "kind": "atonement", "weight": "major",
 "change": "Omits \"through his blood\"",
 "note": "The phrase is in the Byzantine majority and the Textus Receptus but not in Sinaiticus, Vaticanus or most early witnesses; the NIV follows the latter. Redemption through Christ's blood is still stated in Ephesians 1:7."}
```

- `book`, `chapter`, `verse`: copied from the candidate.
- `kind`, one of: `omission` (a whole verse, or a clause with no single doctrine), `deity` (Christ's divinity, names or titles of God and Christ), `atonement` (blood, redemption, sacrifice), `trinity`, `salvation` (faith, repentance, how one is saved), `judgment` (hell, damnation, the last things), `prophecy` (fulfilment, messianic readings), `virgin-birth`, `other`.
- `weight`: `major` when it touches a doctrine or drops a verse or a clause of substance; `minor` otherwise.
- `change`: what differs, at most 12 words, in plain words. Quote at most a few words of either text.
- `note`: one or two sentences: the textual reason (which manuscripts or text-type, or that it is a translation choice) and why it matters, or where the same doctrine is still stated. Factual and even-handed; do not call either version corrupt. Don't pad.

Write the result as JSON to `reviewed/<same file name>` beside `batches/`: `{"records": [ … ], "reviewed": <number of candidates in the batch>}`. Records keep the batch's order. Write nothing else.

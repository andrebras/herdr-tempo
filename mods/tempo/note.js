// What Cmd+Enter (Ctrl+Enter off macOS) in the note box does. Knows nothing about Herdr, so
// the tests run it under Node.js.

// What to send: the answer when an option is picked, as Send answer; else the note, when
// it has text, as Ask for more context; else nothing. Nothing either while a send runs.
/**
 * @param {{ pick: string | null | undefined, note: string, sending: boolean }} state
 * @returns {"answer" | "more" | null}
 */
export function submitAction({ pick, note, sending }) {
  if (sending) return null;
  if (pick) return "answer";
  if (note.trim()) return "more";
  return null;
}

// The note box types a line break at Cmd+Enter before it reports the key, so the note
// would end with it. This is the text without that break, just before the cursor (an
// offset in UTF-16 code units, as JavaScript counts), or null when there is none there.
/**
 * @param {string} text
 * @param {number} cursor
 * @returns {string | null}
 */
export function withoutTypedBreak(text, cursor) {
  if (cursor < 1 || text[cursor - 1] !== "\n") return null;
  return text.slice(0, cursor - 1) + text.slice(cursor);
}

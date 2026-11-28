// Sending an answer for the question as the panel showed it, as Tempo's page does. Knows
// nothing about Herdr, so the tests run it under Node.js.

// The arguments for `tempo answer`. With the version shown, Tempo refuses the answer if
// Claude has reworded the question since: the same letter may now name another option.
// The note and the version go as one word each, so a note that starts with a dash, such as
// --force, isn't read as an option.
/**
 * @param {{ number: number, pick: string, project: string, note: string, version: number | null }} answer
 * @returns {string[]}
 */
export function answerArgs({ number, pick, project, note, version }) {
  const args = ["answer", String(number), pick, "--project", project];
  if (version !== null) args.push(`--version=${version}`);
  if (note.trim()) args.push(`--note=${note.trim()}`);
  return args;
}

// Why `tempo answer` refused, when the panel handles it: "reworded" when Claude reworded
// the question since it was shown; "old" when this Tempo predates `--version` (0.13.4 and
// older), so the answer is sent again without it. null for any other error.
/**
 * @param {string} stderr
 * @returns {"reworded" | "old" | null}
 */
export function refusal(stderr) {
  if (/changed since you looked at it/.test(stderr)) return "reworded";
  if (/unrecognized arguments: --version/.test(stderr)) return "old";
  return null;
}

// What to say when Claude rewords the question being answered, or null when the person
// hadn't started (no pick, no note) or the wording is the same. The pick is cleared, since
// its letter may now name another option; the note stays. As Tempo's page says it.
/**
 * @param {{ pick: string | null | undefined, note: string }} typed
 * @param {number} shown the version the person was answering
 * @param {number} now the version Tempo has now
 * @returns {string | null}
 */
export function rewordNotice({ pick, note }, shown, now) {
  if (shown === now || (!pick && !note.trim())) return null;
  return [
    `Claude reworded this question while you were answering it (now version ${now}).`,
    pick && "Your pick was cleared: read the options again.",
    note.trim() && "Your note is kept.",
  ]
    .filter(Boolean)
    .join(" ");
}

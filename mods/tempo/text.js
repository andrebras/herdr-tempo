// Text the panel shows, worked out from Tempo's data. Knows nothing about Herdr, so the
// tests run it under Node.js.

// "- ", "* ", "1. " or "1) " at the start of a line, as on the page.
const LIST_LINE = /^\s*([-*]|\d+[.)])\s+/;

// Question text as Tempo's page shows it (rich() in tempo/page.js): a little Markdown, and
// a single line break starts a new line. Markdown would join those lines, so each one ends
// with a hard break (two spaces) instead. Where text meets a list, either way, a blank line
// goes between them, so the list starts and ends there, as on the page.
/** @param {unknown} text */
export function lineBreaks(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/([^\n]*)\n(?=([^\n]+))/g, (match, line, next) => {
      if (!line.trim()) return match;
      const list = LIST_LINE.test(line);
      if (list !== LIST_LINE.test(next)) return `${line}\n\n`;
      return list ? match : `${line}  \n`;
    });
}

// Tempo's times are UTC ("2026-01-31T09:05:00Z"); shown in this computer's time zone, as
// Tempo's page shows them: "2026-01-31 10:05" one hour east of UTC. Text that isn't a
// time shows as it is.
/** @param {unknown} stamp */
export function localTime(stamp) {
  const at = new Date(/** @type {string} */ (stamp));
  if (Number.isNaN(at.getTime())) return String(stamp ?? "");
  const two = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `${day} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

// What went wrong, for people: what failed, and why if known. Tempo's own message is
// kept (its last line: a Python error ends with the one that says what happened);
// Herdr's and JavaScript's are put in words.
/**
 * @param {any} error what was thrown: usually an Error, but any value can be
 * @param {string} what what failed, as "read the questions"
 */
export function friendly(error, what) {
  const text = String(error?.message ?? error ?? "").trim();
  if (/timed out/.test(text)) return `Tempo took too long to ${what}.`;
  if (error instanceof SyntaxError) {
    return `Tempo couldn't ${what}: its answer wasn't the JSON the panel expects. Is Tempo up to date?`;
  }
  const last = (
    text
      .split("\n")
      .filter((line) => line.trim())
      .pop() ?? ""
  ).trim();
  if (!last) return `Tempo couldn't ${what}.`;
  return `Tempo couldn't ${what}: ${last}${/[.!?]$/.test(last) ? "" : "."}`;
}

// Where the list is from: the project, named by its questions, or with none open the
// shown folder's name. Only Tempo knows which project a folder belongs to (a git
// checkout's top folder, or a name you gave it), so that's only a hint; for the header
// alone, never compared with a question's project.
/** @param {{ cwd?: string | null, project?: string | null } | null | undefined} mine */
export function place(mine) {
  if (mine?.project) return mine.project;
  return (mine?.cwd ?? "").split("/").filter(Boolean).pop() ?? "";
}

// What a thread entry says: an answer with its choice, a reworded question, or the text.
/** @param {{ kind?: string, choice?: string, body?: string | null }} e */
export function entryText(e) {
  if (e.kind === "answer") return `answered (${e.choice})${e.body ? `: ${e.body}` : ""}`;
  if (e.kind === "reword") return `reworded the question${e.body ? `: ${e.body}` : ""}`;
  return e.body;
}

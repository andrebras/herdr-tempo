// What the panel does with Tempo's list of questions: group them, and pick the new ones to
// toast. Knows nothing about Herdr, so the tests run it under Node.js.

/**
 * An open question, as `tempo list --json` gives it: the fields the panel reads.
 * @typedef {{ number: number, project: string, label: string, title: string, goal?: string | null,
 *   waiting?: boolean | null, created_at: string, updated_at?: string }} Question
 */

/**
 * A toast, as Herdr's notify() takes it. A click runs action, a Herdr command.
 * @typedef {{ name: string, args?: Record<string, unknown> }} Action
 * @typedef {{ title: string, body: string, level: "info", timeout: number, action?: Action }} Toast
 */

// The newest few new questions get a toast each; one more toast counts the rest.
export const TOASTS = 3;

// The questions of all (every open one) not in mark, oldest first, and the mark to keep:
// every open question, so it never grows past them. A question is its project and
// number: two asked in the same second are both new. A mark that isn't a list (the first
// read, or the newest time an older panel kept) announces nothing, so no old question
// toasts after an update.
/**
 * @param {Question[]} all
 * @param {unknown} mark
 * @returns {{ fresh: Question[], keys: string[] }}
 */
export function unannounced(all, mark) {
  /** @param {Question} q */
  const key = (q) => `${q.number}:${q.project}`;
  const keys = all.map(key).sort();
  if (!Array.isArray(mark)) return { fresh: [], keys };
  const known = new Set(mark);
  const fresh = all
    .filter((q) => !known.has(key(q)))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return { fresh, keys };
}

// The toasts for the new questions, as notify() takes them. Every project's new questions
// are announced, but only the shown project's (project) open in the panel when clicked:
// the panel shows that project alone. A command reaches the panel only while it shows
// (shown), so a hidden one is shown instead (reveal, Herdr's command that shows it).
/**
 * @param {Question[]} fresh
 * @param {{ project: string | null | undefined, shown: boolean, reveal: Action }} where
 * @returns {Toast[]}
 */
export function toasts(fresh, { project, shown, reveal }) {
  /** @type {Toast[]} */
  const list = fresh.slice(-TOASTS).map((q) => {
    /** @type {Action} */
    const action = shown ? { name: `tempo.open:${q.number}:${q.project}` } : reveal;
    return {
      title: `Tempo: ${q.label} in ${q.project}`,
      body: q.title,
      level: "info",
      timeout: 8000,
      ...(q.project === project ? { action } : {}),
    };
  });
  const more = fresh.length - TOASTS;
  if (more > 0) {
    list.push({
      title: `Tempo: and ${more} more new question${more === 1 ? "" : "s"}`,
      body: "The Tempo panel lists the shown project's questions.",
      level: "info",
      timeout: 8000,
      ...(shown ? {} : { action: reveal }),
    });
  }
  return list;
}

// Questions by goal, keeping tempo's order; questions without a goal come last.
/**
 * @param {Question[]} questions
 * @returns {[string, Question[]][]}
 */
export function goals(questions) {
  const groups = groupBy(questions, (q) => q.goal ?? "");
  return [...groups.filter(([g]) => g), ...groups.filter(([g]) => !g)];
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} key
 * @returns {[string, T[]][]}
 */
function groupBy(items, key) {
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return [...groups.entries()];
}

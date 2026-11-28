// The commands Herdr hands the panel (nextCommand()), read into their parts. Knows nothing
// about Herdr, so the tests run it under Node.js.

// "open": the shown project's first question; "open:N:project": question N of project,
// whose name may hold colons. null for any other command.
/**
 * @param {string} command
 * @returns {{ name: "open", number: number, project: string }
 *   | { name: "open", number: null, project: null } | null}
 */
export function parseCommand(command) {
  const [name, number, ...rest] = command.split(":");
  if (name !== "open") return null;
  if (number) return { name: "open", number: Number(number), project: rest.join(":") };
  return { name: "open", number: null, project: null };
}

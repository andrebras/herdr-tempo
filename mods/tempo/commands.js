// The commands Herdr hands the panel (nextCommand()), read into their parts. Knows nothing
// about Herdr, so the tests run it under Node.js.

// "open": the shown project's first question; "open:N:project": question N of project,
// whose name may hold colons. null for any other command.
export function parseCommand(command) {
  const [name, number, ...rest] = command.split(":");
  if (name !== "open") return null;
  if (number) return { name, number: Number(number), project: rest.join(":") };
  return { name, number: null, project: null };
}

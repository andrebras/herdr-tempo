// Tests for the panel's pure functions, run with `node --test`. The panel imports
// Herdr's own modules, which only exist inside Herdr, so this reads each function (and
// the constants it uses) out of the panel's source and runs just those.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

// A zone east of UTC, so a time shown in UTC can't pass for local time.
process.env.TZ = "Asia/Kolkata";

const source = readFileSync(join(__dirname, "..", "mods", "tempo", "main.js"), "utf8");

// The top-level `const NAME = …;` or `function NAME(…) { … }` called name, as source.
function part(name) {
  const found =
    source.match(new RegExp(`\\nconst ${name} = [^\\n]*\\n`)) ??
    source.match(new RegExp(`\\n(async )?function ${name}\\([\\s\\S]*?\\n}\\n`));
  assert.ok(found, `main.js has ${name}`);
  return found[0];
}

// The function called name, with the parts it needs defined before it.
function load(name, needs = []) {
  return new Function(`${[...needs, name].map(part).join("\n")}\nreturn ${name};`)();
}

const lineBreaks = load("lineBreaks", ["LIST_LINE"]);
const localTime = load("localTime");

test("a single line break stays a new line, as on the page", () => {
  assert.equal(lineBreaks("one\ntwo"), "one  \ntwo");
  assert.equal(lineBreaks("one\r\ntwo"), "one  \ntwo");
});

test("paragraphs stay as they are", () => {
  assert.equal(lineBreaks("one\n\ntwo"), "one\n\ntwo");
});

test("a list after a line of text still starts a list", () => {
  assert.equal(lineBreaks("We know:\n- one\n- two"), "We know:\n\n- one\n- two");
  assert.equal(lineBreaks("Steps:\n1. read\n2) write"), "Steps:\n\n1. read\n2) write");
});

test("text after a list is its own paragraph, as on the page", () => {
  assert.equal(lineBreaks("- one\n- two\nafter"), "- one\n- two\n\nafter");
});

test("no text gives an empty string", () => {
  assert.equal(lineBreaks(null), "");
  assert.equal(lineBreaks(undefined), "");
  assert.equal(lineBreaks(""), "");
});

test("a thread time shows in the local time zone, not in UTC", () => {
  assert.equal(localTime("2026-01-31T09:05:00Z"), "2026-01-31 14:35");
  assert.equal(localTime("2026-01-31T20:00:00Z"), "2026-02-01 01:30");
});

test("text that isn't a time shows as it is", () => {
  assert.equal(localTime("soon"), "soon");
  assert.equal(localTime(undefined), "");
});

const unannounced = load("unannounced");
const q = (number, project, created_at = "2026-01-31T09:05:00Z") => ({ number, project, created_at });

test("the first read, or a mark from an older panel, announces nothing", () => {
  const all = [q(1, "alpha"), q(2, "beta")];
  assert.deepEqual(unannounced(all, null), { fresh: [], keys: ["1:alpha", "2:beta"] });
  assert.deepEqual(unannounced(all, "2026-01-31T09:05:00Z").fresh, []);
});

test("two questions asked in the same second are both new", () => {
  const all = [q(1, "alpha"), q(2, "alpha"), q(3, "alpha")];
  const { fresh } = unannounced(all, ["1:alpha"]);
  assert.deepEqual(
    fresh.map((x) => x.number),
    [2, 3],
  );
});

test("the same number in another project is another question", () => {
  const { fresh } = unannounced([q(1, "alpha"), q(1, "beta")], ["1:alpha"]);
  assert.deepEqual(fresh, [q(1, "beta")]);
});

test("new questions come oldest first, and the mark keeps only open ones", () => {
  const all = [q(5, "beta", "2026-01-31T10:00:00Z"), q(4, "alpha", "2026-01-31T11:00:00Z")];
  const { fresh, keys } = unannounced(all, ["9:gone"]);
  assert.deepEqual(
    fresh.map((x) => x.number),
    [5, 4],
  );
  assert.deepEqual(keys, ["4:alpha", "5:beta"]);
});

const readEvery = load("readEvery", ["SHOWN_MS", "HIDDEN_MS", "WATCHED_MS"]);

test("timed reads are rare while the watch reports every change", () => {
  assert.equal(readEvery(true, true), 60000);
  assert.equal(readEvery(true, false), 60000);
});

test("without a working watch, reads are often while the window shows", () => {
  assert.equal(readEvery(false, true), 4000);
  assert.equal(readEvery(false, false), 30000);
});

const friendly = load("friendly");

test("an error says what failed, with Tempo's own last line", () => {
  const error = new Error("Traceback (most recent call last):\n  File x\nsqlite3.OperationalError: database is locked\n");
  assert.equal(
    friendly(error, "read the questions"),
    "Tempo couldn't read the questions: sqlite3.OperationalError: database is locked.",
  );
});

test("a timeout and output that isn't JSON are put in words", () => {
  assert.equal(
    friendly(new Error("`tempo` timed out after 15000 ms"), "read the questions"),
    "Tempo took too long to read the questions.",
  );
  assert.match(friendly(new SyntaxError("Unexpected token"), "open the question"), /Is Tempo up to date\?$/);
});

test("an error with no text still says what failed", () => {
  assert.equal(friendly(new Error(""), "open the question"), "Tempo couldn't open the question.");
  assert.equal(friendly(new Error("No such project."), "open the question"), "Tempo couldn't open the question: No such project.");
});

const place = load("place");

test("the header names the project, or the folder while it has no open question", () => {
  assert.equal(place({ cwd: "/work/alpha/src", project: "alpha", questions: [] }), "alpha");
  assert.equal(place({ cwd: "/work/alpha/src", project: null, questions: [] }), "src");
  assert.equal(place({ cwd: "/work/beta/", project: null, questions: [] }), "beta");
  assert.equal(place(null), "");
});

// Tests for text.js: the text the panel shows, worked out from Tempo's data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { entryText, friendly, lineBreaks, localTime, place } from "../mods/tempo/text.js";

// A zone east of UTC, so a time shown in UTC can't pass for local time.
process.env.TZ = "Asia/Kolkata";

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

test("the header names the project, or the folder while it has no open question", () => {
  assert.equal(place({ cwd: "/work/alpha/src", project: "alpha", questions: [] }), "alpha");
  assert.equal(place({ cwd: "/work/alpha/src", project: null, questions: [] }), "src");
  assert.equal(place({ cwd: "/work/beta/", project: null, questions: [] }), "beta");
  assert.equal(place(null), "");
});

test("a thread entry says what happened", () => {
  assert.equal(entryText({ kind: "answer", choice: "b", body: "" }), "answered (b)");
  assert.equal(entryText({ kind: "answer", choice: "a", body: "go" }), "answered (a): go");
  assert.equal(entryText({ kind: "reword", body: "shorter" }), "reworded the question: shorter");
  assert.equal(entryText({ kind: "reword" }), "reworded the question");
  assert.equal(entryText({ kind: "reply", body: "More, please." }), "More, please.");
});

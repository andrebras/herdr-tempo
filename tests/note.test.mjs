// Tests for note.js: what Cmd+Enter in the note box sends.
import assert from "node:assert/strict";
import { test } from "node:test";
import { submitAction, withoutTypedBreak } from "../mods/tempo/note.js";

test("with an option picked, Cmd+Enter sends the answer, note or not", () => {
  assert.equal(submitAction({ pick: "b", note: "", sending: false }), "answer");
  assert.equal(submitAction({ pick: "b", note: "Nicer view", sending: false }), "answer");
});

test("with no option but a note, it asks for more context", () => {
  assert.equal(submitAction({ pick: null, note: "Why not both?", sending: false }), "more");
});

test("with neither, or while a send runs, it does nothing", () => {
  assert.equal(submitAction({ pick: null, note: "  \n ", sending: false }), null);
  assert.equal(submitAction({ pick: undefined, note: "", sending: false }), null);
  assert.equal(submitAction({ pick: "a", note: "x", sending: true }), null);
});

test("the line break typed at the cursor comes out", () => {
  assert.equal(withoutTypedBreak("Nicer view\n", 11), "Nicer view");
  assert.equal(withoutTypedBreak("one\ntwo", 4), "onetwo");
  assert.equal(withoutTypedBreak("\n", 1), "");
});

test("offsets count UTF-16 code units, as the note box gives them", () => {
  assert.equal(withoutTypedBreak("ok 👍\n", 6), "ok 👍");
});

test("no break just before the cursor leaves the text alone", () => {
  assert.equal(withoutTypedBreak("Nicer view", 10), null);
  assert.equal(withoutTypedBreak("one\ntwo", 7), null);
  assert.equal(withoutTypedBreak("", 0), null);
});

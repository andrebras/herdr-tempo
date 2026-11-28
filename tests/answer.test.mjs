// Tests for answer.js: answering the question as the panel showed it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { answerArgs, refusal, rewordNotice } from "../mods/tempo/answer.js";

test("the answer names the version shown", () => {
  assert.deepEqual(answerArgs({ number: 12, pick: "b", project: "alpha", note: "", version: 2 }), [
    "answer",
    "12",
    "b",
    "--project",
    "alpha",
    "--version=2",
  ]);
});

test("a note goes as one word, trimmed, so a dash can't start an option", () => {
  const args = answerArgs({ number: 3, pick: "a", project: "alpha", note: " --force \n", version: 1 });
  assert.deepEqual(args.slice(-2), ["--version=1", "--note=--force"]);
});

test("without a version, for an older Tempo, the answer is as before", () => {
  assert.deepEqual(answerArgs({ number: 3, pick: "a", project: "alpha", note: "ok", version: null }), [
    "answer",
    "3",
    "a",
    "--project",
    "alpha",
    "--note=ok",
  ]);
});

// The texts below are what Tempo printed when run against a scratch database.
test("a refusal for a reworded question is told apart", () => {
  assert.equal(refusal("tempo: Q1 changed since you looked at it (now version 2); check it again\n"), "reworded");
});

test("an older Tempo without --version is told apart", () => {
  const usage = "usage: tempo [-h]\n             {add,show,list} ...\n";
  assert.equal(refusal(`${usage}tempo: error: unrecognized arguments: --version=1\n`), "old");
});

test("any other error is left to the usual notice", () => {
  assert.equal(refusal("tempo: This question is already answered; reopen it to answer again\n"), null);
  assert.equal(refusal("tempo: error: unrecognized arguments: --note=x\n"), null);
  assert.equal(refusal(""), null);
});

test("a reword under a pick and a note says both what changed and what stays", () => {
  assert.equal(
    rewordNotice({ pick: "b", note: "Nicer view" }, 1, 2),
    "Claude reworded this question while you were answering it (now version 2). " +
      "Your pick was cleared: read the options again. Your note is kept.",
  );
});

test("with only a pick, or only a note, it says that part", () => {
  assert.equal(
    rewordNotice({ pick: "a", note: " " }, 1, 3),
    "Claude reworded this question while you were answering it (now version 3). " +
      "Your pick was cleared: read the options again.",
  );
  assert.equal(
    rewordNotice({ pick: null, note: "Why?" }, 2, 3),
    "Claude reworded this question while you were answering it (now version 3). Your note is kept.",
  );
});

test("nothing to say when nothing was started or the wording is the same", () => {
  assert.equal(rewordNotice({ pick: null, note: "" }, 1, 2), null);
  assert.equal(rewordNotice({ pick: "a", note: "x" }, 2, 2), null);
});

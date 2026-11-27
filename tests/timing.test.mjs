// Tests for timing.js: how often the panel reads the questions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readEvery } from "../mods/tempo/timing.js";

test("timed reads are rare while the watch reports every change", () => {
  assert.equal(readEvery(true, true), 60000);
  assert.equal(readEvery(true, false), 60000);
});

test("without a working watch, reads are often while the window shows", () => {
  assert.equal(readEvery(false, true), 4000);
  assert.equal(readEvery(false, false), 30000);
});

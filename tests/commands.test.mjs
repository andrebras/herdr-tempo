// Tests for commands.js: how the panel reads the commands Herdr hands it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand } from "../mods/tempo/commands.js";

test("open alone means the shown project's first question", () => {
  assert.deepEqual(parseCommand("open"), { name: "open", number: null, project: null });
});

test("open with a number names the question and its project", () => {
  assert.deepEqual(parseCommand("open:12:alpha"), { name: "open", number: 12, project: "alpha" });
});

test("a project name may hold colons", () => {
  assert.deepEqual(parseCommand("open:3:team:alpha"), { name: "open", number: 3, project: "team:alpha" });
});

test("any other command is not the panel's", () => {
  assert.equal(parseCommand("focus"), null);
  assert.equal(parseCommand(""), null);
});

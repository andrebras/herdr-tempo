// Tests for the panel's pure functions, run with `node --test`. The panel imports
// Herdr's own modules, which only exist inside Herdr, so this reads each function (and
// the constants it uses) out of the panel's source and runs just those.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

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

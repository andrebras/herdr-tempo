// Tests for the panel's pure functions, run with `node --test`. The panel imports
// Herdr's own modules, which only exist inside Herdr, so this reads each function (and
// the constants it uses) out of the panel's source and runs just those.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../mods/tempo/main.js", import.meta.url), "utf8");

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

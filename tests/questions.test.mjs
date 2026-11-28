// Tests for questions.js: which questions are new, and how the list groups them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { closes, goals, TOASTS, toasts, unannounced } from "../mods/tempo/questions.js";
import { NEW_TOAST_MS } from "../mods/tempo/timing.js";

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

const reveal = { name: "layout.select", args: { child: "panel-tempo", show: true } };
const fresh = (n, project = "alpha") =>
  Array.from({ length: n }, (_, i) => ({ number: i + 1, project, label: `Q${i + 1}`, title: `Title ${i + 1}` }));

test("a new question of the shown project opens it when the panel shows", () => {
  const [toast] = toasts(fresh(1), { project: "alpha", shown: true, reveal });
  assert.deepEqual(toast, {
    title: "Tempo: Q1 in alpha",
    body: "Title 1",
    level: "info",
    timeout: NEW_TOAST_MS,
    action: { name: "tempo.open:1:alpha" },
  });
});

test("while the panel is hidden, a click shows it instead", () => {
  const [toast] = toasts(fresh(1), { project: "alpha", shown: false, reveal });
  assert.deepEqual(toast.action, reveal);
});

test("another project's question toasts with no click", () => {
  const [toast] = toasts(fresh(1, "beta"), { project: "alpha", shown: true, reveal });
  assert.equal(toast.title, "Tempo: Q1 in beta");
  assert.equal("action" in toast, false);
});

test("the newest few toast each, and one more counts the rest", () => {
  const list = toasts(fresh(TOASTS + 2), { project: "alpha", shown: true, reveal });
  assert.equal(list.length, TOASTS + 1);
  assert.deepEqual(
    list.slice(0, TOASTS).map((t) => t.body),
    ["Title 3", "Title 4", "Title 5"],
  );
  assert.equal(list[TOASTS].title, "Tempo: and 2 more new questions");
  assert.equal("action" in list[TOASTS], false);
  const one = toasts(fresh(TOASTS + 1), { project: "alpha", shown: false, reveal });
  assert.equal(one[TOASTS].title, "Tempo: and 1 more new question");
  assert.deepEqual(one[TOASTS].action, reveal);
});

test("no new questions, no toasts", () => {
  assert.deepEqual(toasts([], { project: "alpha", shown: true, reveal }), []);
});

test("questions group by goal in tempo's order, those without one last", () => {
  const q1 = { number: 1, goal: null };
  const q2 = { number: 2, goal: "Ship" };
  const q3 = { number: 3, goal: "Fix" };
  const q4 = { number: 4, goal: "Ship" };
  const q5 = { number: 5 };
  assert.deepEqual(goals([q1, q2, q3, q4, q5]), [
    ["Ship", [q2, q4]],
    ["Fix", [q3]],
    ["", [q1, q5]],
  ]);
  assert.deepEqual(goals([]), []);
});

test("the open question closes when another project shows", () => {
  assert.equal(closes("alpha", "beta", false), true);
  assert.equal(closes("alpha", "alpha", true), false);
});

test("an empty list in the same space keeps it, for follow() to see it leave", () => {
  assert.equal(closes("alpha", null, false), false);
});

test("an empty list in another space closes it", () => {
  assert.equal(closes("alpha", null, true), true);
});

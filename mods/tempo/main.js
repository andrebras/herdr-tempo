// Tempo in Herdr: the open questions of the shown space's project, beside the terminals.
// A click shows the question in this panel: its context, its options and its thread. You
// pick an option (with an optional note) and send it, or ask Claude for more. These are the
// person's own clicks, sent with `tempo answer` and `tempo reply`, as the page sends them.
// It lives in Herdr's side panel, beside Files and Changes (`panel` in mod.json). A toast
// says when a new question arrives; a click on it shows the panel, or the question when
// the panel already shows.
//
// It runs programs: `tempo list --json` every few seconds (less often while the window is
// hidden), `tempo show --json` for the open question, and `tempo answer` or `tempo reply`
// when you send.
//
// This file is the view and what talks to Herdr; what knows nothing about Herdr is in
// modules beside it (text.js, questions.js, commands.js, timing.js, reads.js, note.js,
// answer.js), with tests.

import { View, div } from "gpui-kit";
import { h_flex, Textarea, TextareaState, TextView, v_flex } from "gpui-base";
import {
  checking,
  exec,
  home,
  layout,
  nextCommand,
  notify,
  panes,
  setShared,
  settings,
  shared,
  spaces,
  theme,
  watchFolder,
  window,
} from "herdr";
import { answerArgs, refusal, rewordNotice } from "./answer.js";
import { parseCommand } from "./commands.js";
import { leftNotice, submitAction, withoutTypedBreak } from "./note.js";
import { closes, goals, toasts, unannounced } from "./questions.js";
import { Reads } from "./reads.js";
import { entryText, friendly, lineBreaks, localTime, place } from "./text.js";
import {
  BRIEF_TOAST_MS,
  DUE_SLACK_MS,
  FIND_MS,
  readEvery,
  REWATCH_MS,
  SHOWN_MS,
  SPACE_MS,
  TEMPO_TIMEOUT_MS,
} from "./timing.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {Record<string, import("gpui-kit").Color>} Theme the theme's colours, by name, each "#rrggbb" */
/** @typedef {import("./questions.js").Question} Question */
/** @typedef {{ cwd: string, project: string | null, questions: Question[] }} Mine the shown space's list */
/** @typedef {{ letter: string, text: string }} Option */
/**
 * @typedef {{ id: number, author: string, kind: string, choice?: string, body?: string | null,
 *   created_at: string }} Entry an entry in a question's thread
 */
/**
 * A question in full, as `tempo show --json` gives it, with waiting from the list.
 * @typedef {Question & { context: string, options: Option[], recommended?: string | null,
 *   version: number, entries: Entry[] }} Full
 */
/**
 * notice: what changed under the person, such as a reword while they were answering.
 * left: the question was answered or archived elsewhere; it stays only so the note can be
 * copied, and nothing can be sent.
 * @typedef {{ project: string, number: number, question: Full | null, pick: string | null,
 *   notice: string | null, left?: boolean }} Open
 */

// The files a change to the questions touches: the database and its write-ahead log. Not
// "-shm", which every read touches too, so a read would start the next one.
const DATABASE = /\/questions\.db(-wal)?$/;
// The open questions already announced, as "number:project", shared so copies and reloads
// never repeat a toast.
const ANNOUNCED = "tempo.announced";
// The shown project's open-question count: Herdr shows it on the Tempo button while the
// panel is hidden.
const BADGE = "tempo.badge";
// Text sizes follow the terminal font size (Settings → Look → Terminal font), the one
// size Herdr lets you change: a question's text is that size (size(1)), the list and the
// thread one step smaller (size(0)), labels two, the title one larger.
/** @param {number} step */
function size(step) {
  return Number(settings()?.font_size ?? 14) - 1 + step;
}

// Question text as Tempo's page shows it (lineBreaks() in text.js). HTML in the text shows
// as typed, never as markup.
/**
 * @param {string} id
 * @param {unknown} text
 */
function rich(id, text) {
  return TextView.markdown(id, lineBreaks(text)).raw_html(false).selectable(true);
}

// Shown while there's no tempo command. Tempo comes as a Claude Code plugin; its
// /tempo:install, typed in Claude Code, puts the command in your terminal.
const MISSING =
  "The tempo command wasn't found. Install Tempo's plugin in Claude Code, then type /tempo:install " +
  "in a Claude Code session to add the command (steps: github.com/andrebras/tempo#install). " +
  "The panel finds it within a minute, with no restart.";

// This mod's block in Herdr's side panel.
const PANEL = "panel-tempo";
export default class Tempo extends View {
  // The fields init() sets. Herdr makes the view first and runs init() after, so these
  // declarations (undefined until then) never wipe what init() sets.
  /** @type {string | null} the tempo command's path, once found */
  tempo;
  /** @type {boolean} no tempo command on this machine */
  missing;
  /** @type {number} when the tempo command was last looked for */
  looked;
  /** @type {Question[]} every project's open questions */
  all;
  /** @type {Mine | null} the shown space's list */
  mine;
  /** @type {string | null} why the last read failed */
  error;
  /** @type {Reads} which read counts, and whether another is due */
  reads;
  /** @type {string | null | undefined} the space switchSpace last read */
  switched;
  /** @type {Map<string, Question[]>} each folder's last list, shown at once when you switch back */
  seen;
  /** @type {number} when the last read started */
  last;
  /** @type {boolean} the watch on Tempo's database is alive */
  watching;
  /** @type {number} when it last started */
  watched;
  /** @type {boolean} a timed read found a change the watch didn't report */
  missed;
  /** @type {Open | null} the question shown in full */
  open;
  /** @type {boolean} an answer or a follow-up is being sent */
  sending;
  /** @type {import("gpui-base").TextareaState} the note */
  note;

  /**
   * @param {unknown} _props
   * @param {AsyncContext} cx
   */
  init(_props, cx) {
    this.tempo = null;
    this.missing = false;
    this.looked = 0;
    this.all = [];
    this.mine = null;
    this.error = null;
    this.reads = new Reads();
    this.switched = undefined;
    this.seen = new Map();
    this.last = 0;
    this.watching = false;
    this.watched = 0;
    this.missed = false;
    this.open = null;
    this.sending = false;
    // One note for both buttons, as on Tempo's page: it goes with the answer, or alone
    // as a request for more context.
    this.note = TextareaState.new({ placeholder: "A note, or what you need to know" });
    this.note.set_auto_grow(3, 10);
    this.note.on("change", (_e, cx) => cx.notify());
    this.note.on("submit", (e, cx) => this.submit(e, cx));
    if (checking()) return;
    cx.spawn((cx) => this.find(cx));
    cx.timer.every(SPACE_MS, (cx) => {
      if (this.tempo && shownFolder() !== (this.mine?.cwd ?? null)) this.switchSpace(cx);
    });
    cx.timer.every(SHOWN_MS, (cx) => {
      if (this.missing && Date.now() - this.looked >= FIND_MS) cx.spawn((cx) => this.find(cx));
      if (this.tempo && !this.watching && Date.now() - this.watched >= REWATCH_MS) {
        cx.spawn((cx) => this.watch(cx));
      }
      const wait = readEvery(this.watching && !this.missed, window()?.visible !== false);
      if (Date.now() - this.last >= wait - DUE_SLACK_MS) cx.spawn((cx) => this.refresh(cx, false, true));
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        await this.command(command, cx);
        cx.notify();
      }
    });
  }

  // Look for the tempo command; once found, read the questions and watch for changes.
  /** @param {AsyncContext} cx */
  async find(cx) {
    this.looked = Date.now();
    this.tempo = await findTempo();
    this.missing = !this.tempo;
    if (!this.tempo) return cx.notify();
    await this.refresh(cx);
    if (!this.watching) await this.watch(cx);
  }

  // "open": the shown project's first question; "open:N:project": that one.
  /**
   * @param {string} command
   * @param {AsyncContext} cx
   */
  async command(command, cx) {
    const parsed = parseCommand(command);
    if (!parsed) return;
    if (parsed.number !== null) return this.show(parsed.project, parsed.number, cx);
    const first = this.mine?.questions[0];
    if (first) return this.show(first.project, first.number, cx);
    notify({ title: "Tempo", body: "No open questions.", level: "info", timeout: BRIEF_TOAST_MS });
  }

  // Read the questions again as soon as Tempo's database changes, so the count on the
  // Tempo button follows an answer or a new question at once, not at the next tick. While
  // the watch works, the timer reads only once a minute. It reads more often again when
  // there's no database yet, when the watch ends (the timer starts it again later), or
  // when a timed read finds a change the watch missed: Tempo then uses another database
  // (TEMPO_DB, a checkout's own).
  /** @param {AsyncContext} cx */
  async watch(cx) {
    this.watching = true;
    this.watched = Date.now();
    this.missed = false;
    const folder = await databaseFolder();
    try {
      while (folder) {
        const paths = await watchFolder(folder);
        // No paths: the watch was cancelled, as when this copy closes.
        if (paths.length === 0) break;
        if (paths.some((p) => p === folder || DATABASE.test(p))) cx.spawn((cx) => this.refresh(cx));
      }
    } catch {
      // The watch couldn't start or stopped; the timer tries again.
    } finally {
      this.watching = false;
    }
  }

  // Another space shows: its last list and count at once (if seen before), then a fresh
  // read. A task render starts calls this, and so does a timer, since a hidden panel never
  // draws.
  // Once per switch: a read that fails leaves this.mine on the old space, and must not
  // make every tick read again.
  /** @param {AsyncContext} cx */
  switchSpace(cx) {
    const cwd = shownFolder();
    if (cwd === this.switched) return;
    this.switched = cwd;
    const last = cwd ? this.seen.get(cwd) : undefined;
    if (cwd && last) {
      this.mine = { cwd, questions: last, project: last[0]?.project ?? null };
      showCount(last.length);
    }
    // The panel shows the shown space's project alone: a question of another one closes.
    if (this.open && this.open.project !== (last?.[0]?.project ?? null)) this.open = null;
    cx.notify();
    cx.spawn((cx) => this.refresh(cx));
  }

  // A read asked for while one runs is done right after it, so no change is missed.
  // now: read even while a read runs, as after sending; that older read is then dropped,
  // since its lists may be from before the send.
  // timed: the timer asked, so a change found means the watch missed it.
  /** @param {AsyncContext} cx */
  async refresh(cx, now = false, timed = false) {
    if (!this.tempo) return;
    const read = this.reads.start(now);
    if (read === null) return;
    this.last = Date.now();
    const cwd = shownFolder();
    try {
      // Both at once: each is a program start, about a quarter second.
      const [all, mine] = await Promise.all([
        tempo(this.tempo, ["list", "--json", "--all-projects"], home()),
        cwd ? tempo(this.tempo, ["list", "--json"], cwd) : null,
      ]);
      if (!this.reads.current(read)) return;
      if (cwd) this.seen.set(cwd, mine);
      const moved = JSON.stringify(all) !== JSON.stringify(this.all);
      if (timed && moved && this.watching) this.missed = true;
      // With no space (cwd null) this.mine is null: ?? null keeps null and undefined from
      // counting as a change, which would draw, and so read again, without end.
      const elsewhere = cwd !== (this.mine?.cwd ?? null);
      const changed = moved || JSON.stringify(mine) !== JSON.stringify(this.mine?.questions ?? null) || elsewhere;
      this.all = all;
      this.mine = cwd ? { cwd, questions: mine, project: mine[0]?.project ?? null } : null;
      // After this.mine: a project's first question is what names the shown project, and
      // the toast's click needs it.
      this.announce(all);
      const count = mine?.length ?? 0;
      showCount(count);
      if (this.open && closes(this.open.project, this.mine?.project, elsewhere)) this.open = null;
      this.error = null;
      if (this.open) await this.follow(cx);
      if (changed) cx.notify();
    } catch (error) {
      if (!this.reads.current(read)) return;
      const text = `${friendly(error, "read the questions")} The panel tries again shortly.`;
      if (this.error !== text) {
        this.error = text;
        cx.notify();
      }
    } finally {
      this.reads.end(read);
    }
    // Asked again, or the space changed, while this ran: read now, not at the next tick.
    if (this.reads.again() || shownFolder() !== cwd) {
      cx.spawn((cx) => this.refresh(cx));
    }
  }

  // Keep the open question current: reread it when it changed, close it once it isn't open.
  // With a note typed, it stays instead, with a line saying it was answered elsewhere, so
  // the note isn't lost: the person copies it, then goes back.
  /** @param {AsyncContext} cx */
  async follow(cx) {
    // Called only while a question shows.
    const open = /** @type {Open} */ (this.open);
    const { project, number, question } = open;
    const now = this.listed(project, number);
    if (!now) {
      if (open.left) return;
      if (!this.note.value().trim()) {
        this.open = null;
        return cx.notify();
      }
      const status = await tempo(
        /** @type {string} */ (this.tempo),
        ["show", String(number), "--json", "--project", project],
        home(),
      )
        .then((q) => q.status)
        .catch(() => null);
      // Open again (reopened meanwhile): the next read lists it.
      if (this.open !== open || status === "open") return;
      Object.assign(open, { left: true, pick: null, notice: leftNotice(number, status) });
      cx.notify();
    } else if (open.left || now.updated_at !== question?.updated_at || now.waiting !== question?.waiting) {
      // Back in the list (reopened elsewhere): it can be answered again.
      if (open.left) Object.assign(open, { left: false, notice: null });
      await this.load(cx);
    }
  }

  // The question in every project's list, if it is still open there.
  /**
   * @param {string} project
   * @param {number | undefined} number
   */
  listed(project, number) {
    return this.all.find((q) => q.project === project && q.number === number);
  }

  // Toast the questions not announced before; the first read only sets the mark.
  /** @param {Question[]} all */
  announce(all) {
    const { fresh, keys } = unannounced(all, shared(ANNOUNCED));
    const reveal = { name: "layout.select", args: { stack: "panel-body", child: PANEL, show: true } };
    for (const toast of toasts(fresh, { project: this.mine?.project, shown: panelShown(), reveal })) notify(toast);
    const mark = shared(ANNOUNCED);
    if (!Array.isArray(mark) || mark.join("\n") !== keys.join("\n")) setShared(ANNOUNCED, keys);
  }

  /**
   * @param {string} project
   * @param {number} number
   * @param {AsyncContext} cx
   */
  async show(project, number, cx) {
    this.open = { project, number, question: null, pick: null, notice: null };
    this.note.set_value("");
    cx.notify();
    await this.load(cx);
  }

  /** @param {AsyncContext} cx */
  async load(cx) {
    const { project, number } = this.open ?? {};
    if (!this.tempo || !project) return;
    try {
      const question = await tempo(this.tempo, ["show", String(number), "--json", "--project", project], home());
      const list = this.listed(project, number);
      if (this.open?.project === project && this.open.number === number) {
        // Claude reworded it while the person was answering: the pick's letter may now name
        // another option, so it is cleared, and a notice says so, as on Tempo's page.
        const shown = this.open.question?.version;
        const typed = { pick: this.open.pick, note: this.note.value() };
        const notice = shown === undefined ? null : rewordNotice(typed, shown, question.version);
        if (notice) Object.assign(this.open, { pick: null, notice });
        // waiting comes from the list: show --json doesn't carry it.
        this.open.question = { ...question, waiting: list?.waiting ?? null };
      }
    } catch (error) {
      notify({ title: "Tempo", body: friendly(error, "open the question"), level: "error" });
      this.open = null;
    }
    cx.notify();
  }

  // Cmd+Enter (Ctrl+Enter off macOS) in the note: Send answer with an option picked, else
  // Ask for more context with a note. Enter and Shift+Enter only start a new line.
  /**
   * @param {import("gpui-base").InputEvent} e
   * @param {Context} cx
   */
  submit(e, cx) {
    if (!e.secondary) return;
    // The note box typed a line break before it reported the key: take it out.
    const cursor = this.note.selected_range().start;
    const text = withoutTypedBreak(this.note.value(), cursor);
    if (text !== null) {
      this.note.set_value(text);
      this.note.set_selected_range({ start: cursor - 1, end: cursor - 1 });
    }
    const busy = this.sending || Boolean(this.open?.left);
    const action = submitAction({ pick: this.open?.pick, note: this.note.value(), sending: busy });
    if (action === "answer") cx.spawn((cx) => this.send(cx));
    else if (action === "more") cx.spawn((cx) => this.followUp(cx));
    cx.notify();
  }

  // The person's own answer, sent as the page sends it: for the version shown, so Tempo
  // refuses it if Claude has reworded the question since. Then the question reloads with
  // the new wording and a notice, and the pick is cleared. A Tempo too old for --version
  // gets the answer again without it.
  /** @param {AsyncContext} cx */
  async send(cx) {
    const { project, number, pick, question } = this.open ?? {};
    if (!pick || !project || !number || !question || this.open?.left || this.sending) return;
    const answer = { number, pick, project, note: this.note.value(), version: question.version };
    const failed = "The answer wasn't saved.";
    let r = await this.deliver(cx, answerArgs(answer), failed, (stderr) => refusal(stderr) !== null);
    if (refusal(r.stderr) === "old") r = await this.deliver(cx, answerArgs({ ...answer, version: null }), failed);
    if (refusal(r.stderr) === "reworded") {
      await this.refresh(cx, true);
      await this.load(cx);
      // load() clears the pick when it finds the new wording; if it couldn't, Tempo's own
      // words say why, and the pick still goes, so the same letter isn't sent again.
      if (this.open?.pick) Object.assign(this.open, { pick: null, notice: r.stderr.replace(/^tempo: /, "").trim() });
    } else if (r.ok) {
      notify({
        title: `Answered Q${number}`,
        body: `(${pick}) sent to Claude.`,
        level: "success",
        timeout: BRIEF_TOAST_MS,
      });
      // On to the project's next open question, as the page does; the list when none is left.
      this.open = null;
      await this.refresh(cx, true);
      const next = this.mine?.questions.find((q) => q.project === project && q.number !== number);
      if (next) await this.show(next.project, next.number, cx);
    }
    cx.notify();
  }

  // The person's own follow-up: Claude answers it in the question.
  /** @param {AsyncContext} cx */
  async followUp(cx) {
    const body = this.note.value().trim();
    const { project, number } = this.open ?? {};
    if (!body || !project || this.open?.left || this.sending) return;
    // The text after --, so one that starts with a dash isn't read as an option.
    const args = ["reply", String(number), "--project", project, "--", body];
    if ((await this.deliver(cx, args, "The follow-up wasn't saved.")).ok) {
      this.note.set_value("");
      // A reword notice said the note was kept; it is sent now.
      if (this.open) this.open.notice = null;
      await this.refresh(cx, true);
      await this.load(cx);
    }
    cx.notify();
  }

  // Run what the person sent (tempo answer or tempo reply), with both buttons off while it
  // runs. ok when it worked; else a toast says why, with failed when tempo doesn't, unless
  // handled says the caller deals with that error itself.
  /**
   * @param {AsyncContext} cx
   * @param {string[]} args
   * @param {string} failed
   * @param {(stderr: string) => boolean} [handled]
   * @returns {Promise<{ ok: boolean, stderr: string }>}
   */
  async deliver(cx, args, failed, handled = () => false) {
    this.sending = true;
    cx.notify();
    // A question shows only once the tempo command was found.
    const path = /** @type {string} */ (this.tempo);
    const r = await exec(path, args, { cwd: home(), timeout: TEMPO_TIMEOUT_MS }).catch((e) => ({
      code: 1,
      stderr: String(e),
    }));
    this.sending = false;
    const ok = r.code === 0;
    if (!ok && !handled(r.stderr)) notify({ title: "Tempo", body: r.stderr.trim() || failed, level: "error" });
    return { ok, stderr: ok ? "" : r.stderr };
  }

  /** @param {Context} cx */
  render(cx) {
    // Herdr gives each colour as a "#rrggbb" string.
    const t = /** @type {Theme} */ (theme());
    const cwd = shownFolder();
    // Herdr draws again when the shown space changes, so this is where a switch shows first.
    // render only describes the panel and changes nothing (setting the count would redraw
    // every mod), so a task switches, and draws the new space's list right after this frame.
    if (this.tempo && cwd !== (this.mine?.cwd ?? null)) cx.spawn((cx) => this.switchSpace(cx));
    const body = this.open ? this.detail(t) : this.list(t, cwd);
    // Drawn as Files and Changes are, beside them.
    return v_flex()
      .id("tempo")
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .text_size(size(0))
      .text_color(t.foreground)
      .child(this.header(t))
      .child(body);
  }

  // As Files' header: back while a question shows, the name, and the project (the folder
  // while it has no open question).
  /** @param {Theme} t */
  header(t) {
    return h_flex()
      .h(42)
      .flex_none()
      .px(14)
      .gap(8)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .when(Boolean(this.open), (el) =>
        el.child(
          div()
            .id("tempo-back")
            .w(20)
            .cursor_pointer()
            .text_color(t.muted)
            .on_click((_e, cx) => {
              this.open = null;
              cx.notify();
            })
            .child("←"),
        ),
      )
      .child(div().font_semibold().child("Tempo"))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_right()
          .text_size(size(-1))
          .text_color(t.dim)
          .child(this.open ? `Q${this.open.number}` : place(this.mine)),
      );
  }

  /**
   * @param {Theme} t
   * @param {string | null} cwd
   */
  list(t, cwd) {
    const mine = this.mine?.questions ?? [];
    return v_flex()
      .id("tempo-list")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .p(8)
      .gap(2)
      .children([
        ...this.status(t, cwd, mine),
        ...goals(mine).flatMap(([goal, qs]) => [...(goal ? [heading(t, goal)] : []), ...qs.map((q) => this.row(t, q))]),
      ]);
  }

  // A line saying why the list is empty, if it is.
  /**
   * @param {Theme} t
   * @param {string | null} cwd
   * @param {Question[]} mine
   */
  status(t, cwd, mine) {
    let text = null;
    if (checking()) text = "";
    else if (this.missing) text = MISSING;
    else if (this.error) text = this.error;
    else if (!this.tempo || !this.mine) text = cwd ? "Reading…" : "This space isn't on this computer.";
    else if (mine.length === 0) text = "No open questions here.";
    if (text === null) return [];
    return [div().px(4).py(6).text_size(size(-1)).text_color(t.muted).child(text)];
  }

  /**
   * @param {Theme} t
   * @param {Question} q
   */
  row(t, q) {
    return h_flex()
      .id(`q-${q.project}-${q.number}`)
      .gap(8)
      .px(6)
      .py(5)
      .rounded(6)
      .items_start()
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => cx.spawn((cx) => this.show(q.project, q.number, cx)))
      .child(
        div()
          .flex_none()
          .min_w(34)
          .whitespace_nowrap()
          .text_color(q.waiting ? t.working : t.accent)
          .child(q.label),
      )
      .child(div().flex_1().min_w(0).child(q.title));
  }

  // One question in full: what it is, the options to pick from, and its thread.
  /** @param {Theme} t */
  detail(t) {
    // render draws this only while a question shows.
    const open = /** @type {Open} */ (this.open);
    const q = open.question;
    const pane = v_flex().id("tempo-detail").flex_1().min_h(0).overflow_y_scrollbar().p(12).gap(12);
    if (!q) return pane.child(div().text_color(t.muted).child("Reading…"));
    const pick = open.pick;
    return pane
      .child(
        v_flex()
          .gap(4)
          .child(
            h_flex()
              .gap(6)
              .text_size(size(-1))
              .text_color(t.dim)
              .child(div().text_color(t.accent).child(q.label))
              .when(Boolean(q.goal), (el) =>
                el.child(
                  div()
                    .truncate()
                    .child(q.goal ?? ""),
                ),
              ),
          )
          .child(div().text_size(size(2)).font_semibold().child(q.title)),
      )
      .when(Boolean(q.waiting), (el) =>
        el.child(
          div()
            .px(8)
            .py(6)
            .rounded(6)
            .bg(t.raised)
            .text_size(size(-1))
            .text_color(t.working)
            .child("Waiting on Claude to answer your follow-up."),
        ),
      )
      .when(Boolean(open.notice), (el) =>
        el.child(
          div()
            .px(8)
            .py(6)
            .rounded(6)
            .bg(t.raised)
            .text_size(size(-1))
            .text_color(t.blocked)
            .child(open.notice ?? ""),
        ),
      )
      .child(rich(`ctx-${q.project}-${q.number}-${q.version}`, q.context).text_size(size(1)).text_color(t.foreground))
      .child(
        v_flex()
          .gap(4)
          .children(q.options.map((o) => this.option(t, o, o.letter === pick, o.letter === q.recommended))),
      )
      .child(
        Textarea.new(this.note)
          .w_full()
          .px(10)
          .py(8)
          .rounded(8)
          .border_1()
          .border_color(t.input)
          .bg(t.background)
          .text_size(size(1))
          .text_color(t.foreground),
      )
      .child(
        h_flex()
          .gap(8)
          .child(this.button(t, "tempo-send", "Send answer", Boolean(pick) && !open.left, true, (cx) => this.send(cx)))
          .child(
            this.button(
              t,
              "tempo-more",
              "Ask for more context",
              Boolean(this.note.value().trim()) && !open.left,
              false,
              (cx) => this.followUp(cx),
            ),
          ),
      )
      .child(
        div()
          .text_size(size(-1))
          .text_color(t.dim)
          .child(
            "Pick an option to answer. To send only a note, use Ask for more context: the question stays open. " +
              "⌘Enter in the note does either (Ctrl+Enter on Linux).",
          ),
      )
      .when(q.entries.length > 0, (el) =>
        el.child(heading(t, "Thread")).children(q.entries.map((e) => this.entry(t, e))),
      );
  }

  /**
   * @param {Theme} t
   * @param {Option} o
   * @param {boolean} picked
   * @param {boolean} recommended
   */
  option(t, o, picked, recommended) {
    return h_flex()
      .id(`opt-${o.letter}`)
      .gap(8)
      .px(8)
      .py(6)
      .rounded(8)
      .items_start()
      .border_1()
      .border_color(picked ? t.accent : t.border)
      .bg(picked ? t.selected : t.surface)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        if (this.open) this.open.pick = picked ? null : o.letter;
        cx.notify();
      })
      .child(div().flex_none().text_color(t.accent).child(`(${o.letter})`))
      .child(div().flex_1().min_w(0).child(o.text))
      .when(recommended, (el) =>
        el.child(div().flex_none().text_size(size(-1)).text_color(t.done).child("recommended")),
      );
  }

  // A button that does nothing while it can't act or while something is sending.
  /**
   * @param {Theme} t
   * @param {string} id
   * @param {string} label
   * @param {boolean} enabled
   * @param {boolean} primary
   * @param {(cx: AsyncContext) => unknown} act
   */
  button(t, id, label, enabled, primary, act) {
    const on = enabled && !this.sending;
    return h_flex()
      .id(id)
      .flex_1()
      .h(32)
      .px(10)
      .justify_center()
      .items_center()
      .rounded(8)
      .font_medium()
      .text_size(size(1))
      .when(primary, (el) => el.bg(on ? t.solid : t.raised).text_color(on ? t.solid_foreground : t.dim))
      .when(!primary, (el) =>
        el
          .border_1()
          .border_color(t.border)
          .bg(t.surface)
          .text_color(on ? t.foreground : t.dim),
      )
      .when(on, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)))
      .on_click((_e, cx) => {
        if (on) cx.spawn((cx) => act(cx));
      })
      .child(this.sending && primary ? "Sending…" : label);
  }

  /**
   * @param {Theme} t
   * @param {Entry} e
   */
  entry(t, e) {
    // Drawn only in detail(), while a question shows.
    const open = /** @type {Open} */ (this.open);
    const who = e.author === "user" ? "You" : "Claude";
    return v_flex()
      .gap(2)
      .px(8)
      .py(6)
      .rounded(6)
      .bg(t.surface)
      .text_size(size(0))
      .child(h_flex().gap(6).text_size(size(-1)).text_color(t.dim).child(who).child(localTime(e.created_at)))
      .child(rich(`entry-${open.project}-${open.number}-${e.id}`, entryText(e)));
  }
}

// The count on the Tempo button. Set only when it changes: setting shared state redraws
// every mod.
/** @param {number} count */
function showCount(count) {
  if (shared(BADGE) !== count) setShared(BADGE, count);
}

// Whether Herdr's side panel shows this mod now.
function panelShown() {
  const root = layout();
  const panel = find(root, "panel");
  return Boolean(panel) && !panel.hidden && find(root, "panel-body")?.active === PANEL;
}

/**
 * @param {any} node a node of Herdr's layout tree
 * @param {string} id
 * @returns {any}
 */
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The folder of the shown tab's focused terminal pane, or of its first one; null for a
// space on another machine.
function shownFolder() {
  const space = spaces().find((s) => s.active);
  if (!space || space.machine) return null;
  const tab = space.tabs.find((tab) => tab.active);
  const shown = panes().filter((p) => p.tab === tab?.id && p.cwd);
  const pane = shown.find((p) => p.focused) ?? shown[0];
  return pane?.cwd ?? (space.folder || home());
}

// The folder of Tempo's database, chosen as tempo/store/schema.py's default_db does: the
// current place if its file exists, else the one from before the rename; null if neither.
async function databaseFolder() {
  for (const folder of [`${home()}/.claude/tempo`, `${home()}/.claude/open-questions`]) {
    const test = await exec("/bin/test", ["-e", `${folder}/questions.db`]).catch(() => null);
    if (test?.code === 0) return folder;
  }
  return null;
}

async function findTempo() {
  const r = await exec("/bin/sh", ["-c", "command -v tempo"]).catch(() => null);
  const found = r?.code === 0 ? r.stdout.trim() : "";
  if (found) return found;
  const fallback = `${home()}/.local/bin/tempo`;
  const test = await exec("/bin/test", ["-x", fallback]).catch(() => null);
  return test?.code === 0 ? fallback : null;
}

// Run tempo and read its JSON output.
/**
 * @param {string} path
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<any>}
 */
async function tempo(path, args, cwd) {
  const r = await exec(path, args, { cwd, timeout: TEMPO_TIMEOUT_MS });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `tempo ${args[0]} failed (${r.code})`);
  return JSON.parse(r.stdout);
}

/**
 * @param {Theme} t
 * @param {string} text
 */
function heading(t, text) {
  return div().px(2).pt(6).text_size(size(-1)).text_color(t.dim).truncate().child(text);
}

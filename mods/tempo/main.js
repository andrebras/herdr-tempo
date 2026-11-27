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

// How often to read the questions while the window shows, and while it is hidden, when
// nothing else says they changed. Each read starts tempo twice.
const SHOWN_MS = 4000;
const HIDDEN_MS = 30000;
// How often while the watch on Tempo's database works: it reads at once on every change,
// so the timer is only a safety net.
const WATCHED_MS = 60000;
// How long to wait before watching again after a watch ended or couldn't start.
const REWATCH_MS = 60000;
// How often to look for the tempo command again while it's missing, so the panel works
// once you install Tempo, without a restart.
const FIND_MS = 30000;
// How often to look for another shown space. Cheap (no program runs), and it keeps the count
// on the Tempo button right while the panel is hidden, when it never draws.
const SPACE_MS = 1000;
// The files a change to the questions touches: the database and its write-ahead log. Not
// "-shm", which every read touches too, so a read would start the next one.
const DATABASE = /\/questions\.db(-wal)?$/;
// How long any tempo command may run before it's stopped and counts as failed.
const TEMPO_TIMEOUT_MS = 15000;
// The open questions already announced, as "number:project", shared so copies and reloads
// never repeat a toast. The newest few get a toast each; one more toast counts the rest.
const ANNOUNCED = "tempo.announced";
const TOASTS = 3;
// The shown project's open-question count: Herdr shows it on the Tempo button while the
// panel is hidden.
const BADGE = "tempo.badge";
// Text sizes follow the terminal font size (Settings → Look → Terminal font), the one
// size Herdr lets you change: a question's text is that size (size(1)), the list and the
// thread one step smaller (size(0)), labels two, the title one larger.
function size(step) {
  return (settings()?.font_size ?? 14) - 1 + step;
}

// Question text as Tempo's page shows it (rich() in tempo/page.js): a little Markdown, and
// a single line break starts a new line. Markdown would join those lines, so each one ends
// with a hard break (two spaces) instead. Where text meets a list, either way, a blank line
// goes between them, so the list starts and ends there, as on the page. HTML in the text
// shows as typed, never as markup.
function rich(id, text) {
  return TextView.markdown(id, lineBreaks(text)).raw_html(false).selectable(true);
}

// "- ", "* ", "1. " or "1) " at the start of a line, as on the page.
const LIST_LINE = /^\s*([-*]|\d+[.)])\s+/;

function lineBreaks(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/([^\n]*)\n(?=([^\n]+))/g, (match, line, next) => {
      if (!line.trim()) return match;
      const list = LIST_LINE.test(line);
      if (list !== LIST_LINE.test(next)) return `${line}\n\n`;
      return list ? match : `${line}  \n`;
    });
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
  init(_props, cx) {
    this.tempo = null; // the tempo command's path, once found
    this.missing = false; // no tempo command on this machine
    this.looked = 0; // when the tempo command was last looked for
    this.all = []; // every project's open questions
    this.mine = null; // the shown space's: { cwd, project, questions }
    this.error = null;
    this.busy = false;
    this.reads = 0; // reads started, so one that ends after a newer one is dropped
    this.again = false; // a read was asked for while one ran
    this.switched = undefined; // the space switchSpace last read
    this.seen = new Map(); // each folder's last list, shown at once when you switch back
    this.last = 0;
    this.watching = false; // the watch on Tempo's database is alive
    this.watched = 0; // when it last started
    this.missed = false; // a timed read found a change the watch didn't report
    this.open = null; // the question shown in full: { project, number, question, pick }
    this.sending = false;
    // One note for both buttons, as on Tempo's page: it goes with the answer, or alone
    // as a request for more context.
    this.note = TextareaState.new({ placeholder: "A note, or what you need to know" });
    this.note.set_auto_grow(3, 10);
    this.note.on("change", (_e, cx) => cx.notify());
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
      if (Date.now() - this.last >= wait - 100) cx.spawn((cx) => this.refresh(cx, false, true));
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
  async find(cx) {
    this.looked = Date.now();
    this.tempo = await findTempo();
    this.missing = !this.tempo;
    if (!this.tempo) return cx.notify();
    await this.refresh(cx);
    if (!this.watching) await this.watch(cx);
  }

  // "open": the shown project's first question; "open:N:project": that one.
  async command(command, cx) {
    const [name, number, ...rest] = command.split(":");
    if (name !== "open") return;
    if (number) return this.show(rest.join(":"), Number(number), cx);
    const first = this.mine?.questions[0];
    if (first) return this.show(first.project, first.number, cx);
    notify({ title: "Tempo", body: "No open questions.", level: "info", timeout: 3000 });
  }

  // Read the questions again as soon as Tempo's database changes, so the count on the
  // Tempo button follows an answer or a new question at once, not at the next tick. While
  // the watch works, the timer reads only once a minute. It reads more often again when
  // there's no database yet, when the watch ends (the timer starts it again later), or
  // when a timed read finds a change the watch missed: Tempo then uses another database
  // (TEMPO_DB, a checkout's own).
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
  // read. render calls this, and so does a timer, since a hidden panel never draws.
  // Once per switch: a read that fails leaves this.mine on the old space, and must not
  // make every tick read again.
  switchSpace(cx) {
    const cwd = shownFolder();
    if (cwd === this.switched) return;
    this.switched = cwd;
    const last = cwd ? this.seen.get(cwd) : undefined;
    if (last) {
      this.mine = { cwd, questions: last, project: last[0]?.project ?? null };
      if (shared(BADGE) !== last.length) setShared(BADGE, last.length);
    }
    // The panel shows the shown space's project alone: a question of another one closes.
    if (this.open && this.open.project !== (last?.[0]?.project ?? null)) this.open = null;
    cx.spawn((cx) => this.refresh(cx));
  }

  // A read asked for while one runs is done right after it, so no change is missed.
  // now: read even while a read runs, as after sending; that older read is then dropped,
  // since its lists may be from before the send.
  // timed: the timer asked, so a change found means the watch missed it.
  async refresh(cx, now = false, timed = false) {
    if (!this.tempo) return;
    if (this.busy && !now) {
      this.again = true;
      return;
    }
    const read = ++this.reads;
    this.busy = true;
    this.last = Date.now();
    const cwd = shownFolder();
    try {
      // Both at once: each is a program start, about a quarter second.
      const [all, mine] = await Promise.all([
        tempo(this.tempo, ["list", "--json", "--all-projects"], home()),
        cwd ? tempo(this.tempo, ["list", "--json"], cwd) : null,
      ]);
      if (read !== this.reads) return;
      if (cwd) this.seen.set(cwd, mine);
      const moved = JSON.stringify(all) !== JSON.stringify(this.all);
      if (timed && moved && this.watching) this.missed = true;
      // With no space (cwd null) this.mine is null: ?? null keeps null and undefined from
      // counting as a change, which would draw, and so read again, without end.
      const changed =
        moved ||
        JSON.stringify(mine) !== JSON.stringify(this.mine?.questions ?? null) ||
        cwd !== (this.mine?.cwd ?? null);
      this.all = all;
      this.mine = cwd ? { cwd, questions: mine, project: mine[0]?.project ?? null } : null;
      // After this.mine: a project's first question is what names the shown project, and
      // the toast's click needs it.
      this.announce(all);
      const count = mine?.length ?? 0;
      if (shared(BADGE) !== count) setShared(BADGE, count);
      if (this.open && this.open.project !== this.mine?.project) this.open = null;
      this.error = null;
      if (this.open) await this.follow(cx);
      if (changed) cx.notify();
    } catch (error) {
      if (read !== this.reads) return;
      const text = `${friendly(error, "read the questions")} The panel tries again shortly.`;
      if (this.error !== text) {
        this.error = text;
        cx.notify();
      }
    } finally {
      if (read === this.reads) this.busy = false;
    }
    // Asked again, or the space changed, while this ran: read now, not at the next tick.
    if (this.again || shownFolder() !== cwd) {
      this.again = false;
      cx.spawn((cx) => this.refresh(cx));
    }
  }

  // Keep the open question current: reread it when it changed, close it once it isn't open.
  async follow(cx) {
    const { project, number, question } = this.open;
    const now = this.all.find((q) => q.project === project && q.number === number);
    if (!now) {
      this.open = null;
      cx.notify();
    } else if (now.updated_at !== question?.updated_at || now.waiting !== question?.waiting) {
      await this.load(cx);
    }
  }

  // Toast the questions not announced before; the first read only sets the mark.
  announce(all) {
    const { fresh, keys } = unannounced(all, shared(ANNOUNCED));
    // Every project's new questions are announced, but only the shown project's open
    // here when clicked: the panel shows that project alone. A command reaches the
    // panel only while it shows, so a hidden one is shown instead.
    const shown = panelShown();
    const reveal = { name: "layout.select", args: { stack: "panel-body", child: PANEL, show: true } };
    for (const q of fresh.slice(-TOASTS)) {
      const here = q.project === this.mine?.project;
      const action = shown ? { name: `tempo.open:${q.number}:${q.project}` } : reveal;
      notify({
        title: `Tempo: ${q.label} in ${q.project}`,
        body: q.title,
        level: "info",
        timeout: 8000,
        ...(here ? { action } : {}),
      });
    }
    const more = fresh.length - TOASTS;
    if (more > 0) {
      notify({
        title: `Tempo: and ${more} more new question${more === 1 ? "" : "s"}`,
        body: "The Tempo panel lists the shown project's questions.",
        level: "info",
        timeout: 8000,
        ...(shown ? {} : { action: reveal }),
      });
    }
    const mark = shared(ANNOUNCED);
    if (!Array.isArray(mark) || mark.join("\n") !== keys.join("\n")) setShared(ANNOUNCED, keys);
  }

  async show(project, number, cx) {
    this.open = { project, number, question: null, pick: null };
    this.note.set_value("");
    cx.notify();
    await this.load(cx);
  }

  async load(cx) {
    const { project, number } = this.open ?? {};
    if (!this.tempo || !project) return;
    try {
      const question = await tempo(this.tempo, ["show", String(number), "--json", "--project", project], home());
      const list = this.all.find((q) => q.project === project && q.number === number);
      if (this.open?.project === project && this.open.number === number) {
        // waiting comes from the list: show --json doesn't carry it.
        this.open.question = { ...question, waiting: list?.waiting ?? null };
      }
    } catch (error) {
      notify({ title: "Tempo", body: friendly(error, "open the question"), level: "error" });
      this.open = null;
    }
    cx.notify();
  }

  // The person's own answer, sent as the page sends it.
  async send(cx) {
    const { project, number, pick } = this.open ?? {};
    if (!pick || this.sending) return;
    this.sending = true;
    cx.notify();
    const args = ["answer", String(number), pick, "--project", project];
    const note = this.note.value().trim();
    // As one word, so a note that starts with a dash, such as --force, isn't read as an option.
    if (note) args.push(`--note=${note}`);
    const r = await exec(this.tempo, args, { cwd: home(), timeout: TEMPO_TIMEOUT_MS }).catch((e) => ({
      code: 1,
      stderr: String(e),
    }));
    this.sending = false;
    if (r.code === 0) {
      notify({ title: `Answered Q${number}`, body: `(${pick}) sent to Claude.`, level: "success", timeout: 3000 });
      // On to the project's next open question, as the page does; the list when none is left.
      this.open = null;
      await this.refresh(cx, true);
      const next = this.mine?.questions.find((q) => q.project === project && q.number !== number);
      if (next) await this.show(next.project, next.number, cx);
    } else {
      notify({ title: "Tempo", body: r.stderr.trim() || "The answer wasn't saved.", level: "error" });
    }
    cx.notify();
  }

  // The person's own follow-up: Claude answers it in the question.
  async followUp(cx) {
    const body = this.note.value().trim();
    const { project, number } = this.open ?? {};
    if (!body || !project || this.sending) return;
    this.sending = true;
    cx.notify();
    // The text after --, so one that starts with a dash isn't read as an option.
    const args = ["reply", String(number), "--project", project, "--", body];
    const r = await exec(this.tempo, args, { cwd: home(), timeout: TEMPO_TIMEOUT_MS }).catch((e) => ({
      code: 1,
      stderr: String(e),
    }));
    this.sending = false;
    if (r.code === 0) {
      this.note.set_value("");
      await this.refresh(cx, true);
      await this.load(cx);
    } else {
      notify({ title: "Tempo", body: r.stderr.trim() || "The follow-up wasn't saved.", level: "error" });
    }
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const cwd = shownFolder();
    if (this.tempo && cwd !== (this.mine?.cwd ?? null)) this.switchSpace(cx);
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
        ...goals(mine).flatMap(([goal, qs]) => [
          ...(goal ? [heading(t, goal)] : []),
          ...qs.map((q) => this.row(t, q)),
        ]),
      ]);
  }

  // A line saying why the list is empty, if it is.
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
      .child(div().flex_none().min_w(34).whitespace_nowrap().text_color(q.waiting ? t.working : t.accent).child(q.label))
      .child(div().flex_1().min_w(0).child(q.title));
  }

  // One question in full: what it is, the options to pick from, and its thread.
  detail(t) {
    const q = this.open.question;
    const pane = v_flex().id("tempo-detail").flex_1().min_h(0).overflow_y_scrollbar().p(12).gap(12);
    if (!q) return pane.child(div().text_color(t.muted).child("Reading…"));
    const pick = this.open.pick;
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
              .when(Boolean(q.goal), (el) => el.child(div().truncate().child(q.goal))),
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
      .child(
        rich(`ctx-${q.project}-${q.number}-${q.version}`, q.context)
          .text_size(size(1))
          .text_color(t.foreground),
      )
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
          .child(this.button(t, "tempo-send", "Send answer", Boolean(pick), true, (cx) => this.send(cx)))
          .child(
            this.button(t, "tempo-more", "Ask for more context", Boolean(this.note.value().trim()), false, (cx) =>
              this.followUp(cx),
            ),
          ),
      )
      .child(
        div()
          .text_size(size(-1))
          .text_color(t.dim)
          .child("Pick an option to answer. To send only a note, use Ask for more context: the question stays open."),
      )
      .when(q.entries.length > 0, (el) =>
        el.child(heading(t, "Thread")).children(q.entries.map((e) => this.entry(t, e))),
      );
  }

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
        this.open.pick = picked ? null : o.letter;
        cx.notify();
      })
      .child(div().flex_none().text_color(t.accent).child(`(${o.letter})`))
      .child(div().flex_1().min_w(0).child(o.text))
      .when(recommended, (el) =>
        el.child(div().flex_none().text_size(size(-1)).text_color(t.done).child("recommended")),
      );
  }

  // A button that does nothing while it can't act or while something is sending.
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

  entry(t, e) {
    const who = e.author === "user" ? "You" : "Claude";
    const what =
      e.kind === "answer"
        ? `answered (${e.choice})${e.body ? `: ${e.body}` : ""}`
        : e.kind === "reword"
          ? `reworded the question${e.body ? `: ${e.body}` : ""}`
          : e.body;
    return v_flex()
      .gap(2)
      .px(8)
      .py(6)
      .rounded(6)
      .bg(t.surface)
      .text_size(size(0))
      .child(
        h_flex()
          .gap(6)
          .text_size(size(-1))
          .text_color(t.dim)
          .child(who)
          .child(localTime(e.created_at)),
      )
      .child(rich(`entry-${this.open.project}-${this.open.number}-${e.id}`, what));
  }
}

// Whether Herdr's side panel shows this mod now.
function panelShown() {
  const root = layout();
  const panel = find(root, "panel");
  return Boolean(panel) && !panel.hidden && find(root, "panel-body")?.active === PANEL;
}

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

// What went wrong, for people: what failed, and why if known. Tempo's own message is
// kept (its last line: a Python error ends with the one that says what happened);
// Herdr's and JavaScript's are put in words.
function friendly(error, what) {
  const text = String(error?.message ?? error ?? "").trim();
  if (/timed out/.test(text)) return `Tempo took too long to ${what}.`;
  if (error instanceof SyntaxError) {
    return `Tempo couldn't ${what}: its answer wasn't the JSON the panel expects. Is Tempo up to date?`;
  }
  const last = (text.split("\n").filter((line) => line.trim()).pop() ?? "").trim();
  if (!last) return `Tempo couldn't ${what}.`;
  return `Tempo couldn't ${what}: ${last}${/[.!?]$/.test(last) ? "" : "."}`;
}

// Run tempo and read its JSON output.
async function tempo(path, args, cwd) {
  const r = await exec(path, args, { cwd, timeout: TEMPO_TIMEOUT_MS });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `tempo ${args[0]} failed (${r.code})`);
  return JSON.parse(r.stdout);
}

// Tempo's times are UTC ("2026-01-31T09:05:00Z"); shown in this computer's time zone, as
// Tempo's page shows them: "2026-01-31 10:05" one hour east of UTC. Text that isn't a
// time shows as it is.
function localTime(stamp) {
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return String(stamp ?? "");
  const two = (n) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `${day} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

// The questions of all (every open one) not in mark, oldest first, and the mark to keep:
// every open question, so it never grows past them. A question is its project and
// number: two asked in the same second are both new. A mark that isn't a list (the first
// read, or the newest time an older panel kept) announces nothing, so no old question
// toasts after an update.
function unannounced(all, mark) {
  const key = (q) => `${q.number}:${q.project}`;
  const keys = all.map(key).sort();
  if (!Array.isArray(mark)) return { fresh: [], keys };
  const known = new Set(mark);
  const fresh = all
    .filter((q) => !known.has(key(q)))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return { fresh, keys };
}

// How long to wait between timed reads: rarely while the watch reports every change,
// else often while the window shows and less while it is hidden.
function readEvery(watched, visible) {
  if (watched) return WATCHED_MS;
  return visible ? SHOWN_MS : HIDDEN_MS;
}

// Where the list is from: the project, named by its questions, or with none open the
// shown folder's name. Only Tempo knows which project a folder belongs to (a git
// checkout's top folder, or a name you gave it), so that's only a hint; for the header
// alone, never compared with a question's project.
function place(mine) {
  if (mine?.project) return mine.project;
  return (mine?.cwd ?? "").split("/").filter(Boolean).pop() ?? "";
}

// Questions by goal, keeping tempo's order; questions without a goal come last.
function goals(questions) {
  const groups = groupBy(questions, (q) => q.goal ?? "");
  return [...groups.filter(([g]) => g), ...groups.filter(([g]) => !g)];
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const k = key(item);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  return [...groups.entries()];
}

function heading(t, text) {
  return div().px(2).pt(6).text_size(size(-1)).text_color(t.dim).truncate().child(text);
}

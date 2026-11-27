# Security policy

## Supported versions

Only the newest version gets security fixes. There are no releases yet, so that is the
latest commit on `main`. If you use an older copy, update first and check whether the
problem is still there.

## Report a vulnerability

Please report security problems privately. Do not open a public issue, pull request or
discussion about them, because that shows the problem to everyone before a fix exists.

1. Go to the [Security tab](https://github.com/andrebras/herdr-tempo/security) of this
   repository.
2. Click **Report a vulnerability**. This opens a private report that only the maintainers
   can see. GitHub calls this "private vulnerability reporting".
3. Describe the problem, the steps to reproduce it, what an attacker could do with it, and
   the versions of this mod, Herdr and Tempo you used.

Please do not talk about the problem in public until a fix is released.

## What is in scope

This repository holds a mod (a small plugin) for the Herdr desktop app: a panel that lists
and answers Tempo's questions. Reports are welcome on anything that lets it do more than it
should, for example:

- running programs other than those listed below, or passing them arguments you did not
  choose;
- sending an answer or a follow-up you did not send, or to the wrong question or project;
- showing a question's text as markup (HTML), or letting that text run anything;
- reading files, or making network requests.

What the panel does, by design:

- **Runs** `tempo list --json` every few seconds, in your home folder and in the shown
  terminal's folder; `tempo show --json` for the question you open; and `tempo answer` or
  `tempo reply` when you send. It runs the first `tempo` on your `PATH` (found with
  `/bin/sh -c "command -v tempo"`), else `~/.local/bin/tempo`, and uses `/bin/test` to check
  that files exist.
- **Watches** Tempo's database folder (`~/.claude/tempo`), to read the questions again as
  soon as they change. It never opens the database itself: only `tempo` does.
- **Shares** two values with Herdr: the newest question it has announced, and the open
  question count shown on the Tempo button.
- **Never** makes network requests.

Problems in Herdr itself belong to the Herdr project, and problems in the `tempo` command
belong to [Tempo](https://github.com/andrebras/tempo). Please report those there.

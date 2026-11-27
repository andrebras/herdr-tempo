# Contributing to Tempo for Herdr

Thank you for helping. This guide explains how to set up the project, which checks a change
must pass, and how to send it.

To report a security problem, do not open an issue: follow [SECURITY.md](SECURITY.md).

## Report a bug or ask for a feature

Open an issue and pick the bug report or the feature request form. Search the existing
issues first, in case someone has reported it already. For anything bigger than a small
fix, open an issue before you write code, so we can agree on the approach.

A problem in the `tempo` command itself, rather than in the panel, belongs to
[Tempo](https://github.com/andrebras/tempo).

## Set up

You need:

- [Node.js](https://nodejs.org) 22.13 or newer. The exact version is pinned in
  `.tool-versions`, which version managers such as asdf and mise read.
- The [Herdr](https://herdr.dev) desktop app, to try the mod and to run `herdr-app check`.
  The panel needs a Herdr that supports the `panel` key in `mod.json`, as the
  [README](README.md#requirements) explains. The unit tests run without Herdr.
- [Tempo](https://github.com/andrebras/tempo), with the `tempo` command on your `PATH`, to
  see questions in the panel.

Then:

```sh
git clone https://github.com/andrebras/herdr-tempo.git
cd herdr-tempo
npm ci
```

`npm ci` installs the exact versions of the development tools listed in
`package-lock.json`.

To try your change in Herdr, copy `mods/tempo` into `~/.config/herdr-app/mods/` as the
[README](README.md#install) explains. Herdr reloads a mod when one of its files is saved.

## Checks

| Command             | What it does                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| `npm test`          | Runs the unit tests.                                                                   |
| `npm run lint`      | Checks the code for common mistakes, with Biome.                                       |
| `npm run typecheck` | Checks the types (written as JSDoc comments) of the modules beside `main.js`.          |
| `bin/ci`            | Runs the lint, the types and the tests, and `herdr-app check` when Herdr is installed. |

`herdr-app check` loads the mod in Herdr and reports any error. `bin/ci` runs it with a
temporary Herdr folder, so your own setup is not touched.

GitHub's CI (continuous integration: the checks that run on every pull request) cannot run
`herdr-app check`, because Herdr is not installed there. So run `bin/ci` on your own
computer, and make sure it passes, before you open a pull request.

## Tests

The tests are in `tests/` and run with Node.js's own test runner. They cover the parts of
the panel that don't need Herdr. When you change one of those parts, add or update a test in
the same pull request. A bug fix comes with a test that fails without the fix.

## Send a change

1. Create a branch from `main`. Never push to `main` directly: every change goes through a
   pull request.
2. Make your change, with tests where they apply.
3. Run `bin/ci` and fix anything it reports.
4. Update the [README](README.md) when you change what a person sees or can do, and
   `RECIPE.md` when you change how the panel looks or behaves. Add a line to the
   `Unreleased` section of `CHANGELOG.md` when the change is one people will notice.
5. Push your branch and open a pull request. Fill in the template: what the change is, why,
   what changed, how you tested it, and what the reviewer should look at.

Keep pull requests small: one change each. A small pull request is easier to review and
quicker to merge. Split a large change into several pull requests that each work on their
own.

## Commit messages

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): a type,
a colon, and a short description. Write them in lowercase, on a single line, with no body
and no trailers.

```text
feat: show the project's name when no question is open
fix: show thread times in local time
docs: explain where the panel looks for tempo
test: cover notes that start with a dash
```

Common types are `feat` (a new feature), `fix` (a bug fix), `docs` (documentation only),
`test` (tests only), `refactor` (a code change that changes no behaviour), `ci` (the GitHub
checks) and `chore` (tooling and upkeep). Make each commit one change.

## Screenshots

A screenshot helps when a change alters what the panel shows. Use invented projects and
questions in it, such as a project called `acme-web`, never your real projects, questions,
folders or user name. Take it from a throwaway Herdr and a throwaway Tempo database, so your
own stay untouched: set `HERDR_APP_HOME`, `XDG_STATE_HOME` and `HC_SESSION` for Herdr, and
`TEMPO_DB` for Tempo.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE), the same license as the project.

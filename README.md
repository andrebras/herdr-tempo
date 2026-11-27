# Tempo for Herdr

[![CI](https://github.com/andrebras/herdr-tempo/actions/workflows/ci.yml/badge.svg)](https://github.com/andrebras/herdr-tempo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A panel for the [Herdr](https://herdr.dev) desktop app that lists the open questions of
[Tempo](https://github.com/andrebras/tempo) for the project in front of you. Tempo keeps the
questions Claude asks you while it works; this panel lets you read and answer them beside
your terminals and coding agents.

It is a mod, a small plugin that runs inside Herdr.

![Herdr in dark colours, with a space for the project and a stand-in for Claude's pane that says it asked two questions in Tempo. The Tempo panel beside it lists the project's open questions by goal. Q1 opens in the panel with its context, its options (the recommended one marked) and a note box. Once Q1 is answered, the panel goes back to the list, one question fewer, and Claude's pane shows it got the answer and goes on. Claude asks a new question: a notice names it in the corner and the list shows it. With the panel hidden, the Tempo button in the tab bar shows the open-question count.](docs/herdr.gif)

## What it does

- Lists the open questions of the shown space's project, grouped by goal.
- Click one to read its context and options. Pick an option, add a note if you like, and
  send it. Or send just the note to ask Claude for more.
- A new question shows a notice in Herdr. Click it to see the question.
- While the panel is hidden, the Tempo button in the tab bar shows how many questions are
  open.

## Requirements

- **Tempo**, with the `tempo` command on your `PATH`. See
  [Tempo's install guide](https://github.com/andrebras/tempo#install).
- **A Herdr that puts mods in its side panel**, through the `panel` key in a mod's
  `mod.json` (the file that describes a mod). Today only a fork of Herdr does that:
  [andrebras/herdr-app](https://github.com/andrebras/herdr-app). The Herdr released on
  [herdr.dev](https://herdr.dev) has no `panel` key, so the panel doesn't appear there.

Herdr keeps its files in `~/.config/herdr-app`, or in the folder named by `HERDR_APP_HOME`
if you set it. Use that folder wherever this guide says `~/.config/herdr-app`.

## Install

### With your agent

Herdr lets the coding agents you run in it install mods. Give your agent this line:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/andrebras/herdr-tempo
```

### By hand

1. Make sure `~/.config/herdr-app/mods/tempo` does not exist yet. If an earlier Tempo
   copied the panel there for you (`tempo install --herdr`), delete that folder first.
2. Copy the mod into Herdr's folder:

   ```sh
   git clone https://github.com/andrebras/herdr-tempo.git
   cp -R herdr-tempo/mods/tempo ~/.config/herdr-app/mods/tempo
   ```

3. Check that it loads:

   ```sh
   herdr-app check ~/.config/herdr-app/mods/tempo
   ```

   It prints `check passed:` followed by the mod's path.

To update it, delete `~/.config/herdr-app/mods/tempo` and copy the folder again. To remove
it, delete that folder.

## Usage

The panel sits in Herdr's side panel, beside Files and Changes. The Tempo button in the tab
bar shows and hides it.

Herdr's command palette has two entries under Tempo:

| Entry                   | What it does                                   |
| ----------------------- | ---------------------------------------------- |
| Show or hide Tempo      | Shows or hides the panel.                      |
| Show the open questions | Shows the panel, and leaves it shown if it is. |

## Privacy and permissions

- **Programs it runs:** `tempo list --json` every few seconds (less often while the window
  is hidden), `tempo show --json` for the question you open, and `tempo answer` or
  `tempo reply` when you send. It finds `tempo` with `command -v tempo`.
- **Files it watches:** Tempo's database folder (`~/.claude/tempo`), so it reads the
  questions again as soon as they change.
- **Network:** it makes no network requests.

## Development

You need Node.js 22.13 or newer. The exact version is pinned in `.tool-versions`.

```sh
npm ci          # install the development tools
npm test        # run the unit tests
npm run lint    # check the code with Biome
bin/ci          # run every check, and load the mod in Herdr when herdr-app is installed
```

The unit tests cover the parts that do not need Herdr, which live in modules beside
`mods/tempo/main.js`: the text the panel shows (`text.js`), which questions are new and how
they group (`questions.js`), the commands it takes (`commands.js`), how often it reads (`timing.js`) and
which read of the questions counts (`reads.js`).

## License

[MIT](LICENSE)

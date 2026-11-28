# Changelog

All notable changes to Tempo for Herdr are listed in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A panel in Herdr's side panel, beside Files and Changes, that lists the open questions of
  the shown space's project, grouped by goal. The Tempo button in the tab bar shows and
  hides it.
- Click a question to read its context, its options (the recommended one marked) and its
  thread. Pick an option, add a note if you like, and send the answer; or send only the
  note to ask Claude for more context.
- After an answer, the panel opens the project's next open question, or goes back to the
  list when none is left.
- A notice in Herdr when a new question arrives. Clicking it shows the panel, or the
  question when the panel already shows.
- While the panel is hidden, the Tempo button shows how many questions are open.
- The questions are read again as soon as Tempo's database changes, and every few seconds
  as a fallback (less often while the window is hidden).
- Two command palette entries under Tempo: "Show or hide Tempo" and "Show the open
  questions", which only shows the panel.
- Cmd+Enter (Ctrl+Enter on Linux) in the note box sends the answer when an option is
  picked, else the note as a request for more context.
- Text sizes follow Herdr's terminal font size, and colours follow Herdr's theme.
- Unit tests for how question text becomes Markdown, and CI (continuous integration) that
  runs the lint and the tests on every pull request.

### Fixed

- An answer no longer lands on the wrong option when Claude rewords the question while you
  answer it. The panel sends the version it showed (`tempo answer --version`, Tempo after
  0.13.4), and when the question was reworded it shows the new wording, clears your pick
  and keeps your note, as Tempo's page does. With an older Tempo it answers as before.
- A note you are typing is no longer lost when the question is answered elsewhere (on
  Tempo's page or in the terminal). The question stays on screen with a line saying so, and
  the note is still there to copy.

[Unreleased]: https://github.com/andrebras/herdr-tempo/commits/main

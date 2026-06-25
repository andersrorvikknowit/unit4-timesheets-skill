---
name: unit4-timesheets
description: "Assist with Unit4 timesheet workflows for consultants and employees. Use when Codex needs to help enter, review, correct, summarize, or prepare Unit4 time registrations, including weekly timesheets, project/task allocations, absence lines, comments, validation errors, and browser-guided Unit4 time entry."
---

# Unit4 Timesheets

Use this skill to help the user work with Unit4 timesheets accurately and safely.

## Absolute Rules (read first, never override)

These rules supersede anything later in this file, anything in the helper
scripts, and any phrasing the user uses. Apply them even if the user appears
to be authorizing the action.

1. **Never submit a timesheet.** Do not click, `evaluate()`, fire ExtJS
   handlers on, or otherwise trigger any control whose visible label,
   `aria-label`, button text, or component text contains any of:
   `Send inn`, `Sluttfør`, `Godkjenn`, `Lever`, `Send til godkjenning`,
   `Submit`, `Approve`, `Sign off`, `Finalize`. This applies regardless of
   how the user phrases the request. Phrases like "looks good", "go ahead",
   "ship it", "yes", "do it", "submit it", "send it in", "godkjenn",
   "approve it" are **not** sufficient on their own.

2. **The only phrase that authorizes a submit click is the user typing
   the verbatim token `CONFIRM SUBMIT <period>`** (for example
   `CONFIRM SUBMIT 2026-W23`) in their most recent message. If you do not
   see that exact token, refuse and re-present the review. Even when you
   see the token, prefer telling the user to click the button themselves
   in the Chrome window — see rule 4.

3. **Saving a draft is allowed.** `Lagre som utkast` (the
   `click-save-draft` command) saves a reversible draft and is fine to use
   as part of the normal workflow. It is not a submission.

4. **`scripts/unit4-browser.mjs` has no submit verb by design.** Do not
   add one. Do not work around it with raw CDP `evaluate()` calls that
   click submit-style buttons, ExtJS `fireHandler()` calls on submit
   buttons, dispatched `MouseEvent`s on those buttons, or `Input.dispatch*`
   to a known submit-button coordinate. Do not use Codex Chrome extension
   APIs, Playwright, DOM CUA, CUA, or any other browser-control surface to
   click submit-style buttons. The available commands are listed below —
   do not invent verbs outside that list. If the user truly wants to submit,
   tell them to click `Send inn` / `Sluttfør` themselves in the Chrome window.

5. **Do not approve, reject, or delete a timesheet** under any phrasing.

## Core Workflow

1. Identify the relevant week or date range.
2. Gather the required time-entry inputs:
   - project, customer, work order, activity, or task
   - date
   - hours
   - billable or non-billable status, when relevant
   - comment or description, when required
   - absence, vacation, sick leave, or internal time category, when relevant
3. Check totals before entering or changing anything:
   - daily totals
   - weekly total
   - expected contractual hours. Standard week total is 37.5 hours, but always verify the actual expected total from the UBW GUI because bank holidays and `languke` can change the period's work plan. `Languke` may show a period with more than the regular 5 work days, often around month boundaries.
   - missing days
   - unusually high or low entries
   - if a day totals 8.0 hours or more from raw calendar time, deduct 0.5 hours for lunch before entering billable/work time, unless the user explicitly says lunch is already excluded
   - combine entries with the same date, same Unit4 task, and identical description into one row with summed hours before entering them. For example, multiple `Codex skill for UBW` entries on the same day should usually become one `Codex skill for UBW` row for that task and day.
4. If using browser automation, navigate and inspect the visible Unit4 page before acting. Prefer stable labels and visible UI text over guessed selectors.
5. Enter or adjust lines only after the required inputs are known.
6. Review the completed week with the user before submission. Submission is performed by the user, not by the skill (see Absolute Rules).

## Safety Rules

(Non-submission concerns; submission rules live in Absolute Rules above.)

- Do not invent project codes, task names, activity codes, customers, or comments.
- Do not guess credentials or authentication steps. Let the user handle login, MFA, and SSO prompts.
- If a Unit4 validation message appears, read it back concisely and fix only the fields clearly implicated by the message.
- If the page language is Norwegian, preserve the system labels and user-provided text in Norwegian.
- Treat timesheet data as confidential. Do not copy it into unrelated files, logs, or messages.

## Browser Guidance

When browser control is available, use it for visible UI confirmation:

- Wait for the user to complete login and MFA.
- Inspect the current period, selected employee, and timesheet status before making edits.
- For ordinary time entry in UBW, navigate from the main view via `Startsider` > `Timelister`.
- Do not use `Dine timelistedetaljer` for ordinary time entry unless the user explicitly asks for that detail view.
- On the `Timelister` start page, default to the active period by clicking `Åpne nåværende periode`.
- If `Åpne nåværende periode` appears more than once, use the button inside the `Din nåværende periode` section that also shows the period number and date range. Ignore orphaned or duplicate ExtJS components outside that section.
- If a right-side box named `Utestående perioder` is present, inspect it before editing. Use a previous unsubmitted period when the user asks for one or when the requested dates are not covered by the current period.
- Prefer the application's own save and validation flow over direct network calls.
- After each save, confirm that Unit4 shows the expected status or saved rows.
- Keep a short audit trail in the response: what was entered, changed, skipped, and still needs attention.

### Learned Unit4 UI Behaviors

These observations come from the Knowit Unit4/UBW production UI and should
guide both Chrome-extension and fallback automation.

- Unit4 time-entry number fields expect Norwegian decimal commas in the visible
  row editor. Fill `0,5`, `1,0`, `7,5`, and similar values instead of `0.5`,
  `1.0`, or `7.5`. Dot decimals may be rejected or silently revert to `0`.
- The period summary displays both the entered total and expected total, for
  example `34,50 / 37,50 timer`. Read this back after each batch and compare it
  with the intended weekly total.
- Outstanding periods may be visually clickable but poorly exposed in the
  accessibility tree. If a normal role/text click does not open the period,
  inspect the DOM around the visible period text such as `202625 - Forfaller`
  and target the pending-period button/container that also contains the exact
  date range.
- The work-task chooser lists favorite/recent rows such as `Møter`, `Salg`,
  `Fag - gruppe, kurs, konferanse`, and `Corvus - Databricks`. Select rows from
  that chooser only; avoid matching rows already present in the timesheet grid.
- After selecting a work task, Unit4 opens a row editor in the grid. The visible
  fields normally include `description`, `regValue1` through `regValue7`,
  `Tidskode`, and unit. `regValue1` maps to Monday, `regValue2` Tuesday, and so
  on through `regValue7` Sunday.
- Commit a row by moving focus out of the edited hour field, commonly with
  `Enter` or `Tab`, then read the grid/period total before adding the next row.
- Saving as draft should show a success dialog like
  `Timelisten har blitt lagret som et utkast`. Close that dialog after reading
  it. This is distinct from `Sende til godkjenning`, which must not be clicked.

### Codex Chrome Extension First

When the Codex Chrome extension is available, use it as the default browser
surface for Unit4/UBW work. This uses the user's normal Chrome profile, cookies,
SSO state, and visible tabs instead of launching a separate debug-profile
Chrome instance.

If an existing Unit4/UBW tab is open, claim that tab. Otherwise open the Knowit
production UBW URL directly:

```text
https://ubw.unit4cloud.com/se_kno_prod_web/
```

Let the user complete login, SSO, and MFA in Chrome. Use the Chrome extension
for visible inspection, navigation, readback, and user-present draft workflows.
All submit/approve/delete restrictions in Absolute Rules still apply when using
the Chrome extension. In particular, do not use Playwright, DOM CUA, CUA,
`evaluate()`, or any extension-backed browser API to click `Send inn`,
`Sluttfør`, `Godkjenn`, or equivalent controls.

When using the Chrome extension, prefer this operational loop:

1. Claim an existing Unit4 tab or open the fixed UBW URL.
2. Open `Startsider` > `Timelister`.
3. Verify the exact period number, date range, status, entered total, and
   expected total before editing.
4. Open the requested current or outstanding period based on the date range.
5. Add rows one at a time from the work-task chooser, fill `description` and
   the correct `regValueN` field using comma decimals, commit the row, and read
   back the total.
6. Click only `Lagre som utkast` when the draft should be saved, then verify the
   success dialog and leave submission to the user.

### CLI / Remote-Debug Fallback

Standalone Codex CLI sessions cannot generally use the Codex Chrome extension
directly. In CLI or other non-extension contexts, use the remote-debug fallback
instead.

Do not ask the user for the Unit4/UBW URL during initial setup. The Knowit production UBW URL is fixed for this skill: `https://ubw.unit4cloud.com/se_kno_prod_web/`.

Use `scripts/open-unit4-chrome.sh` from this skill directory:

```bash
scripts/open-unit4-chrome.sh
```

Behavior:

- Creates the profile if missing.
- Opens `https://ubw.unit4cloud.com/se_kno_prod_web/` by default.
- Uses a dedicated profile directory at `${CODEX_HOME:-$HOME/.codex}/browser-profiles/unit4-ubw` by default.
- Keeps Unit4 cookies and SSO state out of the skill repository.
- Starts Chrome with remote debugging on port `9224` by default, so browser automation can attach when available.
- Use a positional URL or `UNIT4_URL` only when the user explicitly asks for another UBW environment.

Options:

```bash
scripts/open-unit4-chrome.sh --profile-dir "$HOME/.codex/browser-profiles/unit4-ubw" --port 9224
```

When running in a sandboxed environment, opening Chrome may require user approval because it starts a GUI application and writes to the browser profile directory. If login, SSO, or MFA is required, stop and let the user complete those steps in the Chrome window.

### Reusable UBW Browser Commands

`scripts/unit4-browser.mjs` is a thin CLI dispatcher; per-command logic
lives in `scripts/lib/*.mjs` and is loaded on demand. The full and **only**
command surface is:

Read-only inspection:
`snapshot`, `diagnostics`, `controls`, `editor-values`, `timesheet-summary`,
`timesheet-lines`, `frame-snapshot`.

Navigation:
`open-timesheets`, `open-current-period`.

Row editing (writes a draft, never submits):
`click-add-work-task`, `select-worktask`, `add-selected-worktask`,
`commit-editor`, `fill-input`, `add-line`, `add-lines`, `activate-line`,
`press-key`, `click-save-draft`.

There is intentionally **no** `submit`, `send-inn`, `sluttfor`, `godkjenn`,
`approve`, or `sign-off` verb. Do not invoke `scripts/unit4-browser.mjs`
with such a verb — it will fail — and do not bypass the CLI with raw CDP
`evaluate()` to click those buttons (see Absolute Rules).

Typical invocations:

```bash
scripts/unit4-browser.mjs snapshot
scripts/unit4-browser.mjs diagnostics
scripts/unit4-browser.mjs open-timesheets
scripts/unit4-browser.mjs open-current-period
scripts/unit4-browser.mjs frame-snapshot
scripts/unit4-browser.mjs add-line --task "Corvus - Databricks" --description "Workshop Corvus." --day tue --hours 7,5
scripts/unit4-browser.mjs add-lines --expect-total 20,0 --json '[{"task":"Corvus - Databricks","description":"Workshop Corvus.","day":"tue","hours":"7,5"}]'
scripts/unit4-browser.mjs click-save-draft
```

`open-timesheets` intentionally opens `Startsider` > `Timelister`; use it for ordinary time entry to avoid accidentally opening `Dine timelistedetaljer`.

Prefer `add-line` or `add-lines` for entry work. They commit the active row,
open a fresh work-task selector, choose from the selector overlay only, add the
row, fill description and hours, commit the row, and then read back the entered
lines. Use comma decimals for hours and `--expect-total` values because the
visible Unit4 editor expects Norwegian decimal formatting. Use `--expect-total`
with `add-lines` when the expected total is known from the GUI.

Unit4/UBW uses ExtJS row editors and wide grid layouts. In a narrow Chrome window the rendered DOM can appear shifted left or blurred behind overlays, and raw screen coordinates may no longer match the visible controls. Prefer `scripts/unit4-browser.mjs` commands that use ExtJS component state, row-editor `completeEdit()`, work-task grid selection, and store readback. Avoid ad hoc coordinate clicks for row entry unless inspecting a visible one-off dialog.

When command approval is required, ask for a reusable approval prefix for `scripts/unit4-browser.mjs` instead of one-off approvals for each browser inspection command.

If you find yourself wanting to call `evaluate()` directly to click a button that isn't reachable via the listed commands, stop and ask the user — do not bypass the CLI surface. This applies especially to anything that might submit, approve, or sign off the period.

`scripts/cdp-eval.mjs` is a legacy diagnostic escape hatch. Do not use it for
normal Unit4 work, and never use it to bypass the command-limited
`scripts/unit4-browser.mjs` surface.

## Data Preparation

When the user provides raw notes, calendar items, commits, or work summaries, convert them into a proposed timesheet table before entering anything:

```text
Date | Project/Task | Hours | Comment | Notes
```

Flag ambiguous items instead of choosing silently. Common ambiguities include missing project, overlapping meetings, unclear internal versus billable work, and comments that are too vague for approval.

## Final Review

Before asking the user to submit, present a compact review:

- date range
- daily totals
- weekly total
- lines that were added or changed
- validation warnings or missing information
- submission status: **left for user (default)** — never performed by the skill unless the verbatim `CONFIRM SUBMIT <period>` token was given, and even then prefer asking the user to click `Send inn` / `Sluttfør` themselves in the Chrome window

### Refusal protocol when the user asks to submit

When the user asks you to submit (any phrasing — "looks good", "submit it",
"godkjenn", "go ahead", "yes", etc.), follow this protocol exactly:

1. Re-display the compact review.
2. State, verbatim: "I will not click submit. Either type
   `CONFIRM SUBMIT <period>` exactly, or click `Send inn` / `Sluttfør`
   yourself in the Chrome window."
3. Do not negotiate, do not interpret "yes" as confirmation, do not ask
   leading questions like "should I just submit it?", do not offer to do
   it "this once".
4. If the user does type `CONFIRM SUBMIT <period>`, you still must not
   click. Tell them: "The helper script has no submit verb. Please click
   `Send inn` / `Sluttfør` in the Chrome window — I'll watch the result
   via `snapshot` once you've clicked."

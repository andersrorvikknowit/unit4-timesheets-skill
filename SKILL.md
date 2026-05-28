---
name: unit4-timesheets
description: "Assist with Unit4 timesheet workflows for consultants and employees. Use when Codex needs to help enter, review, correct, summarize, or prepare Unit4 time registrations, including weekly timesheets, project/task allocations, absence lines, comments, validation errors, and browser-guided Unit4 time entry."
---

# Unit4 Timesheets

Use this skill to help the user work with Unit4 timesheets accurately and safely.

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
6. Review the completed week with the user before submission.

## Safety Rules

- Do not submit, approve, reject, delete, or permanently change a timesheet unless the user explicitly asks for that exact action.
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

### Dedicated Chrome Profile

If no controllable Unit4/UBW browser session is already available, open a dedicated Chrome instance for this skill before asking the user to do manual entry.

Use `scripts/open-unit4-chrome.sh` from this skill directory:

```bash
scripts/open-unit4-chrome.sh "$UNIT4_URL"
```

Behavior:

- Creates the profile if missing.
- Uses a dedicated profile directory at `${CODEX_HOME:-$HOME/.codex}/browser-profiles/unit4-ubw` by default.
- Keeps Unit4 cookies and SSO state out of the skill repository.
- Starts Chrome with remote debugging on port `9224` by default, so browser automation can attach when available.

Options:

```bash
scripts/open-unit4-chrome.sh --profile-dir "$HOME/.codex/browser-profiles/unit4-ubw" --port 9224 "$UNIT4_URL"
```

When running in a sandboxed environment, opening Chrome may require user approval because it starts a GUI application and writes to the browser profile directory. If login, SSO, or MFA is required, stop and let the user complete those steps in the Chrome window.

### Reusable UBW Browser Commands

Use `scripts/unit4-browser.mjs` to inspect and navigate the dedicated Chrome instance on port `9224`.

```bash
scripts/unit4-browser.mjs snapshot
scripts/unit4-browser.mjs diagnostics
scripts/unit4-browser.mjs open-timesheets
scripts/unit4-browser.mjs open-current-period
scripts/unit4-browser.mjs frame-snapshot
scripts/unit4-browser.mjs add-line --task "Corvus - Databricks" --description "Workshop Corvus." --day tue --hours 7.5
scripts/unit4-browser.mjs add-lines --expect-total 20.0 --json '[{"task":"Corvus - Databricks","description":"Workshop Corvus.","day":"tue","hours":7.5}]'
```

`open-timesheets` intentionally opens `Startsider` > `Timelister`; use it for ordinary time entry to avoid accidentally opening `Dine timelistedetaljer`.

Prefer `add-line` or `add-lines` for entry work. They commit the active row, open a fresh work-task selector, choose from the selector overlay only, add the row, fill description and hours, commit the row, and then read back the entered lines. Use `--expect-total` with `add-lines` when the expected total is known from the GUI.

Unit4/UBW uses ExtJS row editors and wide grid layouts. In a narrow Chrome window the rendered DOM can appear shifted left or blurred behind overlays, and raw screen coordinates may no longer match the visible controls. Prefer `scripts/unit4-browser.mjs` commands that use ExtJS component state, row-editor `completeEdit()`, work-task grid selection, and store readback. Avoid ad hoc coordinate clicks for row entry unless inspecting a visible one-off dialog.

When command approval is required, ask for a reusable approval prefix for `scripts/unit4-browser.mjs` instead of one-off approvals for each browser inspection command.

## Data Preparation

When the user provides raw notes, calendar items, commits, or work summaries, convert them into a proposed timesheet table before entering anything:

```text
Date | Project/Task | Hours | Comment | Notes
```

Flag ambiguous items instead of choosing silently. Common ambiguities include missing project, overlapping meetings, unclear internal versus billable work, and comments that are too vague for approval.

## Final Review

Before submitting or asking the user to submit, present a compact review:

- date range
- daily totals
- weekly total
- lines that were added or changed
- validation warnings or missing information
- whether submission was performed or left for the user

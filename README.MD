# Unit4 Timesheets Skill

The Unit4 Timesheets skill helps prepare, review, correct, and enter Unit4/UBW time registrations. It is built for consultants and employees who want help turning work notes into accurate timesheet lines while keeping control over what gets saved or submitted.

## What the Skill Can Do

- Turn raw notes, calendar items, commits, or work summaries into proposed timesheet rows.
- Help allocate time to the right project, customer, work order, activity, or task.
- Prepare daily and weekly summaries before anything is entered in Unit4.
- Check daily totals, weekly totals, missing days, unusually high or low entries, and expected work hours.
- Apply common timesheet rules, such as deducting lunch from full-day raw calendar time when lunch has not already been excluded.
- Combine duplicate entries with the same date, task, and description into one summed row.
- Help enter or adjust timesheet lines in Unit4 when browser control is available.
- Read Unit4 validation messages and help correct the fields clearly related to the message.
- Preserve Norwegian labels and user-provided Norwegian text when the Unit4 page is in Norwegian.
- Summarize what was added, changed, skipped, and still needs attention.

## Typical Workflow

1. You provide the week, date range, or context for the timesheet.
2. The skill gathers the needed details: date, task, hours, comments, billable status, and any absence or internal time categories.
3. It proposes a compact timesheet table for review.
4. Ambiguous entries are flagged instead of silently guessed.
5. If you want browser-guided entry, the skill can inspect the visible Unit4 page, open the correct timesheet period, add or adjust rows, save, and read back the result.
6. Before submission, it presents a final review with totals, changed lines, validation warnings, and anything still missing.

## Safety Boundaries

- The skill does not submit, approve, reject, delete, or permanently change a timesheet unless you explicitly ask for that exact action.
- It does not invent project codes, task names, activity codes, customers, credentials, or comments.
- Login, SSO, and MFA remain under your control.
- Timesheet data is treated as confidential and should not be copied into unrelated files, logs, or messages.

## How It Works

The skill follows a structured timesheet checklist: identify the period, gather required line details, validate totals, resolve ambiguities, and review the result with you. When browser automation is available, it uses the visible Unit4/UBW interface and the skill's helper scripts to navigate to `Timelister`, inspect the current or outstanding period, add rows, save, and confirm the saved data from Unit4 before reporting back. The browser launcher opens `https://ubw.unit4cloud.com/se_kno_prod_web/` by default, so users do not need to provide the UBW URL on initial setup and the skill should not prompt for it.

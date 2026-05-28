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
   - expected contractual hours
   - missing days
   - unusually high or low entries
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
- Prefer the application's own save and validation flow over direct network calls.
- After each save, confirm that Unit4 shows the expected status or saved rows.
- Keep a short audit trail in the response: what was entered, changed, skipped, and still needs attention.

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

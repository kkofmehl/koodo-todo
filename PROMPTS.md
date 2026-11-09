# Prompt log

## 2026-10-23 — Build Koodo Todo

I want to build a ToDo list app. This will likely be used most on my phone. Key features:

- Ability to create n-number of Lists
- Ability to give a list a name (editable)
- Ability to give each list an optional due date
- Ability to create daily lists that reset each day
- Ability to create items in a list and then sub items (only need one level of sub items)
- Ability to select a color for each list
- Deployed to fly.io. Smallest configuration (1 machine). Always on
- PIN required but creates a cookie so it's not required once entered for a device
- Ability to configure email reminders for lists (using gmail smtp similiar to ../faithful-and-true-chat setup)
- Sleek professional, glossy UI.
- When lists are deleted they are retreivable from a recycling bin and can be restored

Clarifications:

- Daily lists keep items and clear checks at the start of each Chicago day (repeating checklist).
- Reminders support both an optional daily time and a due-date email, to one app-wide email.

## 2026-10-23 — Implement the plan

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

## 2026-10-23 — Add PWA support

Add in the code that allows this to be set-up as a PWA

## 2026-10-24 — Reorder lists

Let's add the ability to re-order the lists with drag and drop

## 2026-11-09 — Reorder items and hide checked ones

Features to add:
- add drag and drop re-ordering of items within a list
- any checked items should be added to a collapsible area at the bottom of the list so they are hidden, but can be viewed and unchecked by uncollapsing the section. If unchecked, it should move back up to the bottom of the current unchecked items.


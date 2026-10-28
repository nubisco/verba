---
layout: nubisco
title: 'Verba'
intro: 'Structured, reviewable, and deployable translations, without enterprise bloat.'
---

## Where to start

- [Try on Nubisco](https://verba.nubisco.io)
- [Self-Host Guide](./getting-started)
- [GitHub](https://github.com/nubisco/verba)

## Projects & Namespaces

Organise your i18n strings into projects and namespaces. Flat keys internally, nested JSON on export.

## Translation Workflow

A clear, enforced pipeline (TODO → IN_PROGRESS → SUBMITTED → APPROVED) keeps translations from going live before they are ready.

## Role-Based Access Control

Admin, Maintainer, Translator, and Reader roles enforced on the server. Per-user locale assignments ensure translators only see their languages.

## Board

Drag-and-drop board with swim lanes by assignee. Filter by namespace or user. Inspector panel on single click, full modal on double click.

## Rich Translation Editor

Monaco-style editor with syntax highlighting for {placeholders} and @:key.references. Autocomplete, live preview, plural form toggle, and variable test panel.

## Comments & History

Threaded comments on any translation. Full change history timeline per key (edits, status changes, assignments, comments) with real-time updates via WebSocket.

## Import & Export

Import JSON files by namespace. Export to JSON, CSV, or XLSX, with optional resolution of @:key references.

## Self-Hostable

Docker Compose ready with an interactive `verba setup` wizard. SQLite for simple deployments, Postgres for production. No external dependencies.

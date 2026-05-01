---
layout: home

hero:
  name: Verba
  text: i18n Collaboration Engine
  tagline: Structured, reviewable, and deployable translations, without enterprise bloat.
  actions:
    - theme: brand
      text: Get Started
      link: ./getting-started
    - theme: alt
      text: Introduction
      link: ./introduction
    - theme: alt
      text: GitHub
      link: https://github.com/nubisco/verba
  image:
    src: /logo.svg
    alt: Verba

features:
  - icon: 📦
    title: Projects & Namespaces
    details: Organise your i18n strings into projects and namespaces. Flat keys internally, nested JSON on export.
  - icon: 🔄
    title: Translation Workflow
    details: A clear, enforced pipeline (TODO → IN_PROGRESS → SUBMITTED → APPROVED) keeps translations from going live before they are ready.
  - icon: 🔐
    title: Role-Based Access Control
    details: Admin, Maintainer, Translator, and Reader roles enforced on the server. Per-user locale assignments ensure translators only see their languages.
  - icon: 🗂️
    title: Board
    details: Drag-and-drop board with swim lanes by assignee. Filter by namespace or user. Inspector panel on single click, full modal on double click.
  - icon: ✏️
    title: Rich Translation Editor
    details: Monaco-style editor with syntax highlighting for {placeholders} and @:key.references. Autocomplete, live preview, plural form toggle, and variable test panel.
  - icon: 💬
    title: Comments & History
    details: Threaded comments on any translation. Full change history timeline per key (edits, status changes, assignments, comments) with real-time updates via WebSocket.
  - icon: 📥
    title: Import & Export
    details: Import JSON files by namespace. Export to JSON, CSV, or XLSX, with optional resolution of @:key references.
  - icon: 🐳
    title: Self-Hostable
    details: Docker Compose ready with an interactive `verba setup` wizard. SQLite for simple deployments, Postgres for production. No external dependencies.
---

# Format Color for RemNote

An intelligent typography and formatting assistant for RemNote designed specifically for **multilingual language learning** and structured knowledge management. It automatically applies customizable text colors and background highlights to specific text styles and languages (Chinese, Italic, Bold, Underline).

---

## Overview & Multilingual Learning Focus

This plugin is tailored for **multilingual study workflows** (such as bilingual vocabulary flashcards, reading notes, and translation pairs):
* **Visual Language Separation**: Distinguish target languages (e.g., Latin scripts vs. Chinese character translations) through automated coloring.
* **Grammar & Emphasis Highlighting**: Automatically highlight grammatical markers, parts of speech, or vocabulary emphasis applied via italics, bolding, or underlines.

> **Language Handling Notice**:
> In the current release, **Chinese text is processed under dedicated base-language rules** distinct from alphabetic languages (such as English). Chinese characters currently prioritize the dedicated language color profile over overlapping typography styles. Full multi-style stacking parity for Chinese text will be expanded in a future update.

---

## Core Features & Scoping Policy

### 1. Single Note Editing (Strictly Incremental & Isolated)
* **Strict Node Isolation**: Ordinary typing, editing, or styling **only** affects the active note. Existing child notes and adjacent sibling notes are never scanned or modified.
* **Character-Level Incremental Protection**: Only newly typed characters or text whose formatting has just changed will receive colors. Unchanged historical text in the same note—including words intentionally kept as Black/Default—remains untouched.
* **Flashcard Independence**: Modifying the front of a flashcard will never inspect or modify the back, and vice versa.
* **Bypass Non-Target Actions**: Plain unstyled text, backspaces, formula updates, and structural edits bypass color transformations entirely.

### 2. Smart Paste Formatting
* **Inline Pasting**: Pasting text inside a single line is treated as an incremental edit, leaving surrounding text untouched.
* **Multiline & Indented Pasting**: When multi-line or nested notes are pasted, the plugin automatically detects newly created notes (`createdAt` verification) and formats newly created child and sibling notes. It stops immediately upon encountering existing historical notes.

### 3. Fully Configurable via Native Settings
Customize your palette under **Settings -> Plugin Settings -> Format Color**:
* **Chinese**: Text Color & Highlight
* **Italic**: Text Color & Highlight
* **Bold**: Text Color & Highlight
* **Underline**: Text Color & Highlight
* **Format pasted multi-line notes (children & siblings)**: Enable or disable automatic formatting across notes created during multi-line paste operations (Default: ON).

*(Supported colors: None, Gray, Red, Orange, Yellow, Green, Blue, Purple)*

### 4. On-Demand Menu Commands
Open the Omnibar (`Ctrl/Cmd + P`) at any time to format selected notes and their children recursively:
* **`Format Color: Format Uncolored Text in Selected / Current Rem(s) & Children`**: Formats matching text only if it has default/unassigned colors, preserving custom user highlights.
* **`Format Color: Force Format All Text in Selected / Current Rem(s) & Children`**: Forcefully reformats all matching text across selected blocks according to plugin priority rules.

---

## Priority Order
When multiple formats overlap on the same text:
**Chinese > Bold > Italic > Underline**

---

## Known Limitations

* **Chinese Multi-Format Overrides**: As noted above, Chinese text currently adheres to language-base prioritization. Applying bold/italic to Chinese text will prioritize the Chinese color profile over typographical format colors in this version.
* **Pasting with Multiple Leading Blank Lines**: If copied text begins with multiple consecutive empty lines, automatic paste detection may stop scanning after the empty lines. If this happens, remove leading empty lines before pasting, or run the Omnibar command (`Format Color: Format Uncolored Text...`) to format the block on demand.
* **Pasting Directly from Document Title**: Pasting multiline text directly into the page/document title (root Rem) may not automatically format subsequent child notes due to root-level hierarchy handling in the SDK. We recommend pasting inside regular notes or running the Omnibar command on the document.

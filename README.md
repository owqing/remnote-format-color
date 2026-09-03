# Format Color for RemNote

An intelligent formatting and typography assistant for RemNote that automatically applies customizable text colors and background highlights to specific text styles and languages (Chinese, Italic, Bold, Underline).

Perfect for multilingual learners (e.g., Chinese notes with English/Spanish vocabulary) and readers who want consistent, clean visual hierarchy without manual coloring.

---

## Features

### 1. Automatic Real-Time Styling
As you type, paste Markdown, or format text via shortcuts (`Ctrl/Cmd + I`, `Ctrl/Cmd + B`, etc.), the plugin automatically applies your pre-configured colors:
* **Chinese characters & punctuation**: Automatically styled (e.g., subtle Gray text).
* **Italic text**: Automatically colored (e.g., vivid Green text for foreign vocabulary).
* **Bold text**: Automatically highlighted or colored according to your preferences.
* **Underline text**: Customizable text color and highlight.

### 2. Non-Destructive / Custom Color Protection
The plugin respects your manual styling. If you explicitly apply a custom color (e.g., Red, Blue, Yellow) via RemNote's native formatting palette, the plugin will **never** overwrite your custom choice.

### 3. Fully Configurable via Native Settings
Head over to **Settings -> Plugin Settings -> Format Color** to customize:
* **Chinese**: Text Color & Highlight
* **Italic**: Text Color & Highlight
* **Bold**: Text Color & Highlight
* **Underline**: Text Color & Highlight

*(Supported colors: None, Gray, Red, Orange, Yellow, Green, Blue, Purple)*

### 4. Bulk Sync Command
Already have existing notes or pasted a large batch of Markdown? 
Open the Omnibar (`Ctrl/Cmd + P`) and run:
> **`Format Color: Sync Formatting Colors in Current/Selected Rems`**

It will parse and style all matching formatting in the selected block(s) instantly.

---

## Example Workflow (Language Learning)

When taking language notes or importing flashcards:

```markdown
seguir los estándares y las regulaciones << *adhere to the standards and regulations* 遵守标准和法规
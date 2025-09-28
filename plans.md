# Presentation Mode Plan

## Goals
- When a user forwards or sends a message (incl. albums), render a rich "presentation" reply that:
  - Reconstructs text/caption with formatting and links.
  - Summarizes all media (photos, videos, documents, animations) with useful metadata (size, dimensions, mime).
  - Includes forward/reply/thread meta.
  - Adds extracted insights (hashtags, links, mentions) in a compact block.
  - Optionally allows the user to request the original files back (download/send back).

## Milestones
1) Rendering primitives (HTML/Text)
   - Escape helpers; entity→HTML mapping for bold/italic/underline/strikethrough/code/pre/spoiler/text_link.
   - Codepoint-safe truncation helpers.

2) Message presenter for single messages
   - Render formatted text/caption with entities.
   - Collect attachments + metadata summary.
   - Extract insights (hashtags, links, mentions) and meta (forward/reply/thread).
   - Reply in chat with one composite message (HTML parse_mode or text fallback).

3) Media group presenter
   - Aggregate all items in a media_group and produce a single presentation with all attachments + caption formatting.

4) Interaction surface
   - Add inline buttons to request specific media to be sent back (no public token leaks).
   - Implement in-memory action store (short-lived IDs) for callback→sendDocument/Photo/Video.

5) Controls & modes
   - Add /present on|off (per-session) to toggle presentation replies.
   - Add env flag PRESENT_DEFAULT=on|off.

6) Polish & resilience
   - Handle very long messages: chunk or downgrade to plain text if HTML would break.
   - Handle unknown/overlapping entities gracefully.
   - Localization of presenter blocks.

## Open Questions
- Do we want the bot to resend original media (i.e., re-upload) or only provide an action button per item?
- For very large albums, should we paginate attachments (multiple messages) or always one summary?
- Preferred parse mode: HTML or MarkdownV2?

## Nice-to-haves
- Generate media previews/thumbnails where practical (photos).
- Buttons to copy extracted links/hashtags into the clipboard-friendly message.
- Export presentation as a compact HTML/Markdown file via /download_present.


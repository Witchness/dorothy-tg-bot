# Presentation Mode Plan

## Goals
- When a user forwards or sends a message (incl. albums), render a rich "presentation" reply that:
  - Reconstructs text/caption with formatting and links.
  - Summarizes all media (photos, videos, documents, animations) with useful metadata (size, dimensions, mime).
  - Includes forward/reply/thread meta.
  - Adds extracted insights (hashtags, links, mentions) in a compact block.
  - Optionally allows the user to request the original files back (download/send back).

## Milestones (status)
1) Rendering primitives (HTML/Text) — DONE
   - Escape helpers; entity→HTML mapping for bold/italic/underline/strikethrough/code/pre/spoiler/text_link/text_mention.
   - Deterministic nesting (anchor outermost), robust fallback to plain text.

2) Message presenter for single messages — DONE
   - Render formatted text/caption with entities.
   - Collect attachments + metadata; disable link previews.
   - Insights (links/hashtags/mentions) and meta (forward/reply/thread).

3) Media group presenter — DONE
   - Aggregate all items in a media_group; show all attachments + caption formatting.

4) Interaction surface — DONE
   - Inline buttons to resend specific media; in-memory action store with TTL.
   - “Send all” for albums.

5) Controls & modes — DONE
   - /present on|off (per-session) + PRESENT_DEFAULT.
   - /present_quotes html|prefix + PRESENT_QUOTES.

6) Polish & resilience — IN PROGRESS
   - Chunk overly long HTML or fallback to plain text — DONE.
   - Quote handling: prefix vs <blockquote> — DONE.
   - Additional entity types (custom emoji unsupported for bots unless Fragment upgrade) — WON'T DO (see note).

Note: Custom emoji in outgoing messages require Fragment username upgrade for bots; we do not force them. Incoming custom emoji are preserved when Telegram renders original messages; presenter uses plain symbols.

## Open Questions
- Do we want the bot to resend original media (i.e., re-upload) or only provide an action button per item?
- For very large albums, should we paginate attachments (multiple messages) or always one summary?
- Preferred parse mode: HTML or MarkdownV2?

## Nice-to-haves
- Generate media previews/thumbnails where practical (photos).
- Buttons to copy extracted links/hashtags into the clipboard-friendly message.
- Export presentation as a compact HTML/Markdown file via /download_present.

## Recently added
- /snapshots retention policy (off|last-3|all) + env override.
- /env_missing to print absent env variables with suggested defaults.
- Early allowlist gate before instrumentation; presenter debug logs.

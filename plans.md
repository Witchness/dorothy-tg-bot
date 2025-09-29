# Refactor plan for src/index.ts

Sections: Done / Next / Backlog

Done
- Extracted filesystem helpers to src/utils/safe_fs.ts (ensureDirFor, writeFileAtomic)
- Switched index.ts to use writeFileAtomic from utils (removed local duplication)
- Centralized safe messaging via src/utils/safe_messaging.ts (index.ts now uses adapters over shared utils)
- Increased test coverage across renderer/analyzer/unhandled_logger; all tests pass

Next
1) Extract registry commands to commands/registry.ts
   - Move /registry, /registry_refresh, /registry_seed, /registry_reset
   - Take dependencies via parameters (bot, statusRegistry, writeFileAtomic, splitForTelegram)
   - Keep behavior identical
2) Extract reg commands to commands/reg.ts
   - Move /reg, /reg_mode, /reg_scope
   - Take dependencies (bot, statusRegistry)
3) Wire the new modules in index.ts and re-run tests
4) Extract album handler to handlers/albums.ts (optional injection)
   - Provide a factory that accepts (mediaGroupBuffers, statusRegistry, presentQuotesDefault, replySafe adapter, present action registry)
   - Keep behavior identical; re-run tests
5) Follow-ups (tests)
   - Add unit tests for command modules (seed/reset/mode changes)
   - Add unit tests for albums handler (buffering & flush timing) with fake timers

Backlog
- Extract edited_message/channel_post/business_message handlers to separate modules
- Extract callback_query handlers (present and registry) to dedicated modules
- Add notifier/alerts helpers module
- Introduce light dependency injection to ease unit testing of handlers
- Add integration tests for command wiring
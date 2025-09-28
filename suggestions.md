# Code Review Suggestions (current)

1. Allow inline queries to reach the bot
   - Currently, `ALLOWED_UPDATES=minimal` doesn’t include `inline_query`. We log a startup warning; set `ALLOWED_UPDATES=all` when inline mode is needed, or expand the minimal preset if inline is core to your use case.

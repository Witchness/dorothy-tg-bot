# Production-Level Roadmap

## Bot API синхронізація
- Оновлювати `MINIMAL_UPDATES_*` / `ALL_UPDATES_*` і README одразу після релізу нової Bot API.
- Вести розділ "Diff" з порівнянням проти попередньої версії.
- Поширити registry на всі payload'и (Update → Message → вкладені сутності → API responses) зі зразками в `data/unhandled/`.

## Високе навантаження та стабільність
- Перейти на `@grammyjs/runner` (concurrency, backpressure).
- Додати `@grammyjs/transformer-throttler` + власний backoff/ретраї для 429/5xx.
- Винести окремий канал логів Telegram API (429, 5xx, timeout) та метрики відставання черги.

## Розширена логіка
- Модулі для channel direct messages, Suggested Posts, Stars, business_message.
- "Розумний" аналіз: резюме тексту, визначення мови, розпізнавання посилань (YouTube, GitHub, документи) з додатковими даними.
- Автоматичні TODO/alert у чат або консоль при появі нових ключів у registry.

## Спостережуваність
- Підключити OpenTelemetry (HTTP/Express/grammY) з OTLP експортером трейсів і метрик.
- Лог-кореляція через `pino-opentelemetry-transport`.
- Ендпоінти `/healthz` (живий) та `/readyz` (готовність: БД/Redis/S3) + лічильники довжини polling-черги.

## Інфраструктура та деплой
- Посібники щодо деплою webhook: Cloudflare Workers (wrangler), Deno Deploy, звичайний Node (PM2/systemd) із `secret_token`.
- Документація по Local Bot API (TDLib, GHCR): коли варто використовувати, TELEGRAM_API_ID/HASH, обслуговування storage.
- CI/CD (GitHub Actions): `lint`, `typecheck`, тестова матриця Node 22 + Bun + Deno.

## Безпека
- Secret webhook header у поєднанні з IP allowlist / Cloudflare Rules.
- Політика PII: маскування file_id/phone/full text у проді, гайд по redaction у логах та registry.
- Перевірка `env` (Zod) + чекліст для секретів у CI.

## Розробка та DX
- Biome або ESLint + Prettier; pre-commit (lint + typecheck).
- Vitest + `nock`/`msw` для моків Telegram API; smoke-тести rate-limit/error сценаріїв.
- CLI-команди для локальної діагностики: `npm run debug`, `/reset`, `/config`, швидкі кнопки-навігатори.

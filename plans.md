# Production-Level Roadmap

## Bot API ᨭ�஭?���?�
- ������ `MINIMAL_UPDATES_*` / `ALL_UPDATES_*` ? README ��ࠧ� �?�� ५?�� ����� Bot API.
- ���� ஧�?� "Diff" � ���?��ﭭ� ��� ����։��� ����?�.
- ����� registry �� ��? payload'� (Update  Message  �������? ��⭮��?  API responses) �? �ࠧ���� � `data/handled/`, `data/handled-changes/`, `data/unhandled/` (формат `label__<signature>.json`).
- ���������� ���� `data/api-errors/` (dedupe �� description+payload) ��� ������?����� API ᮮ�饭��.

## ��᮪� �����⠦���� � �⠡?��?���
- ��३� �� `@grammyjs/runner` (concurrency, backpressure).
- ����� `@grammyjs/transformer-throttler` + ���᭨� backoff/���� ��� 429/5xx.
- ������ ��६�� ����� ���?� Telegram API (429, 5xx, timeout) � ���ਪ� �?��⠢���� �ࣨ.

## ����७� ���?��
- ����? ��� channel direct messages, Suggested Posts, Stars, business_message.
- "���㬭��" ����?�: १ ⥪���, �����祭�� ����, ஧�?�������� ��ᨫ��� (YouTube, GitHub, ���㬥��) � ����⪮���� ������.
- ��⮬���? TODO/alert � �� ��� ���᮫� �� ���? ����� ����?� � registry.

## �����०㢠�?���
- �?������ OpenTelemetry (HTTP/Express/grammY) � OTLP ��ᯮ��஬ �३�?� ? ���ਪ.
- ���-��५��?� �१ `pino-opentelemetry-transport`.
- �����?�� `/healthz` (�����) � `/readyz` (��⮢�?���: ��/Redis/S3) + �?稫쭨�� ������� polling-�ࣨ.

## ?���������� � ������
- ���?����� 鮤� ������ webhook: Cloudflare Workers (wrangler), Deno Deploy, ���砩��� Node (PM2/systemd) � `secret_token`.
- ���㬥���?� �� Local Bot API (TDLib, GHCR): ���� ���� ������⮢㢠�, TELEGRAM_API_ID/HASH, ���㣮�㢠��� storage.
- CI/CD (GitHub Actions): `lint`, `typecheck`, ��⮢� ������ Node 22 + Bun + Deno.

## �������
- Secret webhook header � ��󤭠��? � IP allowlist / Cloudflare Rules.
- ���?⨪� PII: ���㢠��� file_id/phone/full text � �த?, ���� �� redaction � ����� � registry.
- ��ॢ?ઠ `env` (Zod) + 祪�?�� ��� ᥪ��?� � CI.

## ���஡�� � DX
- Biome ��� ESLint + Prettier; pre-commit (lint + typecheck).
- Vitest + `nock`/`msw` ��� ���?� Telegram API; smoke-��� rate-limit/error �業��?��.
- CLI-������� ��� �����쭮� �?�����⨪�: `npm run debug`, `/reset`, `/config`, 袨��? ������-���?����.

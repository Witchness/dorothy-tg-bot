import type { Bot } from "grammy";
import { InputFile } from "grammy";
import type { QuoteRenderMode } from "../renderer.js";
import type { RegistryStatus } from "../registry_status.js";
import { buildRegistryMarkdown } from "../report.js";
import { splitForTelegram } from "../text_utils.js";
import { writeFileAtomic } from "../utils/safe_fs.js";
import { SEED_SCOPES, SEED_MESSAGE_KEYS, SEED_ENTITY_TYPES, buildSeedSamples } from "../seed_catalog.js";
import { resetConfigDefaults } from "../registry_config.js";
import { rmSync } from "node:fs";

export type MyContext = any;

const removePath = (p: string) => {
  try { rmSync(p, { recursive: true, force: true }); } catch {}
};

export function registerRegistryCommands(bot: Bot<MyContext>, statusRegistry: RegistryStatus) {
  bot.command("registry", async (ctx) => {
    try {
      const md = buildRegistryMarkdown(statusRegistry.snapshot());
      const filePath = "data/entity-registry.md";
      writeFileAtomic(filePath, md);
      try {
        await ctx.replyWithDocument(new InputFile(filePath), { caption: "Entity Registry (Markdown)" });
      } catch {
        for (const part of splitForTelegram(md, 3500)) {
          if (!part) continue;
          try { await ctx.reply(part, { parse_mode: "Markdown" }); } catch { await ctx.reply(part); }
        }
      }
    } catch (e) {
      console.warn("/registry failed", e);
      await ctx.reply("Не вдалося сформувати реєстр.");
    }
  });

  bot.command("registry_refresh", async (ctx) => {
    try {
      statusRegistry.saveNow();
      const md = buildRegistryMarkdown(statusRegistry.snapshot());
      const filePath = "data/entity-registry.md";
      writeFileAtomic(filePath, md);
      try {
        await ctx.replyWithDocument(new InputFile(filePath), { caption: "Entity Registry (refreshed)" });
      } catch {
        for (const part of splitForTelegram(md, 3500)) {
          if (!part) continue;
          try { await ctx.reply(part, { parse_mode: "Markdown" }); } catch { await ctx.reply(part); }
        }
      }
    } catch (e) {
      console.warn("/registry_refresh failed", e);
      await ctx.reply("Не вдалося оновити звіт.");
    }
  });

  bot.command("registry_seed", async (ctx) => {
    const arg = (ctx.message?.text ?? "").split(/\s+/)[1] as any;
    const status: "process" | "needs-review" = arg === "process" ? "process" : "needs-review";
    try {
      const newScopes = statusRegistry.observeScopes(SEED_SCOPES);

      for (const scope of Object.keys(SEED_MESSAGE_KEYS)) {
        const keys = SEED_MESSAGE_KEYS[scope];
        const samples = buildSeedSamples(keys);
        statusRegistry.observeMessageKeys(scope, keys, samples);
      }

      for (const scope of Object.keys(SEED_ENTITY_TYPES)) {
        statusRegistry.observeEntityTypes(scope, SEED_ENTITY_TYPES[scope]);
      }

      if (status === "process") {
        for (const scope of SEED_SCOPES) statusRegistry.setScopeStatus(scope, "process");
        for (const [scope, keys] of Object.entries(SEED_MESSAGE_KEYS)) for (const k of keys) statusRegistry.setMessageKeyStatus(scope, k, "process");
        for (const [scope, types] of Object.entries(SEED_ENTITY_TYPES)) for (const t of types) statusRegistry.setEntityTypeStatus(scope, t, "process");
      }

      statusRegistry.saveNow();
      await ctx.reply(`✅ Seeded registry (${status}). Спробуйте /reg_scope message або /registry.`);
    } catch (e) {
      console.warn("/registry_seed failed", e);
      await ctx.reply("Не вдалося виконати seed.");
    }
  });

  bot.command("registry_reset", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
    const hard = parts.includes("hard");
    const wipe = parts.includes("wipe");
    try {
      if (hard) resetConfigDefaults();
      statusRegistry.reset(false);
      if (wipe) {
        removePath("data/handled");
        removePath("data/handled-changes");
        removePath("data/unhandled");
        removePath("data/api-errors");
      }
      await ctx.reply(`Скинуто ${hard ? "(hard: із конфігом)" : "(status only)"}${wipe ? ", очищено логи" : ""}. Режим: dev. Почніть із дозволу scope/keys під повідомленнями.`);
    } catch (e) {
      console.warn("/registry_reset failed", e);
      await ctx.reply("Не вдалося скинути реєстр.");
    }
  });
}
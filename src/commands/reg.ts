import type { Bot } from "grammy";
import type { RegistryStatus } from "../registry_status.js";
import { buildInlineKeyboardForScope } from "../registry_actions.js";

export type MyContext = any;

export function registerRegCommands(bot: Bot<MyContext>, statusRegistry: RegistryStatus) {
  bot.command("reg", async (ctx) => {
    await ctx.reply([
      "Налаштування статусів (process/ignore/needs-review):",
      "- Не треба запам'ятовувати команди — при нових ключах/типах бот додає кнопки під повідомленням.",
      "- Можна редагувати файл data/registry-config.json — зміни підхоплюються без перезапуску.",
      "",
      "Приклади команд (не обов'язково):",
      "- scope: edited_message → process",
      "- key: message.photo → ignore",
      "- type: message.spoiler → process",
      "",
      "Режими:",
      "- /reg_mode debug — кнопки під кожним повідомленням",
      "- /reg_mode dev — тільки для нових (за замовчуванням)",
      "- /reg_mode prod — нічого не показувати",
      "",
      "Навігація:",
      "- /reg_scope message — показати кнопки для message",
      "- /reg_scope edited_message — показати кнопки для edited_message",
    ].join("\n"));
  });

  bot.command("reg_mode", async (ctx) => {
    const mode = (ctx.message?.text ?? "").split(/\s+/)[1] as any;
    if (!mode || !["debug", "dev", "prod"].includes(mode)) {
      await ctx.reply("Використання: /reg_mode <debug|dev|prod>");
      return;
    }
    try {
      const { setMode } = await import("../registry_config.js");
      setMode(mode);
      await ctx.reply(`Режим встановлено: ${mode}`);
    } catch {
      await ctx.reply("Не вдалося встановити режим.");
    }
  });

  bot.command("reg_scope", async (ctx) => {
    const arg = (ctx.message?.text ?? "").split(/\s+/)[1];
    const reg = statusRegistry.snapshot();
    const scopes = Object.keys(reg.scopes).sort();
    if (!arg) {
      await ctx.reply(["Вкажіть scope. Доступні:", scopes.join(", ")].join("\n"));
      return;
    }
    if (!reg.scopes[arg]) {
      await ctx.reply(`Невідомий scope: ${arg}. Доступні: ${scopes.join(", ")}`);
      return;
    }
    const kb = buildInlineKeyboardForScope(arg, reg);
    const keysCount = Object.keys(reg.keysByScope[arg] ?? {}).length;
    const typesCount = Object.keys(reg.entityTypesByScope[arg] ?? {}).length;
    const st = reg.scopes[arg]?.status ?? "needs-review";
    await ctx.reply(`Scope: ${arg} [${st}] — keys: ${keysCount}, types: ${typesCount}`, { reply_markup: kb ?? undefined });
  });
}
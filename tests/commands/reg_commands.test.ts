import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRegCommands } from "../../src/commands/reg.js";

const makeBot = () => {
  const commands: Record<string, Function> = {};
  return {
    command(name: string, handler: Function) { commands[name] = handler; },
    __handlers: commands,
  } as any;
};

const statusRegistry = {
  snapshot: vi.fn(() => ({
    scopes: { message: { status: "needs-review" } },
    keysByScope: { message: {} },
    entityTypesByScope: { message: {} },
  })),
} as any;

describe("commands/reg", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/reg replies with help", async () => {
    const bot = makeBot();
    registerRegCommands(bot, statusRegistry);
    const ctx = { reply: vi.fn() } as any;
    await bot.__handlers["reg"](ctx);
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("/reg_mode validates and sets mode", async () => {
    const bot = makeBot();
    registerRegCommands(bot, statusRegistry);
    const ctx = { reply: vi.fn(), message: { text: "/reg_mode dev" } } as any;
    await bot.__handlers["reg_mode"](ctx);
    expect(ctx.reply).toHaveBeenCalledWith("Режим встановлено: dev");
  });

  it("/reg_scope shows scope summary", async () => {
    const bot = makeBot();
    registerRegCommands(bot, statusRegistry);
    const ctx = { reply: vi.fn(), message: { text: "/reg_scope message" } } as any;
    await bot.__handlers["reg_scope"](ctx);
    expect(ctx.reply).toHaveBeenCalled();
  });
});
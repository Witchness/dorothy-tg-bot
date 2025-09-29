import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRegistryCommands } from "../../src/commands/registry.js";
import { vi } from "vitest";
vi.mock("../../src/utils/safe_fs.js", () => ({ writeFileAtomic: vi.fn() }));

const makeBot = () => {
  const commands: Record<string, Function> = {};
  return {
    command(name: string, handler: Function) { commands[name] = handler; },
    __handlers: commands,
  } as any;
};

const makeCtx = () => {
  return {
    message: { text: "/registry" },
    reply: vi.fn(async () => {}),
    replyWithDocument: vi.fn(async () => {}),
  } as any;
};

const statusRegistry = {
  snapshot: vi.fn(() => ({
    updatedAt: new Date().toISOString(),
    scopes: {},
    keysByScope: {},
    entityTypesByScope: {},
  })),
  observeScopes: vi.fn(() => []),
  saveNow: vi.fn(),
  reset: vi.fn(),
  observeMessageKeys: vi.fn(),
  observeEntityTypes: vi.fn(),
  setScopeStatus: vi.fn(),
  setMessageKeyStatus: vi.fn(),
  setEntityTypeStatus: vi.fn(),
} as any;

describe("commands/registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("/registry writes and sends markdown (fallback chunking)", async () => {
    const bot = makeBot();
    registerRegistryCommands(bot, statusRegistry);
    const ctx = makeCtx();
    // Force replyWithDocument to fail to exercise fallback
    ctx.replyWithDocument.mockRejectedValueOnce(new Error("nope"));
    await bot.__handlers["registry"](ctx);
    expect(ctx.replyWithDocument).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("/registry_refresh saves and responds", async () => {
    const bot = makeBot();
    registerRegistryCommands(bot, statusRegistry);
    const ctx = makeCtx();
    await bot.__handlers["registry_refresh"](ctx);
    expect(statusRegistry.saveNow).toHaveBeenCalled();
    expect(ctx.replyWithDocument).toHaveBeenCalled();
  });

  it("/registry_seed initializes and optionally sets process", async () => {
    const bot = makeBot();
    registerRegistryCommands(bot, statusRegistry);
    const ctx = { ...makeCtx(), message: { text: "/registry_seed process" } } as any;
    await bot.__handlers["registry_seed"](ctx);
    expect(statusRegistry.observeScopes).toHaveBeenCalled();
    expect(statusRegistry.setScopeStatus).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Seeded registry"));
  });

  it("/registry_reset supports hard+wipe", async () => {
    const bot = makeBot();
    registerRegistryCommands(bot, statusRegistry);
    const ctx = { ...makeCtx(), message: { text: "/registry_reset hard wipe" } } as any;
    await bot.__handlers["registry_reset"](ctx);
    expect(statusRegistry.reset).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled();
  });
});
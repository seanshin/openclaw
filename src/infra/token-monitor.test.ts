import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  recordTokenUsage,
  generateTokenMonitorSummary,
  loadTokenUsageSummary,
  resetTokenMonitor,
  readTokenUsageEvents,
  type NormalizedUsage,
} from "./token-monitor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Token Monitor", () => {
  const testDataDir = path.join(__dirname, "../../.test-data");

  beforeEach(async () => {
    // Clean up test data before each test
    if (fs.existsSync(testDataDir)) {
      await fs.promises.rm(testDataDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test data after each test
    if (fs.existsSync(testDataDir)) {
      await fs.promises.rm(testDataDir, { recursive: true, force: true });
    }
  });

  it("should record token usage", async () => {
    const usage: NormalizedUsage = {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      total: 165,
    };

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage,
    });

    const events = [];
    for await (const event of readTokenUsageEvents()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].provider).toBe("anthropic");
    expect(events[0].model).toBe("claude-3-opus");
    expect(events[0].usage.input).toBe(100);
    expect(events[0].usage.output).toBe(50);
  });

  it("should generate summary with multiple events", async () => {
    const usage1: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    const usage2: NormalizedUsage = {
      input: 200,
      output: 100,
      total: 300,
    };

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage: usage1,
    });

    await recordTokenUsage({
      provider: "openai",
      model: "gpt-4",
      usage: usage2,
    });

    const summary = await generateTokenMonitorSummary();

    expect(summary.total.input).toBe(300);
    expect(summary.total.output).toBe(150);
    expect(summary.total.requestCount).toBe(2);
    expect(summary.byProvider.size).toBe(2);
    expect(summary.byProvider.get("anthropic")).toBeDefined();
    expect(summary.byProvider.get("openai")).toBeDefined();
  });

  it("should filter events by provider", async () => {
    const usage: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage,
    });

    await recordTokenUsage({
      provider: "openai",
      model: "gpt-4",
      usage,
    });

    const events = [];
    for await (const event of readTokenUsageEvents({ provider: "anthropic" })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].provider).toBe("anthropic");
  });

  it("should filter events by time range", async () => {
    const usage: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage,
    });

    const events = [];
    for await (const event of readTokenUsageEvents({ since: hourAgo })) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it("should aggregate by hour and day", async () => {
    const usage: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage,
    });

    const summary = await generateTokenMonitorSummary();

    expect(summary.byHour.size).toBeGreaterThan(0);
    expect(summary.byDay.size).toBeGreaterThan(0);
  });

  it("should track top models", async () => {
    const usage1: NormalizedUsage = {
      input: 1000,
      output: 500,
      total: 1500,
    };

    const usage2: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage: usage1,
    });

    await recordTokenUsage({
      provider: "openai",
      model: "gpt-4",
      usage: usage2,
    });

    const summary = await generateTokenMonitorSummary();

    expect(summary.topModels).toHaveLength(2);
    expect(summary.topModels[0].model).toBe("claude-3-opus");
    expect(summary.topModels[1].model).toBe("gpt-4");
  });

  it("should reset token monitor data", async () => {
    const usage: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage,
    });

    let events = [];
    for await (const event of readTokenUsageEvents()) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(0);

    await resetTokenMonitor();

    events = [];
    for await (const event of readTokenUsageEvents()) {
      events.push(event);
    }
    expect(events).toHaveLength(0);
  });

  it("should calculate cost when config is provided", async () => {
    const usage: NormalizedUsage = {
      input: 100,
      output: 50,
      total: 150,
    };

    const config = {
      models: {
        cost: {
          "anthropic/claude-3-opus": {
            input: 15,
            output: 75,
          },
        },
      },
    } as any;

    await recordTokenUsage({
      provider: "anthropic",
      model: "claude-3-opus",
      usage,
      config,
    });

    const events = [];
    for await (const event of readTokenUsageEvents()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].cost).toBeGreaterThan(0);
  });
});

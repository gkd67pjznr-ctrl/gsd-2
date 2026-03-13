/**
 * Tests for embedCorrection() — fire-and-forget async embedding trigger.
 * Verifies: success path, failure isolation, no-provider skip, serialization, kill switch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CorrectionEntry } from "../correction-types.ts";

const mockEmbed = vi.fn();
const mockAddCorrection = vi.fn();
const mockInitialize = vi.fn();

vi.mock("../embedding.js", () => ({
  createEmbeddingProvider: vi.fn(),
}));

vi.mock("../vector-index.js", () => {
  return {
    VectorIndex: vi.fn().mockImplementation(function() {
      return {
        initialize: mockInitialize,
        addCorrection: mockAddCorrection,
      };
    }),
  };
});

vi.mock("../preferences.js", () => ({
  loadEffectiveGSDPreferences: vi.fn(() => ({ preferences: {} })),
  resolveAutoSupervisorConfig: vi.fn(() => ({})),
  resolveModelForUnit: vi.fn(() => null),
  resolveSkillDiscoveryMode: vi.fn(() => "off"),
  resolveQualityLevel: vi.fn(() => "standard"),
}));

import { createEmbeddingProvider } from "../embedding.js";
import { loadEffectiveGSDPreferences } from "../preferences.js";
import { embedCorrection, _getEmbedChain, _resetEmbeddingSingletons } from "../auto.ts";

const mockEntry: CorrectionEntry = {
  correction_from: "bad pattern",
  correction_to: "good pattern",
  diagnosis_category: "code.style",
  diagnosis_text: "Use consistent naming",
  scope: "file",
  phase: "executing",
  timestamp: new Date().toISOString(),
  session_id: "test-session",
  source: "programmatic",
  unit_type: "execute-task",
  unit_id: "M001/S01/T01",
};

describe("embedCorrection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetEmbeddingSingletons();

    mockEmbed.mockResolvedValue({ vector: [0.1, 0.2, 0.3] });
    mockAddCorrection.mockResolvedValue(true);
    mockInitialize.mockResolvedValue(undefined);

    (createEmbeddingProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      name: "openai",
      embed: mockEmbed,
    });

    process.env.GSD_EMBEDDING_PROVIDER = "openai";
    process.env.GSD_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.GSD_EMBEDDING_API_KEY = "test-key";

    (loadEffectiveGSDPreferences as ReturnType<typeof vi.fn>).mockReturnValue({ preferences: {} });
  });

  afterEach(() => {
    delete process.env.GSD_EMBEDDING_PROVIDER;
    delete process.env.GSD_EMBEDDING_MODEL;
    delete process.env.GSD_EMBEDDING_API_KEY;
  });

  it("calls provider.embed and index.addCorrection on success", async () => {
    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(mockEmbed).toHaveBeenCalledWith("good pattern");
    expect(mockAddCorrection).toHaveBeenCalledWith(mockEntry, [0.1, 0.2, 0.3]);
  });

  it("does not throw when embed returns null vector", async () => {
    mockEmbed.mockResolvedValue({ vector: null, error: "openai: HTTP 500" });

    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(mockEmbed).toHaveBeenCalled();
    expect(mockAddCorrection).not.toHaveBeenCalled();
  });

  it("does not throw when provider.embed throws", async () => {
    mockEmbed.mockRejectedValue(new Error("network error"));

    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(mockEmbed).toHaveBeenCalled();
    expect(mockAddCorrection).not.toHaveBeenCalled();
  });

  it("skips embedding when no provider configured", async () => {
    delete process.env.GSD_EMBEDDING_PROVIDER;
    delete process.env.GSD_EMBEDDING_MODEL;
    _resetEmbeddingSingletons();

    (createEmbeddingProvider as ReturnType<typeof vi.fn>).mockReturnValue(null);

    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockAddCorrection).not.toHaveBeenCalled();
  });

  it("serializes concurrent calls via promise chain", async () => {
    const callOrder: number[] = [];
    let resolveFirst!: () => void;
    const firstBlocks = new Promise<void>((r) => { resolveFirst = r; });

    mockEmbed
      .mockImplementationOnce(async () => {
        await firstBlocks;
        callOrder.push(1);
        return { vector: [1] };
      })
      .mockImplementationOnce(async () => {
        callOrder.push(2);
        return { vector: [2] };
      });

    embedCorrection(mockEntry);
    embedCorrection({ ...mockEntry, correction_to: "second" });

    // Second should not start until first finishes
    await new Promise((r) => setTimeout(r, 10));
    expect(callOrder).toEqual([]);

    resolveFirst();
    await _getEmbedChain();

    expect(callOrder).toEqual([1, 2]);
    expect(mockAddCorrection).toHaveBeenCalledTimes(2);
  });

  it("skips embedding when kill switch is active", async () => {
    (loadEffectiveGSDPreferences as ReturnType<typeof vi.fn>).mockReturnValue({
      preferences: { correction_capture: false },
    });

    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockAddCorrection).not.toHaveBeenCalled();
  });

  it("reads embedding config from env vars", async () => {
    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(createEmbeddingProvider).toHaveBeenCalledWith({
      provider: "openai",
      model: "text-embedding-3-small",
      apiKey: "test-key",
    });
  });

  it("does not throw when addCorrection fails", async () => {
    mockAddCorrection.mockRejectedValue(new Error("disk full"));

    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(mockEmbed).toHaveBeenCalled();
  });

  it("reuses singleton provider across calls", async () => {
    embedCorrection(mockEntry);
    embedCorrection(mockEntry);
    await _getEmbedChain();

    expect(createEmbeddingProvider).toHaveBeenCalledTimes(1);
  });
});

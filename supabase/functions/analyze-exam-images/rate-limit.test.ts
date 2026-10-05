import { describe, expect, it, vi } from "vitest";
import {
  configuredDailyLimit,
  consumeRateLimit,
  DEFAULT_DAILY_ANALYSIS_LIMIT,
  getUsageDate,
} from "./rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("rate-limit helper", () => {
  it("computes Asia/Shanghai usage date in YYYY-MM-DD format", () => {
    // 2026-10-05 23:30 UTC is 2026-10-06 07:30 in Asia/Shanghai (+8h)
    const date = new Date("2026-10-05T23:30:00Z");
    expect(getUsageDate(date)).toBe("2026-10-06");
  });

  it("configures daily limit from string or defaults to DEFAULT_DAILY_ANALYSIS_LIMIT", () => {
    expect(configuredDailyLimit(undefined)).toBe(DEFAULT_DAILY_ANALYSIS_LIMIT);
    expect(configuredDailyLimit("")).toBe(DEFAULT_DAILY_ANALYSIS_LIMIT);
    expect(configuredDailyLimit("invalid")).toBe(DEFAULT_DAILY_ANALYSIS_LIMIT);
    expect(configuredDailyLimit("-5")).toBe(DEFAULT_DAILY_ANALYSIS_LIMIT);
    expect(configuredDailyLimit("0")).toBe(DEFAULT_DAILY_ANALYSIS_LIMIT);
    expect(configuredDailyLimit("15")).toBe(15);
  });

  it("returns true when rpc succeeds and quota is available", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient;

    const allowed = await consumeRateLimit(
      mockClient,
      "user-1",
      10,
      "2026-10-05",
    );

    expect(allowed).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("check_and_increment_ai_usage", {
      p_user_id: "user-1",
      p_usage_date: "2026-10-05",
      p_max_limit: 10,
    });
  });

  it("returns false when rpc indicates limit exceeded", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient;

    const allowed = await consumeRateLimit(
      mockClient,
      "user-1",
      10,
      "2026-10-05",
    );

    expect(allowed).toBe(false);
  });

  it("falls back to table upsert when rpc encounters an error", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { analysis_count: 5 },
            error: null,
          }),
        }),
      }),
    });
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });
    const mockClient = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as SupabaseClient;

    const allowed = await consumeRateLimit(
      mockClient,
      "user-1",
      10,
      "2026-10-05",
    );

    expect(allowed).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("ai_analysis_rate_limits");
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("blocks request in fallback when count reaches limit", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { analysis_count: 10 },
            error: null,
          }),
        }),
      }),
    });
    const mockUpsert = vi.fn();
    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });
    const mockClient = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as SupabaseClient;

    const allowed = await consumeRateLimit(
      mockClient,
      "user-1",
      10,
      "2026-10-05",
    );

    expect(allowed).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_DAILY_ANALYSIS_LIMIT = 30;

export function getUsageDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function configuredDailyLimit(envLimit?: string): number {
  const raw = envLimit?.trim();
  if (!raw) return DEFAULT_DAILY_ANALYSIS_LIMIT;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DAILY_ANALYSIS_LIMIT;
}

export async function consumeRateLimit(
  adminClient: SupabaseClient,
  userId: string,
  limit: number,
  usageDate = getUsageDate(),
): Promise<boolean> {
  try {
    const { data, error } = await adminClient.rpc(
      "check_and_increment_ai_usage",
      {
        p_user_id: userId,
        p_usage_date: usageDate,
        p_max_limit: limit,
      },
    );
    if (error) {
      console.warn(
        "rate limit rpc failed, falling back to direct table check:",
        error.message,
      );
      return await fallbackTableConsume(adminClient, userId, limit, usageDate);
    }
    return data === true;
  } catch (err) {
    console.warn(
      "rate limit check error, falling back to direct table check:",
      err,
    );
    return await fallbackTableConsume(adminClient, userId, limit, usageDate);
  }
}

async function fallbackTableConsume(
  adminClient: SupabaseClient,
  userId: string,
  limit: number,
  usageDate: string,
): Promise<boolean> {
  try {
    const { data, error } = await adminClient
      .from("ai_analysis_rate_limits")
      .select("analysis_count")
      .eq("user_id", userId)
      .eq("usage_date", usageDate)
      .maybeSingle();

    if (error) {
      // If table does not exist or cannot be read, log warning and allow request
      console.warn("fallback rate limit read failed:", error.message);
      return true;
    }

    const current = (data?.analysis_count as number | undefined) ?? 0;
    if (current >= limit) {
      return false;
    }

    const { error: upsertError } = await adminClient
      .from("ai_analysis_rate_limits")
      .upsert(
        {
          user_id: userId,
          usage_date: usageDate,
          analysis_count: current + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,usage_date" },
      );

    if (upsertError) {
      console.warn("fallback rate limit write failed:", upsertError.message);
    }
    return true;
  } catch (err) {
    console.warn("fallback rate limit error:", err);
    return true;
  }
}

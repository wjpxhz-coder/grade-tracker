const PROVIDER_FAILURE_CODES = new Set([
  "invalid_provider_response",
  "provider_auth_error",
  "provider_error",
  "provider_incomplete",
  "provider_rate_limited",
  "provider_refusal",
  "provider_timeout",
  "provider_unreachable",
]);

type AnalysisResultItem = {
  status: string;
  error?: string;
};

export function topLevelProviderError(
  items: readonly AnalysisResultItem[],
): string | null {
  if (
    items.length === 0 ||
    !items.every((item) =>
      item.status === "failed" && PROVIDER_FAILURE_CODES.has(item.error ?? "")
    )
  ) {
    return null;
  }

  const errorCodes = new Set(items.map((item) => item.error as string));
  return errorCodes.size === 1
    ? (items[0].error as string)
    : "provider_error";
}

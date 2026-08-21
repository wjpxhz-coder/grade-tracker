import { describe, expect, it } from "vitest";
import { topLevelProviderError } from "./provider-error";

describe("topLevelProviderError", () => {
  it("preserves a shared provider authentication error", () => {
    expect(
      topLevelProviderError([
        { status: "failed", error: "provider_auth_error" },
        { status: "failed", error: "provider_auth_error" },
      ]),
    ).toBe("provider_auth_error");
  });

  it("preserves a shared provider rate-limit error", () => {
    expect(
      topLevelProviderError([
        { status: "failed", error: "provider_rate_limited" },
        { status: "failed", error: "provider_rate_limited" },
      ]),
    ).toBe("provider_rate_limited");
  });

  it("uses the generic provider error for mixed provider failures", () => {
    expect(
      topLevelProviderError([
        { status: "failed", error: "provider_timeout" },
        { status: "failed", error: "provider_unreachable" },
      ]),
    ).toBe("provider_error");
  });

  it("does not classify mixed or non-provider results as a provider outage", () => {
    expect(
      topLevelProviderError([
        { status: "analyzed" },
        { status: "failed", error: "provider_error" },
      ]),
    ).toBeNull();
    expect(
      topLevelProviderError([
        { status: "failed", error: "storage_download_failed" },
      ]),
    ).toBeNull();
    expect(topLevelProviderError([])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { createAuthClient, createUserClient } from "./client";

describe("Supabase Edge Function clients", () => {
  it("sends exactly one bearer token when validating the caller", async () => {
    const authorizationHeaders: Array<string | null> = [];
    const customFetch: typeof globalThis.fetch = async (_input, init) => {
      authorizationHeaders.push(
        new Headers(init?.headers).get("authorization"),
      );
      return new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000000",
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.invalid",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-07-30T00:00:00Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };
    const client = createAuthClient(
      "https://example.supabase.co",
      "legacy-anon-key",
      customFetch,
    );

    const { error } = await client.auth.getUser("user-access-token");

    expect(error).toBeNull();
    expect(authorizationHeaders).toEqual(["Bearer user-access-token"]);
  });

  it("forwards exactly one bearer token to RLS-protected requests", async () => {
    const authorizationHeaders: Array<string | null> = [];
    const customFetch: typeof globalThis.fetch = async (_input, init) => {
      authorizationHeaders.push(
        new Headers(init?.headers).get("authorization"),
      );
      return new Response("true", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createUserClient(
      "https://example.supabase.co",
      "legacy-anon-key",
      "user-access-token",
      customFetch,
    );

    const { data, error } = await client.rpc("can_view_exam", {
      p_exam_id: "00000000-0000-4000-8000-000000000001",
    });

    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(authorizationHeaders).toEqual(["Bearer user-access-token"]);
  });
});

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "exam-attachments";
const RETENTION_DAYS = 30;
const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 10;
const ORPHAN_GRACE_HOURS = 24;

type ExamClaim = {
  exam_id: string;
  storage_paths: string[] | null;
};

type AttachmentClaim = {
  attachment_id: string;
  storage_paths: string[] | null;
};

type PurgeError = {
  entity: "exam" | "attachment" | "function";
  id?: string;
  message: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return difference === 0;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const cronSecret = Deno.env.get("PURGE_CRON_SECRET") ?? "";
  if (cronSecret.length < 32) {
    return json({ error: "purge_cron_secret_not_configured" }, 500);
  }

  const providedSecret = request.headers.get("x-cron-secret") ?? "";
  if (!constantTimeEqual(providedSecret, cronSecret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "supabase_service_environment_missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const errors: PurgeError[] = [];
  let examsPurged = 0;
  let attachmentsPurged = 0;
  let notesPurged = 0;
  let orphanObjectsPurged = 0;
  let storageObjectsRemoved = 0;

  async function removeStorageObjects(paths: string[] | null): Promise<void> {
    const uniquePaths = [...new Set((paths ?? []).filter(Boolean))];
    if (uniquePaths.length === 0) return;

    const { error } = await supabase.storage.from(BUCKET).remove(uniquePaths);
    if (error) throw error;
    storageObjectsRemoved += uniquePaths.length;
  }

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const { data, error } = await supabase.rpc("claim_purge_exams", {
        p_before: cutoff,
        p_limit: BATCH_SIZE,
      });
      if (error) throw error;

      const claims = (data ?? []) as ExamClaim[];
      if (claims.length === 0) break;

      for (const claim of claims) {
        try {
          await removeStorageObjects(claim.storage_paths);
          const { data: finalized, error: finalizeError } = await supabase.rpc(
            "finalize_purge_exam",
            { p_exam_id: claim.exam_id },
          );
          if (finalizeError) throw finalizeError;
          if (finalized !== true) throw new Error("purge_claim_was_not_finalized");
          examsPurged += 1;
        } catch (error) {
          errors.push({
            entity: "exam",
            id: claim.exam_id,
            message: errorMessage(error),
          });
          const { error: releaseError } = await supabase.rpc(
            "release_purge_exam",
            { p_exam_id: claim.exam_id },
          );
          if (releaseError) {
            errors.push({
              entity: "exam",
              id: claim.exam_id,
              message: `release_failed: ${releaseError.message}`,
            });
          }
        }
      }

      if (claims.length < BATCH_SIZE) break;
    }

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const { data, error } = await supabase.rpc("purge_deleted_notes", {
        p_before: cutoff,
        p_limit: BATCH_SIZE,
      });
      if (error) throw error;
      const count = Number(data ?? 0);
      if (!Number.isFinite(count) || count <= 0) break;
      notesPurged += count;
      if (count < BATCH_SIZE) break;
    }

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const { data, error } = await supabase.rpc("claim_purge_attachments", {
        p_before: cutoff,
        p_limit: BATCH_SIZE,
      });
      if (error) throw error;

      const claims = (data ?? []) as AttachmentClaim[];
      if (claims.length === 0) break;

      for (const claim of claims) {
        try {
          await removeStorageObjects(claim.storage_paths);
          const { data: finalized, error: finalizeError } = await supabase.rpc(
            "finalize_purge_attachment",
            { p_attachment_id: claim.attachment_id },
          );
          if (finalizeError) throw finalizeError;
          if (finalized !== true) throw new Error("purge_claim_was_not_finalized");
          attachmentsPurged += 1;
        } catch (error) {
          errors.push({
            entity: "attachment",
            id: claim.attachment_id,
            message: errorMessage(error),
          });
          const { error: releaseError } = await supabase.rpc(
            "release_purge_attachment",
            { p_attachment_id: claim.attachment_id },
          );
          if (releaseError) {
            errors.push({
              entity: "attachment",
              id: claim.attachment_id,
              message: `release_failed: ${releaseError.message}`,
            });
          }
        }
      }

      if (claims.length < BATCH_SIZE) break;
    }

    const orphanCutoff = new Date(
      Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000,
    ).toISOString();
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const { data, error } = await supabase.rpc("list_stale_orphan_objects", {
        p_before: orphanCutoff,
        p_limit: BATCH_SIZE,
      });
      if (error) throw error;
      const paths = ((data ?? []) as Array<{ storage_path: string }>)
        .map((row) => row.storage_path)
        .filter(Boolean);
      if (paths.length === 0) break;
      await removeStorageObjects(paths);
      orphanObjectsPurged += paths.length;
      if (paths.length < BATCH_SIZE) break;
    }
  } catch (error) {
    errors.push({ entity: "function", message: errorMessage(error) });
    return json(
      {
        error: "purge_run_failed",
        cutoff,
        exams_purged: examsPurged,
        attachments_purged: attachmentsPurged,
        notes_purged: notesPurged,
        orphan_objects_purged: orphanObjectsPurged,
        storage_objects_removed: storageObjectsRemoved,
        errors,
      },
      500,
    );
  }

  return json({
    ok: errors.length === 0,
    cutoff,
    exams_purged: examsPurged,
    attachments_purged: attachmentsPurged,
    notes_purged: notesPurged,
    orphan_objects_purged: orphanObjectsPurged,
    storage_objects_removed: storageObjectsRemoved,
    errors,
  });
});

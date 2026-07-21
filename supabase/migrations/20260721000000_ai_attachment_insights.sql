-- Persisted, human-readable AI image summaries. Writes are intentionally
-- service-role only: the Edge Function first authorizes the caller with their
-- JWT and reads the exam, attachment metadata and object through user RLS.

create table public.ai_attachment_insights (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.attachments (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  sha256 text not null,
  model text not null,
  prompt_version text not null,
  title text not null,
  summary text not null,
  key_findings jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3) not null,
  details jsonb not null default '{}'::jsonb,
  usage jsonb,
  analyzed_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_attachment_insights_attachment_model_prompt_key
    unique (attachment_id, model, prompt_version),
  constraint ai_attachment_insights_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint ai_attachment_insights_model_check
    check (char_length(btrim(model)) between 1 and 100),
  constraint ai_attachment_insights_prompt_version_check
    check (char_length(btrim(prompt_version)) between 1 and 80),
  constraint ai_attachment_insights_title_check
    check (char_length(btrim(title)) between 1 and 160),
  constraint ai_attachment_insights_summary_check
    check (char_length(btrim(summary)) between 1 and 5000),
  constraint ai_attachment_insights_key_findings_check
    check (jsonb_typeof(key_findings) = 'array' and jsonb_array_length(key_findings) <= 12),
  constraint ai_attachment_insights_confidence_check
    check (confidence between 0 and 1),
  constraint ai_attachment_insights_details_check
    check (jsonb_typeof(details) = 'object'),
  constraint ai_attachment_insights_usage_check
    check (usage is null or jsonb_typeof(usage) = 'object')
);

create index ai_attachment_insights_exam_idx
  on public.ai_attachment_insights (exam_id, updated_at desc);

create index ai_attachment_insights_cache_idx
  on public.ai_attachment_insights (sha256, model, prompt_version, updated_at desc);

create or replace function public.prepare_ai_attachment_insight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam_id uuid;
begin
  select a.exam_id
  into v_exam_id
  from public.attachments a
  where a.id = new.attachment_id
    and a.deleted_at is null;

  if v_exam_id is null then
    raise exception using errcode = '23503', message = 'active_attachment_not_found';
  end if;

  if new.exam_id <> v_exam_id then
    raise exception using errcode = '23514', message = 'attachment_exam_mismatch';
  end if;

  new.model := btrim(new.model);
  new.prompt_version := btrim(new.prompt_version);
  new.title := btrim(new.title);
  new.summary := btrim(new.summary);
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_attachment_insights_prepare_row
before insert or update on public.ai_attachment_insights
for each row execute function public.prepare_ai_attachment_insight();

revoke all on function public.prepare_ai_attachment_insight() from public, anon, authenticated;

alter table public.ai_attachment_insights enable row level security;

create policy visible_ai_attachment_insights_are_readable
on public.ai_attachment_insights for select
to authenticated
using (public.can_view_exam(exam_id, auth.uid()));

revoke all on table public.ai_attachment_insights from anon, authenticated;
grant select on table public.ai_attachment_insights to authenticated;
grant select, insert, update, delete on table public.ai_attachment_insights to service_role;

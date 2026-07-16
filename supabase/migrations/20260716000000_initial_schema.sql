-- Our Grade Journal: initial database, authorization and storage schema.
-- This migration is intended for a fresh Supabase project.

create schema if not exists extensions;
create schema if not exists vault;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create type public.subject_code as enum (
  'chinese',
  'math',
  'english',
  'biology',
  'chemistry',
  'physics'
);

create type public.exam_kind as enum ('comprehensive', 'single_subject');
create type public.visibility as enum ('shared', 'private');
create type public.rank_scope as enum ('overall', 'subject');
create type public.attachment_kind as enum (
  'answer_sheet',
  'paper',
  'correction',
  'other'
);
create type public.audit_action as enum (
  'create',
  'update',
  'delete',
  'restore'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  login_alias text not null unique,
  login_email text not null unique,
  color_key text not null default 'sage',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_check
    check (char_length(btrim(display_name)) between 1 and 40),
  constraint profiles_login_alias_check
    check (login_alias = lower(login_alias) and login_alias ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  constraint profiles_login_email_check
    check (login_email = lower(login_email) and char_length(login_email) between 3 and 254),
  constraint profiles_color_key_check
    check (color_key in ('sage', 'peach'))
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们的成绩手账',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spaces_name_check check (char_length(btrim(name)) between 1 and 80)
);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_number smallint not null,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id),
  unique (user_id),
  unique (space_id, member_number),
  constraint space_members_number_check check (member_number in (1, 2))
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  student_id uuid not null,
  title text not null,
  exam_date date not null,
  kind public.exam_kind not null,
  primary_subject public.subject_code,
  total_score numeric(8, 2),
  total_full_score numeric(8, 2),
  rank_value integer,
  participant_count integer,
  rank_scope public.rank_scope,
  visibility public.visibility not null default 'shared',
  academic_year text,
  term text,
  category text,
  version integer not null default 1,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  purge_started_at timestamptz,
  foreign key (space_id, student_id)
    references public.space_members (space_id, user_id) on delete restrict,
  constraint exams_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint exams_academic_year_check check (
    academic_year is null or char_length(btrim(academic_year)) between 1 and 30
  ),
  constraint exams_term_check check (
    term is null or char_length(btrim(term)) between 1 and 40
  ),
  constraint exams_category_check check (
    category is null or char_length(btrim(category)) between 1 and 60
  ),
  constraint exams_kind_subject_check check (
    (kind = 'comprehensive' and primary_subject is null)
    or
    (kind = 'single_subject' and primary_subject is not null)
  ),
  constraint exams_total_score_check check (total_score is null or total_score >= 0),
  constraint exams_total_full_score_check check (
    total_full_score is null or total_full_score > 0
  ),
  constraint exams_score_requires_full_score_check check (
    total_score is null or total_full_score is not null
  ),
  constraint exams_score_within_full_score_check check (
    total_score is null or total_score <= total_full_score
  ),
  constraint exams_rank_check check (rank_value is null or rank_value > 0),
  constraint exams_rank_scope_check check (
    rank_value is null or rank_scope is not null
  ),
  constraint exams_participant_count_check check (
    participant_count is null or participant_count > 0
  ),
  constraint exams_rank_within_participants_check check (
    rank_value is null or participant_count is null or rank_value <= participant_count
  ),
  constraint exams_version_check check (version > 0),
  constraint exams_deleted_by_check check (
    (deleted_at is null and deleted_by is null)
    or
    (deleted_at is not null and deleted_by is not null)
  ),
  constraint exams_purge_state_check check (
    purge_started_at is null or deleted_at is not null
  )
);

create table public.subject_scores (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  subject public.subject_code not null,
  score numeric(8, 2),
  full_score numeric(8, 2),
  rank_value integer,
  participant_count integer,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, subject),
  constraint subject_scores_score_check check (score is null or score >= 0),
  constraint subject_scores_full_score_check check (full_score is null or full_score > 0),
  constraint subject_scores_score_requires_full_score_check check (
    score is null or full_score is not null
  ),
  constraint subject_scores_score_within_full_score_check check (
    score is null or score <= full_score
  ),
  constraint subject_scores_rank_check check (rank_value is null or rank_value > 0),
  constraint subject_scores_participant_count_check check (
    participant_count is null or participant_count > 0
  ),
  constraint subject_scores_rank_within_participants_check check (
    rank_value is null or participant_count is null or rank_value <= participant_count
  )
);

create table public.exam_notes (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  constraint exam_notes_content_check check (char_length(btrim(content)) between 1 and 10000),
  constraint exam_notes_deleted_by_check check (
    (deleted_at is null and deleted_by is null)
    or
    (deleted_at is not null and deleted_by is not null)
  )
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete restrict,
  category public.attachment_kind not null default 'other',
  storage_path text not null unique,
  thumbnail_path text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  thumbnail_byte_size bigint not null default 0,
  width integer,
  height integer,
  page_order integer not null default 0,
  sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  purge_started_at timestamptz,
  constraint attachments_paths_check check (
    char_length(storage_path) between 1 and 1000
    and char_length(thumbnail_path) between 1 and 1000
    and storage_path <> thumbnail_path
  ),
  constraint attachments_original_name_check check (
    char_length(btrim(original_name)) between 1 and 255
  ),
  constraint attachments_mime_type_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint attachments_byte_size_check check (
    byte_size > 0 and byte_size <= 8388608
    and thumbnail_byte_size >= 0 and thumbnail_byte_size <= 1048576
  ),
  constraint attachments_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint attachments_page_order_check check (page_order >= 0),
  constraint attachments_sha256_check check (
    sha256 is null or sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint attachments_deleted_by_check check (
    (deleted_at is null and deleted_by is null)
    or
    (deleted_at is not null and deleted_by is not null)
  ),
  constraint attachments_purge_state_check check (
    purge_started_at is null or deleted_at is not null
  )
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  space_id uuid not null,
  exam_id uuid,
  student_id uuid not null,
  visibility public.visibility not null,
  actor_id uuid references public.profiles (id) on delete set null,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid not null,
  old_data jsonb,
  new_data jsonb,
  changes jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_entity_type_check check (
    entity_type in ('exam', 'subject_score', 'exam_note', 'attachment')
  )
);

create index exams_student_date_idx
  on public.exams (student_id, exam_date desc, created_at desc)
  where deleted_at is null;
create index exams_space_visibility_idx
  on public.exams (space_id, visibility, exam_date desc);
create index exams_deleted_at_idx
  on public.exams (deleted_at)
  where deleted_at is not null;
create index subject_scores_exam_idx on public.subject_scores (exam_id);
create index subject_scores_subject_idx on public.subject_scores (subject, exam_id);
create index exam_notes_exam_created_idx
  on public.exam_notes (exam_id, created_at)
  where deleted_at is null;
create index attachments_exam_order_idx
  on public.attachments (exam_id, page_order, created_at)
  where deleted_at is null;
create index attachments_deleted_at_idx
  on public.attachments (deleted_at)
  where deleted_at is not null;
create unique index attachments_active_exam_sha256_uidx
  on public.attachments (exam_id, sha256)
  where deleted_at is null and sha256 is not null;
create index audit_events_exam_created_idx
  on public.audit_events (exam_id, created_at desc);
create index audit_events_space_created_idx
  on public.audit_events (space_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger spaces_touch_updated_at
before update on public.spaces
for each row execute function public.touch_updated_at();

create or replace function public.enforce_two_member_space()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.space_id::text));

  if (select count(*) from public.space_members where space_id = new.space_id) >= 2 then
    raise exception using errcode = 'P0001', message = 'space_member_limit_reached';
  end if;

  return new;
end;
$$;

create trigger space_members_enforce_two_members
before insert on public.space_members
for each row execute function public.enforce_two_member_space();

create or replace function public.is_space_member(
  p_space_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.space_members sm
    where sm.space_id = p_space_id
      and sm.user_id = p_user_id
  );
$$;

create or replace function public.can_view_exam(
  p_exam_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.exams e
    join public.space_members sm
      on sm.space_id = e.space_id
     and sm.user_id = p_user_id
    where e.id = p_exam_id
      and (e.visibility = 'shared' or e.student_id = p_user_id)
  );
$$;

create or replace function public.can_edit_exam(
  p_exam_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.exams e
    join public.space_members sm
      on sm.space_id = e.space_id
     and sm.user_id = p_user_id
    where e.id = p_exam_id
      and e.deleted_at is null
      and e.purge_started_at is null
      and (e.visibility = 'shared' or e.student_id = p_user_id)
  );
$$;

create or replace function public.storage_path_allowed(
  p_name text,
  p_write boolean,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_exam_id uuid;
begin
  if p_user_id is null or p_name is null then
    return false;
  end if;

  begin
    v_space_id := split_part(p_name, '/', 1)::uuid;
    v_exam_id := split_part(p_name, '/', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if split_part(p_name, '/', 3) = '' or split_part(p_name, '/', 4) <> '' then
    return false;
  end if;

  if p_write then
    return exists (
      select 1
      from public.exams e
      where e.id = v_exam_id
        and e.space_id = v_space_id
        and public.can_edit_exam(e.id, p_user_id)
    );
  end if;

  return exists (
    select 1
    from public.exams e
    where e.id = v_exam_id
      and e.space_id = v_space_id
      and public.can_view_exam(e.id, p_user_id)
  );
end;
$$;

create or replace function public.prepare_exam_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_actor is null then
      v_actor := new.created_by;
    end if;
    if v_actor is null then
      raise exception using errcode = '42501', message = 'authentication_required';
    end if;

    new.created_by := v_actor;
    new.updated_by := v_actor;
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    new.deleted_at := null;
    new.deleted_by := null;
    new.purge_started_at := null;
    return new;
  end if;

  new.id := old.id;
  new.space_id := old.space_id;
  new.student_id := old.student_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  -- Internal purge claims must not create a user-visible version or audit edit.
  if (to_jsonb(new) - 'purge_started_at') = (to_jsonb(old) - 'purge_started_at') then
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
    new.version := old.version;
    return new;
  end if;

  if v_actor is not null then
    new.updated_by := v_actor;
  else
    new.updated_by := old.updated_by;
  end if;
  new.updated_at := now();
  new.version := old.version + 1;

  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := coalesce(v_actor, new.deleted_by);
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
    new.purge_started_at := null;
  else
    new.deleted_by := old.deleted_by;
  end if;

  return new;
end;
$$;

create trigger exams_prepare_row
before insert or update on public.exams
for each row execute function public.prepare_exam_row();

create or replace function public.prepare_subject_score_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_kind public.exam_kind;
  v_primary_subject public.subject_code;
begin
  select e.kind, e.primary_subject
  into v_kind, v_primary_subject
  from public.exams e
  where e.id = new.exam_id;

  if not found then
    raise exception using errcode = '23503', message = 'exam_not_found';
  end if;

  if v_kind = 'single_subject' and new.subject <> v_primary_subject then
    raise exception using errcode = '23514', message = 'single_subject_mismatch';
  end if;

  if tg_op = 'INSERT' then
    v_actor := coalesce(v_actor, new.created_by);
    if v_actor is null then
      raise exception using errcode = '42501', message = 'authentication_required';
    end if;
    new.created_by := v_actor;
    new.updated_by := v_actor;
    new.created_at := now();
    new.updated_at := now();
  else
    new.id := old.id;
    new.exam_id := old.exam_id;
    new.subject := old.subject;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(v_actor, old.updated_by);
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger subject_scores_prepare_row
before insert or update on public.subject_scores
for each row execute function public.prepare_subject_score_row();

create or replace function public.prepare_note_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    v_actor := coalesce(v_actor, new.author_id);
    if v_actor is null then
      raise exception using errcode = '42501', message = 'authentication_required';
    end if;
    new.author_id := v_actor;
    new.created_at := now();
    new.updated_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
  else
    new.id := old.id;
    new.exam_id := old.exam_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.updated_at := now();

    if old.deleted_at is null and new.deleted_at is not null then
      new.deleted_at := now();
      new.deleted_by := coalesce(v_actor, old.author_id);
    elsif old.deleted_at is not null and new.deleted_at is null then
      new.deleted_by := null;
    else
      new.deleted_by := old.deleted_by;
    end if;
  end if;

  return new;
end;
$$;

create trigger exam_notes_prepare_row
before insert or update on public.exam_notes
for each row execute function public.prepare_note_row();

create or replace function public.prepare_attachment_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space_id uuid;
  v_expected_prefix text;
begin
  select e.space_id into v_space_id
  from public.exams e
  where e.id = new.exam_id;

  if not found then
    raise exception using errcode = '23503', message = 'exam_not_found';
  end if;

  if tg_op = 'INSERT' then
    v_actor := coalesce(v_actor, new.uploader_id);
    if v_actor is null then
      raise exception using errcode = '42501', message = 'authentication_required';
    end if;
    new.uploader_id := v_actor;
    new.created_at := now();
    new.updated_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
    new.purge_started_at := null;
  else
    new.id := old.id;
    new.exam_id := old.exam_id;
    new.uploader_id := old.uploader_id;
    new.storage_path := old.storage_path;
    new.thumbnail_path := old.thumbnail_path;
    new.created_at := old.created_at;

    if auth.uid() is not null
       and old.purge_started_at is not null
       and old.purge_started_at >= now() - interval '1 hour' then
      raise exception using errcode = 'P0001', message = 'purge_in_progress';
    end if;

    if auth.uid() is not null then
      new.purge_started_at := old.purge_started_at;
    end if;

    if (to_jsonb(new) - 'purge_started_at') = (to_jsonb(old) - 'purge_started_at') then
      new.updated_at := old.updated_at;
      return new;
    end if;

    new.updated_at := now();
    if old.deleted_at is null and new.deleted_at is not null then
      new.deleted_at := now();
      new.deleted_by := coalesce(v_actor, old.uploader_id);
    elsif old.deleted_at is not null and new.deleted_at is null then
      new.deleted_by := null;
      new.purge_started_at := null;
    else
      new.deleted_by := old.deleted_by;
    end if;
  end if;

  v_expected_prefix := v_space_id::text || '/' || new.exam_id::text || '/' || new.id::text;
  if new.storage_path not like v_expected_prefix || '.%'
     or new.thumbnail_path not like v_expected_prefix || '-thumb.%'
     or split_part(new.storage_path, '/', 4) <> ''
     or split_part(new.thumbnail_path, '/', 4) <> '' then
    raise exception using errcode = '23514', message = 'invalid_attachment_path';
  end if;

  return new;
end;
$$;

create trigger attachments_prepare_row
before insert or update on public.attachments
for each row execute function public.prepare_attachment_row();

create or replace function public.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_source jsonb;
  v_exam_id uuid;
  v_space_id uuid;
  v_student_id uuid;
  v_visibility public.visibility;
  v_actor_id uuid;
  v_action public.audit_action;
  v_entity_type text;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_source := coalesce(v_new, v_old);

  if tg_op = 'UPDATE'
     and (v_new - 'purge_started_at') = (v_old - 'purge_started_at') then
    return new;
  end if;

  v_entity_type := case tg_table_name
    when 'exams' then 'exam'
    when 'subject_scores' then 'subject_score'
    when 'exam_notes' then 'exam_note'
    when 'attachments' then 'attachment'
  end;

  -- Audit that a note changed without duplicating its private text into a
  -- second long-lived payload. The note row itself remains recoverable for 30 days.
  if tg_table_name = 'exam_notes' then
    v_old := case when v_old is null then null else v_old - 'content' end;
    v_new := case when v_new is null then null else v_new - 'content' end;
  end if;

  if tg_table_name = 'exams' then
    v_exam_id := (v_source ->> 'id')::uuid;
    v_space_id := (v_source ->> 'space_id')::uuid;
    v_student_id := (v_source ->> 'student_id')::uuid;
    v_visibility := (v_source ->> 'visibility')::public.visibility;
  else
    v_exam_id := (v_source ->> 'exam_id')::uuid;
    select e.space_id, e.student_id, e.visibility
    into v_space_id, v_student_id, v_visibility
    from public.exams e
    where e.id = v_exam_id;

    -- A cascading hard delete is represented by the parent exam event.
    if not found then
      if tg_op = 'DELETE' then
        return old;
      end if;
      raise exception using errcode = '23503', message = 'audit_exam_not_found';
    end if;
  end if;

  v_actor_id := coalesce(
    auth.uid(),
    nullif(v_source ->> 'updated_by', '')::uuid,
    nullif(v_source ->> 'deleted_by', '')::uuid,
    nullif(v_source ->> 'author_id', '')::uuid,
    nullif(v_source ->> 'uploader_id', '')::uuid,
    nullif(v_source ->> 'created_by', '')::uuid
  );

  if tg_op = 'INSERT' then
    v_action := 'create';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  elsif (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
    v_action := 'delete';
  elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
    v_action := 'restore';
  else
    v_action := 'update';
  end if;

  insert into public.audit_events (
    space_id,
    exam_id,
    student_id,
    visibility,
    actor_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    changes
  ) values (
    v_space_id,
    v_exam_id,
    v_student_id,
    v_visibility,
    v_actor_id,
    v_action,
    v_entity_type,
    (v_source ->> 'id')::uuid,
    v_old,
    v_new,
    jsonb_build_object('old', v_old, 'new', v_new)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger exams_record_audit
after insert or update or delete on public.exams
for each row execute function public.record_audit_event();

create trigger subject_scores_record_audit
after insert or update or delete on public.subject_scores
for each row execute function public.record_audit_event();

create trigger exam_notes_record_audit
after insert or update or delete on public.exam_notes
for each row execute function public.record_audit_event();

create trigger attachments_record_audit
after insert or update or delete on public.attachments
for each row execute function public.record_audit_event();

create or replace function public.save_exam(
  payload jsonb,
  expected_version integer default null
)
returns public.exams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_space_id uuid;
  v_student_id uuid;
  v_title text;
  v_exam_date date;
  v_kind public.exam_kind;
  v_primary_subject public.subject_code;
  v_total_score numeric(8, 2);
  v_total_full_score numeric(8, 2);
  v_rank_value integer;
  v_participant_count integer;
  v_rank_scope public.rank_scope;
  v_visibility public.visibility;
  v_academic_year text;
  v_term text;
  v_category text;
  v_existing public.exams%rowtype;
  v_result public.exams%rowtype;
  v_subject_payload jsonb;
  v_item jsonb;
  v_subject public.subject_code;
  v_subjects public.subject_code[] := array[]::public.subject_code[];
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_exam_payload';
  end if;

  begin
    v_id := nullif(payload ->> 'id', '')::uuid;
    v_space_id := nullif(payload ->> 'space_id', '')::uuid;
    v_student_id := nullif(payload ->> 'student_id', '')::uuid;
    v_title := btrim(coalesce(payload ->> 'title', ''));
    v_exam_date := nullif(payload ->> 'exam_date', '')::date;
    v_kind := nullif(payload ->> 'kind', '')::public.exam_kind;
    v_primary_subject := nullif(payload ->> 'primary_subject', '')::public.subject_code;
    v_total_score := nullif(payload ->> 'total_score', '')::numeric(8, 2);
    v_total_full_score := nullif(payload ->> 'total_full_score', '')::numeric(8, 2);
    v_rank_value := nullif(payload ->> 'rank_value', '')::integer;
    v_participant_count := nullif(payload ->> 'participant_count', '')::integer;
    v_academic_year := nullif(btrim(coalesce(payload ->> 'academic_year', '')), '');
    v_term := nullif(btrim(coalesce(payload ->> 'term', '')), '');
    v_category := nullif(btrim(coalesce(payload ->> 'category', '')), '');
    v_visibility := coalesce(
      nullif(payload ->> 'visibility', '')::public.visibility,
      'shared'::public.visibility
    );
    v_rank_scope := nullif(payload ->> 'rank_scope', '')::public.rank_scope;
  exception
    when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'invalid_exam_field';
  end;

  if v_space_id is null or v_student_id is null or v_exam_date is null or v_kind is null
     or v_title = '' then
    raise exception using errcode = '22023', message = 'missing_required_exam_field';
  end if;

  -- A single-subject exam has one canonical scale and rank scope. Normalize the
  -- aggregate here so direct RPC callers cannot create contradictory children.
  if v_rank_value is null then
    v_rank_scope := null;
  elsif v_kind = 'single_subject' then
    v_rank_scope := 'subject';
  end if;

  if not public.is_space_member(v_space_id, v_actor) then
    raise exception using errcode = '42501', message = 'space_access_denied';
  end if;

  if not public.is_space_member(v_space_id, v_student_id) then
    raise exception using errcode = '23503', message = 'student_not_in_space';
  end if;

  if v_visibility = 'private' and v_student_id <> v_actor then
    raise exception using errcode = '42501', message = 'private_exam_owner_required';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.exams (
      id,
      space_id,
      student_id,
      title,
      exam_date,
      kind,
      primary_subject,
      total_score,
      total_full_score,
      rank_value,
      participant_count,
      rank_scope,
      visibility,
      academic_year,
      term,
      category,
      created_by,
      updated_by
    ) values (
      v_id,
      v_space_id,
      v_student_id,
      v_title,
      v_exam_date,
      v_kind,
      v_primary_subject,
      v_total_score,
      v_total_full_score,
      v_rank_value,
      v_participant_count,
      v_rank_scope,
      v_visibility,
      v_academic_year,
      v_term,
      v_category,
      v_actor,
      v_actor
    );
  else
    select * into v_existing
    from public.exams
    where id = v_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'exam_not_found';
    end if;

    if v_existing.deleted_at is not null then
      raise exception using errcode = 'P0001', message = 'exam_is_deleted';
    end if;

    if v_existing.space_id <> v_space_id or v_existing.student_id <> v_student_id then
      raise exception using errcode = '22023', message = 'exam_identity_is_immutable';
    end if;

    if v_existing.visibility = 'private' and v_existing.student_id <> v_actor then
      raise exception using errcode = '42501', message = 'exam_edit_denied';
    end if;

    if expected_version is null or expected_version <> v_existing.version then
      raise exception using
        errcode = 'P0001',
        message = 'version_conflict',
        detail = format('expected=%s actual=%s', expected_version, v_existing.version);
    end if;

    update public.exams
    set title = v_title,
        exam_date = v_exam_date,
        kind = v_kind,
        primary_subject = v_primary_subject,
        total_score = v_total_score,
        total_full_score = v_total_full_score,
        rank_value = v_rank_value,
        participant_count = v_participant_count,
        rank_scope = v_rank_scope,
        visibility = v_visibility,
        academic_year = v_academic_year,
        term = v_term,
        category = v_category,
        updated_by = v_actor
    where id = v_id;
  end if;

  if v_kind = 'single_subject' then
    v_subject_payload := jsonb_build_array(jsonb_build_object(
      'subject', v_primary_subject,
      'score', v_total_score,
      'full_score', v_total_full_score,
      'rank_value', v_rank_value,
      'participant_count', v_participant_count
    ));
  else
    v_subject_payload := coalesce(payload -> 'subject_scores', '[]'::jsonb);
  end if;
  if jsonb_typeof(v_subject_payload) <> 'array' then
    raise exception using errcode = '22023', message = 'subject_scores_must_be_an_array';
  end if;

  for v_item in select value from jsonb_array_elements(v_subject_payload)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_subject_score';
    end if;

    begin
      v_subject := nullif(v_item ->> 'subject', '')::public.subject_code;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_subject_code';
    end;

    if v_subject is null then
      raise exception using errcode = '22023', message = 'subject_is_required';
    end if;
    if v_subject = any(v_subjects) then
      raise exception using errcode = '22023', message = 'duplicate_subject_score';
    end if;
    v_subjects := array_append(v_subjects, v_subject);

    begin
      insert into public.subject_scores (
        id,
        exam_id,
        subject,
        score,
        full_score,
        rank_value,
        participant_count,
        created_by,
        updated_by
      ) values (
        coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid()),
        v_id,
        v_subject,
        nullif(v_item ->> 'score', '')::numeric(8, 2),
        nullif(v_item ->> 'full_score', '')::numeric(8, 2),
        nullif(v_item ->> 'rank_value', '')::integer,
        nullif(v_item ->> 'participant_count', '')::integer,
        v_actor,
        v_actor
      )
      on conflict (exam_id, subject) do update
      set score = excluded.score,
          full_score = excluded.full_score,
          rank_value = excluded.rank_value,
          participant_count = excluded.participant_count,
          updated_by = v_actor
      where (
        subject_scores.score,
        subject_scores.full_score,
        subject_scores.rank_value,
        subject_scores.participant_count
      ) is distinct from (
        excluded.score,
        excluded.full_score,
        excluded.rank_value,
        excluded.participant_count
      );
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'invalid_subject_score_field';
    end;
  end loop;

  delete from public.subject_scores ss
  where ss.exam_id = v_id
    and not (ss.subject = any(v_subjects));

  -- A save is one optimistic-lock aggregate operation. If only child rows
  -- changed (or the submitted parent values were identical), the parent trigger
  -- has not advanced the version yet; force exactly one parent revision now.
  if v_existing.id is not null
     and exists (
       select 1 from public.exams e
       where e.id = v_id and e.version = v_existing.version
     ) then
    update public.exams
    set version = version + 1, updated_by = v_actor
    where id = v_id;
  end if;

  select * into v_result from public.exams where id = v_id;
  return v_result;
end;
$$;

create or replace function public.soft_delete_exam(
  exam_id uuid,
  expected_version integer
)
returns public.exams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exam public.exams%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_exam
  from public.exams
  where id = exam_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'exam_not_found';
  end if;
  if v_exam.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'exam_already_deleted';
  end if;
  if not public.is_space_member(v_exam.space_id, v_actor)
     or (v_exam.visibility = 'private' and v_exam.student_id <> v_actor) then
    raise exception using errcode = '42501', message = 'exam_delete_denied';
  end if;
  if expected_version is null or expected_version <> v_exam.version then
    raise exception using
      errcode = 'P0001',
      message = 'version_conflict',
      detail = format('expected=%s actual=%s', expected_version, v_exam.version);
  end if;

  update public.exams
  set deleted_at = now(), deleted_by = v_actor
  where id = exam_id
  returning * into v_exam;

  return v_exam;
end;
$$;

create or replace function public.restore_exam(
  exam_id uuid,
  expected_version integer
)
returns public.exams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exam public.exams%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_exam
  from public.exams
  where id = exam_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'exam_not_found';
  end if;
  if v_exam.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'exam_is_not_deleted';
  end if;
  if not public.is_space_member(v_exam.space_id, v_actor)
     or (v_exam.visibility = 'private' and v_exam.student_id <> v_actor) then
    raise exception using errcode = '42501', message = 'exam_restore_denied';
  end if;
  if expected_version is null or expected_version <> v_exam.version then
    raise exception using
      errcode = 'P0001',
      message = 'version_conflict',
      detail = format('expected=%s actual=%s', expected_version, v_exam.version);
  end if;
  if v_exam.purge_started_at is not null
     and v_exam.purge_started_at >= now() - interval '1 hour' then
    raise exception using errcode = 'P0001', message = 'purge_in_progress';
  end if;

  update public.exams
  set deleted_at = null,
      deleted_by = null,
      purge_started_at = null,
      updated_by = v_actor
  where id = exam_id
  returning * into v_exam;

  return v_exam;
end;
$$;

create or replace function public.get_storage_usage()
returns table (
  used_bytes bigint,
  file_count bigint,
  attachment_count bigint,
  limit_bytes bigint,
  usage_ratio numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(a.byte_size + a.thumbnail_byte_size), 0)::bigint as used_bytes,
    (count(a.id) * 2)::bigint as file_count,
    count(a.id)::bigint as attachment_count,
    1073741824::bigint as limit_bytes,
    round(
      coalesce(sum(a.byte_size + a.thumbnail_byte_size), 0)::numeric / 1073741824::numeric,
      6
    ) as usage_ratio
  from public.attachments a
  where public.can_view_exam(a.exam_id, auth.uid());
$$;

-- The following RPCs are granted only to the service_role and are used by the
-- purge Edge Function. A one-hour lease prevents a crashed invocation from
-- blocking the next daily run forever and prevents a restore race.
create or replace function public.claim_purge_exams(
  p_before timestamptz,
  p_limit integer default 100
)
returns table (exam_id uuid, storage_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select e.id
    from public.exams e
    where e.deleted_at < p_before
      and (
        e.purge_started_at is null
        or e.purge_started_at < now() - interval '1 hour'
      )
    order by e.deleted_at, e.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ),
  claimed as (
    update public.exams e
    set purge_started_at = now()
    from candidates c
    where e.id = c.id
    returning e.id
  ),
  paths as (
    select c.id, a.storage_path as path
    from claimed c
    join public.attachments a on a.exam_id = c.id
    union all
    select c.id, a.thumbnail_path as path
    from claimed c
    join public.attachments a on a.exam_id = c.id
  )
  select
    c.id,
    coalesce(
      array_agg(distinct p.path) filter (where p.path is not null),
      array[]::text[]
    )
  from claimed c
  left join paths p on p.id = c.id
  group by c.id;
end;
$$;

create or replace function public.finalize_purge_exam(p_exam_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean;
begin
  delete from public.exams e
  where e.id = p_exam_id
    and e.deleted_at is not null
    and e.purge_started_at is not null;
  v_deleted := found;
  if v_deleted then
    -- The exam DELETE trigger writes one final event. Remove it together with
    -- prior snapshots so a permanent purge leaves no sensitive audit payload.
    delete from public.audit_events where exam_id = p_exam_id;
  end if;
  return v_deleted;
end;
$$;

create or replace function public.release_purge_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exams
  set purge_started_at = null
  where id = p_exam_id and deleted_at is not null;
end;
$$;

create or replace function public.claim_purge_attachments(
  p_before timestamptz,
  p_limit integer default 100
)
returns table (attachment_id uuid, storage_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select a.id
    from public.attachments a
    join public.exams e on e.id = a.exam_id
    where a.deleted_at < p_before
      and e.purge_started_at is null
      and (
        a.purge_started_at is null
        or a.purge_started_at < now() - interval '1 hour'
      )
    order by a.deleted_at, a.id
    for update of a skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ),
  claimed as (
    update public.attachments a
    set purge_started_at = now()
    from candidates c
    where a.id = c.id
    returning a.id, a.storage_path, a.thumbnail_path
  )
  select
    c.id,
    array[c.storage_path, c.thumbnail_path]::text[]
  from claimed c;
end;
$$;

create or replace function public.finalize_purge_attachment(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean;
begin
  delete from public.attachments a
  where a.id = p_attachment_id
    and a.deleted_at is not null
    and a.purge_started_at is not null;
  v_deleted := found;
  if v_deleted then
    delete from public.audit_events
    where entity_type = 'attachment' and entity_id = p_attachment_id;
  end if;
  return v_deleted;
end;
$$;

create or replace function public.release_purge_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attachments
  set purge_started_at = null
  where id = p_attachment_id and deleted_at is not null;
end;
$$;

create or replace function public.purge_deleted_notes(
  p_before timestamptz,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with candidates as (
    select n.id
    from public.exam_notes n
    where n.deleted_at < p_before
    order by n.deleted_at, n.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ),
  deleted as (
    delete from public.exam_notes n
    using candidates c
    where n.id = c.id
    returning n.id
  )
  select coalesce(array_agg(d.id), array[]::uuid[])
  into v_ids
  from deleted d;

  -- The DELETE trigger emits one final note event; remove all snapshots so
  -- permanently deleted text is not retained in the audit log.
  delete from public.audit_events
  where entity_type = 'exam_note' and entity_id = any(v_ids);

  return cardinality(v_ids);
end;
$$;

create or replace function public.list_stale_orphan_objects(
  p_before timestamptz,
  p_limit integer default 100
)
returns table (storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'exam-attachments'
    and o.created_at < p_before
    and not exists (
      select 1
      from public.attachments a
      where a.storage_path = o.name or a.thumbnail_path = o.name
    )
  order by o.created_at, o.name
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create view public.login_profiles
with (security_invoker = true)
as
select id, display_name, login_alias, login_email, color_key
from public.profiles;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.exams enable row level security;
alter table public.subject_scores enable row level security;
alter table public.exam_notes enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_are_public_login_cards
on public.profiles for select
to anon, authenticated
using (true);

create policy members_can_read_their_space
on public.spaces for select
to authenticated
using (public.is_space_member(id, auth.uid()));

create policy members_can_read_space_members
on public.space_members for select
to authenticated
using (public.is_space_member(space_id, auth.uid()));

create policy visible_exams_are_readable
on public.exams for select
to authenticated
using (public.can_view_exam(id, auth.uid()));

create policy allowed_exams_are_insertable
on public.exams for insert
to authenticated
with check (
  public.is_space_member(space_id, auth.uid())
  and public.is_space_member(space_id, student_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and (visibility = 'shared' or student_id = auth.uid())
);

create policy editable_exams_are_updatable
on public.exams for update
to authenticated
using (public.can_edit_exam(id, auth.uid()))
with check (
  public.is_space_member(space_id, auth.uid())
  and (visibility = 'shared' or student_id = auth.uid())
);

create policy visible_subject_scores_are_readable
on public.subject_scores for select
to authenticated
using (public.can_view_exam(exam_id, auth.uid()));

create policy editable_subject_scores_are_insertable
on public.subject_scores for insert
to authenticated
with check (public.can_edit_exam(exam_id, auth.uid()));

create policy editable_subject_scores_are_updatable
on public.subject_scores for update
to authenticated
using (public.can_edit_exam(exam_id, auth.uid()))
with check (public.can_edit_exam(exam_id, auth.uid()));

create policy editable_subject_scores_are_deletable
on public.subject_scores for delete
to authenticated
using (public.can_edit_exam(exam_id, auth.uid()));

create policy visible_notes_are_readable
on public.exam_notes for select
to authenticated
using (
  public.can_view_exam(exam_id, auth.uid())
  and (deleted_at is null or author_id = auth.uid())
);

create policy authors_can_insert_notes
on public.exam_notes for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_edit_exam(exam_id, auth.uid())
);

create policy authors_can_update_notes
on public.exam_notes for update
to authenticated
using (
  author_id = auth.uid()
  and public.can_edit_exam(exam_id, auth.uid())
)
with check (
  author_id = auth.uid()
  and public.can_edit_exam(exam_id, auth.uid())
);

create policy visible_attachments_are_readable
on public.attachments for select
to authenticated
using (public.can_view_exam(exam_id, auth.uid()));

create policy members_can_insert_attachments
on public.attachments for insert
to authenticated
with check (public.can_edit_exam(exam_id, auth.uid()));

create policy members_can_update_attachments
on public.attachments for update
to authenticated
using (public.can_edit_exam(exam_id, auth.uid()))
with check (public.can_edit_exam(exam_id, auth.uid()));

create policy permitted_audit_events_are_readable
on public.audit_events for select
to authenticated
using (exam_id is not null and public.can_view_exam(exam_id, auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'exam-attachments',
  'exam-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy authenticated_members_can_read_exam_objects
on storage.objects for select
to authenticated
using (
  bucket_id = 'exam-attachments'
  and public.storage_path_allowed(name, false, auth.uid())
);

create policy authenticated_members_can_upload_exam_objects
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'exam-attachments'
  and public.storage_path_allowed(name, true, auth.uid())
);

create policy uploaders_can_remove_recent_orphans
on storage.objects for delete
to authenticated
using (
  bucket_id = 'exam-attachments'
  and public.storage_path_allowed(name, true, auth.uid())
  and owner_id = auth.uid()::text
  and created_at >= now() - interval '1 hour'
  and not exists (
    select 1
    from public.attachments a
    where a.storage_path = name or a.thumbnail_path = name
  )
);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.spaces from anon, authenticated;
revoke all on table public.space_members from anon, authenticated;
revoke all on table public.exams from anon, authenticated;
revoke all on table public.subject_scores from anon, authenticated;
revoke all on table public.exam_notes from anon, authenticated;
revoke all on table public.attachments from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
revoke all on table public.login_profiles from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant select on table public.login_profiles to anon, authenticated;
grant select on table public.spaces to authenticated;
grant select on table public.space_members to authenticated;
grant select on table public.exams to authenticated;
grant select on table public.subject_scores to authenticated;
grant select, insert, update on table public.exam_notes to authenticated;
grant select, insert, update on table public.attachments to authenticated;
grant select on table public.audit_events to authenticated;

revoke execute on function public.save_exam(jsonb, integer) from public, anon;
revoke execute on function public.soft_delete_exam(uuid, integer) from public, anon;
revoke execute on function public.restore_exam(uuid, integer) from public, anon;
revoke execute on function public.get_storage_usage() from public, anon;
grant execute on function public.save_exam(jsonb, integer) to authenticated;
grant execute on function public.soft_delete_exam(uuid, integer) to authenticated;
grant execute on function public.restore_exam(uuid, integer) to authenticated;
grant execute on function public.get_storage_usage() to authenticated;

revoke execute on function public.is_space_member(uuid, uuid) from public, anon;
revoke execute on function public.can_view_exam(uuid, uuid) from public, anon;
revoke execute on function public.can_edit_exam(uuid, uuid) from public, anon;
revoke execute on function public.storage_path_allowed(text, boolean, uuid) from public, anon;
grant execute on function public.is_space_member(uuid, uuid) to authenticated;
grant execute on function public.can_view_exam(uuid, uuid) to authenticated;
grant execute on function public.can_edit_exam(uuid, uuid) to authenticated;
grant execute on function public.storage_path_allowed(text, boolean, uuid) to authenticated;

revoke execute on function public.claim_purge_exams(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.finalize_purge_exam(uuid) from public, anon, authenticated;
revoke execute on function public.release_purge_exam(uuid) from public, anon, authenticated;
revoke execute on function public.claim_purge_attachments(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.finalize_purge_attachment(uuid) from public, anon, authenticated;
revoke execute on function public.release_purge_attachment(uuid) from public, anon, authenticated;
revoke execute on function public.purge_deleted_notes(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.list_stale_orphan_objects(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_purge_exams(timestamptz, integer) to service_role;
grant execute on function public.finalize_purge_exam(uuid) to service_role;
grant execute on function public.release_purge_exam(uuid) to service_role;
grant execute on function public.claim_purge_attachments(timestamptz, integer) to service_role;
grant execute on function public.finalize_purge_attachment(uuid) to service_role;
grant execute on function public.release_purge_attachment(uuid) to service_role;
grant execute on function public.purge_deleted_notes(timestamptz, integer) to service_role;
grant execute on function public.list_stale_orphan_objects(timestamptz, integer) to service_role;

-- The schedule is versioned with the schema. Until both named Vault secrets
-- are configured the guarded command is a no-op, so no credential is embedded
-- in this migration and no failing network request is emitted.
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-deleted-daily';

select cron.schedule(
  'purge-deleted-daily',
  '15 3 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'project_url' limit 1
      ) || '/functions/v1/purge-deleted',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'purge_cron_secret' limit 1
        )
      ),
      body := jsonb_build_object('source', 'pg_cron')
    )
    where exists (
      select 1 from vault.decrypted_secrets where name = 'project_url'
    ) and exists (
      select 1 from vault.decrypted_secrets where name = 'purge_cron_secret'
    );
  $job$
);

comment on table public.profiles is
  'Two public login cards. Use synthetic, non-personal login_email values.';
comment on table public.exams is
  'Exam aggregate. All edits go through save_exam for optimistic locking.';
comment on table public.attachments is
  'Private Storage metadata; object paths are space/exam/attachment/file.';
comment on function public.save_exam(jsonb, integer) is
  'Atomically creates or updates an exam and its complete subject_scores array.';
comment on function public.get_storage_usage() is
  'Approximate visible attachment usage; the free-tier limit is informational.';

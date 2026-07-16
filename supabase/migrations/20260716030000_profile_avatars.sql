-- User-controlled profile names and avatars. Avatar objects remain private and
-- can only be read by the two members of the same shared space.

alter table public.profiles
  add column avatar_path text;

alter table public.profiles
  add constraint profiles_avatar_path_check check (
    avatar_path is null
    or avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]+\.webp$'
  );

create or replace function public.profile_avatar_path_is_owned(
  p_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]+\.webp$'
    and split_part(p_name, '/', 1) = p_user_id::text;
$$;

create or replace function public.can_read_profile_avatar(
  p_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  if p_user_id is null
     or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]+\.webp$' then
    return false;
  end if;

  v_owner_id := split_part(p_name, '/', 1)::uuid;
  return exists (
    select 1
    from public.space_members owner_membership
    join public.space_members viewer_membership
      on viewer_membership.space_id = owner_membership.space_id
    where owner_membership.user_id = v_owner_id
      and viewer_membership.user_id = p_user_id
  );
end;
$$;

create or replace function public.update_my_profile(
  p_display_name text,
  p_avatar_path text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(v_display_name) not between 1 and 40 then
    raise exception using errcode = '23514', message = 'invalid_display_name';
  end if;
  if p_avatar_path is not null and not public.profile_avatar_path_is_owned(p_avatar_path, v_actor) then
    raise exception using errcode = '42501', message = 'invalid_avatar_path';
  end if;
  if p_avatar_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'profile-avatars' and name = p_avatar_path
  ) then
    raise exception using errcode = 'P0001', message = 'avatar_not_found';
  end if;

  update public.profiles
  set display_name = v_display_name,
      avatar_path = p_avatar_path
  where id = v_actor
  returning * into v_profile;

  return v_profile;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  524288,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy authenticated_members_can_read_profile_avatars
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and public.can_read_profile_avatar(name, auth.uid())
);

create policy users_can_upload_own_profile_avatars
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and public.profile_avatar_path_is_owned(name, auth.uid())
);

create policy users_can_delete_own_profile_avatars
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and public.profile_avatar_path_is_owned(name, auth.uid())
);

revoke execute on function public.profile_avatar_path_is_owned(text, uuid) from public, anon;
revoke execute on function public.can_read_profile_avatar(text, uuid) from public, anon;
revoke execute on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.profile_avatar_path_is_owned(text, uuid) to authenticated;
grant execute on function public.can_read_profile_avatar(text, uuid) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;

comment on column public.profiles.avatar_path is
  'Private profile avatar object path in the profile-avatars bucket.';

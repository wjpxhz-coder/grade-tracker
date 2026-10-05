-- Rate limiting table and atomic counter for AI attachment image analyses.
-- Protects upstream AI API quotas by limiting calls per user per day.
-- Only service_role can access this table and execute the RPC.

create table if not exists public.ai_analysis_rate_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  usage_date date not null default (now() at time zone 'Asia/Shanghai')::date,
  analysis_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date),
  constraint ai_analysis_rate_limits_count_check check (analysis_count >= 0)
);

create or replace function public.check_and_increment_ai_usage(
  p_user_id uuid,
  p_usage_date date,
  p_max_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_max_limit <= 0 then
    return false;
  end if;

  insert into public.ai_analysis_rate_limits (user_id, usage_date, analysis_count, created_at, updated_at)
  values (p_user_id, p_usage_date, 1, now(), now())
  on conflict (user_id, usage_date) do update
  set analysis_count = case
      when public.ai_analysis_rate_limits.analysis_count < p_max_limit
      then public.ai_analysis_rate_limits.analysis_count + 1
      else public.ai_analysis_rate_limits.analysis_count
    end,
    updated_at = now()
  returning analysis_count into v_count;

  return v_count <= p_max_limit;
end;
$$;

alter table public.ai_analysis_rate_limits enable row level security;

revoke all on table public.ai_analysis_rate_limits from anon, authenticated;
revoke all on function public.check_and_increment_ai_usage(uuid, date, integer) from public, anon, authenticated;

grant select, insert, update on table public.ai_analysis_rate_limits to service_role;
grant execute on function public.check_and_increment_ai_usage(uuid, date, integer) to service_role;

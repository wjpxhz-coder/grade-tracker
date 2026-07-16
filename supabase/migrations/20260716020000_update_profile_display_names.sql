update public.profiles
set
  display_name = case login_alias
    when 'wjpxhz' then '小奚'
    when 'cutesnake521' then '小蛇'
  end,
  updated_at = now()
where login_alias in ('wjpxhz', 'cutesnake521');

update auth.users as users
set raw_user_meta_data = coalesce(users.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'display_name',
    case profiles.login_alias
      when 'wjpxhz' then '小奚'
      when 'cutesnake521' then '小蛇'
    end
  )
from public.profiles as profiles
where users.id = profiles.id
  and profiles.login_alias in ('wjpxhz', 'cutesnake521');

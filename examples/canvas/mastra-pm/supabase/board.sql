-- Shared SaXer board in Supabase (Postgres).
-- Applied to the project "SaXer Board" (region eu-central-2, Zurich).
-- To set up another project, run this once in the Supabase SQL editor.

-- One shared board for the SaXer team (row id 1), with an optimistic version.
create table public.board (
  id smallint primary key check (id = 1),
  data jsonb not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);

comment on table public.board is
  'Shared SaXer task board. Written only by the board server with the secret key.';

-- Only the server (secret / service_role key) may read or write.
-- RLS without policies is intended: anon and authenticated get no access.
alter table public.board enable row level security;
revoke all on table public.board from anon, authenticated;

-- Saves the shared board only if it is still at p_base_version
-- (null = nothing saved yet). Returns the new version, or null on conflict.
create function public.save_board(p_data jsonb, p_base_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_version integer;
begin
  if p_base_version is null then
    insert into public.board (id, data, version)
    values (1, p_data, 1)
    on conflict (id) do nothing
    returning version into new_version;
  else
    update public.board
    set data = p_data, version = version + 1, updated_at = now()
    where id = 1 and version = p_base_version
    returning version into new_version;
  end if;
  return new_version;
end;
$$;

revoke execute on function public.save_board(jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_board(jsonb, integer) to service_role;

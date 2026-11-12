-- Caixa: tabela privada para sincronizar os dados de cada usuário.
-- Execute este script no Supabase > SQL Editor > New query.

create table if not exists public.caixa_dados (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dados jsonb not null default '{"lanc":[],"custom":{"receita":[],"despesa":[]}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.caixa_dados enable row level security;

drop policy if exists "Cada usuário lê seus próprios dados" on public.caixa_dados;
create policy "Cada usuário lê seus próprios dados"
  on public.caixa_dados for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Cada usuário insere seus próprios dados" on public.caixa_dados;
create policy "Cada usuário insere seus próprios dados"
  on public.caixa_dados for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Cada usuário atualiza seus próprios dados" on public.caixa_dados;
create policy "Cada usuário atualiza seus próprios dados"
  on public.caixa_dados for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.caixa_dados to authenticated;

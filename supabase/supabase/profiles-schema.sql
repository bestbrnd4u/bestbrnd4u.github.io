-- ======================================
-- Bagvero — таблиця профілів клієнтів («Мої дані»)
--
-- Виконати ОДИН раз у Supabase: Project → SQL Editor → New query,
-- вставити весь цей файл і натиснути Run.
-- Робити це можна незалежно від orders-schema.sql, у будь-якому порядку.
-- ======================================

create table if not exists public.profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    first_name    text,
    last_name     text,
    middle_name   text,
    phone         text,
    city          text,
    updated_at    timestamptz not null default now()
);

-- Row Level Security: кожен клієнт бачить і може змінювати
-- лише СВІЙ власний профіль.
alter table public.profiles enable row level security;

create policy "Users can view own profile"
    on public.profiles for select
    using (auth.uid() = id);

create policy "Users can insert own profile"
    on public.profiles for insert
    with check (auth.uid() = id);

create policy "Users can update own profile"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

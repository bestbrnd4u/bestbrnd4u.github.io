-- ======================================
-- Bagvero — таблиця збережених адрес доставки
-- (особистий кабінет → «Адреси доставки»)
--
-- Виконати ОДИН раз у Supabase: Project → SQL Editor → New query,
-- вставити весь цей файл і натиснути Run.
-- Незалежна від profiles-schema.sql / orders-schema.sql,
-- можна виконувати в будь-якому порядку.
-- ======================================

create table if not exists public.addresses (
    id                bigint generated always as identity primary key,
    user_id           uuid references auth.users(id) on delete cascade not null,
    label             text,
    city              text not null,
    delivery_method   text not null,
    branch_number     text,
    postomat_number   text,
    courier_address   text,
    is_default        boolean not null default false,
    created_at        timestamptz not null default now()
);

-- Row Level Security: кожен клієнт бачить і може змінювати
-- лише СВОЇ власні адреси.
alter table public.addresses enable row level security;

create policy "Users can view own addresses"
    on public.addresses for select
    using (auth.uid() = user_id);

create policy "Users can insert own addresses"
    on public.addresses for insert
    with check (auth.uid() = user_id);

create policy "Users can update own addresses"
    on public.addresses for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete own addresses"
    on public.addresses for delete
    using (auth.uid() = user_id);

create index if not exists addresses_user_id_idx
    on public.addresses (user_id, created_at desc);

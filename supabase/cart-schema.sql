-- ======================================
-- BestBrnd4u — таблиця кошика клієнта (синхронізація
-- кошика між пристроями після входу в акаунт)
--
-- Виконати ОДИН раз у Supabase: Project → SQL Editor → New query,
-- вставити весь цей файл і натиснути Run.
-- Незалежна від profiles-schema.sql / orders-schema.sql /
-- addresses-schema.sql, можна виконувати в будь-якому порядку.
--
-- color/size навмисно NOT NULL DEFAULT '' (а не NULL) — у
-- Postgres кожен NULL вважається окремим унікальним значенням,
-- тож при NULL унікальний індекс (user_id, product_id, color, size)
-- не запобігав би дублям для товару без кольору/розміру.
-- ======================================

create table if not exists public.cart_items (
    id            bigint generated always as identity primary key,
    user_id       uuid references auth.users(id) on delete cascade not null,
    product_id    bigint not null,
    color         text not null default '',
    size          text not null default '',
    qty           integer not null default 1,
    updated_at    timestamptz not null default now(),
    unique (user_id, product_id, color, size)
);

-- Row Level Security: кожен клієнт бачить і може змінювати
-- лише СВІЙ власний кошик.
alter table public.cart_items enable row level security;

create policy "Users can view own cart"
    on public.cart_items for select
    using (auth.uid() = user_id);

create policy "Users can insert own cart"
    on public.cart_items for insert
    with check (auth.uid() = user_id);

create policy "Users can update own cart"
    on public.cart_items for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete own cart"
    on public.cart_items for delete
    using (auth.uid() = user_id);

create index if not exists cart_items_user_id_idx
    on public.cart_items (user_id);

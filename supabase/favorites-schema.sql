-- ======================================
-- BestBrnd4u — таблиця обраних товарів клієнта
-- (синхронізація "Обране" між пристроями після входу в акаунт)
--
-- Виконати ОДИН раз у Supabase: Project → SQL Editor → New query,
-- вставити весь цей файл і натиснути Run.
-- Незалежна від інших *-schema.sql, можна виконувати
-- в будь-якому порядку.
--
-- color/size навмисно NOT NULL DEFAULT '' (а не NULL) — щоб
-- унікальний індекс (user_id, product_id, color, size) справді
-- запобігав дублям навіть для товару без кольору/розміру
-- (у Postgres кожен NULL вважається окремим значенням).
-- ======================================

create table if not exists public.favorites (
    id            bigint generated always as identity primary key,
    user_id       uuid references auth.users(id) on delete cascade not null,
    product_id    bigint not null,
    color         text not null default '',
    size          text not null default '',
    created_at    timestamptz not null default now(),
    unique (user_id, product_id, color, size)
);

-- Row Level Security: кожен клієнт бачить і може змінювати
-- лише СВОЄ власне обране.
alter table public.favorites enable row level security;

create policy "Users can view own favorites"
    on public.favorites for select
    using (auth.uid() = user_id);

create policy "Users can insert own favorites"
    on public.favorites for insert
    with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
    on public.favorites for delete
    using (auth.uid() = user_id);

create index if not exists favorites_user_id_idx
    on public.favorites (user_id);

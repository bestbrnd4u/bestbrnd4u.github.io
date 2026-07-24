-- ======================================
-- Bagvero — таблиця замовлень для особистого кабінету
--
-- Виконати ОДИН раз у Supabase: Project → SQL Editor → New query,
-- вставити весь цей файл і натиснути Run.
-- ======================================

create table if not exists public.orders (
    id                bigint generated always as identity primary key,
    user_id           uuid references auth.users(id) on delete cascade not null,
    order_number      text not null,
    created_at        timestamptz not null default now(),
    status            text not null default 'new',
    items             jsonb not null,
    subtotal          numeric not null default 0,
    discount          numeric not null default 0,
    delivery_price    numeric not null default 0,
    total             numeric not null default 0,
    delivery_method   text,
    delivery_city     text,
    promo_code        text,
    first_name        text,
    last_name         text,
    phone             text,
    email             text
);

-- Row Level Security: кожен клієнт бачить і може створювати
-- лише СВОЇ власні замовлення — це критично важливо, інакше
-- будь-хто зможе прочитати чужі замовлення через публічний ключ.
alter table public.orders enable row level security;

create policy "Users can view own orders"
    on public.orders for select
    using (auth.uid() = user_id);

create policy "Users can insert own orders"
    on public.orders for insert
    with check (auth.uid() = user_id);

-- Індекс для швидкої вибірки замовлень користувача,
-- відсортованих за датою (саме так їх показує кабінет).
create index if not exists orders_user_id_created_at_idx
    on public.orders (user_id, created_at desc);

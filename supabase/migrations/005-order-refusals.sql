-- ======================================
-- Відмова від товару: справжня заявка замість повідомлення
--
-- Виконати один раз у Supabase → SQL Editor.
-- Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- Проблема, яку це вирішує
--
-- Кнопка «Відмова» в кабінеті лише показувала клієнту напис
-- «менеджер зв'яжеться з вами». Нікуди нічого не зберігалось і
-- ніхто не отримував сповіщення — тобто клієнту обіцяли те, чого
-- не відбувалось.
--
-- Тепер відмова — це запис у базі: ви бачите його в Telegram і в
-- картці замовлення.
-- --------------------------------------


-- Позначка на самому замовленні — щоб було видно в списку /orders
-- і в кабінеті клієнта.
alter table public.orders
    add column if not exists refusal_requested_at timestamptz;


-- --------------------------------------
-- Заявки на відмову — ОКРЕМА таблиця
--
-- Навмисно не даємо клієнту право оновлювати саме замовлення:
-- інакше він міг би змінити в ньому будь-що, зокрема суму. Тут він
-- може лише СТВОРИТИ заявку на своє замовлення — і нічого більше.
-- --------------------------------------

create table if not exists public.order_refusals (

    id          uuid primary key default gen_random_uuid(),

    -- bigint, а НЕ uuid: public.orders.id оголошений як
    -- "bigint generated always as identity" (див. supabase/orders-schema.sql).
    -- Тип зовнішнього ключа мусить точно збігатися з типом ключа, на
    -- який він указує, інакше Postgres відмовляється створювати
    -- обмеження: "Key columns are of incompatible types: uuid and bigint".
    order_id    bigint not null references public.orders(id) on delete cascade,

    -- а тут саме uuid — це id користувача з auth.users
    user_id     uuid,
    note        text,
    created_at  timestamptz not null default now()

);


create index if not exists order_refusals_order_idx
    on public.order_refusals(order_id);


alter table public.order_refusals enable row level security;


-- Клієнт може створити заявку ЛИШЕ на власне замовлення.
-- Підзапит перевіряє, що замовлення справді його.
drop policy if exists "refusals_insert_own" on public.order_refusals;

create policy "refusals_insert_own"
    on public.order_refusals
    for insert
    to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.orders o
            where o.id = order_id
              and o.user_id = auth.uid()
        )
    );


-- Бачити свої заявки — щоб кабінет показував «відмову вже надіслано»
drop policy if exists "refusals_select_own" on public.order_refusals;

create policy "refusals_select_own"
    on public.order_refusals
    for select
    to authenticated
    using (user_id = auth.uid());


-- --------------------------------------
-- Позначка на замовленні + сповіщення в Telegram
--
-- Тригер робить дві речі: ставить дату відмови на замовлення (щоб
-- вона була видна в списку) і шле вам повідомлення.
--
-- ПЕРЕД ЗАПУСКОМ замініть <PROJECT_REF> і <HOOK_SECRET> — так само,
-- як у міграції 001.
-- --------------------------------------

create extension if not exists pg_net with schema extensions;


create or replace function public.notify_telegram_refusal()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    ord public.orders;
begin

    update public.orders
       set refusal_requested_at = now()
     where id = new.order_id
    returning * into ord;

    perform net.http_post(
        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/telegram-order-bot',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'x-hook-secret', '<HOOK_SECRET>'
        ),
        body    := jsonb_build_object(
            'type',   'INSERT',
            'table',  'order_refusals',
            'record', jsonb_build_object(
                'id',       new.id,
                'note',     new.note,
                'order_id', new.order_id
            ),
            'order',  to_jsonb(ord)
        )
    );

    return new;

end;
$$;


drop trigger if exists trg_notify_telegram_refusal on public.order_refusals;

create trigger trg_notify_telegram_refusal
    after insert on public.order_refusals
    for each row
    execute function public.notify_telegram_refusal();


-- --------------------------------------
-- Перевірка
-- --------------------------------------

-- select o.order_number, o.refusal_requested_at, r.note, r.created_at
-- from public.order_refusals r
-- join public.orders o on o.id = r.order_id
-- order by r.created_at desc;

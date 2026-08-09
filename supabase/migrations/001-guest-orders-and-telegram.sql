-- ======================================
-- Гостьові замовлення + сповіщення в Telegram
--
-- Виконати один раз у Supabase → SQL Editor.
-- Кожен блок можна запускати окремо; повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- 1. Дозволити замовлення без реєстрації
--
-- Раніше сайт зберігав замовлення тільки для авторизованих
-- (у коді стояв ранній вихід), тож гостьові заявки в базу не
-- потрапляли — лише лист на пошту. Тепер фронтенд пише всі,
-- але база має це дозволити:
--   • user_id мусить приймати NULL (гість);
--   • RLS-політика має дозволяти вставку анонімній ролі.
-- --------------------------------------

-- user_id стає необов'язковим
alter table public.orders
    alter column user_id drop not null;


-- RLS лишається увімкненим — просто додаємо явну політику вставки.
-- Вимикати RLS НЕ можна: тоді будь-хто зміг би читати чужі
-- замовлення з їхніми телефонами й адресами.
alter table public.orders enable row level security;


-- Вставляти може будь-хто (гість оформлює замовлення на сайті),
-- але лише "своє": або без user_id, або зі своїм власним.
-- Чужий user_id підставити не вийде.
drop policy if exists "orders_insert_any" on public.orders;

create policy "orders_insert_any"
    on public.orders
    for insert
    to anon, authenticated
    with check (
        user_id is null
        or user_id = auth.uid()
    );


-- Читати замовлення може лише їх власник (для «Історії замовлень»
-- у кабінеті). Гостьові замовлення (user_id is null) з клієнта не
-- читаються взагалі — вони доступні тільки вам через Telegram
-- і сервісний ключ.
drop policy if exists "orders_select_own" on public.orders;

create policy "orders_select_own"
    on public.orders
    for select
    to authenticated
    using (user_id = auth.uid());


-- --------------------------------------
-- 2. Сповіщення в Telegram про нове замовлення
--
-- Тригер шле HTTP-запит на Edge Function при кожній вставці в
-- orders. Так фронтенд взагалі не знає про Telegram — а отже,
-- токен бота ніде не світиться в коді сайту.
--
-- ПЕРЕД ЗАПУСКОМ замініть:
--   <PROJECT_REF>  — ref вашого проєкту Supabase (є в URL панелі)
--   <HOOK_SECRET>  — той самий рядок, що в секреті HOOK_SECRET
--                    Edge Function (будь-який довгий випадковий)
-- --------------------------------------

-- розширення для HTTP-запитів з бази
create extension if not exists pg_net with schema extensions;


create or replace function public.notify_telegram_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin

    perform net.http_post(
        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/telegram-order-bot',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'x-hook-secret', '<HOOK_SECRET>'
        ),
        body    := jsonb_build_object(
            'type',   'INSERT',
            'table',  'orders',
            'record', to_jsonb(new)
        )
    );

    return new;

end;
$$;


drop trigger if exists trg_notify_telegram_new_order on public.orders;

create trigger trg_notify_telegram_new_order
    after insert on public.orders
    for each row
    execute function public.notify_telegram_new_order();


-- --------------------------------------
-- 3. Перевірка
-- --------------------------------------

-- Створить тестове замовлення — у Telegram має прийти картка.
-- Після перевірки рядок можна видалити.
--
-- insert into public.orders (order_number, status, items, subtotal, total, first_name, phone)
-- values ('TEST-001', 'new',
--         '[{"title":"Тестова сумка","brand":"Bagvero","price":1200,"qty":1,"color":"Чорний","size":"M"}]'::jsonb,
--         1200, 1200, 'Тест', '+380737288291');

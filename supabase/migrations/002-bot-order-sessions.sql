-- ======================================
-- Замовлення прямо в боті: чернетка замовлення
--
-- Виконати один раз у Supabase → SQL Editor.
-- Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- Чернетка замовлення на час діалогу
--
-- Навіщо окрема таблиця: між натисканнями кнопок бот має пам'ятати,
-- який товар, колір, розмір і кількість обрав клієнт. У самій кнопці
-- це не збережеш — Telegram обмежує callback_data 64 байтами, туди
-- не влізе навіть місто. Тримати в пам'яті функції теж не можна:
-- Edge Function живе кілька секунд і між запитами не зберігається.
--
-- Один чат = одна чернетка. Почав нове замовлення — попередня
-- перезаписується (ON CONFLICT нижче в коді бота).
-- --------------------------------------

create table if not exists public.bot_sessions (

    chat_id         bigint primary key,

    -- на якому кроці діалог: color / size / qty / delivery /
    -- city / detail / phone / confirm
    step            text        not null default 'idle',

    product_id      integer,
    color           text,
    size            text,
    qty             integer     not null default 1,

    delivery_method text,
    delivery_price  integer     not null default 0,
    city            text,
    delivery_detail text,

    first_name      text,
    last_name       text,
    phone           text,

    updated_at      timestamptz not null default now()

);


-- Чернетки — суто службові дані бота. Пише й читає їх лише Edge
-- Function сервісним ключем, тому з клієнта доступу не має бути
-- взагалі: увімкнений RLS без жодної політики це й забезпечує.
alter table public.bot_sessions enable row level security;


-- Прибирання: чернетки, які ніхто не завершив. Без цього таблиця
-- поступово наповнюється покинутими діалогами.
create or replace function public.cleanup_bot_sessions()
returns void
language sql
security definer
set search_path = public
as $$
    delete from public.bot_sessions
    where updated_at < now() - interval '2 days';
$$;


-- --------------------------------------
-- Перевірка
-- --------------------------------------

-- select * from public.bot_sessions;
--
-- Прибрати старі чернетки вручну:
-- select public.cleanup_bot_sessions();

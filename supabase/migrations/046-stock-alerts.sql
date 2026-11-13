-- ======================================
-- «Повідомити, коли з'явиться» — підписки на наявність товару
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Товар, якого немає на складі, сайт не ховає: він стає «під
-- замовлення» (10–14 днів, передоплата). Частина людей на це не
-- погоджується й іде — і більше не повертається, бо не знає, що річ
-- знову лежить на полиці.
--
-- Тепер на сторінці товару під «Цей товар під замовлення» є поле
-- пошти. Коли саме цей колір і розмір знову в наявності, людині
-- приходить ОДИН лист (scripts/stock-alerts.js, щогодини з GitHub).
--
-- ХТО ПИШЕ Й ЧИТАЄ
--
-- Лише службовий ключ: додає Edge Function (site_action
-- "stock-alert"), читає й позначає надісланим скрипт розсилки. Для
-- сторінки таблиці не існує — RLS увімкнено без жодної політики, тож
-- чужих адрес звідси не прочитати.
--
-- БЕЗ ЦІЄЇ МІГРАЦІЇ форма на сторінці відповідає «не вдалося» (функція
-- не знайде stock_alert_add), а розсилка пише в журнал запуску «немає
-- міграції 046» і не червоніє.
-- --------------------------------------

create table if not exists public.stock_alerts (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),

    product_id  bigint      not null,

    -- Порожньо — «будь-який»: у товару без розмірів (сумка, окуляри)
    -- розміру немає, а колір буває єдиний.
    color       text        not null default '',
    size        text        not null default '',

    email       text        not null check (char_length(email) between 5 and 254),

    -- Мова листа. Порожньо = українська, як у замовленнях (міграція 044).
    lang        text        check (lang in ('en', 'ru')),

    -- Коли надіслали лист. Порожньо — ще чекає.
    notified_at timestamptz
);

-- Одна людина — одна підписка на той самий колір і розмір, поки лист
-- не пішов. Повторне натискання не плодить рядків і не дасть другого
-- листа.
create unique index if not exists stock_alerts_pending_uniq
    on public.stock_alerts (lower(email), product_id, color, size)
    where notified_at is null;

-- Скрипт розсилки щогодини бере саме ці рядки.
create index if not exists stock_alerts_pending_idx
    on public.stock_alerts (product_id)
    where notified_at is null;

alter table public.stock_alerts enable row level security;

revoke all on public.stock_alerts from anon, authenticated;

comment on table public.stock_alerts is
    'Підписки «повідомити, коли з''явиться». Пише Edge Function, читає scripts/stock-alerts.js — обидва службовим ключем.';


-- --------------------------------------
-- ДОДАТИ ПІДПИСКУ
--
-- Повертає:
--   'ok'     — додали;
--   'exists' — така підписка вже чекає (сторінка каже «вже чекаєте»,
--              а не «помилка»: людина нічого не зробила не так);
--   'limit'  — на цю адресу вже 20 підписок, що чекають.
--
-- МЕЖА НА АДРЕСУ, І ВОНА НЕ ПРО НАВАНТАЖЕННЯ. Без неї можна вписати
-- чужу пошту в сотню товарів — і магазин надсилав би незнайомій людині
-- лист за листом. Межу частоти з адреси IP ставить сама функція
-- (contact_allowed, міграція 040).
-- --------------------------------------

create or replace function public.stock_alert_add(
    p_email   text,
    p_product bigint,
    p_color   text,
    p_size    text,
    p_lang    text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_color text := left(coalesce(p_color, ''), 80);
    v_size  text := left(coalesce(p_size, ''), 40);
    v_lang  text := case when p_lang in ('en', 'ru') then p_lang end;
begin

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_product is null then
        return 'bad';
    end if;

    if exists (
        select 1 from public.stock_alerts
         where lower(email) = v_email
           and product_id = p_product
           and color = v_color
           and size = v_size
           and notified_at is null
    ) then
        return 'exists';
    end if;

    if (select count(*) from public.stock_alerts
         where lower(email) = v_email and notified_at is null) >= 20 then
        return 'limit';
    end if;

    insert into public.stock_alerts (product_id, color, size, email, lang)
    values (p_product, v_color, v_size, v_email, v_lang)
    on conflict do nothing;

    return 'ok';

end;
$$;

revoke execute on function public.stock_alert_add(text, bigint, text, text, text)
    from public, anon, authenticated;

grant execute on function public.stock_alert_add(text, bigint, text, text, text)
    to service_role;


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select public.stock_alert_add('test@example.com', 1, 'Чорний', '', null);  -- ok
--   select public.stock_alert_add('test@example.com', 1, 'Чорний', '', null);  -- exists
--
--   select product_id, color, size, count(*) from public.stock_alerts
--    where notified_at is null group by 1, 2, 3 order by 4 desc;
--
-- Прибрати тестові рядки:
--   delete from public.stock_alerts where email = 'test@example.com';
-- --------------------------------------

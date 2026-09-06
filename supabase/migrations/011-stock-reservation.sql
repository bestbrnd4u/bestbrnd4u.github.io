-- ======================================
-- Останній екземпляр не продається двічі
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- Плейсхолдерів тут немає — нічого замінювати не треба.
-- ======================================


-- --------------------------------------
-- ЩО БУЛО НЕ ТАК
--
-- Залишки лежать у репозиторії, а списує їх крок за розкладом — раз
-- на десять хвилин. Тобто рівно десять хвилин після продажу останньої
-- сумки сайт і далі показував її як «в наявності». Двоє покупців у
-- цьому вікні отримували однакове підтвердження на один товар, і
-- дізнавались про це вже дзвінком.
--
-- ЧОМУ ЦЕ НЕ ЛІКУЄТЬСЯ ЧАСТІШИМ КРОНОМ
--
-- Хоч щохвилини — вікно лишається, просто вужче. Гонка тут не в
-- періодичності, а в тому, що перевірка наявності й створення
-- замовлення відбувались у різних місцях і в різний час.
--
-- ЯК ВИРІШЕНО
--
-- Перевірка переїхала в саму базу — у мить створення замовлення, в
-- одній транзакції з ним. Друге замовлення на ту саму одиницю чекає
-- на першому (блокування рядка залишку), бачить його і позначає свій
-- рядок як «під замовлення».
--
-- ЧОМУ ПОЗНАЧАЄМО, А НЕ ВІДМОВЛЯЄМО
--
-- Магазин і так торгує під замовлення — це нормальний стан товару, а
-- не помилка. Відмовити означало б втратити продаж там, де достатньо
-- чесно сказати: «цей поїде пізніше». Власник бачить позначку одразу
-- в Telegram і домовляється з покупцем.
--
-- ЩО ЗАЛИШАЄТЬСЯ ЗА КРОНОМ
--
-- Списання в репозиторій — там залишки редагує адмінка, звідти їх
-- бере збірка сайту. База лише не дає двом замовленням зайняти одну
-- одиницю; хто саме її зайняв і скільки лишилось на полиці —
-- по-старому вирішує scripts/apply-order-stock.js.
-- --------------------------------------


-- --------------------------------------
-- 1. Дзеркало залишків
--
-- Не джерело правди, а знімок: його перезаписує scripts/push-stock.js
-- з тих самих файлів, які редагує адмінка. Клієнт цю таблицю не
-- бачить взагалі (політик немає — отже доступ лише службовому ключу):
-- сайт показує наявність із зібраного products.json, як і раніше.
--
-- Ключ — рівно те, що приходить у замовленні: id товару, назва
-- кольору й розмір у тому вигляді, у якому їх бачить сайт.
-- --------------------------------------

create table if not exists public.stock (
    product_id bigint      not null,
    color      text        not null default '',
    size       text        not null default '',
    qty        integer     not null default 0,
    updated_at timestamptz not null default now(),
    primary key (product_id, color, size)
);

alter table public.stock enable row level security;

-- Політик навмисно немає: анонім і авторизований користувач не мають
-- ні читати, ні писати. Службовий ключ RLS обходить.


-- --------------------------------------
-- 2. Скільки одиниць уже зайнято замовленнями
--
-- Рахуємо так само, як scripts/apply-order-stock.js: беремо
-- замовлення, які ще не списані в репозиторій (stock_applied = false),
-- не скасовані й зроблені після появи залишків.
--
-- ⚠ ДАТА МУСИТЬ ЗБІГАТИСЯ з STOCK_SINCE у scripts/apply-order-stock.js.
-- Розійдуться — база й крон рахуватимуть різні набори замовлень, і
-- залишок «поїде» в один бік. За збігом стежить tests/test-oversell.js.
-- --------------------------------------

create or replace function public.stock_reserved(
    p_id    bigint,
    p_color text,
    p_size  text
)
returns integer
language sql
stable
as $$
    select coalesce(sum(greatest(coalesce((i->>'qty')::int, 1), 1)), 0)::int
    from public.orders o
    cross join lateral jsonb_array_elements(
        case jsonb_typeof(o.items) when 'array' then o.items else '[]'::jsonb end
    ) as i
    where o.stock_applied = false
      and coalesce(o.status, 'new') <> 'cancelled'
      and o.created_at >= timestamptz '2026-09-05T17:35:47Z'
      and (i->>'id') = p_id::text
      and coalesce(i->>'color', '') = p_color
      and coalesce(i->>'size', '')  = p_size;
$$;


-- --------------------------------------
-- 3. Позначка «залишку вже немає» в мить створення замовлення
--
-- Тут і вирішується гонка. Ключовий рядок — «for update»: він блокує
-- рядок залишку, і друге замовлення на ту саму одиницю чекає, поки
-- перше завершиться. Дочекавшись, воно вже бачить його в підрахунку.
--
-- Без блокування обидві транзакції прочитали б «лишилась 1» одночасно
-- і обидві вважали б товар наявним — саме те, що ми лікуємо.
--
-- Товар без залишків (порожня клітинка в адмінці) рядка в таблиці не
-- має: нічого не обіцяли — нічого й не перевіряємо.
-- --------------------------------------

create or replace function public.orders_flag_stock_shortfall()
returns trigger
language plpgsql
as $$
declare
    v_items jsonb := case jsonb_typeof(new.items) when 'array' then new.items else '[]'::jsonb end;
    v_out   jsonb := '[]'::jsonb;
    v_item  jsonb;
    v_id    bigint;
    v_color text;
    v_size  text;
    v_qty   integer;
    v_have  integer;
begin

    for v_item in select value from jsonb_array_elements(v_items) loop

        -- Через регулярку, а не прямим ::bigint.
        --
        -- Один товар із нечисловим id завалив би приведення типу — а
        -- разом із ним і вставку замовлення. Тобто захист від
        -- подвійного продажу зупинив би продажі взагалі.
        v_id := case
            when coalesce(v_item->>'id', '') ~ '^[0-9]{1,18}$'
            then (v_item->>'id')::bigint
        end;

        v_color := coalesce(v_item->>'color', '');
        v_size  := coalesce(v_item->>'size', '');
        v_qty   := greatest(coalesce((v_item->>'qty')::int, 1), 1);

        if v_id is null then
            v_out := v_out || jsonb_build_array(v_item);
            continue;
        end if;

        select qty into v_have
        from public.stock
        where product_id = v_id and color = v_color and size = v_size
        for update;

        if not found then
            v_out := v_out || jsonb_build_array(v_item);
            continue;
        end if;

        if v_have - public.stock_reserved(v_id, v_color, v_size) < v_qty then
            v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('stockShort', true));
        else
            v_out := v_out || jsonb_build_array(v_item);
        end if;

    end loop;

    new.items := v_out;

    return new;

exception

    -- ЗАМОВЛЕННЯ ВАЖЛИВІШЕ ЗА ПОЗНАЧКУ.
    --
    -- Цей тригер стоїть на шляху КОЖНОГО замовлення — і з сайту, і з
    -- бота. Будь-яка несподіванка тут (дивні дані в кошику, зміна
    -- схеми, помилка в самій функції) без цього блоку означала б, що
    -- магазин перестає приймати замовлення взагалі.
    --
    -- Тому падаємо тихо: замовлення проходить, просто без позначки.
    -- Втратити попередження — неприємно; втратити продажі — інша
    -- категорія подій.
    when others then

        raise warning 'orders_flag_stock_shortfall: %', sqlerrm;

        return new;

end;
$$;

drop trigger if exists orders_flag_stock_shortfall on public.orders;

create trigger orders_flag_stock_shortfall
    before insert on public.orders
    for each row
    execute function public.orders_flag_stock_shortfall();


-- --------------------------------------
-- 4. Індекс під підрахунок
--
-- stock_reserved() перебирає незакриті замовлення на КОЖЕН рядок
-- кошика. Їх завжди небагато (десятки), але часткового індексу
-- достатньо, щоб це лишалось так і за рік.
-- --------------------------------------

create index if not exists orders_stock_pending_idx
    on public.orders (created_at)
    where stock_applied = false;


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ РУКАМИ
--
--   -- скільки лишилось конкретної одиниці
--   select qty, public.stock_reserved(1, 'Темно-сірий', 'ONESIZE') as reserved
--   from public.stock
--   where product_id = 1 and color = 'Темно-сірий' and size = 'ONESIZE';
--
--   -- останні замовлення з позначкою
--   select order_number, created_at,
--          jsonb_path_query_array(items, '$[*] ? (@.stockShort == true).title')
--   from public.orders
--   where items @> '[{"stockShort": true}]'
--   order by created_at desc
--   limit 20;
-- --------------------------------------

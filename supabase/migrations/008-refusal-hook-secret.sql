-- ======================================
-- Сповіщення про відмову: адреса й секрет із робочого тригера
--
-- Виконати один раз у Supabase → SQL Editor, ПІСЛЯ міграції 007.
-- Повторний запуск безпечний.
--
-- ЗАМІНЮВАТИ РУКАМИ НІЧОГО НЕ ТРЕБА. На відміну від 001, 005 і 007,
-- цей файл не містить плейсхолдерів узагалі: він бере і адресу, і
-- секрет із notify_telegram_new_order — тригера, який справно шле
-- повідомлення про замовлення, — і збирає з ними функцію відмови.
--
-- Значення нікуди не друкуються й не виходять за межі бази.
-- ======================================


-- --------------------------------------
-- Дві помилки, які сюди привели
--
-- 1. У тригері відмов замінили <PROJECT_REF>, а <HOOK_SECRET> — ні.
--    Обидві міграції, 005 і 007, заміняють функцію ЦІЛКОМ, тож
--    незамінений плейсхолдер переживає будь-який повторний запуск.
--
-- 2. Перевірка в 007 шукала плейсхолдер надто грубо — «чи є десь
--    символ <». Секрет цього проєкту таку дужку містить, тож перевірка
--    спрацьовувала б і на правильно підставленому значенні: заявка
--    записується, а сповіщення не йде, і в логу лежить порада
--    замінити те, що вже замінено.
--
--    Тепер шукається сам токен — '<HOOK_SECRET>', а не окремий символ.
--
-- ЧОМУ КОПІЮЄМО, А НЕ ПРОСИМО ВПИСАТИ
--
-- Секрет живе у змінних оточення Edge Function, а там його після
-- створення вже не подивишся. Зате він є в тілі сусідньої функції —
-- беремо звідти й нікому не показуємо.
-- --------------------------------------

do $do$
declare

    -- Тіло функції з двома мітками замість значень. Підставляємо в них
    -- те, що прочитали з робочого тригера, і виконуємо.
    --
    -- Логіка та сама, що в 007: підрахунок статусу й два незалежні
    -- блоки з перехопленням помилок, щоб збій сповіщення не відкочував
    -- саму заявку.
    template text := $tpl$

create or replace function public.notify_telegram_refusal()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
    ord      public.orders;
    total    int;
    refused  int;
    legacy   boolean;
    full_ref boolean;
begin

    -- Позначка на замовленні й статус.
    begin

        select * into ord from public.orders where id = new.order_id;

        total := coalesce(jsonb_array_length(ord.items), 0);

        -- Заявки, створені до міграції 006, переліку не мають. Тоді
        -- вони означали відмову від усього замовлення — так їх і
        -- читаємо, щоб стара заявка не почала означати щось інше.
        select bool_or(r.items is null or jsonb_array_length(r.items) = 0)
          into legacy
          from public.order_refusals r
         where r.order_id = new.order_id;

        -- Скільки РІЗНИХ позицій відмовлено за всіма заявками разом.
        select count(distinct
                   coalesce(i->>'title', '') || '|' ||
                   coalesce(i->>'color', '') || '|' ||
                   coalesce(i->>'size',  '')
               )
          into refused
          from public.order_refusals r
          cross join lateral jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) i
         where r.order_id = new.order_id;

        full_ref := coalesce(legacy, false) or total = 0 or refused >= total;

        update public.orders
           set refusal_requested_at = now(),
               status = case
                            when full_ref and status <> 'completed' then 'cancelled'
                            else status
                        end
         where id = new.order_id
        returning * into ord;

    exception
        when others then
            -- Позначки не буде — заявка буде. Кабінет читає саме
            -- order_refusals, тож покупець побачить правильний стан.
            raise warning 'Відмова %: позначку на замовленні % не поставлено (%)',
                new.id, new.order_id, sqlerrm;

            select * into ord from public.orders where id = new.order_id;
    end;

    -- Сповіщення в Telegram.
    declare
        hook_url    text := '@@URL@@';
        hook_secret text := '@@SECRET@@';
    begin

        -- Шукаємо САМ ТОКЕН, а не символ '<': робочий секрет цілком
        -- може містити кутову дужку, і груба перевірка глушила б
        -- сповіщення на правильному значенні.
        --
        -- Перевірка потрібна, бо незамінений плейсхолдер сам по собі
        -- помилки не дає: pg_net не перевіряє адресу при виклику, а
        -- лише кладе запит у чергу — і той тихо не доходить.
        if hook_url like '%<PROJECT_REF>%' or hook_secret like '%<HOOK_SECRET>%' then

            raise warning 'Відмова %: у тригері лишився плейсхолдер, сповіщення не піде', new.id;

        else

            perform net.http_post(
                url     := hook_url,
                headers := jsonb_build_object(
                    'Content-Type',  'application/json',
                    'x-hook-secret', hook_secret
                ),
                body    := jsonb_build_object(
                    'type',   'INSERT',
                    'table',  'order_refusals',
                    'record', jsonb_build_object(
                        'id',       new.id,
                        'note',     new.note,
                        'items',    new.items,
                        'order_id', new.order_id
                    ),
                    'order',  to_jsonb(ord)
                )
            );

        end if;

    exception
        when others then
            -- Сюди потрапляє відсутній pg_net і все інше несподіване.
            -- Коштує це лише повідомлення: заявка вже в базі.
            raise warning 'Відмова %: сповіщення в Telegram не пішло (%)', new.id, sqlerrm;
    end;

    return new;

end;
$fn$;

$tpl$;

    src_def     text;
    hook_url    text;
    hook_secret text;

begin

    select pg_get_functiondef(p.oid)
      into src_def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'notify_telegram_new_order';

    if src_def is null then
        raise exception
            'Немає функції notify_telegram_new_order — спершу застосуйте міграцію 001.';
    end if;

    hook_url := substring(src_def from $re$url\s*:=\s*'([^']+)'$re$);

    -- Секрет забираємо в ТОМУ Ж ЕКРАНОВАНОМУ вигляді, у якому він
    -- записаний у тілі функції: так він і піде назад між лапками, хоч
    -- би які символи в ньому були.
    hook_secret := substring(src_def from $re$'x-hook-secret'\s*,\s*'((?:[^']|'')*)'$re$);

    if hook_url is null or hook_secret is null then
        raise exception
            'Не вдалось прочитати адресу чи секрет із notify_telegram_new_order — підставте їх у 007 вручну.';
    end if;

    if hook_url like '%<PROJECT_REF>%' or hook_secret like '%<HOOK_SECRET>%' then
        raise exception
            'У notify_telegram_new_order самі плейсхолдери — спершу налагодьте сповіщення про замовлення (міграція 001).';
    end if;

    execute replace(replace(template, '@@URL@@', hook_url), '@@SECRET@@', hook_secret);

    raise notice 'Функцію notify_telegram_refusal зібрано з адресою й секретом тригера замовлень.';

end
$do$;


-- Тригер лишається тим самим — функція підмінилась на місці. Рядок
-- нижче на випадок, якщо його взагалі не створювали.
drop trigger if exists trg_notify_telegram_refusal on public.order_refusals;

create trigger trg_notify_telegram_refusal
    after insert on public.order_refusals
    for each row
    execute function public.notify_telegram_refusal();


-- --------------------------------------
-- Перевірка
--
-- Йде останнім кроком і НЕ закоментована навмисно: SQL Editor не
-- показує notice, тож єдине, що ви побачите від do-блока, — «Success.
-- No rows returned». Це успіх, але побачити хочеться результат, а не
-- відсутність помилки. Тому міграція закінчується таблицею.
--
-- Обидва рядки мусять показати ту саму адресу без <PROJECT_REF> і
-- false у третій колонці. Після цього зробіть тестову відмову.
--
-- ЧОМУ ПЕРЕВІРКА ШУКАЄ ЛАПКИ
--
-- Спершу тут стояло просто like '%<HOOK_SECRET>%' — і воно давало
-- хибну тривогу: у тілі функції цей токен тепер згадується ще й у
-- САМІЙ перевірці на плейсхолдер (hook_secret like '%<HOOK_SECRET>%').
-- Запит не відрізняв підставлене значення від згадки про нього.
--
-- Тому шукаємо токен саме як значення — узятим у лапки. У рядку
-- перевірки він оточений відсотками, тож під шаблон не підпадає.
-- --------------------------------------

select p.proname                                                    as функція,
       substring(pg_get_functiondef(p.oid) from 'https://[^'']+')   as адреса,
       pg_get_functiondef(p.oid) like '%''<HOOK_SECRET>''%'         as секрет_не_замінено
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'notify_telegram%'
order by p.proname;

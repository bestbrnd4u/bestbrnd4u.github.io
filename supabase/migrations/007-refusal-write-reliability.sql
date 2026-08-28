-- ======================================
-- Відмова мусить записатись — навіть коли сповіщення не йде
--
-- Виконати один раз у Supabase → SQL Editor.
-- Повторний запуск безпечний.
--
-- ПЕРЕД ЗАПУСКОМ замініть <PROJECT_REF> і <HOOK_SECRET> — так само, як
-- у міграціях 001 і 005. Це головна пастка цього файлу: він ЗАМІНЯЄ
-- функцію сповіщення цілком, тож незамінений плейсхолдер затирає
-- робочу адресу неробочою.
--
-- НА ЦІЙ ПАСТЦІ ми й підсковзнулись: <PROJECT_REF> замінили,
-- <HOOK_SECRET> — ні. Тому далі йде міграція 008: вона збирає цю ж
-- функцію, беручи адресу й секрет із тригера замовлень, і замінювати
-- в ній руками нічого не треба. Права з другої половини цього файлу
-- 008 не чіпає — тож застосовувати треба обидві, спершу 007.
--
-- Якщо запускаєте 007 повторно — одразу після неї виконайте 008,
-- інакше плейсхолдери повернуться.
-- ======================================


-- --------------------------------------
-- Що сталось у бою
--
-- Замовлення 8126866876. Покупець натиснув «Відмова», лист магазину
-- прийшов, кабінет показав «менеджер зв'яжеться». У базі при цьому:
--
--     order_refusals            — жодного рядка
--     orders.refusal_requested_at — порожньо
--     Telegram                  — тиша
--
-- Тобто INSERT відхилили. Лист пішов лише тому, що він іде окремим
-- каналом (FormSubmit) і бази не питає — саме на такий випадок.
--
-- Наслідок бачив покупець: кабінет про заявку не знає, після
-- оновлення сторінки кнопка «Відмова» на місці, вікно пропонує
-- відмовитись від того самого товару вдруге. Магазин отримує два
-- листи й читає їх як два різні повернення.
--
-- Відхилити INSERT могло рівно дві речі, і ця міграція прибирає
-- обидві, не з'ясовуючи, яка саме спрацювала:
--
--   1. ТРИГЕР. Він виконується в тій самій транзакції, що й вставка.
--      Будь-яка помилка всередині — і рядок відкочується разом з нею.
--      Тобто збій СПОВІЩЕННЯ знищував саму ЗАЯВКУ. Це неправильно в
--      принципі: заявка покупця цінніша за повідомлення в месенджер.
--
--   2. ПРАВА. Немає політики на insert або гранту для authenticated —
--      база мовчки відповідає «row-level security» і теж нічого не
--      пише. Політики нижче перестворюються, тож розбіжність
--      виправляється сама.
-- --------------------------------------


-- pg_net без вказівки схеми: розширення саме створює схему net, і
-- спроба покласти його кудись інде закінчується помилкою.
create extension if not exists pg_net;


-- --------------------------------------
-- 1. Сповіщення більше не може скасувати заявку
--
-- Тіло тригера розбите на два незалежні блоки з перехопленням
-- помилок. Що б не впало — позначка на замовленні чи запит у
-- Telegram, — рядок у order_refusals лишається на місці, а причина
-- падіння йде в лог бази (raise warning), а не в тишу.
--
-- Логіка підрахунку та сама, що в міграції 006, і навмисно не
-- змінена: часткова відмова замовлення не скасовує, доставлене не
-- «скасовується», а повертається.
-- --------------------------------------

create or replace function public.notify_telegram_refusal()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
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
        -- читаємо, щоб стара заявка не почала раптом означати інше.
        select bool_or(r.items is null or jsonb_array_length(r.items) = 0)
          into legacy
          from public.order_refusals r
         where r.order_id = new.order_id;

        -- Скільки РІЗНИХ позицій відмовлено за всіма заявками разом.
        -- Ключ — назва + колір + розмір: номер у списку прив'язаний до
        -- порядку, а він може змінитись.
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
            -- order_refusals, тож покупець побачить правильний стан
            -- навіть без неї.
            raise warning 'Відмова %: позначку на замовленні % не поставлено (%)',
                new.id, new.order_id, sqlerrm;

            select * into ord from public.orders where id = new.order_id;
    end;

    -- Сповіщення в Telegram.
    declare
        hook_url    text := 'https://<PROJECT_REF>.supabase.co/functions/v1/telegram-order-bot';
        hook_secret text := '<HOOK_SECRET>';
    begin

        -- Незамінений плейсхолдер сам по собі помилки не дає: pg_net
        -- не перевіряє адресу під час виклику, а лише кладе запит у
        -- чергу — і той тихо не доходить. Тобто найімовірніша поломка
        -- цього файлу була б і найнепомітнішою. Тому перевіряємо самі
        -- й кажемо про це в лог.
        --
        -- Шукаємо САМ ТОКЕН, а не символ '<'. Спершу тут стояло
        -- like '%<%' — і воно спрацьовувало на правильному секреті, у
        -- якому просто трапилась кутова дужка: заявка записується,
        -- сповіщення мовчить, а в логу порада замінити те, що вже
        -- замінено. Перевірка, яка бреше, гірша за її відсутність.
        if hook_url like '%<PROJECT_REF>%' or hook_secret like '%<HOOK_SECRET>%' then

            raise warning 'Відмова %: у тригері лишився плейсхолдер, сповіщення не піде',
                new.id;

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
            -- Раніше це коштувало заявки; тепер коштує лише
            -- повідомлення, а заявка лишається в базі й видна і в
            -- кабінеті, і в списку замовлень.
            raise warning 'Відмова %: сповіщення в Telegram не пішло (%)',
                new.id, sqlerrm;
    end;

    return new;

end;
$$;


-- Тригер лишається тим самим — функція підмінилась на місці. Рядок
-- нижче на випадок, якщо його взагалі не створювали: без тригера
-- заявки пишуться, але магазин про них не дізнається.
drop trigger if exists trg_notify_telegram_refusal on public.order_refusals;

create trigger trg_notify_telegram_refusal
    after insert on public.order_refusals
    for each row
    execute function public.notify_telegram_refusal();


-- --------------------------------------
-- 2. Права на заявку
--
-- Перестворюємо те саме, що в міграції 005. Якщо там усе гаразд —
-- нічого не зміниться; якщо політики чи гранта немає, саме тут
-- ховається «row-level security» у відповіді на INSERT.
--
-- Оновлювати й видаляти заявки клієнту не даємо: подати — так,
-- переписати заднім числом — ні.
-- --------------------------------------

alter table public.order_refusals enable row level security;

grant select, insert on public.order_refusals to authenticated;


-- Клієнт може створити заявку ЛИШЕ на власне замовлення.
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


-- Бачити свої заявки — на цьому тримається «Заявку вже надіслано» в
-- кабінеті й неможливість відмовитись від того самого товару вдруге.
drop policy if exists "refusals_select_own" on public.order_refusals;

create policy "refusals_select_own"
    on public.order_refusals
    for select
    to authenticated
    using (user_id = auth.uid());


-- --------------------------------------
-- Перевірка
--
-- Не закоментована навмисно: SQL Editor не показує notice, тож від
-- самої міграції ви побачите лише «Success». Хай останнім кроком буде
-- таблиця, у якій видно результат.
--
-- Так має бути після 007 і 008:
--
--   політик_на_вставку  1
--   політик_на_читання  1
--   право_на_вставку    1
--   тригерів            1
--   pg_net              1
--   секрет_не_замінено  false
--
-- Нуль у будь-якому числі — саме там і ламалось: без політики чи
-- гранта INSERT відхиляла RLS, без тригера заявки писались мовчки,
-- без pg_net сповіщенню не було чим піти.
--
-- ЧОМУ ОСТАННЯ ПЕРЕВІРКА ШУКАЄ ЛАПКИ. Токен <HOOK_SECRET> тепер
-- згадується в тілі функції ще й у САМІЙ перевірці на плейсхолдер, і
-- простий пошук підрядка не відрізняв би підставлене значення від
-- згадки про нього. Тому шукаємо токен як значення — у лапках.
-- --------------------------------------

select
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'order_refusals'
        and cmd in ('INSERT', 'ALL'))                                as політик_на_вставку,
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'order_refusals'
        and cmd in ('SELECT', 'ALL'))                                as політик_на_читання,
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'order_refusals'
        and grantee = 'authenticated' and privilege_type = 'INSERT') as право_на_вставку,
    (select count(*) from pg_trigger
      where tgrelid = 'public.order_refusals'::regclass
        and not tgisinternal)                                        as тригерів,
    (select count(*) from pg_extension where extname = 'pg_net')     as pg_net,
    (select pg_get_functiondef(p.oid) like '%''<HOOK_SECRET>''%'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'notify_telegram_refusal')                   as секрет_не_замінено;

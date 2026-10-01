-- ======================================
-- Зворотний дзвінок, який нікуди не дійшов — і про це видно
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- У лівому нижньому кутку сайту зʼявилась кнопка «Замовити дзвінок».
-- Людина лишає номер, функція надсилає його власнику в Telegram.
--
-- Якщо Telegram відмовив — бот заблокований, токен протух, API
-- недоступний, — то НІХТО не дізнається про це сам:
--
--   людина бачить «не вдалось відправити» й іде;
--   власник не бачить нічого, бо повідомлення й не прийшло.
--
-- Тобто кнопка мовчки перестає працювати, а виглядає цілою. Це та
-- сама пастка, що з підпискою: форма є, ключ недійсний, листів
-- немає, і виявляється це через тижні.
--
-- Тому відмову Telegram пишемо в site_issues, і вона приходить у
-- щоденному звіті — як ПОЛОМКА, не як новина: людина чекає дзвінка,
-- якого не буде.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Додає до переліку різновидів report_issue ще один: call_back.
-- Решта функції не змінюється.
-- --------------------------------------

create or replace function public.report_issue(
    p_kind    text,
    p_page    text,
    p_message text,
    p_source  text default '',
    p_agent   text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_kind        text;
    v_page        text;
    v_message     text;
    v_fingerprint text;
    v_recent      integer;
begin

    v_kind := lower(coalesce(p_kind, ''));

    -- ЩО ЗМІНИЛОСЬ проти міграції 028: додано call_back.
    --
    --   js_error       — помилка в браузері покупця
    --   not_found      — відкрито сторінку, якої немає
    --   meta_capi      — Meta не прийняла серверну конверсію
    --   stock_out      — замовлення забрало останню одиницю
    --   mail_list      — MailerLite відмовився прийняти підписку
    --   search_miss    — пошук не знайшов жодного товару
    --   np_directory   — Нова пошта відмовила в пошуку адреси
    --   turnstile_skip — замовлення пішло повз перевірку «ви людина»
    --   call_back      — Telegram не прийняв замовлення дзвінка
    --
    -- Чужі різновиди й далі не приймаємо: функцію може викликати
    -- будь-який відвідувач, і без переліку таблиця стала б відкритим
    -- сховищем.
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss', 'np_directory',
                      'turnstile_skip', 'call_back') then
        return;
    end if;

    v_page    := left(coalesce(p_page, ''), 300);
    v_message := left(coalesce(p_message, ''), 500);

    if v_message = '' then
        return;
    end if;

    v_fingerprint := v_kind || '|' || v_page || '|' || v_message;

    -- Спершу лічильник: якщо така подія вже відома, стеля нових
    -- записів до неї не стосується.
    update public.site_issues
       set hits      = hits + 1,
           last_seen = now()
     where fingerprint = v_fingerprint;

    if found then
        return;
    end if;

    select count(*) into v_recent
      from public.site_issues
     where first_seen > now() - interval '1 hour';

    if v_recent >= 200 then
        return;
    end if;

    insert into public.site_issues (kind, page, message, source, agent, fingerprint)
    values (v_kind, v_page, v_message, left(coalesce(p_source, ''), 300),
            left(coalesce(p_agent, ''), 300), v_fingerprint)
    on conflict (fingerprint) do update
        set hits      = public.site_issues.hits + 1,
            last_seen = now();

exception when others then

    -- Журнал не має права ламати те, що його покликало. Не
    -- записалось — значить не записалось.
    raise warning 'report_issue: %', sqlerrm;

end;
$$;

grant execute on function public.report_issue(text, text, text, text, text)
    to anon, authenticated;


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select public.report_issue('call_back', 'edge-function',
--                              'Telegram не прийняв замовлення дзвінка');
--
--   select message, hits, last_seen
--     from public.site_issues
--    where kind = 'call_back';
--
-- Прибрати тестовий рядок:
--
--   delete from public.site_issues
--    where kind = 'call_back' and hits = 1;
--
-- ЩО РОБИТИ, ЯКЩО ТАКІ РЯДКИ З'ЯВИЛИСЬ. Це означає, що людям, які
-- лишали номер, ніхто не передзвонив і не передзвонить — у вас
-- просто немає їхніх номерів. Перевірте бота: чи живий токен
-- (TELEGRAM_BOT_TOKEN) і чи не заблокували ви його самі.
-- --------------------------------------

-- ======================================
-- Журнал знає більше різновидів подій
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- У міграції 013 функція report_issue приймала рівно два різновиди:
--
--   if v_kind not in ('js_error', 'not_found') then
--       return;
--   end if;
--
-- Це правильна обережність: журнал мусить лишатись журналом, а не
-- вільною таблицею, куди будь-хто пише будь-що. Але з того часу
-- з'явились два джерела, яким теж треба щось сказати власнику, — і
-- обидва мовчки відкидались.
--
-- 1. meta_capi — СЕРВЕРНІ КОНВЕРСІЇ META.
--
--    Це моя помилка, і вона з найгіршого сорту. У функції стоїть
--    reportServerIssue("meta_capi", …) саме на випадок, коли Meta
--    відмовилась прийняти покупку. Коментар там пояснює, чому:
--    «тихий збій тут найгірший — реклама далі оптимізується за
--    половиною покупок, і дізнатись про це нізвідки».
--
--    А сам запис нікуди не потрапляв: різновид не в переліку, функція
--    просто виходила. Тобто запобіжник проти тихого збою сам працював
--    тихо.
--
-- 2. stock_out — ТОВАР ЗАКІНЧИВСЯ.
--
--    Залишки списуються самі (apply-stock.yml), і коли замовлення
--    забирає останню одиницю, товар на сайті стає «під замовлення».
--    Власник про це не дізнавався ніяк — тільки якщо сам відкрив
--    адмінку.
-- --------------------------------------


-- --------------------------------------
-- ЧОМУ ПЕРЕЛІК, А НЕ «ПРИЙМАЄМО ВСЕ»
--
-- Спокуса зняти перевірку зовсім — і саме її треба не піддатись.
-- Функцію може викликати будь-який відвідувач (вона granted to anon),
-- бо про помилку в браузері має розповісти сам браузер. Без переліку
-- таблиця стала б відкритим сховищем: пиши що хочеш і скільки хочеш,
-- у межах стелі 200 записів на годину.
--
-- Тому додаємо рівно два різновиди й лишаємо перевірку на місці.
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

    -- ЩО ЗМІНИЛОСЬ: до переліку додано meta_capi і stock_out.
    --
    --   js_error   — помилка в браузері покупця
    --   not_found  — відкрито сторінку, якої немає
    --   meta_capi  — Meta не прийняла серверну конверсію
    --   stock_out  — замовлення забрало останню одиницю
    --
    -- Чужі різновиди й далі не приймаємо: функцію може викликати
    -- будь-який відвідувач, і без переліку таблиця стала б відкритим
    -- сховищем.
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out') then
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
    --
    -- ВАЖЛИВО ПРО stock_out. Повторна поява того самого відбитка лише
    -- збільшує hits і НЕ знімає позначку notified — тобто про неї не
    -- напишуть удруге. Для помилки в браузері це правильно (одну й ту
    -- саму не варто нагадувати щодня), а для залишків було б хибно:
    -- товар може закінчитись, доїхати й закінчитись знову, і це дві
    -- різні події.
    --
    -- Тому scripts/report-stock.js кладе В ТЕКСТ номер замовлення —
    -- відбиток різний, і кожне «закінчився» доходить окремо.
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
--   select public.report_issue('stock_out', 'test', 'перевірка');
--   select kind, message from public.site_issues where kind = 'stock_out';
--
-- Має з'явитись рядок. Приберіть його після перевірки:
--
--   delete from public.site_issues where page = 'test';
--
-- А ось цього рядка не має з'явитись — різновид не в переліку:
--
--   select public.report_issue('щось своє', 'test', 'перевірка');
-- --------------------------------------

-- ======================================
-- Нова пошта відмовила — і про це видно
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Довідник Нової пошти (пошук міста й відділення на оформленні)
-- може відмовити з причин, яких із сайту не видно: ключ
-- прострочений, вичерпано ліміт запитів, НП змінила відповідь,
-- поламався сам запит.
--
-- Функція вже писала причину в журнал Supabase:
--
--     console.error("Нова пошта відмовила:", failure)
--
-- Але журнал Edge Functions ніхто не читає щодня, і саме так це й
-- сталось: покупець не міг знайти поштомат за номером, а причина
-- лежала в журналі. Зовні виглядало як «пошук не працює».
--
-- Тепер причина йде в site_issues і приходить у щоденному звіті
-- разом з іншими подіями — тобто про неї дізнаються НА ДРУГИЙ
-- ДЕНЬ, а не через скаргу покупця.
--
-- ЧОМУ ЦЕ ВАЖЛИВІШЕ ЗА ІНШІ РІЗНОВИДИ. Решта (js_error,
-- search_miss) — про незручності. Відмова довідника — це
-- напівзламане оформлення замовлення: номер відділення можна
-- вписати руками, але половина покупців цього не зробить.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Додає до переліку різновидів report_issue ще один:
-- np_directory. Решта функції не змінюється.
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

    -- ЩО ЗМІНИЛОСЬ проти міграції 021: додано np_directory.
    --
    --   js_error    — помилка в браузері покупця
    --   not_found   — відкрито сторінку, якої немає
    --   meta_capi   — Meta не прийняла серверну конверсію
    --   stock_out   — замовлення забрало останню одиницю
    --   mail_list   — MailerLite відмовився прийняти підписку
    --   search_miss  — пошук не знайшов жодного товару
    --   np_directory — Нова пошта відмовила в пошуку адреси
    --
    -- Чужі різновиди й далі не приймаємо: функцію може викликати
    -- будь-який відвідувач, і без переліку таблиця стала б відкритим
    -- сховищем.
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss', 'np_directory') then
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
    -- ДЛЯ ПОШУКУ Й ДЛЯ ВІДМОВ НП ЦЕ САМЕ ТЕ, ЩО ПОТРІБНО. Той самий
    -- запит (чи та сама помилка НП) від десяти різних людей — це
    -- один рядок із hits = 10, і саме hits показує, наскільки це
    -- часто. Позначка notified при цьому не знімається: у звіті
    -- подія з'явиться один раз, а далі просто зростатиме лічильник.
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
--   select public.report_issue('search_miss', '/catalog', 'сумка prada');
--
--   select message, hits, first_seen
--     from public.site_issues
--    where kind = 'search_miss'
--    order by hits desc;
--
-- Прибрати тестовий рядок:
--
--   delete from public.site_issues where message = 'сумка prada';
--
-- ЧОГО ШУКАЛИ НАЙЧАСТІШЕ Й НЕ ЗНАЙШЛИ (за все життя журналу):
--
--   select message, sum(hits) as разів
--     from public.site_issues
--    where kind = 'search_miss'
--    group by message
--    order by разів desc
--    limit 20;
-- --------------------------------------

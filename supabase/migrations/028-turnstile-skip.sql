-- ======================================
-- Замовлення повз перевірку «ви людина» — і про це видно
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Turnstile на оформленні свідомо зроблений так, що не блокує
-- продажі: віджет не з'явився — замовлення йде прямим записом у
-- базу, як магазин працював до нього. Це правильно (магазин, який
-- не продає через чужий збій, гірший за магазин без перевірки), але
-- обхід при цьому абсолютно тихий: покупець нічого не бачить,
-- консоль ніхто не читає.
--
-- ЩО СТАЛОСЬ 10.09.2026. У кабінеті Cloudflare стояло «видано 40
-- перевірок, розв'язано 0, 100% схоже на робота». З цього не можна
-- зрозуміти головного: це роботи, яких віджет і мусив відсіяти, чи
-- живі покупці, у яких він не намалювався. Різниця між «працює як
-- задумано» і «половина замовлень іде без захисту».
--
-- З'ясувалось лише вручну — в тій самій таблиці вище був один IP і
-- браузер Electron, тобто автоматика. Але щоб це побачити, треба
-- було відкрити кабінет, здогадатись подивитись на розбивку й знати,
-- що Electron — не покупець.
--
-- Тепер сторінка оформлення сама пише причину обходу в site_issues,
-- і вона приходить у щоденному звіті разом з іншими подіями. У
-- рядку є agent — рядок браузера, і саме він відрізняє автоматику
-- від живої людини.
--
-- ЧОМУ ЦЕ ВАЖЛИВО САМЕ ЗАРАЗ. Останній крок захисту (закрити прямий
-- запис у базу, docs/ЗАХИСТ-ЗАМОВЛЕНЬ.md, крок 6) робити можна лише
-- тоді, коли віджет справді працює в живих покупців. Без цього
-- журналу дізнатись це нізвідки — а помилка тут коштує геть усіх
-- замовлень.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Додає до переліку різновидів report_issue ще один:
-- turnstile_skip. Решта функції не змінюється.
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

    -- ЩО ЗМІНИЛОСЬ проти міграції 023: додано turnstile_skip.
    --
    --   js_error       — помилка в браузері покупця
    --   not_found      — відкрито сторінку, якої немає
    --   meta_capi      — Meta не прийняла серверну конверсію
    --   stock_out      — замовлення забрало останню одиницю
    --   mail_list      — MailerLite відмовився прийняти підписку
    --   search_miss    — пошук не знайшов жодного товару
    --   np_directory   — Нова пошта відмовила в пошуку адреси
    --   turnstile_skip — замовлення пішло повз перевірку «ви людина»
    --
    -- Чужі різновиди й далі не приймаємо: функцію може викликати
    -- будь-який відвідувач, і без переліку таблиця стала б відкритим
    -- сховищем.
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss', 'np_directory',
                      'turnstile_skip') then
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
    -- ДЛЯ ОБХОДУ ПЕРЕВІРКИ ЦЕ САМЕ ТЕ, ЩО ПОТРІБНО: причин усього
    -- кілька, і цінне тут не «сталось», а СКІЛЬКИ РАЗІВ. Один рядок
    -- із hits = 30 читається краще за тридцять однакових.
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
--   select public.report_issue('turnstile_skip', '/checkout',
--                              'віджет не зʼявився на сторінці');
--
--   select message, hits, agent, last_seen
--     from public.site_issues
--    where kind = 'turnstile_skip';
--
-- Прибрати тестовий рядок:
--
--   delete from public.site_issues
--    where kind = 'turnstile_skip' and hits = 1 and agent = '';
--
-- ЩО ЧИТАТИ ПОТІМ. Ключове не саме число, а браузер: Electron і
-- HeadlessChrome — це автоматика, яку віджет і мусив відсіяти;
-- Chrome, Safari й Firefox — це живі покупці, у яких перевірка не
-- намалювалась.
--
--   select agent, message, sum(hits) as разів
--     from public.site_issues
--    where kind = 'turnstile_skip'
--    group by agent, message
--    order by разів desc;
-- --------------------------------------

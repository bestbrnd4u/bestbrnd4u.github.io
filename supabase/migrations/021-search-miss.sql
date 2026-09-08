-- ======================================
-- Пошуки, які нічого не знайшли
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Магазин додає товари руками. «Що люди шукали й не знайшли» — це
-- єдине місце, де видно попит, якого асортимент не покриває, і його
-- не видно більше нізвідки: ні в замовленнях (їх не було), ні в
-- статистиці відвідувань (там сторінки, не запити).
--
-- Причин у пустого пошуку рівно дві, і дії різні:
--
--   • товару немає — варто завезти;
--   • товар Є, але зветься інакше («лакоста», «мк», «ів сен лоран») —
--     досить дописати написання в пошук (механізм псевдонімів брендів
--     уже працює, див. brandAliases у scripts/build-products.js).
--
-- Відрізнити одне від одного можна лише побачивши сам запит.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Додає до переліку різновидів report_issue ще один: search_miss.
-- Решта функції не змінюється.
-- --------------------------------------


-- --------------------------------------
-- ДЕ ТУТ МЕЖА
--
-- Запит — це вміст, який набрала людина, а не технічні дані. Тому в
-- браузері (assets/js/error-report.js → searchMiss) записуємо його
-- лише коли:
--
--   • результатів НУЛЬ — успішний пошук не додає нічого;
--   • є згода на статистику — та сама, що для решти вимірювань;
--   • у запиті немає пошти, @ніка чи довгого числа — таке
--     пропускаємо ЦІЛКОМ (у пошук іноді вставляють те, що збиралися
--     ввести в інше поле);
--   • людина ДОПИСАЛА (каталог перемальовується на кожну літеру).
--
-- І ще: сама функція report_issue не бачить, хто питає. У таблиці
-- лишається запит, шлях сторінки й рядок браузера — без будь-якого
-- способу зв'язати це з людиною.
--
-- ЧОМУ ЦЕ НЕ «ПОМИЛКА»
--
-- Пустий пошук — нормальна поведінка покупця, а не поломка сайту.
-- Тому scripts/report-issues.js показує такі рядки окремим розділом і
-- НЕ вважає їх причиною для червоного листа: інакше власник швидко
-- привчився б гортати щоденний звіт не читаючи.
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

    -- ЩО ЗМІНИЛОСЬ проти міграції 018: додано search_miss.
    --
    --   js_error    — помилка в браузері покупця
    --   not_found   — відкрито сторінку, якої немає
    --   meta_capi   — Meta не прийняла серверну конверсію
    --   stock_out   — замовлення забрало останню одиницю
    --   mail_list   — MailerLite відмовився прийняти підписку
    --   search_miss — пошук не знайшов жодного товару
    --
    -- Чужі різновиди й далі не приймаємо: функцію може викликати
    -- будь-який відвідувач, і без переліку таблиця стала б відкритим
    -- сховищем.
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss') then
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
    -- ДЛЯ ПОШУКУ ЦЕ САМЕ ТЕ, ЩО ПОТРІБНО. Той самий запит від десяти
    -- різних людей — це один рядок із hits = 10, і саме hits показує,
    -- чого хочуть найчастіше. Позначка notified при цьому не
    -- знімається: у звіті запит з'явиться один раз, а далі просто
    -- зростатиме лічильник.
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

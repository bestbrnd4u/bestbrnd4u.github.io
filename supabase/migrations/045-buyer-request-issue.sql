-- ======================================
-- Заявка на байєр-сервіс, яка нікуди не дійшла — і про це видно
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- На сторінці «Байєр-сервіс» зʼявилась форма заявки (site_action
-- "buyer-request"). Як і зворотний дзвінок (міграція 038), вона лише
-- надсилає повідомлення власнику в Telegram. Якщо Telegram відмовив,
-- людина бачить «не вдалося надіслати», а власник — нічого.
--
-- Тому відмову пишемо в site_issues, і вона приходить у щоденному
-- звіті як ПОЛОМКА: людина чекає розрахунку, якого не буде.
--
-- БЕЗ ЦІЄЇ МІГРАЦІЇ форма працює так само — лише відмова Telegram не
-- лишить сліду в журналі.
--
-- Функція переписується цілком (як і в кожній попередній міграції),
-- тож порядок запуску 038 → 039 → 040 → 045 дає перелік з усіма.
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

    -- ЩО ЗМІНИЛОСЬ проти міграції 040: додано buyer_request.
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
    --   site_chat      — Telegram не прийняв повідомлення з чату
    --   contact_flood  — чат або дзвінок уперлись у глобальну межу
    --   buyer_request  — Telegram не прийняв заявку на байєр-сервіс
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss', 'np_directory',
                      'turnstile_skip', 'call_back', 'site_chat',
                      'contact_flood', 'buyer_request') then
        return;
    end if;

    v_page    := left(coalesce(p_page, ''), 300);
    v_message := left(coalesce(p_message, ''), 500);

    if v_message = '' then
        return;
    end if;

    v_fingerprint := v_kind || '|' || v_page || '|' || v_message;

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

    raise warning 'report_issue: %', sqlerrm;

end;
$$;

grant execute on function public.report_issue(text, text, text, text, text)
    to anon, authenticated;


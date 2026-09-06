-- ======================================
-- Помилки сайту: журнал того, що зламалось у покупця
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Досі про зламану сторінку власник дізнавався від покупця — якщо
-- покупець узагалі писав, а не закривав вкладку. Помилка JavaScript
-- нічого не показує: сторінка просто не робить того, що мала.
--
-- Тепер браузер сам розповідає, що впало: адреса, повідомлення, файл
-- і рядок. Плюс сторінки, яких немає (404) — саме так знаходяться
-- биті посилання, поставлені колись у рекламі чи в Instagram.
--
-- ЧОГО ТУТ НЕМАЄ
--
-- Нічого особистого: ні імені, ні пошти, ні того, що людина клала в
-- кошик. Адреса сторінки, текст помилки й рядок браузера — усе.
-- --------------------------------------

create table if not exists public.site_issues (

    id           bigserial primary key,

    -- «js_error» або «not_found». Текстом, а не enum: нові різновиди
    -- додаються без міграції.
    kind         text        not null,

    -- Сторінка, де сталось (шлях без домену).
    page         text        not null default '',

    -- Текст помилки або, для 404, звідки прийшли.
    message      text        not null default '',

    -- Файл і рядок, де впало.
    source       text        not null default '',

    -- Браузер. Потрібен саме він: половина помилок трапляється в
    -- одному конкретному браузері й ніде більше.
    agent        text        not null default '',

    -- Скільки разів це вже траплялось. Саме лічильник, а не рядок на
    -- кожну подію: одна поламана сторінка дає сотні однакових
    -- повідомлень, і журнал із них нечитабельний.
    hits         integer     not null default 1,

    first_seen   timestamptz not null default now(),
    last_seen    timestamptz not null default now(),

    -- Чи повідомили власника (крок «Моніторинг» у GitHub Actions).
    notified     boolean     not null default false,

    -- Відбиток: різновид + сторінка + повідомлення. Він же ключ
    -- дедуплікації.
    fingerprint  text        not null unique
);

create index if not exists site_issues_last_seen_idx
    on public.site_issues (last_seen desc);

-- Таблиця закрита від клієнта повністю: політик немає, тобто
-- прочитати або змінити її з браузера неможливо. Писати можна лише
-- через функцію нижче, читати — власнику з панелі Supabase і кроку
-- моніторингу (він ходить із службовим ключем).
alter table public.site_issues enable row level security;


-- --------------------------------------
-- ЗАПИС ПОМИЛКИ
--
-- Викликає сайт (assets/js/error-report.js) від імені анонімного
-- відвідувача. Тому функція мусить бути стійкою до зловживання: це
-- єдиний спосіб щось написати в базу без замовлення.
--
-- ТРИ ОБМЕЖЕННЯ
--
-- 1. ДЕДУПЛІКАЦІЯ. Та сама помилка на тій самій сторінці — це +1 до
--    лічильника, а не новий рядок.
--
-- 2. ОБРІЗАННЯ. Довгі тексти ріжуться тут, а не покладаються на
--    сумлінність браузера: інакше в базу можна залити мегабайти.
--
-- 3. СТЕЛЯ НОВИХ ЗАПИСІВ. Якщо за останню годину вже з'явилось 200
--    РІЗНИХ помилок — нові не створюються (лічильники наявних далі
--    ростуть). Стільки різних помилок за годину означає або
--    катастрофу, яку й так уже видно, або те, що хтось надсилає
--    випадковий текст.
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

    -- Чужі різновиди не приймаємо: журнал має лишатись журналом
    -- помилок, а не вільною таблицею для запису.
    v_kind := lower(coalesce(p_kind, ''));

    if v_kind not in ('js_error', 'not_found') then
        return;
    end if;

    v_page    := left(coalesce(p_page, ''), 300);
    v_message := left(coalesce(p_message, ''), 500);

    if v_message = '' then
        return;
    end if;

    v_fingerprint := v_kind || '|' || v_page || '|' || v_message;

    -- Спершу лічильник: якщо така помилка вже відома, стеля нових
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

    -- Журнал помилок не має права ламати сторінку, з якої його
    -- покликали. Не записалось — значить не записалось.
    raise warning 'report_issue: %', sqlerrm;

end;
$$;

grant execute on function public.report_issue(text, text, text, text, text)
    to anon, authenticated;


-- --------------------------------------
-- ЯК ПОДИВИТИСЬ
--
--   select kind, page, message, hits, last_seen
--     from public.site_issues
--    order by last_seen desc
--    limit 50;
--
-- Полагодили — можна прибрати рядок:
--
--   delete from public.site_issues where id = <номер>;
--
-- Раз на день крок «Моніторинг» (GitHub Actions) бере нові рядки,
-- надсилає їх у зведення й ставить notified = true, щоб не
-- повідомляти про те саме двічі.
-- --------------------------------------

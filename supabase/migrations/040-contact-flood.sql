-- ======================================
-- Межі для чату й зворотного дзвінка
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- ЩО БУЛО НЕ ТАК
--
-- Чат і зворотний дзвінок користувались тим самим лічильником, що й
-- «Де моє замовлення»: order_lookup_allowed(), 20 звернень на IP за
-- годину й 400 глобально. Для сторінки пошуку замовлення це
-- правильні числа, для цих двох — ні.
--
-- 1. ТЕЛЕГРАМ ВЛАСНИКА МОЖНА БУЛО ЗАВАЛИТИ
--
--    Межа по IP стояла тільки на СТВОРЕННІ нитки. Друге й далі
--    повідомлення в наявній нитці перевірялись лише по нитці —
--    30 на годину:
--
--        20 ниток × 30 повідомлень = 620 повідомлень у Telegram
--        за годину з одного IP
--
-- 2. ФЛУД ЧАТУ ЛАМАВ «ДЕ МОЄ ЗАМОВЛЕННЯ» СПРАВЖНІМ ПОКУПЦЯМ
--
--    Лічильник спільний: вичерпавши 400 на годину чатом, зловмисник
--    гасив і сторінку пошуку замовлення, і підписку — для всіх.
--
-- 3. МАГАЗИНОМ МОЖНА БУЛО ЦЬКУВАТИ СТОРОННЮ ЛЮДИНУ
--
--    Зворотний дзвінок не дивився, чи цей номер уже замовляли. Двадцять
--    разів вписати чужий номер — і власник двадцять разів дзвонить
--    незнайомцю. Знаряддям при цьому виглядає магазин.
--
-- 4. ОПИТУВАННЯ ЧАТУ НЕ МАЛО МЕЖІ ВЗАГАЛІ
--
--    chat-poll не перевіряв нічого: цикл у консолі — це виклики Edge
--    Function без стелі.
--
--
-- ЧОМУ ОКРЕМИЙ ЛІЧИЛЬНИК, А НЕ ПРОСТО МЕНШІ ЧИСЛА
--
-- Щоб флуд в одному місці не гасив інше. Пошук замовлення й підписка
-- лишаються на своєму lookup_throttle; чат і дзвінок переїжджають на
-- власний. Межі в них різні, бо й ціна зловживання різна: зайве
-- опитування це витрата, а зайвий дзвінок — це дзвінок живій людині.
-- --------------------------------------

create extension if not exists pgcrypto with schema extensions;


-- Сіль ділимо з рештою лічильників (міграція 015/017). Якщо її ще
-- немає — створюємо, щоб порядок запуску не мав значення.
create table if not exists public.throttle_salt (
    id   integer primary key default 1 check (id = 1),
    salt text    not null
);

alter table public.throttle_salt enable row level security;

insert into public.throttle_salt (id, salt)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;


-- --------------------------------------
-- ЛІЧИЛЬНИК ЗВЕРНЕНЬ
--
-- kind — що саме рахуємо: 'callback', 'chat-new', 'chat-msg'.
-- Окремі межі в одній таблиці: так видно загальну картину, а
-- вичерпання однієї межі не впливає на іншу.
-- --------------------------------------

create table if not exists public.contact_throttle (

    id         bigserial   primary key,

    -- SHA-256 від «сіль + адреса». Самої адреси не зберігаємо: для
    -- лічильника вона не потрібна, а зберігати її — зайвий ризик.
    ip_hash    text        not null,

    kind       text        not null,

    created_at timestamptz not null default now()
);

create index if not exists contact_throttle_seen_idx
    on public.contact_throttle (created_at desc);

create index if not exists contact_throttle_key_idx
    on public.contact_throttle (kind, ip_hash, created_at desc);

alter table public.contact_throttle enable row level security;


-- --------------------------------------
-- НОМЕРИ, НА ЯКІ ВЖЕ ЗАМОВЛЯЛИ ДЗВІНОК
--
-- Зберігаємо ХЕШ, а не номер: для «чи було вже» цього досить, а
-- тримати чужі телефони заради лічильника не треба.
-- --------------------------------------

create table if not exists public.callback_throttle (

    id         bigserial   primary key,

    phone_hash text        not null,

    created_at timestamptz not null default now()
);

create index if not exists callback_throttle_key_idx
    on public.callback_throttle (phone_hash, created_at desc);

alter table public.callback_throttle enable row level security;


comment on table public.contact_throttle is
    'Лічильник звернень чату й зворотного дзвінка. Окремий від lookup_throttle, щоб флуд тут не гасив пошук замовлення.';

comment on table public.callback_throttle is
    'Хеші номерів, на які замовляли дзвінок. Щоб магазином не можна було цькувати стороннього.';


-- --------------------------------------
-- ЧИ МОЖНА ЗВЕРНУТИСЬ
--
-- Повертає текст, а не boolean, бо викликачу потрібні ТРИ різні
-- відповіді:
--
--   'ok'           — пропускаємо
--   'ip'           — цей відвідувач вичерпав свою межу
--   'global'       — вичерпана спільна межа (схоже на флуд)
--   'global-first' — те саме, і про це варто сказати власнику ОДИН
--                    раз за годину, а не на кожне відхилення
--
-- Різниця важлива: 'ip' — це майже завжди нетерплячий покупець,
-- 'global' — це вже напад, і власник має про нього знати.
-- --------------------------------------

create or replace function public.contact_allowed(
    p_ip     text,
    p_kind   text,
    p_per_ip integer,
    p_global integer
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_hash   text;
    v_mine   integer;
    v_all    integer;
    v_denied integer;
begin

    -- Прибираємо старе. Дешевше за окремий крок за розкладом:
    -- таблиця мала, а рядки старші за добу нікому не потрібні.
    delete from public.contact_throttle where created_at < now() - interval '1 day';

    select count(*) into v_all
      from public.contact_throttle
     where kind = p_kind
       and created_at > now() - interval '1 hour';

    if v_all >= p_global then

        -- Скільки вже відхилили за цією межею. Рахуємо за позначкою
        -- kind || ':denied', яку пишемо нижче.
        select count(*) into v_denied
          from public.contact_throttle
         where kind = p_kind || ':denied'
           and created_at > now() - interval '1 hour';

        insert into public.contact_throttle (ip_hash, kind) values ('-', p_kind || ':denied');

        -- Перше відхилення за цю годину — саме про нього й кажемо.
        return case when v_denied = 0 then 'global-first' else 'global' end;

    end if;

    if btrim(coalesce(p_ip, '')) = '' then
        -- Адреси немає — лишається сама глобальна межа. Рядок із
        -- порожнім ключем не пишемо: інакше всі безадресні запити
        -- склеїлись би в один лічильник і блокували одне одного.
        insert into public.contact_throttle (ip_hash, kind) values ('-', p_kind);
        return 'ok';
    end if;

    select encode(digest(salt || btrim(p_ip), 'sha256'), 'hex')
      into v_hash
      from public.throttle_salt
     where id = 1;

    select count(*) into v_mine
      from public.contact_throttle
     where kind = p_kind
       and ip_hash = v_hash
       and created_at > now() - interval '1 hour';

    if v_mine >= p_per_ip then
        return 'ip';
    end if;

    insert into public.contact_throttle (ip_hash, kind) values (v_hash, p_kind);

    return 'ok';

exception when others then

    -- ЛІЧИЛЬНИК ЗЛАМАВСЯ — ПРОПУСКАЄМО.
    --
    -- Той самий принцип, що в решті запобіжників проєкту: зламаний
    -- лічильник, який відповідає «ні», перекрив би чат усім покупцям
    -- одразу. Мовчазний чат гірший за зайве повідомлення.
    raise warning 'contact_allowed: %', sqlerrm;

    return 'ok';

end;
$$;


-- --------------------------------------
-- ЧИ НЕ ЗАМОВЛЯЛИ ВЖЕ ДЗВІНОК НА ЦЕЙ НОМЕР
--
-- Межа НЕ по IP: саме в цьому й суть. Адресу легко змінити, а номер,
-- який цькують, лишається той самий.
--
-- Три рази на добу — це більше, ніж треба людині, яка справді чекає
-- дзвінка, і замало, щоб перетворити магазин на автодозвонювач.
-- --------------------------------------

create or replace function public.callback_phone_allowed(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_hash text;
    v_seen integer;
begin

    delete from public.callback_throttle where created_at < now() - interval '2 days';

    if btrim(coalesce(p_phone, '')) = '' then
        return false;
    end if;

    select encode(digest(salt || btrim(p_phone), 'sha256'), 'hex')
      into v_hash
      from public.throttle_salt
     where id = 1;

    select count(*) into v_seen
      from public.callback_throttle
     where phone_hash = v_hash
       and created_at > now() - interval '1 day';

    if v_seen >= 3 then
        return false;
    end if;

    insert into public.callback_throttle (phone_hash) values (v_hash);

    return true;

exception when others then

    raise warning 'callback_phone_allowed: %', sqlerrm;

    return true;

end;
$$;


-- --------------------------------------
-- МЕЖА НА ОПИТУВАННЯ ЧАТУ
--
-- Сайт питає «чи є нове» раз на пʼять секунд і ЛИШЕ поки панель
-- відкрита — це 720 запитів на годину, якщо тримати її відкритою
-- безперервно. Ставимо стелю з запасом: 900.
--
-- Лічильник живе В САМОМУ РЯДКУ НИТКИ, а не окремою таблицею: це
-- один UPDATE замість вставки й прибирання, а опитування має
-- лишатись дешевим — інакше захист від навантаження сам стає
-- навантаженням.
-- --------------------------------------

alter table public.chat_threads
    add column if not exists poll_count integer not null default 0;

alter table public.chat_threads
    add column if not exists poll_window timestamptz not null default now();


create or replace function public.chat_poll_allowed(p_thread uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin

    update public.chat_threads
       set poll_window = case
               when poll_window < now() - interval '1 hour' then now()
               else poll_window
           end,
           poll_count = case
               when poll_window < now() - interval '1 hour' then 1
               else poll_count + 1
           end
     where id = p_thread
    returning poll_count into v_count;

    -- Нитки немає — хай відповідає сам обробник, це не наша справа.
    if v_count is null then
        return true;
    end if;

    return v_count <= 900;

exception when others then

    raise warning 'chat_poll_allowed: %', sqlerrm;

    return true;

end;
$$;


-- --------------------------------------
-- ПРАВА
--
-- Усі три викликає ЛИШЕ службовий ключ, тобто наша Edge Function.
-- Браузер із публічним ключем сюди не дістане — як і до таблиць.
-- --------------------------------------

revoke execute on function public.contact_allowed(text, text, integer, integer)
    from anon, authenticated;

revoke execute on function public.callback_phone_allowed(text)
    from anon, authenticated;

revoke execute on function public.chat_poll_allowed(uuid)
    from anon, authenticated;


-- --------------------------------------
-- ЩЕ ОДИН РІЗНОВИД ЗАПИСУ В ЖУРНАЛ: contact_flood
--
-- Про напад власник дізнається одразу — повідомленням у Telegram, не
-- частіше ніж раз на годину. Але в журналі слід лишитись теж: у
-- щоденному звіті видно, скільки разів і коли це було, а одне
-- повідомлення в переписці губиться за день.
--
-- Функція переписується цілком (як і в кожній попередній міграції),
-- тож порядок запуску 038 → 039 → 040 дає перелік з усіма новими.
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

    -- ЩО ЗМІНИЛОСЬ проти міграції 039: додано contact_flood.
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
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss', 'np_directory',
                      'turnstile_skip', 'call_back', 'site_chat',
                      'contact_flood') then
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


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   -- має бути ok тричі, потім ip
--   select public.contact_allowed('1.2.3.4', 'callback', 3, 30);
--
--   -- має бути true тричі, потім false
--   select public.callback_phone_allowed('+380730000000');
--
--   select kind, count(*) from public.contact_throttle
--    where created_at > now() - interval '1 hour'
--    group by kind;
--
-- Прибрати тестові рядки:
--
--   delete from public.contact_throttle where ip_hash = '-' or true;
--   delete from public.callback_throttle;
--
--
-- ЯКЩО ДОВЕДЕТЬСЯ ПІДНЯТИ МЕЖІ. Числа передає Edge Function, не ця
-- міграція — шукати в _index.src.ts за «МЕЖІ ЗВЕРНЕНЬ». Там же
-- пояснення, чому саме такі.
-- --------------------------------------

-- ======================================
-- Промокоди: строки, обмеження, облік
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- Плейсхолдерів тут немає — нічого замінювати не треба.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Промокоди досі були списком «код → відсоток», який можна змінити
-- лише через SQL. Через це не було найпотрібнішого:
--
--   • тимчасових кодів — таких, що самі перестають діяти в дату;
--   • кодів на певні товари — знижка йшла на весь кошик;
--   • одноразових — код розліталися по чатах і жив вічно;
--   • видимості — хто скористався, скільки разів лишилось.
--
-- І головне: коди зберігались ЛИШЕ хешем. Хеш ховає код від того, хто
-- дивиться таблицю, але й від власника теж — список у панелі показати
-- неможливо, бо з хеша код не дістати.
--
-- ЩО МІНЯЄМО. Код тепер зберігається і як хеш (за ним шукає сторінка,
-- протокол не міняється), і відкрито — щоб панель могла показати
-- список, а власник — створити новий код і побачити старі.
--
-- Це свідомий обмін: таблиця закрита від браузера повністю (RLS без
-- жодної політики), читає її лише службовий ключ, і той — через
-- функцію Edge, яка спершу перевіряє право запису в репозиторій.
-- Тобто «код видно в таблиці» означає «код видно тому, хто й так має
-- ключ від усієї бази».
-- --------------------------------------


-- --------------------------------------
-- 1. Нові поля
--
-- Усі необовʼязкові: наявні коди після міграції поводяться точно так
-- само, як до неї.
-- --------------------------------------

alter table public.promo_codes
    -- Сам код, у верхньому регістрі. Для рядків, перенесених із коду
    -- сайту, лишається порожнім — плейнтексту в нас немає й узяти
    -- нізвідки. Панель покаже їх як «код невідомий».
    add column if not exists code text,

    -- Вікно дії. null з обох боків = безстроковий, «постійний».
    add column if not exists starts_at  timestamptz,
    add column if not exists expires_at timestamptz,

    -- Скільки разів можна скористатися всього. null = без межі.
    -- Одноразовий персональний код — це max_uses = 1.
    add column if not exists max_uses integer,

    -- На які товари діє. null або порожній масив = на всі.
    add column if not exists product_ids bigint[],

    -- Від якої суми кошика працює. null = без порогу.
    add column if not exists min_total numeric;

-- Код мусить бути унікальним серед заповнених: два різні рядки з
-- «OSINb2026» зробили б поведінку залежною від порядку рядків.
create unique index if not exists promo_codes_code_idx
    on public.promo_codes (upper(btrim(code)))
    where code is not null and btrim(code) <> '';

-- Пошук замовлень за кодом — для підрахунку використань і для списку
-- «хто скористався».
create index if not exists orders_promo_code_idx
    on public.orders (upper(btrim(promo_code)))
    where promo_code is not null and btrim(promo_code) <> '';


-- --------------------------------------
-- 2. ОДНЕ місце, яке вирішує, чи код зараз працює
--
-- Його читають ТРОЄ: сторінка оформлення (щоб показати знижку),
-- тригер суми (щоб її підтвердити) і панель (щоб показати стан).
-- Три копії цього правила розійшлися б за місяць — і покупець бачив
-- би одну знижку, а в замовленні стояла б інша.
--
-- Скільки разів кодом скористалися, рахуємо з самих замовлень, а не
-- з лічильника в рядку. Лічильник неминуче розходиться з дійсністю:
-- скасоване замовлення, ручна правка, збій на пів дороги. Замовлення
-- ж — це і є те, що сталось насправді.
-- --------------------------------------

create or replace function public.promo_uses_count(p_code text)
returns integer
language sql
security definer
set search_path = public
stable
as $$
    select count(*)::integer
      from public.orders
     where upper(btrim(coalesce(promo_code, ''))) = upper(btrim(coalesce(p_code, '')))
       and upper(btrim(coalesce(p_code, ''))) <> ''
       and coalesce(status, '') <> 'cancelled'
$$;


-- Чому код НЕ працює — одним словом. Порожньо = працює.
--
-- Окремою функцією, бо це потрібно і перевірці, і панелі: панель
-- показує причину, а не просто «не діє».
create or replace function public.promo_state(p_row public.promo_codes, p_now timestamptz)
returns text
language sql
immutable
as $$
    select case
        when not p_row.active                                    then 'off'
        when p_row.starts_at is not null
             and p_now < p_row.starts_at                         then 'early'
        when p_row.expires_at is not null
             and p_now >= p_row.expires_at                       then 'expired'
        else 'live'
    end
$$;


-- Умови коду, який діє за датами й перемикачем. Межу кількості тут
-- НЕ перевіряємо — цим займається promo_available нижче.
--
-- ЧОМУ ЦЕ РОЗДІЛЕНО НА ДВІ ФУНКЦІЇ
--
-- Тригер суми спрацьовує не лише при створенні замовлення, а й при
-- кожній зміні його статусу. На той момент саме це замовлення вже
-- лежить у таблиці — і одноразовий код рахував би сам себе:
-- «використань 1, межа 1, отже код не діє». Замовлення, оформлене
-- бездоганно, при першій же зміні статусу позначалось би як
-- «сума не збіглася».
--
-- Тому межу кількості тригер перевіряє сам, виключаючи поточне
-- замовлення (див. розділ 5), а спільна функція лишається про
-- «які умови в цього коду».
create or replace function public.promo_terms(p_hash text, p_now timestamptz default now())
returns table (
    percent     numeric,
    product_ids bigint[],
    min_total   numeric
)
language sql
security definer
set search_path = public
stable
as $$
    select c.percent, c.product_ids, c.min_total
      from public.promo_codes c
     where c.code_hash = lower(coalesce(p_hash, ''))
       and public.promo_state(c, p_now) = 'live'
$$;


-- Те саме плюс межа кількості. Це і є «чи можна скористатися ЗАРАЗ».
create or replace function public.promo_available(p_hash text, p_now timestamptz default now())
returns table (
    percent     numeric,
    product_ids bigint[],
    min_total   numeric
)
language sql
security definer
set search_path = public
stable
as $$
    select t.percent, t.product_ids, t.min_total
      from public.promo_terms(p_hash, p_now) t
      join public.promo_codes c on c.code_hash = lower(coalesce(p_hash, ''))
     where c.max_uses is null
        or c.code is null
        or public.promo_uses_count(c.code) < c.max_uses
$$;


-- --------------------------------------
-- 3. Що віддається сторінці оформлення
--
-- Тип результату змінився (був один numeric), тож функцію треба
-- ПЕРЕСТВОРИТИ: create or replace відмовляється міняти набір колонок.
--
-- Сторінка отримує рівно те, що потрібно, щоб порахувати й показати
-- знижку — і нічого зайвого: ні коду, ні дат, ні лічильників.
-- --------------------------------------

drop function if exists public.promo_check(text);

create function public.promo_check(p_hash text)
returns table (
    percent     numeric,
    product_ids bigint[],
    min_total   numeric
)
language sql
security definer
set search_path = public
stable
as $$
    select * from public.promo_available(p_hash, now())
$$;

grant execute on function public.promo_check(text) to anon, authenticated;


-- --------------------------------------
-- 4. Панель: список і використання
--
-- Обидві — лише для службового ключа: їх кличе функція Edge, яка
-- спершу перевіряє право запису в репозиторій сайту.
-- --------------------------------------

create or replace function public.promo_admin_list()
returns table (
    code_hash   text,
    code        text,
    percent     numeric,
    active      boolean,
    starts_at   timestamptz,
    expires_at  timestamptz,
    max_uses    integer,
    used        integer,
    product_ids bigint[],
    min_total   numeric,
    note        text,
    created_at  timestamptz,
    state       text
)
language sql
security definer
set search_path = public
stable
as $$
    select
        c.code_hash,
        c.code,
        c.percent,
        c.active,
        c.starts_at,
        c.expires_at,
        c.max_uses,
        coalesce(public.promo_uses_count(c.code), 0) as used,
        c.product_ids,
        c.min_total,
        c.note,
        c.created_at,
        -- Вичерпаний за кількістю показуємо окремим станом: «діє, але
        -- вже не спрацює» — найзаплутаніше, що може побачити власник.
        case
            when public.promo_state(c, now()) <> 'live' then public.promo_state(c, now())
            when c.max_uses is not null
                 and c.code is not null
                 and public.promo_uses_count(c.code) >= c.max_uses then 'used_up'
            else 'live'
        end as state
      from public.promo_codes c
     order by c.created_at desc
$$;

revoke all on function public.promo_admin_list() from public, anon, authenticated;
grant execute on function public.promo_admin_list() to service_role;


-- Хто скористався кодом. Ім'я й пошта потрібні власнику, щоб
-- зрозуміти, чи код пішов туди, куди задумувався.
create or replace function public.promo_admin_uses(p_code text)
returns table (
    order_number text,
    created_at   timestamptz,
    customer     text,
    email        text,
    total        numeric,
    discount     numeric,
    status       text
)
language sql
security definer
set search_path = public
stable
as $$
    select
        o.order_number,
        o.created_at,
        btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')),
        o.email,
        o.total,
        o.discount,
        o.status
      from public.orders o
     where upper(btrim(coalesce(o.promo_code, ''))) = upper(btrim(coalesce(p_code, '')))
       and upper(btrim(coalesce(p_code, ''))) <> ''
     order by o.created_at desc
     limit 200
$$;

revoke all on function public.promo_admin_uses(text) from public, anon, authenticated;
grant execute on function public.promo_admin_uses(text) to service_role;


-- Створити або оновити код.
--
-- Хеш рахує сама база з коду — так браузер і функція Edge не можуть
-- покласти хеш, який не відповідає коду.
create or replace function public.promo_admin_save(
    p_code        text,
    p_percent     numeric,
    p_active      boolean default true,
    p_starts_at   timestamptz default null,
    p_expires_at  timestamptz default null,
    p_max_uses    integer default null,
    p_product_ids bigint[] default null,
    p_min_total   numeric default null,
    p_note        text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_code text := upper(btrim(coalesce(p_code, '')));
    v_hash text;
begin

    -- Латиниця, цифри, дефіс — те, що людина зможе продиктувати по
    -- телефону й набрати без розкладки.
    if v_code !~ '^[A-Z0-9-]{3,32}$' then
        raise exception 'Код: 3-32 символи, латиниця, цифри й дефіс';
    end if;

    if p_percent is null or p_percent <= 0 or p_percent >= 1 then
        raise exception 'Відсоток має бути більше 0 і менше 100';
    end if;

    if p_starts_at is not null and p_expires_at is not null
       and p_expires_at <= p_starts_at then
        raise exception 'Кінець дії має бути пізніше за початок';
    end if;

    v_hash := encode(digest(v_code, 'sha256'), 'hex');

    insert into public.promo_codes as c
        (code_hash, code, percent, active, starts_at, expires_at,
         max_uses, product_ids, min_total, note)
    values
        (v_hash, v_code, p_percent, coalesce(p_active, true), p_starts_at, p_expires_at,
         p_max_uses, nullif(p_product_ids, '{}'), p_min_total, p_note)
    on conflict (code_hash) do update
        set code        = excluded.code,
            percent     = excluded.percent,
            active      = excluded.active,
            starts_at   = excluded.starts_at,
            expires_at  = excluded.expires_at,
            max_uses    = excluded.max_uses,
            product_ids = excluded.product_ids,
            min_total   = excluded.min_total,
            note        = excluded.note;

    return v_hash;

end;
$$;

revoke all on function public.promo_admin_save(text, numeric, boolean, timestamptz, timestamptz, integer, bigint[], numeric, text) from public, anon, authenticated;
grant execute on function public.promo_admin_save(text, numeric, boolean, timestamptz, timestamptz, integer, bigint[], numeric, text) to service_role;


-- Видалити код. Замовлення, у яких він стоїть, лишаються як є:
-- promo_code там — знімок того, що сталось, а не посилання.
create or replace function public.promo_admin_delete(p_hash text)
returns boolean
language sql
security definer
set search_path = public
as $$
    delete from public.promo_codes
     where code_hash = lower(coalesce(p_hash, ''))
    returning true
$$;

revoke all on function public.promo_admin_delete(text) from public, anon, authenticated;
grant execute on function public.promo_admin_delete(text) to service_role;


-- --------------------------------------
-- 5. Тригер суми: знижка рахується на ті товари, на які код діє
--
-- Раніше було просто «весь кошик × відсоток». З кодами на певні
-- товари цього мало: якщо знижка на окуляри, а в кошику ще й сумка,
-- сервер порахував би її на все — і кожне таке замовлення позначалось
-- би як «сума не збіглася».
--
-- Переписуємо ЛИШЕ підрахунок знижки. Решта — перевірка цін, ознака
-- unknown, допуск у гривню — лишається як була.
-- --------------------------------------

create or replace function public.orders_check_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_items    jsonb := case jsonb_typeof(new.items) when 'array' then new.items else '[]'::jsonb end;
    v_item     jsonb;
    v_id       bigint;
    v_qty      integer;
    v_price    numeric;
    v_old      numeric;
    v_goods    numeric := 0;   -- за цінами бази
    v_before   numeric := 0;   -- до знижок
    v_eligible numeric := 0;   -- те, на що діє промокод
    v_percent  numeric := 0;
    v_only     bigint[];       -- на які товари діє код (null = на всі)
    v_min      numeric;
    v_promo    numeric := 0;
    v_delivery numeric := greatest(coalesce(new.delivery_price, 0), 0);
    v_total    numeric;
    v_unknown  boolean := false;
    v_counted  boolean := false;
    v_found    boolean := false;
    v_max      integer;
    v_codetext text;
    v_used     integer;
begin

    -- Промокод читаємо ДО перебору товарів: перелік товарів коду
    -- потрібен уже в самому переборі.
    if coalesce(new.promo_code, '') <> '' then

        select t.percent, t.product_ids, t.min_total
          into v_percent, v_only, v_min
          from public.promo_terms(
                   encode(digest(upper(btrim(new.promo_code)), 'sha256'), 'hex'),
                   coalesce(new.created_at, now())) t;

        v_found := found;

        -- Межа кількості — окремо, з ВИКЛЮЧЕННЯМ цього ж замовлення.
        --
        -- Тригер спрацьовує і при зміні статусу, коли замовлення вже
        -- лежить у таблиці. Без виключення одноразовий код рахував би
        -- сам себе, і бездоганно оформлене замовлення при першій же
        -- зміні статусу ставало б «сума не збіглася».
        if v_found then

            select c.max_uses, c.code
              into v_max, v_codetext
              from public.promo_codes c
             where c.code_hash = encode(digest(upper(btrim(new.promo_code)), 'sha256'), 'hex');

            if v_max is not null and coalesce(btrim(v_codetext), '') <> '' then

                select count(*)
                  into v_used
                  from public.orders o
                 where upper(btrim(coalesce(o.promo_code, ''))) = upper(btrim(v_codetext))
                   and coalesce(o.status, '') <> 'cancelled'
                   and o.order_number is distinct from new.order_number;

                if v_used >= v_max then v_found := false; end if;

            end if;

        end if;

    end if;

    for v_item in select value from jsonb_array_elements(v_items) loop

        -- Через регулярку, а не прямим ::bigint: один товар із
        -- нечисловим id інакше завалив би вставку замовлення.
        v_id := case
            when coalesce(v_item->>'id', '') ~ '^[0-9]{1,18}$'
            then (v_item->>'id')::bigint
        end;

        v_qty := greatest(coalesce((v_item->>'qty')::int, 1), 1);

        if v_id is null then
            v_unknown := true;
            continue;
        end if;

        select price, old_price into v_price, v_old
        from public.prices
        where product_id = v_id;

        if not found then
            -- Товар щойно додали, а знімок цін ще не приїхав. Це не
            -- підробка — це неповні дані, і казати «сума не збіглася»
            -- тут означало б навчити власника ігнорувати позначку.
            v_unknown := true;
            continue;
        end if;

        v_goods  := v_goods + v_price * v_qty;
        v_before := v_before + coalesce(nullif(v_old, 0), v_price) * v_qty;

        -- Під знижку йде або весь кошик, або лише перелічені товари.
        if v_only is null or array_length(v_only, 1) is null or v_id = any(v_only) then
            v_eligible := v_eligible + v_price * v_qty;
        end if;

        v_counted := true;

    end loop;

    if not v_counted then
        new.price_check := 'unknown';
        return new;
    end if;

    -- Код указано, але він не діє: не існує, вимкнений, скінчився,
    -- вичерпаний. Сама по собі знижка може й збігтись, але таке
    -- замовлення варте погляду.
    if coalesce(new.promo_code, '') <> '' and not v_found then
        v_percent := 0;
        v_unknown := false;
        new.price_check := 'mismatch';
    end if;

    -- Поріг суми — по кошику цілком, а не по товарах зі знижкою:
    -- «від 3 000 ₴» покупець читає саме як суму замовлення.
    if v_min is not null and v_goods < v_min then
        v_percent := 0;
    end if;

    v_promo := round(v_eligible * coalesce(v_percent, 0));
    v_total := v_goods - v_promo + v_delivery;

    new.total_expected := v_total;

    if new.price_check = 'mismatch' then
        return new;
    end if;

    -- Гривня допуску: округлення відсотка в браузері й у базі може
    -- розійтись на копійки, і кричати про це не варто.
    if v_unknown then
        new.price_check := 'unknown';
    elsif abs(coalesce(new.total, 0) - v_total) > 1
        or coalesce(new.delivery_price, 0) < 0 then
        new.price_check := 'mismatch';
    else
        new.price_check := 'ok';
    end if;

    return new;

end;
$$;


-- --------------------------------------
-- ПЕРЕВІРКА
--
-- Після Run має повернути один рядок: скільки кодів усього, скільки
-- з них із відкритим кодом, скільки діє прямо зараз.
-- --------------------------------------

select
    (select count(*) from public.promo_codes)                              as усього,
    (select count(*) from public.promo_codes where btrim(coalesce(code,'')) <> '') as із_кодом,
    (select count(*) from public.promo_admin_list() where state = 'live')  as діють;

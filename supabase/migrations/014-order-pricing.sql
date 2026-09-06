-- ======================================
-- Перерахунок суми замовлення на сервері
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- ⚠️ Спершу виконайте 011-stock-reservation.sql — там з'явилась
--    таблиця, з якої цей файл бере ключ товару.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Ціну, знижку й підсумок рахує браузер, а база записує те, що він
-- прислав. Тобто сума замовлення — це значення, яке приходить ззовні:
-- будь-хто з відкритою консоллю може надіслати ту саму сумку за 1 ₴.
--
-- Ризик невеликий: власник бачить кожне замовлення до відправлення й
-- дзвонить покупцеві. Але «помітить людина» — не захист, а звичка; на
-- сотому замовленні за день її не стане.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Тригер перераховує суму САМ — за цінами з бази — і, якщо вона не
-- збігається з присланою, ставить позначку. Власник бачить її в
-- Telegram і в панелі замовлень поруч із самим замовленням.
--
-- ЧОМУ НЕ ПЕРЕЗАПИСУЄ СУМУ
--
-- Тому що покупець погодився на ту суму, яку БАЧИВ. Ціна могла
-- змінитись між відкриттям сторінки й натисканням кнопки — і мовчки
-- виставити людині більше, ніж вона бачила, гірше за будь-яку
-- підробку. Замовлення зберігає те, що обіцяв сайт; поруч лежить те,
-- що каже база. Рішення лишається за власником.
--
-- ЧОМУ НЕ ВІДМОВЛЯЄ У ВСТАВЦІ
--
-- Лист покупцеві на цей момент уже надіслано. Відхилити рядок
-- означало б, що замовлення зникло з бази й з Telegram, а покупець
-- певен, що замовив.
-- --------------------------------------


-- --------------------------------------
-- 1. ЦІНИ
--
-- Дзеркало цін із зібраного каталогу — так само, як public.stock
-- дзеркалить залишки. Кладе його scripts/push-prices.js після кожної
-- збірки прод-гілки.
--
-- Клієнт цю таблицю не бачить: RLS увімкнено, політик немає. Ціни й
-- так відкриті на сайті, але тут вони — ЕТАЛОН, і давати до нього
-- доступ звідти ж, звідки приходить підробка, безглуздо.
-- --------------------------------------

create table if not exists public.prices (

    product_id  bigint      primary key,

    -- Ціна, за якою товар продається зараз.
    price       numeric     not null,

    -- Стара ціна (перекреслена). Потрібна, щоб перерахувати «знижку»:
    -- без неї сервер вважав би знижкою будь-яку різницю.
    old_price   numeric,

    updated_at  timestamptz not null default now()
);

alter table public.prices enable row level security;


-- --------------------------------------
-- 2. ПРОМОКОДИ
--
-- Досі вони жили в коді сторінки — хешами, щоб не світились у
-- вихідному коді. Хеш ховає сам код, але не відсоток: підмінити
-- знижку в браузері це не заважало.
--
-- Тепер список у базі, а сторінка лише питає «чи є такий?». Той самий
-- список читає тригер, коли перевіряє суму, — тобто знижку
-- підтверджує той бік, який не можна вмовити.
-- --------------------------------------

create table if not exists public.promo_codes (

    -- SHA-256 від коду у верхньому регістрі. Саме хеш, а не сам код:
    -- так його не видно навіть тому, хто дивиться таблицю через
    -- панель, а перевірка від цього не страждає.
    code_hash   text        primary key,

    -- 0.05 = 5%.
    percent     numeric     not null check (percent > 0 and percent < 1),

    active      boolean     not null default true,

    note        text,

    created_at  timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

-- Чинні коди магазину — ті самі, що досі лежали в checkout.js.
insert into public.promo_codes (code_hash, percent, note) values
    ('c9e488ab31fa759d6b8fab82285ea82e2c2bde7055560b03a60242e0e3512819', 0.05, 'перенесено з сайту'),
    ('52d409d2e035f5b361fecd6c952ee4a1ad00cec281f1fb94405c91aae35d3307', 0.05, 'перенесено з сайту'),
    ('2e8d6035d09c520891c8b018695a31f8ec903d0a972a823a57050f2a05d5b7e7', 0.05, 'перенесено з сайту'),
    ('dd0bf242e212c7176713e48a193b9b135eeb12f1974be00303a5b8d094d3da5a', 0.05, 'перенесено з сайту'),
    ('389df058d4010a10d167664d06f93c6816be73742dae54c4941af2a4041c8d8b', 0.05, 'перенесено з сайту'),
    ('e860bea6d6326683355ec709f44bceddc8545eefd7c7cc9429a1176ba5d81164', 0.10, 'перенесено з сайту'),
    ('f8bfba274811113169369a01408fd10d8406a9f13c59fed2e3fb378d1f3c97f2', 0.10, 'перенесено з сайту'),
    ('307d71cefd74a418f98ca149646ff244688e6c8a06a7519a65598b86d4a0d182', 0.10, 'перенесено з сайту'),
    ('f1908dcd504cdf1ea8dcac9169f5182e4fcb9b6ca90ceea06d405a155f4366ff', 0.10, 'перенесено з сайту'),
    ('184806b2107cb6a666a29ad6a4dad4477ab85342b1ea390345ae5cf3eaba78cb', 0.10, 'перенесено з сайту')
on conflict (code_hash) do nothing;


-- Перевірка коду для сторінки оформлення.
--
-- Приймає ХЕШ, а не сам код: так код не з'являється ні в запиті, ні в
-- логах. Віддає лише відсоток — нічого іншого сторінці й не треба.
create or replace function public.promo_check(p_hash text)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
    select percent
    from public.promo_codes
    where code_hash = lower(coalesce(p_hash, ''))
      and active
$$;

grant execute on function public.promo_check(text) to anon, authenticated;


-- --------------------------------------
-- 3. ПЕРЕВІРКА СУМИ
--
-- Рахуємо те саме, що рахує сторінка оформлення:
--
--   товари      = Σ ціна × кількість
--   до знижки   = Σ (стара ціна або ціна) × кількість
--   промокод    = товари × відсоток
--   разом       = товари − промокод + доставка
--
-- Порівнюємо з присланим — і, якщо різниця більша за гривню,
-- позначаємо замовлення.
--
-- ЧОГО НЕ ПЕРЕВІРЯЄМО: вартість доставки. Тарифи живуть на сайті, а
-- не в базі, і другий їх перелік тут неминуче розійшовся б із першим.
-- Але від'ємну доставку («знижку» на 10 000 ₴) видно й без тарифів —
-- її ловимо окремо.
-- --------------------------------------

-- digest() для хешу промокоду. У Supabase pgcrypto зазвичай уже
-- увімкнений у схемі extensions; рядок нижче нічого не змінює, якщо
-- це так, і рятує проєкти, де його немає.
create extension if not exists pgcrypto with schema extensions;

alter table public.orders
    add column if not exists price_check text,
    add column if not exists total_expected numeric;

comment on column public.orders.price_check is
    'ok — сума збіглася; mismatch — ні; unknown — у базі немає цін на частину товарів';

create or replace function public.orders_check_pricing()
returns trigger
language plpgsql
-- extensions: там у Supabase лежить pgcrypto з digest().
set search_path = public, extensions
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
    v_percent  numeric := 0;
    v_promo    numeric := 0;
    v_delivery numeric := greatest(coalesce(new.delivery_price, 0), 0);
    v_total    numeric;
    v_unknown  boolean := false;
    v_counted  boolean := false;
begin

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
        v_counted := true;

    end loop;

    if not v_counted then
        new.price_check := 'unknown';
        return new;
    end if;

    -- Промокод: відсоток бере база, а не те, що прислав браузер.
    if coalesce(new.promo_code, '') <> '' then

        select percent into v_percent
        from public.promo_codes
        where code_hash = encode(digest(upper(trim(new.promo_code)), 'sha256'), 'hex')
          and active;

        if not found then
            -- Код, якого немає. Сама по собі знижка може й збігтись,
            -- але замовлення з неіснуючим промокодом варте погляду.
            v_percent := 0;
            v_unknown := false;
            new.price_check := 'mismatch';
        end if;

    end if;

    v_promo := round(v_goods * coalesce(v_percent, 0));
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

exception

    -- ЗАМОВЛЕННЯ ВАЖЛИВІШЕ ЗА ПОЗНАЧКУ.
    --
    -- Той самий принцип, що в перевірці залишків: цей тригер стоїть на
    -- шляху кожного замовлення, і будь-яка несподіванка тут без цього
    -- блоку означала б, що магазин перестає приймати замовлення.
    when others then

        raise warning 'orders_check_pricing: %', sqlerrm;

        return new;

end;
$$;

drop trigger if exists orders_check_pricing on public.orders;

-- Після перевірки залишків (за алфавітом «orders_check_pricing» іде
-- раніше за «orders_flag_stock_shortfall», але вони не заважають один
-- одному: перший читає items, другий їх переписує, додаючи позначку
-- про залишок).
create trigger orders_check_pricing
    before insert on public.orders
    for each row
    execute function public.orders_check_pricing();


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select order_number, total, total_expected, price_check
--     from public.orders
--    order by created_at desc
--    limit 20;
--
-- price_check = 'ok' — сума збіглася з цінами бази.
-- 'mismatch'         — ні; подробиці в total_expected.
-- 'unknown'          — частини товарів немає в public.prices (знімок
--                      цін ще не приїхав або товар видалено).
-- порожньо           — замовлення створене до цієї міграції.
-- --------------------------------------

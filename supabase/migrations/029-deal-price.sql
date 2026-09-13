-- ======================================
-- Ціна дня в еталоні цін
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
--
-- ⚠️ Спершу мають бути виконані 014-order-pricing.sql і
--    025-promo-codes.sql — цей файл переписує тригер із них.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- В акції зʼявилась «ціна дня»: товар коштує 8 600 ₴ із 18:00 до
-- опівночі, а решту часу — 9 000 ₴. Сайт цю ціну знає (priceNow() у
-- assets/js/common.js), база — ні.
--
-- Без цього файлу кожне таке замовлення отримувало б позначку
-- «сума не збіглася»: покупець заплатив 8 600, а база порахувала б
-- 9 000. Тобто найчесніші замовлення виглядали б як підміна ціни в
-- консолі — рівно те, від чого позначка й захищає.
--
-- ЧОМУ ВІКНО В БАЗІ, А НЕ ГОТОВА ЦІНА
--
-- Ціна залежить від годинника. Знімок цін приїжджає раз на збірку;
-- якби він клав уже пораховану ціну, сейл починався б не о 18:00, а
-- під час наступної збірки — і закінчувався б так само навмання.
-- Тому база тримає ВІКНО, а ціну рахує в мить замовлення — так само,
-- як сторінка.
-- --------------------------------------


-- --------------------------------------
-- 1. ВІКНО ЦІНИ ДНЯ
--
-- Кладе його scripts/push-prices.js разом із рештою знімка. Порожні
-- поля = ціни дня в товара немає (звичайний стан 99% каталогу).
-- --------------------------------------

alter table public.prices
    add column if not exists sale_price numeric,
    add column if not exists sale_from  timestamptz,
    add column if not exists sale_to    timestamptz;

comment on column public.prices.sale_price is
    'Ціна дня. Діє у вікні sale_from…sale_to; порожньо — акційної ціни немає';


-- --------------------------------------
-- 2. ПЕРЕРАХУНОК СУМИ З ЦІНОЮ ДНЯ
--
-- Та сама функція, що в 025, з двома змінами.
--
-- ПЕРША. Ціна товару береться через вікно — точно за тим самим
-- правилом, що saleActive() на сайті: ціна дня діє, коли вона задана,
-- момент не раніше за початок і СТРОГО раніше за кінець.
--
-- ДРУГА. Допуск на межі вікна.
--
-- Сторінку відкривають о 17:58, а кнопку тиснуть о 18:01 — браузер
-- надішле 9 000, бо саме це людина бачила, а база порахує 8 600. І
-- навпаки: сейл скінчився хвилину тому, а на відкритій сторінці ще
-- висить 8 600. Обидва замовлення чесні, і позначити їх означало б
-- зробити позначку шумом у ті самі години, коли вона потрібна.
--
-- Тому поруч із основною сумою рахуємо другу — «за тією ціною, що
-- була видна хвилину тому», і збіг із будь-якою вважаємо нормою.
-- Діє це лише в межах GRACE від межі вікна; поза ним ціна одна.
--
-- Ціна, за якою можна купити дешевше, ніж показує сайт, — це саме
-- вікно GRACE після кінця сейлу. Десять хвилин на товар, у якого
-- сейл щойно скінчився, — прийнятна плата за те, щоб не
-- підозрювати кожного, хто не встиг оновити сторінку.
--
-- Решта — перевірка промокоду, ознака unknown, гривня допуску —
-- лишається як була.
-- --------------------------------------

create or replace function public.orders_check_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    -- Наскільки довго після зміни ціни вважаємо стару ціну чинною.
    c_grace    constant interval := '10 minutes';

    v_items    jsonb := case jsonb_typeof(new.items) when 'array' then new.items else '[]'::jsonb end;
    v_item     jsonb;
    v_id       bigint;
    v_qty      integer;
    v_price    numeric;
    v_old      numeric;
    v_sale     numeric;
    v_from     timestamptz;
    v_to       timestamptz;
    v_now      timestamptz := coalesce(new.created_at, now());
    v_live     boolean;
    v_unit     numeric;      -- ціна, чинна зараз
    v_unit_alt numeric;      -- ціна, видна хвилину тому (або та сама)
    v_goods    numeric := 0;   -- за цінами бази
    v_goods_alt numeric := 0;  -- те саме, але біля межі вікна — за старою
    v_before   numeric := 0;   -- до знижок
    v_eligible numeric := 0;   -- те, на що діє промокод
    v_elig_alt numeric := 0;
    v_percent  numeric := 0;
    v_only     bigint[];       -- на які товари діє код (null = на всі)
    v_min      numeric;
    v_promo    numeric := 0;
    v_delivery numeric := greatest(coalesce(new.delivery_price, 0), 0);
    v_total    numeric;
    v_total_alt numeric;
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
                   v_now) t;

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

        select price, old_price, sale_price, sale_from, sale_to
          into v_price, v_old, v_sale, v_from, v_to
          from public.prices
         where product_id = v_id;

        if not found then
            -- Товар щойно додали, а знімок цін ще не приїхав. Це не
            -- підробка — це неповні дані, і казати «сума не збіглася»
            -- тут означало б навчити власника ігнорувати позначку.
            v_unknown := true;
            continue;
        end if;

        -- Те саме правило, що saleActive() на сайті.
        v_live := coalesce(v_sale, 0) > 0
              and (v_from is null or v_now >= v_from)
              and (v_to   is null or v_now <  v_to);

        v_unit := case when v_live then v_sale else v_price end;

        -- Ціна, видна хвилину тому. Відрізняється тільки в межах
        -- GRACE від межі вікна; в усі інші хвилини — та сама.
        v_unit_alt := v_unit;

        if coalesce(v_sale, 0) > 0 then

            -- Сейл щойно почався: на відкритій сторінці ще звичайна ціна.
            if v_live and v_from is not null and v_now < v_from + c_grace then
                v_unit_alt := v_price;
            end if;

            -- Сейл щойно скінчився: на відкритій сторінці ще акційна.
            if not v_live and v_to is not null
               and v_now >= v_to and v_now < v_to + c_grace then
                v_unit_alt := v_sale;
            end if;

        end if;

        v_goods     := v_goods     + v_unit     * v_qty;
        v_goods_alt := v_goods_alt + v_unit_alt * v_qty;

        -- Перекреслена ціна: поки йде ціна дня, «старою» стає звичайна.
        v_before := v_before
            + coalesce(nullif(case when v_live then v_price else v_old end, 0), v_unit) * v_qty;

        -- Під знижку йде або весь кошик, або лише перелічені товари.
        if v_only is null or array_length(v_only, 1) is null or v_id = any(v_only) then
            v_eligible := v_eligible + v_unit     * v_qty;
            v_elig_alt := v_elig_alt + v_unit_alt * v_qty;
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

    v_total_alt := v_goods_alt - round(v_elig_alt * coalesce(v_percent, 0)) + v_delivery;

    -- У панель пишемо суму за ЧИННОЮ ціною: власник має бачити те,
    -- що коштує товар зараз, а не пільгу, яку ми дали межі вікна.
    new.total_expected := v_total;

    if new.price_check = 'mismatch' then
        return new;
    end if;

    -- Гривня допуску: округлення відсотка в браузері й у базі може
    -- розійтись на копійки, і кричати про це не варто.
    if v_unknown then
        new.price_check := 'unknown';
    elsif (abs(coalesce(new.total, 0) - v_total) > 1
           and abs(coalesce(new.total, 0) - v_total_alt) > 1)
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


-- --------------------------------------
-- ПЕРЕВІРКА
--
-- Після Run має повернути рядок з товарами, у яких зараз є ціна дня.
-- Порожньо — нормально: знімок цін приїде з наступною збіркою.
-- --------------------------------------

select
    product_id,
    price     as звичайна,
    sale_price as ціна_дня,
    sale_from as від,
    sale_to   as до
from public.prices
where sale_price is not null
order by product_id;

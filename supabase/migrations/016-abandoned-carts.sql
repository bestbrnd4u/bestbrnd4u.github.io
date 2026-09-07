-- ======================================
-- Брошений кошик: кому нагадати
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Кошик авторизованого покупця вже лежить у базі — його синхронізує
-- сайт, щоб людина бачила ті самі товари на телефоні й на комп'ютері.
-- Але далі з ним не відбувається нічого: наповнив кошик, закрив
-- вкладку — і все.
--
-- Лист «ви залишили щось у кошику» — найдешевший спосіб повернути
-- людину, яка вже все обрала. Дешевший за будь-яку рекламу: вона
-- прийшла сама, товар обрала сама, лишилось нагадати.
--
-- ЛИШЕ ДЛЯ АВТОРИЗОВАНИХ
--
-- У гостя ми не знаємо пошти, доки він не оформить замовлення — а
-- тоді нагадувати вже нічого. Тому це працює для тих, у кого є
-- кабінет: їхній кошик і їхня пошта в нас уже є, і йдеться про їхні
-- власні дані, а не про розсилку комусь.
-- --------------------------------------


-- --------------------------------------
-- 1. КОЛИ КОШИК ОСТАННІЙ РАЗ ЗМІНЮВАЛИ
--
-- Сайт синхронізує кошик найпростішим способом: видаляє всі рядки
-- користувача й вставляє поточні (див. pushCartToRemote у
-- assets/js/sync.js). Тому окремого тригера не потрібно: час вставки
-- рядка і є час останньої зміни кошика.
--
-- ТАБЛИЦЮ ТУТ НЕ СТВОРЮЄМО.
--
-- public.cart_items уже існує — її створювали разом із кабінетом, і з
-- нею працює assets/js/sync.js. Спершу тут стояло її створення «на
-- випадок, коли таблиці немає», і редактор Supabase справедливо
-- попередив: у такому створенні немає RLS.
--
-- Рядок був не лише зайвим, а й небезпечним у відповіді на те
-- попередження: кнопка «Run and enable RLS» дописала б увімкнення RLS
-- до таблиці, у якої вже є свої політики, — а якби політик не
-- виявилось, кошик перестав би відкриватись у всіх, хто увійшов.
--
-- Тому тут лишається тільки те, чого справді бракує: колонка з часом
-- останньої зміни. Якщо таблиці раптом немає, ALTER чесно впаде з
-- зрозумілою помилкою — це краще, ніж мовчки створити таблицю з
-- вгаданою схемою.
-- --------------------------------------

alter table public.cart_items
    add column if not exists updated_at timestamptz not null default now();

create index if not exists cart_items_updated_idx
    on public.cart_items (updated_at desc);


-- --------------------------------------
-- 2. КОМУ ВЖЕ НАГАДУВАЛИ
--
-- Одне нагадування на кошик. Другий лист про ті самі три товари — це
-- вже не нагадування, а надокучання, і найкоротший шлях у спам.
-- --------------------------------------

create table if not exists public.cart_reminders (

    user_id     uuid        primary key,

    -- Відбиток складу кошика. Змінився склад — можна нагадати ще раз;
    -- той самий склад — уже ні.
    fingerprint text        not null,

    sent_at     timestamptz not null default now()
);

alter table public.cart_reminders enable row level security;


-- --------------------------------------
-- 3. КОГО САМЕ НАГАДУВАТИ
--
-- Умови всі разом:
--   • у кошику щось є;
--   • кошика не торкались щонайменше p_idle (типово 4 години) — людина
--     справді пішла, а не пішла на кухню;
--   • але не давніше 30 днів: кошик місячної давнини це не «забув», а
--     «передумав»;
--   • після останньої зміни кошика замовлень не було — інакше ми
--     нагадували б про те, що вже куплено;
--   • про цей самий склад кошика ще не писали.
--
-- ЧОМУ ФУНКЦІЯ, А НЕ ЗАПИТ У СКРИПТІ
--
-- Тут потрібна пошта з auth.users — таблиці, до якої в клієнта немає
-- і не має бути доступу. Функція з правами власника віддає лише те,
-- що потрібно листу, і лише службовому ключу (grant нижче).
-- --------------------------------------

create or replace function public.abandoned_carts(
    p_idle  interval default interval '4 hours',
    p_limit integer  default 50
)
returns table (
    user_id     uuid,
    email       text,
    fingerprint text,
    items       jsonb
)
language sql
security definer
set search_path = public, auth
stable
as $$
    with carts as (
        select
            c.user_id,
            max(c.updated_at) as touched,
            -- Відбиток: склад кошика в стабільному порядку.
            md5(string_agg(
                c.product_id || '|' || coalesce(c.color, '') || '|'
                    || coalesce(c.size, '') || '|' || c.qty,
                ',' order by c.product_id, c.color, c.size
            )) as fingerprint,
            jsonb_agg(jsonb_build_object(
                'product_id', c.product_id,
                'color', c.color,
                'size', c.size,
                'qty', c.qty
            ) order by c.product_id) as items
        from public.cart_items c
        group by c.user_id
    )
    select
        carts.user_id,
        u.email::text,
        carts.fingerprint,
        carts.items
    from carts
    join auth.users u on u.id = carts.user_id
    left join public.cart_reminders r on r.user_id = carts.user_id
    where u.email is not null
      and carts.touched < now() - p_idle
      and carts.touched > now() - interval '30 days'
      -- Замовлення після останньої зміни кошика означає, що людина
      -- дійшла до кінця. Нагадувати про куплене — найгірший варіант.
      and not exists (
          select 1 from public.orders o
          where o.user_id = carts.user_id
            and o.created_at > carts.touched
      )
      and (r.user_id is null or r.fingerprint <> carts.fingerprint)
    order by carts.touched
    limit greatest(p_limit, 0);
$$;

-- ⚠️ ТІЛЬКИ службовому ключу. Ця функція віддає пошти покупців — anon
-- і authenticated не мають до неї доступу навмисно.
revoke all on function public.abandoned_carts(interval, integer) from public;
revoke all on function public.abandoned_carts(interval, integer) from anon, authenticated;
grant execute on function public.abandoned_carts(interval, integer) to service_role;


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
-- Чи закритий кошик від чужих очей (мусить бути rls = true й хоча б
-- одна політика):
--
--   select c.relrowsecurity as rls,
--          (select count(*) from pg_policies
--            where schemaname = 'public' and tablename = 'cart_items') as політик
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'cart_items';
--
-- Кого нагадувати:
--
--   select user_id, email, jsonb_array_length(items) as позицій
--     from public.abandoned_carts(interval '0 hours');
--
-- Нуль годин — щоб побачити всі кошики, які взагалі є. У роботі крок
-- бере 4 години.
--
-- Кому вже писали:
--
--   select * from public.cart_reminders order by sent_at desc;
--
-- Щоб нагадати повторно (наприклад, після зміни тексту листа):
--
--   delete from public.cart_reminders where user_id = '<id>';
-- --------------------------------------

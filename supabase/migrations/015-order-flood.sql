-- ======================================
-- Захист від потоку замовлень
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Замовлення в базу кладе сам браузер — публічним ключем, який лежить
-- у коді сайту. Так і має бути: інакше гість не зміг би замовити. Але
-- це означає, що надіслати замовлення може будь-хто і скільки
-- завгодно разів, не відкриваючи сайту взагалі.
--
-- Наслідки не гіпотетичні: сотня підроблених замовлень за хвилину це
-- сотня повідомлень у Telegram, засмічена панель — і, найгірше,
-- зайняті залишки. Перевірка «останній екземпляр» (011) вважає кожне
-- відкрите замовлення зайнятою одиницею, тож фальшивий потік прибрав
-- би з продажу реальні товари.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Рахує, скільки замовлень прийшло з тієї самої адреси за останню
-- годину, і скільки їх усього. Перевищено — вставку відхилено.
--
-- ЦЕ НЕ ЗАМІНЮЄ TURNSTILE, а працює під ним: перевірка «ви людина»
-- живе на сайті й у функції, а це — остання лінія, яка діє незалежно
-- від того, звідки прийшов запит.
-- --------------------------------------


-- --------------------------------------
-- ЧОМУ ВІД АДРЕСИ ЛИШАЄТЬСЯ ХЕШ
--
-- Для підрахунку потрібно лише розрізняти «той самий чи інший» — сама
-- адреса не потрібна. Зберігати IP означало б завести базу
-- персональних даних там, де без неї можна обійтись.
--
-- Сіль робить хеш безглуздим за межами цієї таблиці: без неї перебрати
-- усі IPv4 адреси — справа хвилин.
-- --------------------------------------

-- gen_random_bytes() і digest() дає pgcrypto. У Supabase він зазвичай
-- уже увімкнений у схемі extensions; рядок нижче нічого не змінює,
-- якщо це так.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.order_throttle (

    id         bigserial   primary key,

    -- SHA-256 від «сіль + адреса».
    ip_hash    text        not null,

    created_at timestamptz not null default now()
);

create index if not exists order_throttle_seen_idx
    on public.order_throttle (created_at desc);

create index if not exists order_throttle_ip_idx
    on public.order_throttle (ip_hash, created_at desc);

alter table public.order_throttle enable row level security;


-- Сіль лічильника. Своя на проєкт, згенерована один раз.
create table if not exists public.throttle_salt (

    id   integer primary key default 1 check (id = 1),

    salt text    not null
);

alter table public.throttle_salt enable row level security;

insert into public.throttle_salt (id, salt)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;


-- --------------------------------------
-- САМА ПЕРЕВІРКА
--
-- Межі навмисно високі. Задача — зупинити потік, а не рахувати
-- покупки: за годину з однієї адреси можна оформити 15 замовлень, і
-- жоден живий магазин у це не впирається. А ось скрипт впирається на
-- першій же секунді.
--
-- Глобальна межа — на випадок, коли адрес багато. 150 замовлень за
-- годину це вп'ятеро більше за найкращий день магазину; далі вже не
-- продажі, а щось інше.
-- --------------------------------------

create or replace function public.orders_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role  text := coalesce(current_setting('request.jwt.claim.role', true), '');
    v_ip    text;
    v_hash  text;
    v_mine  integer;
    v_all   integer;
begin

    -- Замовлення від бота й будь-які службові вставки йдуть із
    -- ключем service_role — тобто з ОДНІЄЇ адреси на всіх. Рахувати їх
    -- за адресою означало б заблокувати бота на п'ятнадцятому
    -- замовленні.
    if v_role in ('service_role', 'supabase_admin') then
        return new;
    end if;

    -- Прибираємо старе. Дешевше, ніж окремий крок за розкладом:
    -- таблиця й так мала, а рядки старші за добу нікому не потрібні.
    delete from public.order_throttle where created_at < now() - interval '1 day';

    select count(*) into v_all
    from public.order_throttle
    where created_at > now() - interval '1 hour';

    if v_all >= 150 then
        raise exception 'order rate limit (global)'
            using errcode = 'P0429',
                  hint = 'Забагато замовлень. Спробуйте за кілька хвилин.';
    end if;

    -- Адреса відвідувача. PostgREST кладе заголовки запиту в
    -- налаштування транзакції; за проксі там кілька адрес через кому —
    -- беремо першу, це і є клієнт.
    v_ip := split_part(coalesce(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        ''), ',', 1);

    if btrim(v_ip) = '' then
        -- Адреси немає (запит не через PostgREST) — лишається сама
        -- глобальна межа.
        return new;
    end if;

    select encode(digest(salt || btrim(v_ip), 'sha256'), 'hex')
      into v_hash
      from public.throttle_salt
     where id = 1;

    select count(*) into v_mine
    from public.order_throttle
    where ip_hash = v_hash
      and created_at > now() - interval '1 hour';

    if v_mine >= 15 then
        raise exception 'order rate limit (per client)'
            using errcode = 'P0429',
                  hint = 'Забагато замовлень з цього пристрою. Напишіть нам у Telegram.';
    end if;

    insert into public.order_throttle (ip_hash) values (v_hash);

    return new;

exception

    -- Перевищена межа — це НЕ несподіванка, а відповідь. Власний код
    -- P0429 відрізняє її від будь-якої іншої помилки нижче.
    when sqlstate 'P0429' then

        raise;

    when others then

        -- Будь-яка інша несподіванка (немає digest, змінився формат
        -- заголовків, впала сама таблиця) не має зупиняти продажі.
        -- Той самий принцип, що в перевірці залишків: замовлення
        -- важливіше за лічильник.
        raise warning 'orders_rate_limit: %', sqlerrm;

        return new;

end;
$$;

drop trigger if exists orders_rate_limit on public.orders;

-- ПЕРШИМ серед тригерів вставки: якщо замовлення відхилено, решті
-- перевірок нема чого рахувати. Postgres викликає тригери в
-- алфавітному порядку назв, і «orders_rate_limit» іде після
-- «orders_check_pricing», але це нічого не змінює — обидві попередні
-- перевірки лише проставляють поля.
create trigger orders_rate_limit
    before insert on public.orders
    for each row
    execute function public.orders_rate_limit();


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select count(*) from public.order_throttle
--    where created_at > now() - interval '1 hour';
--
-- Скільки спроб було за годину. Таблиця чиститься сама.
--
-- ЯКЩО ЖИВОГО ПОКУПЦЯ ЗАБЛОКУВАЛО (буває за спільним інтернетом в
-- офісі чи гуртожитку):
--
--   delete from public.order_throttle
--    where created_at > now() - interval '1 hour';
--
-- Це обнуляє лічильник для всіх.
-- --------------------------------------

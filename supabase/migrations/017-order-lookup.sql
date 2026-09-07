-- ======================================
-- Межа звернень до сторінки «Де моє замовлення»
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Гість, який замовив без реєстрації, не бачить свого замовлення в
-- кабінеті: той шукає за user_id, а в гостя його немає. Сторінка
-- «Де моє замовлення» дає йому подивитись стан за номером і
-- телефоном.
--
-- Це відкритий запит, який повертає ПЕРСОНАЛЬНІ ДАНІ: склад покупки,
-- відділення, номер накладної. Перевірка одна — телефон мусить
-- збігтися з тим, що в замовленні (order-lookup.js). Її не обійти
-- підбором номера замовлення: без телефону відповідь однакова з
-- «такого замовлення немає».
--
-- Але сам ПІДБІР теж треба зупиняти: той, хто знає чийсь телефон,
-- інакше міг би перебирати номери замовлень, поки не влучить. Кілька
-- звернень на годину з адреси — це живий покупець; кілька тисяч — це
-- вже не покупець.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Рахує звернення з тієї самої адреси за останню годину. Перевищено —
-- функція відповідає «зачекайте», не звертаючись до таблиці замовлень
-- узагалі.
-- --------------------------------------


-- --------------------------------------
-- ЧОМУ ВІД АДРЕСИ ЛИШАЄТЬСЯ ХЕШ
--
-- Для лічильника потрібно лише розрізняти «той самий чи інший» — сама
-- адреса не потрібна. Зберігати IP означало б завести базу
-- персональних даних там, де без неї можна обійтись.
--
-- Сіль беремо ТУ САМУ, що в межі замовлень (міграція 015): друга
-- сіль нічого не додала б, а зайва таблиця жила б своїм життям.
-- --------------------------------------

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lookup_throttle (

    id         bigserial   primary key,

    -- SHA-256 від «сіль + адреса».
    ip_hash    text        not null,

    created_at timestamptz not null default now()
);

create index if not exists lookup_throttle_seen_idx
    on public.lookup_throttle (created_at desc);

create index if not exists lookup_throttle_ip_idx
    on public.lookup_throttle (ip_hash, created_at desc);

-- RLS увімкнено, політик немає — тобто таблиця закрита для всіх, крім
-- службового ключа. Читати лічильник звернень нема кому.
alter table public.lookup_throttle enable row level security;

-- Сіль створює міграція 015. Якщо її ще не застосували — створюємо
-- тут, щоб порядок запуску не мав значення.
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
-- Викликає її функція Edge (не браузер), тому адресу передаємо
-- параметром: до PostgREST цей запит не доходить, і заголовків
-- request.headers тут немає.
--
-- Межі: 20 звернень з адреси за годину. Людина, яка стежить за своєю
-- посилкою, відкриває сторінку 2-3 рази на день; 20 — це вже з
-- запасом на спільний інтернет в офісі. Глобальна межа на випадок,
-- коли адрес багато.
-- --------------------------------------

create or replace function public.order_lookup_allowed(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_hash text;
    v_mine integer;
    v_all  integer;
begin

    -- Прибираємо старе. Дешевше, ніж окремий крок за розкладом:
    -- таблиця й так мала, а рядки старші за добу нікому не потрібні.
    delete from public.lookup_throttle where created_at < now() - interval '1 day';

    select count(*) into v_all
    from public.lookup_throttle
    where created_at > now() - interval '1 hour';

    if v_all >= 400 then
        return false;
    end if;

    if btrim(coalesce(p_ip, '')) = '' then
        -- Адреси немає — лишається сама глобальна межа. Рядок не
        -- пишемо: інакше всі безадресні запити склеїлись би в один
        -- лічильник і блокували одне одного.
        return true;
    end if;

    select encode(digest(salt || btrim(p_ip), 'sha256'), 'hex')
      into v_hash
      from public.throttle_salt
     where id = 1;

    select count(*) into v_mine
    from public.lookup_throttle
    where ip_hash = v_hash
      and created_at > now() - interval '1 hour';

    if v_mine >= 20 then
        return false;
    end if;

    insert into public.lookup_throttle (ip_hash) values (v_hash);

    return true;

exception

    when others then

        -- ЛІЧИЛЬНИК ЗЛАМАВСЯ — ПРОПУСКАЄМО.
        --
        -- Той самий принцип, що в решті запобіжників проєкту, і тут
        -- він особливо доречний: справжня перевірка — це збіг
        -- телефону, а не лічильник. Без телефону перебір номерів
        -- нічого не дає навіть без будь-якої межі; а зламаний
        -- лічильник, який відповідає «ні», перекрив би сторінку всім
        -- покупцям одразу.
        raise warning 'order_lookup_allowed: %', sqlerrm;

        return true;

end;
$$;


-- --------------------------------------
-- ПРАВА
--
-- Викликати може ЛИШЕ службовий ключ, тобто наша функція Edge.
-- Браузер із публічним ключем (anon) не має тут чого робити: він
-- питає функцію, а функція — базу.
-- --------------------------------------

revoke all on function public.order_lookup_allowed(text) from public;
revoke all on function public.order_lookup_allowed(text) from anon, authenticated;
grant execute on function public.order_lookup_allowed(text) to service_role;


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select public.order_lookup_allowed('203.0.113.1');
--
-- Перші 20 викликів дадуть true, далі false до кінця години.
--
--   select count(*) from public.lookup_throttle
--    where created_at > now() - interval '1 hour';
--
-- Скільки звернень було за годину. Таблиця чиститься сама.
--
-- ЯКЩО ЖИВОГО ПОКУПЦЯ ЗАБЛОКУВАЛО:
--
--   delete from public.lookup_throttle;
--
-- Це обнуляє лічильник для всіх.
-- --------------------------------------

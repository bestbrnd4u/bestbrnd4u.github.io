-- ======================================
-- Незавершене оформлення замовлення (гості)
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Нагадування про брошений кошик (міграція 016) працює тільки для
-- авторизованих: їхній кошик синхронізується в базу, а пошта лежить у
-- auth.users. Кошик гостя живе в localStorage браузера — у базі його
-- немає, і нагадати нема куди.
--
-- А гості — більшість. Замовлення з сайту пишеться з user_id = null
-- частіше, ніж з іменем користувача.
--
-- Але є місце, де пошта гостя таки з'являється ДО замовлення:
-- сторінка оформлення. Людина заповнила пошту, дійшла до кнопки — і
-- не натиснула. Це найгарячіша втрата, яка в магазині буває, і адреса
-- при цьому в нас уже є.
--
-- ЩО ЦЕ РОБИТЬ
--
-- Зберігає ОДИН рядок на адресу: склад кошика + коли торкались. За
-- розкладом scripts/remind-carts.js забирає ті, яких не торкались
-- 4 години, і надсилає одне нагадування.
-- --------------------------------------


-- --------------------------------------
-- ДЕ ТУТ МЕЖА, І ЧОМУ ВОНА САМЕ ТАКА
--
-- Лист «ви не завершили замовлення» — це про угоду, яку людина
-- почала САМА, і в ньому немає нічого, чого вона не бачила хвилину
-- тому на екрані.
--
-- Але це НЕ згода на розсилку. Тому:
--   • адреса не потрапляє ні в MailerLite, ні в жоден список;
--   • лист — один на адресу, і не частіше, ніж раз на 30 днів;
--   • рядок живе 30 днів і зникає сам (нижче в save_checkout_draft).
--
-- Технічно різниця між цим і «додати в базу підписників» — один
-- рядок коду. За змістом — усе. Другого тут немає навмисно.
-- --------------------------------------

create table if not exists public.checkout_drafts (

    -- Нормалізована пошта: одна адреса — один рядок. Первинний ключ
    -- саме тут, щоб повторне заповнення форми оновлювало той самий
    -- рядок, а не плодило десять.
    email       text        primary key,

    -- Склад кошика: [{product_id, color, size, qty}].
    --
    -- Тільки посилання на товар — назви, ціни й фото беруться з
    -- зібраного каталогу в момент відправки листа (як у
    -- abandoned_carts). Зберігати тут ще й назви означало б тримати
    -- зайві дані, які до того ж застаріють.
    items       jsonb       not null,

    -- Відбиток складу: за ним видно, що людина повернулась і змінила
    -- кошик, а не просто відкрила сторінку вдруге.
    fingerprint text        not null,

    updated_at  timestamptz not null default now(),

    -- Коли надіслали нагадування. null — ще не писали.
    notified_at timestamptz
);

create index if not exists checkout_drafts_touched_idx
    on public.checkout_drafts (updated_at desc);

-- RLS увімкнено, політик немає — таблиця закрита для всіх, крім
-- службового ключа. У ній пошти живих людей: ні anon, ні
-- authenticated тут нічого не читають і не пишуть.
alter table public.checkout_drafts enable row level security;


-- --------------------------------------
-- ЗАПИС
--
-- Викликає функція Edge службовим ключем (браузер сюди не доходить —
-- він звертається до функції, а функція до бази).
--
-- Відбиток рахуємо ТУТ, а не в браузері: інакше клієнт міг би
-- надіслати будь-який рядок і зіпсувати перевірку «склад змінився».
-- --------------------------------------

create or replace function public.save_checkout_draft(
    p_email text,
    p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
    v_print text;
begin

    v_email := lower(btrim(coalesce(p_email, '')));

    if v_email = '' or position('@' in v_email) = 0 then
        return;
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array'
        or jsonb_array_length(p_items) = 0 then
        return;
    end if;

    -- Прибираємо старе. Дешевше за окремий крок у розкладі, а головне
    -- — рядок із поштою не має лежати тут вічно: через 30 днів
    -- нагадувати вже нема про що.
    delete from public.checkout_drafts
     where updated_at < now() - interval '30 days';

    select md5(string_agg(
               coalesce(item->>'product_id', '') || '|'
                   || coalesce(item->>'color', '') || '|'
                   || coalesce(item->>'size', '') || '|'
                   || coalesce(item->>'qty', ''),
               ',' order by item->>'product_id', item->>'color', item->>'size'
           ))
      into v_print
      from jsonb_array_elements(p_items) as item;

    insert into public.checkout_drafts (email, items, fingerprint, updated_at)
    values (v_email, p_items, coalesce(v_print, ''), now())
    on conflict (email) do update
       set items       = excluded.items,
           fingerprint = excluded.fingerprint,
           updated_at  = now();

exception

    when others then

        -- ЗАПИС ЗЛАМАВСЯ — МОВЧИМО.
        --
        -- Той самий принцип, що в решті запобіжників: це допоміжна
        -- річ, і вона не має жодного права зашкодити оформленню
        -- замовлення, яке зараз відбувається на екрані.
        raise warning 'save_checkout_draft: %', sqlerrm;

end;
$$;

revoke all on function public.save_checkout_draft(text, jsonb) from public;
revoke all on function public.save_checkout_draft(text, jsonb) from anon, authenticated;
grant execute on function public.save_checkout_draft(text, jsonb) to service_role;


-- --------------------------------------
-- КОГО НАГАДУВАТИ
--
-- Умови (усі мусять виконатись):
--   • оформлення не торкались p_idle (за замовчуванням 4 години) —
--     людина справді пішла;
--   • торкались за останні 7 днів — пізніше нагадування вже не про
--     цю покупку, а просто лист від магазину;
--   • після цього не було замовлення з ЦІЄЮ поштою — інакше ми
--     нагадували б про вже куплене;
--   • цієї пошти немає в auth.users — інакше про той самий кошик
--     прийшло б два листи: цей і від abandoned_carts;
--   • ще не писали, або писали давніше ніж 30 днів тому І кошик з
--     того часу змінився.
-- --------------------------------------

create or replace function public.abandoned_checkouts(
    p_idle  interval default interval '4 hours',
    p_limit integer  default 50
)
returns table (
    email       text,
    fingerprint text,
    items       jsonb
)
language sql
security definer
set search_path = public, auth
stable
as $$
    select
        d.email,
        d.fingerprint,
        d.items
    from public.checkout_drafts d
    where d.updated_at < now() - p_idle
      and d.updated_at > now() - interval '7 days'
      and (
          d.notified_at is null
          or (d.notified_at < now() - interval '30 days'
              and d.notified_at < d.updated_at)
      )
      and not exists (
          select 1 from public.orders o
          where lower(o.email) = d.email
            and o.created_at > d.updated_at
      )
      and not exists (
          select 1 from auth.users u
          where lower(u.email) = d.email
      )
    order by d.updated_at
    limit greatest(p_limit, 0);
$$;

-- ⚠️ ТІЛЬКИ службовому ключу: функція віддає пошти людей.
revoke all on function public.abandoned_checkouts(interval, integer) from public;
revoke all on function public.abandoned_checkouts(interval, integer) from anon, authenticated;
grant execute on function public.abandoned_checkouts(interval, integer) to service_role;


-- --------------------------------------
-- ПОЗНАЧКА «НАПИСАЛИ»
--
-- Окремою функцією, а не update через PostgREST: таблиця закрита
-- навмисно, і відкривати її на запис заради однієї колонки не варто.
-- --------------------------------------

create or replace function public.mark_checkout_notified(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
    update public.checkout_drafts
       set notified_at = now()
     where email = lower(btrim(coalesce(p_email, '')));
$$;

revoke all on function public.mark_checkout_notified(text) from public;
revoke all on function public.mark_checkout_notified(text) from anon, authenticated;
grant execute on function public.mark_checkout_notified(text) to service_role;


-- --------------------------------------
-- ЗАМОВЛЕННЯ ПРИЙШЛО — ЧЕРНЕТКА БІЛЬШЕ НЕ ПОТРІБНА
--
-- Функція abandoned_checkouts і так не візьме адресу, з якої вже
-- зробили замовлення. Але тримати пошту людини «про запас» тридцять
-- днів після того, як вона все купила, нема сенсу: зайвих
-- персональних даних не має бути навіть закритих.
--
-- ЧОМУ ТРИГЕР, А НЕ РЯДОК У КОДІ
--
-- Замовлення з'являються ТРЬОМА шляхами: сайт, бот у Telegram і
-- панель. Рядок у коді довелось би писати тричі й один із них
-- забути; тригер спрацює на будь-якому.
-- --------------------------------------

create or replace function public.forget_checkout_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

    if new.email is not null and btrim(new.email) <> '' then

        delete from public.checkout_drafts
         where email = lower(btrim(new.email));

    end if;

    return new;

exception

    when others then

        -- ЗАМОВЛЕННЯ ВАЖЛИВІШЕ. Прибирання чернетки не має жодного
        -- права зламати вставку замовлення — це те, за чим людина
        -- прийшла в магазин.
        raise warning 'forget_checkout_draft: %', sqlerrm;

        return new;

end;
$$;

drop trigger if exists orders_forget_checkout_draft on public.orders;

create trigger orders_forget_checkout_draft
    after insert on public.orders
    for each row
    execute function public.forget_checkout_draft();


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select public.save_checkout_draft('test@example.com',
--       '[{"product_id":1,"color":"Чорний","size":"M","qty":1}]'::jsonb);
--
--   select email, fingerprint, updated_at, notified_at
--     from public.checkout_drafts;
--
-- Кого візьме розсилка прямо зараз (без очікування 4 годин):
--
--   select * from public.abandoned_checkouts(interval '0 minutes', 10);
--
-- Прибрати тестовий рядок:
--
--   delete from public.checkout_drafts where email = 'test@example.com';
-- --------------------------------------

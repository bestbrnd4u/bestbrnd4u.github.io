-- ======================================
-- Блокування адреси: ні замовлень, ні листів
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Форма замовлення відкрита всім, і це правильно: покупцю не треба
-- реєструватись, щоб купити. Але з тієї ж причини її може взяти й
-- бот — накидати порожніх замовлень, зайняти залишки, набити
-- розсилку. Досі проти цього була лише перевірка «ви людина», а коли
-- вона пройдена, зупинити конкретного відправника було нічим.
--
-- ЧОМУ ЗА ПОШТОЮ, А НЕ ЗА АКАУНТОМ
--
-- Замовлення прив'язане до пошти, а не до кабінету: гість купує без
-- реєстрації взагалі. Заблокувати обліковий запис означало б
-- зупинити лише тих, хто входить, — тобто саме не тих.
--
-- Обліковий запис теж блокується, але окремо й на додачу (у панелі,
-- через Auth API): це закриває вхід у кабінет.
--
-- ЧОМУ ТРИГЕР, А НЕ ПЕРЕВІРКА У ФУНКЦІЇ
--
-- Перевірка у функції закриває один шлях, а їх два: коли не заданий
-- ключ Turnstile, сторінка оформлення пише замовлення прямо в базу
-- (так магазин працював до появи функції). Тригер стоїть під обома —
-- і під будь-яким третім, який з'явиться потім.
-- --------------------------------------

create table if not exists public.blocked_emails (
    email      text primary key,
    reason     text,
    created_at timestamptz not null default now()
);


comment on table public.blocked_emails is
    'Адреси, яким заборонено оформлювати замовлення й отримувати листи. Керується з адмінки, «Покупці й підписники».';

comment on column public.blocked_emails.reason is
    'Навіщо заблоковано — щоб через півроку було зрозуміло, чому ця адреса тут.';


-- ЗАКРИТО ВІД БРАУЗЕРА ПОВНІСТЮ.
--
-- RLS увімкнено, політик немає жодної — отже читати й писати може
-- лише service_role, тобто Edge Function і скрипти розсилок. Список
-- заблокованих не мусить бути видно нікому іншому: він сам по собі
-- каже, хто саме звертався до магазину.
alter table public.blocked_emails enable row level security;


-- --------------------------------------
-- Тригер: заблокована адреса не оформить замовлення
--
-- SECURITY DEFINER тут обов'язковий. Замовлення вставляє анонімна
-- роль, а таблиця вище закрита RLS — без цього тригер просто не
-- побачив би жодного рядка й пропускав би всіх.
--
-- search_path прибитий до public навмисно: у SECURITY DEFINER це
-- захист від підміни таблиці через власний схемний шлях.
-- --------------------------------------

create or replace function public.reject_blocked_order()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin

    if new.email is not null and exists (
        select 1 from public.blocked_emails
        where email = lower(btrim(new.email))
    ) then
        raise exception 'blocked_email'
            using hint = 'Адреса заблокована в адмінці магазину.';
    end if;

    return new;

end;
$$;


drop trigger if exists orders_reject_blocked on public.orders;

create trigger orders_reject_blocked
    before insert on public.orders
    for each row execute function public.reject_blocked_order();


-- Незавершене оформлення теж не збираємо: інакше блокований і далі
-- отримував би листи «ви щось залишили в кошику».
drop trigger if exists checkout_drafts_reject_blocked on public.checkout_drafts;

create trigger checkout_drafts_reject_blocked
    before insert on public.checkout_drafts
    for each row execute function public.reject_blocked_order();

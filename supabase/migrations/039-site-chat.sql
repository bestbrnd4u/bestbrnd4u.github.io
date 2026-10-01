-- ======================================
-- Чат на сайті, відповіді — з Telegram
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Кнопка «Написати нам» досі лише показувала канали: Telegram,
-- Instagram, пошта, телефон. Це чесно, але кожен із них — це вихід
-- із сайту. Людина, яка стоїть на картці товару з питанням «а чи є
-- менший розмір», має написати його НЕ ВИХОДЯЧИ, інакше половина
-- просто не напише.
--
-- Тепер вона пише прямо в панелі. Повідомлення прилітає власнику в
-- Telegram — туди, де він уже сидить і куди приходять замовлення.
-- Власник відповідає РЕПЛАЄМ, і відповідь зʼявляється на сайті.
--
-- Окремої панелі оператора немає навмисно: ще одне місце, куди треба
-- заходити, означає, що туди не заходитимуть.
--
--
-- ЧОМУ ЖОДНОЇ ПОЛІТИКИ RLS
--
-- RLS увімкнено, політик немає — це не забутий крок, а «нікому, крім
-- service_role». Переписка містить те, що людина написала про себе:
-- розмір, бюджет, інколи телефон. Читати й писати може лише Edge
-- Function, і лише за токеном нитки.
--
--
-- ЩО Є КЛЮЧЕМ ДО ПЕРЕПИСКИ
--
-- Токен нитки (uuid) у localStorage браузера. Хто його має — той і
-- читає. Тому він НЕ виводиться ніде, крім того самого браузера, і
-- не потрапляє в адресу сторінки: адреси лишаються в історії, у
-- реферерах і в чужих журналах.
--
-- Акаунт для цього не потрібен: більшість питань ставлять до
-- реєстрації, і вимагати її тут означало б не отримати питання.
-- --------------------------------------


-- --------------------------------------
-- НИТКА РОЗМОВИ
-- --------------------------------------

create table if not exists public.chat_threads (

    -- Він же токен доступу. Дивись «ЩО Є КЛЮЧЕМ» вище.
    id              uuid primary key default gen_random_uuid(),

    created_at      timestamptz not null default now(),

    -- Для сортування в боті: свіжі розмови зверху.
    last_message_at timestamptz not null default now(),

    -- Сторінка, з якої написали ПЕРШЕ повідомлення. На картці товару
    -- це половина розмови: одразу видно, про що питають.
    page            text        not null default '',

    -- Браузер. Потрібен тут з тієї ж причини, що в журналі помилок:
    -- відрізнити живу людину від автоматики.
    agent           text        not null default '',

    -- Ставить власник командою /chatblock. Заблокована нитка більше
    -- не приймає повідомлень і не турбує Telegram.
    blocked         boolean     not null default false
);


create index if not exists chat_threads_last_idx
    on public.chat_threads (last_message_at desc);


-- --------------------------------------
-- ПОВІДОМЛЕННЯ
-- --------------------------------------

create table if not exists public.chat_messages (

    id            bigserial primary key,

    thread_id     uuid        not null
                  references public.chat_threads(id) on delete cascade,

    -- 'visitor' або 'owner'. Текстом, а не enum: третій учасник тут
    -- не планується, але enum довелось би міняти міграцією.
    author        text        not null,

    body          text        not null,

    created_at    timestamptz not null default now(),

    -- ЯК ВІДПОВІДЬ ЗНАХОДИТЬ СВОЮ НИТКУ.
    --
    -- Telegram не знає ні про які нитки. Коли бот пересилає
    -- повідомлення власнику, він запамʼятовує message_id тієї
    -- картки. Власник відповідає РЕПЛАЄМ — у вебхуці приходить
    -- reply_to_message.message_id, і по ньому знаходиться нитка.
    --
    -- Зберігаємо його і для власних відповідей теж: тоді реплай на
    -- власне старе повідомлення в тій самій розмові теж спрацює, а
    -- не лише на останнє від покупця.
    tg_message_id bigint,

    -- Чи бачив це відвідувач. Потрібне для крапки на кнопці: людина
    -- закрила панель, власник відповів — повернувшись на сайт, вона
    -- має побачити, що на неї чекають.
    seen          boolean     not null default false
);


create index if not exists chat_messages_thread_idx
    on public.chat_messages (thread_id, id);

-- Пошук нитки за реплаєм із Telegram. Без індексу це був би перебір
-- усієї переписки на кожну відповідь власника.
create index if not exists chat_messages_tg_idx
    on public.chat_messages (tg_message_id)
    where tg_message_id is not null;


alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;


comment on table public.chat_threads is
    'Розмови з чату на сайті. Читає й пише лише Edge Function (service_role); ключ до розмови — її id у localStorage браузера.';

comment on table public.chat_messages is
    'Повідомлення чату. tg_message_id звʼязує картку в Telegram із ниткою, щоб реплай власника знайшов адресата.';


-- --------------------------------------
-- МЕЖА ЗВЕРНЕНЬ
--
-- Чат — це спосіб писати в базу без замовлення й без реєстрації,
-- тобто те саме, що журнал помилок і пошук відділення. Без межі
-- один скрипт за ніч зробить тисячі ниток і стільки ж повідомлень
-- у Telegram.
--
-- Рахуємо ПО НИТЦІ, а не по IP: IP у мобільному операторі спільний
-- на тисячі людей, і межа по ньому відрізала б цілі міста. Нитка —
-- це одна вкладка однієї людини.
--
-- 30 повідомлень на годину — це більше, ніж буває в живій розмові,
-- і значно менше, ніж треба, щоб завалити Telegram.
-- --------------------------------------

create or replace function public.chat_allowed(p_thread uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_recent integer;
    v_blocked boolean;
begin

    select blocked into v_blocked
      from public.chat_threads
     where id = p_thread;

    if v_blocked is null or v_blocked then
        return false;
    end if;

    select count(*) into v_recent
      from public.chat_messages
     where thread_id = p_thread
       and author = 'visitor'
       and created_at > now() - interval '1 hour';

    return v_recent < 30;

exception when others then

    -- Межа не має права ламати те, що її покликало. Не змогли
    -- порахувати — пропускаємо: мовчазний чат гірший за зайве
    -- повідомлення.
    raise warning 'chat_allowed: %', sqlerrm;
    return true;

end;
$$;


-- Викликає лише Edge Function службовим ключем. Браузер із публічним
-- ключем сюди не дістане — як і до самих таблиць.
revoke execute on function public.chat_allowed(uuid) from anon, authenticated;


-- --------------------------------------
-- ЩЕ ОДИН РІЗНОВИД ЗАПИСУ В ЖУРНАЛ: site_chat
--
-- Якщо Telegram не прийняв повідомлення з чату, людина лишається з
-- відчуттям «написала й тиша», а власник не знає, що хтось писав.
-- Самим це не помітити ніяк — тому пишемо в журнал як ПОЛОМКУ.
--
-- Функція переписується цілком (як і в кожній попередній міграції),
-- тож порядок запуску 038 → 039 дає перелік з обома новими.
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

    -- ЩО ЗМІНИЛОСЬ проти міграції 038: додано site_chat.
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
    if v_kind not in ('js_error', 'not_found', 'meta_capi', 'stock_out',
                      'mail_list', 'search_miss', 'np_directory',
                      'turnstile_skip', 'call_back', 'site_chat') then
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
--   insert into public.chat_threads (page) values ('/catalog')
--   returning id;
--
--   -- підставити отриманий id
--   select public.chat_allowed('…');            -- має бути true
--
--   insert into public.chat_messages (thread_id, author, body)
--   values ('…', 'visitor', 'тест');
--
--   select author, body, seen from public.chat_messages
--    where thread_id = '…';
--
-- Прибрати тестову нитку (повідомлення підуть за нею самі —
-- on delete cascade):
--
--   delete from public.chat_threads where id = '…';
--
--
-- СКІЛЬКИ ЦЕ ЗАЙМАЄ МІСЦЯ. Переписка — це текст, і навіть тисяча
-- розмов по двадцять повідомлень це одиниці мегабайт. Чистити
-- нічого не треба; якщо колись захочеться:
--
--   delete from public.chat_threads
--    where last_message_at < now() - interval '1 year';
-- --------------------------------------

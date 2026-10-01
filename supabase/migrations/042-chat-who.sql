-- ======================================
-- Хто саме пише в чаті
--
-- Виконати ОДИН раз у Supabase → SQL Editor → New query: вставити
-- весь файл і натиснути Run. Повторний запуск безпечний.
-- ======================================


-- --------------------------------------
-- НАВІЩО
--
-- Усі картки в Telegram виглядали однаково: «Питання з сайту» й текст.
-- Коли пишуть двоє одночасно, власник не бачить, де чия репліка, —
-- і відповідає не тому.
--
-- Тепер у кожній картці перший рядок каже, хто це:
--
--     👤 Гість #7
--     👤 Олена Коваль · olena@example.com
--
-- ДВА ВИПАДКИ, І ВОНИ РІЗНІ
--
-- Більшість питань ставлять ДО реєстрації — людина щойно зайшла й
-- дивиться товар. Імені в неї немає й не буде, тож їй потрібен
-- номер: короткий, незмінний у межах розмови, і такий, що його можна
-- вимовити («відповідаю гостю сім»).
--
-- Той, хто увійшов, має імʼя й пошту. Їх і показуємо: це той самий
-- покупець, чиї замовлення власник уже бачить.
--
-- ЧОМУ НОМЕР, А НЕ ШМАТОК uuid
--
-- «Гість a3f2» теж унікальний, але його не прочитати вголос і не
-- порівняти очима. Номер зростає, тож ще й видно, хто прийшов
-- раніше.
-- --------------------------------------


-- Лічильник гостей. Окрема послідовність, а не max(thread_no)+1:
-- два одночасні перші повідомлення отримали б однаковий номер.
create sequence if not exists public.chat_thread_no_seq;


alter table public.chat_threads
    add column if not exists thread_no bigint default nextval('public.chat_thread_no_seq');


-- Розмовам, що вже існують, номери теж потрібні — інакше в старих
-- картках перший рядок буде порожнім.
update public.chat_threads
   set thread_no = nextval('public.chat_thread_no_seq')
 where thread_no is null;


-- --------------------------------------
-- ХТО ВВІЙШОВ
--
-- Заповнюється ЛИШЕ з підтвердженого токена (Edge Function питає
-- /auth/v1/user). Те, що прислали в тілі запиту, сюди не потрапляє
-- ніколи: інакше будь-хто підписав би свою розмову чужим імʼям.
--
-- Поля денормалізовані навмисно. Їх читає бот, щоб скласти рядок
-- картки; ходити по них у auth.users на кожне повідомлення — зайвий
-- запит заради даних, які не міняються.
-- --------------------------------------

alter table public.chat_threads
    add column if not exists user_id uuid;

alter table public.chat_threads
    add column if not exists user_name text;

alter table public.chat_threads
    add column if not exists user_email text;


create index if not exists chat_threads_user_idx
    on public.chat_threads (user_id)
    where user_id is not null;


comment on column public.chat_threads.thread_no is
    'Номер розмови. Для гостя це його імʼя в Telegram: «Гість #7».';

comment on column public.chat_threads.user_id is
    'Хто увійшов. Заповнює Edge Function із ПІДТВЕРДЖЕНОГО токена; із тіла запиту сюди нічого не потрапляє.';

comment on column public.chat_threads.user_name is
    'Імʼя з профілю на мить розмови. Денормалізовано: боту потрібен рядок, а не запит у auth.users на кожне повідомлення.';


-- --------------------------------------
-- ЯК ПЕРЕВІРИТИ
--
--   select thread_no, user_name, user_email, created_at
--     from public.chat_threads
--    order by thread_no desc limit 10;
--
-- Номер наступної розмови:
--
--   select last_value from public.chat_thread_no_seq;
--
-- Почати нумерацію спочатку (скажімо, після тестів):
--
--   select setval('public.chat_thread_no_seq', 1, false);
--   update public.chat_threads set thread_no = null;
--   update public.chat_threads
--      set thread_no = nextval('public.chat_thread_no_seq');
-- --------------------------------------

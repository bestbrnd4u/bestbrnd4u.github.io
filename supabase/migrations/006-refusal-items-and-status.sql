-- ======================================
-- Відмова: від ЧОГО саме — і що з цього випливає для статусу
--
-- Виконати один раз у Supabase → SQL Editor.
--
-- УВАГА: цей файл ВЖЕ ЗАСТОСОВАНО і його заміщує міграція 007. Не
-- запускайте повторно — він замінить функцію сповіщення старою
-- версією: без захисту від помилок (збій сповіщення знищував заявку)
-- і з незаміненим <PROJECT_REF>. Потрібна колонка items — вона
-- створюється рядком нижче й від функції не залежить.
--
-- Якщо все ж запускаєте: спершу замініть <PROJECT_REF> і
-- <HOOK_SECRET>, як у міграціях 001 і 005, а одразу після — виконайте
-- 007 ще раз.
-- ======================================


-- --------------------------------------
-- Проблема, яку це вирішує
--
-- 1. Замовлення після відмови лишалось «Нове».
--
--    Покупець натиснув «Відмова», під товаром з'явилось «✓ Відмову
--    надіслано» — а бейдж замовлення далі казав «Нове». Виглядає так,
--    ніби відмову не почули. Те саме бачив і магазин у списку
--    замовлень: серед нових лежало те, від якого вже відмовились.
--
-- 2. У базі не було видно, ВІД ЧОГО відмова.
--
--    Заявка зберігала лише order_id і user_id. Перелік позицій і
--    причина йшли тільки в лист магазину — тобто жили в пошті, а не в
--    системі. Відкривши базу, дізнатись, що саме повертають, було
--    неможливо.
--
--    Через це ж і кабінет не міг поставити позначку на потрібному
--    товарі: він знав лише «щось відмовили» і позначав усе замовлення.
-- --------------------------------------


-- Перелік позицій, від яких відмовились. Той самий вигляд, що й
-- orders.items — щоб порівнювати їх без перекладу.
alter table public.order_refusals
    add column if not exists items jsonb;


-- --------------------------------------
-- Статус після відмови
--
-- ЧОМУ НЕ ЗАВЖДИ «СКАСОВАНО»
--
-- Часткова відмова замовлення не скасовує: людина відмовилась від
-- однієї речі з трьох, решта їде як їхала. Назвати таке замовлення
-- скасованим означало б сказати магазину не збирати посилку взагалі.
--
-- Тому статус міняється, лише коли відмова покриває ВСІ позиції —
-- разом за всіма заявками цього замовлення (від решти могли
-- відмовитись окремо й пізніше).
--
-- ЧОМУ ДОСТАВЛЕНЕ ЗАМОВЛЕННЯ НЕ СТАЄ «СКАСОВАНО»
--
-- Скасувати можна те, що ще не виконали. Замовлення, яке вже
-- приїхало, не скасовують — його повертають, і це інша робота:
-- прийняти посилку назад, оглянути товар, віддати гроші. Статус
-- completed лишаємо як є, а про повернення магазин дізнається зі
-- сповіщення й позначки refusal_requested_at.
-- --------------------------------------

create or replace function public.notify_telegram_refusal()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    ord      public.orders;
    total    int;
    refused  int;
    legacy   boolean;
    full_ref boolean;
begin

    select * into ord from public.orders where id = new.order_id;

    total := coalesce(jsonb_array_length(ord.items), 0);

    -- Заявки, створені до цієї міграції, переліку не мають. Тоді вони
    -- означали відмову від усього замовлення — так їх і читаємо, щоб
    -- стара заявка не почала раптом означати щось інше.
    select bool_or(r.items is null or jsonb_array_length(r.items) = 0)
      into legacy
      from public.order_refusals r
     where r.order_id = new.order_id;

    -- Скільки РІЗНИХ позицій відмовлено за всіма заявками разом.
    -- Ключ — назва + колір + розмір: номер у списку прив'язаний до
    -- порядку, а він може змінитись.
    select count(distinct
               coalesce(i->>'title', '') || '|' ||
               coalesce(i->>'color', '') || '|' ||
               coalesce(i->>'size',  '')
           )
      into refused
      from public.order_refusals r
      cross join lateral jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) i
     where r.order_id = new.order_id;

    full_ref := coalesce(legacy, false) or total = 0 or refused >= total;

    update public.orders
       set refusal_requested_at = now(),
           status = case
                        when full_ref and status <> 'completed' then 'cancelled'
                        else status
                    end
     where id = new.order_id
    returning * into ord;

    perform net.http_post(
        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/telegram-order-bot',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'x-hook-secret', '<HOOK_SECRET>'
        ),
        body    := jsonb_build_object(
            'type',   'INSERT',
            'table',  'order_refusals',
            'record', jsonb_build_object(
                'id',       new.id,
                'note',     new.note,
                'items',    new.items,
                'order_id', new.order_id
            ),
            'order',  to_jsonb(ord)
        )
    );

    return new;

end;
$$;


-- Тригер лишається тим самим — переставляти його не треба, функція
-- підмінилась на місці.


-- --------------------------------------
-- Замовлення, від яких уже відмовились ДО цієї міграції
--
-- Їм статус ніхто не міняв, і вони так і лежать «новими». Рядок нижче
-- виправляє це заднім числом — за тим самим правилом: доставлені не
-- чіпаємо.
--
-- Виконується один раз; повторний запуск нічого не змінить, бо
-- скасовані вже не підпадають під умову.
-- --------------------------------------

update public.orders
   set status = 'cancelled'
 where refusal_requested_at is not null
   and status not in ('cancelled', 'completed');


-- --------------------------------------
-- Перевірка
-- --------------------------------------

-- select o.order_number, o.status, o.refusal_requested_at,
--        jsonb_array_length(o.items) as позицій,
--        r.items, r.note
-- from public.order_refusals r
-- join public.orders o on o.id = r.order_id
-- order by r.created_at desc;

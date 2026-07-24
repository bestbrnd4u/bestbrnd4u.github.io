-- ======================================
-- Bagvero — доповнення таблиці orders
--
-- Виконати ОДИН раз у Supabase: Project → SQL Editor → New query,
-- вставити весь цей файл і натиснути Run.
-- Це доповнення до вже існуючої таблиці orders (безпечно для
-- вже наявних замовлень — нові колонки будуть порожні у старих рядків).
-- ======================================

alter table public.orders
    add column if not exists payment_method   text,
    add column if not exists delivery_detail  text,
    add column if not exists delivery_status  text,
    add column if not exists ttn              text;

-- delivery_status і ttn поки що ніде не заповнюються автоматично —
-- це поля для менеджера: відкрийте Supabase → Table editor → orders
-- і заповніть їх вручну для конкретного замовлення (наприклад,
-- delivery_status = "Відправлено", ttn = "20450123456789") —
-- вони одразу з'являться в кабінеті клієнта.

CREATE OR REPLACE TABLE dq_results AS
SELECT 1 AS check_id, 'Полные дубли строк' AS check_name,
       (SELECT COUNT(*) FROM stg_lines WHERE is_duplicate) AS bad_rows,
       'Удалены в staging: ROW_NUMBER по всем полям строки' AS action
UNION ALL
SELECT 2, 'Продажи без ID клиента',
       (SELECT COUNT(*) FROM stg_lines WHERE invoice_type = 'sale' AND customer_id IS NULL AND NOT is_duplicate),
       'Остаются в выручке как сегмент «без ID»; в когорты и число покупателей не входят'
UNION ALL
SELECT 3, 'Цена ≤ 0 в строке продажи',
       (SELECT COUNT(*) FROM stg_lines WHERE invoice_type = 'sale' AND price <= 0 AND NOT is_duplicate),
       'Исключены из продаж: списания, образцы, ручные правки остатков'
UNION ALL
SELECT 4, 'Отрицательное количество без признака отмены',
       (SELECT COUNT(*) FROM stg_lines WHERE invoice_type = 'sale' AND quantity < 0 AND NOT is_duplicate),
       'Исключены из продаж: складские корректировки'
UNION ALL
SELECT 5, 'Служебные коды вместо товара (почта, комиссии, ручные правки, тест)',
       (SELECT COUNT(*) FROM stg_lines WHERE is_service AND NOT is_duplicate),
       'Выделены признаком is_service и не входят в товарную выручку'
UNION ALL
SELECT 6, 'Счета корректировки безнадёжного долга (A…)',
       (SELECT COUNT(*) FROM stg_lines WHERE invoice_type = 'adjust'),
       'Исключены: бухгалтерская операция, не продажа'
UNION ALL
SELECT 7, 'Товарный код с несколькими описаниями',
       (SELECT COUNT(*) FROM dim_product WHERE description_variants > 1 AND NOT is_service),
       'В справочник берётся самое частое описание'
UNION ALL
SELECT 8, 'Строки заказа, отменённые за ≤ 60 минут',
       (SELECT COUNT(*) FROM fast_cancel_match),
       'Помечены; выручка считается за вычетом отмен'
UNION ALL
SELECT 9, 'Цена в строке выше медианы товара в 20+ раз',
       (SELECT COUNT(*) FROM price_outlier_line),
       'Исключены из метрик мониторинга как вероятная ошибка цены'
UNION ALL
SELECT 10, 'Заказы в субботу (магазин не работает)',
       (SELECT COUNT(*) FROM fact_order o JOIN dim_date d ON d.date = o.order_date WHERE d.weekday = 6),
       'Оставлены, день исключён из мониторинга'
UNION ALL
SELECT 11, 'Неполный последний день выгрузки',
       (SELECT COUNT(*) FROM dim_date WHERE day_type = 'partial'),
       '9 декабря 2011 выгружено до 12:50 — исключён из сравнений с нормой';

SELECT check_name, bad_rows FROM dq_results ORDER BY check_id;

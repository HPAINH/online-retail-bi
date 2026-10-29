CREATE OR REPLACE TABLE dim_date AS
WITH cal AS (
    SELECT date::DATE AS date, day_type, name FROM read_csv('{seeds}/calendar.csv', header = true)
)
SELECT
    d::DATE                                            AS date,
    isodow(d)                                          AS weekday,
    date_trunc('week', d)::DATE                        AS week_start,
    date_trunc('month', d)::DATE                       AS month,
    COALESCE(c.day_type, CASE WHEN isodow(d) = 6 THEN 'closed' ELSE 'regular' END) AS day_type,
    COALESCE(c.name, CASE WHEN isodow(d) = 6 THEN 'Суббота — магазин не работает' END) AS day_name
FROM range(DATE '2009-12-01', DATE '2011-12-10', INTERVAL 1 DAY) t(d)
LEFT JOIN cal c ON c.date = d::DATE;

CREATE OR REPLACE TABLE dim_country AS
WITH all_c AS (SELECT DISTINCT country FROM stg_lines),
     grp AS (SELECT * FROM read_csv('{seeds}/country_groups.csv', header = true))
SELECT
    a.country,
    COALESCE(g.country_ru, a.country)            AS country_ru,
    COALESCE(g.country_group, 'Другие страны')   AS country_group
FROM all_c a
LEFT JOIN grp g USING (country);

CREATE OR REPLACE TABLE dim_product AS
SELECT
    stock_code,
    mode(description)          AS description,
    bool_or(is_service)        AS is_service,
    COUNT(DISTINCT description) AS description_variants
FROM stg_lines
WHERE NOT is_duplicate
GROUP BY stock_code;

CREATE OR REPLACE TABLE dim_customer AS
SELECT
    customer_id,
    MIN(invoiced_at)::DATE                        AS first_order_date,
    date_trunc('month', MIN(invoiced_at))::DATE   AS cohort_month,
    mode(country)                                 AS country,
    COUNT(DISTINCT invoice)                       AS orders,
    SUM(line_value)                               AS revenue
FROM stg_lines
WHERE invoice_type = 'sale' AND NOT is_duplicate AND NOT is_service AND quantity > 0 AND price > 0
  AND customer_id IS NOT NULL
GROUP BY customer_id;

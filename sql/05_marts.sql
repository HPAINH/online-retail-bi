CREATE OR REPLACE TABLE mart_daily AS
WITH orders AS (
    SELECT o.order_date AS date, c.country_group, o.segment,
           COUNT(*)                          AS orders,
           SUM(o.lines)                      AS lines,
           SUM(o.revenue)                    AS revenue_gross,
           COUNT(DISTINCT o.customer_id)     AS customers,
           COALESCE(SUM(o.excluded_value), 0) AS excluded_value
    FROM fact_order o
    JOIN dim_country c USING (country)
    GROUP BY ALL
),
cancels AS (
    SELECT x.cancel_date AS date, c.country_group, x.segment,
           SUM(x.cancel_value)                                   AS cancelled_value,
           SUM(x.cancel_value) FILTER (WHERE x.is_fast_cancel)   AS cancelled_fast
    FROM fact_cancellation x
    JOIN dim_country c USING (country)
    GROUP BY ALL
)
SELECT
    date, country_group, segment,
    COALESCE(o.orders, 0)                    AS orders,
    COALESCE(o.lines, 0)                     AS lines,
    round(COALESCE(o.revenue_gross, 0), 2)   AS revenue_gross,
    round(COALESCE(o.excluded_value, 0), 2) AS excluded_value,
    round(COALESCE(x.cancelled_value, 0), 2) AS cancelled_value,
    round(COALESCE(x.cancelled_fast, 0), 2)  AS cancelled_fast,
    COALESCE(o.customers, 0)                 AS customers
FROM orders o
FULL JOIN cancels x USING (date, country_group, segment)
ORDER BY ALL;

CREATE OR REPLACE TABLE metric_slices AS
WITH agg AS (
    SELECT date, 'total' AS slice_type, 'Все' AS slice_value,
           SUM(orders) AS orders, SUM(revenue_gross - excluded_value) AS revenue, SUM(customers) AS customers
    FROM mart_daily GROUP BY ALL
    UNION ALL
    SELECT date, 'country', country_group, SUM(orders), SUM(revenue_gross - excluded_value), SUM(customers)
    FROM mart_daily GROUP BY ALL
    UNION ALL
    SELECT date, 'segment', segment, SUM(orders), SUM(revenue_gross - excluded_value), SUM(customers)
    FROM mart_daily GROUP BY ALL
),
slices AS (
    SELECT DISTINCT slice_type, slice_value FROM agg
),
base AS (
    SELECT d.date, s.slice_type, s.slice_value,
           COALESCE(a.orders, 0) AS orders, COALESCE(a.revenue, 0) AS revenue, COALESCE(a.customers, 0) AS customers
    FROM dim_date d
    CROSS JOIN slices s
    LEFT JOIN agg a USING (date, slice_type, slice_value)
    WHERE d.day_type <> 'closed'
)
SELECT date, slice_type, slice_value, 'revenue' AS metric, revenue AS value, orders AS volume FROM base
UNION ALL
SELECT date, slice_type, slice_value, 'orders', orders, orders FROM base
UNION ALL
SELECT date, slice_type, slice_value, 'aov', revenue / NULLIF(orders, 0), orders FROM base
UNION ALL
SELECT date, slice_type, slice_value, 'customers', customers, orders FROM base WHERE slice_value <> 'guest';

CREATE OR REPLACE TABLE mart_cohorts AS
WITH activity AS (
    SELECT DISTINCT o.customer_id, date_trunc('month', o.order_date)::DATE AS month
    FROM fact_order o
    WHERE o.customer_id IS NOT NULL
)
SELECT
    c.cohort_month,
    date_diff('month', c.cohort_month, a.month) AS month_offset,
    COUNT(DISTINCT a.customer_id)               AS customers
FROM activity a
JOIN dim_customer c USING (customer_id)
GROUP BY ALL
ORDER BY ALL;

CREATE OR REPLACE TABLE mart_country_monthly AS
SELECT
    date_trunc('month', o.order_date)::DATE AS month,
    c.country_ru                            AS country,
    c.country_group,
    COUNT(*)                                AS orders,
    round(SUM(o.revenue), 2)                AS revenue_gross,
    COUNT(DISTINCT o.customer_id)           AS customers
FROM fact_order o
JOIN dim_country c USING (country)
GROUP BY ALL
ORDER BY ALL;

CREATE OR REPLACE TABLE mart_customer_concentration AS
WITH r AS (
    SELECT customer_id, country, revenue,
           ROW_NUMBER() OVER (ORDER BY revenue DESC) AS rnk
    FROM dim_customer
),
tot AS (SELECT SUM(revenue) AS total FROM fact_order)
SELECT rnk, customer_id, country, round(revenue, 2) AS revenue,
       round(revenue / total, 5) AS share,
       round(SUM(revenue) OVER (ORDER BY rnk) / total, 5) AS cum_share
FROM r, tot
WHERE rnk <= 100
ORDER BY rnk;

CREATE OR REPLACE TABLE mart_fast_cancellations AS
SELECT
    m.invoice, m.cancel_invoice, m.invoiced_at, m.cancelled_at, m.minutes_to_cancel,
    o.customer_id, o.country, p.description, s.quantity, s.price, round(m.line_value, 2) AS line_value
FROM fast_cancel_match m
JOIN fact_sale_line s ON s.line_id = m.sale_line_id
JOIN fact_order o ON o.invoice = m.invoice
JOIN dim_product p ON p.stock_code = s.stock_code
WHERE m.line_value >= 1000
ORDER BY m.line_value DESC;

CREATE OR REPLACE TABLE mart_orders AS
SELECT
    o.order_date                                          AS date,
    o.invoice,
    c.country_ru                                          AS country,
    c.country_group,
    o.segment,
    o.customer_id,
    o.lines,
    round(o.revenue, 2)                                   AS revenue_gross,
    round(COALESCE(o.excluded_value, 0), 2)         AS excluded_value
FROM fact_order o
JOIN dim_country c USING (country)
ORDER BY o.invoiced_at;

CREATE OR REPLACE TABLE mart_price_outliers AS
SELECT p.invoice, s.invoiced_at, s.customer_id, d.description, p.quantity, p.price,
       round(p.median_price, 2) AS median_price, round(p.price / p.median_price, 1) AS price_ratio,
       round(p.line_value, 2) AS line_value
FROM price_outlier_line p
JOIN fact_sale_line s USING (line_id)
JOIN dim_product d ON d.stock_code = p.stock_code
ORDER BY p.line_value DESC;

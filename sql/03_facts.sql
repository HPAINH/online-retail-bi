CREATE OR REPLACE TABLE fact_sale_line AS
SELECT line_id, invoice, stock_code, quantity, price, line_value, invoiced_at, invoiced_at::DATE AS order_date,
       customer_id, country
FROM stg_lines
WHERE invoice_type = 'sale' AND NOT is_duplicate AND NOT is_service AND quantity > 0 AND price > 0;

CREATE OR REPLACE TABLE fact_cancel_line AS
SELECT line_id, invoice, stock_code, -quantity AS quantity, price, -line_value AS cancel_value,
       invoiced_at AS cancelled_at, invoiced_at::DATE AS cancel_date, customer_id, country
FROM stg_lines
WHERE invoice_type = 'cancel' AND NOT is_duplicate AND NOT is_service AND quantity < 0;

CREATE OR REPLACE TABLE fast_cancel_match AS
SELECT
    s.line_id   AS sale_line_id,
    c.line_id   AS cancel_line_id,
    s.invoice,
    c.invoice   AS cancel_invoice,
    s.invoiced_at,
    c.cancelled_at,
    date_diff('minute', s.invoiced_at, c.cancelled_at) AS minutes_to_cancel,
    s.line_value
FROM fact_sale_line s
JOIN fact_cancel_line c
  ON c.customer_id = s.customer_id AND c.stock_code = s.stock_code
 AND c.quantity = s.quantity AND c.price = s.price
 AND c.cancelled_at BETWEEN s.invoiced_at AND s.invoiced_at + INTERVAL 60 MINUTE
QUALIFY ROW_NUMBER() OVER (PARTITION BY c.line_id ORDER BY s.invoiced_at DESC) = 1
    AND ROW_NUMBER() OVER (PARTITION BY s.line_id ORDER BY c.cancelled_at) = 1;

CREATE OR REPLACE TABLE price_outlier_line AS
WITH product_price AS (
    SELECT stock_code, median(price) AS median_price
    FROM fact_sale_line
    GROUP BY stock_code
    HAVING COUNT(*) >= 10
)
SELECT s.line_id, s.invoice, s.stock_code, s.quantity, s.price, p.median_price, s.line_value
FROM fact_sale_line s
JOIN product_price p USING (stock_code)
WHERE s.price > 20 * p.median_price;

CREATE OR REPLACE TABLE fact_order AS
SELECT
    l.invoice,
    MIN(l.invoiced_at)                                   AS invoiced_at,
    MIN(l.order_date)                                    AS order_date,
    ANY_VALUE(l.customer_id)                             AS customer_id,
    ANY_VALUE(l.country)                                 AS country,
    CASE WHEN ANY_VALUE(l.customer_id) IS NULL THEN 'guest'
         WHEN MIN(l.order_date) = ANY_VALUE(c.first_order_date) THEN 'new'
         ELSE 'returning' END                            AS segment,
    COUNT(*)                                             AS lines,
    SUM(l.quantity)                                      AS items,
    SUM(l.line_value)                                    AS revenue,
    SUM(l.line_value) FILTER (WHERE f.sale_line_id IS NOT NULL OR p.line_id IS NOT NULL) AS excluded_value
FROM fact_sale_line l
LEFT JOIN dim_customer c USING (customer_id)
LEFT JOIN fast_cancel_match f ON f.sale_line_id = l.line_id
LEFT JOIN price_outlier_line p ON p.line_id = l.line_id
GROUP BY l.invoice;

CREATE OR REPLACE TABLE fact_cancellation AS
SELECT
    c.*,
    CASE WHEN c.customer_id IS NULL THEN 'guest'
         WHEN c.cancel_date = d.first_order_date THEN 'new'
         ELSE 'returning' END                            AS segment,
    f.cancel_line_id IS NOT NULL                         AS is_fast_cancel
FROM fact_cancel_line c
LEFT JOIN dim_customer d USING (customer_id)
LEFT JOIN fast_cancel_match f ON f.cancel_line_id = c.line_id;

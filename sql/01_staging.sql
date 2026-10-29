CREATE OR REPLACE TABLE raw_lines AS
SELECT *
FROM read_csv('{raw}/online_retail_II.csv.gz', header = true,
              types = {'Invoice': 'VARCHAR', 'StockCode': 'VARCHAR', 'Description': 'VARCHAR',
                       'Quantity': 'DOUBLE', 'InvoiceDate': 'TIMESTAMP', 'Price': 'DOUBLE',
                       'CustomerID': 'DOUBLE', 'Country': 'VARCHAR'});

CREATE OR REPLACE TABLE stg_lines AS
WITH typed AS (
    SELECT
        Invoice                                              AS invoice,
        CASE WHEN Invoice LIKE 'C%' THEN 'cancel'
             WHEN Invoice LIKE 'A%' THEN 'adjust'
             ELSE 'sale' END                                 AS invoice_type,
        upper(trim(StockCode))                               AS stock_code,
        trim(Description)                                    AS description,
        Quantity                                             AS quantity,
        Price                                                AS price,
        Quantity * Price                                     AS line_value,
        InvoiceDate                                          AS invoiced_at,
        CustomerID::INTEGER                                  AS customer_id,
        Country                                              AS country
    FROM raw_lines
)
SELECT
    ROW_NUMBER() OVER ()                                     AS line_id,
    *,
    NOT (regexp_matches(stock_code, '^[0-9]{5}') OR stock_code LIKE 'DCGS%' OR stock_code LIKE 'GIFT\_%' ESCAPE '\')
                                                             AS is_service,
    ROW_NUMBER() OVER (PARTITION BY invoice, stock_code, description, quantity, price, invoiced_at, customer_id, country
                       ORDER BY invoice) > 1                 AS is_duplicate
FROM typed;

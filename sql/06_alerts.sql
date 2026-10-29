CREATE OR REPLACE TABLE alerts_{grain} AS
WITH series AS (
    SELECT
        {period}                                                    AS period,
        m.slice_type, m.slice_value, m.metric,
        SUM(m.value * CASE WHEN m.metric = 'aov' THEN m.volume ELSE 1 END)
            / CASE WHEN m.metric = 'aov' THEN NULLIF(SUM(m.volume), 0) ELSE 1 END AS value,
        SUM(m.volume)                                               AS volume,
        bool_or(d.day_type <> 'regular')                            AS has_calendar
    FROM metric_slices m
    JOIN dim_date d USING (date)
    WHERE d.day_type <> 'closed'
      AND NOT (m.slice_type = 'segment' AND m.date < DATE '2010-03-01')
    GROUP BY 1, 2, 3, 4
),
calendar AS (
    SELECT {period} AS period, bool_or(day_type NOT IN ('regular') AND weekday <> 6) AS has_calendar
    FROM dim_date d
    GROUP BY 1
),
typed AS (
    SELECT s.period, s.slice_type, s.slice_value, s.metric, s.value, s.volume,
           CASE WHEN s.has_calendar OR c.has_calendar THEN 'calendar' ELSE 'regular' END AS period_type
    FROM series s
    JOIN calendar c USING (period)
),
base AS (
    SELECT
        m.period, m.slice_type, m.slice_value, m.metric, m.value, m.volume, m.period_type,
        median(h.value)  AS baseline,
        median(h.volume) AS baseline_volume
    FROM typed m
    JOIN typed h
      ON h.slice_type = m.slice_type AND h.slice_value = m.slice_value AND h.metric = m.metric
     AND h.period_type = 'regular'
     AND h.period BETWEEN m.period - INTERVAL 28 DAY AND m.period - INTERVAL 7 DAY
     AND {same_phase}
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    HAVING COUNT(h.value) >= 2
),
dev AS (
    SELECT *, ln(GREATEST(value, 1e-9) / baseline) AS log_dev
    FROM base
    WHERE baseline > 0 AND baseline_volume >= 10
),
spread AS (
    SELECT slice_type, slice_value, metric, 1.4826 * median(abs(log_dev - med)) AS sigma
    FROM (
        SELECT *, median(log_dev) OVER (PARTITION BY slice_type, slice_value, metric) AS med
        FROM dev WHERE period_type = 'regular'
    )
    GROUP BY 1, 2, 3
)
SELECT
    '{grain}'                            AS grain,
    d.period                             AS date,
    d.slice_type, d.slice_value, d.metric,
    round(d.value, 2)                    AS value,
    round(d.baseline, 2)                 AS baseline,
    round(d.value / d.baseline - 1, 4)   AS deviation,
    round(d.log_dev / s.sigma, 1)        AS z,
    d.period_type
FROM dev d
JOIN spread s USING (slice_type, slice_value, metric)
WHERE abs(d.log_dev / s.sigma) >= 4.5
  AND abs(d.value / d.baseline - 1) >= 0.25;

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data"
SQL_FILES = ["01_staging.sql", "02_dimensions.sql", "03_facts.sql"]
MARTS = ["mart_daily", "mart_orders", "mart_alerts", "mart_cohorts", "mart_country_monthly",
         "mart_customer_concentration", "mart_fast_cancellations", "mart_price_outliers", "dq_results"]

ALERT_GRAINS = {
    "day": {"period": "d.date", "same_phase": "isodow(h.period) = isodow(m.period)"},
    "week": {"period": "d.week_start", "same_phase": "true"},
}


def run_sql(con, name):
    text = (ROOT / "sql" / name).read_text(encoding="utf-8")
    text = text.replace("{raw}", RAW.as_posix()).replace("{seeds}", (ROOT / "seeds").as_posix())
    return con.execute(text)


def main():
    con = duckdb.connect(str(ROOT / "retail.duckdb"))
    for name in SQL_FILES:
        run_sql(con, name)

    print("Проверки качества:")
    for check, bad in run_sql(con, "04_quality_checks.sql").fetchall():
        print(f"  {'OK      ' if bad == 0 else 'ВНИМАНИЕ'}  {check}: {bad}")

    run_sql(con, "05_marts.sql")
    template = (ROOT / "sql" / "06_alerts.sql").read_text(encoding="utf-8")
    for grain, params in ALERT_GRAINS.items():
        con.execute(template.format(grain=grain, **params))
    con.execute("CREATE OR REPLACE TABLE mart_alerts AS "
                "SELECT * FROM alerts_day UNION ALL SELECT * FROM alerts_week ORDER BY grain, date, slice_type, slice_value, metric")
    out = ROOT / "marts"
    out.mkdir(exist_ok=True)
    for mart in MARTS:
        con.execute(f"COPY {mart} TO '{(out / (mart + '.csv')).as_posix()}' (HEADER, DELIMITER ',')")
        rows = con.execute(f"SELECT COUNT(*) FROM {mart}").fetchone()[0]
        print(f"  {mart}: {rows} строк → marts/{mart}.csv")


if __name__ == "__main__":
    main()

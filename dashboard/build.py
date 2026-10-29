import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MARTS = ROOT / "marts"
SEEDS = ROOT / "seeds"
HERE = Path(__file__).resolve().parent
GROUPS = ["Великобритания", "Ирландия", "Нидерланды", "Германия", "Франция", "Другие страны"]
SEGMENTS = ["returning", "new", "guest"]


def main():
    dates = pd.date_range("2009-12-01", "2011-12-09", freq="D")
    d_idx = {d.strftime("%Y-%m-%d"): i for i, d in enumerate(dates)}
    cal = pd.read_csv(SEEDS / "calendar.csv").set_index("date")
    day_type, day_name = [], []
    for d in dates:
        key = d.strftime("%Y-%m-%d")
        if key in cal.index:
            day_type.append(cal.loc[key, "day_type"]); day_name.append(cal.loc[key, "name"])
        elif d.weekday() == 5:
            day_type.append("closed"); day_name.append("Суббота — магазин не работает")
        else:
            day_type.append("regular"); day_name.append("")

    o = pd.read_csv(MARTS / "mart_orders.csv")
    countries = o.groupby("country").revenue_gross.sum().sort_values(ascending=False).index.tolist()
    cust = {c: i for i, c in enumerate(sorted(o.customer_id.dropna().astype(int).unique()))}
    daily = pd.read_csv(MARTS / "mart_daily.csv")
    daily = daily[daily.cancelled_value > 0]
    a = pd.read_csv(MARTS / "mart_alerts.csv")
    coh = pd.read_csv(MARTS / "mart_cohorts.csv")
    conc = pd.read_csv(MARTS / "mart_customer_concentration.csv")
    dq = pd.read_csv(MARTS / "dq_results.csv")
    inc = pd.read_csv(SEEDS / "incident_log.csv")

    data = {
        "dates": list(d_idx), "dayType": day_type, "dayName": day_name,
        "custIds": [int(x) for x in sorted(cust, key=cust.get)], "groups": GROUPS, "segments": SEGMENTS, "countries": countries,
        "O": {
            "d": o.date.map(d_idx).tolist(),
            "g": o.country_group.map(GROUPS.index).tolist(),
            "s": o.segment.map(SEGMENTS.index).tolist(),
            "k": o.country.map(countries.index).tolist(),
            "c": [cust[int(x)] if pd.notna(x) else -1 for x in o.customer_id],
            "l": o.lines.tolist(),
            "r": (o.revenue_gross - o.excluded_value).round(2).tolist(),
            "f": o.excluded_value.round(2).tolist(),
        },
        "X": {
            "d": daily.date.map(d_idx).tolist(), "g": daily.country_group.map(GROUPS.index).tolist(),
            "s": daily.segment.map(SEGMENTS.index).tolist(), "v": daily.cancelled_value.round(2).tolist(),
            "fv": daily.cancelled_fast.round(2).tolist(),
        },
        "alerts": [[r.grain, d_idx[r.date], r.slice_type, r.slice_value, r.metric, r.value, r.baseline, r.deviation, r.z, r.period_type]
                   for r in a.itertuples()],
        "cohorts": coh.values.tolist(),
        "conc": conc[["rnk", "customer_id", "country", "revenue", "share", "cum_share"]].values.tolist(),
        "dq": dq[["check_name", "bad_rows", "action"]].values.tolist(),
        "inc": inc.to_dict(orient="records"),
    }
    js = "const D=" + json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=lambda v: v.item()) + ";"
    html = (HERE / "shell.html").read_text(encoding="utf-8").replace("/*DATA*/", js) \
        .replace("/*APP*/", (HERE / "app.js").read_text(encoding="utf-8"))
    out = ROOT / "docs" / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"{out} — {out.stat().st_size / 1e6:.2f} МБ")


if __name__ == "__main__":
    main()

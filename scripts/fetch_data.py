"""Загрузка Online Retail II (UCI, CC BY 4.0) в data/online_retail_II.csv.gz.

Основной источник — официальный архив UCI (xlsx, два листа: 2009–2010 и 2010–2011).
Запасной — R-пакет onlineretail2 на GitHub с тем же набором (1 067 371 строка).

Запуск: python scripts/fetch_data.py
"""
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "online_retail_II.csv.gz"
UCI_URL = "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip"
GITHUB_URL = "https://raw.githubusercontent.com/allanvc/onlineretail2/master/data/onlineretail2.rda"
COLUMNS = ["Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price", "CustomerID", "Country"]
EXPECTED_ROWS = 1_067_371


def download(url):
    with urllib.request.urlopen(url, timeout=120) as resp:
        return resp.read()


def from_uci():
    archive = zipfile.ZipFile(io.BytesIO(download(UCI_URL)))
    name = next(n for n in archive.namelist() if n.endswith(".xlsx"))
    sheets = pd.read_excel(archive.open(name), sheet_name=None, dtype={"Invoice": str, "StockCode": str})
    df = pd.concat(sheets.values(), ignore_index=True)
    return df.rename(columns={"Customer ID": "CustomerID"})


def from_github():
    import pyreadr
    tmp = ROOT / "data" / "onlineretail2.rda"
    tmp.write_bytes(download(GITHUB_URL))
    df = pyreadr.read_r(str(tmp))["onlineretail2"]
    tmp.unlink()
    return df


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    for source in (from_uci, from_github):
        try:
            df = source()
            break
        except Exception as exc:
            print(f"{source.__name__}: {exc}", file=sys.stderr)
    else:
        sys.exit("Не удалось скачать данные ни из UCI, ни с GitHub")
    df = df[COLUMNS]
    df.to_csv(OUT, index=False, date_format="%Y-%m-%d %H:%M:%S")
    status = "OK" if len(df) == EXPECTED_ROWS else f"ожидалось {EXPECTED_ROWS}"
    print(f"{OUT}: {len(df)} строк ({status}), источник — {source.__name__}")


if __name__ == "__main__":
    main()

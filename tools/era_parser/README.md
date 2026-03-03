# ERA Parser (Health Net remittance PDFs)

Parses Health Net “Remittance Advice” PDFs to extract service lines for **H2022** and **T2038** and export them for Caspio matching.

## What it extracts

- Member **name**
- **HIC** value (and optional “Medi-Cal #” token if present after HIC)
- **ACNT** (used to match Caspio `Client_ID2`)
- **ICN** (if present)
- **PROC** (H2022 / T2038)
- Service date(s) (if present in `MM/DD/YYYY` or `YYYY-MM-DD` form)
- Amounts (best-effort): billed, allowed, paid/net

## Install

```bash
python -m pip install -r tools/era_parser/requirements.txt
```

## Run (JSON to stdout)

```bash
python tools/era_parser/era_parser.py --input "path/to/remittance.pdf" --format json
```

## Run (CSV file)

```bash
python tools/era_parser/era_parser.py --input "path/to/remittance.pdf" --format csv --csv-out "era_export.csv"
```

## Notes / limitations

- Works best when the PDF has an embedded text layer (not a scanned image).
- If the PDF is scanned, the parser will return very few/no rows; OCR support can be added later if needed.

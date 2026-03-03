from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfReader


AMOUNT_RE = re.compile(r"(?<!\d)(\d{1,3}(?:,\d{3})*\.\d{2})(?!\d)")
PROC_RE = re.compile(r"\b(H2022|T2038)\b", re.IGNORECASE)
DATE_TOKEN_RE = re.compile(r"\b(\d{2}/\d{2}/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{8})\b")


def _safe_float(raw: str) -> Optional[float]:
    try:
        return float(raw.replace(",", ""))
    except Exception:
        return None


def _find_kw_token(line: str, kw: str) -> Optional[str]:
    m = re.search(rf"\b{re.escape(kw)}\b\s*[:#]?\s*(\S+)", line, re.IGNORECASE)
    return m.group(1).strip() if m else None


def _segment_between(line: str, start_kw: str, end_kws: List[str]) -> str:
    lower = line.lower()
    start_idx = lower.find(start_kw.lower())
    if start_idx < 0:
        return ""
    start_idx += len(start_kw)
    tail = line[start_idx:]
    tail_lower = tail.lower()
    cut = len(tail)
    for kw in end_kws:
        idx = tail_lower.find(f" {kw.lower()} ")
        if idx >= 0:
            cut = min(cut, idx)
    return tail[:cut].strip()


def _extract_name_hic_acnt_icn(line: str) -> Tuple[str, Optional[str], Optional[str], Optional[str], Optional[str]]:
    # Example-ish:
    # NAME LAST, FIRST   HIC 90453081A <maybe-medi-cal>   ACNT 8840   ICN 2026...
    name = _segment_between(line, "NAME", ["HIC", "ACNT", "ICN"])

    hic = None
    medi = None
    hic_segment = _segment_between(line, "HIC", ["ACNT", "ICN"])
    if hic_segment:
        tokens = [t for t in hic_segment.split() if t.strip()]
        if len(tokens) >= 1:
            hic = tokens[0].strip()
        # User request: "medi-cal number (to the right of HIC)" — if present,
        # it often appears as the next token before ACNT.
        if len(tokens) >= 2:
            medi = tokens[1].strip()

    acnt = _find_kw_token(line, "ACNT")
    icn = _find_kw_token(line, "ICN")

    return name, hic, medi, acnt, icn


def _extract_remittance_date(lines: List[str]) -> Optional[str]:
    # Try common header patterns like: "DATE : 2026-02-27"
    for ln in lines[:80]:
        if "date" not in ln.lower():
            continue
        m = re.search(r"\bDATE\b\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{2,4})", ln, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


@dataclass
class EraRow:
    payer: str
    remittance_date: Optional[str]
    page: int
    member_name: str
    hic: Optional[str]
    medi_cal_number: Optional[str]
    acnt: Optional[str]
    icn: Optional[str]
    proc: str
    service_from: Optional[str]
    service_to: Optional[str]
    billed: Optional[float]
    allowed: Optional[float]
    paid: Optional[float]
    source_line: str


def parse_pdf(path: str) -> Dict[str, Any]:
    reader = PdfReader(path)
    all_rows: List[EraRow] = []
    payer = "Health Net"

    for page_idx, page in enumerate(reader.pages):
        raw = page.extract_text() or ""
        lines = [ln.rstrip("\n") for ln in raw.splitlines() if ln.strip()]
        remit_date = _extract_remittance_date(lines)

        current_member: Dict[str, Any] = {
            "member_name": "",
            "hic": None,
            "medi": None,
            "acnt": None,
            "icn": None,
        }

        for ln in lines:
            if re.match(r"^\s*NAME\b", ln, re.IGNORECASE):
                name, hic, medi, acnt, icn = _extract_name_hic_acnt_icn(ln)
                current_member = {
                    "member_name": name,
                    "hic": hic,
                    "medi": medi,
                    "acnt": acnt,
                    "icn": icn,
                }
                continue

            mproc = PROC_RE.search(ln)
            if not mproc:
                continue

            proc = mproc.group(1).upper()
            # Best-effort service dates: prefer explicit date formats.
            dates = DATE_TOKEN_RE.findall(ln)
            service_from = dates[0] if len(dates) >= 1 else None
            service_to = dates[1] if len(dates) >= 2 else None

            amts = AMOUNT_RE.findall(ln)
            billed = _safe_float(amts[0]) if len(amts) >= 1 else None
            allowed = _safe_float(amts[1]) if len(amts) >= 2 else None
            paid = _safe_float(amts[-1]) if len(amts) >= 1 else None

            all_rows.append(
                EraRow(
                    payer=payer,
                    remittance_date=remit_date,
                    page=page_idx + 1,
                    member_name=str(current_member.get("member_name") or "").strip(),
                    hic=current_member.get("hic"),
                    medi_cal_number=current_member.get("medi"),
                    acnt=current_member.get("acnt"),
                    icn=current_member.get("icn"),
                    proc=proc,
                    service_from=service_from,
                    service_to=service_to,
                    billed=billed,
                    allowed=allowed,
                    paid=paid,
                    source_line=ln.strip(),
                )
            )

    def _sum_paid(rows: List[EraRow], code: str) -> float:
        total = 0.0
        for r in rows:
            if r.proc != code:
                continue
            if r.paid is None:
                continue
            total += float(r.paid)
        return total

    def _unique_members(rows: List[EraRow], code: str) -> int:
        keys = set()
        for r in rows:
            if r.proc != code:
                continue
            key = (r.acnt or "").strip() or (r.member_name or "").strip()
            if key:
                keys.add(key)
        return len(keys)

    summary = {
        "total_rows": len(all_rows),
        "t2038": {
            "rows": sum(1 for r in all_rows if r.proc == "T2038"),
            "members": _unique_members(all_rows, "T2038"),
            "total_paid": round(_sum_paid(all_rows, "T2038"), 2),
        },
        "h2022": {
            "rows": sum(1 for r in all_rows if r.proc == "H2022"),
            "members": _unique_members(all_rows, "H2022"),
            "total_paid": round(_sum_paid(all_rows, "H2022"), 2),
        },
    }

    return {
        "success": True,
        "payer": payer,
        "rows": [asdict(r) for r in all_rows],
        "summary": summary,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Parse Health Net remittance PDFs for H2022/T2038.")
    ap.add_argument("--input", required=True, help="Path to remittance PDF")
    ap.add_argument("--format", choices=["json", "csv"], default="json")
    ap.add_argument("--csv-out", default="", help="When --format=csv, write CSV to this path")
    args = ap.parse_args()

    try:
        result = parse_pdf(args.input)
    except Exception as e:
        payload = {"success": False, "error": str(e)}
        sys.stdout.write(json.dumps(payload))
        return 2

    if args.format == "json":
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0

    rows = result.get("rows") or []
    out_path = str(args.csv_out or "").strip()
    if not out_path:
        sys.stdout.write(json.dumps({"success": False, "error": "--csv-out is required when --format=csv"}))
        return 2

    fieldnames = [
        "payer",
        "remittance_date",
        "page",
        "member_name",
        "hic",
        "medi_cal_number",
        "acnt",
        "icn",
        "proc",
        "service_from",
        "service_to",
        "billed",
        "allowed",
        "paid",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k) for k in fieldnames})

    sys.stdout.write(json.dumps({"success": True, "csv_out": out_path, "summary": result.get("summary")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


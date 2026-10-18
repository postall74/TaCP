"""Inspect the real Chromium DOOR-004 PDF for A4 geometry and clipping signals."""

import json
import pathlib
import re
import sys

import pdfplumber


pdf_path = pathlib.Path(sys.argv[1]).resolve()
result: dict[str, object] = {"file": str(pdf_path), "bytes": pdf_path.stat().st_size}

with pdfplumber.open(pdf_path) as pdf:
    result["pages"] = len(pdf.pages)
    result["page_sizes_pt"] = [[round(page.width, 2), round(page.height, 2)] for page in pdf.pages]
    if len(pdf.pages) != 2:
        raise AssertionError(f"expected 2 pages, got {len(pdf.pages)}")
    for index, page in enumerate(pdf.pages, start=1):
        if abs(page.width - 595.28) > 1 or abs(page.height - 841.89) > 1:
            raise AssertionError(f"page {index} is not A4: {page.width} x {page.height}")

    texts = [(page.extract_text() or "") for page in pdf.pages]
    dimension_index = next((i for i, text in enumerate(texts) if "Размерный вид дверцы" in text), None)
    if dimension_index is None:
        raise AssertionError("dimension sheet not found")
    if dimension_index != 1:
        raise AssertionError(f"dimension sheet is not isolated on page 2: page {dimension_index + 1}")

    dimension_text = re.sub(r"\s+", " ", texts[dimension_index])
    readable_first_leaf = "Полотно 1"
    distorted_first_leaf = "Пол1отно 1"
    if readable_first_leaf not in dimension_text or distorted_first_leaf in dimension_text:
        raise AssertionError(json.dumps({
            "defect": "x=0/y=0 marker overlaps the first leaf heading",
            "expected": readable_first_leaf,
            "forbidden": distorted_first_leaf,
            "text": dimension_text,
        }, ensure_ascii=True))
    required = [
        "Полотно 2", "Координата 0", "Координата 500", "Координата 1000",
        "50,0", "400,0", "1550,0", "100,0", "900,0", "1700,0",
        "не для сверления и изготовления",
    ]
    missing = [value for value in required if value not in dimension_text]
    if missing:
        raise AssertionError(json.dumps({"missing": missing, "text": dimension_text}, ensure_ascii=True))

    words = pdf.pages[dimension_index].extract_words()
    bounds = {
        "left": round(min(word["x0"] for word in words), 2),
        "top": round(min(word["top"] for word in words), 2),
        "right": round(max(word["x1"] for word in words), 2),
        "bottom": round(max(word["bottom"] for word in words), 2),
    }
    result["dimension_page"] = dimension_index + 1
    result["dimension_text_bounds_pt"] = bounds
    result["dimension_margins_pt"] = {
        "left": bounds["left"],
        "top": bounds["top"],
        "right": round(pdf.pages[dimension_index].width - bounds["right"], 2),
        "bottom": round(pdf.pages[dimension_index].height - bounds["bottom"], 2),
    }
    if min(result["dimension_margins_pt"].values()) < 20:
        raise AssertionError(f"dimension text approaches page edge: {result['dimension_margins_pt']}")

print(json.dumps(result, ensure_ascii=False, indent=2))

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "stabilizzazione_pnrr_16mar2026_bancadati_addetti_upp.pdf"
OUT_PATH = ROOT / "data" / "questions.json"
REPORT_PATH = ROOT / "data" / "extraction-report.json"


COLUMNS = {
    "question": (90, 250),
    "effective": (250, 430),
    "medium": (430, 610),
    "ineffective": (610, 800),
}


def normalize_text(parts):
    text = " ".join(part.strip() for part in parts if part.strip())
    text = re.sub(r"\s+", " ", text)
    text = text.replace(" ,", ",").replace(" .", ".")
    return text.strip()


def extract_page_items(page):
    items = []

    def visitor(text, cm, tm, font, font_size):
        value = text.strip()
        if not value:
            return
        if re.fullmatch(r"Pagina\s+\d+\s+di\s+\d+", value):
            return
        items.append(
            {
                "x": float(tm[4]),
                "y": float(tm[5]),
                "text": value,
            }
        )

    page.extract_text(visitor_text=visitor)
    return items


def column_for_x(x):
    for name, (left, right) in COLUMNS.items():
        if left <= x < right:
            return name
    return None


def extract_questions():
    reader = PdfReader(str(PDF_PATH))
    questions = []
    anomalies = []

    for page_index, page in enumerate(reader.pages, start=1):
        items = extract_page_items(page)
        number_items = [
            item
            for item in items
            if 50 <= item["x"] <= 90 and re.fullmatch(r"\d+", item["text"])
        ]
        number_items.sort(key=lambda item: item["y"], reverse=True)

        if not number_items:
            anomalies.append({"page": page_index, "type": "missing_question_numbers"})
            continue

        row_boundaries = []
        for index, number_item in enumerate(number_items):
            upper = 520.0 if index == 0 else (number_items[index - 1]["y"] + number_item["y"]) / 2
            lower = -20.0 if index == len(number_items) - 1 else (number_item["y"] + number_items[index + 1]["y"]) / 2
            row_boundaries.append((number_item, upper, lower))

        for number_item, upper, lower in row_boundaries:
            buckets = {name: [] for name in COLUMNS}
            for item in sorted(items, key=lambda value: (-value["y"], value["x"])):
                if not (lower < item["y"] < upper):
                    continue
                column = column_for_x(item["x"])
                if column is None:
                    continue
                buckets[column].append(item["text"])

            question_id = int(number_item["text"])
            record = {
                "id": question_id,
                "question": normalize_text(buckets["question"]),
                "answers": [
                    {
                        "level": "effective",
                        "score": 1,
                        "text": normalize_text(buckets["effective"]),
                    },
                    {
                        "level": "medium",
                        "score": 0.5,
                        "text": normalize_text(buckets["medium"]),
                    },
                    {
                        "level": "ineffective",
                        "score": 0,
                        "text": normalize_text(buckets["ineffective"]),
                    },
                ],
            }
            questions.append(record)

            if not record["question"]:
                anomalies.append({"page": page_index, "id": question_id, "type": "empty_question"})
            for answer in record["answers"]:
                if not answer["text"]:
                    anomalies.append(
                        {
                            "page": page_index,
                            "id": question_id,
                            "type": "empty_answer",
                            "level": answer["level"],
                        }
                    )

    questions.sort(key=lambda item: item["id"])
    return questions, anomalies, len(reader.pages)


def validate_questions(questions, anomalies, page_count):
    ids = [item["id"] for item in questions]
    duplicate_ids = sorted({item_id for item_id in ids if ids.count(item_id) > 1})
    expected_ids = list(range(min(ids), max(ids) + 1)) if ids else []
    missing_ids = [item_id for item_id in expected_ids if item_id not in ids]

    short_fields = []
    for item in questions:
        if len(item["answers"]) != 3:
            short_fields.append({"id": item["id"], "type": "answer_count"})
        if len(item["question"]) < 40:
            short_fields.append({"id": item["id"], "type": "short_question"})
        for answer in item["answers"]:
            if len(answer["text"]) < 40:
                short_fields.append(
                    {"id": item["id"], "type": "short_answer", "level": answer["level"]}
                )

    return {
        "pdf": PDF_PATH.name,
        "pages": page_count,
        "question_count": len(questions),
        "first_id": min(ids) if ids else None,
        "last_id": max(ids) if ids else None,
        "duplicate_ids": duplicate_ids,
        "missing_ids": missing_ids,
        "anomalies": anomalies,
        "short_fields": short_fields,
        "valid": not duplicate_ids and not missing_ids and not anomalies and not short_fields,
    }


def main():
    questions, anomalies, page_count = extract_questions()
    report = validate_questions(questions, anomalies, page_count)

    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

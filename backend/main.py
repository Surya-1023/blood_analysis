import io
import os
import re
from typing import Optional

import fitz  # PyMuPDF
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

load_dotenv()

app = FastAPI(title="Blood Work Analyzer API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_REPORT_CHARS = 50000

class AnalyzeRequest(BaseModel):
    blood_report: str = Field(min_length=1, max_length=MAX_REPORT_CHARS)

class Marker(BaseModel):
    name: str
    value: Optional[float] = None
    value_text: str = ""
    unit: str = ""
    status: str = "UNKNOWN"
    reference: str = ""
    raw: str = ""

class AnalyzeResponse(BaseModel):
    extracted_values: str
    health_summary: str
    diet_plan: str
    markers: list[Marker]
    total_markers: int
    normal_count: int
    high_count: int
    low_count: int
    unclear_count: int

def get_llm():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is missing. Add it to backend/.env and restart.")
    return ChatGroq(
        model=os.getenv("MODEL_NAME", "openai/gpt-oss-120b"),
        temperature=0,
        max_retries=1,
        timeout=60,
    )

def extract_pdf_text(content: bytes) -> str:
    try:
        with fitz.open(stream=content, filetype="pdf") as document:
            pages = [page.get_text("text") for page in document]
        text = "\n".join(pages).strip()
        if not text:
            raise HTTPException(
                status_code=422,
                detail="No selectable text was found in this PDF. If it is a scanned image, run OCR first or paste the report text."
            )
        return text[:MAX_REPORT_CHARS]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="The uploaded file could not be read as a valid PDF.") from exc

def parse_markers(extracted: str) -> list[dict]:
    """Parse the existing Stage 1 line format without adding another LLM call."""
    markers = []
    for line in extracted.splitlines():
        clean = re.sub(r"^\s*[-*•\d.)\s]+", "", line).strip()
        if not clean or "|" not in clean:
            continue
        parts = [p.strip() for p in clean.split("|")]
        if len(parts) < 2:
            continue
        left = re.match(r"(.+?)\s*:\s*(.+)$", parts[0])
        if not left:
            continue
        name, value_text = left.group(1).strip(), left.group(2).strip()
        status_match = re.search(r"status\s*:\s*(HIGH|LOW|NORMAL|UNKNOWN)", " | ".join(parts), re.I)
        ref_match = re.search(r"reference\s*:\s*(.*)", " | ".join(parts), re.I)
        status = status_match.group(1).upper() if status_match else "UNKNOWN"
        # Use the first numeric value for visualization; retain the complete value/unit text too.
        number_match = re.search(r"[-+]?\d+(?:[.,]\d+)?", value_text)
        value = None
        unit = ""
        if number_match:
            try:
                value = float(number_match.group(0).replace(",", "."))
                unit = value_text[number_match.end():].strip()
            except ValueError:
                pass
        reference = ref_match.group(1).strip() if ref_match else ""
        markers.append({
            "name": name[:100],
            "value": value,
            "value_text": value_text[:100],
            "unit": unit[:30],
            "status": status,
            "reference": reference[:100],
            "raw": clean[:300],
        })
    return markers[:100]

def run_analysis(report: str) -> dict:
    llm = get_llm()

    # STAGE 1 — unchanged workflow: extract all test values and flag them against report ranges.
    extraction_prompt = f"""
You are a medical data extraction assistant.

From the blood report below, extract ALL test values and classify each one as HIGH, LOW, or NORMAL
based on the reference ranges provided in the report.

Format your response as:
- Test Name: value | Status: HIGH/LOW/NORMAL | Reference: range

Do not invent values or reference ranges. If a value or range is missing or unclear, state that clearly.

Blood Report:
{report}
"""
    try:
        extraction_response = llm.invoke(extraction_prompt)
        extracted_values = extraction_response.content
        if not isinstance(extracted_values, str):
            extracted_values = str(extracted_values)

        # STAGE 2 — unchanged workflow: use Stage 1 output for summary and Indian diet guidance.
        diet_prompt = f"""
You are a clinical nutritionist specializing in Indian dietary habits.

Based on the blood work analysis below, provide two clearly separated sections:

SECTION 1 - HEALTH SUMMARY:
Write 4-5 lines explaining the patient's condition in simple, non-technical language.
Do not diagnose a disease or imply certainty beyond the provided report.

SECTION 2 - INDIAN DIET PLAN:
List foods to eat more of and foods to avoid, using commonly available Indian foods
like dal, sabzi, roti, rice, etc. Keep it practical and concise.

Blood Work Analysis:
{extracted_values}
"""
        diet_response = llm.invoke(diet_prompt)
        full_response = diet_response.content
        if not isinstance(full_response, str):
            full_response = str(full_response)

        if "SECTION 2" in full_response:
            parts = full_response.split("SECTION 2", 1)
            health_summary = parts[0].replace("SECTION 1 - HEALTH SUMMARY:", "").replace("SECTION 1", "").strip()
            diet_plan = ("SECTION 2" + parts[1]).replace("SECTION 2 - INDIAN DIET PLAN:", "").replace("SECTION 2", "").strip()
        else:
            health_summary, diet_plan = full_response.strip(), ""

        markers = parse_markers(extracted_values)
        statuses = [m["status"] for m in markers]
        return {
            "extracted_values": extracted_values.strip(),
            "health_summary": health_summary,
            "diet_plan": diet_plan or full_response.strip(),
            "markers": markers,
            "total_markers": len(markers),
            "normal_count": statuses.count("NORMAL"),
            "high_count": statuses.count("HIGH"),
            "low_count": statuses.count("LOW"),
            "unclear_count": sum(1 for status in statuses if status not in ("HIGH", "LOW", "NORMAL")),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Analysis failed. Check backend logs, your Groq API key, and MODEL_NAME. ({type(exc).__name__})"
        ) from exc

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Blood Work Analyzer API"}

@app.post("/api/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/octet-stream") and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Please upload a PDF file.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded PDF is empty.")
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is too large. Maximum upload size is 12 MB.")
    text = extract_pdf_text(content)
    return {"text": text, "characters": len(text)}

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_report(payload: AnalyzeRequest):
    report = payload.blood_report.strip()
    if not report:
        raise HTTPException(status_code=400, detail="Please paste a blood work report before analyzing.")
    return run_analysis(report)

@app.post("/api/report/pdf")
def download_report(payload: AnalyzeResponse):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm,
        topMargin=17*mm, bottomMargin=17*mm, title="Blood Work Analysis Report",
        author="Blood Work Analyzer"
    )
    base = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=base["Title"], textColor=colors.HexColor("#1f6c59"), alignment=TA_LEFT, fontSize=21, leading=26, spaceAfter=5)
    sub_style = ParagraphStyle("Sub", parent=base["Normal"], textColor=colors.HexColor("#66766f"), fontSize=9, leading=14, spaceAfter=12)
    heading_style = ParagraphStyle("HeadingGreen", parent=base["Heading2"], textColor=colors.HexColor("#1f6c59"), fontSize=13, leading=17, spaceBefore=10, spaceAfter=7)
    body_style = ParagraphStyle("BodySoft", parent=base["BodyText"], textColor=colors.HexColor("#3e5149"), fontSize=9, leading=14, spaceAfter=5)
    small_style = ParagraphStyle("Small", parent=body_style, fontSize=8, leading=11)
    def safe(value):
        value = str(value or "")
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    story = [
        Paragraph("Blood Work Analysis", title_style),
        Paragraph("Health summary, extracted markers, and suggested Indian diet plan", sub_style),
        Paragraph("Dashboard overview", heading_style),
    ]
    overview = [
        ["Total markers", "Normal", "High", "Low", "Unclear"],
        [str(payload.total_markers), str(payload.normal_count), str(payload.high_count), str(payload.low_count), str(payload.unclear_count)]
    ]
    table = Table(overview, colWidths=[34*mm]*5)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e7f2eb")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.HexColor("#245c49")),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("GRID", (0,0), (-1,-1), .4, colors.HexColor("#d9e6de")),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    story += [table, Paragraph("Health summary", heading_style), Paragraph(safe(payload.health_summary), body_style)]
    story += [Paragraph("Suggested Indian diet plan", heading_style), Paragraph(safe(payload.diet_plan), body_style)]
    story += [Paragraph("Extracted blood markers", heading_style)]
    rows = [["Test", "Value", "Status", "Reference range"]]
    for marker in payload.markers:
        rows.append([safe(marker.name), safe(marker.value_text), safe(marker.status), safe(marker.reference)])
    if len(rows) == 1:
        rows.append(["No structured markers parsed", "—", "—", "—"])
    marker_table = Table(rows, colWidths=[48*mm, 32*mm, 24*mm, 48*mm], repeatRows=1)
    marker_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e7f2eb")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.HexColor("#245c49")),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 7),
        ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#d9e6de")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story += [marker_table, Spacer(1, 10), Paragraph(
        "<b>Important:</b> This AI-generated report is informational and is not a medical diagnosis. "
        "Confirm results and interpretation with a qualified healthcare professional.", small_style
    )]
    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="blood-work-analysis.pdf"'}
    )

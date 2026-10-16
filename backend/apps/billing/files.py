import io
from html import escape
from pathlib import Path

import pymupdf as fitz
from PIL import Image
from rest_framework.exceptions import ValidationError

ALLOWED = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def validate_file(upload):
    extension = Path(upload.name).suffix.lower()
    if extension not in ALLOWED or upload.content_type != ALLOWED[extension]:
        raise ValidationError("Upload a PDF, JPG/JPEG or PNG with a matching MIME type.")
    if upload.size > 10 * 1024 * 1024:
        raise ValidationError("Payment proof must be 10 MB or smaller.")
    content = upload.read(10 * 1024 * 1024 + 1)
    if not content or len(content) > 10 * 1024 * 1024:
        raise ValidationError("Payment proof must be nonempty and 10 MB or smaller.")
    try:
        if extension == ".pdf":
            if not content.startswith(b"%PDF-"):
                raise ValueError()
            with fitz.open(stream=content, filetype="pdf") as doc:
                if doc.is_encrypted or not doc.page_count:
                    raise ValueError()
        else:
            with Image.open(io.BytesIO(content)) as image:
                if image.format != ("PNG" if extension == ".png" else "JPEG"):
                    raise ValueError()
                image.verify()
    except Exception as exc:
        raise ValidationError("The file contents do not match a readable PDF or image.") from exc
    return content, extension


def render_pdf(invoice):
    s = invoice.snapshot

    def e(value):
        return escape(str(value or "")).replace("\n", "<br>")

    def details(keys):
        return "<br>".join(e(s.get(key)) for key in keys if s.get(key))

    status = invoice.get_status_display()
    from .services import overdue

    if overdue(invoice):
        status += " (overdue)"
    html = f"""<html><body><h1>ANNUAL INVOICE</h1><h2>{e(s["issuer_name"])}</h2>
    <p>{details(["issuer_address", "issuer_registration_number", "tax_number", "issuer_email", "issuer_phone"])}</p>
    <hr><h2>{e(invoice.invoice_number)}</h2>
    <p>Billing year: {invoice.billing_year}<br>Issued: {invoice.issued_at}<br>Due: {invoice.due_at}<br>Status: {e(status)}</p>
    <h3>Bill to</h3><p>{details(["customer_name", "customer_address"])}</p>
    <table><tr><th>Description</th><th>Amount ({e(invoice.currency)})</th></tr>
    <tr><td>Annual platform fee - {invoice.billing_year}</td><td>{invoice.amount:,.2f}</td></tr>
    <tr><td>Tax / VAT ({e(s["tax_rate"])}%)</td><td>{invoice.tax_amount:,.2f}</td></tr>
    <tr><th>Total due</th><th>{invoice.total_amount:,.2f}</th></tr></table>
    <h3>Payment details</h3><p>{details(["bank_name", "bank_account_name", "bank_account_number", "bank_branch", "swift_code"])}</p>
    <p>Payment reference: <b>{e(invoice.invoice_number)}</b></p>
    <p>{e(s.get("payment_instructions"))}</p></body></html>"""
    css = "body {font-family: sans-serif; font-size:11pt; color:#203748} h1 {font-size:24pt;color:#174f49} h2 {font-size:15pt} h3 {font-size:12pt;margin-top:22pt} table {width:100%;border-collapse:collapse} td,th {padding:12pt;border-bottom:1px solid #ccd7d5;text-align:left} p {line-height:1.5}"
    story = fitz.Story(html=html, user_css=css)
    output = io.BytesIO()
    writer = fitz.DocumentWriter(output)
    more = True
    while more:
        device = writer.begin_page(fitz.paper_rect("a4"))
        more, _ = story.place(fitz.Rect(48, 40, 547, 792))
        story.draw(device)
        writer.end_page()
    writer.close()
    return output.getvalue()

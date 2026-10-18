#!/usr/bin/env python3
"""
generate_demo_invoices.py
Genera facturas realistas en PDF e Imagen para la demo del Hackathon:
1. demo-files/01_Factura_CloudServers_TC01.pdf (Caso Feliz: PAGAR)
2. demo-files/02_Factura_GrowthAgency_TC04.pdf (Umbral Excedido: ESCALAR)
3. demo-files/03_Factura_VentaPosDuo_TC11.pdf (Lista Negra: FRENAR)
4. demo-files/04_Recibo_EntidadFantasma_TC08.png (Imagen escaneada: FRENAR por datos inválidos)
5. fixtures/TC-08-scan.pdf (Para completar el fixture pendiente)
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

os.makedirs("demo-files", exist_ok=True)
os.makedirs("fixtures", exist_ok=True)

# Paleta de colores profesionales
PRIMARY = colors.HexColor("#185338")      # Verde Blinka
DARK_TEXT = colors.HexColor("#1A202C")
MUTED_TEXT = colors.HexColor("#718096")
LIGHT_BG = colors.HexColor("#F7FAFC")
BORDER_COLOR = colors.HexColor("#E2E8F0")

def build_pdf_invoice(filename, data):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=PRIMARY
    )
    
    header_right = ParagraphStyle(
        'HeaderRight',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=MUTED_TEXT,
        alignment=2 # Right
    )

    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=DARK_TEXT
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=DARK_TEXT
    )

    body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=DARK_TEXT
    )

    # 1. Header con Branding y Folio
    header_data = [
        [
            Paragraph(f"<b>{data['vendor_name']}</b><br/><font color='#718096' size=8>TAX ID / CIF: {data.get('vendor_tax_id', 'N/A')}<br/>{data.get('address', '100 Enterprise Way, Suite 400')}</font>", body_style),
            Paragraph(f"<font color='#185338' size=18><b>FACTURA COMERCIAL</b></font><br/><b>Folio:</b> {data['invoice_number']}<br/><b>Fecha de emisión:</b> {data['issue_date']}<br/><b>Fecha de vencimiento:</b> {data['due_date']}", header_right)
        ]
    ]
    header_table = Table(header_data, colWidths=[280, 252])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=20))

    # 2. Datos del Cliente
    client_data = [
        [
            Paragraph("<b>FACTURAR A:</b>", body_bold),
            Paragraph("<b>DETALLES DE PAGO:</b>", body_bold)
        ],
        [
            Paragraph("<b>Blinka Technologies S.A.</b><br/>Tax ID: BLK-990182-X<br/>Av. Providencia 1208, Piso 7<br/>Santiago, Chile", body_style),
            Paragraph(f"<b>Moneda:</b> {data['currency']}<br/><b>Condición de pago:</b> Transferencia bancaria (Net 15)<br/><b>Banco destino:</b> JPMorgan Chase Bank N.A.<br/><b>Cuenta / IBAN:</b> **** **** **** 4892", body_style)
        ]
    ]
    client_table = Table(client_data, colWidths=[266, 266])
    client_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), LIGHT_BG),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(client_table)
    story.append(Spacer(1, 25))

    # 3. Tabla de Ítems
    table_items = [
        [
            Paragraph("<b>Descripción del servicio / concepto</b>", body_bold),
            Paragraph("<b>Cant.</b>", body_bold),
            Paragraph("<b>Precio Unit.</b>", body_bold),
            Paragraph("<b>Total</b>", body_bold)
        ]
    ]
    for item in data['line_items']:
        table_items.append([
            Paragraph(item['description'], body_style),
            Paragraph(str(item['quantity']), body_style),
            Paragraph(f"${item['unit_price']:,.2f} {data['currency']}", body_style),
            Paragraph(f"${item['total']:,.2f} {data['currency']}", body_bold)
        ])

    items_table = Table(table_items, colWidths=[290, 50, 100, 92])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#EBF3EE")),
        ('TEXTCOLOR', (0,0), (-1,0), PRIMARY),
        ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 15))

    # 4. Totales
    subtotal = data.get('subtotal', sum(i['total'] for i in data['line_items']))
    tax = data.get('tax_amount', 0)
    total = data.get('total_amount', subtotal + tax)

    totals_data = [
        ["Subtotal:", f"${subtotal:,.2f} {data['currency']}"],
        ["Impuestos (IVA / Tax):", f"${tax:,.2f} {data['currency']}"],
        ["TOTAL A PAGAR:", f"${total:,.2f} {data['currency']}"]
    ]
    totals_table = Table(totals_data, colWidths=[150, 100], hAlign='RIGHT')
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('FONTNAME', (0,0), (-1,1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,1), 9),
        ('TEXTCOLOR', (0,0), (-1,1), MUTED_TEXT),
        ('FONTNAME', (0,2), (-1,2), 'Helvetica-Bold'),
        ('FONTSIZE', (0,2), (-1,2), 11),
        ('TEXTCOLOR', (0,2), (-1,2), PRIMARY),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LINEABOVE', (0,2), (-1,2), 1, PRIMARY),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 35))

    # 5. Pie de página formal con sello de validez fiscal
    footer_text = Paragraph(
        "<font size=8 color='#718096'>Factura electrónica generada conforme a las normativas tributarias internacionales.<br/>"
        "Resolución de Facturación No. 2026-9081. Este documento constituye título ejecutivo para todos los efectos legales.<br/>"
        f"<b>Hash de verificación fiscal:</b> {abs(hash(data['invoice_number']))}908123-SHA256</font>",
        body_style
    )
    story.append(footer_text)

    doc.build(story)
    print(f"✓ Generado PDF: {filename}")

def build_scanned_receipt_image(filename):
    """Genera una imagen PNG realista simulando un recibo/factura escaneada con arrugas y textura."""
    w, h = 800, 1100
    img = Image.new("RGB", (w, h), color=(248, 247, 242)) # Papel ligeramente crema
    draw = ImageDraw.Draw(img)

    # Simular textura de papel con líneas suaves
    for y in range(0, h, 8):
        draw.line([(0, y), (w, y)], fill=(244, 243, 238), width=1)

    # Cabecera simulando sello o recibo físico
    draw.rectangle([40, 40, w - 40, 100], fill=(235, 232, 222), outline=(180, 175, 160))
    draw.text((60, 55), "RECIBO FISCAL DE SERVICIOS - EMISION FISICA", fill=(40, 40, 40))

    # Proveedor Entidad Fantasma (SIN TAX ID a propósito para TC-08)
    draw.text((60, 140), "PROVEEDOR: Entidad Fantasma", fill=(20, 20, 20))
    draw.text((60, 170), "DIRECCIÓN: Calle Desconocida 404, Sin Registro", fill=(80, 80, 80))
    draw.text((60, 200), "TELÉFONO: +1 (555) 019-2834", fill=(80, 80, 80))

    # Folio y Fechas
    draw.text((500, 140), "FOLIO: INV-EF-900", fill=(180, 40, 40))
    draw.text((500, 170), "FECHA: 2026-10-07", fill=(50, 50, 50))
    draw.text((500, 200), "VENCE: 2026-10-21", fill=(50, 50, 50))

    # Línea separadora
    draw.line([(40, 240), (w - 40, 240)], fill=(150, 145, 130), width=2)

    # Ítems
    draw.text((60, 270), "DESCRIPCIÓN DEL CONCEPTO", fill=(30, 30, 30))
    draw.text((450, 270), "CANT.", fill=(30, 30, 30))
    draw.text((550, 270), "MONTO", fill=(30, 30, 30))
    draw.line([(40, 300), (w - 40, 300)], fill=(200, 195, 180), width=1)

    draw.text((60, 330), "Consulting services (Honorarios especiales)", fill=(50, 50, 50))
    draw.text((460, 330), "1", fill=(50, 50, 50))
    draw.text((550, 330), "$850.00 USD", fill=(50, 50, 50))

    # Subtotal e impuestos
    draw.line([(40, 420), (w - 40, 420)], fill=(150, 145, 130), width=1)
    draw.text((420, 440), "SUBTOTAL:", fill=(80, 80, 80))
    draw.text((550, 440), "$850.00 USD", fill=(50, 50, 50))

    draw.text((420, 470), "IMPUESTO (TAX):", fill=(80, 80, 80))
    draw.text((550, 470), "$50.00 USD", fill=(50, 50, 50))

    draw.line([(400, 500), (w - 40, 500)], fill=(50, 50, 50), width=2)
    draw.text((420, 520), "TOTAL FACTURADO:", fill=(10, 10, 10))
    draw.text((550, 520), "$900.00 USD", fill=(10, 10, 10))

    # Sello simulado "PAGADO / EN REVISION" con rotación
    stamp = Image.new("RGBA", (300, 120), (255, 255, 255, 0))
    stamp_draw = ImageDraw.Draw(stamp)
    stamp_draw.rectangle([10, 10, 280, 100], outline=(180, 50, 50, 200), width=4)
    stamp_draw.text((35, 35), "AUDITADO - PENDIENTE", fill=(180, 50, 50, 200))
    stamp_rot = stamp.rotate(14, expand=1, resample=Image.BICUBIC)
    img.paste(stamp_rot, (100, 600), stamp_rot)

    # Simular una ligera rotación de escaneo (1.2 grados) para aspecto analógico
    img_rotated = img.rotate(1.2, resample=Image.BICUBIC, expand=False, fillcolor=(240, 238, 230))
    
    # Aplicar un micro-desenfoque para simular cámara/escáner real
    img_final = img_rotated.filter(ImageFilter.GaussianBlur(radius=0.4))
    img_final.save(filename, "PNG")
    print(f"✓ Generada Imagen escaneada: {filename}")

    # También guardarlo como PDF para cumplir con fixtures/TC-08-scan.pdf
    img_final.convert("RGB").save("fixtures/TC-08-scan.pdf", "PDF", resolution=100.0)
    print("✓ Generado fixture: fixtures/TC-08-scan.pdf")


# 1. Factura TC-01: CloudServers Inc (PAGAR)
build_pdf_invoice("demo-files/01_Factura_CloudServers_TC01.pdf", {
    "vendor_name": "CloudServers Inc",
    "vendor_tax_id": "CLOUD-SERVERS-INC",
    "invoice_number": "INV-9022",
    "issue_date": "2026-10-01",
    "due_date": "2026-10-15",
    "currency": "USD",
    "subtotal": 400.00,
    "tax_amount": 20.00,
    "total_amount": 420.00,
    "line_items": [
        {"description": "Cloud server hosting - Dedicated Node (US-East)", "quantity": 1, "unit_price": 400.00, "total": 400.00}
    ]
})

# 2. Factura TC-04: Growth Agency (ESCALAR - Umbral Excedido $3,500 > $1,000)
build_pdf_invoice("demo-files/02_Factura_GrowthAgency_TC04.pdf", {
    "vendor_name": "Growth Agency",
    "vendor_tax_id": "GROWTH-AGENCY",
    "invoice_number": "INV-GA-3500",
    "issue_date": "2026-10-03",
    "due_date": "2026-10-25",
    "currency": "USD",
    "subtotal": 3300.00,
    "tax_amount": 200.00,
    "total_amount": 3500.00,
    "line_items": [
        {"description": "Marketing campaign Q4 - Performance Ad Spend & Strategy", "quantity": 1, "unit_price": 3300.00, "total": 3300.00}
    ]
})

# 3. Factura TC-11: Venta Pos Duo (FRENAR - Proveedor en Lista Negra)
build_pdf_invoice("demo-files/03_Factura_VentaPosDuo_TC11.pdf", {
    "vendor_name": "Venta Pos Duo",
    "vendor_tax_id": "VENTA-POS-DUO",
    "invoice_number": "INV-VPD-200",
    "issue_date": "2026-10-10",
    "due_date": "2026-10-26",
    "currency": "USD",
    "subtotal": 190.00,
    "tax_amount": 10.00,
    "total_amount": 200.00,
    "line_items": [
        {"description": "POS terminal model X-200 Hardware Replacement", "quantity": 1, "unit_price": 190.00, "total": 190.00}
    ]
})

# 4. Imagen escaneada TC-08: Entidad Fantasma (FRENAR - Sin Tax ID)
build_scanned_receipt_image("demo-files/04_Recibo_EntidadFantasma_TC08.png")

print("\n🎉 Todos los archivos de demo se generaron exitosamente en 'demo-files/'!")

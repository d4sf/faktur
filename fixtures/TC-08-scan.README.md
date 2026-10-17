# TC-08-scan.pdf — pendiente

Este archivo es un placeholder. El PDF con estética de escaneo (foto torcida, borrosa) se añadirá antes de la demo de extracción (T10).

## Requisitos del PDF

- Debe contener una factura con datos legibles pero de baja calidad (escaneo con ángulo, sombras, compresión JPEG).
- El proveedor debe ser "Entidad Fantasma" (sin `tax_id`) para que el motor frene en la regla 1 (`ERR_INVALID_DATA`).
- El monto debe ser $900 USD para coincidir con TC-08.
- El nombre del archivo debe ser `TC-08-scan.pdf`.

## Uso

- **T10 (extracción):** se usa para probar que el extractor (Gemini) maneja documentos de baja calidad y que `field_confidence` refleja la incertidumbre.
- **Demo:** se muestra como ejemplo de "factura que el agente no pudo leer bien".
- **Runner (T6):** no lo usa. El runner usa `TC-08.json` (el ExtractedInvoice ya extraído).

## Cómo generar

Opciones:

1. Escanear una factura real con un teléfono (foto torcida, con sombras).
2. Usar un PDF existente y aplicarle rotación + compresión con `pdftk` o `qpdf`.
3. Generar con Python (reportlab + PIL) aplicando transformaciones.

Cualquiera de las tres sirve mientras el documento sea legible para un humano pero desafiante para el OCR.

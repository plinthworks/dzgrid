"""The text of a PDF, page by page, as JSON on stdout: for each page, its lines with their box (x0, y0, x1, y1 in
points, origin at the bottom left) and their text, NFKC-normalised (Arabic presentation forms back to letters).
Used by scripts/browser-print.mjs (Phase 6 step 11) on the files Chrome's `page.pdf()` writes. Needs pdfminer.six.
Usage: python3 -I scripts/pdf-text.py file.pdf"""
import json
import sys
import unicodedata

from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTTextContainer, LTTextLine

pages = []
for page in extract_pages(sys.argv[1], laparams=LAParams(line_margin=0.1, char_margin=1.0, boxes_flow=None)):
    lines = []

    def walk(o):
        if isinstance(o, LTTextLine):
            t = unicodedata.normalize('NFKC', o.get_text()).strip()
            if t:
                lines.append({'x0': round(o.x0, 1), 'y0': round(o.y0, 1), 'x1': round(o.x1, 1), 'y1': round(o.y1, 1), 'text': t})
        elif isinstance(o, LTTextContainer) or hasattr(o, '__iter__'):
            for c in o:
                walk(c)

    walk(page)
    pages.append({'height': round(page.height, 1), 'lines': lines})
json.dump(pages, sys.stdout, ensure_ascii=False)

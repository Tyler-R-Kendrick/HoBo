"""Write the full-casefold table that pins-archive-fold.test.ts checks foldName against.

    python3 -I scripts/test/support/unicode-casefold.py > scripts/test/support/unicode-casefold.json

For every assigned code point of the Unicode version Python ships:
- "fold": [code point, NFD(casefold(NFD(c)))] where that differs from NFD(c): the
  canonical caseless match of Unicode 3.13 (D145), which Linux casefold directories and
  APFS apply;
- "upcase": [code point, its uppercase] for BMP code points with a one-character
  uppercase: the simple mapping NTFS's $UpCase table holds.
"""
import json
import sys
import unicodedata as u


def key(text):
    return u.normalize("NFD", u.normalize("NFD", text).casefold())


fold, upcase = [], []
for cp in range(0x110000):
    if 0xD800 <= cp <= 0xDFFF:
        continue
    c = chr(cp)
    if u.category(c) == "Cn":
        continue
    k = key(c)
    if k != u.normalize("NFD", c):
        fold.append([cp, k])
    up = c.upper()
    if cp <= 0xFFFF and len(up) == 1 and up != c:
        upcase.append([cp, ord(up)])
json.dump(
    {"unicode": u.unidata_version, "fold": fold, "upcase": upcase},
    sys.stdout,
    ensure_ascii=True,
    separators=(",", ":"),
)
sys.stdout.write("\n")

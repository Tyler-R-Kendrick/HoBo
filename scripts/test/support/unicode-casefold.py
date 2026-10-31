"""Write the Unicode table that pins-archive-fold.test.ts checks the reader's name rules against.

    python3 -I scripts/test/support/unicode-casefold.py UCD_DIR > scripts/test/support/unicode-casefold.json

UCD_DIR holds DerivedCoreProperties.txt from https://www.unicode.org/Public/15.1.0/ucd/,
the same Unicode version as the Python running this (3.13: 15.1.0); both are checked.

For every assigned code point of the Unicode version Python ships:
- "fold": [code point, NFD(casefold(NFD(c)))] where that differs from NFD(c): the
  canonical caseless match of Unicode 3.13 (D145), which Linux casefold directories and
  APFS apply;
- "upcase": [code point, its uppercase] for BMP code points with a one-character
  uppercase: the simple mapping NTFS's $UpCase table holds;
- "ignorable": Default_Ignorable_Code_Point from DerivedCoreProperties.txt, as
  inclusive [first, last] ranges, adjacent ranges merged.
"""
import json
import os
import sys
import unicodedata as u

UCD = sys.argv[1]


def ucd_lines(name):
    with open(os.path.join(UCD, name), encoding="utf-8") as text:
        first = text.readline()
        if u.unidata_version not in first:
            sys.exit(f"{name} is not Unicode {u.unidata_version}: {first.strip()}")
        for line in text:
            line = line.split("#", 1)[0].strip()
            if line:
                yield [field.strip() for field in line.split(";")]


def ranges(prop):
    found = []
    for fields in ucd_lines("DerivedCoreProperties.txt"):
        if fields[1:] != [prop]:
            continue
        points = fields[0]
        first, _, last = points.partition("..")
        found.append([int(first, 16), int(last or first, 16)])
    found.sort()
    merged = []
    for first, last in found:
        if merged and merged[-1][1] + 1 == first:
            merged[-1][1] = last
        else:
            merged.append([first, last])
    return merged


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
    {
        "unicode": u.unidata_version,
        "fold": fold,
        "upcase": upcase,
        "ignorable": ranges("Default_Ignorable_Code_Point"),
    },
    sys.stdout,
    ensure_ascii=True,
    separators=(",", ":"),
)
sys.stdout.write("\n")

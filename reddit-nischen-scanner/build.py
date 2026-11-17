#!/usr/bin/env python3
"""Baut die n8n-SDK-Dateien: ersetzt "__JS:datei__" / "__TXT:datei__" durch JSON-Strings."""
import json, pathlib, re, sys
root = pathlib.Path(__file__).parent
out = root / "build"; out.mkdir(exist_ok=True)
pat = re.compile(r'"__(JS|TXT):([^"]+)__"')
def repl(m):
    sub = "code" if m.group(1) == "JS" else "prompts"
    return json.dumps((root / sub / m.group(2)).read_text(encoding="utf-8"), ensure_ascii=False)
for f in sorted((root / "workflows").glob("*.ts")):
    (out / f.name).write_text(pat.sub(repl, f.read_text(encoding="utf-8")), encoding="utf-8")
    print("built", f.name)

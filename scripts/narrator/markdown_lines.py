#!/usr/bin/env python3
"""O markdown das falas: onde as frases se escrevem, e de onde o json é gerado.

    python3 scripts/narrator/markdown_lines.py scripts/narrator/lines.md

Formato, e ele é de propósito frouxo: `### ` com o slug entre crases abre uma fala,
cada `- ` abaixo dele é um take, `locale: <tag>` em qualquer lugar antes da primeira
fala diz o idioma, e todo o resto é comentário para quem escreve.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

from catalog import load_catalog, require_slug, require_text, write_catalog

SLUG_HEADING = re.compile(r"^#{1,6}\s+`([^`]+)`\s*$")
TAKE_ITEM = re.compile(r"^[-*]\s+(.+?)\s*$")
LOCALE_LINE = re.compile(r"^\s*locale:\s*([A-Za-z]{2}-[A-Za-z0-9]{2,4})\s*$")


def parse_markdown(text: str, source: Path) -> tuple[str, list[dict[str, Any]]]:
    """Devolve o idioma e as entradas, na ordem em que aparecem no arquivo.

    >>> parse_markdown("locale: pt-BR\\n### `knife`\\n- Faca.\\n", Path("lines.md"))
    ('pt-BR', [{'slug': 'knife', 'takes': ['Faca.']}])
    """
    locale, entries = "", []
    for line in text.splitlines():
        locale = read_locale(line, locale, entries)
        collect(line, entries, source)
    return require_locale(locale, source), require_entries(entries, source)


def read_locale(line: str, found: str, entries: list[dict[str, Any]]) -> str:
    """Só antes da primeira fala: depois disso, `locale:` é texto de comentário."""
    match = LOCALE_LINE.match(line)
    return match.group(1) if match and not entries and not found else found


def collect(line: str, entries: list[dict[str, Any]], source: Path) -> None:
    heading = SLUG_HEADING.match(line)
    if heading:
        entries.append({"slug": require_slug(heading.group(1), source), "takes": []})
        return
    take = TAKE_ITEM.match(line)
    if take and entries:
        entries[-1]["takes"].append(require_text(take.group(1), entries[-1]["slug"], source))


def require_locale(locale: str, source: Path) -> str:
    if not locale:
        raise ValueError(f"{source}: falta a linha `locale: pt-BR` antes da primeira fala")
    return locale


def require_entries(entries: list[dict[str, Any]], source: Path) -> list[dict[str, Any]]:
    empty = [entry["slug"] for entry in entries if not entry["takes"]]
    if empty:
        raise ValueError(f"{source}: fala sem nenhum take (linha com `- `): {empty}")
    if not entries:
        raise ValueError(f"{source}: nenhuma fala; esperado ao menos um `### ` com o slug")
    return entries


def json_path(markdown: Path) -> Path:
    """`lines.pt-BR.md` -> `lines.pt-BR.json`, lado a lado."""
    return markdown.with_suffix(".json")


def import_markdown(markdown: Path) -> Path:
    """Gera o json que o gerador lê. O markdown continua sendo a fonte."""
    locale, entries = parse_markdown(markdown.read_text(encoding="utf-8"), markdown)
    target = json_path(markdown)
    write_catalog(target, locale, entries)
    return target


def append_take_md(markdown: Path, slug: str, text: str) -> None:
    """Guarda a frase no markdown, sob o slug que já existe ou numa seção nova.

    É o que mantém uma fonte só: o menu escreve aqui, não no json gerado.
    """
    body = markdown.read_text(encoding="utf-8")
    lines = body.splitlines()
    written = (insert_take(lines, slug, text) if has_slug(lines, slug)
               else lines + new_section(slug, text))
    markdown.write_text("\n".join(written) + "\n", encoding="utf-8")


def has_slug(lines: list[str], slug: str) -> bool:
    """Comparação exata: `knife` não é a seção de `knife-throw`."""
    return any(slug_of(line) == slug for line in lines)


def slug_of(line: str) -> str | None:
    heading = SLUG_HEADING.match(line)
    return heading.group(1) if heading else None


def insert_take(lines: list[str], slug: str, text: str) -> list[str]:
    """Entra depois do último take daquela fala, dentro da seção dela."""
    written = list(lines)
    written.insert(last_take_index(lines, slug) + 1, f"- {text}")
    return written


def last_take_index(lines: list[str], slug: str) -> int:
    """O último `- ` antes da próxima fala; a própria linha do título quando não há take."""
    start = next(i for i, line in enumerate(lines) if slug_of(line) == slug)
    takes = [i for i in section_of(lines, start) if TAKE_ITEM.match(lines[i])]
    return takes[-1] if takes else start


def section_of(lines: list[str], start: int) -> range:
    """Da linha da fala até a próxima fala, ou até o fim do arquivo."""
    following = [i for i, line in enumerate(lines[start + 1:], start + 1) if slug_of(line)]
    return range(start, following[0] if following else len(lines))


def new_section(slug: str, text: str) -> list[str]:
    return ["", f"### `{slug}`", "", f"- {text}"]


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        raise SystemExit("uso: markdown_lines.py <arquivo.md>; ex.: scripts/narrator/lines.md")
    target = import_markdown(Path(argv[0]))
    catalog = load_catalog(target)
    print(f"{target}: {len(catalog.slugs)} falas, {len(catalog.lines)} takes, "
          f"idioma {catalog.locale}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

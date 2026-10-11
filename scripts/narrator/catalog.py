"""Catálogo de falas do narrador: json versionado -> objeto tipado e validado.

O texto é a fonte da verdade do narrador. O wav e o webm são derivados dele, e
`build_narrator.py` refaz os dois a qualquer momento — trocar uma fala é editar
`lines.json` e regravar aquele slug, nunca mexer no binário.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@dataclass(frozen=True)
class NarratorLine:
    """Uma fala e a sua posição no catálogo.

    >>> NarratorLine(slug="double-kill", text="Double kill.", take=1).stem
    'double-kill-01'
    """

    slug: str
    text: str
    take: int

    @property
    def stem(self) -> str:
        """Nome do arquivo, sem extensão, do wav do tts até o webm do jogo."""
        return f"{self.slug}-{self.take:02d}"


@dataclass(frozen=True)
class NarratorCatalog:
    """As falas de um idioma, na ordem em que aparecem no json."""

    locale: str
    lines: tuple[NarratorLine, ...]

    @property
    def slugs(self) -> tuple[str, ...]:
        """Slugs distintos, em ordem de catálogo."""
        return tuple(dict.fromkeys(line.slug for line in self.lines))

    def only(self, wanted: frozenset[str]) -> NarratorCatalog:
        """Recorta o catálogo, para regravar uma medalha sem refazer as outras.

        >>> catalog.only(frozenset({"first-blood"})).slugs
        ('first-blood',)
        """
        unknown = sorted(wanted - set(self.slugs))
        if unknown:
            raise ValueError(f"slug fora do catálogo: {unknown}; conhecidos: {list(self.slugs)}")
        return NarratorCatalog(self.locale, tuple(l for l in self.lines if l.slug in wanted))


def load_catalog(path: Path) -> NarratorCatalog:
    """Lê e valida o catálogo de falas.

    >>> load_catalog(Path("scripts/narrator/lines.json")).locale
    'en-US'
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(
            f"{path}: esperado objeto {{locale, entries}}, veio {type(payload).__name__}"
        )
    return parse_catalog(payload, source=path)


def parse_catalog(payload: dict[str, Any], source: Path) -> NarratorCatalog:
    """Valida o payload já desserializado. `source` só aparece nas mensagens de erro."""
    locale = require_locale(payload, source)
    entries = require_entries(payload, source)
    lines = tuple(line for entry in entries for line in parse_entry(entry, source))
    reject_repeated_slugs(tuple(l.slug for l in lines if l.take == 1), source)
    return NarratorCatalog(locale=locale, lines=lines)


def require_locale(payload: dict[str, Any], source: Path) -> str:
    locale = payload.get("locale")
    if not isinstance(locale, str) or not locale.strip():
        raise ValueError(
            f"{source}: `locale` deve ser string não vazia (ex.: 'en-US'), veio {locale!r}"
        )
    return locale


def require_entries(payload: dict[str, Any], source: Path) -> list[Any]:
    entries = payload.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError(
            f"{source}: `entries` deve ser lista não vazia de {{slug, takes}}, veio {entries!r}"
        )
    return entries


def parse_entry(entry: Any, source: Path) -> tuple[NarratorLine, ...]:
    """Uma entrada do json vira uma fala por take."""
    if not isinstance(entry, dict):
        raise ValueError(f"{source}: cada entrada deve ser objeto {{slug, takes}}, veio {entry!r}")
    slug = require_slug(entry.get("slug"), source)
    takes = entry.get("takes")
    if not isinstance(takes, list) or not takes:
        raise ValueError(
            f"{source}: `takes` de {slug!r} deve ser lista não vazia de frases, veio {takes!r}"
        )
    return tuple(
        NarratorLine(slug, require_text(text, slug, source), take)
        for take, text in enumerate(takes, 1)
    )


def require_slug(slug: Any, source: Path) -> str:
    if not isinstance(slug, str) or not SLUG_PATTERN.match(slug):
        raise ValueError(
            f"{source}: `slug` deve casar {SLUG_PATTERN.pattern} "
            f"(ex.: 'double-kill'), veio {slug!r}"
        )
    return slug


def require_text(text: Any, slug: str, source: Path) -> str:
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{source}: take de {slug!r} deve ser frase não vazia, veio {text!r}")
    return text.strip()


def reject_repeated_slugs(slugs: tuple[str, ...], source: Path) -> None:
    """Slug repetido sobrescreveria o áudio do primeiro sem avisar."""
    repeated = sorted({slug for slug in slugs if slugs.count(slug) > 1})
    if repeated:
        raise ValueError(
            f"{source}: slug repetido em `entries`: {repeated}; "
            "cada slug entra uma vez, com N takes"
        )


def slugify(text: str) -> str:
    """Nome de arquivo a partir da frase, no mesmo formato dos slugs do catálogo.

    Corta em cinco palavras porque o slug é nome de arquivo, não resumo.

    >>> slugify("Três sixty, no scope!")
    'tres-sixty-no-scope'
    """
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    words = re.findall(r"[a-z0-9]+", plain.lower())[:5]
    if not words:
        raise ValueError(f"frase sem letra nem número, não dá para virar slug: {text!r}")
    return "-".join(words)


def catalog_path(base: Path, locale: str, base_locale: str) -> Path:
    """`lines.json` é o idioma base; cada outro idioma ganha o seu arquivo.

    Um arquivo por idioma porque frase não se traduz sozinha: a mesma medalha
    ganha um texto em cada língua, e o take de uma não serve para a outra.

    >>> catalog_path(Path("lines.json"), "pt-BR", "en-US")
    PosixPath('lines.pt-BR.json')
    """
    return base if locale == base_locale else base.with_name(f"{base.stem}.{locale}.json")


def append_take(path: Path, slug: str, text: str, locale: str = "en-US") -> NarratorCatalog:
    """Guarda a frase no catálogo, como novo take de um slug ou como slug novo.

    Cria o arquivo quando é o primeiro take daquele idioma; `locale` só é usado aí.

    >>> append_take(Path("scripts/narrator/lines.json"), "knife", "Blade contact.")
    """
    entries, existing_locale = catalog_entries(path, locale)
    place_take(entries, require_slug(slug, path), require_text(text, slug, path))
    write_catalog(path, existing_locale, entries)
    return load_catalog(path)


def catalog_entries(path: Path, locale: str) -> tuple[list[dict[str, Any]], str]:
    """As entradas de um catálogo que talvez ainda não exista."""
    if not path.is_file():
        return [], locale
    catalog = load_catalog(path)
    entries = [{"slug": slug, "takes": takes_of(catalog, slug)} for slug in catalog.slugs]
    return entries, catalog.locale


def takes_of(catalog: NarratorCatalog, slug: str) -> list[str]:
    return [line.text for line in catalog.lines if line.slug == slug]


def place_take(entries: list[dict[str, Any]], slug: str, text: str) -> None:
    """Acrescenta ao slug que já existe, ou cria a entrada no fim."""
    for entry in entries:
        if entry["slug"] == slug:
            entry["takes"].append(text)
            return
    entries.append({"slug": slug, "takes": [text]})


def write_catalog(path: Path, locale: str, entries: list[dict[str, Any]]) -> None:
    """No formato do biome, que é quem formata json neste repositório.

    A primeira versão escrevia uma entrada por linha, por causa do diff. O
    formatador reescrevia tudo no commit seguinte, e o arquivo gerado ficava
    eternamente sujo — brigar com o formatador do projeto sai mais caro que o
    diff mais largo.
    """
    payload = {"locale": locale, "entries": entries}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

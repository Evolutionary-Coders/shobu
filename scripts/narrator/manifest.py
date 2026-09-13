"""O índice que o cliente lê: slug -> arquivos daquela fala.

O cliente nunca monta nome de arquivo; ele procura o slug aqui e sorteia um dos
takes. Assim acrescentar uma variação é regravar e publicar, sem tocar em `.ts`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

EMPTY_MANIFEST: dict[str, object] = {"locale": "", "clips": {}}


@dataclass(frozen=True)
class NarratorClip:
    """Um arquivo entregue ao cliente, com o texto que o gerou."""

    slug: str
    file: str
    text: str


def build_manifest(locale: str, clips: tuple[NarratorClip, ...]) -> dict[str, object]:
    """Agrupa os clipes por slug, que é como o cliente procura uma fala.

    >>> build_manifest("en-US", (NarratorClip("knife", "knife-01.webm", "Knife."),))["clips"]
    {'knife': [{'file': 'knife-01.webm', 'text': 'Knife.'}]}
    """
    by_slug: dict[str, list[dict[str, str]]] = {}
    for clip in clips:
        by_slug.setdefault(clip.slug, []).append({"file": clip.file, "text": clip.text})
    return {"locale": locale, "clips": by_slug}


def merge_manifest(existing: dict[str, object], fresh: dict[str, object]) -> dict[str, object]:
    """Preserva os slugs que não foram regravados nesta execução (`--only`)."""
    kept = existing.get("clips")
    merged = dict(kept) if isinstance(kept, dict) else {}
    merged.update(clips_of(fresh))
    return {"locale": fresh["locale"], "clips": merged}


def clips_of(manifest: dict[str, object]) -> dict[str, object]:
    clips = manifest.get("clips")
    if not isinstance(clips, dict):
        raise ValueError(f"manifesto sem `clips` objeto: {manifest!r}; esperado {{locale, clips}}")
    return clips


def read_manifest(source: Path) -> dict[str, object]:
    """Devolve um manifesto vazio quando ainda não existe arquivo."""
    if not source.is_file():
        return dict(EMPTY_MANIFEST)
    return json.loads(source.read_text(encoding="utf-8"))


def write_manifest(target: Path, manifest: dict[str, object]) -> None:
    """Grava com quebra de linha no fim, para o diff do git ficar limpo."""
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

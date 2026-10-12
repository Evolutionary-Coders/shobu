"""Pronúncia do Kokoro em pt-BR: correções no fonema que o espeak-ng escreve.

O Kokoro não lê português direto: o texto vira fonema pelo espeak-ng (`pt-br`), e ele
lê o fonema. Três vícios aparecem em quase toda frase, e cada correção aqui foi medida
com o whisper sobre os 92 takes do mestre e do comandante:

- **`y` no lugar do `i` átono final.** `y` é a vogal do francês *tu*: `que` vira `ky`,
  `sangue` vira `sɐ̃ŋɡy`. Trocar por `i`, junto com o item abaixo: 14,8% -> 12,3% de
  erro de palavra.
- **`ə` enfiado entre consoantes.** `carnificina` vira `kaɾənifisina`, `verde` vira
  `veɾədʒy`. Sai.
- **a primeira consoante da fala sai com um estalo.** `Sinal` virava "Tinau", `Baixa`
  virava "Paixa", `Arena` virava "Prena": o modelo começa a fala no meio de uma
  oclusiva. Uma pausa (`…`) antes da primeira palavra resolveu as onze falas onde isso
  acontecia; o silêncio que ela deixa, o `encode.py` apara. **Só no `pm_santa`**: na
  `pf_dora` a mesma pausa vira um "e" ou um "o" antes da frase (o whisper ouviu
  um em cada três takes da ATLAS), e ela não tem o estalo.

O que foi tentado e **piorou**, para não refazer: reescrever as nasais (`eɪŋ` -> `ẽj`)
levou a 21,8%; trocar o `æ` final por `ɐ`, a 27,4%. Grafias alternativas por palavra
(`colaterau`, `abátis`, `derrubô`) não mudaram o que o whisper ouviu — onde a palavra
seguia difícil, a frase do roteiro foi reescrita.

Só o áudio passa por aqui: o manifesto, e por ele a legenda, guarda a frase do roteiro.
"""

from __future__ import annotations

# fonema do espeak -> o que o Kokoro precisa ler. Aplicadas em sequência.
PT_BR_PHONEME_FIXES: tuple[tuple[str, str], ...] = (("y", "i"), ("ə", ""))

# a pausa que segura o estalo da primeira consoante; o Kokoro a lê como silêncio.
LEADING_PAUSE = "… "
# as vozes que estalam na primeira consoante, e só elas levam a pausa.
LEADING_PAUSE_VOICES = frozenset({"pm_santa"})


def fix_phonemes(phonemes: str, voice: str,
                 fixes: tuple[tuple[str, str], ...] = PT_BR_PHONEME_FIXES) -> str:
    """Corrige os vícios do espeak pt-br e, na voz que precisa, põe a pausa de entrada.

    >>> fix_phonemes("ky kˌomˈɛsj a kˌaɾənifisˈinæ!", "pm_santa")
    '… ki kˌomˈɛsj a kˌaɾnifisˈinæ!'
    """
    for wrong, right in fixes:
        phonemes = phonemes.replace(wrong, right)
    return LEADING_PAUSE + phonemes if voice in LEADING_PAUSE_VOICES else phonemes

/**
 * O índice que a bancada do narrador publica em cada pasta de voz
 * (`scripts/narrator/manifest.py`). **O cliente nunca monta nome de arquivo**:
 * ele procura o slug aqui e sorteia um dos takes — é o contrato que permite
 * regravar uma fala, trocar o número de takes e não mexer em código nenhum.
 *
 * ```ts
 * pickTake(manifest, 'double-kill', 0.4)?.file // 'double-kill-01.webm'
 * ```
 */
export interface NarratorClip {
  readonly file: string
  /** O que a fala diz. Serve para depurar e para legenda, se ela existir um dia. */
  readonly text: string
}

export interface NarratorManifest {
  readonly locale: string
  readonly clips: ReadonlyMap<string, readonly NarratorClip[]>
}

export function parseNarratorManifest(raw: unknown): NarratorManifest {
  const record = asRecord(raw, 'manifesto')
  const locale = record.locale
  if (typeof locale !== 'string') {
    throw new RangeError(`manifesto.locale recebeu ${String(locale)}; esperado string`)
  }
  const clips = asRecord(record.clips, 'manifesto.clips')
  return {
    locale,
    clips: new Map(Object.entries(clips).map(([slug, takes]) => [slug, parseTakes(slug, takes)])),
  }
}

function asRecord(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new RangeError(`${what} recebeu ${String(raw)}; esperado objeto`)
  }
  return raw as Record<string, unknown>
}

function parseTakes(slug: string, raw: unknown): readonly NarratorClip[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RangeError(`manifesto.clips.${slug} recebeu ${String(raw)}; esperado lista não vazia`)
  }
  return raw.map((take) => parseTake(slug, take))
}

function parseTake(slug: string, raw: unknown): NarratorClip {
  const record = asRecord(raw, `manifesto.clips.${slug}[]`)
  const { file, text } = record
  if (typeof file !== 'string' || file.length === 0) {
    throw new RangeError(`manifesto.clips.${slug}[].file recebeu ${String(file)}; esperado string`)
  }
  return { file, text: typeof text === 'string' ? text : '' }
}

/**
 * Um take do slug, sorteado. `unit` é o número de 0 a 1 do gerador — injetado,
 * e não `Math.random` aqui dentro, para o teste ser repetível (F.I.R.S.T).
 *
 * Slug sem fala devolve `undefined` em vez de lançar: narrador mudo numa
 * medalha é falha aceitável, e a tranca contra slug faltando é o
 * `medalCatalog.test.ts`, que roda antes de qualquer navegador abrir.
 */
export function pickTake(
  manifest: NarratorManifest,
  slug: string,
  unit: number,
): NarratorClip | undefined {
  const takes = manifest.clips.get(slug)
  if (!takes || takes.length === 0) return undefined
  const index = Math.min(takes.length - 1, Math.max(0, Math.floor(unit * takes.length)))
  return takes[index]
}

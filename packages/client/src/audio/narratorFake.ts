import type { Narrator } from './narrator.ts'
import { createNarratorCaptions } from './narratorCaptions.ts'

/**
 * Narrador de teste: anota o que pediram para ele dizer, e só tem fala para
 * os slugs que o teste der — o resto cai no texto do hud, como uma voz que a
 * bancada ainda não gravou.
 *
 * ```ts
 * const narrator = new FakeNarrator(['lead-taken'])
 * narrator.has('lead-lost') // false
 * ```
 */
export class FakeNarrator implements Narrator {
  voice: string | undefined
  readonly said: string[] = []
  readonly captions = createNarratorCaptions()
  private readonly recorded: ReadonlySet<string>

  constructor(recorded: readonly string[] = []) {
    this.recorded = new Set(recorded)
  }

  setVoice(voice: string): void {
    this.voice = voice
  }

  say(slug: string): void {
    this.said.push(slug)
  }

  has(slug: string): boolean {
    return this.recorded.has(slug)
  }
}

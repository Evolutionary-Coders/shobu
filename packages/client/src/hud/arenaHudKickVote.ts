import type { KickVotePrompt } from './kickVotePrompt.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * A faixa do voto de expulsão no dom (ADR 0034): o título, o relógio, as
 * contagens e o modo, que o css lê para mostrar a dica das teclas ou o voto
 * registrado. Os cliques são do renderer (`driveKickVote.ts`), que fala com a sala.
 */
export interface KickVotePanel {
  set(prompt: KickVotePrompt | null): void
}

/**
 * Monta a faixa (`#hud-kick-vote`) dentro do hud uma vez, e escreve só o
 * texto. Montada aqui, e não no `index.html`, que está no teto de linhas.
 *
 * ```ts
 * const kickVote = createKickVotePanel(document)
 * kickVote.set(kickVotePromptOf(network.kickVote()))
 * ```
 */
export function createKickVotePanel(root: ElementQuery): KickVotePanel {
  const panel = mountPanel(requireElement<HTMLElement>(root, '#arena-hud'))
  const title = appendLine(panel, 'kick-vote-title')
  const status = appendLine(panel, 'kick-vote-line')
  appendLine(panel, 'kick-vote-keys', '[F1] SIM · [F2] NÃO')
  appendLine(panel, 'kick-vote-voted', 'VOTO REGISTRADO')
  return {
    set: (prompt) => {
      panel.hidden = prompt === null
      if (prompt === null) return
      panel.dataset.mode = prompt.mode
      title.textContent = prompt.title
      status.textContent = `${prompt.countdown} · ${prompt.tally}`
    },
  }
}

function mountPanel(hud: HTMLElement): HTMLElement {
  const panel = hud.ownerDocument.createElement('div')
  panel.id = 'hud-kick-vote'
  panel.setAttribute('role', 'status')
  panel.hidden = true
  hud.append(panel)
  return panel
}

function appendLine(panel: HTMLElement, className: string, text = ''): HTMLElement {
  const line = panel.ownerDocument.createElement('p')
  line.className = className
  line.textContent = text
  panel.append(line)
  return line
}

/**
 * O formulário de avaliação da Feira de Jogos (19/11): um só para todos os
 * jogos, e o nome do jogo vai na URL para vir preenchido no campo
 * `entry.52413313`. A nota que os jogadores dão ali compõe a nota da
 * disciplina, então a tela final e o menu mostram o QR desta URL
 * (`scripts/build-feedback-qr.mjs`).
 */
const FEEDBACK_FORM_BASE =
  'https://docs.google.com/forms/d/e/1FAIpQLSeeleFRJ3PbTeX9nmxFtfqF_3VMD6bBGixNGFODEtqjbHGK9A/viewform'

/** O campo do formulário que recebe o nome do jogo. */
const GAME_NAME_FIELD = 'entry.52413313'

/**
 * O nome com que o jogo se inscreve no formulário, com o "ō" do título. A
 * média é por nome: mudar a grafia aqui divide as notas em dois jogos.
 */
export const GAME_NAME_ON_FORM = 'Shōbu'

/**
 * A URL do formulário com o nome do jogo já preenchido.
 *
 * ```ts
 * feedbackFormUrl('Ouroboros') // '…/viewform?entry.52413313=Ouroboros'
 * ```
 */
export function feedbackFormUrl(gameName: string): string {
  if (gameName.trim() === '') {
    throw new Error(`o nome do jogo veio vazio (${JSON.stringify(gameName)}); esperado um nome`)
  }
  return `${FEEDBACK_FORM_BASE}?${GAME_NAME_FIELD}=${encodeURIComponent(gameName)}`
}

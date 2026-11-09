/**
 * O retorno da ENTRAR enquanto a arena não está no controle: sem ele, a tela
 * seguia igual ao menu até a arena entrar, e numa entrada de 17 s o jogador
 * apertava de novo achando que não tinha pegado.
 */
export const ENTERING_NOTICE = 'CONECTANDO…'

/**
 * Mostra `ENTERING_NOTICE` enquanto a arena entra, e o apaga se a entrada
 * falhar ou for cancelada (`entering` resolve `false`): o controle que chega
 * apaga o aviso por outro caminho (`driveMenu`), mas a entrada que não chega
 * não traz controle nenhum, e o CONECTANDO… ficava na tela para sempre. Sem
 * `entering`, a página recarrega, e o aviso fica até ela sair.
 *
 * ```ts
 * void noticeWhileEntering((notice) => menu.setNotice(notice), enterOrReload(...))
 * ```
 */
export async function noticeWhileEntering(
  setNotice: (notice: string | null) => void,
  entering: Promise<boolean> | undefined,
): Promise<void> {
  setNotice(ENTERING_NOTICE)
  if (entering && !(await entering)) setNotice(null)
}

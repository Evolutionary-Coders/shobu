/**
 * O jogo roda em tela cheia: toda interação com a página pede tela cheia se
 * ela não estiver. No celular é o que tira a barra do chrome de cima da arena;
 * no desktop, o que tira as abas de cima do hud.
 *
 * O navegador só concede tela cheia dentro de um gesto — clique, toque ou
 * tecla — e **nunca** num botão de gamepad. Quem chega só de controle entra na
 * tela cheia no primeiro toque na tela.
 *
 * Ouve na `window`, na fase de bolha, de propósito: é o último a ouvir o gesto.
 * O chrome gasta o gesto ao conceder tela cheia, e o ENTRAR do menu ainda
 * precisa dele para travar o ponteiro — pedido antes, aqui, a trava seria
 * recusada.
 *
 * Esc é o gesto de **sair** da tela cheia, e pedir de volta no mesmo aperto
 * seria brigar com o jogador.
 *
 * ```ts
 * keepFullscreenOnGesture(window)
 * ```
 */
export function keepFullscreenOnGesture(view: Window): void {
  const { document } = view
  const request = (): void => {
    if (document.fullscreenElement || !document.fullscreenEnabled) return
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.warn(JSON.stringify({ event: 'fullscreen-refused', message }))
    })
  }
  view.addEventListener('click', request)
  view.addEventListener('touchend', request)
  view.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') request()
  })
}

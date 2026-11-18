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
 * No celular, a tela cheia também trava a paisagem.
 *
 * Esc é o gesto de **sair** da tela cheia, e pedir de volta no mesmo aperto
 * seria brigar com o jogador. Mas só no menu: na partida o ESC volta ao menu e
 * a tela cheia fica (`keepEscapeInFullscreen`).
 *
 * ```ts
 * keepFullscreenOnGesture(window)
 * ```
 */
export function keepFullscreenOnGesture(view: Window): void {
  const { document } = view
  const request = (): void => {
    if (document.fullscreenElement || !document.fullscreenEnabled) return
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(
        () => lockLandscapeOnPhone(view).catch(warn('landscape-lock-refused')),
        warn('fullscreen-refused'),
      )
  }
  view.addEventListener('click', request)
  view.addEventListener('touchend', request)
  view.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') request()
  })
  keepEscapeInFullscreen(view)
}

/** A Keyboard Lock API (Chrome e Edge); os tipos do dom ainda não a trazem. */
interface KeyboardLock {
  lock(codes: readonly string[]): Promise<void>
  unlock(): void
}

/**
 * Em tela cheia, o ESC é do jogo, e não do navegador. Sem isso, o mesmo aperto
 * que volta da partida ao menu também tirava a tela cheia. Com o ESC travado
 * (`navigator.keyboard.lock`), o aperto chega à página: na partida ele só
 * solta o ponteiro e o jogador cai no menu, e no menu a tela cheia sai pelo
 * ESC na raiz (`leaveFullscreen`). Segurar o ESC por dois segundos ainda sai,
 * porque o navegador garante essa saída.
 *
 * Firefox e Safari não têm a trava: neles o ESC segue saindo da tela cheia.
 *
 * ```ts
 * keepEscapeInFullscreen(window) // já feito por keepFullscreenOnGesture
 * ```
 */
function keepEscapeInFullscreen(view: Window): void {
  const { document } = view
  const keyboard = (view.navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
  if (!keyboard) return
  // a trava só vale em tela cheia pedida pela página, e cai com ela.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) keyboard.lock(['Escape']).catch(warn('escape-lock-refused'))
    else keyboard.unlock()
  })
  // com a trava, o navegador não solta mais o ponteiro no ESC: quem solta é o jogo.
  view.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && document.pointerLockElement) document.exitPointerLock()
  })
}

/**
 * Sai da tela cheia, se estiver nela: o ESC na raiz do menu.
 *
 * ```ts
 * leaveFullscreen(document)
 * ```
 */
export function leaveFullscreen(document: Document): void {
  if (document.fullscreenElement) document.exitFullscreen().catch(warn('fullscreen-exit-refused'))
}

/**
 * No celular o fps só cabe deitado, e o android só trava a orientação **em
 * tela cheia** — por isso a trava vem depois dela. Ponteiro grosso é o dedo:
 * no desktop com tela de toque nada se trava, porque monitor não gira.
 */
function lockLandscapeOnPhone(view: Window): Promise<void> {
  if (!view.matchMedia('(pointer: coarse)').matches) return Promise.resolve()
  const orientation = view.screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>
  }
  return orientation.lock?.('landscape') ?? Promise.resolve()
}

function warn(event: string): (reason: unknown) => void {
  return (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.warn(JSON.stringify({ event, message }))
  }
}

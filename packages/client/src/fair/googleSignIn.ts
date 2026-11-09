/**
 * O Google Sign-In (Google Identity Services) atrás de uma interface do
 * projeto (ADR 0036): o script do Google só é baixado aqui, e o resto do
 * cliente só vê o token. Os tipos do `google.accounts.id` que usamos estão
 * declarados à mão: são três chamadas, e uma dependência de tipos a mais não
 * se paga.
 */
export interface GoogleSignIn {
  /** Desenha o botão "Fazer login com o Google" em `parent`. */
  renderButton(parent: HTMLElement): void
  /** Pede um token novo pelo One Tap; com `auto_select`, quem já entrou nem clica. */
  refresh(): void
  /** Cada token que o Google entrega, no login e em cada renovação. */
  onCredential(listener: (credential: string) => void): void
}

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

interface GsiId {
  initialize(options: {
    client_id: string
    callback: (response: { credential?: string }) => void
    auto_select: boolean
    cancel_on_tap_outside: boolean
  }): void
  renderButton(parent: HTMLElement, options: Record<string, string>): void
  prompt(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GsiId } }
  }
}

/**
 * Baixa o script do Google e o inicia com `clientId`. O que for pedido antes
 * de ele carregar fica na fila; se ele não carregar (rede da feira, bloqueador),
 * o jogo segue sem login, e a falha vai ao console.
 *
 * ```ts
 * const signIn = loadGoogleSignIn(document, FAIR_GOOGLE_CLIENT_ID)
 * signIn.onCredential((token) => relay.chooseCredential(token))
 * ```
 */
export function loadGoogleSignIn(doc: Document, clientId: string): GoogleSignIn {
  const listeners: ((credential: string) => void)[] = []
  const queued: ((id: GsiId) => void)[] = []
  let ready: GsiId | undefined
  const run = (step: (id: GsiId) => void) => (ready ? step(ready) : queued.push(step))
  appendGsiScript(doc, () => {
    const id = doc.defaultView?.google?.accounts.id
    if (!id) return
    initializeGsi(id, clientId, (credential) => {
      for (const listener of listeners) listener(credential)
    })
    ready = id
    for (const step of queued.splice(0)) step(id)
  })
  return {
    renderButton: (parent) =>
      run((id) =>
        id.renderButton(parent, { theme: 'filled_black', size: 'medium', shape: 'pill' }),
      ),
    refresh: () => run((id) => id.prompt()),
    onCredential: (listener) => {
      listeners.push(listener)
    },
  }
}

/** O script do Google, assíncrono; a falha de carga só vai ao log. */
function appendGsiScript(doc: Document, onLoad: () => void): void {
  const script = doc.createElement('script')
  script.src = GSI_SCRIPT_URL
  script.async = true
  script.addEventListener('load', onLoad)
  script.addEventListener('error', () => {
    console.log(JSON.stringify({ event: 'fair.signin-unavailable', url: GSI_SCRIPT_URL }))
  })
  doc.head.append(script)
}

function initializeGsi(id: GsiId, clientId: string, deliver: (credential: string) => void): void {
  id.initialize({
    client_id: clientId,
    callback: ({ credential }) => {
      if (credential) deliver(credential)
    },
    auto_select: true,
    cancel_on_tap_outside: true,
  })
}

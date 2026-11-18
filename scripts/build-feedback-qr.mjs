#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { feedbackFormUrl, GAME_NAME_ON_FORM } from '../packages/client/src/feedback/feedbackForm.ts'

/**
 * Desenha o QR do formulário de avaliação da feira em
 * `public/assets/images/feedback-qr.svg`:
 *
 *   npm run build:feedback-qr
 *
 * **Por que no build e não no navegador.** A URL é fixa: um svg estático não
 * põe biblioteca de QR no bundle nem código de dom sem teste no cliente, e
 * funciona sem rede — o jogo na feira não depende de serviço de QR de fora.
 *
 * Módulo escuro sobre fundo claro: o QR invertido (claro sobre escuro, que
 * combinaria com o hud) não é lido por todo leitor de celular. A correção de
 * erro baixa e a margem de dois módulos deixam o QR com 45 módulos, que o css
 * desenha a 4 px cada: na tela não há dano a corrigir, e módulo grande é o que
 * o celular lê de longe. Mudou a URL, o número de módulos pode mudar junto, e
 * o tamanho em `arenaMatchEnd.css` também.
 */
const TARGET = new URL('../packages/client/public/assets/images/feedback-qr.svg', import.meta.url)

const url = feedbackFormUrl(GAME_NAME_ON_FORM)
const svg = await QRCode.toString(url, {
  type: 'svg',
  errorCorrectionLevel: 'L',
  margin: 2,
  color: { dark: '#07080bff', light: '#f2f2eeff' },
})
// o título é o texto alternativo do svg aberto sozinho; o lint o exige.
const titled = svg.replace(
  /^<svg([^>]*)>/,
  '<svg$1><title>Formulário de avaliação do shōbu</title>',
)
mkdirSync(new URL('.', TARGET).pathname, { recursive: true })
writeFileSync(TARGET, titled)
console.log(JSON.stringify({ target: TARGET.pathname, url, bytes: titled.length }))

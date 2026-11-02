import { profileNameLabel } from '@shobu/core'
import type { NetworkPort } from '../net/networkPort.ts'

/**
 * Manda à sala o nome do perfil guardado, já como a arena o mostra (ou
 * AGENTE). Vale no boot e a cada nome novo no menu, e não só na entrada na
 * arena: quem seguiu um link e esperava no menu, ou voltava da recarga no
 * mapa novo antes do CLIQUE PARA ENTRAR, aparecia como AGENTE para os outros.
 * A porta guarda o nome e o reenvia a cada sala que chega (`attachLink`).
 *
 * ```ts
 * announceMenuCallsign(room.network, choices.profileName.read())
 * ```
 */
export function announceMenuCallsign(
  port: Pick<NetworkPort, 'chooseCallsign'>,
  profileName: string,
): void {
  port.chooseCallsign(profileNameLabel(profileName))
}

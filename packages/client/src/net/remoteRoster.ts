/**
 * Quem entrou e quem saiu entre dois quadros. O renderer visita os jogadores
 * remotos a cada quadro; o que for novo ganha avatar, e quem não apareceu no
 * quadro saiu da sala e perde o dele.
 */
export interface RemoteRoster {
  beginFrame(): void
  /** `true` na primeira vez que o jogador aparece. */
  visit(playerId: string): boolean
  /** Quem estava no quadro anterior e não foi visitado neste. */
  endFrame(): readonly string[]
}

/**
 * ```ts
 * roster.beginFrame()
 * network.forEachRemote(now, (id) => { if (roster.visit(id)) spawnAvatar(id) })
 * for (const id of roster.endFrame()) removeAvatar(id)
 * ```
 */
export function createRemoteRoster(): RemoteRoster {
  const present = new Set<string>()
  const visited = new Set<string>()
  const gone: string[] = []
  return {
    beginFrame: () => visited.clear(),
    visit: (playerId) => {
      visited.add(playerId)
      if (present.has(playerId)) return false
      present.add(playerId)
      return true
    },
    endFrame: () => {
      gone.length = 0
      for (const playerId of present) {
        if (!visited.has(playerId)) gone.push(playerId)
      }
      for (const playerId of gone) present.delete(playerId)
      return gone
    },
  }
}

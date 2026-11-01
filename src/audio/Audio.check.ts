import { ProceduralMusicEngine } from './ProceduralMusicEngine'

export async function runAudioChecks(): Promise<string> {
  const context = new AudioContext()
  const engine = new ProceduralMusicEngine(context, context.destination)
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  try {
    engine.setTrack('menu')
    check(engine.track === 'menu' && engine.activeTrackCount === 1, 'Menu track starts its ambient loop')
    engine.setTrack('combat')
    check(engine.track === 'combat' && engine.activeTrackCount === 2, 'Track changes overlap buses for crossfade')
    engine.setEnabled(false)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1550))
    check(engine.activeTrackCount === 0, 'Muted music stops both loop buses after fade')
    engine.setEnabled(true)
    check(engine.track === 'combat' && engine.activeTrackCount === 1, 'Unmuting resumes the selected track')
    engine.dispose()
    check(engine.activeTrackCount === 0, 'Dispose stops all music loops')
    return `${checks} audio engine checks passed`
  } finally {
    engine.dispose()
    if (context.state !== 'closed') await context.close()
  }
}

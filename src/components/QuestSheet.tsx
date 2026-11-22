import type { Campaign, Quest } from '../types'
import { TOKENS, tokenByKind } from '../data'
import { MapSvg } from './MapSvg'
import { useTileLibrary } from '../tiles'
import { questTarget, releaseById, targetLabel } from '../releases'
import { EnemyFace, RankSeal } from './EnemyRoster'

function Para({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  )
}

export function QuestSheet({ quest, campaign, index }: { quest: Quest; campaign: Campaign; index: number }) {
  const { byId, enemyById, ui } = useTileLibrary()
  const tilesUsed = [...new Set(quest.map.tiles.map((t) => byId[t.tileId]?.name ?? 'Missing tile'))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const target = questTarget(campaign, quest)
  // releases actually needed, from the tiles on the map
  const needed = [...new Set(quest.map.tiles.map((t) => byId[t.tileId]?.release).filter(Boolean) as string[])]
  const extra = needed.filter((r) => r !== target.release && !target.expansions.includes(r))
  const questName = (id: string) => campaign.quests.find((q) => q.id === id)?.title
  const usedKinds = TOKENS.filter((t) => t.kind !== 'label' && quest.map.tokens.some((tk) => tk.kind === t.kind))
  const objectives = quest.objectives.filter((o) => o.trim())
  const hasMap = quest.map.cells.some((c) => c !== 'void') || quest.map.tokens.length > 0 || quest.map.tiles.length > 0
  return (
    <article className="quest-sheet">
      <header>
        <div className="eyebrow">
          {campaign.name} · Quest {index + 1}
        </div>
        <h1>{quest.title || 'Untitled quest'}</h1>
        <div className="meta">
          <span>Difficulty: {quest.difficulty}</span>
          {quest.players && <span>Heroes: {quest.players}</span>}
        </div>
        <div className="meta requires">
          Requires: {targetLabel(target)}
          {extra.length > 0 && ` + ${extra.map((r) => releaseById[r]?.name ?? r).join(' + ')}`}
        </div>
      </header>

      {quest.intro.trim() && (
        <section className="intro">
          <Para text={quest.intro} />
        </section>
      )}

      {objectives.length > 0 && (
        <section>
          <h2>Objectives</h2>
          <ul>{objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </section>
      )}

      {hasMap && (
        <section className="sheet-map">
          <MapSvg map={quest.map} idPrefix={`p-${quest.id.slice(0, 6)}`} showGrid={quest.map.tiles.length === 0} showLabels showTileNames className="sheet-map-svg" />
          {usedKinds.length > 0 && (
            <div className="legend">
              {usedKinds.map((t) => (
                <span key={t.kind}>
                  <i style={{ background: t.kind === 'event' ? '#f3e7cc' : t.color, color: t.kind === 'event' ? '#111' : '#fff' }}>{t.glyph}</i>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {(quest.setup.trim() || tilesUsed.length > 0) && (
        <section>
          <h2>Setup</h2>
          {tilesUsed.length > 0 && (
            <p><b>Tiles:</b> {tilesUsed.join(', ')}</p>
          )}
          <Para text={quest.setup} />
        </section>
      )}

      {(quest.enemies?.length ?? 0) > 0 && (
        <section>
          <h2>{ui.enemies && <img src={ui.enemies} alt="" className="h-ico" />}Enemies</h2>
          <ul className="sheet-enemies">
            {quest.enemies!.map((x) => (
              <li key={x.id}>
                <EnemyFace e={enemyById[x.enemy]} rank={x.rank} size={36} />
                <RankSeal rank={x.rank} size={20} />
                <b>{x.name}</b> ×{x.count}
                {x.note && <span className="muted"> · {x.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {quest.specialRules.trim() && (
        <section>
          <h2>Special Rules</h2>
          <Para text={quest.specialRules} />
        </section>
      )}

      {quest.events.length > 0 && (
        <section>
          <h2>Events</h2>
          <ol className="events">
            {quest.events.map((ev) => (
              <li key={ev.id}>
                {ev.trigger && <b>{ev.trigger}: </b>}
                {ev.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      {quest.map.tokens.some((t) => t.note || (t.label && t.kind !== 'label' && t.kind !== 'event')) && (
        <section>
          <h2>Map Key</h2>
          <ul className="map-key">
            {quest.map.tokens
              .filter((t) => t.note || (t.label && t.kind !== 'label' && t.kind !== 'event'))
              .map((t) => (
                <li key={t.id}>
                  <b>{tokenByKind[t.kind].name}</b>
                  {t.label && ` ${t.kind === 'event' ? '#' : '— '}${t.label}`} ({String.fromCharCode(65 + (t.x % 26))}
                  {t.y + 1}){t.note && `: ${t.note}`}
                </li>
              ))}
          </ul>
        </section>
      )}

      {quest.rewards.trim() && (
        <section>
          <h2>Rewards</h2>
          <Para text={quest.rewards} />
        </section>
      )}

      {(quest.success.trim() || quest.failure.trim()) && (
        <section className="outcomes">
          {quest.success.trim() && (
            <div>
              <h2>Victory</h2>
              <Para text={quest.success} />
              {questName(quest.nextOnSuccess) && <p className="next">→ Continue to <b>{questName(quest.nextOnSuccess)}</b></p>}
            </div>
          )}
          {quest.failure.trim() && (
            <div>
              <h2>Defeat</h2>
              <Para text={quest.failure} />
              {questName(quest.nextOnFailure) && <p className="next">→ Continue to <b>{questName(quest.nextOnFailure)}</b></p>}
            </div>
          )}
        </section>
      )}
    </article>
  )
}

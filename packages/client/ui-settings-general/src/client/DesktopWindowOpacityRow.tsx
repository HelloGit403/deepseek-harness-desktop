import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import css from './DesktopWindowOpacityRow.module.css'

/** Desktop window operations injected by the preload adapter. */
export interface DesktopWindowOpacityRowInjected {
  /** Read the saved whole-window opacity. */
  getOpacity: () => Promise<number>
  /** Apply and persist a whole-window opacity. */
  setOpacity: (opacity: number) => Promise<number>
}

/** Complete props for the desktop-only General settings row. */
export type DesktopWindowOpacityRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & InjectFace<DesktopWindowOpacityRowInjected>

const MIN_PERCENT = 60
const MAX_PERCENT = 100

/** Render the whole-window transparency control. */
export function DesktopWindowOpacityRow(props: DesktopWindowOpacityRowProps): ReactNode {
  const [percent, setPercent] = useState(MAX_PERCENT)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void props.getOpacity().then((opacity) => {
      if (!active) return
      setPercent(Math.round(opacity * 100))
      setReady(true)
    }).catch(() => {
      if (!active) return
      setReady(true)
      setFailed(true)
    })
    return () => { active = false }
  }, [props.getOpacity])

  const apply = (next: number): void => {
    setPercent(next)
    setFailed(false)
    void props.setOpacity(next / 100).catch(() => { setFailed(true) })
  }
  return (
    <div className={css.group}>
      <div className={css.heading}>
        <div>
          <div className={css.title}>{props.t('windowOpacity.title')}</div>
          <p>{props.t('windowOpacity.description')}</p>
        </div>
        <span className={css.value}>{percent}%</span>
      </div>
      <div className={css.controls}>
        <input
          className={css.slider}
          type="range"
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={1}
          value={percent}
          disabled={!ready}
          aria-label={props.t('windowOpacity.range')}
          onChange={(event) => { apply(Number(event.currentTarget.value)) }}
        />
        <button type="button" disabled={!ready || percent === MAX_PERCENT} onClick={() => { apply(MAX_PERCENT) }}>
          {props.t('windowOpacity.reset')}
        </button>
      </div>
      <div className={css.scale} aria-hidden="true">
        <span>{MIN_PERCENT}%</span>
        <span>{MAX_PERCENT}%</span>
      </div>
      {failed ? <p className={css.error} role="alert">{props.t('windowOpacity.error')}</p> : null}
    </div>
  )
}

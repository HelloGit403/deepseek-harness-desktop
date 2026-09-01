import {
  Button,
  IconCheckOutline16,
  IconDownloadOutline16,
  IconRefreshOutline16,
  IconWarningOutline16,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SettingsKey } from './locales.ts'
import type { DesktopUpdateController, DesktopUpdateState } from './desktop-update-store.ts'
import css from './DesktopUpdateSection.module.css'

/** Registration-side desktop update actions and observable state. */
export interface DesktopUpdateSectionInjected {
  hooks: {
    /** Main-process update state bound by the renderer. */
    desktopUpdate: DesktopUpdateController
  }
  check: () => Promise<DesktopUpdateState>
  download: () => Promise<void>
  install: () => Promise<void>
}

/** Full component props assembled by the Settings slot renderer. */
export type DesktopUpdateSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings'>
  & InjectFace<DesktopUpdateSectionInjected>

const STATUS_KEYS = {
  starting: 'update.status.starting',
  unconfigured: 'update.status.unconfigured',
  idle: 'update.status.idle',
  checking: 'update.status.checking',
  current: 'update.status.current',
  available: 'update.status.available',
  downloading: 'update.status.downloading',
  downloaded: 'update.status.downloaded',
  error: 'update.status.error',
} satisfies Record<DesktopUpdateState['status'], SettingsKey>

function bytes(value: number): string {
  if (value <= 0) return '0 MB'
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function action(state: DesktopUpdateState, props: DesktopUpdateSectionProps, onCheck: () => void): ReactNode {
  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'starting'
  if (state.status === 'available') {
    return (
      <button className={css.primaryAction} type="button" onClick={() => { void props.download() }}>
        <IconDownloadOutline16 />{props.t('update.download')}
      </button>
    )
  }
  if (state.status === 'downloaded') {
    return (
      <button className={css.primaryAction} type="button" onClick={() => { void props.install() }}>
        <IconRefreshOutline16 />{props.t('update.install')}
      </button>
    )
  }
  return (
    <button
      className={css.secondaryAction}
      type="button"
      disabled={busy}
      onClick={onCheck}
    >
      <IconRefreshOutline16 />
      {state.status === 'checking' ? props.t('update.checking') : props.t('update.check')}
    </button>
  )
}

/** Render the desktop-only update center. */
export function DesktopUpdateSection(props: DesktopUpdateSectionProps): ReactNode {
  const state = props.useDesktopUpdate(value => value)
  const [notice, setNotice] = useState<DesktopUpdateState | null>(null)
  const available = state.availableVersion ?? '—'
  const failure = state.failure === 'download-failed'
    ? props.t('update.error.download')
    : props.t('update.error.check')
  const check = async (): Promise<void> => {
    setNotice(null)
    setNotice(await props.check())
  }
  const noticeKind = notice?.status === 'available'
    ? 'available'
    : notice?.status === 'error'
      ? 'error'
      : notice?.status === 'unconfigured' ? 'unconfigured' : 'current'
  const noticeVersion = noticeKind === 'available'
    ? notice?.availableVersion ?? '—'
    : notice?.currentVersion ?? state.currentVersion
  const noticeTitle = props.t(`update.dialog.${noticeKind}.title`)
  const noticeDescription = props.t(`update.dialog.${noticeKind}.description`, { version: noticeVersion })
  const closeNotice = (): void => { setNotice(null) }
  return (
    <>
      <section className={css.section} aria-busy={state.status === 'checking' || state.status === 'downloading'}>
        <div className={css.hero}>
          <span className={css.orbit} aria-hidden="true"><span /></span>
          <div className={css.heroCopy}>
            <span className={css.eyebrow}>{props.t('update.eyebrow')}</span>
            <h2>{props.t('update.title')}</h2>
            <p>{props.t('update.description')}</p>
          </div>
          <span className={css.version}>{state.currentVersion === '' ? '—' : `v${state.currentVersion}`}</span>
        </div>

        <div className={css.statusCard} data-status={state.status}>
          <div className={css.statusHead}>
            <span className={css.statusIcon} aria-hidden="true">
              {state.status === 'error'
                ? <IconWarningOutline16 />
                : state.status === 'current' ? <IconCheckOutline16 /> : <IconRefreshOutline16 />}
            </span>
            <div>
              <strong>{props.t(STATUS_KEYS[state.status], { version: available })}</strong>
              <small>{state.status === 'unconfigured' ? props.t('update.channelHelp') : props.t('update.autoCheck')}</small>
            </div>
            <div className={css.action}>{action(state, props, () => { void check() })}</div>
          </div>

          {state.status === 'downloading' ? (
            <div className={css.progressBlock}>
              <div className={css.progressMeta}>
                <span>{props.t('update.progress')}</span>
                <strong>{Math.round(state.progress.percent)}%</strong>
              </div>
              <div className={css.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress.percent)}>
                <span style={{ width: `${state.progress.percent}%` }} />
              </div>
              <small>{bytes(state.progress.transferred)} / {bytes(state.progress.total)}</small>
            </div>
          ) : null}

          {state.status === 'error' ? <p className={css.error} role="alert">{failure}</p> : null}
          {state.releaseNotes !== '' && ['available', 'downloaded'].includes(state.status) ? (
            <div className={css.notes}>
              <strong>{state.releaseName ?? props.t('update.notes')}</strong>
              <p>{state.releaseNotes}</p>
            </div>
          ) : null}
        </div>

        <div className={css.safety}>
          <IconCheckOutline16 aria-hidden="true" />
          <div>
            <strong>{props.t('update.dataSafe')}</strong>
            <p>{props.t('update.dataSafeDescription')}</p>
          </div>
        </div>
      </section>
      <Modal
        open={notice !== null}
        onClose={closeNotice}
        closeLabel={props.t('close')}
        title={noticeTitle}
        description={noticeDescription}
        className={css.resultDialog ?? ''}
        footer={(
          <>
            {noticeKind === 'available' || noticeKind === 'error' ? (
              <Button variant="outline" onClick={closeNotice}>{props.t('update.dialog.later')}</Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => {
                if (noticeKind === 'available') {
                  closeNotice()
                  void props.download()
                }
                else if (noticeKind === 'error') void check()
                else closeNotice()
              }}
            >
              {noticeKind === 'available'
                ? props.t('update.dialog.download')
                : noticeKind === 'error' ? props.t('update.dialog.retry') : props.t('update.dialog.close')}
            </Button>
          </>
        )}
      >
        <div className={css.resultVisual} data-kind={noticeKind}>
          <span className={css.resultHalo} aria-hidden="true">
            {noticeKind === 'available'
              ? <IconDownloadOutline16 />
              : noticeKind === 'error' ? <IconWarningOutline16 /> : <IconCheckOutline16 />}
          </span>
          <div>
            <span>{props.t('update.dialog.signal')}</span>
            <strong>v{noticeVersion}</strong>
          </div>
        </div>
      </Modal>
    </>
  )
}

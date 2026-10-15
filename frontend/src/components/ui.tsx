import type { ReactNode } from 'react'
import type { Notice } from '../types'

export function Severity({ value }: { value: string }) {
  return (
    <span className={`sev sev-${value}`}>
      <i aria-hidden="true" />
      {value}
    </span>
  )
}

export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value}</span>
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Flash({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null
  return (
    <div className={`flash flash-${notice.kind}`} role="status">
      <span>{notice.text}</span>
      <button type="button" className="link-btn" onClick={onDismiss}>Dismiss</button>
    </div>
  )
}

export function PageHead(props: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{props.title}</h1>
        {props.lede && <p className="lede">{props.lede}</p>}
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </header>
  )
}

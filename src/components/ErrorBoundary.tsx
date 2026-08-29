import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../monitoring'
import { BrandMark } from './BrandMark'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { area: `react:${info.componentStack?.slice(0, 60) ?? 'render'}` })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-screen">
        <BrandMark title="Lumen Stage" />
        <span>STUDIO INTERRUPTED</span>
        <h1>The studio could not finish loading.</h1>
        <p>Your locally saved project has not been removed. Reload the studio, or return to the site while we keep the technical error report anonymous.</p>
        <div>
          <button onClick={() => location.reload()}>Reload studio</button>
          <a href="/">Return home</a>
        </div>
      </main>
    )
  }
}

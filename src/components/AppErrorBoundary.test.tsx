import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenPage(): never {
  throw new Error('测试页面崩溃')
}

describe('application error boundary', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))

  it('shows a recoverable error page instead of leaving the root blank', () => {
    render(<AppErrorBoundary><BrokenPage /></AppErrorBoundary>)
    expect(screen.getByRole('heading', { name: '页面没有成功加载' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重新加载最新版本/ })).toBeInTheDocument()
    expect(screen.getByText('测试页面崩溃')).toBeInTheDocument()
  })
})

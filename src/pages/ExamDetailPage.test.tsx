import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Profile } from '../types/domain'
import { AuditDrawer } from './ExamDetailPage'

function DrawerHarness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>查看活动</button>
      <AuditDrawer
        open={open}
        onClose={() => setOpen(false)}
        events={[]}
        profileMap={new Map<string, Profile>()}
        returnFocusRef={triggerRef}
      />
    </>
  )
}

describe('ExamDetailPage activity drawer', () => {
  it('acts as a modal, traps focus, closes with Escape and restores focus', async () => {
    const user = userEvent.setup()
    render(<DrawerHarness />)
    const trigger = screen.getByRole('button', { name: '查看活动' })

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '活动记录' })
    const close = screen.getByRole('button', { name: '关闭活动记录' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(close).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { useEditMode } from '@/composables/useEditMode'

describe('useEditMode', () => {
  afterEach(() => {
    useEditMode().exit()
  })

  it('starts as false', () => {
    const { editMode } = useEditMode()
    expect(editMode.value).toBe(false)
  })

  it('toggle sets editMode to true', () => {
    const { editMode, toggle } = useEditMode()
    toggle()
    expect(editMode.value).toBe(true)
  })

  it('toggle twice returns to false', () => {
    const { editMode, toggle } = useEditMode()
    toggle()
    toggle()
    expect(editMode.value).toBe(false)
  })

  it('exit sets editMode to false', () => {
    const { editMode, toggle, exit } = useEditMode()
    toggle()
    expect(editMode.value).toBe(true)
    exit()
    expect(editMode.value).toBe(false)
  })

  it('multiple calls to useEditMode share the same ref', () => {
    const a = useEditMode()
    const b = useEditMode()
    a.toggle()
    expect(b.editMode.value).toBe(true)
  })
})

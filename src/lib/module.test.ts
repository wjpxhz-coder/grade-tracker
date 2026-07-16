import { describe, expect, it } from 'vitest'
import { unwrapDefaultExport } from './module'

describe('module interop', () => {
  it('unwraps nested CommonJS default exports into the React component', () => {
    function ChartComponent() { return null }
    expect(unwrapDefaultExport<typeof ChartComponent>({ default: { default: ChartComponent } })).toBe(ChartComponent)
    expect(unwrapDefaultExport<typeof ChartComponent>(ChartComponent)).toBe(ChartComponent)
  })

  it('does not loop on self-referencing module objects', () => {
    const moduleObject: { default?: unknown } = {}
    moduleObject.default = moduleObject
    expect(unwrapDefaultExport(moduleObject)).toBe(moduleObject)
  })
})

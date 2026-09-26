import { describe, it, expect } from 'vitest'
import {
  documentContentToSearchText,
  diffHtmlDocuments,
  parseHtmlToExportBlocks,
  sanitizePdfText
} from '../shared/lib/document-html'

describe('parseHtmlToExportBlocks', () => {
  it('parses headings, paragraphs, and bullets', () => {
    const html = `
      <h2>Section</h2>
      <p>Intro paragraph.</p>
      <ul>
        <li><p>First item</p></li>
        <li><p>Second item</p></li>
      </ul>
    `
    const blocks = parseHtmlToExportBlocks(html)
    expect(blocks.some((b) => b.type === 'heading' && b.text === 'Section')).toBe(true)
    expect(blocks.some((b) => b.type === 'paragraph' && b.text === 'Intro paragraph.')).toBe(true)
    expect(blocks.filter((b) => b.type === 'bullet').map((b) => b.text)).toEqual([
      'First item',
      'Second item'
    ])
  })

  it('parses tables with header row', () => {
    const html = `
      <table>
        <tbody>
          <tr><th>Requirement</th><th>Priority</th></tr>
          <tr><td>Login</td><td>High</td></tr>
          <tr><td>Logout</td><td>Medium</td></tr>
        </tbody>
      </table>
    `
    const blocks = parseHtmlToExportBlocks(html)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'table',
      headers: ['Requirement', 'Priority'],
      rows: [
        ['Login', 'High'],
        ['Logout', 'Medium']
      ]
    })
  })

  it('keeps table design attributes and cell fills for Word export', () => {
    const html = `
      <table data-table-style="striped" data-table-size="spacious" data-table-width="full">
        <tr><th data-bg="#1e3a5f" style="text-align:center" colwidth="140">Req</th><th>Priority</th></tr>
        <tr><td style="background-color: rgb(254, 243, 199)">Login</td><td>High</td></tr>
      </table>
    `
    const blocks = parseHtmlToExportBlocks(html)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'table',
      tableStyle: 'striped',
      tableSize: 'spacious',
      tableWidth: 'full',
      headers: ['Req', 'Priority']
    })
    if (blocks[0].type !== 'table') throw new Error('expected table')
    expect(blocks[0].cells?.[0][0]).toMatchObject({
      text: 'Req',
      header: true,
      background: '#1e3a5f',
      align: 'center',
      width: 140
    })
    expect(blocks[0].cells?.[1][0]).toMatchObject({
      text: 'Login',
      background: '#fef3c7'
    })
  })

  it('keeps cell borders, vertical align, merged cells, and inner paragraph alignment', () => {
    const html = `
      <table data-table-style="bordered">
        <tr>
          <th colspan="2" data-valign="bottom" data-border-color="#2563eb">Group</th>
        </tr>
        <tr>
          <td rowspan="2" style="vertical-align:top"><p style="text-align:right">Login</p></td>
          <td>High</td>
        </tr>
      </table>
    `
    const blocks = parseHtmlToExportBlocks(html)
    if (blocks[0].type !== 'table') throw new Error('expected table')
    expect(blocks[0].cells?.[0][0]).toMatchObject({
      text: 'Group',
      header: true,
      colSpan: 2,
      verticalAlign: 'bottom',
      borderColor: '#2563eb'
    })
    expect(blocks[0].cells?.[1][0]).toMatchObject({
      text: 'Login',
      align: 'right',
      verticalAlign: 'top',
      rowSpan: 2
    })
  })

  it('parses ordered lists with numbers', () => {
    const html = `<ol><li>Step one</li><li>Step two</li></ol>`
    const blocks = parseHtmlToExportBlocks(html)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'bullet', text: 'Step one', ordered: true, number: 1 })
    expect(blocks[1]).toMatchObject({ type: 'bullet', text: 'Step two', ordered: true, number: 2 })
  })

  it('does not duplicate list text as loose paragraphs inside table cells', () => {
    const html = `
      <table>
        <tr><td><p>Cell only</p></td></tr>
      </table>
    `
    const blocks = parseHtmlToExportBlocks(html)
    expect(blocks.filter((b) => b.type === 'table')).toHaveLength(1)
    expect(blocks.filter((b) => b.type === 'paragraph')).toHaveLength(0)
  })
})

describe('sanitizePdfText', () => {
  it('replaces unicode bullets with ascii hyphen', () => {
    expect(sanitizePdfText('• item')).toBe('- item')
    expect(sanitizePdfText('•')).toBe('-')
  })
})

describe('documentContentToSearchText', () => {
  it('indexes visible document text without HTML markup', () => {
    const text = documentContentToSearchText(
      '<h2>Executive Summary</h2><p>Payment gateway integration for <strong>employees</strong>.</p>'
    )

    expect(text).toContain('Executive Summary')
    expect(text).toContain('Payment gateway integration for employees')
    expect(text).not.toContain('<h2>')
    expect(text).not.toContain('<strong>')
  })

  it('leaves plain text unchanged', () => {
    expect(documentContentToSearchText('Plain requirement text')).toBe('Plain requirement text')
  })
})

describe('diffHtmlDocuments', () => {
  it('reports changed paragraphs with word-level detail', () => {
    const diff = diffHtmlDocuments(
      '<h2>Scope</h2><p>The portal supports employees.</p>',
      '<h2>Scope</h2><p>The portal supports employees and contractors.</p>'
    )

    expect(diff[0]).toMatchObject({ type: 'equal', text: '## Scope' })
    expect(diff[1]).toMatchObject({
      type: 'changed',
      oldText: 'The portal supports employees.',
      newText: 'The portal supports employees and contractors.'
    })
    expect(diff[1].wordDiff?.some((token) => token.type === 'insert')).toBe(true)
  })

  it('reports added and removed document blocks', () => {
    const diff = diffHtmlDocuments(
      '<h2>Overview</h2><p>Legacy requirement.</p>',
      '<h2>Overview</h2><p>Current requirement.</p><h2>Risks</h2>'
    )

    expect(diff.some((entry) => entry.type === 'changed')).toBe(true)
    expect(diff).toContainEqual({ type: 'added', text: '## Risks' })
  })

  it('compares lists and tables as structured blocks', () => {
    const diff = diffHtmlDocuments(
      '<ul><li>Login</li></ul><table><tr><th>Risk</th></tr><tr><td>Delay</td></tr></table>',
      '<ul><li>Login</li><li>Logout</li></ul><table><tr><th>Risk</th></tr><tr><td>Delay</td></tr><tr><td>Cost</td></tr></table>'
    )

    expect(diff).toContainEqual({ type: 'added', text: '- Logout' })
    expect(
      diff.some(
        (entry) =>
          entry.type === 'changed' &&
          entry.oldText?.startsWith('[table]') &&
          entry.newText?.includes('Cost')
      )
    ).toBe(true)
  })
})

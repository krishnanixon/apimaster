import type { CSSProperties } from 'react'
import { AlertTriangle, Box, Code2, Database, FileText, GitBranch, Globe, Shield, Star, User } from 'lucide-react'
import type { SlideElement } from '@shared/types/presentation-document'

const icons = { star: Star, code: Code2, database: Database, file: FileText, flow: GitBranch, globe: Globe, shield: Shield, user: User, box: Box }

export function ElementRenderer({ element, editing = false, onTextChange }: { element: SlideElement; editing?: boolean; onTextChange?: (value: string) => void }) {
  const fill: CSSProperties = { width: '100%', height: '100%' }
  switch (element.type) {
    case 'text':
      return editing ? (
        <textarea autoFocus value={element.content} onChange={(event) => onTextChange?.(event.target.value)} style={{ ...fill, fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight, fontStyle: element.fontStyle, textDecoration: element.textDecoration, color: element.textColor, background: element.backgroundColor ?? 'transparent', textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing, padding: 0, border: 0, resize: 'none', outline: 'none' }} />
      ) : (
        <div style={{ ...fill, display: 'flex', flexDirection: 'column', justifyContent: element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start', whiteSpace: 'pre-wrap', overflow: 'hidden', fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight, fontStyle: element.fontStyle, textDecoration: element.textDecoration, color: element.textColor, background: element.backgroundColor ?? 'transparent', textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing }}>{element.content}</div>
      )
    case 'image':
      return element.src ? <img src={element.src} alt={element.alt} style={{ ...fill, display: 'block', objectFit: element.objectFit, border: `${element.borderWidth}px solid ${element.borderColor ?? 'transparent'}`, borderRadius: element.borderRadius, boxShadow: element.shadow }} /> : <div style={{ ...fill, display: 'grid', placeItems: 'center', border: '2px dashed #94a3b8', color: '#64748b', fontSize: 26 }}>Missing image</div>
    case 'shape': {
      if (element.shape === 'line' || element.shape === 'arrow') return <svg viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`} preserveAspectRatio="none" style={fill}><line x1="0" y1={element.height / 2} x2={element.shape === 'arrow' ? element.width - 20 : element.width} y2={element.height / 2} stroke={element.stroke} strokeWidth={element.strokeWidth} /><defs><marker id={`arrow-${element.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill={element.stroke} /></marker></defs>{element.shape === 'arrow' ? <line x1="0" y1={element.height / 2} x2={element.width - 8} y2={element.height / 2} stroke={element.stroke} strokeWidth={element.strokeWidth} markerEnd={`url(#arrow-${element.id})`} /> : null}</svg>
      if (element.shape === 'triangle') return <div style={{ width: 0, height: 0, borderLeft: `${element.width / 2}px solid transparent`, borderRight: `${element.width / 2}px solid transparent`, borderBottom: `${element.height}px solid ${element.fill}` }} />
      return <div style={{ ...fill, background: element.fill, border: `${element.strokeWidth}px solid ${element.stroke}`, borderRadius: element.shape === 'circle' ? '50%' : element.shape === 'rounded-rectangle' ? element.borderRadius ?? 28 : element.borderRadius ?? 0 }} />
    }
    case 'icon': {
      const Icon = icons[element.icon.toLowerCase() as keyof typeof icons] ?? Box
      return <Icon style={fill} color={element.color} strokeWidth={element.strokeWidth} />
    }
    case 'table':
      return <table style={{ ...fill, borderCollapse: 'collapse', color: element.textColor, fontSize: element.fontSize }}><tbody>{element.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} style={{ border: `1px solid ${element.borderColor}`, padding: 12, background: element.headerRow && rowIndex === 0 ? element.headerBackground : element.cellBackground, fontWeight: element.headerRow && rowIndex === 0 ? 700 : 400 }}>{cell}</td>)}</tr>)}</tbody></table>
    case 'code':
      return <div style={{ ...fill, overflow: 'hidden', borderRadius: 12, background: element.theme === 'dark' ? '#0f172a' : '#f8fafc', color: element.theme === 'dark' ? '#e2e8f0' : '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 24 }}><div style={{ padding: '10px 16px', borderBottom: '1px solid #64748b55', fontSize: 18 }}>{element.fileName ?? element.language}</div><pre style={{ margin: 0, padding: 16, whiteSpace: 'pre-wrap' }}>{element.code}</pre></div>
    case 'project-reference':
      return <div style={{ ...fill, border: '2px solid #6366f1', borderRadius: 16, padding: 20, background: '#eef2ff', color: '#1e1b4b' }}><strong style={{ textTransform: 'uppercase', fontSize: 18 }}>{element.referenceType}</strong><div style={{ marginTop: 12, fontSize: 28 }}>{String(element.snapshot.title ?? element.snapshot.name ?? element.referenceId)}</div></div>
    case 'diagram':
      return <div style={{ ...fill, display: 'grid', placeItems: 'center', border: '2px solid #94a3b8', borderRadius: 12, background: '#f8fafc', color: '#475569', fontSize: 24 }}>{element.diagramType} diagram</div>
    default:
      return <div style={{ ...fill, display: 'grid', placeItems: 'center', background: '#fee2e2', color: '#991b1b' }}><AlertTriangle /> Unsupported element</div>
  }
}

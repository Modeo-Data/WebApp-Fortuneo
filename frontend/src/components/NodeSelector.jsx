import { useState } from 'react'
import ExplorePanel from './ExplorePanel.jsx'
import SourcesPanel from './SourcesPanel.jsx'

export default function NodeSelector({ nodes, edges, selectedNodeId, onSelect }) {
  const [mode, setMode] = useState('explore') // 'explore' | 'sources'

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200" style={{ width: 260, minWidth: 260 }}>

      {/* Mode toggle */}
      <div className="px-3 pt-3 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode('explore')}
            className="flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all"
            style={mode === 'explore'
              ? { background: 'var(--tab-active-bg)', color: 'var(--tab-active-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#94A3B8' }}>
            Explore nodes
          </button>
          <button
            onClick={() => setMode('sources')}
            className="flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all"
            style={mode === 'sources'
              ? { background: 'var(--tab-active-bg)', color: 'var(--tab-active-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#94A3B8' }}>
            Sources
          </button>
        </div>
      </div>

      {mode === 'explore'
        ? <ExplorePanel nodes={nodes} selectedNodeId={selectedNodeId} onSelect={onSelect} />
        : <SourcesPanel nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} onSelect={onSelect} />
      }
    </div>
  )
}

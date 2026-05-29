import { useState } from 'react'
import { Search, X } from 'lucide-react'
import ExplorePanel from './ExplorePanel.jsx'
import SourcesPanel from './SourcesPanel.jsx'

const ACCENT = '#88c648'

export default function NodeSelector({ nodes, edges, selectedNodeId, onSelect }) {
  const [mode, setMode] = useState('explore') // 'explore' | 'sources'
  const [search, setSearch] = useState('')

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200" style={{ width: 260, minWidth: 260 }}>

      {/* Search bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={mode === 'explore' ? 'Search nodes…' : 'Search sources…'}
            className="w-full text-xs pl-7 pr-6 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none transition placeholder:text-slate-400"
            onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}30`}
            onBlur={e => e.target.style.boxShadow = ''}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Animated mode tabs */}
      <div className="mode-tabs">
        <label className="tab">
          <input type="radio" name="panel-mode" checked={mode === 'explore'} onChange={() => setMode('explore')} />
          <div className="tab-name">
            <span className="pre-name" />
            <span className="pos-name" />
            <span>Explore nodes</span>
          </div>
        </label>
        <label className="tab">
          <input type="radio" name="panel-mode" checked={mode === 'sources'} onChange={() => setMode('sources')} />
          <div className="tab-name">
            <span className="pre-name" />
            <span className="pos-name" />
            <span>Sources</span>
          </div>
        </label>
      </div>

      {mode === 'explore'
        ? <ExplorePanel nodes={nodes} selectedNodeId={selectedNodeId} onSelect={onSelect} search={search} />
        : <SourcesPanel nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} onSelect={onSelect} search={search} setSearch={setSearch} />
      }
    </div>
  )
}

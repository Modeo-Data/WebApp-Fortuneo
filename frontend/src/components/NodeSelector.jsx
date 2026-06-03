import { useState, useEffect } from 'react'
import ExplorePanel from './ExplorePanel.jsx'
import SourcesPanel from './SourcesPanel.jsx'
import DiffPanel from './DiffPanel.jsx'


export default function NodeSelector({ nodes, edges, selectedNodeId, onSelect, onDiffSelect, onDiffRemoved, diffResult }) {
  const [mode, setMode] = useState('explore') // 'explore' | 'sources' | 'diff'

  // Auto-switch to diff tab when comparison becomes active, back to explore when cleared
  useEffect(() => {
    if (diffResult) setMode('diff')
    else if (mode === 'diff') setMode('explore')
  }, [!!diffResult]) // eslint-disable-line

  const tabs = [
    { id: 'explore', label: 'Explorer' },
    { id: 'sources', label: 'Sources' },
    ...(diffResult ? [{ id: 'diff', label: 'Diff' }] : []),
  ]

  return (
    <div className="ns-panel flex flex-col h-full bg-white border-r border-slate-200" style={{ width: 260, minWidth: 260 }}>

      {/* Animated mode tabs */}
      <div className="mode-tabs">
        {tabs.map(tab => (
          <label key={tab.id} className="tab">
            <input
              type="radio"
              name="panel-mode"
              checked={mode === tab.id}
              onChange={() => setMode(tab.id)}
            />
            <div className="tab-name">
              <span className="pre-name" />
              <span className="pos-name" />
              <span>{tab.label}</span>
            </div>
          </label>
        ))}
      </div>

      {mode === 'explore' && (
        <ExplorePanel nodes={nodes} selectedNodeId={selectedNodeId} onSelect={onSelect} />
      )}
      {mode === 'sources' && (
        <SourcesPanel nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} onSelect={onSelect} />
      )}
      {mode === 'diff' && diffResult && (
        <DiffPanel diffResult={diffResult} selectedNodeId={selectedNodeId} onSelect={onSelect} onOpenDrawer={onDiffSelect} onOpenRemoved={onDiffRemoved} />
      )}
    </div>
  )
}

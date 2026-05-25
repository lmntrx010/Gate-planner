import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Layers, ShieldAlert, Award, Lock, CheckCircle, Zap } from 'lucide-react';

export default function DependencyGraph() {
  const { subjects } = useApp();
  const [selectedNode, setSelectedNode] = useState(null);

  // Hardcode fixed coordinate layout mapping for a clean visual flow
  const nodes = [
    // Layer 1: Foundations
    { id: 'math', name: 'Engineering Mathematics', x: 120, y: 70, layer: 1, reqs: [] },
    { id: 'discrete', name: 'Discrete Mathematics', x: 120, y: 190, layer: 1, reqs: [] },
    { id: 'c_prog', name: 'C Programming', x: 120, y: 310, layer: 1, reqs: [] },
    
    // Layer 2: Core Data/Logic
    { id: 'ds', name: 'Data Structure', x: 300, y: 310, layer: 2, reqs: ['c_prog'] },
    { id: 'digital', name: 'Digital Logic', x: 300, y: 70, layer: 2, reqs: [] },
    { id: 'toc', name: 'Theory of Computation', x: 300, y: 190, layer: 2, reqs: ['discrete'] },
    
    // Layer 3: System / Algorithms
    { id: 'algo', name: 'Algorithm', x: 480, y: 310, layer: 3, reqs: ['ds', 'discrete'] },
    { id: 'coa', name: 'Computer Organization and Architecture', x: 480, y: 70, layer: 3, reqs: ['digital'] },
    { id: 'compiler', name: 'Compiler Design', x: 480, y: 190, layer: 3, reqs: ['toc'] },
    
    // Layer 4: System Stack
    { id: 'os', name: 'Operating System', x: 660, y: 70, layer: 4, reqs: ['coa'] },
    { id: 'dbms', name: 'DBMS', x: 660, y: 190, layer: 4, reqs: ['ds'] },
    { id: 'networks', name: 'Computer Networks', x: 660, y: 310, layer: 4, reqs: [] },

    // General Aptitude (Side branch)
    { id: 'aptitude', name: 'General Aptitude', x: 480, y: 410, layer: 1, reqs: [] }
  ];

  const links = [
    { source: 'c_prog', target: 'ds' },
    { source: 'ds', target: 'algo' },
    { source: 'discrete', target: 'algo' },
    { source: 'discrete', target: 'toc' },
    { source: 'toc', target: 'compiler' },
    { source: 'digital', target: 'coa' },
    { source: 'coa', target: 'os' },
    { source: 'ds', target: 'dbms' }
  ];

  const getSubjectStatus = (node) => {
    const subMeta = subjects.find(s => s.name.toLowerCase().includes(node.name.toLowerCase()) || node.name.toLowerCase().includes(s.name.toLowerCase()));
    
    // 1. Check if completed
    const completionRate = subMeta ? subMeta.completionRate : 0;
    if (completionRate === 100) return 'completed';

    // 2. Check if prerequisites are completed
    let reqsMet = true;
    node.reqs.forEach(reqId => {
      const reqNode = nodes.find(n => n.id === reqId);
      const reqMeta = subjects.find(s => s.name.toLowerCase().includes(reqNode.name.toLowerCase()) || reqNode.name.toLowerCase().includes(s.name.toLowerCase()));
      if (!reqMeta || reqMeta.completionRate < 70) {
        reqsMet = false;
      }
    });

    if (!reqsMet) return 'locked';
    if (completionRate > 0) return 'active';
    return 'unlocked';
  };

  const getNodeStyles = (status) => {
    switch (status) {
      case 'completed':
        return {
          fill: 'rgba(16, 185, 129, 0.1)',
          stroke: '#10B981',
          shadow: 'shadow-glow-emerald',
          iconColor: 'text-cyber-emerald'
        };
      case 'active':
        return {
          fill: 'rgba(59, 130, 246, 0.1)',
          stroke: '#3B82F6',
          shadow: 'shadow-glow-blue',
          iconColor: 'text-cyber-primary'
        };
      case 'locked':
        return {
          fill: 'rgba(31, 41, 55, 0.2)',
          stroke: 'rgba(255, 255, 255, 0.05)',
          shadow: '',
          iconColor: 'text-gray-600'
        };
      default:
        return {
          fill: 'rgba(17, 24, 39, 0.65)',
          stroke: 'rgba(255, 255, 255, 0.08)',
          shadow: '',
          iconColor: 'text-gray-400'
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Description Panel */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-900/40 p-4 rounded-xl border border-gray-800/80 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="text-cyber-primary w-5 h-5 animate-pulse" /> Topic Dependency Graph
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Explore chronological prerequisite mappings. Standard dependencies are highlighted.</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-cyber-emerald" /> Completed</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-cyber-primary" /> Active</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gray-800 border border-gray-700" /> Locked</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* SVG Dependency graph canvas */}
        <div className="lg:col-span-3 glass-panel rounded-xl border border-gray-800 p-4 overflow-x-auto relative flex justify-center">
          <svg className="min-w-[800px]" width="820" height="480">
            {/* Draw Links */}
            {links.map((link, idx) => {
              const sourceNode = nodes.find(n => n.id === link.source);
              const targetNode = nodes.find(n => n.id === link.target);
              
              const status = getSubjectStatus(targetNode);
              const strokeColor = status === 'locked' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(59, 130, 246, 0.2)';
              
              return (
                <g key={idx}>
                  {/* Connection Line */}
                  <line
                    x1={sourceNode.x + 80}
                    y1={sourceNode.y + 25}
                    x2={targetNode.x}
                    y2={targetNode.y + 25}
                    stroke={strokeColor}
                    strokeWidth="2.5"
                    strokeDasharray={status === 'locked' ? '4 4' : 'none'}
                  />
                  {/* Arrow Indicator */}
                  <polygon
                    points={`${targetNode.x - 6},${targetNode.y + 21} ${targetNode.x},${targetNode.y + 25} ${targetNode.x - 6},${targetNode.y + 29}`}
                    fill={status === 'locked' ? 'rgba(255, 255, 255, 0.1)' : '#3B82F6'}
                  />
                </g>
              );
            })}

            {/* Draw Nodes */}
            {nodes.map(node => {
              const status = getSubjectStatus(node);
              const styles = getNodeStyles(status);
              const subMeta = subjects.find(s => s.name.toLowerCase().includes(node.name.toLowerCase()) || node.name.toLowerCase().includes(s.name.toLowerCase()));
              const rate = subMeta ? subMeta.completionRate : 0;
              const isSelected = selectedNode?.id === node.id;

              return (
                <g 
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className="cursor-pointer group"
                >
                  {/* Outer glowing border on hover/selection */}
                  <rect
                    x={node.x - 2}
                    y={node.y - 2}
                    width="164"
                    height="54"
                    rx="12"
                    fill="transparent"
                    stroke={isSelected ? '#3B82F6' : 'transparent'}
                    strokeWidth="2"
                    className="transition duration-200"
                  />
                  {/* Core Card */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width="160"
                    height="50"
                    rx="10"
                    fill={styles.fill}
                    stroke={styles.stroke}
                    strokeWidth="1.5"
                    className="transition duration-300"
                  />
                  
                  {/* Label Text */}
                  <text
                    x={node.x + 12}
                    y={node.y + 22}
                    fill={status === 'locked' ? '#4B5563' : '#F3F4F6'}
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="Inter, sans-serif"
                    className="transition duration-300"
                  >
                    {node.name.length > 22 ? `${node.name.substring(0, 20)}...` : node.name}
                  </text>

                  {/* Completion Stats text */}
                  <text
                    x={node.x + 12}
                    y={node.y + 38}
                    fill={status === 'locked' ? '#374151' : '#9CA3AF'}
                    fontSize="9"
                    fontWeight="semibold"
                    fontFamily="Inter, sans-serif"
                  >
                    {status === 'locked' ? 'Locked (Requires Reqs)' : `${rate}% Complete`}
                  </text>

                  {/* Status Indicator Icon */}
                  <g transform={`translate(${node.x + 135}, ${node.y + 16})`}>
                    {status === 'completed' && <circle r="7" fill="rgba(16,185,129,0.2)" stroke="#10B981" />}
                    {status === 'completed' && <path d="M-3,0 L-1,2 L3,-2" stroke="#10B981" strokeWidth="1.5" fill="none" />}
                    {status === 'locked' && <circle r="7" fill="rgba(255,255,255,0.02)" stroke="#374151" />}
                    {status === 'locked' && <path d="M-2,-2 L2,-2 L2,2 L-2,2 Z M-2,-2 L-2,-4 A2,2 0 0,1 2,-4 L2,-2" stroke="#4B5563" strokeWidth="1" fill="none" />}
                    {status === 'active' && <circle r="7" fill="rgba(59,130,246,0.2)" stroke="#3B82F6" className="animate-ping" />}
                    {status === 'active' && <circle r="7" fill="rgba(59,130,246,0.3)" stroke="#3B82F6" />}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Node Drawer Info Panel */}
        <div className="glass-panel rounded-xl border border-gray-800 p-5 flex flex-col justify-between">
          {selectedNode ? (
            <div className="space-y-4">
              <div>
                <span className="text-[9px] uppercase tracking-widest font-extrabold text-cyber-accent block">Subject Details</span>
                <h3 className="text-base font-extrabold text-white mt-1 leading-tight font-sans tracking-wide">{selectedNode.name}</h3>
              </div>

              {selectedNode.reqs.length > 0 && (
                <div className="bg-gray-950 p-3 rounded-lg border border-gray-900">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Prerequisites:</span>
                  <div className="space-y-1.5 mt-2">
                    {selectedNode.reqs.map(reqId => {
                      const reqNode = nodes.find(n => n.id === reqId);
                      return (
                        <div key={reqId} className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                          <Lock className="w-3.5 h-3.5 text-cyber-accent" /> {reqNode.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 leading-relaxed">
                Prerequisites build a solid concepts hierarchy. Completing foundational courses ensures higher performance on dependent modules!
              </p>
            </div>
          ) : (
            <div className="text-center py-20">
              <Layers className="w-10 h-10 text-gray-700 mx-auto animate-pulse" />
              <p className="text-xs text-gray-500 mt-3 max-w-[150px] mx-auto">Select any subject node to explore dependency maps</p>
            </div>
          )}

          <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wider text-center border-t border-gray-900 pt-4 mt-6">
            GATE CS Syllabus Map
          </div>
        </div>

      </div>
    </div>
  );
}

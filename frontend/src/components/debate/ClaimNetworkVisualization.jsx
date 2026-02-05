import axios from 'axios';
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';

/**
 * CLAIM NETWORK VISUALIZATION
 * 
 * Interactive graph showing:
 * - Claims as nodes
 * - Relationships as edges (similar, refutes, supports)
 * - Color-coded by topic
 * - Size by usage frequency
 */

const ClaimNetworkVisualization = ({ claimId, width = 800, height = 600 }) => {
  const svgRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (claimId) {
      fetchNetworkData();
    }
  }, [claimId]);

  useEffect(() => {
    if (data && svgRef.current) {
      renderNetwork();
    }
  }, [data]);

  const fetchNetworkData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/api/knowledge-graph/claims/${claimId}/relationships`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const networkData = buildNetworkData(response.data.data);
      setData(networkData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch network data:', err);
      setError('Failed to load network visualization');
    } finally {
      setLoading(false);
    }
  };

  const buildNetworkData = (rawData) => {
    const nodes = [];
    const links = [];

    // Central node (the main claim)
    nodes.push({
      id: rawData.claim.id,
      text: rawData.claim.text,
      topic: rawData.claim.topic,
      stats: rawData.claim.stats,
      type: 'main'
    });

    // Add related claims as nodes
    rawData.relatedClaims?.forEach((related) => {
      nodes.push({
        id: related.claim._id,
        text: related.claim.originalText,
        topic: related.claim.topic,
        stats: related.claim.stats,
        type: 'related'
      });

      links.push({
        source: rawData.claim.id,
        target: related.claim._id,
        type: related.relationship,
        strength: related.similarity || 0.5
      });
    });

    // Add counter-claims as nodes
    rawData.counterClaims?.forEach((counter) => {
      nodes.push({
        id: counter.claim._id,
        text: counter.claim.originalText,
        topic: counter.claim.topic,
        stats: counter.claim.stats,
        type: 'counter'
      });

      links.push({
        source: counter.claim._id,
        target: rawData.claim.id,
        type: 'refutes',
        strength: counter.effectiveness / 10
      });
    });

    return { nodes, links };
  };

  const renderNetwork = () => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const container = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Color scale by topic
    const colorScale = d3.scaleOrdinal()
      .domain(['politics', 'economy', 'technology', 'environment', 'health', 'education', 'ethics', 'general'])
      .range(['#8b5cf6', '#3b82f6', '#10b981', '#22c55e', '#ef4444', '#f59e0b', '#ec4899', '#6366f1']);

    // Create force simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links)
        .id(d => d.id)
        .distance(d => 150 * (1 - d.strength))
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Create links
    const link = container.append('g')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('stroke', d => {
        if (d.type === 'refutes') return '#ef4444';
        if (d.type === 'supports') return '#10b981';
        return '#64748b';
      })
      .attr('stroke-width', d => 1 + d.strength * 3)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', d => d.type === 'similar' ? '5,5' : '0');

    // Create nodes
    const node = container.append('g')
      .selectAll('g')
      .data(data.nodes)
      .enter()
      .append('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    // Node circles
    node.append('circle')
      .attr('r', d => {
        if (d.type === 'main') return 30;
        return 10 + (d.stats?.totalUses || 1) * 2;
      })
      .attr('fill', d => colorScale(d.topic))
      .attr('stroke', d => {
        if (d.type === 'main') return '#fff';
        if (d.type === 'counter') return '#ef4444';
        return '#64748b';
      })
      .attr('stroke-width', d => d.type === 'main' ? 3 : 2)
      .style('cursor', 'pointer');

    // Node labels
    node.append('text')
      .text(d => {
        const maxLen = d.type === 'main' ? 30 : 20;
        return d.text.length > maxLen ? d.text.substring(0, maxLen) + '...' : d.text;
      })
      .attr('x', 0)
      .attr('y', d => d.type === 'main' ? 45 : 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.type === 'main' ? '12px' : '10px')
      .attr('fill', '#fff')
      .style('pointer-events', 'none');

    // Usage count badge
    node.filter(d => d.stats?.totalUses > 0)
      .append('text')
      .text(d => d.stats.totalUses)
      .attr('x', d => (d.type === 'main' ? 30 : 15))
      .attr('y', d => (d.type === 'main' ? -25 : -10))
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#a78bfa')
      .style('pointer-events', 'none');

    // Tooltips
    node.append('title')
      .text(d => `${d.text}\n\nTopic: ${d.topic}\nUses: ${d.stats?.totalUses || 0}\nRefuted: ${d.stats?.timesRefuted || 0}`);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(20, ${height - 100})`);

    const legendData = [
      { label: 'Main Claim', color: '#fff', stroke: '#fff' },
      { label: 'Related', color: '#64748b', stroke: '#64748b' },
      { label: 'Refutes', color: '#ef4444', stroke: '#ef4444' }
    ];

    legendData.forEach((item, i) => {
      const g = legend.append('g')
        .attr('transform', `translate(0, ${i * 25})`);

      g.append('circle')
        .attr('r', 8)
        .attr('fill', item.color)
        .attr('stroke', item.stroke)
        .attr('stroke-width', 2);

      g.append('text')
        .attr('x', 15)
        .attr('y', 5)
        .attr('font-size', '12px')
        .attr('fill', '#9ca3af')
        .text(item.label);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-gray-400">Loading network...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-gray-400">No relationships found</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Claim Network</h3>
          <div className="text-sm text-gray-400">
            {data.nodes.length} nodes • {data.links.length} connections
          </div>
        </div>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ background: '#0f172a' }}
      />
    </div>
  );
};

export default ClaimNetworkVisualization;
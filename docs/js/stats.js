// js/stats.js — painel de estatísticas com destaque de camadas únicas
(function(){

  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function getTargetLayers(map) {
    const layers = [];
    const seenIds = new Set();

    function traverse(layer){
      if (!layer) return;
      if (layer.feature && layer.feature.properties) {
        const props = layer.feature.properties;
        const id = props.id || props.name;
        if (id && !seenIds.has(id) && 'Área' in props && 'Área Verd' in props) {
          layers.push(layer);
          seenIds.add(id);
        }
      }
      if (layer._layers) Object.values(layer._layers).forEach(traverse);
    }

    map.eachLayer(traverse);
    return layers;
  }

  // instâncias Chart.js (ou null)
  let chartArea = null, chartAreaVerd = null;
  let highlightedLayers = [];
  let contributions = []; // escopo global para usar nos botões

  /* Opções configuráveis globalmente (pode ser alterado em runtime)
     Ex.: window._treemapOptions = { minPixel: 24 }; */
  if (!window._treemapOptions) window._treemapOptions = {};

  function updateStats(orderBy = null){
    const map = window.map || window._map || null;
    if (!map) return;

    const features = getTargetLayers(map);

    // restaurar estilos previamente destacados
    highlightedLayers.forEach(layer => {
      if (layer._originalStyle && layer.setStyle) layer.setStyle(layer._originalStyle);
    });
    highlightedLayers = [];

    contributions = [];
    const seenIds = new Set();
    const layersToHighlight = [];

    features.forEach(layer => {
      const props = layer.feature.properties;
      const id = props.id || props.name;
      if (!id || seenIds.has(id)) return;

      const area = parseNumber(props['Área']);
      const areaverd = parseNumber(props['Área Verd']);

      if (area > 0 || areaverd > 0) {
        contributions.push({ id, area, areaverd });
        seenIds.add(id);
        layersToHighlight.push(layer);
      }
    });

    // Destacar camadas no mapa
    layersToHighlight.forEach(layer => {
      if (layer.setStyle) {
        if (!layer._originalStyle) layer._originalStyle = {...layer.options};
        layer.setStyle({
          color: '#FF0000',
          weight: 3,
          fillColor: '#FF0000',
          fillOpacity: 0.3
        });
        highlightedLayers.push(layer);
      }
    });

    // Ordenar se solicitado
    if(orderBy === 'area'){
      contributions.sort((a,b) => b.area - a.area);
    } else if(orderBy === 'areaverd'){
      contributions.sort((a,b) => b.areaverd - a.areaverd);
    }

    // Atualizar painel descritivo
    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    if (contributions.length === 0){
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (totalAreaEl) totalAreaEl.textContent = '—';
      if (totalGreenEl) totalGreenEl.textContent = '—';
      if (propsListEl) propsListEl.innerHTML = '';
      // destruir gráficos se existirem
      try { if (chartArea && chartArea.destroy) { chartArea.destroy(); chartArea = null; } } catch(e){}
      try { if (chartAreaVerd && chartAreaVerd.destroy) { chartAreaVerd.destroy(); chartAreaVerd = null; } } catch(e){}
      return;
    }

    const totalArea = contributions.reduce((sum,c) => sum + c.area, 0);
    const totalAreaVerd = contributions.reduce((sum,c) => sum + c.areaverd, 0);

    if (totalPropsEl) totalPropsEl.textContent = String(contributions.length);
    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(c => {
        const li = document.createElement('li');
        li.textContent = `ID: ${c.id} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
        propsListEl.appendChild(li);
      });
    }

    // ---------- buildChart usando D3.js (treemap responsivo e adaptativo) ----------
    if (!window._treemapActive) window._treemapActive = new Set();
    if (!window._treemapColorMap) window._treemapColorMap = {};

    function buildChart(canvasId, values, labels){
      if (typeof d3 === 'undefined') {
        console.error('D3.js não encontrado. Inclua <script src="https://d3js.org/d3.v7.min.js"></script>');
        return;
      }

      // localizar elemento alvo (substitui canvas por div se necessário)
      let el = document.getElementById(canvasId);
      if (!el) return;
      if (el.tagName.toLowerCase() === 'canvas') {
        const wrapper = document.createElement('div');
        wrapper.id = canvasId;
        wrapper.className = 'd3-treemap-wrapper';
        el.parentNode.replaceChild(wrapper, el);
        el = wrapper;
      }

      // destruir renderizações anteriores
      try {
        if (canvasId === 'chart-area' && chartArea && chartArea.destroy) chartArea.destroy();
        if (canvasId === 'chart-areaverd' && chartAreaVerd && chartAreaVerd.destroy) chartAreaVerd.destroy();
      } catch(e){ /* ignore */ }

      el.innerHTML = '';

      // estilo de scrollbar minimal (injetado uma vez)
      if (!document.getElementById('treemap-legend-scroll-style')){
        const style = document.createElement('style');
        style.id = 'treemap-legend-scroll-style';
        style.innerHTML = `
          .treemap-legend-container::-webkit-scrollbar{ width:6px; }
          .treemap-legend-container::-webkit-scrollbar-track{ background: rgba(0,0,0,0.04); border-radius:4px; }
          .treemap-legend-container::-webkit-scrollbar-thumb{ background: rgba(0,0,0,0.18); border-radius:4px; }
          .treemap-legend-container{ scrollbar-width: thin; }
        `;
        document.head.appendChild(style);
      }

      // paleta e utilitários
      const palette = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
        '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
        '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
      ];
      function lightenHex(color, pct){
        const num = parseInt(String(color).replace("#",""),16);
        const amt = Math.round(255 * pct);
        let R = (num >> 16) + amt;
        let G = (num >> 8 & 0x00FF) + amt;
        let B = (num & 0x0000FF) + amt;
        R = Math.max(0, Math.min(255, R));
        G = Math.max(0, Math.min(255, G));
        B = Math.max(0, Math.min(255, B));
        return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
      }
      function shortNumber(n) {
        if (!isFinite(n)) return '0';
        const abs = Math.abs(n);
        if (abs >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
        if (abs >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'') + 'K';
        return String(n);
      }

      // dimensões responsivas
      const style = getComputedStyle(el);
      const baseWidth = Math.max(360, Math.floor(el.clientWidth || parseInt(style.width) || 480));
      let baseHeight = Math.max(300, Math.floor(el.clientHeight || parseInt(style.height) || 380));

      // layout: treemap acima, legenda abaixo com espaçamento
      const padding = 12;
      const legendGap = Math.max(12, Math.floor(baseHeight * 0.04));

      // calcular espaço para legenda (duas colunas)
      const labelsCount = labels.length;
      const legendCols = 2; // solicitado: duas colunas verticais
      const itemsPerCol = Math.ceil(labelsCount / legendCols);
      const rowHeight = Math.max(22, Math.round(baseHeight * 0.032));
      const legendPadding = 8;
      const desiredLegendHeight = itemsPerCol * rowHeight + legendPadding;

      // assegurar altura minima do treemap para visualização de áreas pequenas
      const minTreemapHeight = 220;
      const neededHeight = padding*2 + minTreemapHeight + legendGap + desiredLegendHeight;
      const height = Math.max(baseHeight, neededHeight);

      // dar mais largura ao treemap para melhorar visibilidade de áreas pequenas
      const treemapWidth = Math.floor(baseWidth * 0.96) - padding*2;
      const treemapHeight = Math.max(minTreemapHeight, Math.floor(height - padding*2 - desiredLegendHeight - legendGap));

      // criar SVG
      const svg = d3.select(el).append('svg').attr('width', baseWidth).attr('height', height).style('display','block');
      const gTreemap = svg.append('g').attr('transform', `translate(${padding}, ${padding})`);

      // preparar dados
      const vals = values.map(v => (isFinite(v) ? Number(v) : 0));
      const totalVal = vals.reduce((s,x) => s + x, 0);
      const baseNodes = labels.map((lbl,i) => ({ name: String(lbl), value: vals[i] }));
      baseNodes.forEach((n,i) => { if (!window._treemapColorMap[n.name]) window._treemapColorMap[n.name] = palette[i % palette.length]; });

      // ----------------------- mini-balanceamento (tamanho mínimo perceptível) -----------------------
      const totalPixelArea = Math.max(1, treemapWidth * treemapHeight);
      const defaultMinPixel = Math.round(totalPixelArea * 0.0015);
      const minPixel = typeof window._treemapOptions.minPixel === 'number' ? window._treemapOptions.minPixel : Math.min(64, Math.max(16, defaultMinPixel));
      const valuePerPixel = totalVal / totalPixelArea || 1;
      const minValueUnit = minPixel * valuePerPixel;

      const adjustedNodes = baseNodes.map(n => ({ name: n.name, value: n.value, adjValue: Math.max(n.value, minValueUnit) }));

      const activeSet = window._treemapActive;
      const effectiveNodes = (activeSet.size === 0) ? adjustedNodes : adjustedNodes.filter(n => activeSet.has(n.name));

      const sumEffective = effectiveNodes.reduce((s,d) => s + Math.max(0,d.adjValue), 0);
      if (sumEffective === 0) {
        gTreemap.append('rect').attr('width', treemapWidth).attr('height', treemapHeight).attr('fill','#f2f2f2');
        gTreemap.append('text').attr('x',12).attr('y',22).attr('fill','#333').attr('font-size',12).text('Sem dados visíveis');
        const emptyState = { canvasId, destroy: ()=>{ svg.remove(); } };
        if (canvasId === 'chart-area') chartArea = emptyState;
        if (canvasId === 'chart-areaverd') chartAreaVerd = emptyState;
        return;
      }

      const nodes = effectiveNodes.map(n => ({ name: n.name, value: n.value, adjValue: n.adjValue, color: (canvasId === 'chart-areaverd') ? lightenHex(window._treemapColorMap[n.name], 0.36) : window._treemapColorMap[n.name] })).sort((a,b) => b.adjValue - a.adjValue);

      // D3 treemap (retangular, largura maior)
      const root = d3.hierarchy({ children: nodes }).sum(d => Math.max(0,d.adjValue)).sort((a,b)=>b.value - a.value);
      d3.treemap().size([treemapWidth, treemapHeight]).paddingInner(3).round(true)(root);
      const leaves = root.leaves();

      // tooltip
      let tooltip = document.getElementById(canvasId + '-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = canvasId + '-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.padding = '6px 8px';
        tooltip.style.background = 'rgba(0,0,0,0.78)';
        tooltip.style.color = '#fff';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = 9999;
        el.style.position = el.style.position || 'relative';
        el.appendChild(tooltip);
      }

      // desenhar folhas
      const leafG = gTreemap.selectAll('g.leaf').data(leaves, d => d.data.name);
      const leafEnter = leafG.enter().append('g').attr('class','leaf').attr('transform', d => `translate(${d.x0}, ${d.y0})`);
      leafEnter.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .attr('fill', d => d.data.color)
        .attr('stroke', 'rgba(0,0,0,0.06)')
        .on('mousemove', function(event, d){
          tooltip.style.display = 'block';
          const pct = Math.round(d.data.value / (nodes.reduce((s,n)=>s + n.value,0) || 1) * 100);
          tooltip.textContent = `${d.data.name} — ${Number(d.data.value).toLocaleString('pt-BR')} (${pct}%)`;
          const bbox = el.getBoundingClientRect();
          tooltip.style.left = (event.clientX - bbox.left + 12) + 'px';
          tooltip.style.top = (event.clientY - bbox.top + 12) + 'px';
        })
        .on('mouseout', function(){ tooltip.style.display = 'none'; })
        .on('click', function(event, d){
          if (!window.map) return;
          const targetId = d.data.name;
          let found = null;
          try {
            window.map.eachLayer && window.map.eachLayer(function(layer){
              try {
                const props = layer.feature && layer.feature.properties;
                if (props && (String(props.id) === String(targetId) || String(props.name) === String(targetId))) {
                  found = layer;
                  return;
                }
              } catch(e){}
            });
            if (found && found.getBounds) window.map.fitBounds(found.getBounds(), { maxZoom: 16 });
          } catch(e){}
        });

      leafEnter.filter(d => (d.x1 - d.x0) > 48 && (d.y1 - d.y0) > 18)
        .append('text')
        .attr('x', 6).attr('y', 14)
        .attr('fill', '#000')
        .attr('font-size', 11)
        .text(d => d.data.name);

      // ------------------------- legenda em DUAS COLUNAS com barra lateral (scroll) -------------------------
      // remover legenda antiga
      const oldLegend = el.querySelector('.treemap-legend-container');
      if (oldLegend && oldLegend.parentNode) oldLegend.parentNode.removeChild(oldLegend);

      const legendContainer = document.createElement('div');
      legendContainer.className = 'treemap-legend-container';
      legendContainer.style.boxSizing = 'border-box';
      legendContainer.style.width = (baseWidth - padding*2) + 'px';
      legendContainer.style.marginTop = legendGap + 'px';
      legendContainer.style.padding = '6px 4px';
      legendContainer.style.display = 'flex';
      legendContainer.style.gap = '12px';
      legendContainer.style.alignItems = 'flex-start';
      legendContainer.style.justifyContent = 'space-between';
      // tornar o container rolável verticalmente (barra lateral "mini")
      const maxLegendHeight = Math.max(120, Math.min(420, Math.floor(desiredLegendHeight)));
      legendContainer.style.maxHeight = maxLegendHeight + 'px';
      legendContainer.style.overflowY = 'auto';

      // criar 2 colunas
      const cols = 2;
      const itemsPer = Math.ceil(labels.length / cols);
      for (let c = 0; c < cols; c++){
        const col = document.createElement('div');
        col.style.display = 'flex';
        col.style.flexDirection = 'column';
        col.style.gap = '6px';
        col.style.flex = '1 1 48%';
        col.style.minWidth = '120px';

        const start = c * itemsPer;
        const end = Math.min(start + itemsPer, labels.length);
        for (let i = start; i < end; i++){
          const lbl = labels[i];
          const val = vals[i];
          const color = window._treemapColorMap[String(lbl)] || palette[i % palette.length];

          const item = document.createElement('div');
          item.className = 'legend-item';
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.padding = '4px 6px';
          item.style.cursor = 'pointer';

          const left = document.createElement('div');
          left.style.display = 'flex';
          left.style.alignItems = 'center';
          left.style.gap = '8px';

          const sw = document.createElement('div');
          sw.style.width = '14px';
          sw.style.height = '14px';
          sw.style.borderRadius = '2px';
          sw.style.background = color;
          sw.style.border = '1px solid rgba(0,0,0,0.06)';

          const name = document.createElement('div');
          name.textContent = String(lbl);
          name.style.fontSize = '12px';
          name.style.color = '#000';
          name.style.whiteSpace = 'nowrap';
          name.style.overflow = 'hidden';
          name.style.textOverflow = 'ellipsis';
          name.style.maxWidth = '180px';

          left.appendChild(sw);
          left.appendChild(name);

          const right = document.createElement('div');
          right.textContent = shortNumber(val);
          right.style.fontSize = '12px';
          right.style.color = '#000';

          item.appendChild(left);
          item.appendChild(right);

          item.addEventListener('click', function(){
            if (window._treemapActive.has(lbl)) window._treemapActive.delete(lbl);
            else window._treemapActive.add(lbl);
            try { window.webmapStats && window.webmapStats.updateStats(); } catch(e){}
          });

          col.appendChild(item);
        }
        legendContainer.appendChild(col);
      }

      el.appendChild(legendContainer);

      // salvar estado para destruição futura
      const state = { canvasId, svgNode: svg.node(), legendNode: legendContainer, destroy: function(){ try { if (tooltip && tooltip.parentElement) tooltip.parentElement.removeChild(tooltip); if (this.legendNode && this.legendNode.parentElement) this.legendNode.parentElement.removeChild(this.legendNode); svg.remove(); } catch(e){} } };
      if (canvasId === 'chart-area') chartArea = state;
      if (canvasId === 'chart-areaverd') chartAreaVerd = state;

      // responsividade: redimensiona ao mudar tamanho da janela (debounced)
      if (!window._treemapResizeHandler) {
        let to = null;
        window._treemapResizeHandler = function(){
          if (to) clearTimeout(to);
          to = setTimeout(()=>{ try { window.webmapStats && window.webmapStats.updateStats(); } catch(e){} }, 150);
        };
        window.addEventListener('resize', window._treemapResizeHandler);
      }
    }

    // preparar labels/arrays e chamar (mantendo fluxo)
    const labels = contributions.map(c => c.id);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    buildChart('chart-area', valuesArea, labels);
    buildChart('chart-areaverd', valuesAreaVerd, labels);

  }
  window.webmapStats = { updateStats, contributions };

  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    const sortAreaBtn = document.getElementById("sort-area");
    const sortGreenBtn = document.getElementById("sort-areaverd");

    if (!btn || !panel) return;

    function openPanel() {
      panel.classList.remove('hidden');
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      panel.style.zIndex = '1001';
      setTimeout(() => window.webmapStats.updateStats(), 50);
    }

    function closePanel() {
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }

    btn.addEventListener('click', function () {
      const computed = getComputedStyle(panel).display;
      if (computed === 'none') openPanel(); else closePanel();
    });

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    document.addEventListener('click', (event) => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) closePanel();
    });

    // Botões de ordenação com teste no console
    if(sortAreaBtn) sortAreaBtn.addEventListener('click', () => {
        console.log('Botão Ordenar por Área Total clicado'); // <-- teste
        window.webmapStats.updateStats('area');
    });

    if(sortGreenBtn) sortGreenBtn.addEventListener('click', () => {
        console.log('Botão Ordenar por Área Verde clicado'); // <-- teste
        window.webmapStats.updateStats('areaverd');
    });

    panel.classList.add('hidden');
    setTimeout(() => window.webmapStats.updateStats(), 1000);
  });

})();
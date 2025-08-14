/// js/stats.js — painel de estatísticas com destaque de camadas únicas
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
      // destruir gráficos Chart.js se existirem
      try { if (chartArea) { chartArea.destroy(); chartArea = null; } } catch(e){}
      try { if (chartAreaVerd) { chartAreaVerd.destroy(); chartAreaVerd = null; } } catch(e){}
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

              // ---------- buildChart usando D3.js (treemap maior, legenda abaixo) ----------
    function buildChart(canvasId, values, labels){
      // requer D3.js (https://d3js.org/d3.v7.min.js) incluído no HTML
      if (typeof d3 === 'undefined') {
        console.error('D3.js não encontrado. Inclua <script src="https://d3js.org/d3.v7.min.js"></script>');
        return;
      }

      // localizar elemento alvo (pode ser canvas ou div). Se for canvas, substitui por div contêiner
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

      // limpar conteúdo
      el.innerHTML = '';

      // parâmetros visuais e paleta
      const palette = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
        '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
        '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
      ];
      function lightenColorHex(color, percent) {
        const num = parseInt(String(color).replace("#",""),16);
        const amt = Math.round(255 * percent);
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
        return n.toString();
      }

      // dimensões responsivas (usa clientWidth/clientHeight do elemento)
      const style = getComputedStyle(el);
      const width = Math.max(220, Math.floor(el.clientWidth || parseInt(style.width) || 320));
      const height = Math.max(160, Math.floor(el.clientHeight || parseInt(style.height) || 240));

      // layout: reservar legenda fixa embaixo (sem que treemap invada)
      const padding = 8;
      const legendHeight = Math.max(80, Math.floor(height * 0.24)); // espaço reservado para legenda (fixo proporcional)
      const treemapSize = Math.min(width - padding*2, height - padding*2 - legendHeight);
      const treemapLeft = Math.round((width - treemapSize) / 2);

      // preparar container SVG
      const svg = d3.select(el)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('display','block');

      // criar grupo para treemap e legenda
      const gTreemap = svg.append('g').attr('transform', `translate(${treemapLeft}, ${padding})`);
      const gLegend = svg.append('g').attr('transform', `translate(${padding}, ${padding + treemapSize + 8})`);

      // preparar dados (hierarquia com children)
      const vals = values.map(v => (isFinite(v) ? Number(v) : 0));
      const totalVal = vals.reduce((s,x) => s + x, 0);
      const nodes = labels.map((lbl,i) => ({
        name: String(lbl),
        value: vals[i],
        color: palette[i % palette.length]
      }));

      // se for gráfico 'chart-areaverd', clarear cores
      if (canvasId === 'chart-areaverd') nodes.forEach(n => n.color = lightenColorHex(n.color, 0.38));

      // se sem dados, desenhar placeholder
      if (totalVal === 0) {
        gTreemap.append('rect')
          .attr('width', treemapSize)
          .attr('height', treemapSize)
          .attr('fill', '#f2f2f2');
        gTreemap.append('text')
          .attr('x', 12).attr('y', 22).attr('fill', '#666').attr('font-size', 12).text('Sem dados');
        // estado simples para destruição
        const emptyState = { canvasId, destroy: () => { svg.remove(); } };
        if (canvasId === 'chart-area') chartArea = emptyState;
        if (canvasId === 'chart-areaverd') chartAreaVerd = emptyState;
        return;
      }

      // montar hierarquia D3 e treemap (squarified)
      const root = d3.hierarchy({ children: nodes })
        .sum(d => Math.max(0, d.value))
        .sort((a,b) => b.value - a.value);

      d3.treemap()
        .size([treemapSize, treemapSize])
        .paddingInner(2)
        .round(true)
        (root);

      // obter folhas (retângulos)
      const leaves = root.leaves();

      // tooltip DOM
      let tooltip = document.getElementById(canvasId + '-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = canvasId + '-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.padding = '6px 8px';
        tooltip.style.background = 'rgba(0,0,0,0.75)';
        tooltip.style.color = '#fff';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = 9999;
        el.style.position = el.style.position || 'relative';
        el.appendChild(tooltip);
      }

      // desenhar retângulos
      const leafG = gTreemap.selectAll('g.leaf')
        .data(leaves, d => d.data.name);

      const leafEnter = leafG.enter().append('g').attr('class','leaf')
        .attr('transform', d => `translate(${d.x0}, ${d.y0})`);

      leafEnter.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .attr('fill', d => d.data.color)
        .attr('stroke', 'rgba(0,0,0,0.06)')
        .on('mousemove', function(event, d){
          tooltip.style.display = 'block';
          tooltip.textContent = `${d.data.name} — ${Number(d.data.value).toLocaleString('pt-BR')} (${Math.round(d.value / root.value * 100)}%)`;
          const bbox = el.getBoundingClientRect();
          tooltip.style.left = (event.clientX - bbox.left + 12) + 'px';
          tooltip.style.top = (event.clientY - bbox.top + 12) + 'px';
        })
        .on('mouseout', function(){ tooltip.style.display = 'none'; })
        .on('click', function(event, d){
          // tenta encontrar camada e centralizar no mapa
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

      // rótulos internos apenas para áreas maiores
      leafEnter.filter(d => (d.x1 - d.x0) > 48 && (d.y1 - d.y0) > 18)
        .append('text')
        .attr('x', 6).attr('y', 14)
        .attr('fill', '#111')
        .attr('font-size', 11)
        .text(d => d.data.name);

      // legenda abaixo — ordenada por valor decrescente (como pie original)
      const legendData = nodes.slice().sort((a,b) => b.value - a.value);
      // criar grupo de legend items; cada item (linha) com cor + nome + valor curto alinhado à direita
      const legendGroup = gLegend.selectAll('g.legendRow').data(legendData, d => d.name);
      const legendEnter = legendGroup.enter().append('g').attr('class','legendRow')
        .attr('transform', (d,i) => `translate(0, ${i * 20})`);
      legendEnter.append('rect').attr('width', 12).attr('height', 12).attr('fill', d => d.color).attr('stroke','rgba(0,0,0,0.06)');
      legendEnter.append('text').attr('x', 18).attr('y', 10).attr('fill','#222').attr('font-size', 12).text(d => d.name);
      // valor curto alinhado à direita
      legendEnter.append('text')
        .attr('class','legendValue')
        .attr('x', width - padding)
        .attr('y', 10)
        .attr('text-anchor','end')
        .attr('fill','#222')
        .attr('font-size', 12)
        .text(d => shortNumber(d.value));

      // salvar estado para possível destruição
      const state = {
        canvasId,
        svgNode: svg.node(),
        destroy: function(){
          try {
            // remove SVG e tooltip
            if (tooltip && tooltip.parentElement) tooltip.parentElement.removeChild(tooltip);
            svg.remove();
          } catch(e){}
        }
      };
      if (canvasId === 'chart-area') chartArea = state;
      if (canvasId === 'chart-areaverd') chartAreaVerd = state;
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

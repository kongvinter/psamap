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
    // ---------- buildChart usando D3.js (treemap maior, legenda compacta e interativa) ----------
    // Requisitos: d3.v7 incluído no HTML.
    // Estado compartilhado para seleção e mapa de cores (persiste entre chamadas)
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
        // pequenas margens/paddings para separar visualmente do restante do painel
        wrapper.style.padding = '6px';
        wrapper.style.marginBottom = '12px';
        el.parentNode.replaceChild(wrapper, el);
        el = wrapper;
      }

      // destruir renderizações anteriores
      try {
        if (canvasId === 'chart-area' && chartArea && chartArea.destroy) chartArea.destroy();
        if (canvasId === 'chart-areaverd' && chartAreaVerd && chartAreaVerd.destroy) chartAreaVerd.destroy();
      } catch(e){ /* ignore */ }

      el.innerHTML = '';

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

      // dimensões responsivas (usa clientWidth/clientHeight do elemento)
      const style = getComputedStyle(el);
      const width = Math.max(300, Math.floor(el.clientWidth || parseInt(style.width) || 400)); // maior largura por padrão
      const height = Math.max(280, Math.floor(el.clientHeight || parseInt(style.height) || 360));

      // espaçamentos ajustáveis para aumentar distância entre treemap e legenda
      const padding = 12; // espaço interno ao redor do SVG
      const legendGap = Math.max(12, Math.floor(height * 0.04)); // gap maior entre treemap e legenda
      const legendHeight = Math.max(72, Math.floor(height * 0.18)); // altura disponível para legenda
      const availableHeightForTreemap = height - padding*2 - legendHeight - legendGap;
      const treemapSize = Math.min(width - padding*2, availableHeightForTreemap);
      const treemapLeft = Math.round((width - treemapSize) / 2);

      // criar SVG
      const svg = d3.select(el).append('svg').attr('width', width).attr('height', height).style('display','block');
      const gTreemap = svg.append('g').attr('transform', `translate(${treemapLeft}, ${padding})`);
      const gLegend = svg.append('g').attr('transform', `translate(${padding}, ${padding + treemapSize + legendGap})`);

      // preparar dados base
      const vals = values.map(v => (isFinite(v) ? Number(v) : 0));
      const totalVal = vals.reduce((s,x) => s + x, 0);
      const baseNodes = labels.map((lbl,i) => ({ name: String(lbl), value: vals[i] }));

      // construir mapa de cores consistente: se já existir, manter; senão, atribuir
      baseNodes.forEach((n,i) => {
        if (!window._treemapColorMap[n.name]) window._treemapColorMap[n.name] = palette[i % palette.length];
      });

      // seleção ativa: se set vazio = todos ativos; se não vazio = apenas ativos
      const activeSet = window._treemapActive;
      const effectiveNodes = (activeSet.size === 0)
        ? baseNodes
        : baseNodes.filter(n => activeSet.has(n.name));

      // para 'area verde' clarear cores
      const isGreen = (canvasId === 'chart-areaverd');

      // caso sem dados (ou após exclusões não restarem nós)
      const sumEffective = effectiveNodes.reduce((s,d) => s + Math.max(0,d.value), 0);
      if (sumEffective === 0) {
        gTreemap.append('rect').attr('width', treemapSize).attr('height', treemapSize).attr('fill','#f2f2f2');
        gTreemap.append('text').attr('x',12).attr('y',22).attr('fill','#333').attr('font-size',12).text('Sem dados visíveis');
        const emptyState = { canvasId, destroy: ()=>{ svg.remove(); } };
        if (canvasId === 'chart-area') chartArea = emptyState;
        if (canvasId === 'chart-areaverd') chartAreaVerd = emptyState;
        return;
      }

      // preparar nodes com cor e valor
      const nodes = effectiveNodes.map(n => ({
        name: n.name,
        value: n.value,
        color: isGreen ? lightenHex(window._treemapColorMap[n.name], 0.38) : window._treemapColorMap[n.name]
      })).sort((a,b) => b.value - a.value);

      // D3 treemap (squarified)
      const root = d3.hierarchy({ children: nodes }).sum(d => Math.max(0,d.value)).sort((a,b)=>b.value - a.value);
      d3.treemap().size([treemapSize, treemapSize]).paddingInner(2).round(true)(root);
      const leaves = root.leaves();

      // tooltip DOM (cria se não existir)
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
          tooltip.textContent = `${d.data.name} — ${Number(d.data.value).toLocaleString('pt-BR')} (${Math.round(d.value / root.value * 100)}%)`;
          const bbox = el.getBoundingClientRect();
          tooltip.style.left = (event.clientX - bbox.left + 12) + 'px';
          tooltip.style.top = (event.clientY - bbox.top + 12) + 'px';
        })
        .on('mouseout', function(){ tooltip.style.display = 'none'; })
        .on('click', function(event, d){
          // tenta centralizar camada no mapa
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

      // rótulos internos apenas para áreas maiores (texto em preto para máxima legibilidade)
      leafEnter.filter(d => (d.x1 - d.x0) > 48 && (d.y1 - d.y0) > 18)
        .append('text')
        .attr('x', 6).attr('y', 14)
        .attr('fill', '#000')
        .attr('font-size', 11)
        .text(d => d.data.name);

      // ------------------------- legenda compacta e clicável -------------------------
      // construiremos legendas em N colunas (dinâmico) para caber todos os itens
      const legendAll = labels.map((lbl,i) => ({
        name: String(lbl),
        color: window._treemapColorMap[String(lbl)] || palette[i % palette.length],
        value: vals[i]
      })).sort((a,b)=> b.value - a.value);

      // determinar número de colunas: mais colunas para larguras maiores
      const maxCols = Math.min(3, Math.max(1, Math.floor(width / 200)));
      const cols = maxCols;
      const itemsPerCol = Math.ceil(legendAll.length / cols);
      const rowHeight = 24; // aumentado para dar mais espaço vertical entre itens
      const colWidth = Math.floor((width - padding*2 - (cols - 1) * 12) / cols);

      // limpar grupo de legenda
      gLegend.selectAll('*').remove();

      // criar grupos por coluna
      for (let c = 0; c < cols; c++) {
        const colGroup = gLegend.append('g').attr('transform', `translate(${c * colWidth}, 0)`);
        const start = c * itemsPerCol;
        const end = Math.min(start + itemsPerCol, legendAll.length);
        for (let i = start; i < end; i++) {
          const it = legendAll[i];
          const idxInCol = i - start;
          const gRow = colGroup.append('g').attr('class','legend-row').attr('transform', `translate(0, ${idxInCol * rowHeight})`);
          // opacidade conforme ativo/inativo
          const isActive = (activeSet.size === 0) ? true : activeSet.has(it.name);
          const opacity = isActive ? 1 : 0.32;
          // retângulo cor
          gRow.append('rect')
            .attr('x', 0).attr('y', -12).attr('width', 12).attr('height', 12)
            .attr('fill', it.color)
            .attr('stroke','rgba(0,0,0,0.06)')
            .attr('opacity', opacity)
            .style('cursor','pointer')
            .on('click', () => {
              // alterna seleção global e redesenha (via updateStats)
              if (window._treemapActive.has(it.name)) window._treemapActive.delete(it.name);
              else window._treemapActive.add(it.name);
              // se ficar vazio, manter como "nenhum filtro" — isto faz mostrar todos
              if (window._treemapActive.size === 0) {
                // nothing
              }
              // chama updateStats para redesenhar ambos os treemaps
              try { window.webmapStats && window.webmapStats.updateStats(); } catch(e){}
            });

          // texto nome (preto) compacto
          gRow.append('text')
            .attr('x', 18).attr('y', -2)
            .attr('fill', '#000')
            .attr('font-size', 12)
            .attr('opacity', opacity)
            .text(it.name)
            .style('cursor','pointer')
            .on('click', () => {
              if (window._treemapActive.has(it.name)) window._treemapActive.delete(it.name);
              else window._treemapActive.add(it.name);
              try { window.webmapStats && window.webmapStats.updateStats(); } catch(e){}
            });

          // valor curto alinhado à direita da coluna
          gRow.append('text')
            .attr('x', colWidth - 6)
            .attr('y', -2)
            .attr('text-anchor','end')
            .attr('fill', '#000')
            .attr('font-size', 12)
            .attr('opacity', opacity)
            .text(shortNumber(it.value))
            .style('cursor','pointer')
            .on('click', () => {
              if (window._treemapActive.has(it.name)) window._treemapActive.delete(it.name);
              else window._treemapActive.add(it.name);
              try { window.webmapStats && window.webmapStats.updateStats(); } catch(e){}
            });
        }
      }
      // ------------------------------------------------------------------------------------

      // salvar estado para destruição futura
      const state = {
        canvasId,
        svgNode: svg.node(),
        destroy: function(){
          try {
            if (tooltip && tooltip.parentElement) tooltip.parentElement.removeChild(tooltip);
            svg.remove();
          } catch(e){}
        }
      };
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


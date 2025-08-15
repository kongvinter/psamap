//js.seguro

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

  let chartArea = null, chartAreaVerd = null;
  let highlightedLayers = [];
  let contributions = []; // escopo global para usar nos botões

  function updateStats(orderBy = null){
    const map = window.map || window._map || null;
    if (!map) return;

    const features = getTargetLayers(map);

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

    // Atualizar painel
    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    if (contributions.length === 0){
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (totalAreaEl) totalAreaEl.textContent = '—';
      if (totalGreenEl) totalGreenEl.textContent = '—';
      if (propsListEl) propsListEl.innerHTML = '';
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

    // Construir gráficos
    function buildChart(canvasId, values, labels){
      const el = document.getElementById(canvasId);
      if (!el) return;
      const ctx = el.getContext('2d');

      if (canvasId === 'chart-area' && chartArea){ chartArea.destroy(); chartArea = null; }
      if (canvasId === 'chart-areaverd' && chartAreaVerd){ chartAreaVerd.destroy(); chartAreaVerd = null; }

      const cfg = {
        type: 'pie',
        data: { labels, datasets: [{ data: values, borderWidth: 1, backgroundColor: [
          '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
          '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
          '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
          '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
          '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
        ]}] },
        options: { plugins: { legend: { position: 'bottom' } } }
      };

      const chart = new Chart(ctx, cfg);
      if (canvasId === 'chart-area') chartArea = chart;
      if (canvasId === 'chart-areaverd') chartAreaVerd = chart;
    }

    const labels = contributions.map(c => c.id);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    buildChart('chart-area', valuesArea, labels);
    buildChart('chart-areaverd', valuesAreaVerd, labels);
  }

  window.webmapStats = { updateStats, contributions: [] };

  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");
    const sortAreaBtn = document.getElementById("sort-area");
    const sortGreenBtn = document.getElementById("sort-areaverd");

    if (!btn || !panel) return;

    // Abrir painel
    function openPanel() {
      panel.classList.remove('hidden');
      window.webmapStats.updateStats();
    }

    // Fechar painel
    function closePanel() {
      panel.classList.add('hidden');
    }

    // Toggle botão
    btn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        window.webmapStats.updateStats();
      }
    });

    // Fechar botão X
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    // Fechar clicando fora
    document.addEventListener('click', (event) => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) {
        closePanel();
      }
    });

    // Ordenação
    if(sortAreaBtn) sortAreaBtn.addEventListener('click', () => window.webmapStats.updateStats('area'));
    if(sortGreenBtn) sortGreenBtn.addEventListener('click', () => window.webmapStats.updateStats('areaverd'));

    // Inicialmente escondido
    panel.classList.add('hidden');
  });

})();
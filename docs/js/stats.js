// js/stats.js — versão completa, sem JSON externo
(function(){

  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // ===== Encontrar grupo "Propriedades Aderidas" =====
  function findPropriedadesAderidasGroup(map){
    if (!map || typeof map.eachLayer !== 'function') return null;
    
    if (window.PropriedadesAderidasLayerGroup) return window.PropriedadesAderidasLayerGroup;

    let groupFound = null;
    map.eachLayer(layer => {
      if (layer && layer.groupName === 'Propriedades Aderidas') groupFound = layer;
    });

    if (!groupFound && window.overlayMaps && window.overlayMaps['Propriedades Aderidas'])
      groupFound = window.overlayMaps['Propriedades Aderidas'];

    return groupFound;
  }

  // ===== Encontrar todas as camadas do grupo =====
  function findTargetLayers(map){
    const group = findPropriedadesAderidasGroup(map);
    if (!group) return [];

    const groupLayers = typeof group.getLayers === 'function' ? group.getLayers() : Object.values(group._layers || {});
    const foundLayers = [];

    groupLayers.forEach(layer => {
      let layerId = null;
      if (layer.layerName) {
        const m = layer.layerName.match(/layer_(\d+)_/);
        if (m) layerId = m[1];
      }
      if (!layerId && layer.feature && layer.feature.properties && layer.feature.properties.id)
        layerId = String(layer.feature.properties.id);

      foundLayers.push({ layer, id: layerId || 'unknown' });
    });

    return foundLayers;
  }

  let chartArea = null, chartAreaVerd = null;
  let lastContributions = [];

  function updateStats(){
    const map = window.map || window._map || null;
    const targetLayers = findTargetLayers(map);

    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    if (targetLayers.length === 0){
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (totalAreaEl) totalAreaEl.textContent = '—';
      if (totalGreenEl) totalGreenEl.textContent = '—';
      return;
    }

    let totalArea = 0, totalAreaVerd = 0;
    const contributions = [];

    targetLayers.forEach(({layer, id}) => {
      let props = {};

      if (layer.feature && layer.feature.properties) props = layer.feature.properties;
      else if (layer.options && layer.options.properties) props = layer.options.properties;
      else if (layer._layers) {
        const layers = Object.values(layer._layers);
        for (let sub of layers) {
          if (sub.feature && sub.feature.properties) {
            props = sub.feature.properties;
            break;
          }
        }
      }

      const name = props.nome || props.name || `Propriedade ${id}`;
      const area = parseNumber(props['Área'] || props['Area'] || props.area || 0);
      const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['areaverd'] || 0);

      totalArea += area;
      totalAreaVerd += areaVerd;

      contributions.push({ name, area, areaverd: areaVerd });
    });

    if (totalPropsEl) totalPropsEl.textContent = String(targetLayers.length);
    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(c => {
        const li = document.createElement('li');
        li.textContent = `${c.name} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
        propsListEl.appendChild(li);
      });
    }

    lastContributions = contributions.slice();

    function buildChart(canvasId, values, labels){
      const el = document.getElementById(canvasId);
      if (!el) return null;
      const ctx = el.getContext('2d');

      if (canvasId === 'chart-area' && chartArea){ chartArea.destroy(); chartArea=null; }
      if (canvasId === 'chart-areaverd' && chartAreaVerd){ chartAreaVerd.destroy(); chartAreaVerd=null; }

      const cfg = {
        type: 'pie',
        data: { labels, datasets: [{ data: values, borderWidth: 1, backgroundColor: [
          '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
          '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
          '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
          '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
          '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
        ]}]},
        options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed.toLocaleString('pt-BR') } } } }
      };

      const c = new Chart(ctx, cfg);
      if (canvasId === 'chart-area') chartArea = c;
      if (canvasId === 'chart-areaverd') chartAreaVerd = c;
      return c;
    }

    const labels = contributions.map(c => c.name);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    const allZeroA = valuesArea.every(v => v === 0);
    const allZeroV = valuesAreaVerd.every(v => v === 0);

    buildChart('chart-area', allZeroA ? labels.map(() => 1) : valuesArea, labels);
    buildChart('chart-areaverd', allZeroV ? labels.map(() => 1) : valuesAreaVerd, labels);
  }

  function sortBy(mode){
    if (!lastContributions || lastContributions.length === 0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') arr.sort((a,b) => b.areaverd - a.areaverd);
    else arr.sort((a,b) => b.area - a.area);

    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML = '';
    arr.forEach(c => {
      const li = document.createElement('li');
      li.textContent = `${c.name} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
      propsListEl.appendChild(li);
    });
  }

  window.webmapStats = { updateStats, sortBy };

  // ===== Painel =====
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");
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

    btn.addEventListener('click', () => {
      const computed = getComputedStyle(panel).display;
      if (computed === 'none') openPanel(); else closePanel();
    });

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    document.addEventListener('click', event => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) closePanel();
    });

    panel.classList.add('hidden');
    setTimeout(() => window.webmapStats.updateStats(), 500);
  });

})();



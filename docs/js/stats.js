(function(){

  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Pega todas as camadas do mapa com feature.properties
  function getAllMapFeatures(map) {
    const layers = [];
    map.eachLayer(layer => {
      if (layer.feature && layer.feature.properties && layer.feature.properties['Área'] !== undefined) {
        layers.push(layer);
      } else if (layer._layers) {
        for (const l of Object.values(layer._layers)) {
          if (l.feature && l.feature.properties && l.feature.properties['Área'] !== undefined) {
            layers.push(l);
          }
        }
      }
    });
    return layers;
  }

  let lastContributions = [];

  function updateStats(){
    const map = window.map || window._map || null;
    if (!map) return;

    const targetLayers = getAllMapFeatures(map);

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

    targetLayers.forEach(layer => {
      const props = layer.feature.properties;
      const name = props.nome || props.name || `Propriedade ${props.id || ''}`;

      const area = parseNumber(props['Área'] || props['Area'] || 0);
      const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['area_verd'] || 0);

      totalArea += area;
      totalAreaVerd += areaVerd;

      contributions.push({ name, area, areaverd: areaVerd });
    });

    if (totalPropsEl) totalPropsEl.textContent = targetLayers.length;
    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(c=>{
        const li = document.createElement('li');
        li.textContent = `${c.name} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
        propsListEl.appendChild(li);
      });
    }

    lastContributions = contributions.slice();
  }

  function sortBy(mode){
    if (!lastContributions || lastContributions.length === 0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') arr.sort((a,b) => b.areaverd - a.areaverd);
    else arr.sort((a,b) => b.area - a.area);

    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML = '';
    arr.forEach(c=>{
      const li = document.createElement('li');
      li.textContent = `${c.name} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
      propsListEl.appendChild(li);
    });
  }

  window.webmapStats = { updateStats, sortBy };

  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

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

    if (btn) btn.addEventListener('click', () => {
      const computed = getComputedStyle(panel).display;
      if (computed === 'none') openPanel(); else closePanel();
    });
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    document.addEventListener('click', (event) => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) closePanel();
    });

    panel.classList.add('hidden');
    setTimeout(() => window.webmapStats.updateStats(), 1000);
  });

})();




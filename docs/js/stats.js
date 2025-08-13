// js/stats.js — versão com controle do botão Estatísticas integrado
(function(){
  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function findLayerGroup(map, expectedName){
    if (window.PropriedadesAderidasLayerGroup) return window.PropriedadesAderidasLayerGroup;
    let found = null;
    if (!map || typeof map.eachLayer !== 'function') return null;
    map.eachLayer(function(l){ if (l && l.groupName && l.groupName === expectedName) found = l; });
    if (found) return found;
    if (window.overlayMaps){ for (const k in window.overlayMaps){ if (k === expectedName) return window.overlayMaps[k]; }}

    let candidate = null;
    map.eachLayer(function(l){ 
      if (l && typeof l.getLayers === 'function'){ 
        const layers = l.getLayers(); 
        if (layers && layers.length>0){ 
          const first = layers[0]; 
          if (first && first.feature && first.feature.properties) candidate = l; 
        } 
      } 
    });
    return candidate;
  }

  let chartArea = null, chartAreaVerd = null;
  let lastContributions = [];

  function updateStats(){
    const map = window.map || window._map || null;
    const group = findLayerGroup(map, 'Propriedades Aderidas');

    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    const layerCountEl = document.getElementById('layer-count');
    const areaTotalEl = document.getElementById('area-total');
    const areaverdTotalEl = document.getElementById('areaverd-total');

    if (!group){
      if (layerCountEl) layerCountEl.textContent = 'Grupo "Propriedades Aderidas" não encontrado.';
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (areaTotalEl) areaTotalEl.textContent = '—';
      if (areaverdTotalEl) areaverdTotalEl.textContent = '—';
      return;
    }

    let layers = [];
    if (typeof group.getLayers === 'function') layers = group.getLayers();
    else if (group._layers) layers = Object.values(group._layers);

    if (layerCountEl) layerCountEl.textContent = 'Camadas no grupo: ' + layers.length;
    if (totalPropsEl) totalPropsEl.textContent = String(layers.length);

    let totalArea = 0, totalAreaVerd = 0;
    const contributions = [];

    layers.forEach(function(layer){
      const props = (layer.feature && layer.feature.properties) ? layer.feature.properties : (layer.options && layer.options.properties ? layer.options.properties : {});
      const name = props.nome || props.Nome || props.name || props.id || ('feature-' + (Math.random()*10000|0));
      const a = parseNumber(props['Área'] || props['Area'] || props.area || props['AREA']);
      const av = parseNumber(props['Área Verd'] || props['Area Verd'] || props['ÁreaVerd'] || props['area_verd'] || props['areaverd'] || props['Área_Verd']);
      totalArea += a; 
      totalAreaVerd += av;
      contributions.push({ name: String(name), area: a, areaverd: av });
    });

    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (areaverdTotalEl) areaverdTotalEl.textContent = totalAreaVerd.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(function(c){
        const li = document.createElement('li');
        li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR');
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
        data: { labels: labels, datasets: [{ data: values, borderWidth: 1 }] },
        options: { plugins:{ legend:{ position:'bottom' }, tooltip:{ callbacks:{ label: function(ctx){ return ctx.label + ': ' + ctx.parsed.toLocaleString('pt-BR'); } } } } }
      };

      const c = new Chart(ctx, cfg);
      if (canvasId === 'chart-area') chartArea = c;
      if (canvasId === 'chart-areaverd') chartAreaVerd = c;
      return c;
    }

    const labels = contributions.map(c=>c.name);
    const valuesArea = contributions.map(c=>c.area);
    const valuesAreaVerd = contributions.map(c=>c.areaverd);

    const allZeroA = valuesArea.every(v=>v===0);
    const allZeroV = valuesAreaVerd.every(v=>v===0);

    buildChart('chart-area', allZeroA ? labels.map(()=>1) : valuesArea, labels);
    buildChart('chart-areaverd', allZeroV ? labels.map(()=>1) : valuesAreaVerd, labels);
  }

  function sortBy(mode){
    if (!lastContributions || lastContributions.length===0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') arr.sort((a,b)=>b.areaverd - a.areaverd);
    else arr.sort((a,b)=>b.area - a.area);
    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML = '';
    arr.forEach(function(c){ 
      const li = document.createElement('li'); 
      li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR'); 
      propsListEl.appendChild(li); 
    });
  }

  window.webmapStats = { updateStats: updateStats, sortBy: sortBy };

  // === substituição robusta do bloco DOMContentLoaded ===
  document.addEventListener('DOMContentLoaded', function(){
    // botão de abrir/fechar painel (robusto)
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    function openPanel() {
      if (!panel) return;
      panel.classList.remove('hidden');
      // remove qualquer display inline que force ocultação
      panel.style.removeProperty('display');
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      panel.style.zIndex = panel.style.zIndex || '99999';
      // atualiza estatísticas logo após abrir (pequeno timeout para aliviar concorrência)
      if (window.webmapStats && typeof window.webmapStats.updateStats === 'function') {
        setTimeout(() => window.webmapStats.updateStats(), 50);
      }
    }

    function closePanel() {
      if (!panel) return;
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }

    if (!btn || !panel) {
      console.warn('[stats] btn ou panel não encontrados no DOM.');
      return;
    }

    btn.addEventListener('click', function () {
      const computed = getComputedStyle(panel).display;
      if (computed === 'none') openPanel(); else closePanel();
      console.log('Clique registrado — estado agora:', getComputedStyle(panel).display);
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closePanel);
    }

    // primeira atualização automática (após o mapa carregar)
    setTimeout(function(){ 
      if (window.webmapStats && typeof window.webmapStats.updateStats === 'function') {
        window.webmapStats.updateStats();
      }
    }, 800);
  });
  // === fim da substituição ===

})();

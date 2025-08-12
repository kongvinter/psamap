// Estatísticas (js/stats.js) — versão adaptada para coexistir com o HTML do usuário
// O script procura por um LayerGroup chamado "Propriedades Aderidas" (heurísticas) e atualiza
// tanto os elementos de interface originais do usuário (total-props, total-area, total-green, props-list)
// quanto os elementos compatíveis com a versão anterior (layer-count, area-total, areaverd-total, chart-area, chart-areaverd).

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

    // heurística genérica
    let candidate = null;
    map.eachLayer(function(l){ if (l && typeof l.getLayers === 'function'){ const layers = l.getLayers(); if (layers && layers.length>0){ const first = layers[0]; if (first && first.feature && first.feature.properties) candidate = l; } } });
    return candidate;
  }

  // Chart instances
  let chartArea = null, chartAreaVerd = null;

  // lista cacheada para ordenação
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
      totalArea += a; totalAreaVerd += av;
      contributions.push({ name: String(name), area: a, areaverd: av });
    });

    // atualiza textos (convertendo para hectares se necessário)
    // Supondo que os valores já estão em hectares; se estiverem em m², converta: value/10000
    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (areaverdTotalEl) areaverdTotalEl.textContent = totalAreaVerd.toLocaleString('pt-BR');
    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (totalAreaEl && totalAreaEl.id === 'total-area') totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (totalAreaEl && document.getElementById('total-area')) document.getElementById('total-area').textContent = totalArea.toLocaleString('pt-BR');
    if (document.getElementById('total-green')) document.getElementById('total-green').textContent = totalAreaVerd.toLocaleString('pt-BR');

    // popular lista simples
    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(function(c){
        const li = document.createElement('li');
        li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR');
        propsListEl.appendChild(li);
      });
    }

    // salvar para ordenação externa
    lastContributions = contributions.slice();

    // gerar gráficos (Chart.js)
    function buildChart(canvasId, values, labels){
      const el = document.getElementById(canvasId);
      if (!el) return null;
      const ctx = el.getContext('2d');
      try{ if (canvasId === 'chart-area' && chartArea){ chartArea.destroy(); chartArea=null;} }
      catch(e){}
      try{ if (canvasId === 'chart-areaverd' && chartAreaVerd){ chartAreaVerd.destroy(); chartAreaVerd=null;} }
      catch(e){}

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

    // Se todos zeros, gera fatias iguais para visualização
    const allZeroA = valuesArea.every(v=>v===0);
    const allZeroV = valuesAreaVerd.every(v=>v===0);

    buildChart('chart-area', allZeroA ? labels.map(()=>1) : valuesArea, labels);
    buildChart('chart-areaverd', allZeroV ? labels.map(()=>1) : valuesAreaVerd, labels);

  }

  // função de ordenação exposta
  function sortBy(mode){
    if (!lastContributions || lastContributions.length===0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') arr.sort((a,b)=>b.areaverd - a.areaverd);
    else arr.sort((a,b)=>b.area - a.area);
    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML = '';
    arr.forEach(function(c){ const li = document.createElement('li'); li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR'); propsListEl.appendChild(li); });
  }

  // expose
  window.webmapStats = { updateStats: updateStats, sortBy: sortBy };

  // auto-update após DOM carregado (mas antes de abrir o painel) — se o mapa e camadas já existirem
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){ if (window.webmapStats && typeof window.webmapStats.updateStats === 'function') window.webmapStats.updateStats(); }, 800);
  });

})();
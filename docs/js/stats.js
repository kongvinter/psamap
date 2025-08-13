// js/stats.js — versão adaptada para JSON unificado
(function(){

  // ===== Funções auxiliares =====
  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  let chartArea = null, chartAreaVerd = null;
  let lastContributions = [];

  // ===== Carrega todas as camadas a partir do JSON =====
  function loadAllLayers(callback){
    fetch('data/all_layers.json')
      .then(response => {
        if(!response.ok) throw new Error('Falha ao carregar o JSON');
        return response.json();
      })
      .then(data => {
        const layers = [];
        for(const layerId in data){
          const props = data[layerId];

          // Cria camada Leaflet GeoJSON
          const layer = L.geoJSON(props.coords ? props : props, {
            onEachFeature: function(feature, l){
              l.feature = feature; // compatibilidade com stats
            },
            properties: props
          });

          layer.layerName = `layer_${layerId}`;
          layers.push({ layer, id: layerId });
        }
        callback(layers);
      })
      .catch(err => console.error('[stats] Erro ao carregar camadas JSON:', err));
  }

  // ===== Processa camadas para estatísticas =====
  function processLayers(targetLayers){
    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');
    const layerCountEl = document.getElementById('layer-count');
    const areaTotalEl = document.getElementById('area-total');
    const areaverdTotalEl = document.getElementById('areaverd-total');

    if (targetLayers.length === 0){
      if (layerCountEl) layerCountEl.textContent = 'Nenhuma camada encontrada.';
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (areaTotalEl) areaTotalEl.textContent = '—';
      if (areaverdTotalEl) areaverdTotalEl.textContent = '—';
      return;
    }

    if (layerCountEl) layerCountEl.textContent = 'Camadas encontradas: ' + targetLayers.length;
    if (totalPropsEl) totalPropsEl.textContent = String(targetLayers.length);

    let totalArea = 0, totalAreaVerd = 0;
    const contributions = [];

    targetLayers.forEach(function(layerInfo){
      const layer = layerInfo.layer;
      const id = layerInfo.id;
      const props = layer.feature && layer.feature.properties ? layer.feature.properties : (layer.options ? layer.options.properties : {});
      
      const name = props.nome || props.name || `Propriedade ${id}`;
      const area = parseNumber(props['Área'] || props['Area'] || props.area || 0);
      const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['areaverd'] || 0);

      totalArea += area;
      totalAreaVerd += areaVerd;
      contributions.push({ name, area, areaverd: areaVerd });
    });

    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (areaverdTotalEl) areaverdTotalEl.textContent = totalAreaVerd.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR');
        propsListEl.appendChild(li);
      });
    }

    lastContributions = contributions.slice();

    // ===== Criação dos gráficos =====
    function buildChart(canvasId, values, labels){
      const el = document.getElementById(canvasId);
      if (!el) return null;
      const ctx = el.getContext('2d');

      if (canvasId === 'chart-area' && chartArea){ chartArea.destroy(); chartArea=null; }
      if (canvasId === 'chart-areaverd' && chartAreaVerd){ chartAreaVerd.destroy(); chartAreaVerd=null; }

      const cfg = {
        type: 'pie',
        data: { 
          labels: labels, 
          datasets: [{ 
            data: values, 
            borderWidth: 1,
            backgroundColor: [
              '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
              '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
              '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
              '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
              '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
            ]
          }] 
        },
        options: { 
          plugins: { 
            legend: { position: 'bottom' }, 
            tooltip: { 
              callbacks: { 
                label: function(ctx) { 
                  return ctx.label + ': ' + ctx.parsed.toLocaleString('pt-BR'); 
                } 
              } 
            } 
          } 
        }
      };

      const c = new Chart(ctx, cfg);
      if (canvasId === 'chart-area') chartArea = c;
      if (canvasId === 'chart-areaverd') chartAreaVerd = c;
      return c;
    }

    const labels = contributions.map(c => c.name);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    buildChart('chart-area', valuesArea.every(v => v===0) ? labels.map(() => 1) : valuesArea, labels);
    buildChart('chart-areaverd', valuesAreaVerd.every(v => v===0) ? labels.map(() => 1) : valuesAreaVerd, labels);
  }

  // ===== Ordena a lista de propriedades =====
  function sortBy(mode){
    if (!lastContributions || lastContributions.length === 0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') arr.sort((a,b) => b.areaverd - a.areaverd);
    else arr.sort((a,b) => b.area - a.area);
    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML = '';
    arr.forEach(function(c){ 
      const li = document.createElement('li'); 
      li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR'); 
      propsListEl.appendChild(li); 
    });
  }

  window.webmapStats = { updateStats: function(){ loadAllLayers(processLayers); }, sortBy: sortBy };

  // ===== Controle do painel =====
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    if (!btn || !panel) return;

    function openPanel() {
      panel.classList.remove('hidden');
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      panel.style.zIndex = '1001';
      if (window.webmapStats) setTimeout(() => window.webmapStats.updateStats(), 50);
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

    panel.classList.add('hidden');
    setTimeout(() => { if (window.webmapStats) window.webmapStats.updateStats(); }, 1000);
  });

})();
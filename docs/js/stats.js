// js/stats.js — versão atualizada para capturar camadas numeradas específicas
(function(){

  // ===== Funções auxiliares =====
  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Lista das camadas numeradas que queremos capturar
  const targetLayerIds = [
    '143292', '33782', '6170', '84347', '151959', '39859', '71398', '43918',
    '143293', '6169', '84344', '84345', '79199', '14779', '7859', '92556',
    '103699', '81', '14780', '104089', '79197', '151005', '171295', '116124'
  ];

  // Função para encontrar as camadas numeradas específicas
  function findTargetLayers(map){
    if (!map || typeof map.eachLayer !== 'function') return [];
    
    const foundLayers = [];
    
    map.eachLayer(function(layer){
      if (layer && layer.layerName) {
        // Extrai o número da camada do nome (ex: layer_116124_8 -> 116124)
        const layerMatch = layer.layerName.match(/layer_(\d+)_/);
        if (layerMatch) {
          const layerId = layerMatch[1];
          if (targetLayerIds.includes(layerId)) {
            foundLayers.push({
              layer: layer,
              id: layerId
            });
          }
        }
      }
    });
    
    return foundLayers;
  }

  let chartArea = null, chartAreaVerd = null;
  let lastContributions = [];

  // ===== Atualiza estatísticas =====
  function updateStats(){
    const map = window.map || window._map || null;
    const targetLayers = findTargetLayers(map);

    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    const layerCountEl = document.getElementById('layer-count');
    const areaTotalEl = document.getElementById('area-total');
    const areaverdTotalEl = document.getElementById('areaverd-total');

    if (targetLayers.length === 0){
      if (layerCountEl) layerCountEl.textContent = 'Nenhuma camada numerada encontrada.';
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
      
      // Busca as propriedades nas features da camada
      let props = {};
      
      if (layer.feature && layer.feature.properties) {
        props = layer.feature.properties;
      } else if (layer.options && layer.options.properties) {
        props = layer.options.properties;
      } else if (layer._layers) {
        // Se a camada tem subcamadas, pega a primeira feature encontrada
        const layers = Object.values(layer._layers);
        if (layers.length > 0 && layers[0].feature && layers[0].feature.properties) {
          props = layers[0].feature.properties;
        }
      }

      const name = props.id || id; // Usa o ID da propriedade ou o ID da camada
      const area = parseNumber(props['Área'] || props['Area'] || props.area || props['AREA'] || 0);
      const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['ÁreaVerd'] || props['area_verd'] || props['areaverd'] || props['Área_Verd'] || 0);
      
      totalArea += area; 
      totalAreaVerd += areaVerd;
      contributions.push({ 
        name: String(name), 
        area: area, 
        areaverd: areaVerd 
      });
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

    const allZeroA = valuesArea.every(v => v === 0);
    const allZeroV = valuesAreaVerd.every(v => v === 0);

    buildChart('chart-area', allZeroA ? labels.map(() => 1) : valuesArea, labels);
    buildChart('chart-areaverd', allZeroV ? labels.map(() => 1) : valuesAreaVerd, labels);

    console.log('Stats updated:', {
      totalLayers: targetLayers.length,
      totalArea: totalArea,
      totalAreaVerd: totalAreaVerd,
      contributions: contributions
    });
  }

  function sortBy(mode){
    if (!lastContributions || lastContributions.length === 0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') {
      arr.sort((a,b) => b.areaverd - a.areaverd);
    } else {
      arr.sort((a,b) => b.area - a.area);
    }
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

  // ===== Controle do painel (abertura/fechamento) =====
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    if (!btn || !panel) {
      console.warn('[stats] btn ou panel não encontrados no DOM.');
      return;
    }

    // Funções de abrir e fechar painel
    function openPanel() {
      panel.classList.remove('hidden');
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
      panel.style.zIndex = '1001';
      if (window.webmapStats && typeof window.webmapStats.updateStats === 'function') {
        setTimeout(() => window.webmapStats.updateStats(), 50);
      }
    }

    function closePanel() {
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }

    // Botão principal alterna abrir/fechar
    btn.addEventListener('click', function () {
      const computed = getComputedStyle(panel).display;
      if (computed === 'none') openPanel(); else closePanel();
    });

    // Botão interno fecha painel
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    // Fecha ao clicar fora do painel
    document.addEventListener('click', (event) => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) {
        closePanel();
      }
    });

    // Inicializa painel oculto
    panel.classList.add('hidden');

    // Atualização inicial de estatísticas
    setTimeout(function(){ 
      if (window.webmapStats && typeof window.webmapStats.updateStats === 'function') {
        window.webmapStats.updateStats();
      }
    }, 1000); // Aumentei o timeout para dar tempo das camadas carregarem
  });
})();
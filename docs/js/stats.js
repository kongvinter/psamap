/// js/stats.js — versão completa para carregar camadas e gerar stats
(function(){

  // ===== Funções auxiliares =====
  function parseNumber(v){
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Lista das camadas numeradas alvo
  const targetLayerIds = [
    '143292','33782','6170','84347','151959','39859','71398','43918',
    '143293','6169','84344','84345','79199','14779','7859','92556',
    '103699','81','14780','104089','79197','151005','171295','116124'
  ];

  // Lista de arquivos JS das camadas
  const layerFiles = [
    '103699_15.js','104089_12.js','116124_8.js','143292_31.js','143293_23.js',
    '14779_18.js','14780_13.js','151005_10.js','151959_27.js','171295_9.js',
    '33782_30.js','39859_26.js','43918_24.js','6169_22.js','6170_29.js',
    '71398_25.js','7859_17.js','79197_11.js','79199_19.js','81_14.js',
    '84344_21.js','84345_20.js','84347_28.js','92556_16.js'
  ];

  // ===== Cria grupo Propriedades Aderidas =====
  window.PropriedadesAderidasLayerGroup = L.layerGroup();
  if (window.map) window.map.addLayer(window.PropriedadesAderidasLayerGroup);

  // ===== Carrega arquivos JS dinamicamente da pasta /data/ =====
  layerFiles.forEach(file => {
    const script = document.createElement('script');
    script.src = '/data/' + file; // <--- pasta ajustada
    document.head.appendChild(script);

    script.onload = () => {
      const varName = 'layer' + file.replace('.js',''); // assume var layer103699_15
      const layer = window[varName];
      if (layer) window.PropriedadesAderidasLayerGroup.addLayer(layer);
    };
  });

  // ===== Função para capturar camadas alvo do grupo =====
  function findTargetLayers(){
    const group = window.PropriedadesAderidasLayerGroup;
    if (!group) return [];

    const foundLayers = [];
    group.eachLayer(layer => {
      let layerId = null;

      // Tenta capturar ID do layerName
      if (layer.layerName) {
        const match = layer.layerName.match(/(\d+)_\d+/);
        if (match) layerId = match[1];
      }

      // Tenta capturar ID de options.dataVar
      if (!layerId && layer.options && layer.options.dataVar) {
        const match2 = layer.options.dataVar.match(/(\d+)_\d+/);
        if (match2) layerId = match2[1];
      }

      // Tenta capturar ID de feature.properties
      if (!layerId && layer.feature && layer.feature.properties && layer.feature.properties.id) {
        layerId = String(layer.feature.properties.id);
      }

      if (layerId && targetLayerIds.includes(layerId)) {
        foundLayers.push({ layer: layer, id: layerId });
      }
    });

    return foundLayers;
  }

  // ===== Estatísticas e gráficos =====
  let chartArea = null, chartAreaVerd = null;
  let lastContributions = [];

  function updateStats(){
    const targetLayers = findTargetLayers();
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

    targetLayers.forEach(({layer, id}) => {
      let props = {};
      if (layer.feature && layer.feature.properties) props = layer.feature.properties;
      else if (layer.options && layer.options.properties) props = layer.options.properties;
      else if (layer._layers) {
        const subLayers = Object.values(layer._layers);
        for (let sub of subLayers) {
          if (sub.feature && sub.feature.properties) {
            props = sub.feature.properties;
            break;
          }
        }
      }

      const name = props.nome || props.name || `Propriedade ${id}`;
      const area = parseNumber(props['Área'] || props['Area'] || props.area || props['AREA'] || 0);
      const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['ÁreaVerd'] || props['area_verd'] || props['areaverd'] || props['Área_Verd'] || 0);

      totalArea += area;
      totalAreaVerd += areaVerd;
      contributions.push({ name, area, areaverd: areaVerd });
    });

    if (areaTotalEl) areaTotalEl.textContent = totalArea.toLocaleString('pt-BR');
    if (areaverdTotalEl) areaverdTotalEl.textContent = totalAreaVerd.toLocaleString('pt-BR');
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
        data: { labels, datasets:[{ data: values, borderWidth:1, backgroundColor:[
          '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FECA57','#FF9FF3','#54A0FF',
          '#5F27CD','#00D2D3','#FF9F43','#EE5A6F','#0ABDE3','#10AC84','#F79F1F',
          '#A3CB38','#FD79A8','#6C5CE7','#A29BFE','#FD79A8','#FDCB6E','#E17055',
          '#81ECEC','#74B9FF','#00B894','#E84393'
        ]}]},
        options: {
          plugins:{
            legend:{ position:'bottom' },
            tooltip:{
              callbacks:{
                label: function(ctx){ return ctx.label + ': ' + ctx.parsed.toLocaleString('pt-BR'); }
              }
            }
          }
        }
      };

      const c = new Chart(ctx, cfg);
      if (canvasId==='chart-area') chartArea=c;
      if (canvasId==='chart-areaverd') chartAreaVerd=c;
      return c;
    }

    const labels = contributions.map(c => c.name);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    buildChart('chart-area', valuesArea.every(v=>v===0)?labels.map(()=>1):valuesArea, labels);
    buildChart('chart-areaverd', valuesAreaVerd.every(v=>v===0)?labels.map(()=>1):valuesAreaVerd, labels);
  }

  function sortBy(mode){
    if (!lastContributions || lastContributions.length===0) return;
    const arr = lastContributions.slice();
    if (mode==='areaverd') arr.sort((a,b)=>b.areaverd - a.areaverd);
    else arr.sort((a,b)=>b.area - a.area);
    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML='';
    arr.forEach(c => {
      const li = document.createElement('li');
      li.textContent = `${c.name} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
      propsListEl.appendChild(li);
    });
  }

  window.webmapStats = { updateStats, sortBy };

  // ===== Painel DOM =====
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    if (!btn || !panel) return;

    function openPanel(){
      panel.classList.remove('hidden');
      panel.style.display='block';
      panel.style.visibility='visible';
      panel.style.zIndex='1001';
      setTimeout(()=>window.webmapStats.updateStats(), 200);
    }

    function closePanel(){
      panel.classList.add('hidden');
      panel.style.display='none';
    }

    btn.addEventListener('click', ()=>{
      const computed = getComputedStyle(panel).display;
      if (computed==='none') openPanel(); else closePanel();
    });

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    document.addEventListener('click', (event)=>{
      if (!panel.contains(event.target) && !btn.contains(event.target)) closePanel();
    });

    panel.classList.add('hidden');
    setTimeout(()=>window.webmapStats.updateStats(), 2000); // espera scripts carregarem
  });

})();
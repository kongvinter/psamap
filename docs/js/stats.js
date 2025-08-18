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
        if (id && !seenIds.has(id) && 
            ('Área' in props || 'Area' in props || 'AREA' in props) && 
            ('Área Verd' in props || 'Area Verd' in props || 'AREA_VERD' in props)) {
          layers.push(layer);
          seenIds.add(id);
        }
      }
      if (layer._layers) Object.values(layer._layers).forEach(traverse);
    }

    map.eachLayer(traverse);
    return layers;
  }

  function findLayerById(map, targetId){
    let found = null;
    function traverse(layer){
      if (!layer || found) return;
      if (layer.feature && layer.feature.properties) {
        const props = layer.feature.properties;
        const id = props.id || props.name;
        if (id !== undefined && String(id) === String(targetId)) {
          found = layer;
          return;
        }
      }
      if (layer._layers) Object.values(layer._layers).forEach(traverse);
    }
    map.eachLayer(traverse);
    return found;
  }

  function focusOnLayer(map, layer){
    if (!map || !layer) return;
    try {
      if (layer.getBounds && typeof layer.getBounds === 'function') {
        const bounds = layer.getBounds();
        if (bounds && bounds.isValid && bounds.isValid()) {
          map.fitBounds(bounds.pad(0.15), { maxZoom: 16 });
        } else {
          const center = bounds.getCenter ? bounds.getCenter() : null;
          if (center) map.setView(center, 14);
        }
      } else if (layer.getLatLng && typeof layer.getLatLng === 'function') {
        map.setView(layer.getLatLng(), 18);
      } else if (layer._latlng) {
        map.setView(layer._latlng, 18);
      } else if (layer.getCenter && typeof layer.getCenter === 'function') {
        map.setView(layer.getCenter(), 16);
      } else {
        map.setView(map.getCenter(), map.getZoom());
      }

      if (layer.setStyle) {
        const orig = layer._originalStyle || {...(layer.options || {})};
        try {
          layer.setStyle({ color: '#00FF00', weight: 4, fillOpacity: 0.35, fillColor: '#00FF00' });
        } catch(e){}
        setTimeout(() => {
          try { if (layer.setStyle && orig) layer.setStyle(orig); } catch(e){}
        }, 2000);
      }
    } catch(e){
      console.warn('Erro ao focar layer:', e);
    }
  }

  let chartArea = null, chartAreaVerd = null;
  let highlightedLayers = [];
  let contributions = [];

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

      const area = parseNumber(props['Área'] ?? props['Area'] ?? props['AREA']);
      const areaverd = parseNumber(props['Área Verd'] ?? props['Area Verd'] ?? props['AREA_VERD']);

      if (area > 0 || areaverd > 0) {
        contributions.push({ id, area, areaverd });
        seenIds.add(id);
        layersToHighlight.push(layer);
      }
    });

    // Cálculo de médias
    const totalProps = contributions.length;
    const totalArea = contributions.reduce((sum, c) => sum + c.area, 0);
    const totalGreen = contributions.reduce((sum, c) => sum + c.areaverd, 0);
    const avgAreaEl = document.getElementById('avg-area');
    const avgGreenEl = document.getElementById('avg-green');

    if(totalProps > 0) {
      avgAreaEl.innerHTML = `<strong>Área média:</strong> ${(totalArea / totalProps).toFixed(2)} ha`;
      avgGreenEl.innerHTML = `<strong>Média Área Verde:</strong> ${(totalGreen / totalProps).toFixed(2)} ha`;
    } else {
      avgAreaEl.innerHTML = `<strong>Área média:</strong> —`;
      avgGreenEl.innerHTML = `<strong>Média Área Verde:</strong> —`;
    }

    // Highlight das layers
    layersToHighlight.forEach(layer => {
      if (layer.setStyle) {
        if (!layer._originalStyle) layer._originalStyle = {...(layer.options || {})};
        try {
          layer.setStyle({ color:'#FF0000', weight:3, fillColor:'#FF0000', fillOpacity:0.3 });
        } catch(e){}
        highlightedLayers.push(layer);
      }
    });

    // Ordenar
    if(orderBy === 'area') contributions.sort((a,b) => b.area - a.area);
    else if(orderBy === 'areaverd') contributions.sort((a,b) => b.areaverd - a.areaverd);

    // Atualizar painel
    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    if (contributions.length === 0){
      if (totalPropsEl) totalPropsEl.parentElement.style.display = 'none';
      if (totalAreaEl) totalAreaEl.parentElement.style.display = 'none';
      if (totalGreenEl) totalGreenEl.parentElement.style.display = 'none';
      if (propsListEl) propsListEl.innerHTML = '';
      if (chartArea){ chartArea.destroy(); chartArea=null; }
      if (chartAreaVerd){ chartAreaVerd.destroy(); chartAreaVerd=null; }
      window.webmapStats.contributions = [];
      return;
    }

    if (totalPropsEl) totalPropsEl.parentElement.style.display = '';
    if (totalAreaEl) totalAreaEl.parentElement.style.display = '';
    if (totalGreenEl) totalGreenEl.parentElement.style.display = '';

    const totalAreaSum = contributions.reduce((sum,c)=>sum+c.area,0);
    const totalGreenSum = contributions.reduce((sum,c)=>sum+c.areaverd,0);

    if (totalPropsEl) totalPropsEl.textContent = String(contributions.length);
    if (totalAreaEl) totalAreaEl.textContent = totalAreaSum.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalGreenSum.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(c=>{
        const li = document.createElement('li');
        li.textContent = `ID: ${c.id} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
        propsListEl.appendChild(li);
      });
    }

    // Construir gráficos
    function buildChart(canvasId, values, labels, chartRefName){
      const el = document.getElementById(canvasId);
      if (!el) return;
      const ctx = el.getContext('2d');

      if (chartRefName==='chart-area' && chartArea){ chartArea.destroy(); chartArea=null; }
      if (chartRefName==='chart-areaverd' && chartAreaVerd){ chartAreaVerd.destroy(); chartAreaVerd=null; }

      const cfg = {
        type:'pie',
        data:{ labels, datasets:[{ data: values, borderWidth:1, backgroundColor:[
          '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FECA57','#FF9FF3','#54A0FF','#5F27CD',
          '#00D2D3','#FF9F43','#EE5A6F','#0ABDE3','#10AC84','#F79F1F','#A3CB38','#FD79A8',
          '#6C5CE7','#A29BFE','#FD79A8','#FDCB6E','#E17055','#81ECEC','#74B9FF','#00B894','#E84393'
        ]}]},
        options:{
          plugins:{ legend:{ position:'bottom' } },
          onClick:function(evt){
            const points = this.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
            if (!points || points.length===0) return;
            const idx = points[0].index;
            const id = labels[idx];
            const map = window.map || window._map || null;
            if (!map) return;
            const layer = findLayerById(map,id);
            if(layer) focusOnLayer(map,layer);
          }
        }
      };

      const chart = new Chart(ctx,cfg);
      if(chartRefName==='chart-area') chartArea=chart;
      if(chartRefName==='chart-areaverd') chartAreaVerd=chart;
    }

    document.querySelectorAll('.expand-btn').forEach(btn=>{
      btn.addEventListener('click', function(){
        const targetId = this.getAttribute('data-target');
        const originalCanvas = document.getElementById(targetId);
        const overlay = document.createElement('div');
        overlay.className='chart-overlay';
        const newCanvas=document.createElement('canvas');
        overlay.appendChild(newCanvas);
        document.body.appendChild(overlay);

        const originalChart = Chart.getChart(originalCanvas);
        if(!originalChart) return;
        const data = JSON.parse(JSON.stringify(originalChart.data));
        const options = JSON.parse(JSON.stringify(originalChart.options));
        if(options.type==='pie'||options.type==='doughnut'){
          options.plugins = options.plugins || {};
          options.plugins.datalabels={ color:'#111' };
          options.plugins.tooltip={ enabled:true };
          options.elements=options.elements||{};
          options.elements.arc={ offset:12 };
        }
        new Chart(newCanvas,{ type: originalChart.config.type, data:data, options:options });
        overlay.addEventListener('click',()=>overlay.remove());
      });
    });

    const labels = contributions.map(c=>c.id);
    const valuesArea = contributions.map(c=>c.area);
    const valuesAreaVerd = contributions.map(c=>c.areaverd);
    buildChart('chart-area', valuesArea, labels, 'chart-area');
    buildChart('chart-areaverd', valuesAreaVerd, labels, 'chart-areaverd');

    window.webmapStats.contributions = contributions;
  }

  window.webmapStats={ updateStats, contributions: [] };

  document.addEventListener('DOMContentLoaded',function(){
    const btn=document.getElementById("stats-btn");
    const panel=document.getElementById("stats-panel");
    const closeBtn=document.getElementById("close-panel");
    const sortAreaBtn=document.getElementById("sort-total");
    const sortGreenBtn=document.getElementById("sort-green");
    if(!btn || !panel) return;

    btn.addEventListener('click',()=>{
      panel.classList.toggle('hidden');
      if(!panel.classList.contains('hidden')) window.webmapStats.updateStats();
    });
    if(closeBtn) closeBtn.addEventListener('click',()=>panel.classList.add('hidden'));
    if(sortAreaBtn) sortAreaBtn.addEventListener('click',()=>window.webmapStats.updateStats('area'));
    if(sortGreenBtn) sortGreenBtn.addEventListener('click',()=>window.webmapStats.updateStats('areaverd'));

    panel.classList.add('hidden');
  });

})();
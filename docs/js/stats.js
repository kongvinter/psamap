/// js/stats.js — Painel completo com Chart.js + D3.js
(function(){

  // ============================
  // Funções auxiliares
  // ============================
  function parseNumber(v){
    if (v===null || v===undefined) return 0;
    if (typeof v==='number') return v;
    const s = String(v).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
    const n = parseFloat(s);
    return isNaN(n)?0:n;
  }

  function formatarArea(valor){
    return valor.toLocaleString('pt-BR',{minimumFractionDigits:0})+' ha';
  }

  function getTargetLayers(map){
    const layers = [];
    const seenIds = new Set();
    function traverse(layer){
      if(!layer) return;
      if(layer.feature && layer.feature.properties){
        const props = layer.feature.properties;
        const id = props.id || props.name;
        if(id && !seenIds.has(id) && 'Área' in props && 'Área Verd' in props){
          layers.push(layer);
          seenIds.add(id);
        }
      }
      if(layer._layers) Object.values(layer._layers).forEach(traverse);
    }
    map.eachLayer(traverse);
    return layers;
  }

  // ============================
  // Variáveis globais
  // ============================
  let chartArea=null, chartAreaVerd=null;
  let highlightedLayers = [];
  let contributions = [];

  // ============================
  // Atualização de estatísticas
  // ============================
  function atualizarEstatisticas(dados){
    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');

    if(totalPropsEl) totalPropsEl.textContent = dados.totalProps;
    if(totalAreaEl) totalAreaEl.textContent = formatarArea(dados.totalArea);
    if(totalGreenEl) totalGreenEl.textContent = formatarArea(dados.totalGreen);
  }

  function atualizarListaPropriedades(lista){
    const ul = document.getElementById('props-list');
    if(!ul) return;
    ul.innerHTML='';
    lista.forEach(prop=>{
      const li = document.createElement('li');
      li.textContent = `${prop.nome} - Área: ${formatarArea(prop.areaTotal)} | Verde: ${formatarArea(prop.areaVerde)}`;
      ul.appendChild(li);
    });
  }

  // ============================
  // Chart.js
  // ============================
  function renderizarGrafico(idCanvas, labels, valores, cores){
    const ctx = document.getElementById(idCanvas);
    if(!ctx) return;
    const c = ctx.getContext('2d');
    if(!c) return;

    try { if(idCanvas==='chart-area' && chartArea) chartArea.destroy(); } catch(e){}
    try { if(idCanvas==='chart-areaverd' && chartAreaVerd) chartAreaVerd.destroy(); } catch(e){}

    const chart = new Chart(c,{
      type:'pie',
      data:{ labels, datasets:[{ data: valores, backgroundColor: cores }] },
      options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } }
    });

    if(idCanvas==='chart-area') chartArea = chart;
    if(idCanvas==='chart-areaverd') chartAreaVerd = chart;
  }

  // ============================
  // Treemap D3.js
  // ============================
  window._d3StatsBuild = function(contributions, orderBy){
    const containerId = 'treemap-container';
    const container = document.getElementById(containerId);
    if(!container) return;

    const width = container.clientWidth;
    const height = 300;

    d3.select(`#${containerId} svg`).remove();

    const svg = d3.select(`#${containerId}`)
                  .append("svg")
                  .attr("width", width)
                  .attr("height", height);

    const root = d3.hierarchy({children: contributions})
                   .sum(d=>d.area);

    d3.treemap()
      .size([width,height])
      .padding(4)(root);

    svg.selectAll("rect")
       .data(root.leaves())
       .join("rect")
       .attr("x", d=>d.x0)
       .attr("y", d=>d.y0)
       .attr("width", d=>d.x1-d.x0)
       .attr("height", d=>d.y1-d.y0)
       .attr("fill", "#69b3a2");

    svg.selectAll("text")
       .data(root.leaves())
       .join("text")
       .attr("x", d=>d.x0+4)
       .attr("y", d=>d.y0+14)
       .text(d=>d.data.id)
       .attr("font-size","12px")
       .attr("fill","#000");
  };

  // ============================
  // Atualização completa
  // ============================
  function updateStats(orderBy=null){
    const map = window.map || window._map || null;
    if(!map) return;

    const features = getTargetLayers(map);

    highlightedLayers.forEach(layer=>{
      if(layer._originalStyle && layer.setStyle) layer.setStyle(layer._originalStyle);
    });
    highlightedLayers = [];
    contributions=[];

    const seenIds = new Set();
    const layersToHighlight = [];

    features.forEach(layer=>{
      const props = layer.feature.properties;
      const id = props.id || props.name;
      if(!id || seenIds.has(id)) return;
      const area = parseNumber(props['Área']);
      const areaverd = parseNumber(props['Área Verd']);
      if(area>0 || areaverd>0){
        contributions.push({id, area, areaverd});
        seenIds.add(id);
        layersToHighlight.push(layer);
      }
    });

    layersToHighlight.forEach(layer=>{
      if(layer.setStyle){
        if(!layer._originalStyle) layer._originalStyle = {...layer.options};
        layer.setStyle({ color:'#FF0000', weight:3, fillColor:'#FF0000', fillOpacity:0.3 });
        highlightedLayers.push(layer);
      }
    });

    if(orderBy==='area') contributions.sort((a,b)=>b.area-a.area);
    if(orderBy==='areaverd') contributions.sort((a,b)=>b.areaverd-a.areaverd);

    const totalArea = contributions.reduce((s,c)=>s+c.area,0);
    const totalAreaVerd = contributions.reduce((s,c)=>s+c.areaverd,0);

    atualizarEstatisticas({ totalProps: contributions.length, totalArea, totalGreen: totalAreaVerd });

    const listaProps = contributions.map(c=>({nome:c.id, areaTotal:c.area, areaVerde:c.areaverd}));
    atualizarListaPropriedades(listaProps);

    const labels = contributions.map(c=>c.id);
    const valoresArea = contributions.map(c=>c.area);
    const valoresGreen = contributions.map(c=>c.areaverd);
    const cores = labels.map((_,i)=>`hsl(${i*35%360},60%,60%)`);
    renderizarGrafico('chart-area', labels, valoresArea, cores);
    renderizarGrafico('chart-areaverd', labels, valoresGreen, cores);

    if(window._d3StatsBuild) window._d3StatsBuild(contributions, orderBy);
  }

  window.webmapStats = { updateStats, contributions };

  // ============================
  // Painel e botões
  // ============================
  document.addEventListener('DOMContentLoaded',()=>{
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");
    const sortAreaBtn = document.getElementById("sort-area");
    const sortGreenBtn = document.getElementById("sort-areaverd");

    if(!btn||!panel) return;

    function openPanel(){
      panel.classList.remove('hidden');
      panel.style.display='block';
      panel.style.visibility='visible';
      panel.style.zIndex='1001';
      setTimeout(()=>window.webmapStats.updateStats(),50);
    }
    function closePanel(){
      panel.classList.add('hidden');
      panel.style.display='none';
    }

    btn.addEventListener('click',()=>{
      const d=getComputedStyle(panel).display;
      if(d==='none') openPanel(); else closePanel();
    });
    if(closeBtn) closeBtn.addEventListener('click',closePanel);
    document.addEventListener('click',(e)=>{
      if(!panel.contains(e.target)&&!btn.contains(e.target)) closePanel();
    });

    if(sortAreaBtn) sortAreaBtn.addEventListener('click',()=>window.webmapStats.updateStats('area'));
    if(sortGreenBtn) sortGreenBtn.addEventListener('click',()=>window.webmapStats.updateStats('areaverd'));

    panel.classList.add('hidden');
    setTimeout(()=>window.webmapStats.updateStats(),1000);
  });

})();
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

  // instâncias Chart.js (ou null)
  let chartArea = null, chartAreaVerd = null;
  let highlightedLayers = [];
  let contributions = []; // escopo global para usar nos botões

  function updateStats(orderBy = null){
    const map = window.map || window._map || null;
    if (!map) return;

    const features = getTargetLayers(map);

    // restaurar estilos previamente destacados
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

    // Atualizar painel descritivo
    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    if (contributions.length === 0){
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (totalAreaEl) totalAreaEl.textContent = '—';
      if (totalGreenEl) totalGreenEl.textContent = '—';
      if (propsListEl) propsListEl.innerHTML = '';
      // destruir gráficos Chart.js se existirem
      try { if (chartArea) { chartArea.destroy(); chartArea = null; } } catch(e){}
      try { if (chartAreaVerd) { chartAreaVerd.destroy(); chartAreaVerd = null; } } catch(e){}
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

    // ----------------- matrix usando Chart.js (scatter + pointStyle 'rect') -----------------
    // função utilitária para clarear cor
    function lightenColor(color, percent){
      const num = parseInt(String(color).replace("#",""),16);
      const amt = Math.round(255 * percent);
      let R = (num >> 16) + amt;
      let G = (num >> 8 & 0x00FF) + amt;
      let B = (num & 0x0000FF) + amt;
      R = Math.max(0, Math.min(255, R));
      G = Math.max(0, Math.min(255, G));
      B = Math.max(0, Math.min(255, B));
      return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    }

    // função que constrói um gráfico matrix com Chart.js
    function buildMatrixChartWithChartJS(canvasId, values, labels, opts = {}) {
      const el = document.getElementById(canvasId);
      if (!el) return;

      // destruir instância Chart.js previa
      try {
        if (canvasId === 'chart-area' && chartArea) { chartArea.destroy(); chartArea = null; }
        if (canvasId === 'chart-areaverd' && chartAreaVerd) { chartAreaVerd.destroy(); chartAreaVerd = null; }
      } catch (e){ /* ignore */ }

      // opções
      const maxSquares = typeof opts.maxSquares === 'number' ? opts.maxSquares : 100;
      const cols = typeof opts.cols === 'number' ? opts.cols : 10;
      const gap = typeof opts.gap === 'number' ? opts.gap : 2;
      const padding = typeof opts.padding === 'number' ? opts.padding : 8;
      const title = opts.title || '';
      const lighten = !!opts.lighten;
      const lightFactor = typeof opts.lightFactor === 'number' ? opts.lightFactor : 0.45;

      // paleta
      const palette = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38'
      ];

      // cores por label
      const colors = labels.map((_, i) => palette[i % palette.length]);
      if (lighten) {
        for (let i = 0; i < colors.length; i++) colors[i] = lightenColor(colors[i], lightFactor);
      }

      // calcular squares per label proporcional ao total (mesma lógica de antes)
      const vals = values.map(v => (isFinite(v) ? Number(v) : 0));
      const totalVal = vals.reduce((s,x) => s + x, 0);
      let squaresPerLabel;
      if (totalVal === 0) {
        squaresPerLabel = vals.map(_ => 0);
      } else {
        const raw = vals.map(v => (v / totalVal) * maxSquares);
        squaresPerLabel = raw.map(r => Math.floor(r));
        let remaining = maxSquares - squaresPerLabel.reduce((s,x) => s + x, 0);
        const decimals = raw.map((r, i) => ({ i, d: r - Math.floor(r) }))
                            .sort((a,b) => b.d - a.d);
        let idx = 0;
        while (remaining > 0 && idx < decimals.length) {
          squaresPerLabel[decimals[idx].i] += 1;
          remaining--;
          idx++;
          if (idx === decimals.length) idx = 0;
        }
      }

      // layout: calculamos rows a partir de maxSquares para manter grade consistente
      const rows = Math.ceil(maxSquares / cols);

      // tamanho físico do canvas e squareSize estimado (para radius)
      const rect = el.getBoundingClientRect();
      const DPR = window.devicePixelRatio || 1;
      const width = Math.max(200, Math.floor(rect.width));
      const height = Math.max(120, Math.floor(rect.height));
      // grid disponível (reservando legenda lateral)
      const legendWidth = Math.min(220, Math.floor(width * 0.42));
      const gridWidth = width - legendWidth - padding * 2;
      const gridHeight = height - (padding + 18) - padding; // reservar topo para título

      const squareSizeW = (gridWidth - (cols - 1) * gap) / cols;
      const squareSizeH = (gridHeight - (rows - 1) * gap) / rows;
      const squareSize = Math.max(4, Math.floor(Math.min(squareSizeW, squareSizeH)));

      // construir pontos (cada ponto = um quadradinho)
      const points = []; // {x, y, labelIndex, label, value, bg}
      let cursor = 0;
      for (let labelIndex = 0; labelIndex < labels.length; labelIndex++) {
        const count = squaresPerLabel[labelIndex];
        for (let s = 0; s < count; s++) {
          const pos = cursor;
          const row = Math.floor(pos / cols);
          const col = pos % cols;
          // invert y para ter origem top-left (y aumenta para baixo)
          const y = (rows - 1) - row;
          const x = col;
          points.push({
            x, y,
            labelIndex,
            label: labels[labelIndex],
            value: values[labelIndex],
            backgroundColor: colors[labelIndex]
          });
          cursor++;
        }
      }

      // configurar dimensões do canvas para nitidez
      el.width = Math.floor(width * DPR);
      el.height = Math.floor(height * DPR);
      el.style.width = width + "px";
      el.style.height = height + "px";

      // plugin para desenhar título na área do gráfico (simples)
      const titlePlugin = {
        id: 'matrixTitle',
        beforeDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          ctx.scale(1,1);
          ctx.font = "bold 12px sans-serif";
          ctx.fillStyle = "#222";
          ctx.textAlign = "left";
          ctx.fillText(title, padding, padding + 10);
          ctx.restore();
        }
      };

      // dataset único com muitos pontos
      const dataset = {
        label: title || '',
        data: points.map(p => ({ x: p.x, y: p.y, _meta: p })), // raw point em _meta
        backgroundColor: points.map(p => p.backgroundColor),
        borderWidth: 0,
        pointStyle: 'rect',
        // radius será definido pela opção no chart (usaremos plugin para escalar)
      };

      // criar Chart.js
      const cfg = {
        type: 'scatter',
        data: { datasets: [ dataset ] },
        options: {
          responsive: false, // já gerenciei o sizing manualmente
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              callbacks: {
                title: (items) => {
                  // items[0].raw._meta.label
                  const raw = items[0].raw;
                  return String(raw._meta.label);
                },
                label: (item) => {
                  const raw = item.raw._meta;
                  return `${Number(raw.value).toLocaleString('pt-BR')}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: -0.5,
              max: cols - 0.5,
              ticks: { display: false },
              grid: { display: false }
            },
            y: {
              type: 'linear',
              min: -0.5,
              max: rows - 0.5,
              ticks: { display: false },
              grid: { display: false }
            }
          },
          // ajusta elementos pontos para manter forma quadrada (usamos scriptable options)
          elements: {
            point: {
              radius: function(ctx) {
                // ctx.chart: chart, ctx.parsed is point coords
                // radius em px: metade do squareSize menos um ajuste para gap
                return Math.max(2, Math.floor(squareSize / 2));
              },
              hoverRadius: function(ctx) {
                return Math.max(3, Math.floor(squareSize / 2) + 2);
              }
            }
          }
        },
        plugins: [ titlePlugin ]
      };

      // garantir que Chart.js esteja disponível
      if (typeof Chart === 'undefined') {
        console.error('Chart.js não encontrado — inclua Chart.js para usar gráficos matrix com Chart.js.');
        return;
      }

      const chart = new Chart(el.getContext('2d'), cfg);

      // criar ou atualizar legenda DOM após o canvas (id: `${canvasId}-legend`)
      const existingLegend = document.getElementById(canvasId + '-legend');
      if (existingLegend) existingLegend.remove();
      const legendDiv = document.createElement('div');
      legendDiv.id = canvasId + '-legend';
      legendDiv.style.fontSize = '12px';
      legendDiv.style.marginTop = '6px';
      legendDiv.style.display = 'flex';
      legendDiv.style.flexDirection = 'column';
      legendDiv.style.gap = '4px';

      // preencher legenda (cores + texto)
      for (let i = 0; i < labels.length; i++) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        const sw = document.createElement('span');
        sw.style.width = '12px';
        sw.style.height = '12px';
        sw.style.display = 'inline-block';
        sw.style.background = (lighten ? lightenColor(palette[i % palette.length], lightFactor) : palette[i % palette.length]);
        sw.style.border = '1px solid rgba(0,0,0,0.06)';
        sw.style.marginRight = '8px';
        const txt = document.createElement('span');
        txt.textContent = `${labels[i]} — ${Number(values[i]).toLocaleString('pt-BR')}`;
        row.appendChild(sw);
        row.appendChild(txt);
        legendDiv.appendChild(row);
      }
      el.parentNode && el.parentNode.insertBefore(legendDiv, el.nextSibling);

      // guardar instância no estado global
      if (canvasId === 'chart-area') chartArea = chart;
      if (canvasId === 'chart-areaverd') chartAreaVerd = chart;
    }

    // preparar labels e arrays (mantendo seu fluxo)
    const labels = contributions.map(c => c.id);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    // construir os dois gráficos com Chart.js (matrix)
    buildMatrixChartWithChartJS('chart-area', valuesArea, labels, { title: 'Área Total', maxSquares: 100, cols: 10 });
    buildMatrixChartWithChartJS('chart-areaverd', valuesAreaVerd, labels, { title: 'Área Verde', maxSquares: 100, cols: 10, lighten: true, lightFactor: 0.40 });

    // --------------------------------------------------------------------------------------

  }

  window.webmapStats = { updateStats, contributions };

  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    const sortAreaBtn = document.getElementById("sort-area");
    const sortGreenBtn = document.getElementById("sort-areaverd");

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

    btn.addEventListener('click', function () {
      const computed = getComputedStyle(panel).display;
      if (computed === 'none') openPanel(); else closePanel();
    });

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    document.addEventListener('click', (event) => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) closePanel();
    });

    // Botões de ordenação com teste no console
    if(sortAreaBtn) sortAreaBtn.addEventListener('click', () => {
        console.log('Botão Ordenar por Área Total clicado'); // <-- teste
        window.webmapStats.updateStats('area');
    });

    if(sortGreenBtn) sortGreenBtn.addEventListener('click', () => {
        console.log('Botão Ordenar por Área Verde clicado'); // <-- teste
        window.webmapStats.updateStats('areaverd');
    });

    panel.classList.add('hidden');
    setTimeout(() => window.webmapStats.updateStats(), 1000);
  });

})();

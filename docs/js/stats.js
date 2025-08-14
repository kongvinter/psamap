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

        // Construir gráficos (matrix quadrada usando Chart.js)
        function buildChart(canvasId, values, labels){
          const el = document.getElementById(canvasId);
          if (!el) return;
          const ctx = el.getContext('2d');
    
          // destruir instância anterior, se houver
          if (canvasId === 'chart-area' && chartArea){ try{ chartArea.destroy(); }catch(e){} chartArea = null; }
          if (canvasId === 'chart-areaverd' && chartAreaVerd){ try{ chartAreaVerd.destroy(); }catch(e){} chartAreaVerd = null; }
    
          // paleta (mesma base usada antes, expandida)
          const palette = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
            '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
            '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
            '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
            '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
          ];
    
          // auxiliar para clarear cor
          function lightenColor(color, percent) {
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
    
          // parâmetros da matrix
          const maxSquares = 100; // total de quadradinhos na grade (padrão)
          const cols = Math.ceil(Math.sqrt(maxSquares)); // matriz quadrada: cols x rows
          const rows = cols;
          const gap = 2; // gap visual entre pontos (px)
          const padding = 6;
    
          // saneamento dos valores
          const vals = values.map(v => (isFinite(v) ? Number(v) : 0));
          const totalVal = vals.reduce((s,x) => s + x, 0);
    
          // calcular quanta "cota" de quadradinhos cada label recebe
          let squaresPerLabel;
          if (totalVal === 0) {
            // se total for zero, distribuir zero para todos
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
    
          // gerar mapeamento global de posições (0..maxSquares-1) -> labelIndex
          const posToLabel = new Array(maxSquares).fill(null);
          let cursor = 0;
          for (let i = 0; i < squaresPerLabel.length; i++) {
            const count = squaresPerLabel[i];
            for (let k = 0; k < count && cursor < maxSquares; k++) {
              posToLabel[cursor++] = i;
            }
          }
          // se houver posições não atribuídas (caso total < maxSquares), ficam null e não desenhadas
    
          // calcular dimensões do canvas e squareSize
          const rect = el.getBoundingClientRect();
          const DPR = window.devicePixelRatio || 1;
          const width = Math.max(200, Math.floor(rect.width));
          const height = Math.max(120, Math.floor(rect.height));
          // grid disponível: reservar espaço para legenda do Chart.js (legend abaixo) — usamos grid full para pontos
          const gridWidth = width - padding * 2;
          const gridHeight = height - padding * 2 - 18; // deixar topo para título se precisar
    
          const squareSizeW = (gridWidth - (cols - 1) * gap) / cols;
          const squareSizeH = (gridHeight - (rows - 1) * gap) / rows;
          const squareSize = Math.max(4, Math.floor(Math.min(squareSizeW, squareSizeH)));
    
          // preparar datasets: um dataset por label (assim a legenda do Chart.js mostra cada label)
          const datasets = [];
          for (let i = 0; i < labels.length; i++) {
            datasets.push({
              label: String(labels[i]),
              data: [], // será preenchido com {x,y}
              backgroundColor: lightenColor(palette[i % palette.length], canvasId === 'chart-areaverd' ? 0.40 : 0),
              borderColor: 'rgba(0,0,0,0.06)',
              pointStyle: 'rect',
              hoverRadius: Math.max(4, Math.floor(squareSize/2) + 2),
              radius: Math.max(1, Math.floor(squareSize/2))
            });
          }
    
          // preencher pontos na grade, sequencialmente
          for (let pos = 0; pos < maxSquares; pos++) {
            const labelIndex = posToLabel[pos];
            if (labelIndex === null || labelIndex === undefined) continue; // vazio
            const row = Math.floor(pos / cols);
            const col = pos % cols;
            // usar y invertido para origin top-left visual (optional)
            const y = (rows - 1) - row;
            const x = col;
            datasets[labelIndex].data.push({ x, y, _value: vals[labelIndex] });
          }
    
          // ajustar canvas físico para hi-dpi
          el.width = Math.floor(width * DPR);
          el.height = Math.floor(height * DPR);
          el.style.width = width + "px";
          el.style.height = height + "px";
    
          // criar configuração Chart.js (scatter)
          const cfg = {
            type: 'scatter',
            data: { datasets },
            options: {
              responsive: false,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
                tooltip: {
                  callbacks: {
                    title: (items) => {
                      if (!items || !items.length) return '';
                      return items[0].dataset.label;
                    },
                    label: (item) => {
                      const v = item.raw && item.raw._value !== undefined ? item.raw._value : '';
                      return (v !== '') ? Number(v).toLocaleString('pt-BR') : '';
                    }
                  }
                }
              },
              scales: {
                x: {
                  type: 'linear',
                  display: false,
                  min: -0.5,
                  max: cols - 0.5,
                  grid: { display: false },
                  ticks: { display: false }
                },
                y: {
                  type: 'linear',
                  display: false,
                  min: -0.5,
                  max: rows - 0.5,
                  grid: { display: false },
                  ticks: { display: false }
                }
              },
              elements: {
                point: {
                  // radius definido por dataset.radius (aceito acima) — Chart.js usará esse valor
                  pointStyle: 'rectRounded'
                }
              }
            }
          };
    
          // verificar Chart.js
          if (typeof Chart === 'undefined') {
            console.error('Chart.js não encontrado. Inclua Chart.js para usar o gráfico matrix.');
            return;
          }
    
          const chart = new Chart(ctx, cfg);
    
          if (canvasId === 'chart-area') chartArea = chart;
          if (canvasId === 'chart-areaverd') chartAreaVerd = chart;
        }
    
        // construir labels e arrays (mantendo seu fluxo original)
        const labels = contributions.map(c => c.id);
        const valuesArea = contributions.map(c => c.area);
        const valuesAreaVerd = contributions.map(c => c.areaverd);
    
        // manter chamadas originais (agora cada buildChart renderiza matriz quadrada)
        buildChart('chart-area', valuesArea, labels);
        buildChart('chart-areaverd', valuesAreaVerd, labels);
    

    // -------------------------------------------------------
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

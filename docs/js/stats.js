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

          // Construir gráficos (treemap / matriz de retângulos estilo imagem)
    function buildChart(canvasId, values, labels){
      const el = document.getElementById(canvasId);
      if (!el) return;
      const ctx = el.getContext('2d');

      // destruir estado anterior / limpar listeners
      try {
        if (canvasId === 'chart-area' && chartArea) { if (chartArea.destroy) chartArea.destroy(); chartArea = null; }
        if (canvasId === 'chart-areaverd' && chartAreaVerd) { if (chartAreaVerd.destroy) chartAreaVerd.destroy(); chartAreaVerd = null; }
      } catch(e){ /* ignorar */ }

      // paleta (mesma base ampla)
      const palette = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#EE5A6F', '#0ABDE3', '#10AC84', '#F79F1F', '#A3CB38',
        '#FD79A8', '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E',
        '#E17055', '#81ECEC', '#74B9FF', '#00B894', '#E84393'
      ];

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

      // parâmetros visuais
      const padding = 8;
      const legendReserve = 80; // espaço inferior possível para legendas
      const lightForGreen = 0.38; // clareamento para Área Verde

      // dimensões e DPR-aware
      const rect = el.getBoundingClientRect();
      const DPR = window.devicePixelRatio || 1;
      const width = Math.max(220, Math.floor(rect.width));
      const height = Math.max(160, Math.floor(rect.height));
      el.width = Math.floor(width * DPR);
      el.height = Math.floor(height * DPR);
      el.style.width = width + 'px';
      el.style.height = height + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0,0,width,height);

      // área do treemap: quadro quadrado (como na imagem)
      const tmX = padding;
      const tmY = padding;
      const tmW = Math.min(width - padding*2, height - padding*2 - legendReserve);
      const tmH = tmW;
      const legendX = tmX + tmW + 12;
      const legendY = tmY;
      const legendMaxWidth = Math.max(100, width - legendX - padding);

      // preparar dados
      const vals = values.map(v => (isFinite(v) ? Number(v) : 0));
      const totalVal = vals.reduce((s,x) => s + x, 0);
      const nodes = labels.map((lbl,i) => ({
        id: String(lbl),
        value: vals[i],
        color: palette[i % palette.length]
      }));
      if (canvasId === 'chart-areaverd') nodes.forEach(n => n.color = lightenColor(n.color, lightForGreen));

      if (totalVal === 0) {
        // caso sem dados
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(tmX, tmY, tmW, tmH);
        ctx.fillStyle = '#666';
        ctx.font = '12px sans-serif';
        ctx.fillText('Sem dados', tmX + 10, tmY + 20);
        const stateEmpty = { canvasId, destroy: ()=>{ ctx.clearRect(0,0,width,height); } };
        if (canvasId === 'chart-area') chartArea = stateEmpty;
        if (canvasId === 'chart-areaverd') chartAreaVerd = stateEmpty;
        return;
      }

      // converter valores em áreas px^2 proporcionalmente ao retângulo do treemap
      const totalAreaPx = tmW * tmH;
      const items = nodes
        .map(n => ({ id: n.id, value: n.value, color: n.color, area: Math.max(1e-6, (n.value / totalVal) * totalAreaPx) }))
        .sort((a,b) => b.area - a.area);

      const rects = [];

      // funções squarify (versão adaptada)
      function worstAspect(row, sideLength) {
        if (!row.length) return Infinity;
        let sum = 0, maxA = -Infinity, minA = Infinity;
        row.forEach(r => { sum += r.area; maxA = Math.max(maxA, r.area); minA = Math.min(minA, r.area); });
        const s2 = sideLength * sideLength;
        return Math.max( (s2 * maxA) / (sum * sum), (sum * sum) / (s2 * Math.max(minA, 1e-12)) );
      }
      function layoutRow(row, rectObj, horizontal) {
        const sumArea = row.reduce((s,r)=>s+r.area,0);
        if (horizontal) {
          const rowHeight = sumArea / rectObj.w;
          let x = rectObj.x;
          for (let i=0;i<row.length;i++){
            const w = row[i].area / rowHeight;
            rects.push({ x: x, y: rectObj.y, w: w, h: rowHeight, id: row[i].id, color: row[i].color, value: row[i].value });
            x += w;
          }
          rectObj.y += rowHeight;
          rectObj.h -= rowHeight;
        } else {
          const colWidth = sumArea / rectObj.h;
          let y = rectObj.y;
          for (let i=0;i<row.length;i++){
            const h = row[i].area / colWidth;
            rects.push({ x: rectObj.x, y: y, w: colWidth, h: h, id: row[i].id, color: row[i].color, value: row[i].value });
            y += h;
          }
          rectObj.x += colWidth;
          rectObj.w -= colWidth;
        }
      }
      function squarify(itemsList, rectObj) {
        let row = [];
        let remaining = itemsList.slice();
        while (remaining.length > 0) {
          const node = remaining[0];
          const shortSide = Math.min(rectObj.w, rectObj.h);
          if (row.length === 0) {
            row.push(remaining.shift());
          } else {
            const w1 = worstAspect(row, shortSide);
            const w2 = worstAspect(row.concat([node]), shortSide);
            if (w2 <= w1) {
              row.push(remaining.shift());
            } else {
              const horizontal = rectObj.w >= rectObj.h;
              layoutRow(row, rectObj, horizontal);
              row = [];
            }
          }
          if (remaining.length === 0 && row.length > 0) {
            const horizontal = rectObj.w >= rectObj.h;
            layoutRow(row, rectObj, horizontal);
            row = [];
          }
        }
      }

      // executar squarify
      squarify(items, { x: tmX, y: tmY, w: tmW, h: tmH });

      // desenhar retângulos (fills + bordas)
      rects.forEach(r => {
        ctx.fillStyle = r.color;
        ctx.fillRect(r.x, r.y, Math.max(0.5, r.w), Math.max(0.5, r.h));
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
      });

      // texto interno para blocos maiores
      ctx.fillStyle = '#111';
      ctx.font = '11px sans-serif';
      rects.forEach(r => {
        if (r.w > 48 && r.h > 18) {
          const text = r.id;
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
          ctx.fillText(text, r.x + 6, r.y + 14);
          ctx.restore();
        }
      });

      // legenda textual à direita / embaixo (id — valor estilizado)
      function drawLegend(){
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#222';
        const lineHeight = 18;
        let y = legendY;
        let x = legendX;
        for (let i=0;i<items.length;i++){
          const it = items[i];
          // se não cabe à direita, desenha abaixo do treemap
          if (legendX + 120 > width) { x = padding; y = tmY + tmH + 10 + (i * lineHeight); }
          ctx.fillStyle = it.color;
          ctx.fillRect(x, y - 12, 12, 12);
          ctx.strokeStyle = 'rgba(0,0,0,0.06)';
          ctx.strokeRect(x + 0.5, y - 11.5, 11, 11);
          ctx.fillStyle = '#222';
          const percent = Math.round((it.area / totalAreaPx) * 100);
          const text = `${it.id} — ${Number(it.value).toLocaleString('pt-BR')} (${percent}%)`;
          ctx.fillText(text, x + 18, y);
          y += lineHeight;
          if (y > tmY + tmH) { x += Math.min(legendMaxWidth, 200); y = legendY; }
        }
      }
      drawLegend();

      // tooltip DOM
      let tooltip = document.getElementById(canvasId + '-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = canvasId + '-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.padding = '6px 8px';
        tooltip.style.background = 'rgba(0,0,0,0.75)';
        tooltip.style.color = '#fff';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = 9999;
        el.parentElement && el.parentElement.appendChild(tooltip);
      }

      // util para detectar rect sob o cursor
      function findRectAt(clientX, clientY) {
        const bbox = el.getBoundingClientRect();
        const cx = clientX - bbox.left;
        const cy = clientY - bbox.top;
        for (let i=0;i<rects.length;i++){
          const r = rects[i];
          if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return r;
        }
        return null;
      }

      // limpar listeners antigos (se existirem)
      function clearHandlers(stateObj) {
        if (!stateObj) return;
        if (stateObj._mousemove) el.removeEventListener('mousemove', stateObj._mousemove);
        if (stateObj._mouseout) el.removeEventListener('mouseout', stateObj._mouseout);
        if (stateObj._click) el.removeEventListener('click', stateObj._click);
      }
      clearHandlers(chartArea);
      clearHandlers(chartAreaVerd);

      // handlers
      const onMove = function(ev){
        const r = findRectAt(ev.clientX, ev.clientY);
        if (r) {
          tooltip.style.display = 'block';
          tooltip.textContent = `${r.id} — ${Number(r.value).toLocaleString('pt-BR')} (${Math.round((r.area/totalAreaPx)*100)}%)`;
          const parentRect = el.getBoundingClientRect();
          tooltip.style.left = (ev.clientX - parentRect.left + 12) + 'px';
          tooltip.style.top = (ev.clientY - parentRect.top + 12) + 'px';
        } else {
          tooltip.style.display = 'none';
        }
      };
      const onOut = function(){ tooltip.style.display = 'none'; };
      const onClick = function(ev){
        const r = findRectAt(ev.clientX, ev.clientY);
        if (r && window.map) {
          // procurar camada correspondente por id/name e centralizar
          let found = null;
          try {
            window.map.eachLayer && window.map.eachLayer(function(layer){
              try {
                const props = layer.feature && layer.feature.properties;
                if (props && (String(props.id) === String(r.id) || String(props.name) === String(r.id))) {
                  found = layer;
                  return;
                }
              } catch(e){}
            });
            if (found && found.getBounds) window.map.fitBounds(found.getBounds(), { maxZoom: 16 });
          } catch(e){}
        }
      };

      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseout', onOut);
      el.addEventListener('click', onClick);

      // estado para destruição posterior
      const state = {
        canvasId,
        rects,
        _mousemove: onMove,
        _mouseout: onOut,
        _click: onClick,
        destroy: function(){
          try {
            ctx.clearRect(0,0,width,height);
            el.removeEventListener('mousemove', onMove);
            el.removeEventListener('mouseout', onOut);
            el.removeEventListener('click', onClick);
            if (tooltip && tooltip.parentElement) tooltip.parentElement.removeChild(tooltip);
          } catch(e){}
        }
      };

      if (canvasId === 'chart-area') chartArea = state;
      if (canvasId === 'chart-areaverd') chartAreaVerd = state;
    }

    // preparar labels e arrays (mantendo fluxo)
    const labels = contributions.map(c => c.id);
    const valuesArea = contributions.map(c => c.area);
    const valuesAreaVerd = contributions.map(c => c.areaverd);

    // chamadas originais — agora renderizam treemaps
    buildChart('chart-area', valuesArea, labels);
    buildChart('chart-areaverd', valuesAreaVerd, labels);

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

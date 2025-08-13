// js/stats.js — versão completa otimizada
(function(){

  // ===== Funções auxiliares =====
  function parseNumber(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Lista das camadas numeradas que queremos capturar
  const targetLayerIds = [
    '143292', '33782', '6170', '84347', '151959', '39859', '71398', '43918',
    '143293', '6169', '84344', '84345', '79199', '14779', '7859', '92556',
    '103699', '81', '14780', '104089', '79197', '151005', '171295', '116124'
  ];

  // ===== Funções otimizadas para encontrar camadas =====
  function findPropriedadesAderidasGroup(map) {
    // 1. Verificar em camadas sobrepostas do controle de layers
    if (window.layerControl) {
      try {
        const overlays = window.layerControl.getOverlays();
        if (overlays && overlays['Propriedades Aderidas']) {
          return overlays['Propriedades Aderidas'];
        }
      } catch (e) {
        console.warn('Erro ao acessar layerControl:', e);
      }
    }

    // 2. Verificar recursivamente nas camadas do mapa
    let targetGroup = null;
    if (map && typeof map.eachLayer === 'function') {
      map.eachLayer((layer) => {
        if (layer instanceof L.LayerGroup && layer.options?.groupName === 'Propriedades Aderidas') {
          targetGroup = layer;
        }
        // Verificar em subgrupos
        else if (layer instanceof L.LayerGroup) {
          layer.getLayers().forEach((sublayer) => {
            if (sublayer.options?.groupName === 'Propriedades Aderidas') {
              targetGroup = sublayer;
            }
          });
        }
      });
    }
    
    // 3. Verificar em window.overlayMaps
    if (!targetGroup && window.overlayMaps && window.overlayMaps['Propriedades Aderidas']) {
      return window.overlayMaps['Propriedades Aderidas'];
    }
    
    // 4. Verificar em window.PropriedadesAderidasLayerGroup
    if (!targetGroup && window.PropriedadesAderidasLayerGroup) {
      return window.PropriedadesAderidasLayerGroup;
    }
    
    return targetGroup;
  }

  // Função recursiva para coletar todas as camadas
  function collectAllLayers(group) {
    if (!group || typeof group.getLayers !== 'function') return [];
    
    const layers = [];
    group.getLayers().forEach((layer) => {
      if (layer instanceof L.LayerGroup) {
        layers.push(...collectAllLayers(layer));
      } else {
        layers.push(layer);
      }
    });
    
    return layers;
  }

  // Função para aguardar o carregamento do grupo
  function waitForLayers(callback, maxAttempts = 10, interval = 500) {
    const map = window.map || window._map || null;
    if (!map) {
      console.error('Mapa não encontrado');
      callback(null);
      return;
    }
    
    let attempts = 0;
    const check = () => {
      const group = findPropriedadesAderidasGroup(map);
      if (group) {
        callback(group);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(check, interval);
      } else {
        console.error(`Grupo "Propriedades Aderidas" não encontrado após ${maxAttempts} tentativas.`);
        callback(null);
      }
    };
    
    check();
  }

  // Função para encontrar as camadas numeradas
  function findTargetLayers(group) {
    if (!group) return [];
    
    console.group('DEBUG - Propriedades Aderidas');
    console.log('Grupo encontrado:', group);
    
    const groupLayers = collectAllLayers(group);
    console.log(`Total de camadas no grupo (incluindo subgrupos): ${groupLayers.length}`, groupLayers);
    
    const foundLayers = [];
    
    groupLayers.forEach((layer, index) => {
      // Tenta identificar o ID da camada
      let layerId = null;
      
      // 1. Tentar extrair de propriedades da feature
      if (layer.feature?.properties?.id) {
        layerId = String(layer.feature.properties.id);
      }
      // 2. Tentar de dados internos da camada
      else if (layer.options?.dataVar) {
        const match = layer.options.dataVar.match(/\d+/);
        if (match) layerId = match[0];
      }
      // 3. Tentar do nome da camada
      else if (layer.options?.name) {
        const match = layer.options.name.match(/\d+/);
        if (match) layerId = match[0];
      }
      // 4. Tentar de layerName
      else if (layer.layerName) {
        const match = layer.layerName.match(/\d+/);
        if (match) layerId = match[0];
      }
      
      console.log(`Camada ${index} - ID identificado: ${layerId || 'não encontrado'}`);
      
      if (layerId && targetLayerIds.includes(layerId)) {
        foundLayers.push({
          layer: layer,
          id: layerId
        });
        console.log(`✓ Camada ${layerId} adicionada à lista`);
      }
    });
    
    console.groupEnd();
    return foundLayers;
  }

  let chartArea = null, chartAreaVerd = null;
  let lastContributions = [];

  // ===== Atualiza estatísticas =====
  function updateStats() {
    try {
      const totalPropsEl = document.getElementById('total-props');
      const totalAreaEl = document.getElementById('total-area');
      const totalGreenEl = document.getElementById('total-green');
      const propsListEl = document.getElementById('props-list');
      const errorEl = document.getElementById('stats-error');

      const layerCountEl = document.getElementById('layer-count');
      const areaTotalEl = document.getElementById('area-total');
      const areaverdTotalEl = document.getElementById('areaverd-total');

      // Resetar mensagens de erro
      if (errorEl) errorEl.textContent = '';

      // Inicializar com valores padrão
      if (layerCountEl) layerCountEl.textContent = 'Carregando...';
      if (totalPropsEl) totalPropsEl.textContent = '0';
      if (areaTotalEl) areaTotalEl.textContent = '—';
      if (areaverdTotalEl) areaverdTotalEl.textContent = '—';

      // Usar a função de espera para aguardar o grupo
      waitForLayers(function(group) {
        if (!group) {
          if (layerCountEl) layerCountEl.textContent = 'Grupo não encontrado.';
          if (errorEl) errorEl.textContent = 'Grupo "Propriedades Aderidas" não encontrado. Atualize o mapa e tente novamente.';
          return;
        }

        const targetLayers = findTargetLayers(group);
        
        if (targetLayers.length === 0) {
          if (layerCountEl) layerCountEl.textContent = 'Nenhuma camada numerada encontrada.';
          if (totalPropsEl) totalPropsEl.textContent = '0';
          if (areaTotalEl) areaTotalEl.textContent = '—';
          if (areaverdTotalEl) areaverdTotalEl.textContent = '—';
          if (errorEl) errorEl.textContent = 'Camadas alvo não encontradas no grupo. Verifique os IDs.';
          return;
        }

        if (layerCountEl) layerCountEl.textContent = 'Camadas encontradas: ' + targetLayers.length;
        if (totalPropsEl) totalPropsEl.textContent = String(targetLayers.length);

        let totalArea = 0, totalAreaVerd = 0;
        const contributions = [];

        targetLayers.forEach(function(layerInfo) {
          const layer = layerInfo.layer;
          const id = layerInfo.id;
          
          let props = {};
          let name = id; // fallback para o ID da camada
          
          // Tentativas de obter propriedades
          try {
            // Método 1: feature direta
            if (layer.feature && layer.feature.properties) {
              props = layer.feature.properties;
            }
            // Método 2: options.properties  
            else if (layer.options && layer.options.properties) {
              props = layer.options.properties;
            }
            // Método 3: subcamadas (GeoJSON layers)
            else if (layer._layers) {
              const layers = Object.values(layer._layers);
              if (layers.length > 0) {
                for (let sublayer of layers) {
                  if (sublayer.feature && sublayer.feature.properties) {
                    const subProps = sublayer.feature.properties;
                    if (subProps.id || subProps.Área || subProps['Área Verd']) {
                      props = subProps;
                      break;
                    }
                  }
                }
              }
            }

            // Extrair nome
            if (props.id) name = String(props.id);
            else if (props.nome) name = String(props.nome);
            else if (props.name) name = String(props.name);
            else name = `Propriedade ${id}`;

            // Extrair áreas
            const area = parseNumber(props['Área'] || props['Area'] || props.area || props['AREA'] || 0);
            const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['ÁreaVerd'] || props['area_verd'] || props['areaverd'] || props['Área_Verd'] || 0);
            
            totalArea += area; 
            totalAreaVerd += areaVerd;
            contributions.push({ 
              name: name, 
              area: area, 
              areaverd: areaVerd 
            });
          } catch (e) {
            console.error(`Erro ao processar camada ${id}:`, e);
          }
        });

        // Atualizar elementos da interface
        if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
        if (areaverdTotalEl) areaverdTotalEl.textContent = totalAreaVerd.toLocaleString('pt-BR');
        if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

        if (propsListEl) {
          propsListEl.innerHTML = '';
          contributions.forEach(function(c) {
            const li = document.createElement('li');
            li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR');
            propsListEl.appendChild(li);
          });
        }

        lastContributions = contributions.slice();

        // Construir gráficos
        function buildChart(canvasId, values, labels) {
          const el = document.getElementById(canvasId);
          if (!el) return null;
          const ctx = el.getContext('2d');

          if (canvasId === 'chart-area' && chartArea) { 
            chartArea.destroy(); 
            chartArea = null; 
          }
          if (canvasId === 'chart-areaverd' && chartAreaVerd) { 
            chartAreaVerd.destroy(); 
            chartAreaVerd = null; 
          }

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
              responsive: true,
              plugins: { 
                legend: { 
                  position: 'bottom',
                  labels: { font: { size: 12 } }
                }, 
                tooltip: { 
                  callbacks: { 
                    label: function(ctx) { 
                      return ctx.label + ': ' + ctx.parsed.toLocaleString('pt-BR') + ' ha'; 
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

        console.log('Estatísticas atualizadas:', {
          totalLayers: targetLayers.length,
          totalArea: totalArea,
          totalAreaVerd: totalAreaVerd,
          contributions: contributions
        });
      });
    } catch (error) {
      console.error('Erro crítico em updateStats:', error);
      const errorEl = document.getElementById('stats-error');
      if (errorEl) errorEl.textContent = 'Erro ao atualizar estatísticas. Consulte o console para detalhes.';
    }
  }

  function sortBy(mode) {
    if (!lastContributions || lastContributions.length === 0) return;
    const arr = lastContributions.slice();
    if (mode === 'areaverd') {
      arr.sort((a, b) => b.areaverd - a.areaverd);
    } else {
      arr.sort((a, b) => b.area - a.area);
    }
    const propsListEl = document.getElementById('props-list');
    if (!propsListEl) return;
    propsListEl.innerHTML = '';
    arr.forEach(function(c) { 
      const li = document.createElement('li'); 
      li.textContent = c.name + ' — Área: ' + c.area.toLocaleString('pt-BR') + ' | Área Verd: ' + c.areaverd.toLocaleString('pt-BR'); 
      propsListEl.appendChild(li); 
    });
  }

  window.webmapStats = { updateStats: updateStats, sortBy: sortBy };

  // ===== Controle do painel =====
  document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    if (!btn || !panel) {
      console.warn('[stats] Elementos da interface não encontrados');
      return;
    }

    // Funções de abrir e fechar painel
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

    // Event handlers
    btn.addEventListener('click', function() {
      panel.style.display === 'none' ? openPanel() : closePanel();
    });

    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    document.addEventListener('click', (event) => {
      if (!panel.contains(event.target) && !btn.contains(event.target)) {
        closePanel();
      }
    });

    // Inicialização
    panel.classList.add('hidden');

    // Atualização inicial com timeout maior
    setTimeout(() => window.webmapStats.updateStats(), 1500);

    // Atualizar estatísticas quando camadas forem adicionadas
    if (window.map) {
      window.map.on('layeradd', function() {
        if (!panel.classList.contains('hidden')) {
          window.webmapStats.updateStats();
        }
      });
    }
  });
})();
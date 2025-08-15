// ============================
// js/stats.js — Painel completo com Chart.js + D3.js (versão completa melhorada)
// ============================
(function() {
  'use strict';

  // ============================
  // Configurações e constantes
  // ============================
  const CONFIG = {
    TREEMAP_HEIGHT: 300,
    HIGHLIGHT_STYLE: {
      color: '#FF0000',
      weight: 3,
      fillColor: '#FF0000',
      fillOpacity: 0.3
    },
    CHART_COLORS: {
      saturation: 60,
      lightness: 60
    },
    MAX_RECURSION_DEPTH: 10,
    DEFAULT_REQUIRED_PROPERTIES: ['Área', 'Área Verd']
  };

  // ============================
  // Funções auxiliares básicas
  // ============================
  function parseNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && !isNaN(value)) return value;
    
    try {
      const stringValue = String(value)
        .replace(/\s+/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.');
      const parsed = parseFloat(stringValue);
      return isNaN(parsed) ? 0 : parsed;
    } catch (error) {
      console.warn('Erro ao fazer parse do número:', value, error);
      return 0;
    }
  }

  function formatarArea(valor) {
    try {
      const numero = parseNumber(valor);
      return numero.toLocaleString('pt-BR', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }) + ' ha';
    } catch (error) {
      console.warn('Erro ao formatar área:', valor, error);
      return '0 ha';
    }
  }

  function safelyExecute(fn, errorMessage = 'Erro na execução') {
    try {
      return fn();
    } catch (error) {
      console.error(errorMessage, error);
      return null;
    }
  }

  // ============================
  // Funções avançadas para manipulação de camadas
  // ============================

  /**
   * Busca o objeto mapa de várias formas possíveis
   * @returns {Object|null} Instância do mapa Leaflet ou null
   */
  function findMapInstance() {
    // Tenta diferentes formas de acessar o mapa
    const mapCandidates = [
      window.map,
      window._map,
      window.myMap,
      window.leafletMap,
      // Procura por instâncias globais
      ...Object.values(window).filter(obj => 
        obj && typeof obj === 'object' && 
        obj.eachLayer && typeof obj.eachLayer === 'function'
      )
    ];

    for (const candidate of mapCandidates) {
      if (candidate && typeof candidate.eachLayer === 'function') {
        return candidate;
      }
    }

    // Se não encontrou, tenta procurar por ID comum
    const mapElements = ['map', 'mapid', 'leaflet-map'];
    for (const id of mapElements) {
      const element = document.getElementById(id);
      if (element && element._leaflet_id) {
        // Procura a instância do mapa associada ao elemento
        for (const key in window) {
          const obj = window[key];
          if (obj && obj._container === element) {
            return obj;
          }
        }
      }
    }

    console.error('Nenhuma instância do mapa Leaflet foi encontrada');
    return null;
  }

  /**
   * Obtém todas as camadas que possuem features com propriedades específicas
   * @param {Object} map - Instância do mapa Leaflet
   * @param {Array} requiredProperties - Lista de propriedades obrigatórias
   * @param {Function} filterFunction - Função personalizada de filtro (opcional)
   * @returns {Array} Array de camadas que atendem aos critérios
   */
  function getTargetLayers(map = null, requiredProperties = CONFIG.DEFAULT_REQUIRED_PROPERTIES, filterFunction = null) {
    // Tenta encontrar o mapa se não foi fornecido
    if (!map) {
      map = findMapInstance();
    }

    if (!map || typeof map.eachLayer !== 'function') {
      console.warn('Mapa não encontrado ou inválido para getTargetLayers');
      return [];
    }

    const layers = [];
    const seenIds = new Set();
    const processedLayers = new WeakSet(); // Evita loops infinitos

    /**
     * Função recursiva para percorrer camadas aninhadas
     * @param {Object} layer - Camada a ser processada
     * @param {number} depth - Profundidade atual (para evitar recursão infinita)
     */
    function traverse(layer, depth = 0) {
      // Limite de profundidade para evitar recursão infinita
      if (depth > CONFIG.MAX_RECURSION_DEPTH || !layer || processedLayers.has(layer)) {
        return;
      }
      
      processedLayers.add(layer);

      try {
        // Verifica se a camada tem feature com propriedades
        if (layer.feature && layer.feature.properties) {
          const props = layer.feature.properties;
          
          // Obtém ID único da camada
          const id = props.id || props.name || props.ID || props.NAME || 
                     layer._leaflet_id || `layer_${layers.length}`;

          // Evita duplicatas
          if (seenIds.has(id)) {
            return;
          }

          // Verifica propriedades obrigatórias (case insensitive)
          const hasRequiredProps = requiredProperties.every(prop => 
            props.hasOwnProperty(prop) || 
            props.hasOwnProperty(prop.toLowerCase()) ||
            props.hasOwnProperty(prop.toUpperCase())
          );

          if (hasRequiredProps) {
            // Aplica filtro personalizado se fornecido
            if (!filterFunction || filterFunction(layer, props)) {
              layers.push({
                layer: layer,
                id: id,
                properties: props,
                bounds: layer.getBounds ? safelyExecute(() => layer.getBounds()) : null,
                type: layer.constructor.name
              });
              seenIds.add(id);
            }
          }
        }

        // Processa camadas filhas
        if (layer._layers && typeof layer._layers === 'object') {
          Object.values(layer._layers).forEach(childLayer => {
            traverse(childLayer, depth + 1);
          });
        }

        // Processa grupos de camadas
        if (layer.getLayers && typeof layer.getLayers === 'function') {
          safelyExecute(() => {
            layer.getLayers().forEach(childLayer => {
              traverse(childLayer, depth + 1);
            });
          });
        }

      } catch (error) {
        console.warn('Erro ao processar layer:', error);
      }
    }

    try {
      // Inicia a travessia de todas as camadas do mapa
      map.eachLayer(layer => traverse(layer));
    } catch (error) {
      console.error('Erro ao iterar sobre layers do mapa:', error);
    }

    console.info(`Encontradas ${layers.length} camadas com as propriedades: ${requiredProperties.join(', ')}`);
    return layers;
  }

  /**
   * Busca camadas por critérios específicos
   * @param {Object} map - Instância do mapa
   * @param {Object} criteria - Critérios de busca
   * @returns {Array} Camadas que atendem aos critérios
   */
  function findLayersByCriteria(map = null, criteria = {}) {
    const {
      hasProperty = null,      // Propriedade que deve existir
      propertyValue = null,    // Valor específico de propriedade
      propertyKey = null,      // Chave da propriedade para verificar valor
      layerType = null,        // Tipo de camada (Polygon, Point, etc.)
      minArea = null,          // Área mínima (se aplicável)
      maxArea = null,          // Área máxima (se aplicável)
      bounds = null            // Dentro de bounds específicos
    } = criteria;

    return getTargetLayers(map, hasProperty ? [hasProperty] : CONFIG.DEFAULT_REQUIRED_PROPERTIES, (layer, props) => {
      // Verifica valor específico de propriedade
      if (propertyKey && propertyValue !== null) {
        if (props[propertyKey] !== propertyValue) {
          return false;
        }
      }

      // Verifica tipo de camada
      if (layerType && layer.constructor.name !== layerType) {
        return false;
      }

      // Verifica área mínima/máxima
      if (minArea !== null || maxArea !== null) {
        const area = parseFloat(props['Área'] || props['Area'] || props['area'] || 0);
        if (minArea !== null && area < minArea) return false;
        if (maxArea !== null && area > maxArea) return false;
      }

      // Verifica bounds
      if (bounds && layer.getBounds) {
        try {
          const layerBounds = layer.getBounds();
          if (!bounds.intersects(layerBounds)) {
            return false;
          }
        } catch (e) {
          // Ignora se não conseguir obter bounds
        }
      }

      return true;
    });
  }

  /**
   * Obtém estatísticas das camadas encontradas
   * @param {Array} layerObjects - Array de objetos de camada retornado por getTargetLayers
   * @returns {Object} Objeto com estatísticas
   */
  function getLayersStatistics(layerObjects) {
    if (!Array.isArray(layerObjects) || layerObjects.length === 0) {
      return {
        count: 0,
        totalArea: 0,
        totalGreenArea: 0,
        averageArea: 0,
        averageGreenArea: 0,
        layerTypes: {}
      };
    }

    let totalArea = 0;
    let totalGreenArea = 0;
    const layerTypes = {};

    layerObjects.forEach(({ properties, type }) => {
      // Soma áreas (tenta diferentes variações de nome)
      const area = parseNumber(
        properties['Área'] || 
        properties['Area'] || 
        properties['area'] || 
        properties['AREA']
      );
      
      const greenArea = parseNumber(
        properties['Área Verd'] || 
        properties['Area Verde'] || 
        properties['green_area'] || 
        properties['GREEN_AREA']
      );

      totalArea += area;
      totalGreenArea += greenArea;

      // Conta tipos de camada
      layerTypes[type] = (layerTypes[type] || 0) + 1;
    });

    return {
      count: layerObjects.length,
      totalArea,
      totalGreenArea,
      averageArea: layerObjects.length > 0 ? totalArea / layerObjects.length : 0,
      averageGreenArea: layerObjects.length > 0 ? totalGreenArea / layerObjects.length : 0,
      layerTypes
    };
  }

  // ============================
  // Variáveis globais
  // ============================
  let chartArea = null;
  let chartAreaVerd = null;
  let highlightedLayers = [];
  let contributions = [];
  let currentLayerObjects = []; // Armazena objetos completos das camadas

  // ============================
  // Atualização de métricas
  // ============================
  function atualizarEstatisticas(dados) {
    const elements = {
      totalProps: document.getElementById('total-props'),
      totalArea: document.getElementById('total-area'),
      totalGreen: document.getElementById('total-green')
    };

    safelyExecute(() => {
      if (elements.totalProps) {
        elements.totalProps.textContent = dados.totalProps || 0;
      }
      if (elements.totalArea) {
        elements.totalArea.textContent = formatarArea(dados.totalArea || 0);
      }
      if (elements.totalGreen) {
        elements.totalGreen.textContent = formatarArea(dados.totalGreen || 0);
      }
    }, 'Erro ao atualizar estatísticas');
  }

  function atualizarListaPropriedades(lista) {
    const ul = document.getElementById('props-list');
    if (!ul) return;

    safelyExecute(() => {
      ul.innerHTML = '';
      
      if (!Array.isArray(lista)) {
        console.warn('Lista de propriedades não é um array');
        return;
      }

      lista.forEach((prop, index) => {
        try {
          const li = document.createElement('li');
          li.className = 'property-item';
          li.setAttribute('data-layer-id', prop.id || index);
          
          // Criar conteúdo mais detalhado
          const content = document.createElement('div');
          content.innerHTML = `
            <strong>${prop.nome || 'N/A'}</strong>
            <br>
            <small>Área Total: ${formatarArea(prop.areaTotal)} | Área Verde: ${formatarArea(prop.areaVerde)}</small>
            <br>
            <small>Tipo: ${prop.tipo || 'N/A'} | ID: ${prop.id || 'N/A'}</small>
          `;
          
          li.appendChild(content);
          
          // Adicionar evento de clique para destacar no mapa
          li.addEventListener('click', () => {
            highlightSpecificLayer(prop.id);
          });
          
          li.style.cursor = 'pointer';
          li.style.padding = '8px';
          li.style.margin = '4px 0';
          li.style.border = '1px solid #ddd';
          li.style.borderRadius = '4px';
          li.style.transition = 'background-color 0.2s';
          
          li.addEventListener('mouseenter', () => {
            li.style.backgroundColor = '#f0f0f0';
          });
          
          li.addEventListener('mouseleave', () => {
            li.style.backgroundColor = 'transparent';
          });
          
          ul.appendChild(li);
        } catch (error) {
          console.warn(`Erro ao criar item da lista ${index}:`, error);
        }
      });
    }, 'Erro ao atualizar lista de propriedades');
  }

  // ============================
  // Funções de destaque de camadas
  // ============================
  function highlightSpecificLayer(layerId) {
    safelyExecute(() => {
      // Remove destaque anterior
      resetHighlight();
      
      const layerObj = currentLayerObjects.find(obj => obj.id === layerId);
      if (layerObj && layerObj.layer && layerObj.layer.setStyle) {
        // Salva estilo original
        if (!layerObj.layer._originalStyle) {
          layerObj.layer._originalStyle = { ...layerObj.layer.options };
        }
        
        // Aplica destaque especial
        layerObj.layer.setStyle({
          color: '#00FF00',
          weight: 5,
          fillColor: '#00FF00',
          fillOpacity: 0.5
        });
        
        highlightedLayers.push(layerObj.layer);
        
        // Zoom para a camada se possível
        if (layerObj.bounds) {
          const map = findMapInstance();
          if (map && map.fitBounds) {
            map.fitBounds(layerObj.bounds, { padding: [20, 20] });
          }
        }
      }
    }, 'Erro ao destacar camada específica');
  }

  function resetHighlight() {
    highlightedLayers.forEach(layer => {
      safelyExecute(() => {
        if (layer._originalStyle && layer.setStyle && typeof layer.setStyle === 'function') {
          layer.setStyle(layer._originalStyle);
        }
      });
    });
    highlightedLayers = [];
  }

  // ============================
  // Chart.js
  // ============================
  function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') {
      try {
        chart.destroy();
      } catch (error) {
        console.warn('Erro ao destruir gráfico:', error);
      }
    }
  }

  function renderizarGrafico(idCanvas, labels, valores, cores) {
    const canvas = document.getElementById(idCanvas);
    if (!canvas) {
      console.warn(`Canvas não encontrado: ${idCanvas}`);
      return null;
    }

    return safelyExecute(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Não foi possível obter contexto 2D do canvas');
        return null;
      }

      // Verifica se Chart.js está disponível
      if (typeof Chart === 'undefined') {
        console.error('Chart.js não está carregado');
        return null;
      }

      // Destrói gráfico anterior
      if (idCanvas === 'chart-area') {
        destroyChart(chartArea);
        chartArea = null;
      }
      if (idCanvas === 'chart-areaverd') {
        destroyChart(chartAreaVerd);
        chartAreaVerd = null;
      }

      // Valida dados
      if (!Array.isArray(labels) || !Array.isArray(valores) || !Array.isArray(cores)) {
        console.warn('Dados inválidos para o gráfico');
        return null;
      }

      if (labels.length === 0) {
        console.info('Nenhum dado para exibir no gráfico');
        return null;
      }

      const chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: valores,
            backgroundColor: cores,
            borderWidth: 1,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                maxLength: 20
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = formatarArea(context.raw);
                  const percentage = ((context.raw / context.dataset.data.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
                  return `${context.label}: ${value} (${percentage}%)`;
                }
              }
            }
          },
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              const layerId = contributions[index]?.id;
              if (layerId) {
                highlightSpecificLayer(layerId);
              }
            }
          }
        }
      });

      if (idCanvas === 'chart-area') chartArea = chart;
      if (idCanvas === 'chart-areaverd') chartAreaVerd = chart;

      return chart;
    }, `Erro ao renderizar gráfico ${idCanvas}`);
  }

  // ============================
  // Treemap D3.js
  // ============================
  function renderTreemap(contributions) {
    const containerId = 'treemap-container';
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container do treemap não encontrado: ${containerId}`);
      return;
    }

    safelyExecute(() => {
      // Verifica se D3 está disponível
      if (typeof d3 === 'undefined') {
        console.error('D3.js não está carregado');
        return;
      }

      if (!Array.isArray(contributions) || contributions.length === 0) {
        console.info('Nenhum dado para o treemap');
        d3.select(`#${containerId}`).selectAll('*').remove();
        return;
      }

      const width = Math.max(container.clientWidth, 300);
      const height = CONFIG.TREEMAP_HEIGHT;

      // Remove SVG anterior
      d3.select(`#${containerId}`).selectAll('svg').remove();

      const svg = d3.select(`#${containerId}`)
                    .append('svg')
                    .attr('width', width)
                    .attr('height', height);

      const root = d3.hierarchy({ children: contributions })
                     .sum(d => Math.max(d.area || 0, 0))
                     .sort((a, b) => b.value - a.value);

      if (root.value === 0) {
        console.info('Nenhum valor válido para o treemap');
        return;
      }

      const treemap = d3.treemap()
                        .size([width, height])
                        .padding(4)
                        .round(true);

      treemap(root);

      const leaves = root.leaves();

      // Adiciona retângulos
      const rects = svg.selectAll('rect')
         .data(leaves)
         .join('rect')
         .attr('x', d => d.x0)
         .attr('y', d => d.y0)
         .attr('width', d => Math.max(0, d.x1 - d.x0))
         .attr('height', d => Math.max(0, d.y1 - d.y0))
         .attr('fill', (d, i) => `hsl(${i * 35 % 360}, 60%, 60%)`)
         .attr('stroke', '#ffffff')
         .attr('stroke-width', 1)
         .style('cursor', 'pointer')
         .on('click', function(event, d) {
           highlightSpecificLayer(d.data.id);
         })
         .on('mouseover', function(event, d) {
           d3.select(this).attr('opacity', 0.8);
           
           // Tooltip simples
           const tooltip = d3.select('body').append('div')
             .attr('class', 'treemap-tooltip')
             .style('position', 'absolute')
             .style('background', 'rgba(0,0,0,0.8)')
             .style('color', 'white')
             .style('padding', '8px')
             .style('border-radius', '4px')
             .style('font-size', '12px')
             .style('pointer-events', 'none')
             .style('left', (event.pageX + 10) + 'px')
             .style('top', (event.pageY - 10) + 'px')
             .html(`${d.data.id}<br>Área: ${formatarArea(d.data.area)}<br>Verde: ${formatarArea(d.data.areaverd)}`);
         })
         .on('mouseout', function() {
           d3.select(this).attr('opacity', 1);
           d3.selectAll('.treemap-tooltip').remove();
         });

      // Adiciona textos
      svg.selectAll('text')
         .data(leaves)
         .join('text')
         .attr('x', d => d.x0 + 4)
         .attr('y', d => d.y0 + 14)
         .text(d => {
           const maxWidth = d.x1 - d.x0 - 8;
           const text = d.data.id || 'N/A';
           return maxWidth > 50 ? text : text.substring(0, 8) + (text.length > 8 ? '...' : '');
         })
         .attr('font-size', '11px')
         .attr('font-family', 'Arial, sans-serif')
         .attr('fill', '#000')
         .attr('pointer-events', 'none');

    }, 'Erro ao renderizar treemap');
  }

  // ============================
  // Atualização completa
  // ============================
  function updateStats(orderBy = null) {
    return safelyExecute(() => {
      const map = findMapInstance();
      if (!map) {
        console.warn('Mapa não encontrado');
        return;
      }

      // Usar a nova função melhorada para obter camadas
      currentLayerObjects = getTargetLayers(map);

      // Resetar estilos de camadas destacadas
      resetHighlight();
      contributions = [];

      // Processar dados das camadas
      currentLayerObjects.forEach(layerObj => {
        try {
          const props = layerObj.properties;
          const id = layerObj.id;
          
          const area = parseNumber(props['Área'] || props['Area']);
          const areaverd = parseNumber(props['Área Verd'] || props['Area Verde']);
          
          if (area > 0 || areaverd > 0) {
            contributions.push({ 
              id, 
              area, 
              areaverd,
              tipo: layerObj.type,
              bounds: layerObj.bounds
            });
          }
        } catch (error) {
          console.warn('Erro ao processar layerObj:', error);
        }
      });

      // Destacar todas as camadas encontradas
      currentLayerObjects.forEach(layerObj => {
        safelyExecute(() => {
          if (layerObj.layer && layerObj.layer.setStyle && typeof layerObj.layer.setStyle === 'function') {
            if (!layerObj.layer._originalStyle) {
              layerObj.layer._originalStyle = { ...layerObj.layer.options };
            }
            layerObj.layer.setStyle(CONFIG.HIGHLIGHT_STYLE);
            highlightedLayers.push(layerObj.layer);
          }
        });
      });

      // Ordenação
      if (orderBy === 'area') {
        contributions.sort((a, b) => b.area - a.area);
      } else if (orderBy === 'areaverd') {
        contributions.sort((a, b) => b.areaverd - a.areaverd);
      }

      // Cálculos usando a nova função de estatísticas
      const stats = getLayersStatistics(currentLayerObjects);

      // Atualizar interface
      atualizarEstatisticas({
        totalProps: stats.count,
        totalArea: stats.totalArea,
        totalGreen: stats.totalGreenArea
      });

      const listaProps = contributions.map(c => ({
        id: c.id,
        nome: c.id,
        areaTotal: c.area,
        areaVerde: c.areaverd,
        tipo: c.tipo
      }));
      atualizarListaPropriedades(listaProps);

      // Preparar dados para gráficos
      const labels = contributions.map(c => c.id);
      const valoresArea = contributions.map(c => c.area);
      const valoresGreen = contributions.map(c => c.areaverd);
      const cores = labels.map((_, i) => 
        `hsl(${i * 35 % 360}, ${CONFIG.CHART_COLORS.saturation}%, ${CONFIG.CHART_COLORS.lightness}%)`
      );

      // Renderizar visualizações
      renderizarGrafico('chart-area', labels, valoresArea, cores);
      renderizarGrafico('chart-areaverd', labels, valoresGreen, cores);
      renderTreemap(contributions);

      // Log de estatísticas detalhadas
      console.info('=== Estatísticas Atualizadas ===');
      console.info(`Propriedades encontradas: ${stats.count}`);
      console.info(`Área total: ${formatarArea(stats.totalArea)}`);
      console.info(`Área verde total: ${formatarArea(stats.totalGreenArea)}`);
      console.info(`Tipos de camadas:`, stats.layerTypes);

    }, 'Erro ao atualizar estatísticas');
  }

  // ============================
  // Funções auxiliares para exportação e análise
  // ============================
  function exportData(format = 'json') {
    return safelyExecute(() => {
      if (!currentLayerObjects.length) {
        console.warn('Nenhum dado para exportar');
        return '';
      }

      const data = currentLayerObjects.map(({ id, properties, bounds, type }) => ({
        id,
        properties,
        bounds: bounds ? {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        } : null,
        type
      }));

      switch (format.toLowerCase()) {
        case 'csv':
          if (data.length === 0) return '';
          const headers = ['id', 'type', ...Object.keys(data[0].properties || {})];
          const csvRows = [headers.join(',')];
          
          data.forEach(item => {
            const row = [
              item.id,
              item.type,
              ...headers.slice(2).map(header => item.properties[header] || '')
            ];
            csvRows.push(row.join(','));
          });
          
          return csvRows.join('\n');

        case 'json':
        default:
          return JSON.stringify(data, null, 2);
      }
    }, 'Erro ao exportar dados');
  }

  function getAdvancedStats() {
    const stats = getLayersStatistics(currentLayerObjects);
    const advanced = {
      ...stats,
      contributions: [...contributions],
      greenAreaRatio: stats.totalArea > 0 ? (stats.totalGreenArea / stats.totalArea * 100) : 0,
      largestProperty: contributions.length > 0 ? 
        contributions.reduce((max, prop) => prop.area > max.area ? prop : max) : null,
      smallestProperty: contributions.length > 0 ? 
        contributions.reduce((min, prop) => prop.area < min.area ? prop : min) : null
    };
    return advanced;
  }

  // Expor API pública melhorada
  window.webmapStats = {
    updateStats,
    contributions: () => [...contributions],
    layerObjects: () => [...currentLayerObjects],
    resetHighlight,
    highlightLayer: highlightSpecificLayer,
    exportData,
    getStats: getAdvancedStats,
    findMap: findMapInstance,
    searchLayers: findLayersByCriteria
  };

  // ============================
  // Inicialização do painel
  // ============================
  function initStatsPanel() {
    safelyExecute(() => {
      const elements = {
        btn: document.getElementById('stats-btn'),
        panel: document.getElementById('stats-panel'),
        closeBtn: document.getElementById('close-panel'),
        sortAreaBtn: document.getElementById('sort-total'),
        sortGreenBtn: document.getElementById('sort-green'),
        exportBtn: document.getElementById('export-data'),
        refreshBtn: document.getElementById('refresh-stats')
      };

      if (!elements.btn || !elements.panel) {
        console.warn('Elementos essenciais do painel não encontrados');
        return;
      }

      // Configurações iniciais
      elements.panel.classList.add('hidden');
      elements.panel.style.scrollBehavior = 'smooth';

      function openPanel() {
        elements.panel.classList.remove('hidden');
        elements.panel.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => updateStats(), 100);
      }

      function closePanel() {
        elements.panel.classList.add('hidden');
        resetHighlight(); // Limpa destaques ao fechar
      }

      function togglePanel() {
        if (elements.panel.classList.contains('hidden')) {
          openPanel();
        } else {
          closePanel();
        }
      }

      // Event listeners principais
      elements.btn.addEventListener('click', togglePanel);

      if (elements.closeBtn) {
        elements.closeBtn.addEventListener('click', closePanel);
      }

      if (elements.sortAreaBtn) {
        elements.sortAreaBtn.addEventListener('click', () => {
          elements.sortAreaBtn.classList.add('active');
          if (elements.sortGreenBtn) elements.sortGreenBtn.classList.remove('active');
          updateStats('area');
        });
      }

      if (elements.sortGreenBtn) {
        elements.sortGreenBtn.addEventListener('click', () => {
          elements.sortGreenBtn.classList.add('active');
          if (elements.sortAreaBtn) elements.sortAreaBtn.classList.remove('active');
          updateStats('areaverd');
        });
      }

      if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', () => {
          console.info('Atualizando estatísticas...');
          updateStats();
        });
      }

      // Botão de exportação
      if (elements.exportBtn) {
        elements.exportBtn.addEventListener('click', () => {
          const exportMenu = document.getElementById('export-menu');
          if (exportMenu) {
            exportMenu.style.display = exportMenu.style.display === 'block' ? 'none' : 'block';
          } else {
            // Criar menu de exportação dinamicamente
            createExportMenu();
          }
        });
      }

      // Fechar ao clicar fora
      document.addEventListener('click', (event) => {
        if (elements.panel.classList.contains('hidden')) return;
        
        if (!elements.panel.contains(event.target) && 
            !elements.btn.contains(event.target)) {
          closePanel();
        }
      });

      // Atalhos de teclado
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !elements.panel.classList.contains('hidden')) {
          closePanel();
        }
        
        if (event.ctrlKey && event.key === 's' && !elements.panel.classList.contains('hidden')) {
          event.preventDefault();
          downloadData('json');
        }
      });

      // Atualização inicial com delay para garantir que o mapa esteja carregado
      setTimeout(() => {
        console.info('Inicializando painel de estatísticas...');
        updateStats();
      }, 1500);

      // Adicionar observador de redimensionamento para treemap
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
          if (!elements.panel.classList.contains('hidden')) {
            setTimeout(() => renderTreemap(contributions), 100);
          }
        });
        resizeObserver.observe(elements.panel);
      }

    }, 'Erro ao inicializar painel de estatísticas');
  }

  // ============================
  // Funções auxiliares para exportação
  // ============================
  function createExportMenu() {
    safelyExecute(() => {
      const exportBtn = document.getElementById('export-data');
      if (!exportBtn) return;

      // Remove menu existente
      const existingMenu = document.getElementById('export-menu');
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement('div');
      menu.id = 'export-menu';
      menu.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 1000;
        min-width: 150px;
        display: none;
      `;

      const exportOptions = [
        { label: 'JSON', format: 'json', icon: '📄' },
        { label: 'CSV', format: 'csv', icon: '📊' },
        { label: 'Estatísticas', format: 'stats', icon: '📈' },
        { label: 'Log Console', format: 'console', icon: '🖥️' }
      ];

      exportOptions.forEach(option => {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #eee;
          transition: background-color 0.2s;
        `;
        item.innerHTML = `${option.icon} ${option.label}`;
        
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#f0f0f0';
        });
        
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });
        
        item.addEventListener('click', () => {
          menu.style.display = 'none';
          handleExport(option.format);
        });
        
        menu.appendChild(item);
      });

      // Posicionar menu próximo ao botão
      document.body.appendChild(menu);
      const btnRect = exportBtn.getBoundingClientRect();
      menu.style.top = (btnRect.bottom + 5) + 'px';
      menu.style.left = btnRect.left + 'px';
      menu.style.display = 'block';

      // Fechar menu ao clicar fora
      setTimeout(() => {
        document.addEventListener('click', function closeMenu(event) {
          if (!menu.contains(event.target) && event.target !== exportBtn) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeMenu);
          }
        });
      }, 100);

    }, 'Erro ao criar menu de exportação');
  }

  function handleExport(format) {
    safelyExecute(() => {
      switch (format) {
        case 'json':
        case 'csv':
          downloadData(format);
          break;
          
        case 'stats':
          downloadStats();
          break;
          
        case 'console':
          logToConsole();
          break;
          
        default:
          console.warn('Formato de exportação não suportado:', format);
      }
    }, 'Erro ao exportar dados');
  }

  function downloadData(format) {
    const data = exportData(format);
    if (!data) {
      alert('Nenhum dado disponível para exportação');
      return;
    }

    const blob = new Blob([data], { 
      type: format === 'json' ? 'application/json' : 'text/csv' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webmap_stats_${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.info(`Dados exportados em formato ${format.toUpperCase()}`);
  }

  function downloadStats() {
    const stats = getAdvancedStats();
    const statsText = `
=== RELATÓRIO DE ESTATÍSTICAS WEBMAP ===
Data: ${new Date().toLocaleString('pt-BR')}

RESUMO GERAL:
- Total de propriedades: ${stats.count}
- Área total: ${formatarArea(stats.totalArea)}
- Área verde total: ${formatarArea(stats.totalGreenArea)}
- Proporção de área verde: ${stats.greenAreaRatio.toFixed(2)}%
- Área média por propriedade: ${formatarArea(stats.averageArea)}
- Área verde média: ${formatarArea(stats.averageGreenArea)}

MAIOR PROPRIEDADE:
${stats.largestProperty ? `- ID: ${stats.largestProperty.id}
- Área: ${formatarArea(stats.largestProperty.area)}
- Área Verde: ${formatarArea(stats.largestProperty.areaverd)}` : 'N/A'}

MENOR PROPRIEDADE:
${stats.smallestProperty ? `- ID: ${stats.smallestProperty.id}
- Área: ${formatarArea(stats.smallestProperty.area)}
- Área Verde: ${formatarArea(stats.smallestProperty.areaverd)}` : 'N/A'}

TIPOS DE CAMADAS:
${Object.entries(stats.layerTypes).map(([type, count]) => `- ${type}: ${count}`).join('\n')}

DETALHES POR PROPRIEDADE:
${contributions.map((prop, index) => 
`${index + 1}. ${prop.id}
   Área Total: ${formatarArea(prop.area)}
   Área Verde: ${formatarArea(prop.areaverd)}
   Proporção Verde: ${prop.area > 0 ? ((prop.areaverd / prop.area) * 100).toFixed(1) : 0}%`
).join('\n\n')}

=== FIM DO RELATÓRIO ===
    `;

    const blob = new Blob([statsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_webmap_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.info('Relatório de estatísticas exportado');
  }

  function logToConsole() {
    const stats = getAdvancedStats();
    console.group('📊 Estatísticas WebMap Detalhadas');
    console.info('📈 Resumo:', {
      propriedades: stats.count,
      areaTotal: formatarArea(stats.totalArea),
      areaVerde: formatarArea(stats.totalGreenArea),
      proporcaoVerde: stats.greenAreaRatio.toFixed(2) + '%'
    });
    console.info('🏆 Propriedade Maior:', stats.largestProperty);
    console.info('🏠 Propriedade Menor:', stats.smallestProperty);
    console.info('📋 Tipos de Camadas:', stats.layerTypes);
    console.table(contributions.map(c => ({
      ID: c.id,
      'Área (ha)': c.area.toFixed(2),
      'Área Verde (ha)': c.areaverd.toFixed(2),
      'Verde (%)': c.area > 0 ? ((c.areaverd / c.area) * 100).toFixed(1) : '0.0'
    })));
    console.groupEnd();
  }

  // ============================
  // Funções de teste e debug
  // ============================
  function runDiagnostics() {
    console.group('🔧 Diagnóstico WebMap Stats');
    
    // Teste do mapa
    const map = findMapInstance();
    console.info('Mapa encontrado:', map ? '✅' : '❌', map?.constructor.name || 'N/A');
    
    // Teste das bibliotecas
    console.info('Chart.js carregado:', typeof Chart !== 'undefined' ? '✅' : '❌');
    console.info('D3.js carregado:', typeof d3 !== 'undefined' ? '✅' : '❌');
    
    // Teste dos elementos DOM
    const elementos = ['stats-btn', 'stats-panel', 'chart-area', 'chart-areaverd', 'treemap-container'];
    elementos.forEach(id => {
      const el = document.getElementById(id);
      console.info(`Elemento ${id}:`, el ? '✅' : '❌');
    });
    
    // Teste das camadas
    if (map) {
      const layers = getTargetLayers(map);
      console.info(`Camadas encontradas: ${layers.length}`);
      if (layers.length > 0) {
        console.info('Exemplo de propriedades da primeira camada:', layers[0].properties);
      }
    }
    
    console.groupEnd();
  }

  // Adicionar à API pública
  window.webmapStats.diagnostics = runDiagnostics;
  window.webmapStats.createExportMenu = createExportMenu;
  window.webmapStats.downloadData = downloadData;

  // ============================
  // Inicialização
  // ============================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStatsPanel);
  } else {
    initStatsPanel();
  }

  // Cleanup ao descarregar a página
  window.addEventListener('beforeunload', () => {
    destroyChart(chartArea);
    destroyChart(chartAreaVerd);
    resetHighlight();
  });

  // Log de inicialização
  console.info('📊 WebMap Stats carregado com sucesso!');
  console.info('Use webmapStats.diagnostics() para verificar o status');

})();
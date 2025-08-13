// js/stats.js — versão atualizada para carregar arquivos JS e localizar grupo dinamicamente
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

  let lastContributions = [];

  // ===== Carrega scripts dinamicamente =====
  function loadLayerScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = file;
      script.onload = () => resolve(file);
      script.onerror = () => reject(file);
      document.head.appendChild(script);
    });
  }

  async function loadAllLayerScripts() {
    const files = targetLayerIds.map(id => `data/${id}.js`);
    const promises = files.map(f => loadLayerScript(f).catch(err => {
      console.warn(`Falha ao carregar ${err}`);
      return null;
    }));
    await Promise.all(promises);
    console.log('Todos os scripts carregados.');
  }

  // ===== Localiza grupo "Propriedades Aderidas" dinamicamente =====
  function findPropriedadesGroup(map) {
    if (!map || typeof map.eachLayer !== 'function') return null;
    let found = null;
    map.eachLayer(layer => {
      if (layer && layer.groupName === 'Propriedades Aderidas') {
        found = layer;
      }
    });
    return found;
  }

  // ===== Extrai camadas do grupo =====
  function getPropriedadesLayers() {
    const map = window.map || window._map || null;
    const group = findPropriedadesGroup(map);
    if (!group) return [];
    if (typeof group.getLayers === 'function') return group.getLayers();
    if (group._layers) return Object.values(group._layers);
    return [];
  }

  // ===== Atualiza estatísticas =====
  function updateStats() {
    const layers = getPropriedadesLayers();
    if (!layers.length) return;

    const totalPropsEl = document.getElementById('total-props');
    const totalAreaEl = document.getElementById('total-area');
    const totalGreenEl = document.getElementById('total-green');
    const propsListEl = document.getElementById('props-list');

    let totalArea = 0, totalAreaVerd = 0;
    const contributions = [];

    layers.forEach(layer => {
      let features = [];
      if (layer.feature) features = [layer.feature];
      else if (layer._layers) features = Object.values(layer._layers).map(l => l.feature).filter(f => f);

      features.forEach(f => {
        if (!f || !f.properties) return;
        const props = f.properties;
        const id = props.id || '—';
        if (!targetLayerIds.includes(String(id))) return;

        const area = parseNumber(props['Área'] || props['Area'] || props.area || 0);
        const areaVerd = parseNumber(props['Área Verd'] || props['Area Verd'] || props['ÁreaVerd'] || 0);

        totalArea += area;
        totalAreaVerd += areaVerd;

        contributions.push({
          name: `Propriedade ${id}`,
          area: area,
          areaverd: areaVerd
        });
      });
    });

    lastContributions = contributions.slice();

    if (totalPropsEl) totalPropsEl.textContent = contributions.length;
    if (totalAreaEl) totalAreaEl.textContent = totalArea.toLocaleString('pt-BR');
    if (totalGreenEl) totalGreenEl.textContent = totalAreaVerd.toLocaleString('pt-BR');

    if (propsListEl){
      propsListEl.innerHTML = '';
      contributions.forEach(c => {
        const li = document.createElement('li');
        li.textContent = `${c.name} — Área: ${c.area.toLocaleString('pt-BR')} | Área Verd: ${c.areaverd.toLocaleString('pt-BR')}`;
        propsListEl.appendChild(li);
      });
    }

    console.log('Estatísticas atualizadas:', { totalArea, totalAreaVerd, contributions });
  }

  // ===== Inicialização =====
  document.addEventListener('DOMContentLoaded', async function(){
    const btn = document.getElementById("stats-btn");
    const panel = document.getElementById("stats-panel");
    const closeBtn = document.getElementById("close-panel");

    if (!btn || !panel) return;

    // 1️⃣ Carrega todos os scripts JS
    await loadAllLayerScripts();

    // 2️⃣ Atualiza estatísticas após scripts carregados
    updateStats();

    // Controle do painel
    btn.addEventListener('click', () => {
      const computed = getComputedStyle(panel).display;
      panel.style.display = (computed === 'none') ? 'block' : 'none';
      if (computed === 'none') updateStats();
    });
    if (closeBtn) closeBtn.addEventListener('click', () => panel.style.display = 'none');
  });

  window.webmapStats = { updateStats };
})();
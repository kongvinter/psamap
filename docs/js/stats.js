// js/stats.js - versão resistente a problemas de timing
(function(){
    // utilitário para logar com um prefixo
    const log = (...args) => console.log("[STATS]", ...args);
    const warn = (...args) => console.warn("[STATS]", ...args);
    const err = (...args) => console.error("[STATS]", ...args);
  
    // Funções de UI (assumem que elementos existem no DOM)
    function bindUI() {
      const openBtn = document.getElementById("stats-btn");
      const closeBtn = document.getElementById("close-panel");
      if (openBtn) openBtn.addEventListener("click", () => {
        document.getElementById("stats-panel").classList.remove("hidden");
      });
      if (closeBtn) closeBtn.addEventListener("click", () => {
        document.getElementById("stats-panel").classList.add("hidden");
      });
    }
  
    // Funções de lógica (chart, cálculos, lista)
    function renderChart(totalArea, totalGreen) {
      const canvas = document.getElementById('areaChart');
      if (!canvas) { warn("Canvas #areaChart não encontrado."); return; }
      const ctx = canvas.getContext('2d');
      if (window.areaChartInstance) window.areaChartInstance.destroy();
      window.areaChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Área Total', 'Área Verde'],
          datasets: [{ label: 'Hectares', data: [totalArea, totalGreen], backgroundColor: ['#ffcc66','#66cc99'] }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
  
    function calculateStats(data) {
      const totalProps = data.length;
      const totalArea = data.reduce((s,p)=> s + (Number(p["Área"])||0), 0);
      const totalGreen = data.reduce((s,p)=> s + (Number(p["Área Verd"])||0), 0);
  
      const tp = document.getElementById("total-props");
      const ta = document.getElementById("total-area");
      const tg = document.getElementById("total-green");
      if (tp) tp.textContent = totalProps;
      if (ta) ta.textContent = totalArea.toFixed(2);
      if (tg) tg.textContent = totalGreen.toFixed(2);
  
      renderChart(totalArea, totalGreen);
    }
  
    function renderList(data, sortBy) {
      const listEl = document.getElementById("props-list");
      if (!listEl) { warn("Elemento #props-list não encontrado."); return; }
      const sorted = [...data].sort((a,b)=>(Number(b[sortBy])||0)-(Number(a[sortBy])||0));
      listEl.innerHTML = "";
      sorted.forEach(p=>{
        const nome = p.nome || p.name || p.NOME || "Propriedade";
        const valor = Number(p[sortBy]) || 0;
        const li = document.createElement("li");
        li.textContent = `${nome} - ${valor.toFixed(2)} ha`;
        listEl.appendChild(li);
      });
    }
  
    // Extrai propriedades das camadas conhecidas (tenta várias estratégias)
    function collectPropertiesFromMap(map) {
      const props = [];
  
      try {
        // 1) percorrer layers diretamente
        map.eachLayer(layer => {
          if (layer.feature && layer.feature.properties) props.push(layer.feature.properties);
          // se for um layer do tipo GeoJSON com eachLayer (grupo)
          else if (typeof layer.eachLayer === "function") {
            layer.eachLayer(l => {
              if (l.feature && l.feature.properties) props.push(l.feature.properties);
            });
          }
        });
      } catch (e) {
        warn("Erro ao iterar map.eachLayer:", e);
      }
  
      // 2) tentar varáveis globais geradas pelo qgis2web (ex: layer_*)
      if (props.length === 0) {
        for (const k of Object.keys(window)) {
          try {
            const v = window[k];
            if (!v) continue;
            // se for layer com eachLayer
            if (typeof v.eachLayer === "function") {
              v.eachLayer(l => {
                if (l.feature && l.feature.properties) props.push(l.feature.properties);
              });
            }
            // se for objeto geojson (feature)
            else if (v.feature && v.feature.properties) {
              props.push(v.feature.properties);
            }
          } catch(e) { /* silencioso */ }
        }
      }
  
      // Remover duplicados (por exemplo, se a mesma propriedade apareceu duas vezes)
      const unique = [];
      const seen = new Set();
      for (const p of props) {
        // tenta identificar por algum id, se houver
        const id = p.id || p.ID || p.Id || (p.name? p.name + JSON.stringify(p): JSON.stringify(p));
        if (!seen.has(id)) { seen.add(id); unique.push(p); }
      }
  
      return unique;
    }
  
    // Função principal que inicializa tudo quando tiver um mapa pronto
    function initWithMap(map) {
      log("Usando map existente.");
      bindUI();
  
      // coletar dados e popular UI
      const propertiesData = collectPropertiesFromMap(map);
      if (propertiesData.length === 0) warn("Nenhuma propriedade encontrada no mapa. Verifique nomes de campos e camadas.");
      calculateStats(propertiesData);
      renderList(propertiesData, 'Área Verd');
  
      // Vincular botões de ordenação, se existirem
      const sortGreen = document.getElementById("sort-green");
      const sortTotal = document.getElementById("sort-total");
      if (sortGreen) sortGreen.addEventListener("click", ()=> renderList(propertiesData, 'Área Verd'));
      if (sortTotal) sortTotal.addEventListener("click", ()=> renderList(propertiesData, 'Área'));
    }
  
    // Fallback simples (sem map): apenas vincula UI para evitar erros e informa o usuário
    function initFallback() {
      warn("map não encontrado. Vinculando apenas UI (sem dados).");
      bindUI();
      // mostra aviso visual se quiser
      const panel = document.getElementById("stats-panel");
      if (panel) {
        const p = document.createElement("p");
        p.style.color = "crimson";
        p.textContent = "Mapa não encontrado - estatísticas indisponíveis.";
        panel.insertBefore(p, panel.firstChild);
      }
    }
  
    // Espera DOM pronto, depois procura map
    document.addEventListener("DOMContentLoaded", ()=>{
      let attempts = 0;
      const maxAttempts = 12; // ~ 6s
      const interval = 500; // ms
  
      const tryAttach = () => {
        attempts++;
        if (typeof window.map !== "undefined") {
          // se o map existir, espera whenReady
          try {
            window.map.whenReady(()=> initWithMap(window.map));
            log("map encontrado; aguardando whenReady...");
          } catch(e) {
            // se whenReady não existir, inicia direto
            log("map encontrado mas whenReady falhou — inicializando direto.");
            initWithMap(window.map);
          }
          clearInterval(timer);
          return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(timer);
          initFallback();
          return;
        }
        // senão, aguarda mais
      };
  
      const timer = setInterval(tryAttach, interval);
      // primeira tentativa imediata
      tryAttach();
    });
  })();
  
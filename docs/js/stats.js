// Array para armazenar propriedades
let propertiesData = [];

// Supondo que seu mapa Leaflet esteja em uma variável chamada 'map'
map.eachLayer(layer => {
    if (layer.feature && layer.feature.properties) {
        propertiesData.push(layer.feature.properties);
    }
});

// Função para calcular e mostrar estatísticas
function calculateStats(data) {
    const totalProps = data.length;
    const totalArea = data.reduce((sum, p) => sum + (p["Área"] || 0), 0);
    const totalGreen = data.reduce((sum, p) => sum + (p["Área Verd"] || 0), 0);

    document.getElementById("total-props").textContent = totalProps;
    document.getElementById("total-area").textContent = totalArea.toFixed(2);
    document.getElementById("total-green").textContent = totalGreen.toFixed(2);

    renderChart(totalArea, totalGreen);
}

// Função para desenhar o gráfico
function renderChart(totalArea, totalGreen) {
    const ctx = document.getElementById('areaChart').getContext('2d');
    // Se já tiver um gráfico anterior, destruir para evitar sobreposição
    if(window.areaChartInstance) {
        window.areaChartInstance.destroy();
    }
    window.areaChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Área Total', 'Área Verde'],
            datasets: [{
                label: 'Hectares',
                data: [totalArea, totalGreen],
                backgroundColor: ['#ffcc66', '#66cc99']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });
}

// Função para listar propriedades com ordenação
function renderList(data, sortBy) {
    const sorted = [...data].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    const list = document.getElementById("props-list");
    list.innerHTML = "";
    sorted.forEach(p => {
        const valor = p[sortBy] || 0;
        const nome = p.nome || 'Propriedade';
        const li = document.createElement("li");
        li.textContent = ${nome} - ${valor.toFixed(2)} ha;
        list.appendChild(li);
    });
}

// Abrir painel
document.getElementById("stats-btn").addEventListener("click", () => {
    document.getElementById("stats-panel").classList.remove("hidden");
});

// Fechar painel
document.getElementById("close-panel").addEventListener("click", () => {
    document.getElementById("stats-panel").classList.add("hidden");
});

// Ordenar por Área Verde
document.getElementById("sort-green").addEventListener("click", () => {
    renderList(propertiesData, 'Área Verd');
});

// Ordenar por Área Total
document.getElementById("sort-total").addEventListener("click", () => {
    renderList(propertiesData, 'Área');
});

// Inicialização
calculateStats(propertiesData);
renderList(propertiesData, 'Área Verd');
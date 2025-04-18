// plot.js

// Khởi tạo các biến toàn cục để lưu trữ các instance của Chart.js
let charts = {};

document.addEventListener("DOMContentLoaded", function () {
    fetchData();
});

document.getElementById("deviceIp").addEventListener("change", fetchData);
document.getElementById("deviceId").addEventListener("change", fetchData);
document.getElementById("timeRange").addEventListener("change", fetchData);

async function fetchData() {
    const ip = document.getElementById("deviceIp").value;
    const id = document.getElementById("deviceId").value;
    const range = document.getElementById("timeRange").value;

    try {
        const response = await fetch(`http://localhost:3000/get_data?ip=${ip}&id=${id}&range=${range}`);
        const data = await response.json();

        if (!data || data.length === 0) {
            console.warn("⚠️ Không có dữ liệu để hiển thị!");
            return;
        }

        // Kiểm tra dữ liệu để tìm nguyên nhân các đường thẳng
        console.log("Dữ liệu Dòng điện:", data.map(row => ({
            current1: row.current1,
            current2: row.current2,
            current3: row.current3
        })));

        // Lưu trữ thời gian gốc (dạng Date) để sử dụng trong tooltip
        const timestamps = data.map(row => new Date(row.timestamp));
        const labels = timestamps.map(date => date.toLocaleTimeString());

        const datasets = {
            voltage: [
                { label: "Điện áp pha A", data: data.map(row => row.volts_4), borderColor: "red", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Điện áp pha B", data: data.map(row => row.volts_5), borderColor: "blue", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Điện áp pha C", data: data.map(row => row.volts_6), borderColor: "green", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 }
            ],
            current: [
                { label: "Dòng điện A", data: data.map(row => row.current1), borderColor: "red", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Dòng điện B", data: data.map(row => row.current2), borderColor: "blue", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Dòng điện C", data: data.map(row => row.current3), borderColor: "green", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 }
            ],
            power: [
                { label: "Công suất A", data: data.map(row => row.power1), borderColor: "red", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Công suất B", data: data.map(row => row.power2), borderColor: "blue", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Công suất C", data: data.map(row => row.power3), borderColor: "green", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 }
            ],
            harmonic: [
                { label: "Sóng hài A", data: data.map(row => row.hdia), borderColor: "red", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Sóng hài B", data: data.map(row => row.hdib), borderColor: "blue", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 },
                { label: "Sóng hài C", data: data.map(row => row.hdic), borderColor: "green", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 }
            ],
            powerFactor: [
                { label: "Hệ số công suất tổng", data: data.map(row => row.power_factor_total), borderColor: "orange", borderWidth: 2, fill: false, tension: 0.1, pointRadius: 0 }
            ]
        };

        updateCharts(labels, datasets, timestamps);
    } catch (error) {
        console.error("❌ Lỗi khi lấy dữ liệu từ API:", error);
    }
}

function updateCharts(labels, datasets, timestamps) {
    destroyCharts();

    charts.voltage = createChart("chartVoltage", labels, datasets.voltage, "Điện áp (V)", timestamps);
    charts.current = createChart("chartCurrent", labels, datasets.current, "Dòng điện (A)", timestamps);
    charts.power = createChart("chartPower", labels, datasets.power, "Công suất (W)", timestamps);
    charts.harmonic = createChart("chartHarmonic", labels, datasets.harmonic, "Sóng hài (%)", timestamps);
    charts.powerFactor = createChart("chartPowerFactor", labels, datasets.powerFactor, "Hệ số công suất", timestamps);
}

function destroyCharts() {
    for (let key in charts) {
        if (charts[key]) charts[key].destroy();
    }
}

function createChart(canvasId, labels, datasets, yAxisLabel, timestamps) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    return new Chart(ctx, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: "bottom"
                },
                tooltip: {
                    enabled: true,
                    mode: 'index', // Hiển thị tooltip cho tất cả các dataset tại cùng một điểm trên trục x
                    intersect: false, // Hiển thị tooltip ngay cả khi không rê chuột trực tiếp lên điểm dữ liệu
                    callbacks: {
                        // Tùy chỉnh tiêu đề tooltip (thời gian)
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const date = timestamps[index];
                            // Định dạng thời gian giống như "28/02/2024 6:15:00 SA"
                            const day = String(date.getDate()).padStart(2, '0');
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const year = date.getFullYear();
                            const hours = String(date.getHours() % 12 || 12).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            const seconds = String(date.getSeconds()).padStart(2, '0');
                            const period = date.getHours() >= 12 ? 'CH' : 'SA';
                            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} ${period}`;
                        },
                        // Tùy chỉnh nội dung tooltip (tên tham số và giá trị)
                        label: function(tooltipItem) {
                            const datasetLabel = tooltipItem.dataset.label;
                            const value = tooltipItem.raw.toFixed(1); // Làm tròn giá trị đến 1 chữ số thập phân
                            return `${datasetLabel}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: "Thời gian"
                    },
                    grid: {
                        display: true,
                        color: "rgba(0, 0, 0, 0.1)"
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: yAxisLabel
                    },
                    beginAtZero: false,
                    suggestedMin: 0,
                    suggestedMax: datasets[0].data.reduce((a, b) => Math.max(a, b), 0) * 1.2,
                    grid: {
                        color: "rgba(0, 0, 0, 0.1)"
                    }
                }
            }
        }
    });
}

// Ẩn/Hiện biểu đồ dựa vào checkbox
document.addEventListener("DOMContentLoaded", function () {
    const checkboxes = document.querySelectorAll(".toggle-chart");

    checkboxes.forEach(checkbox => {
        checkbox.addEventListener("change", function () {
            let chartId = this.dataset.target + "-wrapper";
            let chartElement = document.getElementById(chartId);

            if (this.checked) {
                chartElement.style.display = "block";
            } else {
                chartElement.style.display = "none";
            }
        });
    });
});

// Cập nhật kích thước khi thay đổi màn hình
window.addEventListener("resize", () => {
    for (let key in charts) {
        if (charts[key]) charts[key].resize();
    }
});
/**
 * 从 Cloudflare R2 下载 latest_threat_report.bin，
 * 解析 1024 个 float32 威胁分数，并用 Chart.js 绘制曲线图。
 *
 * 依赖：Chart.js（在 HTML 中引入 https://cdn.jsdelivr.net/npm/chart.js）
 *
 * 用法：
 *   <canvas id="threatChart"></canvas>
 *   <script src="threat-chart.js"></script>
 *   <script>loadThreatChart('threatChart');</script>
 */

const R2_BASE_URL = window.ENV_R2_PUBLIC_URL || '';
const BIN_FILE_PATH = 'latest_threat_report.bin';
const FLOAT32_COUNT = 1024;

/**
 * 从 R2 下载二进制文件并解析为 Float32Array
 * @param {string} url - 完整的文件 URL
 * @returns {Promise<Float32Array>}
 */
async function fetchThreatScores(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status} - ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();

  const expectedBytes = FLOAT32_COUNT * 4; // 每个 float32 占 4 字节
  if (buffer.byteLength < expectedBytes) {
    throw new Error(
      `文件大小异常：期望至少 ${expectedBytes} 字节，实际 ${buffer.byteLength} 字节`
    );
  }

  return new Float32Array(buffer, 0, FLOAT32_COUNT);
}

/**
 * 生成横轴标签（模拟棒球飞行时间轴，单位：帧）
 * @returns {string[]}
 */
function generateLabels() {
  return Array.from({ length: FLOAT32_COUNT }, (_, i) => {
    if (i === 0) return '投球';
    if (i === FLOAT32_COUNT - 1) return '落点';
    if (i % 128 === 0) return `第 ${i} 帧`;
    return '';
  });
}

/**
 * 将 threat_score 映射到颜色（低分蓝色 → 高分红色）
 * @param {number} score - 0.0 ~ 1.0
 * @returns {string} rgba 颜色字符串
 */
function scoreToColor(score) {
  const r = Math.round(score * 220);
  const b = Math.round((1 - score) * 220);
  return `rgba(${r}, 60, ${b}, 0.8)`;
}

/**
 * 在指定 canvas 上渲染棒球飞行轨迹威胁程度曲线图
 * @param {string} canvasId - canvas 元素的 id
 * @param {string} [r2BaseUrl] - R2 公开访问 base URL（可选，覆盖全局配置）
 */
async function loadThreatChart(canvasId, r2BaseUrl) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`找不到 canvas 元素：#${canvasId}`);
    return;
  }

  const ctx = canvas.getContext('2d');

  // 显示加载状态
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'center';
  ctx.fillText('正在加载威胁数据...', canvas.width / 2, canvas.height / 2);

  try {
    const baseUrl = (r2BaseUrl || R2_BASE_URL).replace(/\/$/, '');
    const fileUrl = `${baseUrl}/${BIN_FILE_PATH}`;

    console.log(`[ThreatChart] 正在从 ${fileUrl} 下载数据...`);
    const scores = await fetchThreatScores(fileUrl);
    console.log(`[ThreatChart] 成功解析 ${scores.length} 个威胁分数`);

    const labels = generateLabels();
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // 按威胁分值生成点颜色
    const pointColors = Array.from(scores).map(scoreToColor);

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '威胁分数 (Threat Score)',
            data: Array.from(scores),
            borderColor: 'rgba(220, 80, 60, 0.9)',
            backgroundColor: 'rgba(220, 80, 60, 0.08)',
            pointBackgroundColor: pointColors,
            pointRadius: scores.length <= 256 ? 3 : 1,
            pointHoverRadius: 6,
            borderWidth: 1.5,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
          },
          title: {
            display: true,
            text: `棒球飞行轨迹威胁程度分析  |  峰值: ${maxScore.toFixed(4)}  |  均值: ${avgScore.toFixed(4)}`,
            font: { size: 15 },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val = ctx.parsed.y;
                const level =
                  val >= 0.8
                    ? '🔴 极高威胁'
                    : val >= 0.6
                    ? '🟠 高威胁'
                    : val >= 0.4
                    ? '🟡 中等威胁'
                    : val >= 0.2
                    ? '🟢 低威胁'
                    : '⚪ 极低威胁';
                return `${level}  分值: ${val.toFixed(6)}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: '飞行帧序列（投球 → 落点）',
            },
            ticks: {
              maxTicksLimit: 16,
              autoSkip: true,
            },
          },
          y: {
            min: 0,
            max: 1,
            title: {
              display: true,
              text: '威胁分数 (0.0 ~ 1.0)',
            },
            ticks: {
              stepSize: 0.1,
            },
            grid: {
              color: (ctx) => {
                if (ctx.tick.value >= 0.8) return 'rgba(220,60,60,0.3)';
                if (ctx.tick.value >= 0.6) return 'rgba(220,140,60,0.2)';
                return 'rgba(0,0,0,0.06)';
              },
            },
          },
        },
      },
    });

    console.log('[ThreatChart] 图表渲染完成');
  } catch (err) {
    console.error('[ThreatChart] 错误：', err);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#c00';
    ctx.textAlign = 'center';
    ctx.fillText(`加载失败：${err.message}`, canvas.width / 2, canvas.height / 2);
  }
}

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const http = require("http");

let mainWindow = null;
let serverProcess = null;
const PORT = 3099;

// 项目根目录：开发时在上一级，打包后在 resources/app
const PROJECT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

function createWindow() {
  // 隐藏菜单栏
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: "OpenSpeech - 启动中...",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: "#f0f4f9",
  });

  mainWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f9;font-family:sans-serif;">
      <div style="text-align:center;">
        <h1 style="background:linear-gradient(135deg,#4285f4,#ea4335,#fbbc04,#34a853);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:2.5rem;">OpenSpeech</h1>
        <p style="color:#94a3b8;margin-top:12px;">正在启动服务，请稍候...</p>
      </div>
    </body>
    </html>
  `);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function loadEnv() {
  try {
    const fs = require("fs");
    const envPath = path.join(PROJECT_DIR, ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const envVars = {};
      envContent.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            process.env[key] = value;
            envVars[key] = value;
          }
        }
      });
      console.log("[OpenSpeech] .env.local loaded");
      return envVars;
    }
  } catch (e) {
    console.warn("[OpenSpeech] Failed to load .env.local:", e.message);
  }
  return {};
}

// 等待服务就绪
function waitForServer(port, maxWait = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > maxWait) {
        return reject(new Error("服务启动超时"));
      }
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(check, 200));
      req.end();
    };
    check();
  });
}

async function startNextServer() {
  process.env.NODE_ENV = "production";
  const envVars = loadEnv();

  // standalone 模式：直接运行 .next/standalone/server.js
  const serverScript = path.join(PROJECT_DIR, ".next", "standalone", "server.js");
  const fs = require("fs");

  if (!fs.existsSync(serverScript)) {
    throw new Error("找不到 standalone server.js，请先运行 npm run build");
  }

  console.log("[OpenSpeech] Starting standalone server:", serverScript);

  serverProcess = fork(serverScript, [], {
    cwd: path.join(PROJECT_DIR, ".next", "standalone"),
    env: {
      ...process.env,
      ...envVars,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
    },
    stdio: "pipe",
  });

  serverProcess.stdout?.on("data", (d) => console.log("[Next]", d.toString().trim()));
  serverProcess.stderr?.on("data", (d) => console.error("[Next]", d.toString().trim()));

  serverProcess.on("error", (err) => {
    console.error("[OpenSpeech] Server process error:", err);
  });

  await waitForServer(PORT);
  console.log(`[OpenSpeech] Server ready on http://localhost:${PORT}`);
}

app.whenReady().then(async () => {
  createWindow();

  try {
    await startNextServer();
    if (mainWindow) {
      mainWindow.setTitle("OpenSpeech");
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  } catch (err) {
    console.error("[OpenSpeech] Failed to start:", err);
    if (mainWindow) {
      mainWindow.loadURL(`data:text/html;charset=utf-8,
        <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f9;font-family:sans-serif;">
          <div style="text-align:center;max-width:500px;">
            <h1 style="color:#ea4335;font-size:1.5rem;">启动失败</h1>
            <p style="color:#94a3b8;margin-top:12px;word-break:break-all;">${String(err.message || err)}</p>
          </div>
        </body>
        </html>
      `);
    }
  }
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

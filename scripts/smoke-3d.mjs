import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Uses an installed Chrome and native CDP: no browser download or test runtime dependency.
const origin = process.env.MYCF_TEST_URL || "http://127.0.0.1:5173";
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const directory = await mkdtemp(join(tmpdir(), "mycf-3d-"));
// LaunchServices may run Chrome as the desktop login user instead of the shell user.
if (process.platform === "darwin") await chmod(directory, 0o777);
const flags = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${directory}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--no-proxy-server", "--window-size=1440,900", "about:blank"];
const browser = process.platform === "darwin" && chrome.includes(".app/")
  ? spawn("/usr/bin/open", ["-n", "-a", chrome.split("/Contents/")[0], "--args", ...flags], { stdio: ["ignore", "ignore", "pipe"] })
  : spawn(chrome, flags, { stdio: ["ignore", "ignore", "pipe"] });
let launchError = "";
browser.stderr.on("data", chunk => { launchError = (launchError + chunk).slice(-4000); });
let socket;
const errors = [];
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await delay(100); }
  }
  assert.ok(port, `Chrome did not expose its debugging port: ${launchError}`);
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find(item => item.type === "page");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  let sequence = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(new Error(JSON.stringify(message.error)));
      else entry?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map(item => item.value || item.description).join(" "));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}; errors: ${errors.join("\n")}`)); }, method === "Page.navigate" ? 60000 : 20000);
    pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out: ${expression}; errors: ${errors.join("\n")}`);
  };
  const screenshot = async name => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(directory, `${name}.png`), Buffer.from(data, "base64"));
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(`Opening ${origin}; screenshots: ${directory}`);
  await send("Page.navigate", { url: origin });
  await waitFor(`document.querySelector('#start-button') && document.querySelector('#start-button').textContent.trim()`);
  await delay(2000);
  assert.equal(await evaluate(`document.querySelector('#render-error').classList.contains('is-hidden')`), true, errors.join("\n"));
  await evaluate(`window.__renderStats=[];document.querySelector('#game').addEventListener('render-stats',event=>window.__renderStats.push(event.detail))`);
  await screenshot("lobby-city");
  await evaluate(`document.querySelector('[data-version="solo"]').click();document.querySelector('[data-mode="16v16"]').click();document.querySelector('[data-loadout="raider"]').click();document.querySelector('#start-button').click()`);
  await waitFor(`document.querySelector('#landing').classList.contains('is-hidden')`);
  await delay(3000);
  await screenshot("combat-city");
  const gl = await evaluate(`(()=>{const gl=document.querySelector('#game').getContext('webgl2');return {version:gl.getParameter(gl.VERSION),error:gl.getError(),lost:gl.isContextLost(),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}})()`);
  assert.equal(gl.error, 0);
  assert.equal(gl.lost, false);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}))`);
  await delay(1200);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));window.dispatchEvent(new MouseEvent('mouseup',{button:0}))`);
  await screenshot("fire-city");
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit2'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit2'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyG'}))`);
  await delay(500);
  assert.ok(await evaluate(`document.querySelector('#weapon-name').textContent.trim()`));
  const cityStats = await evaluate(`window.__renderStats`);
  await evaluate(`localStorage.setItem('toon-strike.game-setup.v1',JSON.stringify({versionId:'solo',mapId:'wild',modeId:'4v4',loadoutId:'archer',characterId:'specialForces',conditionId:'standard'}));location.reload()`);
  await waitFor(`document.querySelector('[data-map="wild"]')?.classList.contains('selected')`);
  await delay(1000);
  await screenshot("lobby-wild");
  await evaluate(`document.querySelector('#start-button').click()`);
  await waitFor(`document.querySelector('#landing').classList.contains('is-hidden')`);
  await delay(1500);
  await screenshot("combat-wild");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(700);
  await screenshot("combat-mobile");
  assert.equal(await evaluate(`document.querySelector('#render-error').classList.contains('is-hidden')`), true);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  assert.deepEqual(errors, [], "Browser runtime or shader compilation failed");
  console.log(JSON.stringify({ result: "passed", gl, cityStats, screenshots: directory }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    await delay(500);
  }
  socket?.close();
  browser.kill("SIGTERM");
  await Promise.race([new Promise(resolve => browser.once("exit", resolve)), delay(3000)]);
  if (browser.exitCode === null) browser.kill("SIGKILL");
  // Preserve screenshots, but remove the isolated Chrome profile after the process exits.
  for (const name of ["Default", "ShaderCache", "GrShaderCache", "GraphiteDawnCache"]) await rm(join(directory, name), { recursive: true, force: true }).catch(() => {});
}

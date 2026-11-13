// RPG Maker MV（v1 / v2 会话）「这是不是本作存档」判定的回归。
//
// 背景：MV 内置 DataManager.isThisGameFile 在**非本地模式**下要求存档的 info.title
// 等于 $dataSystem.gameTitle，不符就判定「不是本作存档」——标题页的「继续游戏」不亮，
// DataManager.loadGame() 直接返回 false（不抛异常）。这条校验是为浏览器同源共用
// localStorage 设计的；而 Tyranor 的存档目录本来就按游戏隔离（默认
// <游戏根>/savedata，开启独立存档目录后 external/save/tyrano/<safeSaveName>），
// title 只是展示字段。BB_CustomSaveWindow 一类插件会把 info.title 改写成章节名
// （如「第2章『欢乐街与夜之王(前篇)』」），于是本作存档被判成他人的。
// 全局存档列表（存档管理 / 修改器）走 loadSavefileInfo，不校验 title，所以现象是
// 「看得到槽位却读不进去」。
//
// 本 harness 在 Node 的 vm 里加载仓库**真实打包**的 rpg_core.js / rpg_managers.js，
// 再加载真实注入的 __rpg_v12.js，配一个假的 saveDataManager 桥把存/读跑通：
//   - v1 模型：仓库打包核心（rpgmaker/rpgmv-v1/js，含既有的 globalInfo 清洗加固）
//   - v2 模型：游戏自带原版核心——这里把官方 MV 1.6.1 的 isThisGameFile 原样装回去，
//     再交给同一个 hook，验证兼容逻辑不依赖仓库那份核心的特定实现
// DataManager.createGameObjects / extractSaveContents 置空：本用例只考察那道门禁，
// 不把 rpg_objects.js 拖进来。
//
// 运行：node rpg-save-identity.harness.js（或 ./gradlew :engine:jsSaveIdentityHarness）
'use strict';

const nodeRequire = require;
const fs = nodeRequire('fs');
const nodePath = nodeRequire('path');
const vm = nodeRequire('vm');

const JS_DIR = __dirname;
const ASSETS = nodePath.resolve(JS_DIR, '..', '..', 'main', 'assets');
const HOOK = nodePath.join(ASSETS, 'rpgmaker', '__rpg_v12.js');
const V0_HOOK = nodePath.join(ASSETS, '__rpg__.js');
const BUNDLED_CORE = nodePath.join(ASSETS, 'rpgmaker', 'rpgmv-v1', 'js');

// 官方 MV 1.6.1 的实现，逐字取自游戏自带的 js/rpg_managers.js（v2 会话真正跑的就是它）
const VANILLA_IS_THIS_GAME_FILE = `
DataManager.isThisGameFile = function(savefileId) {
    var globalInfo = this.loadGlobalInfo();
    if (globalInfo && globalInfo[savefileId]) {
        if (StorageManager.isLocalMode()) {
            return true;
        } else {
            var savefile = globalInfo[savefileId];
            return (savefile.globalId === this._globalId &&
                    savefile.title === $dataSystem.gameTitle);
        }
    } else {
        return false;
    }
};
`;

let failed = 0;
let total = 0;
const isThenable = (v) => !!(v && typeof v.then === 'function');
function check(name, cond, extra) {
    total++;
    if (isThenable(cond)) {
        failed++;
        console.log('  FAIL  ' + name + '  -> 断言值是 Promise（恒真）；请 await 后传布尔值');
        return;
    }
    if (typeof cond === 'function') {
        failed++;
        console.log('  FAIL  ' + name + '  -> 断言值未调用（函数对象恒真）');
        return;
    }
    if (cond) {
        console.log('  ok    ' + name);
    } else {
        failed++;
        console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
    }
}

// ---- PIXI 宽容桩：只为让 rpg_core.js 的 prototype 继承与 PIXI.xxx.FLAG = … 跑通 ----
function makeStubNode() {
    const target = function () {};
    target.prototype = {};
    return new Proxy(target, {
        get(t, p) {
            if (p === 'prototype') return t.prototype;
            if (p in t) return t[p];
            const child = makeStubNode();
            t[p] = child;
            return child;
        },
        set(t, p, v) { t[p] = v; return true; },
    });
}

function makeBridge() {
    const store = new Map();
    return {
        store,
        Save: (k, v) => { store.set(String(k), String(v)); return true; },
        Load: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        Exists: (k) => store.has(String(k)),
        Remove: (k) => { store.delete(String(k)); return true; },
    };
}

// ---- 起一个「Tyranor v1/v2 会话」沙箱 ----
function makeSession({ vanillaIdentity }) {
    const sandbox = {};
    const ctx = vm.createContext(sandbox);
    vm.runInContext('window = globalThis; self = globalThis; global = globalThis;', ctx);

    const el = () => ({
        style: {}, appendChild() {}, removeChild() {}, setAttribute() {},
        getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: [] }) }),
        addEventListener() {}, removeEventListener() {}, focus() {},
    });
    const lsMap = new Map();
    sandbox.document = {
        documentElement: el(), body: el(), head: el(),
        createElement: el, getElementById: () => null,
        addEventListener() {}, removeEventListener() {},
        fullscreenElement: null, webkitFullscreenElement: null,
    };
    sandbox.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36', language: 'zh-CN' };
    sandbox.location = { href: 'http://127.0.0.1:8080/index.html', reload() {} };
    sandbox.localStorage = {
        getItem: (k) => (lsMap.has(String(k)) ? lsMap.get(String(k)) : null),
        setItem: (k, v) => { lsMap.set(String(k), String(v)); },
        removeItem: (k) => { lsMap.delete(String(k)); },
    };
    sandbox.console = console;
    sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
    sandbox.setInterval = setInterval; sandbox.clearInterval = clearInterval;
    sandbox.requestAnimationFrame = () => 0;
    sandbox.performance = { now: () => Date.now() };
    sandbox.Image = function () { this.addEventListener = () => {}; };
    sandbox.Audio = function () { this.addEventListener = () => {}; };
    sandbox.URL = URL;
    sandbox.PIXI = makeStubNode();
    const bridge = makeBridge();
    sandbox.window.saveDataManager = bridge;
    sandbox.__tyranorRpg = { engine: 'rpgmaker', version: vanillaIdentity ? 'v2' : 'v1' };

    const run = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    run(nodePath.join(BUNDLED_CORE, 'libs', 'lz-string.js'));
    run(nodePath.join(BUNDLED_CORE, 'rpg_core.js'));
    run(nodePath.join(BUNDLED_CORE, 'rpg_managers.js'));
    if (vanillaIdentity) {
        vm.runInContext(VANILLA_IS_THIS_GAME_FILE, ctx, { filename: 'vanilla-isThisGameFile' });
    }

    const box = { ctx, bridge, run, loadHook: () => run(HOOK) };
    vm.runInContext(`
        $dataSystem = { gameTitle: "夜の街RPG", startMapId: 1, startX: 0, startY: 0 };
        DataManager._globalId = "RPGMV";
        // BB_CustomSaveWindow 一类插件：复用标准 title 字段写章节名
        var __origMakeSavefileInfo = DataManager.makeSavefileInfo;
        DataManager.makeSavefileInfo = function () {
            var info = __origMakeSavefileInfo.call(this);
            info.title = "第2章『欢乐街与夜之王(前篇)』";
            return info;
        };
        // 本用例只考察存档身份门禁，落盘后的反序列化不参与
        DataManager.createGameObjects = function () {};
        DataManager.extractSaveContents = function () {};
        DataManager.makeSaveContents = function () { return { marker: "save-contents" }; };
    `, ctx);
    return box;
}

function saveTwoSlots(box) {
    vm.runInContext(`
        DataManager.saveGameWithoutRescue(1);
        DataManager.saveGameWithoutRescue(2);
        DataManager._globalInfo = null;
    `, box.ctx);
    return box;
}

function probe(box, expr) {
    return vm.runInContext(expr, box.ctx);
}

// v1 用仓库打包核心、v2 用游戏自带原版核心：两者的 isThisGameFile 必须是**不同**的实现，
// 否则下面两轮其实在测同一条代码路径，「两套实现都兼容」的结论就站不住。
const identitySources = {};
const patchedSources = {};
for (const model of [
    { label: 'v1（仓库打包核心）', vanillaIdentity: false },
    { label: 'v2（游戏自带原版核心）', vanillaIdentity: true },
]) {
    console.log('\n==== ' + model.label + ' ====');
    const box = makeSession({ vanillaIdentity: model.vanillaIdentity });
    saveTwoSlots(box);
    identitySources[model.vanillaIdentity] = probe(box, 'DataManager.isThisGameFile.toString()');

    // 先确认前置事实：插件确实把 title 改成了章节名，且 globalId 对得上
    check('前置：槽位 1 的 title 是插件写的章节名',
        probe(box, 'DataManager.loadGlobalInfo()[1].title') === '第2章『欢乐街与夜之王(前篇)』',
        probe(box, 'DataManager.loadGlobalInfo()[1].title'));
    check('前置：槽位 1 的 globalId 与会话一致',
        probe(box, 'DataManager.loadGlobalInfo()[1].globalId') === 'RPGMV');
    check('前置：Web 存档模式（非本地）', probe(box, 'StorageManager.isLocalMode()') === false);
    // 修复前必须真的复现 bug——这条同时证明「模型」是忠实的：v1 的打包核心与 v2 的手抄
    // 官方实现都得在这里判定失败，否则说明本套件其实没走到 title 校验那条路上。
    check('前置：修复前 isThisGameFile(1) 为 false（复现「读不进去」）',
        probe(box, 'DataManager.isThisGameFile(1)') === false,
        probe(box, 'DataManager.isThisGameFile(1)'));

    box.loadHook();
    patchedSources[model.vanillaIdentity] = probe(box, 'DataManager.isThisGameFile.toString()');

    // ---- 主回归 ----
    check('插件改写 title 后仍判定为本作存档',
        probe(box, 'DataManager.isThisGameFile(1)') === true,
        probe(box, 'DataManager.isThisGameFile(1)'));
    check('loadGame 能真正读进 1 号存档',
        probe(box, 'DataManager.loadGame(1)') === true,
        probe(box, 'DataManager.loadGame(1)'));
    check('两个槽位都可读',
        probe(box, 'DataManager.isThisGameFile(2)') === true);

    // ---- 判别能力仍在 ----
    check('globalId 不匹配仍判为他作存档',
        probe(box, '(function(){ DataManager.loadGlobalInfo()[1].globalId = "OTHER"; var r = DataManager.isThisGameFile(1); DataManager.loadGlobalInfo()[1].globalId = "RPGMV"; return r; })()') === false);
    check('未写入过的槽位返回 false',
        probe(box, 'DataManager.isThisGameFile(5)') === false);
    check('槽位值不是对象时返回 false',
        probe(box, '(function(){ DataManager.loadGlobalInfo()[9] = "junk"; var r = DataManager.isThisGameFile(9); delete DataManager.loadGlobalInfo()[9]; return r; })()') === false);
    check('globalInfo 完全为空时不抛错且返回 false',
        probe(box, '(function(){ var keep = DataManager._globalInfo; DataManager._globalInfo = []; var r = DataManager.isThisGameFile(1); DataManager._globalInfo = keep; return r; })()') === false);

    // ---- 老存档 / 改标题都不能重新失效 ----
    check('老存档（没有私有身份字段）照常可读',
        probe(box, '(function(){ var s = DataManager.loadGlobalInfo()[1]; var had = Object.prototype.hasOwnProperty.call(s, "__tyranorGameTitle"); s.__tyranorGameTitle = undefined; var r = DataManager.isThisGameFile(1); if (!had) delete s.__tyranorGameTitle; else s.__tyranorGameTitle = undefined; return r; })()') === true);
    check('游戏更新改了 gameTitle 后旧存档仍可读',
        probe(box, '(function(){ var t = $dataSystem.gameTitle; $dataSystem.gameTitle = "夜の街RPG 完全版"; var r = DataManager.isThisGameFile(1); $dataSystem.gameTitle = t; return r; })()') === true);
    check('$dataSystem 未就绪时不抛错',
        probe(box, '(function(){ var d = $dataSystem; $dataSystem = null; var r; try { r = DataManager.isThisGameFile(1); } catch (e) { $dataSystem = d; return "THREW:" + e.message; } $dataSystem = d; return r; })()') === true);

    // ---- 本地模式保持原语义 ----
    check('本地模式下回落原实现（有槽位即 true，含被他作标记的槽位）',
        probe(box, '(function(){ var orig = StorageManager.isLocalMode; StorageManager.isLocalMode = function(){ return true; }; var r = DataManager.isThisGameFile(1); StorageManager.isLocalMode = orig; return r; })()') === true);

    // ---- 注入幂等：hook 重复执行不能叠加、不能自递归 ----
    box.loadHook();
    check('hook 重复注入后行为不变（幂等）',
        probe(box, 'DataManager.isThisGameFile(1) && DataManager.__tyranorSaveIdentityPatched === true') === true,
        probe(box, '[DataManager.isThisGameFile(1), DataManager.__tyranorSaveIdentityPatched]'));
    check('hook 重复注入后本地模式回落仍不自递归',
        probe(box, '(function(){ var orig = StorageManager.isLocalMode; StorageManager.isLocalMode = function(){ return true; }; var r; try { r = DataManager.isThisGameFile(1); } catch (e) { r = "THREW:" + e.message; } StorageManager.isLocalMode = orig; return r; })()') === true);
}

// ---- 两个模型确实是两套实现 ----
console.log('\n==== 模型自检 ====');
check('v1 打包核心与 v2 原版核心的 isThisGameFile 是不同实现（并非同一条路径测两遍）',
    identitySources.false !== identitySources.true);
check('两模型里 hook 安装后的实现都是同一份（一套逻辑覆盖两种核心）',
    patchedSources.false === patchedSources.true);

// ---- 核心异常形态：不制造新的崩溃路径 ----
console.log('\n==== 核心缺少该函数时 ====');
{
    const box = makeSession({ vanillaIdentity: false });
    vm.runInContext('delete DataManager.isThisGameFile;', box.ctx);
    box.loadHook();
    check('核心没有 isThisGameFile 时不安装半套补丁（保持原样，不引入 original.call 抛错）',
        probe(box, 'typeof DataManager.isThisGameFile') === 'undefined',
        probe(box, 'typeof DataManager.isThisGameFile'));
}

// v1 特有的槽位汇总函数也要跟着走通（v2 的官方核心另有实现，不在此断言）
console.log('\n==== v1：槽位汇总函数 ====');
{
    const box = saveTwoSlots(makeSession({ vanillaIdentity: false }));
    box.loadHook();
    check('isAnySavefileExists 认为有可读存档（标题页「继续」可用）',
        probe(box, 'DataManager.isAnySavefileExists()') === true);
    check('latestSavefileId 指向真实存在的槽位',
        probe(box, '(function(){ var id = DataManager.latestSavefileId(); return id === 1 || id === 2; })()') === true,
        probe(box, 'DataManager.latestSavefileId()'));
}

// ---- v0 不在本次改动范围 ----
console.log('\n==== v0（TynMV 2.3.4 / __rpg__.js）不受影响 ====');
{
    const v0 = fs.readFileSync(V0_HOOK, 'utf8');
    check('v0 hook 未出现本补丁的标记，行为与历史版本一致',
        v0.indexOf('tyranorSaveIdentity') === -1);
    check('v0 hook 未覆写 DataManager.isThisGameFile',
        v0.indexOf('isThisGameFile') === -1);
}

console.log('\n' + (failed === 0 ? '全部通过（' + total + ' 项）' : '失败 ' + failed + ' / ' + total + ' 项'));
process.exit(failed === 0 ? 0 : 1);

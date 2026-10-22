# 0.2.1-rc.2 兼容更新 / Compatibility update (v1.2.0)

目标宿主 / target host：**DeepSeek Harness 0.2.1-rc.2**（桌面版 `FileVersion 0.2.1-rc.2`，`app.asar` 2026-10-17）。
上一版 1.1.71 的锚点表对着 0.2.0-rc.2 编，升到 0.2.1 后有四类行为静默失效，本版按实测逐条修掉。

## 怎么复现审计 / Reproduce the audit

```bash
# 1) 直接从 app.asar 解析文件表（不解包、不动安装目录）
node scripts/asar-probe.mjs list "C:\\DeepSeekHarness\\resources\\app.asar" ./asar-files.json

# 2) 抽出 @deepseek-ai 子树到临时目录（只读镜像）
node -e "…"   # 见 docs 正文，或直接用 lib/extract-asar.js 的解包目录

# 3) 跑锚点审计：apply 方向 vs cleanup 方向分开统计
node scripts/audit-anchors.mjs "<AI_BASE>" ./audit.json
```

`AI_BASE` 是宿主里 `node_modules/@deepseek-ai` 的实际路径（解包目录或镜像）。

审计口径：

- **apply 方向**：pattern 里没有 `[dsh-purge]`、replace 里带标记 → 干净宿主上必须命中，命中不了就是真失效。
- **cleanup 方向**：pattern 里带 `[dsh-purge]`、replace 是官方原文 → 只用于回收旧版写过的东西，干净宿主上不命中属正常。
- **no target**：宿主编译里没有对应包（0.2.1-rc.2 已移除 `hooks-claude-code` / `hooks-codex` / `liangshen`），补丁自动 no-op。

## 本版修的四件事

### 1. `{{cwd}}` 会让 prompt 组装整轮失败（最要命）

0.2.1 的 `dsh-system-prompt` 用 `interpolate()` 做严格变量替换，**未知变量直接抛错**，而新构建只注册了 `provider` / `model` 两个变量。
本插件 `cordis.patch.yml` 原先写的是：

```yaml
personaSuffix: Your working directory is {{cwd}}.
```

→ 每轮组装系统提示词就抛异常，表现是「本轮运行失败」。现改为静态句，工作目录交给 runtime context 段落：

```yaml
personaSuffix: Your working directory is provided in the runtime context.
```

### 2. Web 面文案搬家：`dsh-web-app` → `dsh-harness-dev-context`

0.2.1 把 “You are interacting with the user through …” 与「禁止另起服务器」两句从 `packages/bundle/web-app/lib/index.js` 移进了 `dsh-harness-dev-context/lib/index.js`，并且拆成 `prefix` / `suffix` 两段。

- `targetFiles()` 新增逻辑槽 `harness-dev-context`。
- #32 `WEB_SURFACE_IDENTITY_NEUTRAL`：新增 prefix 常量改写 + `Advertised URL of the …` 描述改写。
- #53 `WEB_SURFACE_PROHIBITION`：禁令句原文未变，靠新增文件槽即可命中；身份句改成收成 `prefix: "Web GUI: "`，不留悬空句号。

### 3. complete 模式的注入保留锚点（#40）

`dsh-system-prompt` 的 `assemble()` 尾部多了一行 `requiredContexts`，`contexts` 也从 `[]` 改成“按 required 过滤”。旧锚点整块失配 → 新增一条针对新形态的替换：complete 模式下依旧保留 `dsh-purge` 分节，同时不再丢掉 required 上下文。

### 4. 预设缩进变化（#24 / #80）

0.2.1 的 `presets/*.patch.yml` 把工具条目嵌深了一层（`tool-web` 从 2 空格变 10 空格）。#24 的目标状态 `fetch: true` 已是官方默认（marker 命中，无需再改）；其余按 id 幂等的补丁在干净宿主上不命中属预期。

## 实测结果（0.2.1-rc.2 镜像）

| 指标 | 结果 |
|---|---|
| 补丁总数 | 82 |
| apply 后状态 | `applied=59` `already=6` `missing_file=10` `skipped=2` `na=5`，**无 failed** |
| 实际改动文件 | 49（其中 41 个带 `[dsh-purge]` 标记） |
| 新增文件 | 0（不往宿主塞新文件） |
| 审计真失配 | 4（全部为旧版/幂等锚点：#2 #3 #21 #24） |
| 无宿主目标 | 15（对应包在 0.2.1 已移除） |

## 升级方式

```bash
# 桌面版：先把 app.asar 解开（插件「应用」会自动做），再重启
# 命令行/源码版：直接在 AI_BASE 上 apply
dsh-purge --apply
```

回滚：`dsh-purge --revert`（沿用 `.bak`，不动用户自己的 patch 层）。

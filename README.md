# dsh-superagent-relay

队列型 Source 插件：为 dsh-superagent 引擎新增 `relay` Source kind。生产者（桌面端会话、dingtalk-cli Stream 桥接等）
把消息推进本地队列文件，引擎按 Source 契约轮询消费，走完整的 准入→评估→Ticket→执行→回复 链路。

## 队列

- 文件：`<dataDir>/queue.jsonl`（默认 `~/.local/state/dsh-superagent-relay/`），append-only JSONL
- 记录：`dir:'in'`（入站消息 → Trigger）与 `dir:'out'`（agent 回复）
- 游标：`<dataDir>/cursor.json`（引擎读过行数；触发器 ID 确定性去重，崩溃重放安全）

## 生产者 CLI

```sh
node bin/relay-cli.mjs push --conversation desktop --actor alice --text "整理下载文件夹"
node bin/relay-cli.mjs replies      # 读 agent 回复
```

## 安装

```sh
dsh plugin --profile superagent add "link:$PWD"
```

安装后重启引擎生效。

注册后引擎自动创建默认实例（dataDir 默认值 + `desktop` 会话）；白名单经面板 Policy 或 Management API 配置。

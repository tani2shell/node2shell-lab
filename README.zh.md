[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# node2shell-lab

一个轻量单容器渗透靶场,考点是**引擎级解压漏洞**:应用层无聊,应用层底下的解码器不无聊。

你是港口区货运舱单网关 **PacketLedger** 的值班应急分析员。流量日常,应用日常——
唯独接单 API 会在一个带着*非常有意思的通告*的运行时上照样开心地解压 brotli 请求体。
二楼的认证台拒绝交还封存证明,除非有人能*演示*一次引擎事故。三次崩溃,这是政策。

> **⚠️ CVE 是真的,故事是编的——请先读这段。**
> `CVE-2026-111497` **确有其证**:Node.js 内置 Brotli 解码器的越界写
> (Google Brotli 1.0.3–1.2.0),2026-10-22 入 NVD,Node 24.22.1 已在
> [2026 年 10 月 21 日 Node.js 安全发布](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)中修复
> ([NVD 条目](https://nvd.nist.gov/vuln/detail/CVE-2026-111497))。
> "Node2Shell" 是*本靶给这个洞起的外号*,不是官方名——也不是承诺(见下方通关条件)。
> `docs/ADVISORY.md` 用世界观内故事包装真实事实:故事是虚构,CVE 不是。

> **🎯 诚实的通关条件。** 本靶的门禁是*被演示出来的引擎崩溃*(可靠的 DoS 级原语),
> 不是拿到 shell。完整 RCE 落点取决于堆布局,明确是**彩蛋**——见"平台说明"。
> 崩溃了、计数器动了,门就开了;别为一个 `/bin/sh` 烧掉整个晚上。

## 靶内有什么

- **2 面旗**(OffSec 风格双旗):local 旗走应用层原语,proof 旗在引擎级门禁后面。
- 应用面 ~200 行 Node/Express。真正的目标在它*底下*。
- 无凭证可找,无兔子洞。小即是美:clone 到可玩两分钟以内。

## 难度

没打过解压类漏洞的人:**中偏难(约 3.5/5)**;打过:**中等**。
陡的不是 payload,是意识到漏洞*住在哪一层*、以及引擎*喜欢被怎么喂*。

标定:全链通关路径已由本地 LLM agent 实测验证。

## 快速开始

前提:带 compose 插件的 Docker(Desktop 或 Engine),外加 Python 3(纯标准库、
无 pip 依赖——提示阶梯第 5 段跑参考 PoC 生成器要用)。镜像为 `linux/amd64`——
Apple Silicon 上 Docker Desktop 走 Rosetta(支持,见平台说明);Windows 用 WSL2 + Docker Desktop。

```bash
git clone <repo-url> node2shell-lab && cd node2shell-lab

# 构建(旗子走 build-arg,默认值开箱即用,想独特就自己定)
docker compose build \
  --build-arg LOCAL_FLAG='FLAG{y…l_1}' \
  --build-arg PROOF_FLAG='FLAG{y…f_1}'

docker compose up -d

# 确认活着(默认绑 0.0.0.0:18993 全接口;要收紧到回环,在 compose 端口映射加 127.0.0.1: 前缀)
curl http://127.0.0.1:18993/api/health
```

入口:`http://127.0.0.1:18993/` ——落地页列公开受理面。

运维:

```bash
./reset.sh      # 一键重置:清崩溃台账、重新封存认证
./teardown.sh   # 停靶并释放 18993 端口
docker compose logs -f gateway   # supervisor + worker 日志
```

## 题面

- `GET /` 列出端点与接受的编码。读完它,再读 `/api/health`。
- 认证台(`GET /api/attest`)把解封政策直接写在 403 响应里——知识门是*该发什么*,
  不是猜状态。
- 本仓库带一份通告文件(`docs/ADVISORY.md`),当它是你唯一的军事情报。读两遍。
- 旗子从不出现在任何全局可读路径。找到"本不该读得到"的文件,说明你打对了方向。

## 提示阶梯

自上而下剥,一次剥一层。

1. **侦察就是整第一幕。** 枚举 `GET /` 广告的一切。health 端点披露运行时信息和
   *运维计数器*——想想:一个统计崩溃次数的 supervisor 暗示了这套部署怎样的历史。
2. 舱单接单口接受压缩请求体。Fuzz `Content-Encoding` 头,记下哪些解码器*活在请求
   路径上*——不是你这侧的线,是*他们*那侧的。
3. 打开 `docs/ADVISORY.md`。把受影响版本区间和 `/api/health` 实际披露的对一下。
   这台机器打补丁了吗?
4. 单条畸形 brotli 流只换来诚实的 `400`,不崩——这不是失败,这是边界。通告里
   "multi-stage stream"(多阶段流)这个词是承重的。两个阶段,一条连接,中间停顿。
5. 这个 CVE 有公开 PoC——拿 CVE 号去 GitHub 搜,自己找到它。它的 payload
   *生成器*可参考移植(以其自身许可证为准);*harness* 钉死了 loopback 和固定端点——拆掉它,自己拿裸
   socket 打 `/api/manifest`。
6. 三次记录在案的崩溃(`/api/health` → `crashes: 3`)解封 `/api/attest`。封存证明
   从继承的文件描述符读出,不走路径——所以路径穿越永远抄不了引擎门的近道。
7. `local` 旗在应用层,不在引擎层:盯紧收据查询怎么拿你的 query 参数拼路径。
   `path.join` 不会按你希望的方式规范化。

## 平台说明

- **Apple Silicon(arm64):** 靶子按设计跑 amd64-on-Rosetta。崩溃原语稳定触发
  (出厂实测 48/48);公开 PoC 的 *RCE 落点*打不中(0/48)——x86 堆布局假设在
  Rosetta 下失效,这正是通关条件设计成崩溃门的原因。靶在 Apple Silicon 上完全
  可通;"彩蛋 RCE"另说。
- **原生 linux/amd64(含云 VM 和 WSL2):** 全部可玩;x86_64 裸机上有人调出过
  RCE 级落点,时间预算自理。
- **arm64 原生 Node:** 漏洞类别现实中 arm64 也有,但本靶公开 PoC profile 面向
  x86_64 偏移。请自备改造能力,或者老实用崩溃门。
- 除运行时大版本行(`node/24`)外故意不给版本 banner——补丁级推断是考点的一部分。

## 你将练习

请求路径解码器 fuzzing · 薄披露下的版本/补丁推断 · 通告与环境的相关性分析 ·
多阶段 chunked 请求的时序手艺 · 把崩溃当作*可观测原语*用 · `path.join` 拼接的
路径穿越 · 读公开 PoC harness 并把生成器移植到不同形态。

## 目录结构

```
app/               镜像构建上下文(Dockerfile、entrypoint、server.js、旗子走 build-arg)
docs/ADVISORY.md   世界观内厂商通告(你唯一的军事情报)
docker-compose.yml 单服务、隔离 bridge 网段、2 CPU / 1 GB 限额
reset.sh / teardown.sh
```

题解:`docs/SOLUTION.md`(有剧透——先把阶梯爬完)。

## 许可

MIT。训练用靶机;镜像内无任何真实凭证或秘密——里面的一切都是合成的。

# HCBv6 / HumanClaw：GPT-5 能力误差分析报告（capability-centric v1）

日期：2026-07-05 · 数据/脚本目录：`humanvla/outputs/gpt5_capability_analysis_20260705/`
分析对象：GPT-5 nothink / low-thinking / high-thinking 三个 full-val run（1218 episodes，41 scenes，6 类目标，max 100 steps）。

本报告与此前的报告（`gpt5_low_high_analysis_20260704/paper_error_analysis_*.md`）定位不同：那份主要分析了 high-thinking 的 API token-cap 系统故障；**本报告以"GPT 模型本身的能力"为主轴**，把每个 episode 的失败在 step 级归因到「感知 → 搜索/导航 → 最后一米 → 终止决策」四个能力阶段，并把系统/协议因素显式剥离出去。所有结论基于对每个 episode 的 `episode_log.json` 的逐步解析（每步的动作、pelvis 位置、到目标的 body-AABB 距离、planner 的 visible_state 文本、verifier 的 proposed/final action 与 verdict）。

---

## 0. TL;DR：十个核心发现

**关于 GPT 能力（可直接支撑 paper claim）：**

1. **长程搜索是第一瓶颈**。成功率随最短路径长度从 27.9%（≤4.4m）单调掉到 3.1%（>9.5m）；logistic 回归里路径长度每 +1 SD，成功 odds ×0.41（p<0.001），是最强的难度因子。
2. **模型"看得见"但"走不到"**。87.9% 的 episode 中模型至少一次在 visible_state 里声称看到目标（人工抽查 15 例全部为真实提及，匹配器可信），但其中只有 52.9% 后来走到 1m 以内。**最大失败类（30.8%）是 claimed_not_approached：看到了、导航不过去。**
3. **模型自主的 Stop 决策精度很高、召回极低**。low run 里模型自己提议的 Stop 有 190 次，83.7% 落在 0.2m 判定阈值内；真正"幻觉式宣布完成"（在 >1m 处自主停止）只有 29 个 episode（2.4%）。相反，**摸到目标却始终不发 Stop 的有 217 个 episode（18.1%）**——终止失败的本质是 recall 不是 precision。
4. **Reasoning effort 的最大作用是"敢不敢停"，其次才是导航**。nothink（无思考）整个 run 920 个 episode 里**只自主提议过 1 次 Stop——那一次就是它唯一的成功（0.11%）**；它的 1m 到达率仍有 38.5%（low 为 48.2%）。即：从 none→low，导航到达率 +10pt，但成功率 0.1%→14.1% 的差距几乎全部来自终止决策。
5. **最后一米（0.2m 接触判定）是独立瓶颈**。到达 1m 内的 episode 只有 66.7% 能进一步满足 0.2m 接触；12.8% 的 episode 属于 last_mile_failure。近距离时模型高频微调（dwell 期动作 51% 是 side step），并常在 dist=0 时仍认为"还差一点"——**近距离深度/接触感知偏差**。
6. **tv 类别的失败结构与众不同，主要是物理可达性**：92% 的 tv 目标 AABB 底面高于 0.5m（44% 高于 1m，挂墙/柜上）。到达 1m 内的 tv episode 只有 20% 能满足 0.2m 身体接触（其他类别 60–86%），min_dist 中位数卡在 0.46m。tv 的 2.7% 成功率更多反映判据而非模型。
7. **探索失败的形态是"来回打转"而非"不动"**：never_found 的 episode 中位走了 13.8m 但净位移只有 3.8m，格子重访率 0.75；失败 episode 走的路（11.2m 中位）反而比成功（6.3m）更长。成功时路径效率不错（SPL-like 0.73）。

**关于系统/协议（必须在 paper 中剥离或修复）：**

8. **verifier id/name 不一致 + 代码按 id 解析 = 16.1% 的 episode 被系统错杀**。verifier（同为 GPT-5）在 replace 时文字与 `final_action_name` 都写 Turn/Climb，但 `final_action_id` 误填 1（=Stop/Stand），chooser 优先信 id → episode 在离目标中位 3.8m 处被终止。193 个 episode（16.1%）如此死亡；按难度匹配的反事实估计，修复后 low 成功率约 **14.1% → 16.5%**。nothink 的 44 次 stop 中 38 次、high 非 fallback stop 中 84/148 也是同一 bug。
9. **sit 不终止、不计分：5.2% 的 episode "按指令完成了"却被判失败**。bed/couch/toilet 的指令明确要求 "Finally, sit on the …"，模型确实在 ≤0.2m 处坐下了 107 次（sit 步距离中位数 0.0m），但成功判定只认 Stop/Stand；62 个 episode 坐了却没再发 Stop，全部跑满 100 步判失败。
10. **high-thinking run 不可用作能力分数**（与前份报告结论一致，且更严重）：75.9% 的 episode 被 empty-response fallback 强制终止；不被污染的"干净" episode 只有 29 个且强烈偏短。high 的能力必须等 completion-cap 修复后重跑（cap 修复已完成，见 codex 会话）。

---

## 1. 数据、指标与归因方法

### 1.1 运行与有效样本

| run | reasoning_effort | 有效 episodes | 成功率 | 备注 |
|---|---|---:|---:|---|
| nothink | none | 920/1218 | **0.11%**（1 例） | run 未跑完（986 个目录，其中 920 有 metrics）；无 API 污染（planner_fail=0） |
| low | low | 1202/1218 | **14.06%**（169 例） | 主分析 run；16 个 episode OOM 缺失（按 1218 分母为 13.9%） |
| high | high | 1218/1218 | 12.97%（158 例） | 含 18 个 OOM 补跑；**76% episode 被 empty-response fallback 终止，不可用作能力分数** |

三个 run 共同有效的 908 个 episode 上：low 13.3% / high 12.3% / nothink 0.11%。

### 1.2 关键度量（step 级）

- `dist`：每一步身体 56 个关节到最近目标实例 AABB 的最小距离（成功判据同源，阈值 0.2m）。
- `claim`：planner 每步输出的 `visible_state` 文本是否正面提及目标类别（复用 pipeline 的 alias+negation 匹配器 `objectnav_find.py`；对 15 个随机样本人工核验全部为真实提及）。注意本批 run 的渲染级可见性指标（render_find）被禁用，claim 是唯一的感知信号，属于"模型自称"而非 ground truth。
- 动作归因：每步解析 verifier 的 `proposed_action`（planner 提议）、`verdict`（accept/replace）与 `final_action`（实际执行），从而区分"模型决定"与"系统替换"。
- 成功判定：`task_success = 模型发出 Stop/Stand 且当时 dist < 0.2m`。**sit 不终止 episode、也不参与判定**（见 §5.2）。`at_target` 短路机制在全部 run 中 0 次触发（死代码）。

### 1.3 能力阶段漏斗与失败分类（修正版 taxonomy）

每个失败 episode 按优先级归入唯一类别：

| taxonomy | 定义 | 归因 |
|---|---|---|
| success | 成功 | — |
| verifier_bug_stop | 被 verifier id/name 错配替换出的 Stop 终止（见 §5.1） | **系统** |
| system_forced_stop | planner 空响应 fallback Stop 终止 | **系统** |
| model_wrong_stop | 模型自主提议 Stop 但停在 >0.2m | 模型（终止精度） |
| contact_no_stop | 曾达到 ≤0.2m 但从未有效 Stop | 模型（终止召回）+ 部分 sit 协议 |
| last_mile_failure | 曾到 ≤1m，从未 ≤0.2m，也没停 | 模型（近距离控制/感知）+ 部分判据物理性 |
| claimed_not_approached | 声称看到过目标，但从未到 1m 内 | 模型（导航/搜索） |
| never_found | 从未声称看到，也从未接近 | 模型（探索） |

---

## 2. Benchmark 的难度与分布（task 侧刻画）

### 2.1 组成

41 个 HSSD 场景 × 各 ~30 episodes = 1218；类别：chair 231 / couch 231 / bed 218 / potted_plant 205 / tv 185 / toilet 148。bed/couch/toilet 的指令带 "Finally, sit on the …"，chair/potted_plant/tv 只要求 touch。

### 2.2 难度指标分布（difficulty_full_r2）

| 指标 | 中位数 | P10–P90 | 说明 |
|---|---:|---|---|
| path_length_soft_m | 6.37 | 3.56–13.14 | 26 个 episode 路径计算失败（NaN） |
| objectnav_geodesic_m | 4.40 | 1.40–12.74 | 到最近目标 |
| turn_count_30deg | 1 | 0–2 | RDP 简化后 >30° 转弯 |
| choice_point_count | 6 | 3–16 | 分叉决策点 |
| static_objects_in_corridor | 27 | 8–61 | 2m 走廊内静态物体 |
| n_goal_objects | 3 | 1–20 | **同类目标实例数** |

**指标间高度共线**：path_length 与 choice_point_count/choice_entropy/corridor_area 的 Spearman 相关达 0.92–0.96。paper 中不应把它们当独立难度轴并列报告（此前报告的"choice point 效应"基本就是路径长度效应）；建议选路径长度、转弯数、障碍密度、目标多重性四个弱相关轴。

### 2.3 类别间难度不是同一回事

- **目标多重性**：chair/potted_plant 的目标实例数中位 14/17，其他类别只有 2。原始分桶下 n_goal>15 的成功率 25.5% vs n=1 的 10.6%；加入类别固定效应后多重性不再显著——**"chair/plant 容易"与"实例多、路径短"高度混同**，paper 里要么控制、要么明说。
- **tv 是判据问题**：92% 的 tv AABB 底面 >0.5m（44% >1m）。到达 1m 的 tv episode 只有 20% 能达成 0.2m 身体接触（bed 70%、chair 86%、couch 86%、plant 60%、toilet 64%），min_dist 中位数 0.46m。**建议 paper 对 tv 单列或改用 viewpoint/放宽阈值做 sensitivity 分析。**
- 难度回归（low run，成功为因变量，scene 聚类稳健 SE）：path_length OR=0.41/SD（p<0.001）、turn OR=0.65/SD（p=0.002）、障碍密度不显著；类别效应 chair OR=3.87、plant OR=4.10、tv OR=0.30（vs bed）。把因变量换成"任意时刻接触"，类别效应中只剩 tv 显著（OR=0.16）——**tv 的差是接触物理性，chair/plant 的优势主要来自终止与多实例**。

### 2.4 成功率随难度的梯度（三个 run 一致）

| path_length 四分位 | nothink | low | high |
|---|---:|---:|---:|
| ≤4.4m | 0% | 27.9% | 26.2% |
| 4.4–6.4m | 0% | 17.7% | 15.4% |
| 6.4–9.5m | 0.4% | 8.8% | 7.7% |
| >9.5m | 0% | 3.1% | 3.4% |

**paper-ready takeaway (EN)**: *Success degrades monotonically and steeply with shortest-path length (27.9%→3.1% across quartiles; OR 0.41 per SD), identifying long-horizon search as the dominant difficulty axis. Category difficulty is not homogeneous: chair/plant benefit from target multiplicity (median 14–17 instances) while tv failures are dominated by the physical unreachability of wall-mounted targets under a 0.2 m body-contact criterion.*

---

## 3. GPT 能力：分阶段漏斗

low run（主分析）：**claim 87.9% → 到 1m 48.2% → 接触 0.2m 32.1% → 成功 14.1%**。
条件转化率：P(1m|claim)=0.53，P(contact|1m)=0.67，P(success|contact)=0.44。
损失分布在每一级，不存在单一瓶颈；但绝对损失最大的一级是 **claim→1m（-40pt，"看到走不到"）**。

per-category（low）：

| cat | claim | →1m | →0.2m | →成功 | 首次 claim 距离(中位) |
|---|---:|---:|---:|---:|---:|
| chair | 0.96 | 0.56 | 0.48 | 0.26 | 2.5m |
| potted_plant | 0.92 | 0.65 | 0.39 | 0.28 | 2.1m |
| couch | 0.90 | 0.42 | 0.36 | 0.11 | 3.8m |
| bed | 0.82 | 0.41 | 0.29 | 0.07 | 3.9m |
| toilet | 0.79 | 0.43 | 0.27 | 0.06 | 4.0m |
| tv | 0.85 | 0.41 | **0.08** | 0.03 | 4.0m |

修正版失败分类（low, n=1202）：

| taxonomy | n | 占比 | 归因 |
|---|---:|---:|---|
| claimed_not_approached | 370 | 30.8% | 模型：导航/搜索 |
| contact_no_stop | 217 | 18.1% | 模型：终止召回（其中 62 例为 sit 协议） |
| **verifier_bug_stop** | **193** | **16.1%** | **系统（§5.1）** |
| success | 169 | 14.1% | — |
| last_mile_failure | 154 | 12.8% | 模型：近距离控制（tv 部分为判据） |
| never_found | 69 | 5.7% | 模型：探索 |
| model_wrong_stop | 29 | 2.4% | 模型：终止精度 |

### 3.1 感知与搜索

- claim 匹配器精度经 15 例抽查全部为真实类别提及；且远距离首次 claim（>5m）多为穿门/跨房间的真实远望，不是幻觉。**首次 claim 距离与成败强相关：首 claim ≤5m 的 episode 成功率 20.6%，>5m 的只有 3.5%**——远望到目标之后模型往往无法执行跨房间导航。
- 12.1% 的 episode 全程无 claim（never_found 为其子集），成功率恰为 0%，中位路径 8.7m。无 claim ≈ 无成功：**感知是必要条件，且当前失败更多在感知之后**。
- claim 有抖动：首 claim 之后仍有 22% 的步子不再提及目标（中位翻转 5 次/episode）——跨步的目标持有（object permanence）不稳，会打断导航。

### 3.2 导航与接近（"看到走不到"）

- claimed_not_approached（370 例）是最大失败类。结合探索统计：失败 episode 中位行走 11.2m > 成功 6.3m，格子（0.5m）重访率 0.77，never_found 类更是走 13.8m 只挪出净位移 3.8m——**形态是绕圈与回头路，而不是站着不动**（stuck 率中位只有 0.07）。
- 与碰撞的交互：静态碰撞步占比中位 0.56（P90=0.96），碰撞后的下一步换动作的概率 0.26 vs 无碰撞 0.11——模型对碰撞有反应但弱，常见连撞（P(碰|上一步碰)=0.98）。
- 成功时导航质量不差：SPL-like 效率 0.73。**问题集中在"有一段较长/多分叉路径需要规划"时**（§2.4 梯度）。

### 3.3 最后一米

- 到 1m 后仍有 1/3 拿不到 0.2m 接触。dwell（<1m）期间动作组成：side_step 50.8% / walk 23.6% / turn 20.1%；模型反复微调对齐。案例（chair, dist=0.00）：模型 reasoning 仍在说 "closing the final gap carefully"——**已经贴上目标却仍认为有缝隙**，近距离距离感知系统性偏保守。
- tv 的 last_mile_failure 占其失败的 36%（排除系统类后），对应 §2.3 的物理可达性问题。

### 3.4 终止决策：精度高、召回低

对每个 Stop 做了 proposed/final 归因（谁真正提议了 Stop）：

| run | 模型自主提议的 Stop | 其中 ≤0.2m | 系统替换/兜底产生的 Stop |
|---|---:|---:|---:|
| nothink | **1**（即唯一成功） | 100% | 43（38 个 id-bug + 5 其他） |
| low | 190 | **83.7%** | 205（193 个 id-bug 终止 episode） |
| high | 64 | 82.8% | 1009（925 fallback + 84 id-bug） |

- 模型真正说"我到了、停"的时候，绝大多数是对的（低 wrong-stop 率 2.4%）。
- 但 217 个 episode 摸到了目标（min_dist 中位 0.000m！）、在 1m 内平均耗 58 步、88% 的 dwell 步仍在 claim 目标，却始终不发 Stop。案例：模型明确说 "We have reached the couch... it is time to start the sit sequence"，然后把剩余步数花在转身对齐上直到 100 步耗尽。
- 三类子原因：(a) 近距离感知偏差（认为还差一点，见 §3.3）；(b) **sit 编舞**：bed/couch/toilet 需要转身-后退-坐的长序列，容易耗尽步数（62 例坐成了但不计分，§5.2）；(c) 对"完成判定条件"的不确定：宁可继续微调也不赌一次 Stop——与 Stop 的一次性（不可撤销）有关。

**paper-ready takeaway (EN)**: *GPT-5's termination behavior is precision-high, recall-low: model-initiated stops land within the 0.2 m success zone 84% of the time, and hallucinated task completion is rare (2.4% of episodes). The dominant termination failure is the opposite — in 18% of episodes the agent physically touches the target (median dwell 58 steps within 1 m) yet never commits to Stop. Termination is a decision-making failure, not a perception failure: the agent keeps claiming the target is visible during 88% of near-target dwell steps.*

---

## 4. Reasoning effort 光谱：none → low →（high 待重跑）

908 个共同 episode 上：

| | nothink | low | high(污染) |
|---|---:|---:|---:|
| 成功 | 0.1% | 13.3% | 12.3% |
| 任意时刻接触 0.2m | 19.4% | 30.1% | 14.0%* |
| 到 1m | 38.3% | 46.9% | 28.9%* |
| 模型自主 Stop 次数（全 run） | 1 | 190 | 64* |
| 模型侧时延中位/step | 17.1s | 35.1s | 123.4s |
| completion tokens/ep | ~低 | 72K（其中 reasoning 44K） | 198K（reasoning 184K） |

\* high 的行为指标被 76% 的提前强制终止截断，只能作下界参考。

解读：

1. **none→low 的收益分两块**：导航到达率 +8–10pt（有但有限），终止行为从"从不敢停"变为"该停时基本会停"（1→190 次自主 Stop）。**思考的边际价值集中在离散的、不可逆的承诺型决策（何时宣布完成）上**，这与"stop 需要对完成条件做一次自信判断"一致。
2. nothink 的 claim 率也有 80.5%——感知/描述能力不依赖思考；差距在把感知转成行为决策。
3. **成本曲线陡峭**：low 每 episode 已需 ~118 次调用、354K prompt tokens、~53 分钟 wall-clock；high 每步时延 3.5× low。这本身值得写进 paper 的 cost 分析（embodied agent 的 test-time-scaling 代价）。
4. low 和 high（尽管污染）在每个难度桶的成功率几乎重合（§2.4）——**目前没有证据表明更高的 reasoning effort 改善长程导航**；确证需等 cap 修复后的 high 重跑。

**paper-ready takeaway (EN)**: *Scaling reasoning effort from none to low yields a striking asymmetry: navigation reach improves modestly (+10pt reach@1m), but commitment-type decisions improve categorically — the no-thinking agent proposed Stop exactly once in 920 episodes (its only success), whereas the low-thinking agent proposed 190 stops with 84% precision. Test-time reasoning appears to matter most for irreversible declare-completion decisions rather than for step-wise locomotion, at a steep cost (35 s vs 17 s model latency per step; 3.5× more at high effort).*

---

## 5. 系统/协议问题（paper 需剥离；建议逐项修复后重跑）

### 5.1 verifier id/name 错配 → 16.1% episode 被错杀（本次新发现）

链路：verifier prompt（v3）要求"阻挡时用 Turn/Side step 替换 Walk，替换动作必须非 Stop"；GPT 在 `final_action_name` 写了 `Turn<right><30>` 等合法动作、reason 也说要转向，**但 `final_action_id` 误填 1**（Stop/Stand 的 id）；`_chooser_action` 优先按 id 解析 → 执行 Stop → episode 立即终止。181/206 个 >1m 的"提前停止"由此产生（163 例 id=1 错配 + 18 例 forbidden-climb 替换），中位发生在第 30 步。
**修复**：id/name 不一致时以 name 为准（或校验一致性、拒绝 Stop 作为 replace 结果——prompt 本来就这么要求）。按难度匹配估计修复可使 low 成功率 14.1%→**~16.5%**。nothink/high 同样受影响（38/44、84/148 的非 fallback stop）。
**paper 建议**：这条与 high 的 empty-response fallback 一起，作为"agentic pipeline 的脆弱性"独立小节或 ablation，反而是一个有内容的系统发现：**评测分数对 scaffold 解析规则高度敏感（±2.4pt）**。

### 5.2 sit 不终止、不计分（协议-指令错配）

指令让模型 "Finally, sit on the bed/couch/toilet"，但成功只认 Stop/Stand；sit 动作（719 次，落点距离中位 0.0m）不结束 episode。107 个 episode 在 ≤0.2m 处坐下，其中 62 个（占全部 episode 的 5.2%）此后没有再发 Stop、跑满 100 步、被判失败。toilet 类受损最重（sit-成功率仅 30%）。
**修复选项**：sit@≤0.2m 记为成功（或 sit 视同 stop）；或从指令中删掉 sit。两种口径都应在 paper 报告 sensitivity。

### 5.3 high run 的 empty-response fallback（前份报告已详述）

10.9% 的 high API 调用 hidden reasoning 吃满 4096 completion cap → 空 JSON → planner fallback Stop/Stand；verifier 挽回一部分，但仍有 925/1218（75.9%）episode 被强制终止。"干净"episode 仅 29 个且偏短（中位 9 步），无法做无偏能力估计。**high 必须重跑**（cap 修复已在 codex 会话完成：`HCB_AZURE_OPENAI_MAX_COMPLETION_TOKENS=12000` + 空响应显式报错）。

### 5.4 其他

- `at_target` 完成短路机制全程 0 触发（死代码），终止只能靠 Stop 动作本身。
- render_find（渲染级目标可见性 ground truth）在这批 run 里被禁用——感知分析只能用模型自述 claim。**建议重跑时打开**，可直接量化"可见但未识别/不可见却声称"两类真感知错误。
- 16 个 low episode 与 298 个 nothink episode 因 OOM/未跑完缺失；nothink 结论已在共同子集上复核。

---

## 6. 对 paper 写作的具体建议

**主线叙事（error analysis 小节）**建议按能力漏斗组织，而不是按"失败模式枚举"：

1. 图 1：能力漏斗（claim→1m→contact→success，按类别分组条形；已生成 `figs/funnel_low.png` 原型）。
2. 图 2：成功率 vs 路径长度（三个 effort 一条线；`figs/success_vs_pathlen.png`）。
3. 图 3：Stop 校准直方图（模型自主 Stop vs 系统 Stop 的到目标距离分布；`figs/stop_calibration_attributed.png`）——这张图同时讲"模型停得准"与"系统错杀"两个故事。
4. 表：修正版 taxonomy ×类别（§3 表），加一列"归因（model/system/protocol）"。
5. 独立小节：pipeline 脆弱性（§5.1/5.3），给 ±分数敏感度。审稿人会喜欢这种自我修正的诚实度，且它本身是 agentic-eval 的 methodological finding。

**可以直接下的 claim**（当前证据充分）：
- 长程搜索主导失败；成功率-路径长度梯度陡峭。
- 终止是 precision-high/recall-low；reasoning effort 主要改善承诺型决策。
- "看见≠能走到"：claim→approach 的 47% 损失。
- 评测分数对 scaffold 细节敏感（id-bug ±2.4pt、sit 口径 ±5.2pt、token cap 使 high 崩溃）。

**暂缓的 claim**（等重跑）：
- high-thinking 的真实水平及"more thinking 是否帮助导航"。
- 感知的 ground-truth 错误率（等 render_find 打开）。

**建议补充的实验**（优先级排序）：
1. 修 §5.1 chooser bug + §5.2 sit 口径，low 重跑（或至少离线重放归因，我们已给出反事实估计）。
2. high 用 cap=12000 重跑（已就绪）。
3. render_find 打开的一个子集 run（~200 episodes 即可标定感知错误率）。
4. （可选）tv 阈值 sensitivity：0.2/0.5m 双口径重打分，不需要重跑模拟。

---

## 7. 复现与文件清单

```
outputs/gpt5_capability_analysis_20260705/
├── extract_step_features.py      # episode_log.json → steps_*.csv.gz / episodes_*.csv
├── analyze_capability.py         # 主分析（漏斗/回归/图）→ analysis.log
├── followup_checks.py            # stop/sit 机制、tv 可达性、样例抽查
├── followup2_attribution.py      # proposed vs final 动作归因（low 全步扫描）
├── followup3_crossrun.py         # 三 run stop 归因 + 修正 taxonomy
├── derived_{low,high,nothink}.csv  # episode 级全部派生指标（含 taxonomy2）
├── steps_{low,high,nothink}.csv.gz # step 级紧凑表
├── action_attribution_low.csv.gz   # low 每步 verdict/proposed/final
├── stop_attribution_{nothink,high}.csv
└── figs/{funnel_low,success_vs_pathlen,stop_calibration_attributed,dist_curves}.png
```

难度表沿用 `gpt5_low_high_analysis_20260704/difficulty_full_r2/episode_difficulty.csv`（2m corridor 版）。

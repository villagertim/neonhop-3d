# Laya: initial repository assessment

Reviewed 2026-09-20 at commit `42626c348753fbb17572a813127df2278a1ec527`. Repository: https://github.com/NandhaKishorM/laya. The project name is Laya, not Layla. Read-only source review; no package installed, weights downloaded, model executed, or game configuration changed.

## Assessment

Laya is a credible implementation to examine as a separately evaluated local typed-decision model. Source confirms actual neural inference rather than a hosted Jev wrapper. It is not established as an equivalent Jev architecture or a drop-in solution for this game's decisions. Its local execution could remove provider round-trip delay, but performance on this workstation and game has not been measured.

The repository advertises 322M–421M parameter checkpoints, Apache-2.0 licensing, and roughly 33–40 ms single-question T4 inference. Its README acknowledges that domain fine-tuning is central and that base checkpoints perform poorly on its typed-decisions benchmark. These are author-reported measurements, not reproduced here. [README](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/README.md)

## Verified source behavior

`DecisionModel` combines a bidirectional encoder with transformer decision-head layers and scalar scores at option-marker positions. `system_one` creates a separate state-plus-question sequence for each question, batches these, and runs the neural model once over that batch. It produces categorical distributions, expected ordinal scores, and binary probabilities. Multiple questions are batched; this does not mean state encoding is shared once across all questions or that additional questions are computationally free. [Model implementation](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/laya/common.py), [inference path](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/laya/agent.py)

A potentially important integration issue: `build_sequence` allocates part of the context to instructions/options and silently truncates state to the remaining prefix. It uses JSON key insertion order. Our current game request places long rules and obstacle geometry ahead of the candidate forecasts, so a naive adapter could omit the very features that improved Jev. Any future game evaluation should use a compact candidate-first representation and explicitly verify the tokenized input. Exact truncation of our payload was not measured. [Sequence construction](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/laya/common.py)

Choice/Score `confidence` is derived from normalized entropy, whereas Noul confidence is the larger binary probability. These are different quantities; a universal 0.85 confidence threshold should not be interpreted as a proven 85% success rate. The code applies configured temperature scaling, which still needs validation on the target domain. [Inference output](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/laya/agent.py), [confidence calculation](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/laya/common.py)

## Benchmark qualifications

The project's benchmark report explicitly states that its Jev figures come from third-party publications rather than matched calls made by the Laya authors. Consequently, the speed and accuracy comparisons are not a controlled same-input head-to-head. The reported GPU model latency also should not be equated with our browser-to-gateway-to-provider latency. Results on text classification and synthetic business workflows do not establish traffic/log timing competence. [Benchmark report](https://github.com/NandhaKishorM/laya/blob/42626c348753fbb17572a813127df2278a1ec527/BENCHMARKS.md)

## What the Reddit post establishes

The author claims earlier related work. The March 2025 SalesRLAgent abstract describes a specialized sales-conversion estimator using reinforcement learning and Azure OpenAI embeddings. The other linked paper describes confidence-aware routing among generation, retrieval, larger models, and human review. Those descriptions support prior work on probability estimation and routing, but do not establish identity with Jev's internal architecture or prove copying. This review inspected abstracts rather than validating the papers' empirical claims. [SalesRLAgent](https://arxiv.org/abs/2503.23303), [routing paper](https://arxiv.org/abs/2510.01237), [user-supplied discussion](https://www.reddit.com/r/LocalLLaMA/comments/1wijo3e/i_literally_built_the_jev_architecture_one_year/)

## Relevance to this project

The useful idea is a small local model performing typed decisions with locally computed candidate features. That could support low-latency deployment and domain fine-tuning on deterministic simulator examples. This is a hypothesis, not a test result or a recommendation to replace the current game.

If explored later, Laya should run in a separately labeled comparison using the same local controller and frozen cases. Adding it to the active Jev run would introduce another inference model and change that experiment's identity. No such integration was performed. The Jev game was left running untouched.

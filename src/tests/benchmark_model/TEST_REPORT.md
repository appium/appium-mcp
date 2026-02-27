# Model Benchmark Test Report

**Test Date:** 2026/2/26 17:38:15
**Test Type:** Automation Testing - Click Action Recognition

---

## Summary

| Model Name | Duration(ms) | Status | Accuracy Score | Annotated Image |
|------------|--------------|--------|----------------|-----------------|
| qwen3-vl-plus | 12649 | ✅ Success | 100% | [View](output/qwen3_vl_plus_annotated.png) |
| qwen3-vl-8b-instruct | 10809 | ✅ Success | 100% | [View](output/qwen3_vl_8b_instruct_annotated.png) |
| Qwen3-VL-235B-A22B-Instruct | 8417 | ✅ Success | 100% | [View](output/Qwen3_VL_235B_A22B_Instruct_annotated.png) |
| doubao-seed-2-0-pro-260215 | 24796 | ✅ Success | 100% | [View](output/doubao_seed_2_0_pro_260215_annotated.png) |
| gemini-3-flash-preview | 17353 | ✅ Success | 100% | [View](output/gemini_3_flash_preview_annotated.png) |
| gemini-3-pro-preview | 51574 | ✅ Success | 100% | [View](output/gemini_3_pro_preview_annotated.png) |
| gemini-2.5-pro | 28762 | ✅ Success | 100% | [View](output/gemini_2_5_pro_annotated.png) |
| gemini-2.5-flash | 17583 | ✅ Success | 100% | [View](output/gemini_2_5_flash_annotated.png) |
| gpt-5.2 | 18461 | ✅ Success | 95% | [View](output/gpt_5_2_annotated.png) |
| gpt-5.2-pro | 43517 | ✅ Success | 75% | [View](output/gpt_5_2_pro_annotated.png) |
| kimi-k2.5 | 13021 | ✅ Success | 45% | [View](output/kimi_k2_5_annotated.png) |
| gpt-5.1 | 18604 | ✅ Success | 45% | [View](output/gpt_5_1_annotated.png) |
| gpt-5-nano | 25101 | ✅ Success | 20% | [View](output/gpt_5_nano_annotated.png) |
| DeepSeek-V3.2 | 10187 | ✅ Success | 0% | [View](output/DeepSeek_V3_2_annotated.png) |
| claude-sonnet-4-6 | 68981 | ✅ Success | 0% | [View](output/claude_sonnet_4_6_annotated.png) |
| grok-4.1-fast | 16239 | ✅ Success | 0% | [View](output/grok_4_1_fast_annotated.png) |

### Statistics

- **Total**: 18 models
- **Success**: 16 (88.9%)
- **Failed**: 2
- **High Accuracy (≥70%)**: 10 (55.6%)
- **Avg Accuracy Score**: 60.0%
- **Average Duration**: 31332.22ms
- **Min Duration**: 8417ms
- **Max Duration**: 120021ms

---

## Detailed Results


============================================================
## DeepSeek-V3.2

**Started at:** 2026/2/26 17:38:15


============================================================
## qwen3-vl-plus

**Started at:** 2026/2/26 17:38:15


============================================================
## qwen3-vl-8b-instruct

**Started at:** 2026/2/26 17:38:15


============================================================
## Qwen3-VL-235B-A22B-Instruct

**Started at:** 2026/2/26 17:38:15


============================================================
## doubao-seed-2-0-pro-260215

**Started at:** 2026/2/26 17:38:15


============================================================
## kimi-k2.5

**Started at:** 2026/2/26 17:38:15


============================================================
## gpt-5.2-pro

**Started at:** 2026/2/26 17:38:15


============================================================
## gpt-5.2

**Started at:** 2026/2/26 17:38:15


============================================================
## gpt-5.1

**Started at:** 2026/2/26 17:38:15


============================================================
## gpt-5-nano

**Started at:** 2026/2/26 17:38:15


============================================================
## claude-sonnet-4-6

**Started at:** 2026/2/26 17:38:15


============================================================
## gemini-3-flash-preview

**Started at:** 2026/2/26 17:38:15


============================================================
## gemini-3-pro-preview

**Started at:** 2026/2/26 17:38:15


============================================================
## gemini-2.5-pro

**Started at:** 2026/2/26 17:38:15


============================================================
## gemini-2.5-flash

**Started at:** 2026/2/26 17:38:15


============================================================
## grok-4.1-fast

**Started at:** 2026/2/26 17:38:15


**BBox:** [45, 526, 958, 579]
**Target:** 搜索酒店
**Annotated Image:** [Qwen3_VL_235B_A22B_Instruct_annotated.png](output/Qwen3_VL_235B_A22B_Instruct_annotated.png)
**BBox:** [135, 2150, 1035, 2270]
**Target:** 搜索酒店
**Annotated Image:** [DeepSeek_V3_2_annotated.png](output/DeepSeek_V3_2_annotated.png)
**BBox:** [46, 527, 963, 580]
**Target:** 搜索酒店
**Annotated Image:** [qwen3_vl_8b_instruct_annotated.png](output/qwen3_vl_8b_instruct_annotated.png)
**BBox:** [42, 526, 958, 578]
**Target:** 搜索酒店
**Annotated Image:** [qwen3_vl_plus_annotated.png](output/qwen3_vl_plus_annotated.png)
**BBox:** [50, 1120, 1120, 1220]
**Target:** 搜索酒店
**Annotated Image:** [kimi_k2_5_annotated.png](output/kimi_k2_5_annotated.png)
**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 8417ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [45, 526, 958, 579]}
```

**Accuracy Score:** 0%
**Status:** ✅ Success
**Duration:** 10187ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [135, 2150, 1035, 2270]}
```

**BBox:** [150, 2100, 1020, 2280]
**Target:** 搜索酒店
**Annotated Image:** [grok_4_1_fast_annotated.png](output/grok_4_1_fast_annotated.png)
**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 10809ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [46, 527, 963, 580]}
```

**BBox:** [44, 1323, 1126, 1471]
**Target:** 搜索酒店
**Annotated Image:** [gemini_3_flash_preview_annotated.png](output/gemini_3_flash_preview_annotated.png)
**BBox:** [58, 528, 1112, 598]
**Target:** 搜索酒店
**Annotated Image:** [gemini_2_5_flash_annotated.png](output/gemini_2_5_flash_annotated.png)
**BBox:** [89, 1408, 1080, 1563]
**Target:** 搜索酒店
**Annotated Image:** [gpt_5_2_annotated.png](output/gpt_5_2_annotated.png)
**BBox:** [119, 921, 1051, 1096]
**Target:** 搜索酒店
**Annotated Image:** [gpt_5_1_annotated.png](output/gpt_5_1_annotated.png)
**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 12649ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [42, 526, 958, 578]}
```

**Accuracy Score:** 45%
**Status:** ✅ Success
**Duration:** 13021ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [50, 1120, 1120, 1220]}
```

**Accuracy Score:** 0%
**Status:** ✅ Success
**Duration:** 16239ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [150, 2100, 1020, 2280]}
```

**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 17583ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [58, 528, 1112, 598]}
```

**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 17353ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [44, 1323, 1126, 1471]}
```

**Accuracy Score:** 95%
**Status:** ✅ Success
**Duration:** 18461ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [89, 1408, 1080, 1563]}
```

**Accuracy Score:** 45%
**Status:** ✅ Success
**Duration:** 18604ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [119, 921, 1051, 1096]}
```

**BBox:** [38, 525, 1132, 579]
**Target:** 搜索酒店
**Annotated Image:** [doubao_seed_2_0_pro_260215_annotated.png](output/doubao_seed_2_0_pro_260215_annotated.png)
**BBox:** [60, 1500, 1110, 1690]
**Target:** 搜索酒店
**Annotated Image:** [gpt_5_nano_annotated.png](output/gpt_5_nano_annotated.png)
**BBox:** [48, 535, 1122, 638]
**Target:** 搜索酒店
**Annotated Image:** [gemini_2_5_pro_annotated.png](output/gemini_2_5_pro_annotated.png)
**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 24796ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [38, 525, 1132, 579]}
```

**Accuracy Score:** 20%
**Status:** ✅ Success
**Duration:** 25101ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [60, 1500, 1110, 1690]}
```

**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 28762ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [48, 535, 1122, 638]}
```

**BBox:** [112, 1412, 1058, 1565]
**Target:** 搜索酒店
**Annotated Image:** [gpt_5_2_pro_annotated.png](output/gpt_5_2_pro_annotated.png)
**Accuracy Score:** 75%
**Status:** ✅ Success
**Duration:** 43517ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [112, 1412, 1058, 1565]}
```

**BBox:** [42, 1328, 1128, 1468]
**Target:** 搜索酒店
**Annotated Image:** [gemini_3_pro_preview_annotated.png](output/gemini_3_pro_preview_annotated.png)
**Accuracy Score:** 100%
**Status:** ✅ Success
**Duration:** 51574ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [42, 1328, 1128, 1468]}
```

**BBox:** [33, 835, 693, 900]
**Target:** 搜索酒店
**Annotated Image:** [claude_sonnet_4_6_annotated.png](output/claude_sonnet_4_6_annotated.png)
**Accuracy Score:** 0%
**Status:** ✅ Success
**Duration:** 68981ms
**Response:**
```
action: **CLICK**
Parameters: {"target": "搜索酒店", "bbox_2d": [33, 835, 693, 900]}
```

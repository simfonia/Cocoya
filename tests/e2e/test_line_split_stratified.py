# -*- coding: utf-8 -*-
"""E2E：查證 Audit P2-11「line_following 切分策略是否對齊 AGENTS.md 分層鐵律」。

鐵律（AGENTS.md）：
  - 帶類別標籤者 → 必須分層抽樣，禁止全域隨機切。
  - 回歸型（label 為連續數值）→ 允許隨機切，但**報告需註明**。

本腳本驗證三件事：
  1. line_following 的標註結構確實「無可作類別的欄位」（class_id 恆 0）→ 屬回歸型。
  2. 切分確實為隨機切（seed 固定 → 可再現），且無分層。
  3. 報告輸出確實註明「回歸型 / 無類別欄位」——這是鐵律後半段的實際要求。

自足：不依賴本機遺留路徑（tempfile 夾具）。
"""
import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
# [T4 2026-10-03] \u5c0d\u9ad4\u53d8\u66f4\u898f\u5207\u5165\u65b9\u5f0f\uff08\u8a18\u8b0\uff09see e2e_c2_check.py
sys.path.insert(0, os.path.join(HERE, '..', 'resources', 'train_templates'))

from common import line_dataset  # noqa: E402



def check(cond, msg):
    """[T4-2] 原為累積 FAILS + 最後 sys.exit(1)；改為 pytest 斷言。
    優點：失敗時立刻指出是哪一行、哪個 msg，而非跑完才總結。"""
    assert cond, msg


def write_image(path):
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', (8, 8), (10, 200, 30)).save(path, format='JPEG')


def make_line_dm_fixture(root, n_per_label=4, labels=('track', 'offtrack')):
    """佈局 B（DM 落盤）：<label>/*.jpg + dataset.json，line 標註 class_id 恆 0。"""
    samples = []
    for label in labels:
        for k in range(n_per_label):
            fn = '%s_%02d.jpg' % (label, k)
            write_image(os.path.join(root, label, fn))
            samples.append({
                'image_path': '%s/%s' % (label, fn),
                'label': label,
                'annotations': [{'class_id': 0,
                                 'line': [0.1, 0.9, 0.9, 0.1]}],
            })
    spec = {
        'project': {'name': 'linefix', 'type': 'line_following'},
        'data_source': {'samples': samples, 'base_dir': 'dataset/linefix'},
        'schema': {'label_map': {name: i for i, name in enumerate(labels)}},
    }
    with io.open(os.path.join(root, 'dataset.json'), 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False)
    return spec


def test_line_split_stratified(tmp_path):
    tmp = tempfile.mkdtemp(prefix='cocoya_p211_line_')
    try:
        # ---------- 1. 前提查證：標註有無「可作類別的欄位」 ----------
        spec = make_line_dm_fixture(tmp)
        cids = set()
        has_extra_keys = set()
        for s in spec['data_source']['samples']:
            for a in s.get('annotations') or []:
                cids.add(a.get('class_id'))
                has_extra_keys.update(a.keys())
        check(cids == {0},
              'line 標註 class_id 恆為單一值 %s（無多類別欄位 → 回歸型）' % sorted(cids))
        check('line' in has_extra_keys,
              'line 標註欄位 = %s（僅座標，無線型/方向/單雙線欄位）'
              % sorted(has_extra_keys))

        # ---------- 2. 切分行為：隨機切 + seed 可再現 ----------
        def run_split(seed):
            buf = io.StringIO()
            with redirect_stdout(buf):
                line_dataset.load_line_dataset(
                    tmp, img_size=32, batch_size=2, validation_split=0.2, seed=seed)
            return buf.getvalue()

        out_a = run_split(123)
        out_b = run_split(123)
        out_c = run_split(999)

        check('分層抽樣' not in out_a,
              '未使用分層抽樣（符合回歸型鐵律：非帶類別標籤者不得分層）')
        check('隨機切分' in out_a,
              '報告註明「隨機切分」（鐵律要求回歸型須註明）')
        # 鐵律後半段的實質要求：報告必須註明「回歸型、隨機切分」
        # ⚠️ 勿用寬鬆子字串比對：本行原文曾有贅字與括號不閉合
        #   （「隨機切分 (random split，無類別欄位（回歸），隨機切分)」），寬鬆比對會漏掉。
        #   故先逐行找出切分摘要行，再對整行斷言。
        summary_lines = [ln.strip() for ln in out_a.splitlines()
                         if 'train' in ln and 'val' in ln]
        header_lines = [ln.strip() for ln in out_a.splitlines()
                        if '切分' in ln and 'train' not in ln and 'val' not in ln]
        check(len(header_lines) == 1 and 'random split' in header_lines[0],
              '切分標題行存在且格式正確：%r' % (header_lines[0] if header_lines else None))
        check(bool(header_lines) and header_lines[0].startswith('隨機切分')
              and header_lines[0].endswith('):'),
              '切分標題行格式正確（開頭「隨機切分」、結尾「):」，無贅字/括號不閉合）')
        check(any('回歸' in ln for ln in header_lines),
              '報告註明「回歸」型態：%r' % (header_lines[0] if header_lines else None))
        check('train' in out_a and 'val' in out_a,
              '報告含 train/val 筆數：%s' % summary_lines[:1])

        # seed 固定 → 同一切分結果（可再現性是教學重點）
        same_seed_same = ('train' in out_a and 'train' in out_b
                          and out_a.split('train')[1][:12] == out_b.split('train')[1][:12])
        check(same_seed_same, '同 seed 切分結果一致（可再現）')
        diff_seed_diff = (out_a.split('train')[1][:12] != out_c.split('train')[1][:12])
        check(True, '不同 seed 結果 %s（僅記錄，教學資料量小時可能相同）'
              % ('不同' if diff_seed_diff else '恰好相同'))

        print('\n--- 實際輸出（seed=123）---')
        print(out_a.strip())
        print('-----------------------')

    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)

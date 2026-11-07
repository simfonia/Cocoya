import cv2
import numpy as np
import random
import json
import os

# =========================
# 基本設定
# =========================
NUM_IMAGES = 1000
WIDTH = 640
HEIGHT = 480

MIN_WIDTH = 8
MAX_WIDTH = 55
JPEG_QUALITY = 95
SEED = None

if SEED is not None:
    random.seed(SEED)
    np.random.seed(SEED)

# =========================
# 資料夾設定
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 圖片存放位置：程式資料夾/lines/line/
OUTPUT_DIR = os.path.join(BASE_DIR, "lines", "line")

# JSON 存放位置：程式資料夾/lines/dataset.json
JSON_PATH = os.path.join(BASE_DIR, "lines", "dataset.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================
# 產生線段起點與終點
# =========================
def generate_endpoints():
    x_start = random.randint(0, WIDTH - 1)
    y_start = HEIGHT - 1

    side = random.choice(["left", "top", "right"])

    if side == "left":
        x_end = 0
        y_end = random.randint(20, HEIGHT - 100)
    elif side == "right":
        x_end = WIDTH - 1
        y_end = random.randint(20, HEIGHT - 100)
    else:
        x_end = random.randint(20, WIDTH - 20)
        y_end = 0

    p_start = np.array([x_start, y_start], dtype=float)
    p_end = np.array([x_end, y_end], dtype=float)

    return p_start, p_end


# =========================
# 產生彎曲路徑
# =========================
def generate_curve(p0, p3):
    direction = p3 - p0
    distance = np.linalg.norm(direction)

    if distance == 0:
        direction = np.array([0.0, -1.0])
        distance = 1.0
    else:
        direction = direction / distance

    perpendicular = np.array([-direction[1], direction[0]])

    curve_type = random.choice([
        "straight",
        "left_curve",
        "right_curve",
        "s_curve"
    ])

    if curve_type == "straight":
        offset1 = random.uniform(-8, 8)
        offset2 = random.uniform(-8, 8)
    elif curve_type == "left_curve":
        offset1 = random.uniform(30, 100)
        offset2 = random.uniform(30, 120)
    elif curve_type == "right_curve":
        offset1 = random.uniform(-100, -30)
        offset2 = random.uniform(-120, -30)
    else:
        offset1 = random.uniform(40, 100)
        offset2 = -random.uniform(40, 100)

    p1 = p0 + direction * distance / 3
    p2 = p0 + direction * distance * 2 / 3

    p1 += perpendicular * offset1
    p2 += perpendicular * offset2

    p1[0] = np.clip(p1[0], 0, WIDTH - 1)
    p1[1] = np.clip(p1[1], 0, HEIGHT - 1)
    p2[0] = np.clip(p2[0], 0, WIDTH - 1)
    p2[1] = np.clip(p2[1], 0, HEIGHT - 1)

    t = np.linspace(0, 1, 160)

    points = (
        ((1 - t) ** 3)[:, None] * p0
        + (3 * (1 - t) ** 2 * t)[:, None] * p1
        + (3 * (1 - t) * t ** 2)[:, None] * p2
        + (t ** 3)[:, None] * p3
    )

    return points, curve_type


# =========================
# 繪製具有透視效果的黑線
# =========================
def draw_perspective_line(image, points):
    points = np.round(points).astype(np.int32)

    for i in range(len(points) - 1):
        ratio = i / (len(points) - 1)

        # 越靠近畫面底部越粗，越遠越細
        thickness = int(
            MAX_WIDTH * (1 - ratio) + MIN_WIDTH * ratio
        )
        thickness = max(2, thickness)

        cv2.line(
            image,
            tuple(points[i]),
            tuple(points[i + 1]),
            (0, 0, 0),
            thickness=thickness,
            lineType=cv2.LINE_8
        )

    cv2.circle(
        image, tuple(points[0]),
        MAX_WIDTH // 2, (0, 0, 0), -1
    )
    cv2.circle(
        image, tuple(points[-1]),
        MIN_WIDTH // 2, (0, 0, 0), -1
    )


# =========================
# 建立 dataset.json 的資料結構
# =========================
dataset = {
    "version": "1.0",
    "project": {
        "name": "lines",
        "type": "line_following",
        "description": ""
    },
    "data_source": {
        "mode": "file",
        "files": [],
        "samples": []
    }
}

# =========================
# 產生圖片與標註
# =========================
for i in range(NUM_IMAGES):
    image = np.full(
        (HEIGHT, WIDTH, 3),
        255,
        dtype=np.uint8
    )

    p_start, p_end = generate_endpoints()
    points, curve_type = generate_curve(p_start, p_end)

    draw_perspective_line(image, points)

    filename = f"line_{i + 1:05d}.jpg"
    image_filepath = os.path.join(OUTPUT_DIR, filename)

    cv2.imwrite(
        image_filepath,
        image,
        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
    )

    # 正規化座標，範圍為 0~1
    x_start_norm = p_start[0] / (WIDTH - 1)
    y_start_norm = p_start[1] / (HEIGHT - 1)
    x_end_norm = p_end[0] / (WIDTH - 1)
    y_end_norm = p_end[1] / (HEIGHT - 1)

    # image_path 以 dataset.json 所在的 lines/ 資料夾為基準
    relative_image_path = f"line/{filename}"

    sample = {
        "image_path": relative_image_path,
        "label": "line",
        "annotations": [
            {
                "class_id": 0,
                "line": [
                    round(float(x_start_norm), 6),
                    round(float(y_start_norm), 6),
                    round(float(x_end_norm), 6),
                    round(float(y_end_norm), 6)
                ]
            }
        ]
    }

    dataset["data_source"]["samples"].append(sample)

    if (i + 1) % 50 == 0:
        print(f"Generating: {i + 1}/{NUM_IMAGES}")

# =========================
# 輸出 dataset.json
# =========================
with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(
        dataset,
        f,
        ensure_ascii=False,
        indent=2
    )

print("\nDataset generation completed!")
print(f"Images saved to: {OUTPUT_DIR}")
print(f"JSON saved to:   {JSON_PATH}")
print(f"Total samples:   {len(dataset['data_source']['samples'])}")

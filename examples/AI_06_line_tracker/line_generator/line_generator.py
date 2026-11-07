
import cv2
import numpy as np
import random
import csv
import os

# ==========================================
# 1. 使用者設定
# ==========================================

NUM_IMAGES = 500

WIDTH = 640
HEIGHT = 480

MIN_WIDTH = 8       # 遠端線寬
MAX_WIDTH = 55      # 近端線寬

# 取得目前 Python 程式所在的資料夾
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 將資料集建立在程式所在資料夾內
OUTPUT_DIR = os.path.join(BASE_DIR, "lines", "lineA")

JPEG_QUALITY = 95

SEED = None         # 例如 42，可重現資料

if SEED is not None:
    random.seed(SEED)
    np.random.seed(SEED)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ==========================================
# 2. 產生起點、終點
# ==========================================

def generate_endpoints():

    # 起點涵蓋整個底部
    x_start = random.randint(0, WIDTH - 1)
    y_start = HEIGHT - 1

    # 終點選擇左、上、右邊界
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

    return (
        np.array([x_start, y_start], dtype=float),
        np.array([x_end, y_end], dtype=float),
        side
    )

# ==========================================
# 3. 產生 Bézier 曲線
# ==========================================

def generate_curve(p0, p3):

    direction = p3 - p0
    distance = np.linalg.norm(direction)

    direction = direction / distance

    perpendicular = np.array([
        -direction[1],
        direction[0]
    ])

    # 隨機曲線類型
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

    # 避免控制點過度偏離畫面
    p1[0] = np.clip(p1[0], 0, WIDTH - 1)
    p1[1] = np.clip(p1[1], 0, HEIGHT - 1)

    p2[0] = np.clip(p2[0], 0, WIDTH - 1)
    p2[1] = np.clip(p2[1], 0, HEIGHT - 1)

    t = np.linspace(0, 1, 160)

    points = (
        ((1-t)**3)[:, None] * p0
        + (3*(1-t)**2*t)[:, None] * p1
        + (3*(1-t)*t**2)[:, None] * p2
        + (t**3)[:, None] * p3
    )

    return points, curve_type

# ==========================================
# 4. 繪製透視黑線
# ==========================================

def draw_perspective_line(image, points):

    # 先產生中心線
    points = np.round(points).astype(np.int32)

    # 由底部往上，寬度逐漸縮小
    for i in range(len(points) - 1):

        ratio = i / (len(points) - 1)

        # ratio=0：近端
        # ratio=1：遠端
        thickness = int(
            MAX_WIDTH * (1 - ratio)
            + MIN_WIDTH * ratio
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

    # 確保起點和終點的線條完整
    cv2.circle(
        image,
        tuple(points[0]),
        MAX_WIDTH // 2,
        (0, 0, 0),
        -1
    )

    cv2.circle(
        image,
        tuple(points[-1]),
        MIN_WIDTH // 2,
        (0, 0, 0),
        -1
    )

# ==========================================
# 5. 產生資料集
# ==========================================

csv_path = os.path.join(
    OUTPUT_DIR,
    "labels.csv"
)

with open(
    csv_path,
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "filename",
        "x_start",
        "y_start",
        "x_end",
        "y_end",
        "x_start_norm",
        "y_start_norm",
        "x_end_norm",
        "y_end_norm",
        "end_side",
        "curve_type"
    ])

    for i in range(NUM_IMAGES):

        # 白色背景
        image = np.full(
            (HEIGHT, WIDTH, 3),
            255,
            dtype=np.uint8
        )

        # 起點與終點
        p0, p3, end_side = generate_endpoints()

        # 產生曲線
        points, curve_type = generate_curve(p0, p3)

        # 繪製透視黑線
        draw_perspective_line(image, points)

        # 檔名
        filename = f"line_{i+1:05d}.jpg"

        filepath = os.path.join(
            OUTPUT_DIR,
            filename
        )

        cv2.imwrite(
            filepath,
            image,
            [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
        )

        # 座標
        x1, y1 = p0
        x2, y2 = p3

        writer.writerow([
            filename,
            int(x1),
            int(y1),
            int(x2),
            int(y2),
            round(x1 / (WIDTH - 1), 6),
            round(y1 / (HEIGHT - 1), 6),
            round(x2 / (WIDTH - 1), 6),
            round(y2 / (HEIGHT - 1), 6),
            end_side,
            curve_type
        ])

        if (i + 1) % 50 == 0:
            print(
                f"Generating: {i+1}/{NUM_IMAGES}"
            )

print("\n==============================")
print("Dataset generation completed!")
print("==============================")
print(f"Images : {NUM_IMAGES}")
print(f"Size   : {WIDTH} x {HEIGHT}")
print(f"Format : JPG")
print(f"Output : {OUTPUT_DIR}")
print(f"Labels : {csv_path}")

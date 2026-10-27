import cv2
import time
import mediapipe as mp

# ------------------------------------------------------------
# Webcam 編號
# 0 通常是第一支 Webcam。
# 如果電腦有多支攝影機，可以嘗試：
# 0
# 1
# 2
# ------------------------------------------------------------

CAMERA_INDEX = 1

# ============================================================
# EfficientDet-Lite0 / COCO Labels
# ============================================================
#
# EfficientDet-Lite0 預訓練模型可以辨識 COCO Dataset
# 中的 80 種物件。
#
# 注意：
# 程式真正使用的是英文 label。
# 後面的中文是註解。
#
# ============================================================

COCO_LABELS = [
    "person",           # 人
    "bicycle",          # 腳踏車
    "car",              # 汽車
    "motorcycle",       # 機車
    "airplane",         # 飛機
    "bus",              # 公車
    "train",            # 火車
    "truck",            # 卡車
    "boat",             # 船
    "traffic light",    # 紅綠燈
    "fire hydrant",     # 消防栓
    "stop sign",        # 停止標誌
    "parking meter",    # 停車計時器
    "bench",            # 長椅
    "bird",             # 鳥
    "cat",              # 貓
    "dog",              # 狗
    "horse",            # 馬
    "sheep",            # 綿羊
    "cow",              # 牛
    "elephant",         # 大象
    "bear",             # 熊
    "zebra",            # 斑馬
    "giraffe",          # 長頸鹿
    "backpack",         # 背包
    "umbrella",         # 雨傘
    "handbag",          # 手提包
    "tie",              # 領帶
    "suitcase",         # 行李箱
    "frisbee",          # 飛盤
    "skis",             # 滑雪板
    "snowboard",        # 單板滑雪板
    "sports ball",      # 運動球
    "kite",              # 風箏
    "baseball bat",     # 棒球棒
    "baseball glove",   # 棒球手套
    "skateboard",       # 滑板
    "surfboard",        # 衝浪板
    "tennis racket",    # 網球拍
    "bottle",            # 瓶子／水瓶
    "wine glass",       # 酒杯
    "cup",               # 杯子
    "fork",              # 叉子
    "knife",             # 刀子
    "spoon",             # 湯匙
    "bowl",              # 碗
    "banana",            # 香蕉
    "apple",             # 蘋果
    "sandwich",          # 三明治
    "orange",            # 柳橙
    "broccoli",          # 綠花椰菜
    "carrot",            # 胡蘿蔔
    "hot dog",           # 熱狗
    "pizza",             # 披薩
    "donut",             # 甜甜圈
    "cake",              # 蛋糕
    "chair",             # 椅子
    "couch",              # 沙發
    "potted plant",      # 盆栽
    "bed",               # 床
    "dining table",      # 餐桌
    "toilet",            # 馬桶
    "tv",                # 電視
    "laptop",            # 筆記型電腦
    "mouse",             # 滑鼠
    "remote",            # 遙控器
    "keyboard",          # 鍵盤
    "cell phone",        # 手機
    "microwave",         # 微波爐
    "oven",              # 烤箱
    "toaster",           # 烤麵包機
    "sink",              # 水槽
    "refrigerator",      # 冰箱
    "book",              # 書
    "clock",             # 時鐘
    "vase",              # 花瓶
    "scissors",          # 剪刀
    "teddy bear",        # 泰迪熊／玩偶
    "hair drier",        # 吹風機
    "toothbrush",        # 牙刷
]

# ============================================================
# 使用者設定
# ============================================================

# ------------------------------------------------------------
# 模型位置
# ------------------------------------------------------------

MODEL_PATH = "model/efficientdet_lite0.tflite"


# ------------------------------------------------------------
# 要偵測哪些物件？
# 格式：
#     "物件名稱": Confidence Threshold
# 例如：
#     "cell phone": 0.60
# 表示：
# AI 判斷為 cell phone，
# 而且 Confidence >= 0.60，
# 才會顯示 Bounding Box。
# ------------------------------------------------------------

TARGET_OBJECTS = {
    "person": 0.50,
    "cell phone": 0.60,
    "bottle": 0.50,
    "cup": 0.55,
    "book": 0.50,
    "mouse": 0.50,
    "keyboard": 0.8,
}


# ------------------------------------------------------------
# MediaPipe 的全域 Confidence Threshold
# AI 首先會使用這個數值篩選偵測結果。
# 後面我們還會使用 TARGET_OBJECTS
# 為每一種物件設定自己的 Threshold。
# 因此這裡應該設定得比較低。
# 例如：
# TARGET_OBJECTS:
#     cell phone = 0.60
# 那麼這裡就不能設定成 0.70。
# ------------------------------------------------------------

DETECTOR_SCORE_THRESHOLD = 0.20

# ------------------------------------------------------------
# 最多保留幾個偵測結果
# ------------------------------------------------------------

MAX_RESULTS = 10

# ------------------------------------------------------------
# Webcam 左右翻轉
# True  = 左右翻轉
# False = 不翻轉
# ------------------------------------------------------------

FLIP_CAMERA = True

# ============================================================
# 建立 MediaPipe Object Detector
# ============================================================

BaseOptions = mp.tasks.BaseOptions
ObjectDetector = mp.tasks.vision.ObjectDetector
ObjectDetectorOptions = mp.tasks.vision.ObjectDetectorOptions
VisionRunningMode = mp.tasks.vision.RunningMode

options = ObjectDetectorOptions(
    base_options=BaseOptions(
        model_asset_path=MODEL_PATH
    ),
    running_mode=VisionRunningMode.VIDEO,
    max_results=MAX_RESULTS,
    score_threshold=DETECTOR_SCORE_THRESHOLD,
)

detector = ObjectDetector.create_from_options(options)


# ============================================================
# 開啟 Webcam
# ============================================================

cap = cv2.VideoCapture(CAMERA_INDEX)

if not cap.isOpened():
    print("無法開啟 Webcam")
    detector.close()
    exit()

# ============================================================
# 顯示目前設定
# ============================================================

print()
print("==========================================")
print(" EfficientDet-Lite0 Object Detection")
print("==========================================")
print()
print("目前設定的偵測物件：")

for label, threshold in TARGET_OBJECTS.items():
    print(
        f"  {label:20s} "
        f"Confidence >= {threshold:.2f}"
    )

print()
print("按 Q 離開")
print()


# ============================================================
# FPS 計算
# ============================================================

previous_time = time.time()

# ============================================================
# MediaPipe VIDEO 模式的 timestamp
# ============================================================

timestamp_ms = 0

# ============================================================
# Webcam 即時偵測
# ============================================================

while True:
    # --------------------------------------------------------
    # 讀取 Webcam
    # --------------------------------------------------------
    ret, frame = cap.read()
    if not ret:
        print("無法讀取 Webcam 畫面")
        break

    # --------------------------------------------------------
    # Webcam 左右翻轉
    # --------------------------------------------------------

    if FLIP_CAMERA:
        frame = cv2.flip(frame, 1)

    # --------------------------------------------------------
    # OpenCV BGR → RGB
    # --------------------------------------------------------
    rgb_frame = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2RGB
    )

    # --------------------------------------------------------
    # 建立 MediaPipe Image
    # --------------------------------------------------------
    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb_frame
    )

    # --------------------------------------------------------
    # 更新 timestamp
    # --------------------------------------------------------
    timestamp_ms += 1

    # --------------------------------------------------------
    # 執行 AI Object Detection
    # --------------------------------------------------------
    detection_result = detector.detect_for_video(
        mp_image,
        timestamp_ms
    )

    # ========================================================
    # 處理 AI 偵測結果
    # ========================================================
    for detection in detection_result.detections:
        # ----------------------------------------------------
        # 確認有分類結果
        # ----------------------------------------------------
        if len(detection.categories) == 0:
            continue

        # ----------------------------------------------------
        # 取得第一個分類結果
        #
        # EfficientDet 通常會將最高分數的結果放在第一個。
        # ----------------------------------------------------
        category = detection.categories[0]
        label = category.category_name
        score = category.score

        # ----------------------------------------------------
        # 確認 label 是否存在
        # ----------------------------------------------------
        if label is None:
            continue

        # ----------------------------------------------------
        # 只處理 TARGET_OBJECTS 裡面的物件
        # ----------------------------------------------------
        if label not in TARGET_OBJECTS:
            continue

        # ----------------------------------------------------
        # 取得這個物件自己的 Threshold
        # ----------------------------------------------------
        threshold = TARGET_OBJECTS[label]

        # ----------------------------------------------------
        # Confidence 不足
        #
        # 不顯示 Bounding Box
        # ----------------------------------------------------
        if score < threshold:
            continue

        # ====================================================
        # 取得 Bounding Box
        # ====================================================
        bbox = detection.bounding_box
        x = bbox.origin_x
        y = bbox.origin_y
        w = bbox.width
        h = bbox.height

        # ----------------------------------------------------
        # 畫 Bounding Box
        # ----------------------------------------------------
        cv2.rectangle(
            frame,
            (x, y),
            (x + w, y + h),
            (0, 255, 0),
            2
        )

        # ====================================================
        # 顯示 Label + Confidence Score
        # ====================================================
        text = f"{label}: {score:.2f}"
        cv2.putText(
            frame,
            text,
            (x, max(y - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

    # ========================================================
    # 計算 FPS
    # ========================================================
    current_time = time.time()
    elapsed_time = current_time - previous_time
    if elapsed_time > 0:
        fps = 1.0 / elapsed_time
    else:
        fps = 0
    previous_time = current_time

    # --------------------------------------------------------
    # 顯示 FPS
    # --------------------------------------------------------
    cv2.putText(
        frame,
        f"FPS: {fps:.1f}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 255, 255),
        2
    )

    # ========================================================
    # 顯示 Webcam 畫面
    # ========================================================
    cv2.imshow(
        "EfficientDet-Lite0 Object Detection",
        frame
    )

    # ========================================================
    # 鍵盤控制
    # ========================================================
    key = cv2.waitKey(1) & 0xFF

    # 按 Q 離開
    if key == ord("q"):
        break


# ============================================================
# 程式結束
# ============================================================

cap.release()
cv2.destroyAllWindows()
detector.close()

print()
print("程式結束")

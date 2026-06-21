import math
import serial
import time



# PC 端 MediaPipe 雙臂夾角即時控制器  # S_ID:cmt_intro  # S_ID:def_root
# 1. 透過攝影機取得人體左肩左肘、右肩右肘連線夾角。
# 2. 雙手水平以下時為 0%，雙手抬起至垂直向上為 100%。
# 3. 即時發送百分比數值給 πCar。  # E_ID:cmt_intro

import cv2  # S_ID:pose_init
import mediapipe as mp
mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils
mp_pose_model = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)  # E_ID:pose_init
ser = serial.Serial('COM4', 115200, timeout=0.01, write_timeout=0)  # S_ID:ser_init  # E_ID:ser_init  # E_ID:def_root

if __name__ == "__main__":  # S_ID:main_root
    cap = cv2.VideoCapture(0)  # S_ID:open_cam  # E_ID:open_cam
    while True:  # S_ID:main_loop
        ret, frame = cap.read()  # S_ID:read_f  # E_ID:read_f
        frame = cv2.flip(frame, 1)  # S_ID:flip_f  # E_ID:flip_f
        results = mp_pose_model.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # S_ID:proc_p  # E_ID:proc_p
        if results.pose_landmarks is not None:  # S_ID:if_pose
            pose = results.pose_landmarks if results.pose_landmarks else None  # S_ID:set_pose  # E_ID:set_pose
            p11 = (int((pose.landmark[11] if pose else None).x * 640), int((pose.landmark[11] if pose else None).y * 480)) if (pose.landmark[11] if pose else None) else (0, 0)  # S_ID:set_p11  # E_ID:set_p11
            p13 = (int((pose.landmark[13] if pose else None).x * 640), int((pose.landmark[13] if pose else None).y * 480)) if (pose.landmark[13] if pose else None) else (0, 0)  # S_ID:set_p15  # E_ID:set_p15
            p12 = (int((pose.landmark[12] if pose else None).x * 640), int((pose.landmark[12] if pose else None).y * 480)) if (pose.landmark[12] if pose else None) else (0, 0)  # S_ID:set_p12  # E_ID:set_p12
            p14 = (int((pose.landmark[14] if pose else None).x * 640), int((pose.landmark[14] if pose else None).y * 480)) if (pose.landmark[14] if pose else None) else (0, 0)  # S_ID:set_p16  # E_ID:set_p16
            dx_l = p13[int(1 - 1)] - p11[int(1 - 1)]  # S_ID:set_dx_l  # E_ID:set_dx_l
            dy_l = p13[int(2 - 1)] - p11[int(2 - 1)]  # S_ID:set_dy_l  # E_ID:set_dy_l
            dx_r = p14[int(1 - 1)] - p12[int(1 - 1)]  # S_ID:set_dx_r  # E_ID:set_dx_r
            dy_r = p14[int(2 - 1)] - p12[int(2 - 1)]  # S_ID:set_dy_r  # E_ID:set_dy_r
            rad_l = math.atan2(dy_l, dx_l)  # S_ID:set_rad_l  # E_ID:set_rad_l
            rad_r = math.atan2(dy_r, dx_r)  # S_ID:set_rad_r  # E_ID:set_rad_r
            theta = math.degrees(abs(rad_l - rad_r))  # S_ID:set_theta  # E_ID:set_theta
            if theta > 180:  # S_ID:if_theta_gt_180
                theta = 360 - theta  # S_ID:sub_theta_360  # E_ID:sub_theta_360  # E_ID:if_theta_gt_180
            if p13[int(2 - 1)] > p11[int(2 - 1)] and p14[int(2 - 1)] > p12[int(2 - 1)]:  # S_ID:if_hands_down
                percent = 0  # S_ID:percent_0  # E_ID:percent_0
            else:
                percent = round(((180 - theta) / 180) * 100)  # S_ID:percent_calc  # E_ID:percent_calc  # E_ID:if_hands_down
            ser.write((str(percent) + "\n").encode('utf-8'))  # S_ID:ser_write  # E_ID:ser_write
            ser.reset_input_buffer()  # S_ID:ser_flush  # E_ID:ser_flush
            time.sleep(0.05)  # S_ID:throttle_sleep  # E_ID:throttle_sleep
            print(percent)  # S_ID:PcPV6?VHqxP@wBcf@E+B  # E_ID:PcPV6?VHqxP@wBcf@E+B
            if results.pose_landmarks:  # S_ID:draw_pose
                mp_draw.draw_landmarks(frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS, mp_draw.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2), mp_draw.DrawingSpec(color=(0, 255, 0), thickness=2))  # E_ID:draw_pose  # E_ID:if_pose
        cv2.imshow('Cocoya Video', frame)  # S_ID:show_img  # E_ID:show_img
        if cv2.waitKey(1) & 0xFF == ord('q'):  # S_ID:wait_key
            break  # E_ID:wait_key  # E_ID:main_loop
    cap.release()  # S_ID:release_cam
    cv2.destroyAllWindows()  # E_ID:release_cam  # E_ID:main_root
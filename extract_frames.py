import cv2
import os

video_path = "background-video.mp4"
output_dir = "frontend/public/frames/hero"
target_frames = 180

os.makedirs(output_dir, exist_ok=True)

cap = cv2.VideoCapture(video_path)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

if total_frames == 0:
    print("Could not read video.")
    exit(1)

# Calculate step size to get exactly target_frames
step = max(1, total_frames // target_frames)

frame_count = 1
current_frame = 0

print(f"Total video frames: {total_frames}, extracting {target_frames} frames...")

while frame_count <= target_frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
    ret, frame = cap.read()
    if not ret:
        break
        
    # Optional: resize to 720p height if the video is too large, to save size
    height, width = frame.shape[:2]
    if height > 720:
        new_height = 720
        new_width = int(width * (720 / height))
        frame = cv2.resize(frame, (new_width, new_height))
    
    out_path = os.path.join(output_dir, f"frame-{frame_count:04d}.webp")
    cv2.imwrite(out_path, frame, [cv2.IMWRITE_WEBP_QUALITY, 80])
    
    current_frame += step
    frame_count += 1

cap.release()
print(f"Extracted {frame_count - 1} frames to {output_dir}")

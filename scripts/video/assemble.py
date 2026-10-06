# record.js가 남긴 프레임(jpg)과 timeline.json을 1920×1080·30fps H.264(mp4)로 묶는다.
# 프레임은 화면이 바뀔 때만 찍히므로 각 장의 표시 시간 = 다음 장까지의 간격이고,
# timeline의 speed 구간(기다리는 동안 4~6배속)만큼 그 시간을 줄인다.
# 사용: python3 scripts/video/assemble.py <녹화 폴더> <결과.mp4>  (ffmpeg: 환경변수 FFMPEG 또는 PATH)
import json, os, subprocess, sys

src, out = sys.argv[1], sys.argv[2]
tl = json.load(open(os.path.join(src, 'timeline.json')))
frames, marks, end = tl['frames'], sorted(tl['marks'], key=lambda m: m['t']), tl['end']
start = marks[0]['t']

def to_out(t):
    """원래 시각 t → 영상 속 시각(빨리 감기 반영)."""
    acc = 0.0
    for i, m in enumerate(marks):
        if t <= m['t']:
            break
        nxt = marks[i + 1]['t'] if i + 1 < len(marks) else float('inf')
        acc += (min(t, nxt) - m['t']) / m['speed']
    return acc

frames = [f for f in frames if f['t'] >= start - 0.5]
lines = []
for i, f in enumerate(frames):
    t1 = frames[i + 1]['t'] if i + 1 < len(frames) else end
    d = to_out(t1) - to_out(max(f['t'], start))
    if d <= 0:
        continue
    lines.append("file '%s'\nduration %.4f" % (os.path.abspath(os.path.join(src, 'frames', f['file'])), d))
lines.append(lines[-1].split('\n')[0])  # concat 형식: 마지막 장을 한 번 더
lst = os.path.join(src, 'concat.txt')
open(lst, 'w').write('\n'.join(lines) + '\n')
ff = os.environ.get('FFMPEG', 'ffmpeg')
subprocess.run([ff, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
                '-vf', 'scale=1920:1080:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], check=True)
print('영상 길이 %.1f초 → %s' % (to_out(end), out))

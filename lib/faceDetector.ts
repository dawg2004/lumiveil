import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

let detector: FaceDetector | null = null;

async function getDetector() {
  if (detector) return detector;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/face_detector.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.3,
    minSuppressionThreshold: 0.3,
  });

  return detector;
}

export async function detectFirstFace(file: File) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = url;
  });

  const fd = await getDetector();
  const result = fd.detect(img);
  URL.revokeObjectURL(url);

  const box = result.detections?.[0]?.boundingBox;
  if (!box) return null;

  return {
    x: Math.max(0, Math.round(box.originX)),
    y: Math.max(0, Math.round(box.originY)),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

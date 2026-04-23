import { FaceDetector as MediaPipeFaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeDetectedFace = {
  boundingBox?: DOMRectReadOnly;
};

type NativeFaceDetectorInstance = {
  detect(input: ImageBitmapSource): Promise<NativeDetectedFace[]>;
};

type NativeFaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => NativeFaceDetectorInstance;

let detector: MediaPipeFaceDetector | null = null;

function getNativeFaceDetectorCtor(): NativeFaceDetectorConstructor | null {
  const maybeCtor = (globalThis as typeof globalThis & {
    FaceDetector?: NativeFaceDetectorConstructor;
  }).FaceDetector;

  return maybeCtor ?? null;
}

async function detectWithNativeFaceDetector(file: File): Promise<FaceBox | null> {
  const NativeFaceDetector = getNativeFaceDetectorCtor();
  if (!NativeFaceDetector) {
    return null;
  }

  const bitmap = await createImageBitmap(file);

  try {
    const faceDetector = new NativeFaceDetector({
      fastMode: true,
      maxDetectedFaces: 1,
    });

    const faces = await faceDetector.detect(bitmap);
    const box = faces[0]?.boundingBox;
    if (!box) {
      return null;
    }

    return {
      x: Math.max(0, Math.round(box.x)),
      y: Math.max(0, Math.round(box.y)),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    };
  } finally {
    bitmap.close();
  }
}

async function getDetector() {
  if (detector) return detector;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  detector = await MediaPipeFaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/face_detector.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.3,
    minSuppressionThreshold: 0.3,
  });

  return detector;
}

export async function detectFirstFace(file: File): Promise<FaceBox | null> {
  const nativeResult = await detectWithNativeFaceDetector(file);
  if (nativeResult) {
    return nativeResult;
  }

  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = url;
  });

  try {
    const fd = await getDetector();
    const result = fd.detect(img);
    const box = result.detections?.[0]?.boundingBox;
    if (!box) return null;

    return {
      x: Math.max(0, Math.round(box.originX)),
      y: Math.max(0, Math.round(box.originY)),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

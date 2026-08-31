import exifr from 'exifr';

export interface ExtractedExif {
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  orientation: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
}

const EMPTY: ExtractedExif = {
  capturedAt: null, cameraMake: null, cameraModel: null, orientation: null, gpsLat: null, gpsLng: null,
};

/** EXIF가 없거나 파싱 실패해도 업로드 자체는 계속돼야 한다 — 항상 조용히 EMPTY로 폴백. */
export async function extractExif(buffer: Buffer): Promise<ExtractedExif> {
  try {
    // translateValues: false — 안 그러면 exifr이 Orientation 등 숫자 필드를
    // "Horizontal (normal)" 같은 사람이 읽는 문자열로 바꿔버려서 숫자 파싱이 깨진다
    // (실제 테스트 이미지로 재현·확인함).
    const data = await exifr.parse(buffer, {
      pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'Orientation', 'latitude', 'longitude'],
      gps: true,
      translateValues: false,
    });
    if (!data) return EMPTY;
    const capturedAt: Date | undefined = data.DateTimeOriginal ?? data.CreateDate;
    return {
      capturedAt: capturedAt instanceof Date ? capturedAt.toISOString() : null,
      cameraMake: typeof data.Make === 'string' ? data.Make.trim() : null,
      cameraModel: typeof data.Model === 'string' ? data.Model.trim() : null,
      orientation: typeof data.Orientation === 'number' ? data.Orientation : null,
      gpsLat: typeof data.latitude === 'number' ? data.latitude : null,
      gpsLng: typeof data.longitude === 'number' ? data.longitude : null,
    };
  } catch {
    return EMPTY;
  }
}

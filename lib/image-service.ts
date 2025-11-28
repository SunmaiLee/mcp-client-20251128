import { supabase } from './supabase';

const BUCKET_NAME = 'Chat Images';

export interface UploadedImage {
  url: string;
  path: string;
}

/**
 * Base64 이미지를 Supabase Storage에 업로드하고 공개 URL 반환
 */
export async function uploadBase64Image(
  base64: string,
  mimeType: string,
  sessionId: string,
  messageIndex: number,
  imageIndex: number
): Promise<UploadedImage | null> {
  try {
    // MIME type에서 확장자 추출
    const ext = mimeType.split('/')[1]?.replace('+xml', '') || 'png';
    
    // 파일 경로 생성
    const timestamp = Date.now();
    const filePath = `${sessionId}/${messageIndex}_${imageIndex}_${timestamp}.${ext}`;
    
    // Base64를 Blob으로 변환
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    
    // Storage에 업로드
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, blob, {
        contentType: mimeType,
        upsert: true,
      });
    
    if (error) {
      console.error('Error uploading image to storage:', error);
      return null;
    }
    
    // 공개 URL 가져오기
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);
    
    return {
      url: urlData.publicUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('Error in uploadBase64Image:', error);
    return null;
  }
}

/**
 * 여러 Base64 이미지를 업로드하고 URL 배열 반환
 */
export async function uploadMultipleImages(
  images: Array<{ base64: string; mimeType: string }>,
  sessionId: string,
  messageIndex: number
): Promise<string[]> {
  const urls: string[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const result = await uploadBase64Image(
      images[i].base64,
      images[i].mimeType,
      sessionId,
      messageIndex,
      i
    );
    
    if (result) {
      urls.push(result.url);
    }
  }
  
  return urls;
}

/**
 * Storage에서 이미지 삭제
 */
export async function deleteImage(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);
    
    if (error) {
      console.error('Error deleting image:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in deleteImage:', error);
    return false;
  }
}


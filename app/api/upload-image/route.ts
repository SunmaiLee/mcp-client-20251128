import { createClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'Chat Images';

// 서버사이드에서 사용할 Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ImageUploadRequest {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
  sessionId: string;
  messageIndex: number;
}

export async function POST(req: Request) {
  try {
    const { images, sessionId, messageIndex }: ImageUploadRequest = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uploadedUrls: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const { base64, mimeType } = images[i];
      
      // MIME type에서 확장자 추출
      const ext = mimeType.split('/')[1]?.replace('+xml', '') || 'png';
      
      // 파일 경로 생성
      const timestamp = Date.now();
      const filePath = `${sessionId}/${messageIndex}_${i}_${timestamp}.${ext}`;
      
      // Base64를 Buffer로 변환
      const buffer = Buffer.from(base64, 'base64');
      
      // Storage에 업로드
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });
      
      if (error) {
        console.error('Error uploading image:', error);
        continue;
      }
      
      // 공개 URL 가져오기
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);
      
      uploadedUrls.push(urlData.publicUrl);
    }

    return new Response(JSON.stringify({ urls: uploadedUrls }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in upload-image API:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


import { createClient } from '@supabase/supabase-js';

// 버킷 이름 (소문자, 하이픈 사용)
const BUCKET_NAME = 'chat-images';

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

// 버킷 존재 여부 확인 및 생성
async function ensureBucketExists() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('[Storage] Error listing buckets:', listError);
    return false;
  }
  
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!bucketExists) {
    console.log(`[Storage] Bucket "${BUCKET_NAME}" not found, creating...`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });
    
    if (createError) {
      console.error('[Storage] Error creating bucket:', createError);
      return false;
    }
    console.log(`[Storage] Bucket "${BUCKET_NAME}" created successfully`);
  }
  
  return true;
}

export async function POST(req: Request) {
  try {
    const { images, sessionId, messageIndex }: ImageUploadRequest = await req.json();

    console.log(`[Upload API] Received ${images?.length || 0} images for session ${sessionId}`);

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 버킷 확인/생성
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      return new Response(JSON.stringify({ 
        error: 'Storage bucket not available. Please create a bucket named "chat-images" in Supabase Dashboard.' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const { base64, mimeType } = images[i];
      
      // MIME type에서 확장자 추출
      const ext = mimeType.split('/')[1]?.replace('+xml', '') || 'png';
      
      // 파일 경로 생성
      const timestamp = Date.now();
      const filePath = `${sessionId}/${messageIndex}_${i}_${timestamp}.${ext}`;
      
      console.log(`[Upload API] Uploading image ${i + 1}/${images.length}: ${filePath}`);
      
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
        console.error(`[Upload API] Error uploading image ${i}:`, error.message);
        errors.push(`Image ${i}: ${error.message}`);
        continue;
      }
      
      console.log(`[Upload API] Image ${i + 1} uploaded successfully:`, data.path);
      
      // 공개 URL 가져오기
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);
      
      uploadedUrls.push(urlData.publicUrl);
      console.log(`[Upload API] Public URL: ${urlData.publicUrl}`);
    }

    if (uploadedUrls.length === 0 && errors.length > 0) {
      return new Response(JSON.stringify({ 
        error: 'Failed to upload images', 
        details: errors 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Upload API] Successfully uploaded ${uploadedUrls.length}/${images.length} images`);

    return new Response(JSON.stringify({ urls: uploadedUrls, errors: errors.length > 0 ? errors : undefined }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Upload API] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


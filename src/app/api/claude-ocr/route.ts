import { NextRequest, NextResponse } from 'next/server';

// Get API key from environment variables
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || 
                      process.env.NEXT_PUBLIC_CLAUDE_API_KEY || 
                      'your-claude-api-key-here';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export async function POST(request: NextRequest) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers });
  }

  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image data provided' }, { 
        status: 400,
        headers 
      });
    }

    // Claude OCR API call
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'กรุณาอ่านข้อความทั้งหมดที่ปรากฏในรูปภาพนี้และถอดข้อความออกมาให้ครบถ้วนทุกบรรทัด โดยไม่ต้องสรุปหรือเลือกเฉพาะส่วนใดส่วนหนึ่ง (Please extract and transcribe all text from this image exactly as it appears, without summarizing or omitting any part. Return the full raw text.)'
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Claude API Error:', response.status, errorData);
      return NextResponse.json({ 
        error: `Claude API error: ${response.status}`,
        details: errorData
      }, { 
        status: response.status,
        headers 
      });
    }

    const data = await response.json();
    const extractedText = data.content[0].text;
    console.log('OCR completed successfully');

    // Return the extracted text
    return NextResponse.json({ text: extractedText }, { headers });
  } catch (error) {
    console.error('OCR API Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500,
      headers 
    });
  }
} 
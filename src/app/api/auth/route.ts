import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserRole } from '@/dbService';


interface UserResponse {
  email: string | null;
  displayName: string | null;
  role: string;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

const roleCache = new Map<string, string>();
const CACHE_TTL = 5 * 60 * 1000; 


const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};


const cacheControl = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};


const createResponse = <T = unknown>(
  data: T, 
  status: number = 200, 
  headers: Record<string, string> = {}
) => {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cacheControl,
      ...securityHeaders,
      ...headers,
    },
  });
};

export async function GET(request: NextRequest) {
  try {
 
    const apiKey = request.headers.get('x-api-key');
    if (process.env.REQUIRE_API_KEY && apiKey !== process.env.API_KEY) {
      return createResponse(
        { error: 'Unauthorized' } as ErrorResponse,
        401
      );
    }

    const user = await getCurrentUser();
    
    if (!user || !user.uid) {
      return createResponse({ user: null });
    }

    try {
      // Check cache first
      const cacheKey = `user:${user.uid}`;
      const cachedRole = roleCache.get(cacheKey);
      
      let role: string;
      
      if (cachedRole) {
        role = cachedRole;
      } else {
        // Get fresh role from database
        role = await getUserRole(user.uid) || 'operator';
        
        // Cache the role
        roleCache.set(cacheKey, role);
        
        // Set TTL for cache
        setTimeout(() => {
          roleCache.delete(cacheKey);
        }, CACHE_TTL);
      }

      const userResponse: UserResponse = {
        email: user.email || null,
        displayName: user.displayName || null,
        role,
      };

      return createResponse({ user: userResponse });

    } catch (dbError) {
      console.error('Database error during auth check:', dbError);
      return createResponse(
        { 
          error: 'Failed to fetch user data',
          details: process.env.NODE_ENV === 'development' 
            ? (dbError as Error).message 
            : undefined 
        } as ErrorResponse,
        500
      );
    }
  } catch (error) {
    console.error('Unexpected error in auth endpoint:', error);
    return createResponse(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' 
          ? (error as Error).message 
          : undefined 
      } as ErrorResponse,
      500
    );
  }
}

// Handle unsupported HTTP methods
export function POST() {
  return createResponse(
    { error: 'Method not allowed' } as ErrorResponse,
    405
  );
}

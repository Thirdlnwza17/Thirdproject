import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserRole } from '@/dbService';

export async function GET(request: NextRequest) {
  try {
  
    const user = await getCurrentUser();
    
    if (!user) {
   
      return NextResponse.json({
        user: null
      });
    }

    // Get the user's role
    const role = await getUserRole(user.uid);

    return NextResponse.json({
      user: {
        email: user.email,
        displayName: user.displayName,
        role: role || 'operator'
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

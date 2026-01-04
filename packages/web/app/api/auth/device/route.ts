import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { nanoid } from 'nanoid';

// Generate a device code for TUI authentication
export async function POST(request: NextRequest) {
  try {
    // Generate unique codes
    const deviceCode = nanoid(32);
    const userCode = nanoid(8).toUpperCase();

    // Set expiration to 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Store device code in database
    await db.deviceCode.create({
      data: {
        code: deviceCode,
        userCode,
        expiresAt,
      },
    });

    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/device?code=${userCode}`;

    return NextResponse.json({
      deviceCode,
      userCode,
      verificationUrl,
      expiresIn: 300, // 5 minutes
      interval: 5, // poll interval in seconds
    });
  } catch (error) {
    console.error('Device auth error:', error);
    return NextResponse.json(
      { error: 'Failed to create device code' },
      { status: 500 }
    );
  }
}

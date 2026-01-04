import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteParams {
  params: Promise<{ code: string }>;
}

// Poll device code status
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { code } = await params;

    // Find device code by device code or user code
    const deviceCode = await db.deviceCode.findFirst({
      where: {
        OR: [{ code }, { userCode: code }],
      },
    });

    if (!deviceCode) {
      return NextResponse.json(
        { status: 'not_found', error: 'Device code not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (deviceCode.expiresAt < new Date()) {
      return NextResponse.json(
        { status: 'expired', error: 'Device code expired' },
        { status: 410 }
      );
    }

    // Check if authenticated
    if (deviceCode.token && deviceCode.userId) {
      // Get user info
      const user = await db.user.findUnique({
        where: { id: deviceCode.userId },
      });

      if (user) {
        // Clean up the device code
        await db.deviceCode.delete({
          where: { id: deviceCode.id },
        });

        return NextResponse.json({
          status: 'complete',
          token: deviceCode.token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.image,
          },
        });
      }
    }

    // Still waiting for user to authenticate
    return NextResponse.json({
      status: 'pending',
    });
  } catch (error) {
    console.error('Device poll error:', error);
    return NextResponse.json(
      { error: 'Failed to check device code' },
      { status: 500 }
    );
  }
}

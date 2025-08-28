import { startMassUpdateJob } from '@/app/invoices/actions';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.filters || !body.field || !body.value) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 },
      );
    }

    const result = await startMassUpdateJob({
      filters: body.filters,
      field: body.field,
      value: body.value,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to start mass update job:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to start job' },
      { status: 500 },
    );
  }
}

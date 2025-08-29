import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { applyInvoices } from '@/trigger/apply-invoices';
import { cookies } from 'next/headers';

const schema = z.object({
  file: z.instanceof(File),
  mode: z.enum(['delete', 'void']).optional().default('delete'),
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.TRIGGER_API_KEY) {
      return NextResponse.json(
        { error: 'TRIGGER_API_KEY is not set in the server environment' },
        { status: 500 },
      );
    }
    const form = await req.formData();
    const file = form.get('file') as File;
    const removeMode = String(form.get('mode') ?? 'delete') as
      | 'delete'
      | 'void';
    const validationResult = schema.safeParse({ file, removeMode });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.message },
        { status: 400 },
      );
    }

    // Encode the file to base64 and create a Job row
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const base64 = buf.toString('base64');

    const cookieStore = await cookies();
    const accessTokenCookie = cookieStore.get('vcrm_access_token')?.value;
    const refreshTokenCookie = cookieStore.get('vcrm_refresh_token')?.value;

    const job = await prisma.job.create({
      data: {
        type: 'APPLY_INVOICES',
        status: 'PENDING',
        progress: 0,
        parameters: {
          mode: removeMode,
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            base64,
          },
        },
        logs: ['Job enqueued'],
      },
      select: { id: true },
    });

    // Trigger the v3 task directly
    try {
      await applyInvoices.trigger({
        jobId: job.id,
        token: {
          accessToken: accessTokenCookie,
          refreshToken: refreshTokenCookie,
        },
      });
    } catch (e) {
      // If enqueue fails, mark job failed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: e instanceof Error ? e.message : 'Failed to enqueue job',
          logs: {
            push: [
              'Failed to enqueue job',
              e instanceof Error ? e.message : JSON.stringify(e),
            ],
          },
        },
      });
      console.error('Trigger.dev enqueue error', e);
      return NextResponse.json(
        {
          error: 'Failed to enqueue background job',
          details: e instanceof Error ? e.message : String(e),
          jobId: job.id,
        },
        { status: 500 },
      );
    }

    // Return 202 Accepted with job info
    return NextResponse.json(
      {
        message: 'Task started',
        jobId: job.id,
        statusUrl: `/api/jobs/${job.id}/progress`,
      },
      { status: 202 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

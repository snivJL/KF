import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface JobProgress {
  jobId: string;
  progress: number;
  processedItems: number;
  totalItems: number;
  failedItems: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentBatch?: number;
  totalBatches?: number;
  estimatedTimeRemaining?: number;
  itemsPerSecond?: number;
  logs: string[];
  error?: string;
  result?: any;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: string;
  type: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const jobId = params.id;

    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Job ID is required',
        },
        { status: 400 },
      );
    }

    // Fetch job from database
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        totalItems: true,
        processedItems: true,
        failedItems: true,
        parameters: true,
        result: true,
        error: true,
        logs: true,
        userId: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: 'Job not found',
        },
        { status: 404 },
      );
    }

    // Calculate additional metrics
    let estimatedTimeRemaining: number | undefined;
    let itemsPerSecond: number | undefined;
    let currentBatch: number | undefined;
    let totalBatches: number | undefined;
    let duration: string | undefined;

    const now = new Date();

    // Calculate duration if job has started
    if (job.startedAt) {
      const startTime = new Date(job.startedAt);
      const elapsedMs = now.getTime() - startTime.getTime();

      if (job.completedAt) {
        // Job is complete, show total duration
        const completedTime = new Date(job.completedAt);
        const totalMs = completedTime.getTime() - startTime.getTime();
        duration = formatDuration(totalMs);
      } else {
        // Job is still running, show current duration
        duration = formatDuration(elapsedMs);
      }

      // Calculate items per second (only if job is running and has processed items)
      if (
        job.status === 'RUNNING' &&
        job.processedItems > 0 &&
        elapsedMs > 1000
      ) {
        itemsPerSecond = Math.round(job.processedItems / (elapsedMs / 1000));
      }

      // Calculate estimated time remaining
      if (job.status === 'RUNNING' && job.progress > 0 && job.progress < 100) {
        const progressRate = job.progress / elapsedMs; // progress per millisecond
        const remainingProgress = 100 - job.progress;
        estimatedTimeRemaining = Math.round(remainingProgress / progressRate);
      }
    }

    // Calculate batch information (assuming batch size of 100 for items)
    const BATCH_SIZE = 100;
    if (job.totalItems > 0) {
      totalBatches = Math.ceil(job.totalItems / BATCH_SIZE);
      if (job.processedItems > 0) {
        currentBatch = Math.ceil(job.processedItems / BATCH_SIZE);
      }
    }

    // Format the response
    const progress: JobProgress = {
      jobId: job.id,
      type: job.type,
      progress: job.progress,
      processedItems: job.processedItems,
      totalItems: job.totalItems,
      failedItems: job.failedItems,
      status: job.status as JobProgress['status'],
      currentBatch,
      totalBatches,
      estimatedTimeRemaining,
      itemsPerSecond,
      logs: job.logs || [],
      error: job.error || undefined,
      result: job.result || undefined,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      duration,
    };

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error('Failed to fetch job progress:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while fetching job progress',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Optional: Add authentication check
 * Uncomment and modify based on your auth system
 */
/*
async function checkJobAccess(jobId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { userId: true }
  });
  
  return job?.userId === userId;
}
*/

/**
 * Optional: GET with query parameters for filtering/formatting
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * Optional: Support for real-time updates via Server-Sent Events
 * Uncomment if you want to implement SSE for real-time updates
 */
/*
export async function STREAM(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id;
  
  const stream = new ReadableStream({
    start(controller) {
      const sendUpdate = async () => {
        try {
          const job = await prisma.job.findUnique({
            where: { id: jobId }
          });
          
          if (job) {
            const data = JSON.stringify({
              progress: job.progress,
              status: job.status,
              processedItems: job.processedItems,
              totalItems: job.totalItems
            });
            
            controller.enqueue(`data: ${data}\n\n`);
            
            if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
              controller.close();
              return;
            }
          }
        } catch (error) {
          console.error('SSE error:', error);
          controller.close();
        }
      };
      
      // Send initial update
      sendUpdate();
      
      // Send updates every 2 seconds
      const interval = setInterval(sendUpdate, 2000);
      
      // Cleanup
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
*/

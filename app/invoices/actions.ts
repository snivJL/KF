'use server';

import { getValidAccessTokenFromServer } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import type { JobProgress } from '@/types/jobs';
import type { Prisma } from '@prisma/client';
import axios from 'axios';
import { revalidatePath } from 'next/cache';

// Types
interface MassUpdateParams {
  filters: InvoiceFilters;
  field: string;
  value: string;
}

interface InvoiceFilters {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  employeeCode?: string;
  accountCode?: string;
  productCode?: string;
}

interface MassUpdateJobParams {
  filters: InvoiceFilters;
  field: string;
  value: string;
  userId?: string;
}

interface ZohoUpdateData {
  invoiceZohoId: string;
  items: string[];
}

interface InvoiceWithItems {
  id: string;
  zohoId: string;
  items: {
    id: string;
    zohoRowId: string;
  }[];
}

interface ActionResult {
  success: boolean;
  message: string;
  details?: {
    itemsUpdated?: number;
    invoicesUpdated?: number;
    errorType?: 'validation' | 'zoho' | 'database' | 'network' | 'unknown';
  };
}

/**
 * Start a mass update job (for large datasets)
 */
export async function startMassUpdateJob(
  params: MassUpdateJobParams,
): Promise<{ success: boolean; jobId?: string; message: string }> {
  try {
    if (!params.value?.trim()) {
      return { success: false, message: 'Value is required' };
    }

    const invoices = await findInvoicesByFilters(params.filters);
    const totalItems = extractItemIds(invoices).length;

    if (totalItems === 0) {
      return { success: false, message: 'No items found to update' };
    }

    if (totalItems <= 1) {
      const result = await processSmallUpdate(params, invoices);
      return {
        success: result.success,
        message: result.message,
      };
    }

    const job = await prisma.job.create({
      data: {
        type: 'MASS_UPDATE_INVOICES',
        status: 'PENDING',
        totalItems,
        parameters: params as unknown as Prisma.InputJsonValue,
        userId: params.userId,
        logs: [`Job created for ${totalItems} items`],
      },
    });

    processLargeUpdateJob(job.id).catch((error) => {
      console.error('Background job failed:', error);
    });

    return {
      success: true,
      jobId: job.id,
      message: `Job started for ${totalItems} items. You can monitor progress using the job ID.`,
    };
  } catch (error) {
    console.error('Failed to start mass update job:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to start job',
    };
  }
}

/**
 * Process small updates immediately
 */
async function processSmallUpdate(
  params: MassUpdateJobParams,
  invoices: InvoiceWithItems[],
) {
  const itemIds = extractItemIds(invoices);

  if (params.field === 'employeeCode') {
    return await updateWithTransactionStrategy(invoices, params.value, itemIds);
  }

  return {
    success: false,
    message: `Update field "${params.field}" is not supported`,
  };
}

/**
 * Background job processor for large updates
 */
async function processLargeUpdateJob(jobId: string): Promise<void> {
  const BATCH_SIZE = 100; // Items per batch
  const ZOHO_BATCH_SIZE = 10; // Zoho invoices per batch

  try {
    await updateJobStatus(jobId, 'RUNNING', 'Job started processing');

    // Get job data
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');

    const params = job.parameters as unknown as MassUpdateJobParams;

    // Get employee
    const employee = await findEmployeeByCode(params.value);

    // Get all invoices and items
    const invoices = await findInvoicesByFilters(params.filters);
    const itemIds = extractItemIds(invoices);
    const zohoUpdates = prepareZohoUpdates(invoices);

    await addJobLog(
      jobId,
      `Found ${itemIds.length} items across ${invoices.length} invoices`,
    );

    // Calculate batches
    const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE);
    const zohoTotalBatches = Math.ceil(zohoUpdates.length / ZOHO_BATCH_SIZE);

    let processedItems = 0;
    let failedItems = 0;
    const startTime = Date.now();

    // Phase 1: Update Database in batches
    await addJobLog(jobId, 'Phase 1: Starting database updates');

    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batchItemIds = itemIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      try {
        // Update database batch
        const dbResult = await prisma.invoiceItem.updateMany({
          where: { id: { in: batchItemIds } },
          data: {
            employeeId: employee.id,
            employeeZohoId: employee.id,
          },
        });

        processedItems += dbResult.count;
        const progress = Math.round(
          (processedItems / (itemIds.length * 2)) * 100,
        ); // 50% for DB, 50% for Zoho

        await updateJobProgress(jobId, progress, processedItems, 0);
        await addJobLog(
          jobId,
          `Database batch ${batchNumber}/${totalBatches}: Updated ${dbResult.count} items`,
        );

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        failedItems += batchItemIds.length;
        await addJobLog(
          jobId,
          `Database batch ${batchNumber} failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    // Phase 2: Update Zoho in batches
    await addJobLog(jobId, 'Phase 2: Starting Zoho updates');

    let processedInvoices = 0;

    for (let i = 0; i < zohoUpdates.length; i += ZOHO_BATCH_SIZE) {
      const batchUpdates = zohoUpdates.slice(i, i + ZOHO_BATCH_SIZE);
      const batchNumber = Math.floor(i / ZOHO_BATCH_SIZE) + 1;

      try {
        await updateZohoBatch(batchUpdates, employee.id);
        processedInvoices += batchUpdates.length;

        // Update progress (50% for DB done, now working on Zoho 50%)
        const zohoProgress = (processedInvoices / zohoUpdates.length) * 50;
        const totalProgress = Math.round(50 + zohoProgress);

        await updateJobProgress(
          jobId,
          totalProgress,
          processedItems,
          failedItems,
        );
        await addJobLog(
          jobId,
          `Zoho batch ${batchNumber}/${zohoTotalBatches}: Updated ${batchUpdates.length} invoices`,
        );

        // Delay between Zoho batches to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        await addJobLog(
          jobId,
          `Zoho batch ${batchNumber} failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    // Calculate final stats
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    const result = {
      itemsUpdated: processedItems,
      invoicesUpdated: processedInvoices,
      failedItems,
      duration: `${duration.toFixed(1)}s`,
      itemsPerSecond: Math.round(processedItems / duration),
    };

    // Complete the job
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        processedItems,
        failedItems,
        result,
        completedAt: new Date(),
        logs: { push: `Job completed successfully in ${result.duration}` },
      },
    });

    // Revalidate the invoices page
    revalidatePath('/invoices');
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        logs: {
          push: `Job failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        },
      },
    });
  }
}

/**
 * Get job status and progress
 */
export async function getJobProgress(
  jobId: string,
): Promise<JobProgress | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) return null;

  // Calculate estimated time remaining
  let estimatedTimeRemaining: number | undefined;
  if (job.status === 'RUNNING' && job.startedAt && job.progress > 0) {
    const elapsed = Date.now() - job.startedAt.getTime();
    const rate = job.progress / elapsed;
    estimatedTimeRemaining = Math.round((100 - job.progress) / rate);
  }

  return {
    jobId: job.id,
    progress: job.progress,
    processedItems: job.processedItems,
    totalItems: job.totalItems,
    status: job.status,
    estimatedTimeRemaining,
    logs: job.logs,
  };
}

/**
 * Get all jobs for a user (with pagination)
 */
export async function getUserJobs(userId?: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        totalItems: true,
        processedItems: true,
        failedItems: true,
        createdAt: true,
        completedAt: true,
        error: true,
      },
    }),
    prisma.job.count({
      where: userId ? { userId } : undefined,
    }),
  ]);

  return {
    jobs,
    total,
    pages: Math.ceil(total / limit),
    currentPage: page,
  };
}

/**
 * Cancel a pending job
 */
export async function cancelJob(
  jobId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) {
      return { success: false, message: 'Job not found' };
    }

    if (job.status !== 'PENDING') {
      return {
        success: false,
        message: `Cannot cancel job with status: ${job.status}`,
      };
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        logs: { push: 'Job cancelled by user' },
      },
    });

    return { success: true, message: 'Job cancelled successfully' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to cancel job',
    };
  }
}

// ===== HELPER FUNCTIONS =====

async function updateJobStatus(jobId: string, status: string, log?: string) {
  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'RUNNING') {
    updateData.startedAt = new Date();
  }

  if (log) {
    updateData.logs = { push: log };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: updateData,
  });
}

async function updateJobProgress(
  jobId: string,
  progress: number,
  processedItems: number,
  failedItems: number,
) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress: Math.min(100, Math.max(0, progress)),
      processedItems,
      failedItems,
      updatedAt: new Date(),
    },
  });
}

async function addJobLog(jobId: string, message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      logs: { push: logMessage },
      updatedAt: new Date(),
    },
  });

  console.log(`Job ${jobId}: ${message}`);
}

/**
 * Mass update invoices with improved transaction handling
 * Strategy: Update DB first, then Zoho, with rollback capability
 */
export async function massUpdateInvoices(
  params: MassUpdateParams,
): Promise<ActionResult> {
  try {
    console.log('Starting mass update with params:', params);

    // Validate input
    if (!params.value?.trim()) {
      return {
        success: false,
        message: 'Value is required',
        details: { errorType: 'validation' },
      };
    }

    // Find matching invoices
    const invoices = await findInvoicesByFilters(params.filters);

    if (invoices.length === 0) {
      return {
        success: false,
        message: 'No invoices match the current filters',
        details: { errorType: 'validation' },
      };
    }

    const itemIds = extractItemIds(invoices);

    if (itemIds.length === 0) {
      return {
        success: false,
        message: 'No items found to update in the matching invoices',
        details: { errorType: 'validation' },
      };
    }

    // Perform the update based on strategy
    if (params.field === 'employeeCode') {
      // Choose strategy based on item count
      if (itemIds.length > 100) {
        return await updateWithBatchStrategy(invoices, params.value, itemIds);
      } else {
        return await updateWithTransactionStrategy(
          invoices,
          params.value,
          itemIds,
        );
      }
    } else {
      return {
        success: false,
        message: `Update field "${params.field}" is not supported`,
        details: { errorType: 'validation' },
      };
    }
  } catch (error) {
    console.error('Mass update failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      message: errorMessage,
      details: { errorType: categorizeError(errorMessage) },
    };
  }
}

/**
 * Update all Zoho invoices, fail fast if any update fails
 */
async function updateAllZohoInvoices(
  updates: ZohoUpdateData[],
  employeeZohoId: string,
): Promise<void> {
  const token = await getValidAccessTokenFromServer();
  if (!token) throw new Error('Failed to retrieve Zoho access token');
  const failures: Array<{ invoiceId: string; error: string }> = [];

  for (const update of updates) {
    try {
      await updateSingleZohoInvoice(update, employeeZohoId, token);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      failures.push({
        invoiceId: update.invoiceZohoId,
        error: errorMessage,
      });
    }
  }

  // If any Zoho updates failed, throw error to rollback transaction
  if (failures.length > 0) {
    const errorDetails = failures
      .map((f) => `${f.invoiceId}: ${f.error}`)
      .join('; ');

    throw new Error(
      `Failed to update ${failures.length}/${updates.length} invoices in Zoho: ${errorDetails}`,
    );
  }
}

/**
 * Strategy 1: Traditional transaction (for smaller updates)
 * Keep Zoho calls outside transaction to prevent timeout
 **/
async function updateWithTransactionStrategy(
  invoices: InvoiceWithItems[],
  employeeCode: string,
  itemIds: string[],
): Promise<ActionResult> {
  const employee = await findEmployeeByCode(employeeCode);
  const zohoUpdates = prepareZohoUpdates(invoices);

  // Store original employee assignments for rollback
  const originalAssignments = await getOriginalAssignments(itemIds);

  try {
    // Step 1: Update database only (fast transaction)
    await prisma.$transaction(
      async (tx) => {
        const dbResult = await tx.invoiceItem.updateMany({
          where: { id: { in: itemIds } },
          data: {
            employeeId: employee.id,
            employeeZohoId: employee.id,
          },
        });
        console.log(`✓ Database updated: ${dbResult.count} items`);
      },
      { timeout: 10000 }, // Shorter timeout for DB-only transaction
    );

    // Step 2: Update Zoho (outside transaction)
    try {
      await updateAllZohoInvoices(zohoUpdates, employee.id);
      console.log(`✓ Zoho updated: ${zohoUpdates.length} invoices`);

      revalidatePath('/invoices');
      return {
        success: true,
        message: `Successfully updated ${itemIds.length} items across ${invoices.length} invoices`,
        details: {
          itemsUpdated: itemIds.length,
          invoicesUpdated: invoices.length,
        },
      };
    } catch (zohoError) {
      // Rollback database changes if Zoho fails
      console.error(
        'Zoho update failed, rolling back database changes:',
        zohoError,
      );
      await rollbackDatabaseChanges(originalAssignments);

      const zohoMessage =
        zohoError instanceof Error ? zohoError.message : 'Unknown Zoho error';
      throw new Error(
        `Zoho sync failed: ${zohoMessage}. Database changes have been rolled back.`,
      );
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Strategy 2: Batch processing (for large updates)
 * Process in smaller chunks to avoid timeouts
 */
async function updateWithBatchStrategy(
  invoices: InvoiceWithItems[],
  employeeCode: string,
  itemIds: string[],
): Promise<ActionResult> {
  const employee = await findEmployeeByCode(employeeCode);
  const batchSize = 50; // Adjust based on your needs
  const zohoUpdates = prepareZohoUpdates(invoices);

  let totalItemsUpdated = 0;
  let totalInvoicesUpdated = 0;

  try {
    // Process items in batches
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batchItemIds = itemIds.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}: ${
          batchItemIds.length
        } items`,
      );

      // Update database batch
      const dbResult = await prisma.invoiceItem.updateMany({
        where: { id: { in: batchItemIds } },
        data: {
          employeeId: employee.id,
          employeeZohoId: employee.id,
        },
      });

      totalItemsUpdated += dbResult.count;
      console.log(`✓ Database batch updated: ${dbResult.count} items`);

      // Add small delay between batches to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Process Zoho updates in batches
    for (let i = 0; i < zohoUpdates.length; i += 10) {
      // Smaller batches for Zoho
      const batchUpdates = zohoUpdates.slice(i, i + 10);
      console.log(
        `Processing Zoho batch ${Math.floor(i / 10) + 1}: ${
          batchUpdates.length
        } invoices`,
      );

      await updateZohoBatch(batchUpdates, employee.id);
      totalInvoicesUpdated += batchUpdates.length;

      // Delay between Zoho batches to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    revalidatePath('/invoices');
    return {
      success: true,
      message: `Successfully updated ${totalItemsUpdated} items across ${totalInvoicesUpdated} invoices using batch processing`,
      details: {
        itemsUpdated: totalItemsUpdated,
        invoicesUpdated: totalInvoicesUpdated,
      },
    };
  } catch (error) {
    console.error('Batch update failed:', error);
    // Note: Partial rollback would be complex here, consider logging for manual review
    throw new Error(
      `Batch update failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }. Some items may have been partially updated.`,
    );
  }
}

/**
 * Get original employee assignments for rollback purposes
 */
async function getOriginalAssignments(itemIds: string[]) {
  return await prisma.invoiceItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      employeeId: true,
      employeeZohoId: true,
    },
  });
}

/**
 * Rollback database changes to original state
 */
async function rollbackDatabaseChanges(originalAssignments: any[]) {
  try {
    await prisma.$transaction(async (tx) => {
      for (const assignment of originalAssignments) {
        await tx.invoiceItem.update({
          where: { id: assignment.id },
          data: {
            employeeId: assignment.employeeId,
            employeeZohoId: assignment.employeeZohoId,
          },
        });
      }
    });
    console.log(
      `✓ Rolled back ${originalAssignments.length} items to original state`,
    );
  } catch (rollbackError) {
    console.error('Critical: Rollback failed!', rollbackError);
    // This is a critical error - you might want to alert administrators
  }
}

/**
 * Update Zoho invoices in batch with improved error handling
 */
async function updateZohoBatch(
  updates: ZohoUpdateData[],
  employeeZohoId: string,
): Promise<void> {
  const token = await getValidAccessTokenFromServer();
  if (!token) throw new Error('Failed to retrieve Zoho access token');

  // Process each invoice in the batch
  const promises = updates.map((update) =>
    updateSingleZohoInvoice(update, employeeZohoId, token).catch((error) => ({
      error,
      invoiceId: update.invoiceZohoId,
    })),
  );

  const results = await Promise.allSettled(promises);

  const failures = results
    .map((result, index) => ({ result, update: updates[index] }))
    .filter(
      ({ result }) =>
        result.status === 'rejected' ||
        (result.status === 'fulfilled' && result.value?.error),
    )
    .map(({ result, update }) => ({
      invoiceId: update.invoiceZohoId,
      error:
        result.status === 'rejected'
          ? result.reason?.message || 'Unknown error'
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result.value as any)?.error?.message || 'Unknown error',
    }));

  if (failures.length > 0) {
    const errorDetails = failures
      .map((f) => `${f.invoiceId}: ${f.error}`)
      .join('; ');
    throw new Error(
      `Failed to update ${failures.length}/${updates.length} invoices in Zoho: ${errorDetails}`,
    );
  }
}

/**
 * Update a single invoice in Zoho with better error handling
 */
async function updateSingleZohoInvoice(
  update: ZohoUpdateData,
  employeeZohoId: string,
  token: string,
  retries = 2,
): Promise<void> {
  const payload = {
    data: [
      {
        id: update.invoiceZohoId,
        Invoiced_Items: update.items.map((itemId) => ({
          id: itemId,
          Assigned_Employee: { id: employeeZohoId },
        })),
      },
    ],
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.put(
        `${process.env.BASE_URL}/crm/v6/Invoices`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          validateStatus: () => true,
          timeout: 15000, // Increased timeout
        },
      );

      if (response.status >= 200 && response.status < 300) {
        console.log(
          `✓ Zoho invoice ${update.invoiceZohoId} updated successfully`,
        );
        return;
      } else if (response.status === 429 && attempt < retries) {
        // Rate limit: wait and retry
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      } else if (response.status === 401) {
        throw new Error(`Zoho authentication failed - token may be expired`);
      } else if (response.status === 429) {
        throw new Error(`Zoho rate limit exceeded - please try again later`);
      } else if (response.status >= 500 && attempt < retries) {
        // Server error: retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      } else {
        const errorDetail =
          response.data?.message || JSON.stringify(response.data);
        throw new Error(`Zoho API error (${response.status}): ${errorDetail}`);
      }
    } catch (error) {
      if (attempt === retries) throw error;

      // Network errors: retry
      if (
        axios.isAxiosError(error) &&
        (!error.response || error.code === 'ECONNRESET')
      ) {
        console.log(`Network error, retrying... (attempt ${attempt + 1})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      throw error;
    }
  }
}

async function findInvoicesByFilters(
  filters: InvoiceFilters,
): Promise<InvoiceWithItems[]> {
  const whereClause = buildWhereClause(filters);
  const itemConditions = buildItemConditions(filters);

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    select: {
      id: true,
      zohoId: true,
      items: {
        where: itemConditions.length > 0 ? { AND: itemConditions } : undefined,
        select: {
          id: true,
          zohoRowId: true,
        },
      },
    },
  });

  console.log(`Found ${invoices.length} invoices matching filters`);
  return invoices;
}

function buildWhereClause(filters: InvoiceFilters): Prisma.InvoiceWhereInput {
  const {
    q = '',
    dateFrom = '',
    dateTo = '',
    accountCode = '',
    employeeCode = '',
    productCode = '',
  } = filters;

  const where: Prisma.InvoiceWhereInput = {};

  if (q) {
    where.OR = [
      { subject: { contains: q, mode: 'insensitive' } },
      { zohoId: { contains: q } },
      { accountId: { contains: q } },
    ];
  }

  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }

  if (accountCode) {
    where.account = {
      code: { contains: accountCode, mode: 'insensitive' },
    };
  }

  const itemConditions = buildItemConditions({ employeeCode, productCode });
  if (itemConditions.length > 0) {
    where.items = { some: { AND: itemConditions } };
  }

  return where;
}

function buildItemConditions(
  filters: Pick<InvoiceFilters, 'employeeCode' | 'productCode'>,
): Prisma.InvoiceItemWhereInput[] {
  const { employeeCode = '', productCode = '' } = filters;
  const conditions: Prisma.InvoiceItemWhereInput[] = [];

  if (employeeCode) {
    conditions.push({
      employee: {
        code: { contains: employeeCode, mode: 'insensitive' },
      },
    });
  }

  if (productCode) {
    conditions.push({
      product: {
        productCode: { contains: productCode, mode: 'insensitive' },
      },
    });
  }

  return conditions;
}

async function findEmployeeByCode(code: string) {
  const employee = await prisma.employee.findUnique({
    where: { code },
    select: { id: true },
  });

  if (!employee) {
    throw new Error(`Employee with code "${code}" not found`);
  }

  return employee;
}

function extractItemIds(invoices: InvoiceWithItems[]): string[] {
  return invoices.flatMap((invoice) => invoice.items.map((item) => item.id));
}

function prepareZohoUpdates(invoices: InvoiceWithItems[]): ZohoUpdateData[] {
  return invoices
    .filter((invoice) => invoice.items.length > 0)
    .map((invoice) => ({
      invoiceZohoId: invoice.zohoId,
      items: invoice.items.map((item) => item.zohoRowId),
    }));
}

/**
 * Categorize errors for better frontend handling
 */
function categorizeError(errorMessage: string) {
  if (
    errorMessage.includes('Employee with code') &&
    errorMessage.includes('not found')
  ) {
    return 'validation';
  } else if (
    errorMessage.includes('Zoho') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('rate limit')
  ) {
    return 'zoho';
  } else if (errorMessage.includes('timeout')) {
    return 'network';
  } else if (
    errorMessage.includes('database') ||
    errorMessage.includes('transaction')
  ) {
    return 'database';
  } else {
    return 'unknown';
  }
}

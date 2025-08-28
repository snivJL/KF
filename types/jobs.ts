export interface JobData {
  id: string;
  type: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  parameters: any;
  result?: any;
  error?: string;
  logs: string[];
  userId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface JobProgress {
  jobId: string;
  progress: number;
  processedItems: number;
  totalItems: number;
  status: string;
  currentBatch?: number;
  totalBatches?: number;
  estimatedTimeRemaining?: number;
  logs: string[];
}
